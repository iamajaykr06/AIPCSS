import React, { useEffect, useState, useMemo } from 'react'
import { Plus, Pencil, Trash2, Briefcase, Upload } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { teacherService, departmentService } from '@/services/resources.service'
import { useToast } from '@/context/useToast'
import { useTable } from '@/hooks/useTable'
import { DataTable } from '@/components/common/DataTable'
import { Modal, ConfirmModal } from '@/components/ui/Modal'
import { PageLoader, ErrorState } from '@/components/ui/Loading'
import { BulkImportModal } from '@/components/common/BulkImportModal'
import { getErrorMessage, DAYS, SLOTS } from '@/lib/utils'
import type { Teacher, Department } from '@/types'

const schema = z.object({
    name: z.string().min(1, 'Name is required'),
    email: z.string().email('Invalid email address'),
    phone: z.string().optional(),
    department_ids: z.array(z.coerce.number()).optional(),
})
type FormData = z.infer<typeof schema>

export function TeachersPage() {
    const [teachers, setTeachers] = useState<Teacher[]>([])
    const [departments, setDepartments] = useState<Department[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [modalOpen, setModalOpen] = useState(false)
    const [editItem, setEditItem] = useState<Teacher | null>(null)
    const [deleteItem, setDeleteItem] = useState<Teacher | null>(null)
    const [saving, setSaving] = useState(false)
    const [importModalOpen, setImportModalOpen] = useState(false)
    // Availability: day -> slots[]
    const [availability, setAvailability] = useState<Record<string, string[]>>({})
    const [selectedDepts, setSelectedDepts] = useState<number[]>([])
    const [selectedDeptFilter, setSelectedDeptFilter] = useState<string>('')
    const { toast } = useToast()

    const filteredTeachers = useMemo(() => {
        if (!selectedDeptFilter) return teachers
        return teachers.filter(t => t.departments.some(d => d.name === selectedDeptFilter))
    }, [teachers, selectedDeptFilter])

    const table = useTable({ data: filteredTeachers as any, searchFields: ['name', 'email'] as any, defaultSortKey: 'name' })

    const { register, handleSubmit, reset, formState: { errors }, setValue } = useForm<FormData>({
        resolver: zodResolver(schema) as any,
    })

    async function load() {
        try {
            setError(null)
            const [t, d] = await Promise.all([
                teacherService.list(undefined, 1, 200),
                departmentService.list(1, 200),
            ])
            setTeachers(t.data)
            setDepartments(d.data)
        } catch (err) {
            setError(getErrorMessage(err))
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => { load() }, [])

    const openCreate = () => {
        setEditItem(null)
        reset({ name: '', email: '', phone: '', department_ids: [] })
        setAvailability({})
        setSelectedDepts([])
        setModalOpen(true)
    }

    const openEdit = (t: Teacher) => {
        setEditItem(t)
        setValue('name', t.name)
        setValue('email', t.email)
        setValue('phone', t.phone || '')
        setValue('department_ids', (t.departments || []).map(d => d.id))
        setAvailability(t.availability || {})
        setSelectedDepts((t.departments || []).map(d => d.id))
        setModalOpen(true)
    }

    const toggleSlot = (day: string, slot: string) => {
        setAvailability(prev => {
            const daySlots = prev[day] || []
            const has = daySlots.includes(slot)
            return { ...prev, [day]: has ? daySlots.filter(s => s !== slot) : [...daySlots, slot] }
        })
    }

    const toggleDept = (id: number) => {
        setSelectedDepts(prev => prev.includes(id) ? prev.filter(d => d !== id) : [...prev, id])
    }

    const onSubmit = async (data: FormData) => {
        setSaving(true)
        try {
            const payload = { ...data, department_ids: selectedDepts, availability }
            if (editItem) {
                await teacherService.update(editItem.id, payload)
                toast('success', 'Teacher updated')
            } else {
                await teacherService.create(payload)
                toast('success', 'Teacher created')
            }

            setModalOpen(false)
            load()
        } catch (err) {
            toast('error', 'Failed to save', getErrorMessage(err))
        } finally {
            setSaving(false)
        }
    }

    const handleDelete = async () => {
        if (!deleteItem) return
        setSaving(true)
        try {
            await teacherService.delete(deleteItem.id)
            toast('success', 'Teacher deleted')
            setDeleteItem(null)
            load()
        } catch (err) {
            toast('error', 'Failed to delete', getErrorMessage(err))
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
                    <h1 className="page-title">Teachers</h1>
                    <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                        Manage teaching staff and their availability
                    </p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <button className="btn btn-secondary" onClick={() => setImportModalOpen(true)}>
                        <Upload size={14} /> Bulk Import
                    </button>
                    <button className="btn btn-primary" onClick={openCreate}><Plus size={16} /> Add Teacher</button>
                </div>
            </div>

            <div className="card" style={{ padding: '1.25rem' }}>
                <DataTable
                    headerRight={
                        departments.length > 0 && (
                            <select
                                className="input select select-sm"
                                value={selectedDeptFilter}
                                onChange={(e) => setSelectedDeptFilter(e.target.value)}
                                style={{ minWidth: '150px' }}
                            >
                                <option value="">All Departments</option>
                                {departments.map(d => (
                                    <option key={d.id} value={d.name}>{d.name}</option>
                                ))}
                            </select>
                        )
                    }
                    columns={[
                        {
                            key: 'name', label: 'Name', sortable: true, render: row => {
                                const t = row as unknown as Teacher
                                return (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                                        <div className="avatar" style={{ width: '2rem', height: '2rem', fontSize: '0.75rem' }}>
                                            {t.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                                        </div>
                                        <div>
                                            <span style={{ fontWeight: 500 }}>{t.name}</span>
                                            <p style={{ color: 'var(--text-muted)', fontSize: '0.8125rem' }}>{String(row.email)}</p>
                                            {row.phone && <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{String(row.phone)}</p>}
                                        </div>
                                    </div>
                                )
                            }
                        },
                        {
                            key: 'email', label: 'Email', sortable: true, render: row => (
                                <span style={{ color: 'var(--text-muted)', fontSize: '0.8125rem' }}>{String(row.email)}</span>
                            )
                        },
                        {
                            key: 'departments', label: 'Departments', render: row => {
                                const t = row as unknown as Teacher
                                return (
                                    <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                                        {t.departments.length === 0
                                            ? <span style={{ color: 'var(--text-muted)', fontSize: '0.8125rem' }}>—</span>
                                            : t.departments.map(d => <span key={d.id} className="badge badge-blue">{d.name}</span>)
                                        }
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
                    onSort={(k) => table.toggleSort(k as keyof Teacher)}
                    emptyIcon={<Briefcase size={40} />}
                    emptyTitle="No teachers yet"
                    actions={row => (
                        <>
                            <button className="btn btn-ghost btn-icon btn-sm" onClick={() => openEdit(row as unknown as Teacher)}><Pencil size={15} /></button>
                            <button className="btn btn-ghost btn-icon btn-sm" style={{ color: '#ef4444' }} onClick={() => setDeleteItem(row as unknown as Teacher)}><Trash2 size={15} /></button>
                        </>
                    )}
                />
            </div>

            {/* Create/Edit Teacher Modal */}
            <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)}
                title={editItem ? 'Edit Teacher' : 'New Teacher'} size="lg"
                footer={
                    <>
                        <button className="btn btn-secondary" onClick={() => setModalOpen(false)} disabled={saving}>Cancel</button>
                        <button className="btn btn-primary" form="teacher-form" type="submit" disabled={saving}>
                            {saving ? <span className="spinner" style={{ width: '1rem', height: '1rem' }} /> : null}
                            {editItem ? 'Save Changes' : 'Create'}
                        </button>
                    </>
                }
            >
                <form id="teacher-form" onSubmit={handleSubmit(onSubmit as any)} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <div className="form-group">
                            <label className="label">Full Name</label>
                            <input {...register('name')} className={`input ${errors.name ? 'input-error' : ''}`} placeholder="e.g. Dr. Jane Smith" />
                            {errors.name && <p className="error-msg">{errors.name.message}</p>}
                        </div>
                        <div className="form-group">
                            <label className="label">Email Address</label>
                            <input {...register('email')} type="email" className={`input ${errors.email ? 'input-error' : ''}`} placeholder="jane@university.edu" />
                            {errors.email && <p className="error-msg">{errors.email.message}</p>}
                        </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <div className="form-group">
                            <label className="label">Phone Number</label>
                            <input {...register('phone')} className={`input ${errors.phone ? 'input-error' : ''}`}
                                placeholder="e.g. +1 234 567 890" />
                            {errors.phone && <p className="error-msg">{errors.phone.message}</p>}
                        </div>
                    </div>

                    {/* Departments */}
                    <div className="form-group">
                        <label className="label">Departments</label>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                            {departments.map(d => (
                                <button key={d.id} type="button"
                                    onClick={() => toggleDept(d.id)}
                                    className="badge"
                                    style={{
                                        cursor: 'pointer', padding: '0.25rem 0.75rem', fontWeight: 500,
                                        background: selectedDepts.includes(d.id) ? '#dbeafe' : 'var(--border)',
                                        color: selectedDepts.includes(d.id) ? '#1d4ed8' : 'var(--text-secondary)',
                                        border: selectedDepts.includes(d.id) ? '1px solid #93c5fd' : '1px solid transparent',
                                    }}>
                                    {d.name}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Availability grid */}
                    <div className="form-group">
                        <label className="label" style={{ marginBottom: '0.75rem' }}>Availability (click to toggle)</label>
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '0.8125rem' }}>
                                <thead>
                                    <tr>
                                        <th style={{ padding: '0.375rem 0.5rem', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600 }}>Day</th>
                                        {SLOTS.map(s => (
                                            <th key={s} style={{ padding: '0.375rem 0.375rem', textAlign: 'center', color: 'var(--text-muted)', fontWeight: 500, fontSize: '0.6875rem', whiteSpace: 'nowrap' }}>
                                                {s}
                                            </th>
                                        ))}
                                        <th style={{ padding: '0.375rem 0.5rem', color: 'var(--text-muted)', fontWeight: 500, fontSize: '0.6875rem' }}>All</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {DAYS.map(day => {
                                        const daySlots = availability[day] || []
                                        const allChecked = SLOTS.every(s => daySlots.includes(s))
                                        return (
                                            <tr key={day}>
                                                <td style={{ padding: '0.375rem 0.5rem', fontWeight: 500, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>{day}</td>
                                                {SLOTS.map(slot => {
                                                    const active = daySlots.includes(slot)
                                                    return (
                                                        <td key={slot} style={{ padding: '0.375rem', textAlign: 'center' }}>
                                                            <button type="button" onClick={() => toggleSlot(day, slot)}
                                                                style={{
                                                                    width: '1.625rem', height: '1.625rem', borderRadius: '0.375rem',
                                                                    border: `1.5px solid ${active ? '#3b82f6' : 'var(--border)'}`,
                                                                    background: active ? '#3b82f6' : 'transparent',
                                                                    cursor: 'pointer', transition: 'all 0.1s',
                                                                }}
                                                            />
                                                        </td>
                                                    )
                                                })}
                                                <td style={{ padding: '0.375rem 0.5rem' }}>
                                                    <button type="button" onClick={() => {
                                                        setAvailability(prev => ({
                                                            ...prev,
                                                            [day]: allChecked ? [] : [...SLOTS]
                                                        }))
                                                    }}
                                                        style={{
                                                            fontSize: '0.6875rem', padding: '0.125rem 0.5rem', borderRadius: '0.375rem',
                                                            border: '1px solid var(--border)', background: 'var(--bg)',
                                                            color: 'var(--text-muted)', cursor: 'pointer',
                                                        }}>
                                                        {allChecked ? 'None' : 'All'}
                                                    </button>
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </form>
            </Modal>

            <ConfirmModal
                isOpen={!!deleteItem}
                onClose={() => setDeleteItem(null)}
                onConfirm={handleDelete}
                title="Delete Teacher"
                message={`Delete teacher "${deleteItem?.name}"? This action cannot be undone.`}
                isLoading={saving}
            />

            <BulkImportModal
                isOpen={importModalOpen}
                onClose={() => setImportModalOpen(false)}
                resourceName="Teachers"
                headers={['name', 'email', 'phone', 'department_codes']}
                formatExamples={{
                    'name': 'Dr. John Smith',
                    'email': 'john.smith@university.edu',
                    'phone': '+1 234 567 8900',
                    'department_codes': 'CSEIT;PHYS'
                }}
                onImport={(f) => teacherService.bulkImport(f)}
                onSuccess={load}
            />
        </div>
    )
}
