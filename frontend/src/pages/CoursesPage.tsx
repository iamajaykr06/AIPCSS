import React, { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, BookOpen } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { courseService, departmentService } from '@/services/resources.service'
import { useToast } from '@/context/ToastContext'
import { useTable } from '@/hooks/useTable'
import { DataTable } from '@/components/common/DataTable'
import { Modal, ConfirmModal } from '@/components/ui/Modal'
import { PageLoader, ErrorState } from '@/components/ui/Loading'
import { getErrorMessage } from '@/lib/utils'
import type { Course, Department } from '@/types'

const schema = z.object({
    name: z.string().min(1, 'Name is required'),
    code: z.string().min(1, 'Code is required'),
    credits: z.coerce.number().min(1).max(10),
    course_type: z.enum(['Theory', 'Lab']),
    department_id: z.coerce.number().min(1, 'Select a department'),
})

type FormData = z.infer<typeof schema>

export function CoursesPage() {
    const [courses, setCourses] = useState<Course[]>([])
    const [departments, setDepartments] = useState<Department[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [modalOpen, setModalOpen] = useState(false)
    const [editItem, setEditItem] = useState<Course | null>(null)
    const [deleteItem, setDeleteItem] = useState<Course | null>(null)
    const [saving, setSaving] = useState(false)
    const { toast } = useToast()

    const table = useTable({ data: courses as any, searchFields: ['name', 'code'] as any, defaultSortKey: 'name' })
    const { register, handleSubmit, reset, formState: { errors }, setValue } = useForm<FormData>({
        resolver: zodResolver(schema) as any,
        defaultValues: { course_type: 'Theory', credits: 3 },
    })

    async function load() {
        try {
            setError(null)
            const [c, d] = await Promise.all([
                courseService.list(undefined, 1, 200),
                departmentService.list(1, 200),
            ])
            setCourses(c.data)
            setDepartments(d.data)
        } catch (err) {
            setError(getErrorMessage(err))
        } finally {
            setLoading(false)
        }
    }
    useEffect(() => { load() }, [])

    const deptMap = Object.fromEntries(departments.map(d => [d.id, d.name]))

    const openCreate = () => {
        setEditItem(null)
        reset({ name: '', code: '', credits: 3, course_type: 'Theory', department_id: 0 })
        setModalOpen(true)
    }

    const openEdit = (c: Course) => {
        setEditItem(c)
        setValue('name', c.name)
        setValue('code', c.code)
        setValue('credits', c.credits)
        setValue('course_type', c.course_type)
        setValue('department_id', c.department_id)
        setModalOpen(true)
    }

    const onSubmit = async (data: FormData) => {
        setSaving(true)
        try {
            if (editItem) {
                await courseService.update(editItem.id, data)
                toast('success', 'Course updated')
            } else {
                await courseService.create(data)
                toast('success', 'Course created')
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
            await courseService.delete(deleteItem.id)
            toast('success', 'Course deleted')
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
                    <h1 className="page-title">Courses</h1>
                    <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>Manage subjects and courses</p>
                </div>
                <button className="btn btn-primary" onClick={openCreate}><Plus size={16} /> Add Course</button>
            </div>

            <div className="card" style={{ padding: '1.25rem' }}>
                <DataTable
                    columns={[
                        { key: 'code', label: 'Code', sortable: true, render: row => <span className="badge badge-blue">{String(row.code)}</span> },
                        { key: 'name', label: 'Name', sortable: true },
                        {
                            key: 'course_type', label: 'Type', render: row => (
                                <span className={`badge ${row.course_type === 'Lab' ? 'badge-violet' : 'badge-teal'}`}> {String(row.course_type)} </span>
                            )
                        },
                        {
                            key: 'credits', label: 'Credits', sortable: true, render: row => (
                                <span style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>{String(row.credits)} cr</span>
                            )
                        },
                        {
                            key: 'department_id', label: 'Department', render: row => (
                                <span className="badge badge-gray">{deptMap[row.department_id as number] || '—'}</span>
                            )
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
                    onSort={(k) => table.toggleSort(k as keyof Course)}
                    emptyIcon={<BookOpen size={40} />}
                    emptyTitle="No courses yet"
                    actions={row => (
                        <>
                            <button className="btn btn-ghost btn-icon btn-sm" onClick={() => openEdit(row as unknown as Course)}><Pencil size={15} /></button>
                            <button className="btn btn-ghost btn-icon btn-sm" style={{ color: '#ef4444' }} onClick={() => setDeleteItem(row as unknown as Course)}><Trash2 size={15} /></button>
                        </>
                    )}
                />
            </div>

            <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)}
                title={editItem ? 'Edit Course' : 'New Course'}
                footer={
                    <>
                        <button className="btn btn-secondary" onClick={() => setModalOpen(false)} disabled={saving}>Cancel</button>
                        <button className="btn btn-primary" form="course-form" type="submit" disabled={saving}>
                            {saving ? <span className="spinner" style={{ width: '1rem', height: '1rem' }} /> : null}
                            {editItem ? 'Save Changes' : 'Create'}
                        </button>
                    </>
                }
            >
                <form id="course-form" onSubmit={handleSubmit(onSubmit as any)} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                            <label className="label">Course Name</label>
                            <input {...register('name')} className={`input ${errors.name ? 'input-error' : ''}`} placeholder="e.g. Data Structures" />
                            {errors.name && <p className="error-msg">{errors.name.message}</p>}
                        </div>
                        <div className="form-group">
                            <label className="label">Course Code</label>
                            <input {...register('code')} className={`input ${errors.code ? 'input-error' : ''}`} placeholder="e.g. CS301" />
                            {errors.code && <p className="error-msg">{errors.code.message}</p>}
                        </div>
                        <div className="form-group">
                            <label className="label">Credits</label>
                            <input {...register('credits')} type="number" className={`input ${errors.credits ? 'input-error' : ''}`} min={1} max={10} />
                            {errors.credits && <p className="error-msg">{errors.credits.message}</p>}
                        </div>
                        <div className="form-group">
                            <label className="label">Type</label>
                            <select {...register('course_type')} className={`input select ${errors.course_type ? 'input-error' : ''}`}>
                                <option value="Theory">Theory</option>
                                <option value="Lab">Lab</option>
                            </select>
                            {errors.course_type && <p className="error-msg">{errors.course_type.message}</p>}
                        </div>
                        <div className="form-group">
                            <label className="label">Department</label>
                            <select {...register('department_id')} className={`input select ${errors.department_id ? 'input-error' : ''}`}>
                                <option value={0}>Select department...</option>
                                {departments.map(d => (
                                    <option key={d.id} value={d.id}>{d.name}</option>
                                ))}
                            </select>
                            {errors.department_id && <p className="error-msg">{errors.department_id.message}</p>}
                        </div>
                    </div>
                </form>
            </Modal>

            <ConfirmModal
                isOpen={!!deleteItem}
                onClose={() => setDeleteItem(null)}
                onConfirm={handleDelete}
                title="Delete Course"
                message={`Delete course "${deleteItem?.name}"?`}
                isLoading={saving}
            />
        </div>
    )
}
