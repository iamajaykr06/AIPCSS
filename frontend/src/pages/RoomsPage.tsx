import React, { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, DoorOpen, Users, Upload } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { roomService, departmentService, programService } from '@/services/resources.service'
import { useToast } from '@/context/ToastContext'
import { useTable } from '@/hooks/useTable'
import { DataTable } from '@/components/common/DataTable'
import { Modal, ConfirmModal } from '@/components/ui/Modal'
import { PageLoader, ErrorState } from '@/components/ui/Loading'
import { BulkImportModal } from '@/components/common/BulkImportModal'
import { getErrorMessage } from '@/lib/utils'
import type { Room, Department, Program } from '@/types'

const schema = z.object({
    name: z.string().min(1, 'Name is required'),
    capacity: z.coerce.number().min(1, 'Capacity must be at least 1'),
    room_type: z.enum(['Classroom', 'Lecture Hall', 'Lab', 'Seminar Room', 'Auditorium']),
    department_id: z.union([z.string(), z.number(), z.null()]).optional().transform((val) => {
        if (val === '' || val === null || val === undefined) return null;
        return typeof val === 'string' ? Number(val) : val;
    }),
    program_id: z.union([z.string(), z.number(), z.null()]).optional().transform((val) => {
        if (val === '' || val === null || val === undefined) return null;
        return typeof val === 'string' ? Number(val) : val;
    }),
}).superRefine((data, ctx) => {
    if (data.room_type === 'Lab' && !data.program_id) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['program_id'],
            message: 'Program is required for Lab rooms',
        })
    }
})
type FormData = z.infer<typeof schema>

