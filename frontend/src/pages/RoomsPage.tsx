import React, { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, DoorOpen, Users } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { roomService, departmentService } from '@/services/resources.service'
import { useToast } from '@/context/ToastContext'
import { useTable } from '@/hooks/useTable'
import { DataTable } from '@/components/common/DataTable'
import { Modal, ConfirmModal } from '@/components/ui/Modal'
import { PageLoader, ErrorState } from '@/components/ui/Loading'
import { getErrorMessage } from '@/lib/utils'
import type { Room, Department } from '@/types'

const schema = z.object({
    name: z.string().min(1, 'Name is required'),
    capacity: z.coerce.number().min(1, 'Capacity must be at least 1'),
    room_type: z.enum(['Classroom', 'Lecture Hall', 'Lab', 'Seminar Room', 'Auditorium']),
})
type FormData = z.infer<typeof schema>

export function RoomsPage() {
    const [rooms, setRooms] = useState<Room[]>([])
    const [departments, setDepartments] = useState<Department[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [modalOpen, setModalOpen] = useState(false)
    const [editItem, setEditItem] = useState<Room | null>(null)
    const [deleteItem, setDeleteItem] = useState<Room | null>(null)
    const [saving, setSaving] = useState(false)
    const { toast } = useToast()

    const table = useTable({ data: rooms as any, searchFields: ['name', 'room_type'], defaultSortKey: 'name' })
    const { register, handleSubmit, reset, formState: { errors }, setValue } = useForm<FormData>({
        resolver: zodResolver(schema) as any,
        defaultValues: { room_type: 'Classroom', capacity: 40 },
    })

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
    useEffect(() => { load() }, [])

    const openCreate = () => {
        setEditItem(null)
        reset({ name: '', capacity: 40, room_type: 'Classroom' })
        setModalOpen(true)
    }

    const openEdit = (r: Room) => {
        setEditItem(r)
        setValue('name', r.name)
        setValue('capacity', r.capacity)
        setValue('room_type', r.room_type)
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
                <button className="btn btn-primary" onClick={openCreate}><Plus size={16} /> Add Room</button>
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
                </form>
            </Modal>

            <ConfirmModal
                isOpen={!!deleteItem}
                onClose={() => setDeleteItem(null)}
                onConfirm={handleDelete}
                title="Delete Room"
                message={`Delete room "${deleteItem?.name}"?`}
                isLoading={saving}
            />
        </div>
    )
}
