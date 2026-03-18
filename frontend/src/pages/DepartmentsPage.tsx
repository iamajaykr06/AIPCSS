import React, { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, Building2, Upload } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { departmentService } from '@/services/resources.service'
import { useToast } from '@/context/ToastContext'
import { useTable } from '@/hooks/useTable'
import { DataTable } from '@/components/common/DataTable'
import { Modal, ConfirmModal } from '@/components/ui/Modal'
import { PageLoader, ErrorState } from '@/components/ui/Loading'
import { BulkImportModal } from '@/components/common/BulkImportModal'
import { getErrorMessage } from '@/lib/utils'
import type { Department } from '@/types'

const schema = z.object({
    name: z.string().min(2, 'Name must be at least 2 characters'),
    code: z.string().min(1, 'Code is required').toUpperCase(),
})
type FormData = z.infer<typeof schema>

export function DepartmentsPage() {
    const [departments, setDepartments] = useState<Department[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [modalOpen, setModalOpen] = useState(false)
    const [editItem, setEditItem] = useState<Department | null>(null)
    const [deleteItem, setDeleteItem] = useState<Department | null>(null)
    const [saving, setSaving] = useState(false)
    const [importModalOpen, setImportModalOpen] = useState(false)
    const { toast } = useToast()

    const table = useTable({
        data: departments as any,
        searchFields: ['name', 'code'],
        defaultSortKey: 'name',
    })

    const { register, handleSubmit, reset, formState: { errors }, setValue } = useForm<FormData>({
        resolver: zodResolver(schema),
    })

    async function load() {
        try {
            setError(null)
            const res = await departmentService.list(1, 200)
            setDepartments(res.data)
        } catch (err) {
            setError(getErrorMessage(err))
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => { load() }, [])

    const openCreate = () => {
        setEditItem(null)
        reset({ name: '', code: '' })
        setModalOpen(true)
    }

    const openEdit = (dept: Department) => {
        setEditItem(dept)
        setValue('name', dept.name)
        setValue('code', dept.code)
        setModalOpen(true)
    }

    const onSubmit = async (data: FormData) => {
        setSaving(true)
        try {
            if (editItem) {
                await departmentService.update(editItem.id, data)
                toast('success', 'Department updated')
            } else {
                await departmentService.create(data)
                toast('success', 'Department created')
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
            await departmentService.delete(deleteItem.id)
            toast('success', 'Department deleted')
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
                    <h1 className="page-title">Departments</h1>
                    <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                        Manage university departments
                    </p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <button className="btn btn-secondary" onClick={() => setImportModalOpen(true)}>
                        <Upload size={14} /> Bulk Import
                    </button>
                    <button className="btn btn-primary" onClick={openCreate}>
                        <Plus size={16} /> Add Department
                    </button>
                </div>
            </div>

            <div className="card" style={{ padding: '1.25rem' }}>
                <DataTable
                    columns={[
                        {
                            key: 'code', label: 'Code', sortable: true, render: row => (
                                <span className="badge badge-blue">{String(row.code)}</span>
                            )
                        },
                        { key: 'name', label: 'Name', sortable: true },
                        {
                            key: 'id', label: 'ID', render: row => (
                                <span style={{ color: 'var(--text-muted)', fontSize: '0.8125rem' }}>#{String(row.id)}</span>
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
                    onSort={(k) => table.toggleSort(k as keyof Department)}
                    emptyIcon={<Building2 size={40} />}
                    emptyTitle="No departments yet"
                    emptyDescription="Create your first department to get started"
                    actions={row => (
                        <>
                            <button className="btn btn-ghost btn-icon btn-sm" title="Edit"
                                onClick={() => openEdit(row as unknown as Department)}>
                                <Pencil size={15} />
                            </button>
                            <button className="btn btn-ghost btn-icon btn-sm" title="Delete"
                                style={{ color: '#ef4444' }}
                                onClick={() => setDeleteItem(row as unknown as Department)}>
                                <Trash2 size={15} />
                            </button>
                        </>
                    )}
                />
            </div>

            {/* Create/Edit Modal */}
            <Modal
                isOpen={modalOpen}
                onClose={() => setModalOpen(false)}
                title={editItem ? 'Edit Department' : 'New Department'}
                footer={
                    <>
                        <button className="btn btn-secondary" onClick={() => setModalOpen(false)} disabled={saving}>Cancel</button>
                        <button className="btn btn-primary" form="dept-form" type="submit" disabled={saving}>
                            {saving ? <span className="spinner" style={{ width: '1rem', height: '1rem' }} /> : null}
                            {editItem ? 'Save Changes' : 'Create'}
                        </button>
                    </>
                }
            >
                <form id="dept-form" onSubmit={handleSubmit(onSubmit as any)} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div className="form-group">
                        <label className="label">Department Name</label>
                        <input {...register('name')} className={`input ${errors.name ? 'input-error' : ''}`}
                            placeholder="e.g. Computer Science" />
                        {errors.name && <p className="error-msg">{errors.name.message}</p>}
                    </div>
                    <div className="form-group">
                        <label className="label">Department Code</label>
                        <input {...register('code')} className={`input ${errors.code ? 'input-error' : ''}`}
                            placeholder="e.g. CS" style={{ textTransform: 'uppercase' }} />
                        {errors.code && <p className="error-msg">{errors.code.message}</p>}
                    </div>
                </form>
            </Modal>

            {/* Delete Confirm */}
            <ConfirmModal
                isOpen={!!deleteItem}
                onClose={() => setDeleteItem(null)}
                onConfirm={handleDelete}
                title="Delete Department"
                message={`Are you sure you want to delete "${deleteItem?.name}"? This will also remove all associated programs, batches, and sections.`}
                isLoading={saving}
            />

            <BulkImportModal
                isOpen={importModalOpen}
                onClose={() => setImportModalOpen(false)}
                resourceName="Departments"
                headers={['Name', 'Code']}
                onImport={(f) => departmentService.bulkImport(f)}
                onSuccess={load}
            />
        </div>
    )
}