export function RoomsPage() {
    const [rooms, setRooms] = useState<Room[]>([])
    const [departments, setDepartments] = useState<Department[]>([])
    const [programs, setPrograms] = useState<Program[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [modalOpen, setModalOpen] = useState(false)
    const [editItem, setEditItem] = useState<Room | null>(null)
    const [deleteItem, setDeleteItem] = useState<Room | null>(null)
    const [saving, setSaving] = useState(false)
    const [importModalOpen, setImportModalOpen] = useState(false)
    const { toast } = useToast()

    const table = useTable({ data: rooms as any, searchFields: ['name', 'room_type'], defaultSortKey: 'name' })
    const { register, handleSubmit, reset, formState: { errors }, setValue, watch } = useForm<FormData>({
        resolver: zodResolver(schema) as any,
        defaultValues: { room_type: 'Classroom', capacity: 40, department_id: null, program_id: null },
    })
    const selectedRoomType = watch('room_type')
    const selectedDepartmentId = watch('department_id')

    async function load() {
        try {
            setError(null)
            const r = await roomService.list(undefined, 1, 200)
            setRooms(r.data)
        } catch (err) {
            setError(getErrorMessage(err))
        } finally {
            setLoading(false)
        }
    }

    async function loadDepartments() {
        try {
            const d = await departmentService.list(1, 100)
            setDepartments(d.data)
        } catch (err) {
            console.error('Failed to load departments:', err)
        }
    }
    async function loadPrograms() {
        try {
            const p = await programService.list(undefined, 1, 500)
            setPrograms(p.data)
        } catch (err) {
            console.error('Failed to load programs:', err)
        }
    }
    useEffect(() => { 
        load()
        loadDepartments()
        loadPrograms()
    }, [])

    const openCreate = () => {
        setEditItem(null)
        reset({ name: '', capacity: 40, room_type: 'Classroom', department_id: null, program_id: null })
        setModalOpen(true)
    }

    const openEdit = (r: Room) => {
        setEditItem(r)
        setValue('name', r.name)
        setValue('capacity', r.capacity)
        setValue('room_type', r.room_type)
        setValue('department_id', r.department_id || null)
        setValue('program_id', r.program_id || null)
        setModalOpen(true)
    }

    const onSubmit = (data: FormData) => {
        handleSave(data)
    }

    const handleSave = async (data: FormData) => {
        setSaving(true)
        try {
            if (editItem) {
                await roomService.update(editItem.id, data)
                toast('success', 'Room updated')
            } else {
                await roomService.create(data)
                toast('success', 'Room created')
            }
            setModalOpen(false)
            load()
        } catch (err) {
            toast('error', 'Failed', getErrorMessage(err))
        } finally {
            setSaving(false)
        }
    }

    const handleDelete = async () => {
        if (!deleteItem) return
        setSaving(true)
        try {
            await roomService.delete(deleteItem.id)
            toast('success', 'Room deleted')
            setDeleteItem(null)
            load()
        } catch (err) {
            toast('error', 'Failed', getErrorMessage(err))
        } finally {
            setSaving(false)
        }
    }

    if (loading) return <PageLoader />
    if (error) return <ErrorState message={error} onRetry={load} />

    return (
        <div>
            <div className="page-header">
                <div>
                    <h1 className="page-title">Rooms</h1>
                    <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>Manage classroom and lab facilities</p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <button className="btn btn-secondary" onClick={() => setImportModalOpen(true)}>
                        <Upload size={14} /> Bulk Import
                    </button>
                    <button className="btn btn-primary" onClick={openCreate}><Plus size={16} /> Add Room</button>
                </div>
            </div>

            <div className="card" style={{ padding: '1.25rem' }}>
                <DataTable
                    columns={[
                        { key: 'name', label: 'Room Name', sortable: true, render: row => <span style={{ fontWeight: 500 }}>{String(row.name)}</span> },
                        {
                            key: 'room_type', label: 'Type', sortable: true, render: row => {
                                const r = row as unknown as Room
                                return (
                                    <span className={`badge ${r.room_type === 'Lab' ? 'badge-violet' : r.room_type === 'Seminar Room' ? 'badge-amber' : 'badge-blue'}`}>
                                        {String(r.room_type)}
                                    </span>
                                )
                            }
                        },
                        {
                            key: 'capacity', label: 'Capacity', sortable: true, render: row => {
                                const r = row as unknown as Room
                                return (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                                        <Users size={14} style={{ color: 'var(--text-muted)' }} />
                                        <span>{String(r.capacity)} seats</span>
                                    </div>
                                )
                            }
                        },
                        {
                            key: 'department_id', label: 'Department', sortable: true, render: row => {
                                const r = row as unknown as Room
                                if (!r.department_id) {
                                    return <span className="badge badge-gray">General Purpose</span>
                                }
                                const dept = departments.find(d => d.id === r.department_id)
                                return (
                                    <span className="badge badge-green">
                                        {dept?.name || 'Unknown'}
                                    </span>
                                )
                            }
                        },
                        {
                            key: 'program_id', label: 'Program Scope', sortable: true, render: row => {
                                const r = row as unknown as Room
                                if (r.room_type !== 'Lab') {
                                    return <span className="badge badge-gray">N/A</span>
                                }
                                const program = programs.find(p => p.id === r.program_id)
                                return (
                                    <span className="badge badge-violet">
                                        {program?.code || 'Not Set'}
                                    </span>
                                )
                            }
                        },
                    ]}
                    data={table.paginated as any}
                    search={table.search}
                    onSearch={table.setSearch}
                    page={table.page}
                    totalPages={table.totalPages}
                    onPageChange={table.setPage}
                    total={table.total}
                    sortKey={table.sortKey as string}
                    sortDir={table.sortDir}
                    onSort={(k) => table.toggleSort(k as keyof Room)}
                    emptyIcon={<DoorOpen size={40} />}
                    emptyTitle="No rooms yet"
                    actions={row => (
                        <>
                            <button className="btn btn-ghost btn-icon btn-sm" onClick={() => openEdit(row as unknown as Room)}><Pencil size={15} /></button>
                            <button className="btn btn-ghost btn-icon btn-sm" style={{ color: '#ef4444' }} onClick={() => setDeleteItem(row as unknown as Room)}><Trash2 size={15} /></button>
                        </>
                    )}
                />
            </div>

            <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)}
                title={editItem ? 'Edit Room' : 'New Room'}
                footer={
                    <>
                        <button className="btn btn-secondary" onClick={() => setModalOpen(false)} disabled={saving}>Cancel</button>
                        <button className="btn btn-primary" form="room-form" type="submit" disabled={saving}>
                            {saving ? <span className="spinner" style={{ width: '1rem', height: '1rem' }} /> : null}
                            {editItem ? 'Save Changes' : 'Create'}
                        </button>
                    </>
                }
            >
                <form id="room-form" onSubmit={handleSubmit(onSubmit as any)} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div className="form-group">
                        <label className="label">Room Name / Number</label>
                        <input {...register('name')} className={`input ${errors.name ? 'input-error' : ''}`} placeholder="e.g. Room 101 or Physics Lab" />
                        {errors.name && <p className="error-msg">{errors.name.message}</p>}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <div className="form-group">
                            <label className="label">Capacity</label>
                            <input {...register('capacity')} type="number" className={`input ${errors.capacity ? 'input-error' : ''}`} min={1} />
                            {errors.capacity && <p className="error-msg">{errors.capacity.message}</p>}
                        </div>
                        <div className="form-group">
                            <label className="label">Room Type</label>
                            <select {...register('room_type')} className={`input select ${errors.room_type ? 'input-error' : ''}`}>
                                <option value="Classroom">Classroom</option>
                                <option value="Lecture Hall">Lecture Hall</option>
                                <option value="Lab">Lab</option>
                                <option value="Seminar Room">Seminar Room</option>
                                <option value="Auditorium">Auditorium</option>
                            </select>
                            {errors.room_type && <p className="error-msg">{errors.room_type.message}</p>}
                        </div>
                    </div>
                    <div className="form-group">
                        <label className="label">Department (Optional)</label>
                        <select {...register('department_id')} className={`input select ${errors.department_id ? 'input-error' : ''}`}>
                            <option value="">General Purpose (Available to all departments)</option>
                            {departments.map(dept => (
                                <option key={dept.id} value={dept.id.toString()}>
                                    {dept.name} ({dept.code})
                                </option>
                            ))}
                        </select>
                        {errors.department_id && <p className="error-msg">{errors.department_id.message}</p>}
                        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                            Leave empty for general purpose rooms available to all departments
                        </p>
                    </div>
                    {selectedRoomType === 'Lab' && (
                        <div className="form-group">
                            <label className="label">Program (Required for Labs)</label>
                            <select {...register('program_id')} className={`input select ${errors.program_id ? 'input-error' : ''}`}>
                                <option value="">Select Program...</option>
                                {programs
                                    .filter((p) => !selectedDepartmentId || p.department_id === Number(selectedDepartmentId))
                                    .map(program => (
                                        <option key={program.id} value={program.id.toString()}>
                                            {program.name} ({program.code})
                                        </option>
                                    ))}
                            </select>
                            {errors.program_id && <p className="error-msg">{errors.program_id.message}</p>}
                            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                                Lab rooms are restricted to this program during timetable generation.
                            </p>
                        </div>
                    )}
                </form>
            </Modal>

            <ConfirmModal
                isOpen={!!deleteItem}
                onClose={() => setDeleteItem(null)}
                onConfirm={handleDelete}
                title="Delete Room"
                message={`Are you sure you want to delete "${deleteItem?.name}"? All associated lectures will also be removed.`}
                isLoading={saving}
            />

            <BulkImportModal
                isOpen={importModalOpen}
                onClose={() => setImportModalOpen(false)}
                resourceName="Rooms"
                headers={['Name', 'Capacity', 'Type', 'Department Code', 'Program Code']}
                formatExamples={{
                    'Name': 'Computer Lab 101',
                    'Capacity': '30',
                    'Type': 'Lab',
                    'Department Code': 'CSEIT',
                    'Program Code': 'BTECH-CSE'
                }}
                onImport={(f) => roomService.bulkImport(f)}
                onSuccess={load}
            />
        </div>
    )
}
