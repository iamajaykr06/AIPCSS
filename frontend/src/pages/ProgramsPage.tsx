import React, { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, Layers } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { programService, departmentService } from '@/services/resources.service'
import { useToast } from '@/context/ToastContext'
import { useTable } from '@/hooks/useTable'
import { DataTable } from '@/components/common/DataTable'
import { Modal, ConfirmModal } from '@/components/ui/Modal'
import { PageLoader, ErrorState } from '@/components/ui/Loading'
import { getErrorMessage } from '@/lib/utils'
import type { Program, Department } from '@/types'

const schema = z.object({
    name: z.string().min(1, 'Name is required'),
    code: z.string().min(1, 'Code is required'),
    department_id: z.coerce.number().min(1, 'Select a department'),
})
type FormData = z.infer<typeof schema>

export function ProgramsPage() {
    const [programs, setPrograms] = useState<Program[]>([])
    const [departments, setDepartments] = useState<Department[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [modalOpen, setModalOpen] = useState(false)
    const [editItem, setEditItem] = useState<Program | null>(null)
    const [deleteItem, setDeleteItem] = useState<Program | null>(null)
    const [saving, setSaving] = useState(false)
    const [importing, setImporting] = useState(false)
    const { toast } = useToast()

    const table = useTable({ data: programs as any, searchFields: ['name', 'code'] as any, defaultSortKey: 'name' })

    const { register, handleSubmit, reset, formState: { errors }, setValue, watch } = useForm<FormData>({
        resolver: zodResolver(schema) as any,
    })

    async function load() {
        try {
            setError(null)
            const [progs, depts] = await Promise.all([
                programService.list(undefined, 1, 200),
                departmentService.list(1, 200),
            ])
            setPrograms(progs.data)
            setDepartments(depts.data)
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
        reset({ name: '', code: '', department_id: 0 })
        setModalOpen(true)
    }

    const openEdit = (prog: Program) => {
        setEditItem(prog)
        setValue('name', prog.name)
        setValue('code', prog.code)
        setValue('department_id', prog.department_id)
        setModalOpen(true)
    }

    const onSubmit = async (data: FormData) => {
        setSaving(true)
        try {
            if (editItem) {
                await programService.update(editItem.id, data)
                toast('success', 'Program updated')
            } else {
                await programService.create(data)
                toast('success', 'Program created')
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
            await programService.delete(deleteItem.id)
            toast('success', 'Program deleted')
            setDeleteItem(null)
            load()
        } catch (err) {
            toast('error', 'Failed to delete', getErrorMessage(err))
        } finally {
            setSaving(false)
        }
    }

    const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        setImporting(true)
        try {
            const res = await programService.bulkImport(file)
            toast('success', res.message)
            load()
        } catch (err) {
            toast('error', 'Import failed', getErrorMessage(err))
        } finally {
            setImporting(false)
        }
    }

    if (loading) return <PageLoader />
    if (error) return <ErrorState message={error} onRetry={load} />

    return (
        <div>
            <div className="page-header">
                <div>
                    <h1 className="page-title">Programs</h1>
                    <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                        Manage academic programs under departments
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <label className={`btn btn-secondary ${importing ? 'opacity-50 pointer-events-none' : ''}`} style={{ cursor: 'pointer' }}>
                        {importing ? <span className="spinner" style={{ width: '1rem', height: '1rem', marginRight: '0.5rem' }} /> : null}
                        {importing ? 'Importing...' : 'Bulk Import'}
                        <input type="file" className="hidden" accept=".xlsx, .xls" onChange={handleImport} disabled={importing} style={{ display: 'none' }} />
                    </label>
                    <button className="btn btn-primary" onClick={openCreate}>
                        <Plus size={16} /> Add Program
                    </button>
                </div>
            </div>

            <div className="card" style={{ padding: '1.25rem' }}>
                <DataTable
                    columns={[
                        { key: 'code', label: 'Code', sortable: true, render: row => <span className="badge badge-teal">{String(row.code)}</span> },
                        { key: 'name', label: 'Name', sortable: true },
                        {
                            key: 'department_id', label: 'Department', render: row => (
                                <span style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                                    {deptMap[row.department_id as number] || '—'}
                                </span>
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
                    onSort={(k) => table.toggleSort(k as keyof Program)}
                    emptyIcon={<Layers size={40} />}
                    emptyTitle="No programs yet"
                    actions={row => (
                        <>
                            <button className="btn btn-ghost btn-icon btn-sm" onClick={() => openEdit(row as unknown as Program)}><Pencil size={15} /></button>
                            <button className="btn btn-ghost btn-icon btn-sm" style={{ color: '#ef4444' }} onClick={() => setDeleteItem(row as unknown as Program)}><Trash2 size={15} /></button>
                        </>
                    )}
                />
            </div>

            <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)}
                title={editItem ? 'Edit Program' : 'New Program'}
                footer={
                    <>
                        <button className="btn btn-secondary" onClick={() => setModalOpen(false)} disabled={saving}>Cancel</button>
                        <button className="btn btn-primary" form="prog-form" type="submit" disabled={saving}>
                            {saving ? <span className="spinner" style={{ width: '1rem', height: '1rem' }} /> : null}
                            {editItem ? 'Save Changes' : 'Create'}
                        </button>
                    </>
                }
            >
                <form id="prog-form" onSubmit={handleSubmit(onSubmit as any)} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div className="form-group">
                        <label className="label">Program Name</label>
                        <input {...register('name')} className={`input ${errors.name ? 'input-error' : ''}`} placeholder="e.g. B.Tech Computer Science" />
                        {errors.name && <p className="error-msg">{errors.name.message}</p>}
                    </div>
                    <div className="form-group">
                        <label className="label">Program Code</label>
                        <input {...register('code')} className={`input ${errors.code ? 'input-error' : ''}`} placeholder="e.g. BTCS" />
                        {errors.code && <p className="error-msg">{errors.code.message}</p>}
                    </div>
                    <div className="form-group">
                        <label className="label">Department</label>
                        <select {...register('department_id')} className={`input select ${errors.department_id ? 'input-error' : ''}`}>
                            <option value={0}>Select department...</option>
                            {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                        </select>
                        {errors.department_id && <p className="error-msg">{errors.department_id.message}</p>}
                    </div>
                </form>
            </Modal>

            <ConfirmModal
                isOpen={!!deleteItem}
                onClose={() => setDeleteItem(null)}
                onConfirm={handleDelete}
                title="Delete Program"
                message={`Delete "${deleteItem?.name}"? All batches and sections inside will also be removed.`}
                isLoading={saving}
            />
        </div>
    )
}
