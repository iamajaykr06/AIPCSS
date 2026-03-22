import React, { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, Users, Upload } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { sectionService, batchService, programService } from '@/services/resources.service'
import { useToast } from '@/context/ToastContext'
import { useTable } from '@/hooks/useTable'
import { DataTable } from '@/components/common/DataTable'
import { Modal, ConfirmModal } from '@/components/ui/Modal'
import { PageLoader, ErrorState } from '@/components/ui/Loading'
import { BulkImportModal } from '@/components/common/BulkImportModal'
import { getErrorMessage } from '@/lib/utils'
import type { Section, Batch, Program } from '@/types'

const schema = z.object({
    name: z.string().min(1, 'Name is required'),
    student_count: z.coerce.number().min(1, 'Must be at least 1').max(500, 'Too large'),
    batch_id: z.coerce.number().min(1, 'Select a batch'),
})
type FormData = z.infer<typeof schema>

export function SectionsPage() {
    const [sections, setSections] = useState<Section[]>([])
    const [batches, setBatches] = useState<Batch[]>([])
    const [programs, setPrograms] = useState<Program[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [modalOpen, setModalOpen] = useState(false)
    const [editItem, setEditItem] = useState<Section | null>(null)
    const [deleteItem, setDeleteItem] = useState<Section | null>(null)
    const [saving, setSaving] = useState(false)
    const [importModalOpen, setImportModalOpen] = useState(false)
    const { toast } = useToast()

    const table = useTable({ data: sections as any, searchFields: ['name'], defaultSortKey: 'name' })
    const { register, handleSubmit, reset, formState: { errors }, setValue } = useForm<FormData>({
        resolver: zodResolver(schema) as any,
    })

    async function load() {
        try {
            setError(null)
            const [secs, bats, progs] = await Promise.all([
                sectionService.list(undefined, 1, 200),
                batchService.list(undefined, 1, 200),
                programService.list(undefined, 1, 200),
            ])
            setSections(secs.data)
            setBatches(bats.data)
            setPrograms(progs.data)
        } catch (err) {
            setError(getErrorMessage(err))
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => { load() }, [])

    const batchMap = Object.fromEntries(batches.map(b => [b.id, b]))
    const progMap = Object.fromEntries(programs.map(p => [p.id, p.name]))

    const openCreate = () => {
        setEditItem(null)
        reset({ name: '', student_count: 40, batch_id: 0 })
        setModalOpen(true)
    }

    const openEdit = (s: Section) => {
        setEditItem(s)
        setValue('name', s.name)
        setValue('student_count', s.student_count)
        setValue('batch_id', s.batch_id)
        setModalOpen(true)
    }

    const onSubmit = async (data: FormData) => {
        setSaving(true)
        try {
            if (editItem) {
                await sectionService.update(editItem.id, data)
                toast('success', 'Section updated')
            } else {
                await sectionService.create(data)
                toast('success', 'Section created')
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
            await sectionService.delete(deleteItem.id)
            toast('success', 'Section deleted')
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
                    <h1 className="page-title">Sections</h1>
                    <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                        Manage class sections within batches
                    </p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <button className="btn btn-secondary" onClick={() => setImportModalOpen(true)}>
                        <Upload size={14} /> Bulk Import
                    </button>
                    <button className="btn btn-primary" onClick={openCreate}><Plus size={16} /> Add Section</button>
                </div>
            </div>

            <div className="card" style={{ padding: '1.25rem' }}>
                <DataTable
                    columns={[
                        { key: 'name', label: 'Section', sortable: true, render: row => <span className="badge badge-violet">{String(row.name)}</span> },
                        {
                            key: 'student_count', label: 'Students', sortable: true, render: row => (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                                    <Users size={13} style={{ color: 'var(--text-muted)' }} />
                                    {String(row.student_count)}
                                </div>
                            )
                        },
                        {
                            key: 'batch_id', label: 'Batch', render: row => {
                                const batch = batchMap[row.batch_id as number]
                                return <span style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>{batch?.name || '—'}</span>
                            }
                        },
                        {
                            key: 'program', label: 'Program', render: row => {
                                const batch = batchMap[row.batch_id as number]
                                const prog = batch ? progMap[batch.program_id] : '—'
                                return <span className="badge badge-gray">{prog || '—'}</span>
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
                    onSort={(k) => table.toggleSort(k as keyof Section)}
                    emptyIcon={<Users size={40} />}
                    emptyTitle="No sections yet"
                    actions={row => (
                        <>
                            <button className="btn btn-ghost btn-icon btn-sm" onClick={() => openEdit(row as unknown as Section)}><Pencil size={15} /></button>
                            <button className="btn btn-ghost btn-icon btn-sm" style={{ color: '#ef4444' }} onClick={() => setDeleteItem(row as unknown as Section)}><Trash2 size={15} /></button>
                        </>
                    )}
                />
            </div>

            <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)}
                title={editItem ? 'Edit Section' : 'New Section'}
                footer={
                    <>
                        <button className="btn btn-secondary" onClick={() => setModalOpen(false)} disabled={saving}>Cancel</button>
                        <button className="btn btn-primary" form="section-form" type="submit" disabled={saving}>
                            {saving ? <span className="spinner" style={{ width: '1rem', height: '1rem' }} /> : null}
                            {editItem ? 'Save Changes' : 'Create'}
                        </button>
                    </>
                }
            >
                <form id="section-form" onSubmit={handleSubmit(onSubmit as any)} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div className="form-group">
                        <label className="label">Section Name</label>
                        <input {...register('name')} className={`input ${errors.name ? 'input-error' : ''}`} placeholder="e.g. Section A" />
                        {errors.name && <p className="error-msg">{errors.name.message}</p>}
                    </div>
                    <div className="form-group">
                        <label className="label">Student Count</label>
                        <input {...register('student_count')} type="number" className={`input ${errors.student_count ? 'input-error' : ''}`} placeholder="40" min={1} />
                        {errors.student_count && <p className="error-msg">{errors.student_count.message}</p>}
                    </div>
                    <div className="form-group">
                        <label className="label">Batch</label>
                        <select {...register('batch_id')} className={`input select ${errors.batch_id ? 'input-error' : ''}`}>
                            <option value={0}>Select batch...</option>
                            {batches.map(b => <option key={b.id} value={b.id}>[{b.code}] {b.name} ({b.academic_year})</option>)}
                        </select>
                        {errors.batch_id && <p className="error-msg">{errors.batch_id.message}</p>}
                    </div>
                </form>
            </Modal>

            <ConfirmModal
                isOpen={!!deleteItem}
                onClose={() => setDeleteItem(null)}
                onConfirm={handleDelete}
                title="Delete Section"
                message={`Delete section "${deleteItem?.name}"?`}
                isLoading={saving}
            />

            <BulkImportModal
                isOpen={importModalOpen}
                onClose={() => setImportModalOpen(false)}
                resourceName="Sections"
                headers={['Name', 'Count', 'BatchCode']}
                formatExamples={{
                    'Name': 'A',
                    'Count': '40',
                    'BatchCode': 'B24'
                }}
                onImport={(f) => sectionService.bulkImport(f)}
                onSuccess={load}
            />
        </div>
    )
}
