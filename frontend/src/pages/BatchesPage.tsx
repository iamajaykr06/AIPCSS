import React, { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, GraduationCap, Upload } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { batchService, programService, departmentService } from '@/services/resources.service'
import { useToast } from '@/context/ToastContext'
import { useTable } from '@/hooks/useTable'
import { DataTable } from '@/components/common/DataTable'
import { Modal, ConfirmModal } from '@/components/ui/Modal'
import { PageLoader, ErrorState } from '@/components/ui/Loading'
import { BulkImportModal } from '@/components/common/BulkImportModal'
import { getErrorMessage } from '@/lib/utils'
import type { Batch, Program, Department } from '@/types'

const schema = z.object({
    name: z.string().min(1, 'Name is required'),
    code: z.string().min(1, 'Code is required'),
    academic_year: z.string().min(4, 'Academic year required'),
    program_id: z.coerce.number().min(1, 'Select a program'),
})
type FormData = z.infer<typeof schema>

export function BatchesPage() {
    const [batches, setBatches] = useState<Batch[]>([])
    const [programs, setPrograms] = useState<Program[]>([])
    const [departments, setDepartments] = useState<Department[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [modalOpen, setModalOpen] = useState(false)
    const [editItem, setEditItem] = useState<Batch | null>(null)
    const [deleteItem, setDeleteItem] = useState<Batch | null>(null)
    const [saving, setSaving] = useState(false)
    const [importModalOpen, setImportModalOpen] = useState(false)
    const { toast } = useToast()

    const table = useTable({ data: batches as any, searchFields: ['name', 'academic_year'], defaultSortKey: 'name' })
    const { register, handleSubmit, reset, formState: { errors }, setValue } = useForm<FormData>({
        resolver: zodResolver(schema) as any,
    })

    async function load() {
        try {
            setError(null)
            const [bat, progs, depts] = await Promise.all([
                batchService.list(undefined, 1, 200),
                programService.list(undefined, 1, 200),
                departmentService.list(1, 200),
            ])
            setBatches(bat.data)
            setPrograms(progs.data)
            setDepartments(depts.data)
        } catch (err) {
            setError(getErrorMessage(err))
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => { load() }, [])

    const progMap = Object.fromEntries(programs.map(p => [p.id, p]))
    const deptMap = Object.fromEntries(departments.map(d => [d.id, d.name]))

    const getProgInfo = (progId: number) => {
        const prog = progMap[progId]
        if (!prog) return { progName: '—', deptName: '—' }
        return { progName: prog.name, deptName: deptMap[prog.department_id] || '—' }
    }

    const openCreate = () => {
        setEditItem(null)
        reset({ name: '', code: '', academic_year: '', program_id: 0 })
        setModalOpen(true)
    }

    const openEdit = (b: Batch) => {
        setEditItem(b)
        setValue('name', b.name)
        setValue('code', b.code)
        setValue('academic_year', b.academic_year)
        setValue('program_id', b.program_id)
        setModalOpen(true)
    }

    const onSubmit = async (data: FormData) => {
        setSaving(true)
        try {
            if (editItem) {
                await batchService.update(editItem.id, data)
                toast('success', 'Batch updated')
            } else {
                await batchService.create(data)
                toast('success', 'Batch created')
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
            await batchService.delete(deleteItem.id)
            toast('success', 'Batch deleted')
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
                    <h1 className="page-title">Batches</h1>
                    <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                        Manage academic year batches under programs
                    </p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <button className="btn btn-secondary" onClick={() => setImportModalOpen(true)}>
                        <Upload size={14} /> Bulk Import
                    </button>
                    <button className="btn btn-primary" onClick={openCreate}>
                        <Plus size={16} /> Add Batch
                    </button>
                </div>
            </div>

            <div className="card" style={{ padding: '1.25rem' }}>
                <DataTable
                    columns={[
                        { key: 'name', label: 'Batch Name', sortable: true },
                        { key: 'code', label: 'Code', sortable: true, render: row => <span className="badge badge-blue">{String(row.code)}</span> },
                        {
                            key: 'academic_year', label: 'Academic Year', sortable: true, render: row => (
                                <span className="badge badge-amber">{String(row.academic_year)}</span>
                            )
                        },
                        {
                            key: 'program_id', label: 'Program', render: row => {
                                const { progName } = getProgInfo(row.program_id as number)
                                return <span style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>{progName}</span>
                            }
                        },
                        {
                            key: 'department', label: 'Department', render: row => {
                                const { deptName } = getProgInfo(row.program_id as number)
                                return <span className="badge badge-gray">{deptName}</span>
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
                    onSort={(k) => table.toggleSort(k as keyof Batch)}
                    emptyIcon={<GraduationCap size={40} />}
                    emptyTitle="No batches yet"
                    actions={row => (
                        <>
                            <button className="btn btn-ghost btn-icon btn-sm" onClick={() => openEdit(row as unknown as Batch)}><Pencil size={15} /></button>
                            <button className="btn btn-ghost btn-icon btn-sm" style={{ color: '#ef4444' }} onClick={() => setDeleteItem(row as unknown as Batch)}><Trash2 size={15} /></button>
                        </>
                    )}
                />
            </div>

            <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)}
                title={editItem ? 'Edit Batch' : 'New Batch'}
                footer={
                    <>
                        <button className="btn btn-secondary" onClick={() => setModalOpen(false)} disabled={saving}>Cancel</button>
                        <button className="btn btn-primary" form="batch-form" type="submit" disabled={saving}>
                            {saving ? <span className="spinner" style={{ width: '1rem', height: '1rem' }} /> : null}
                            {editItem ? 'Save Changes' : 'Create'}
                        </button>
                    </>
                }
            >
                <form id="batch-form" onSubmit={handleSubmit(onSubmit as any)} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div className="form-group">
                        <label className="label">Batch Name</label>
                        <input {...register('name')} className={`input ${errors.name ? 'input-error' : ''}`}
                            placeholder="e.g. Batch 2024" />
                        {errors.name && <p className="error-msg">{errors.name.message}</p>}
                    </div>
                    <div className="form-group">
                        <label className="label">Batch Code</label>
                        <input {...register('code')} className={`input ${errors.code ? 'input-error' : ''}`}
                            placeholder="e.g. B24" />
                        {errors.code && <p className="error-msg">{errors.code.message}</p>}
                    </div>
                    <div className="form-group">
                        <label className="label">Academic Year</label>
                        <input {...register('academic_year')} className={`input ${errors.academic_year ? 'input-error' : ''}`}
                            placeholder="e.g. 2024-2025" />
                        {errors.academic_year && <p className="error-msg">{errors.academic_year.message}</p>}
                    </div>
                    <div className="form-group">
                        <label className="label">Program</label>
                        <select {...register('program_id')} className={`input select ${errors.program_id ? 'input-error' : ''}`}>
                            <option value={0}>Select program...</option>
                            {programs.map(p => <option key={p.id} value={p.id}>[{p.code}] {p.name}</option>)}
                        </select>
                        {errors.program_id && <p className="error-msg">{errors.program_id.message}</p>}
                    </div>
                </form>
            </Modal>

            <ConfirmModal
                isOpen={!!deleteItem}
                onClose={() => setDeleteItem(null)}
                onConfirm={handleDelete}
                title="Delete Batch"
                message={`Delete batch "${deleteItem?.name}"? All sections inside will also be removed.`}
                isLoading={saving}
            />

            <BulkImportModal
                isOpen={importModalOpen}
                onClose={() => setImportModalOpen(false)}
                resourceName="Batches"
                headers={['Name', 'Code', 'Year', 'ProgramCode']}
                onImport={(f) => batchService.bulkImport(f)}
                onSuccess={load}
            />
        </div>
    )
}
