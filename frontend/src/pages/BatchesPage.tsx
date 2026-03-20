import React, { useEffect, useState, useMemo } from 'react'
import { Plus, Pencil, Trash2, GraduationCap, Users, Upload } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { batchService, programService, departmentService, sectionService } from '@/services/resources.service'
import { useToast } from '@/context/ToastContext'
import { useTable } from '@/hooks/useTable'
import { DataTable } from '@/components/common/DataTable'
import { Modal, ConfirmModal } from '@/components/ui/Modal'
import { PageLoader, ErrorState } from '@/components/ui/Loading'
import { BulkImportModal } from '@/components/common/BulkImportModal'
import { getErrorMessage } from '@/lib/utils'
import type { Batch, Program, Department, Section } from '@/types'

// ── Batch form schema ────────────────────────────────────────────────────────
const batchSchema = z.object({
    name: z.string().min(1, 'Name is required'),
    code: z.string().min(1, 'Code is required'),
    academic_year: z.string().min(4, 'Academic year required'),
    program_id: z.coerce.number().min(1, 'Select a program'),
})
type BatchFormData = z.infer<typeof batchSchema>

// ── Section form schema ──────────────────────────────────────────────────────
const sectionSchema = z.object({
    name: z.string().min(1, 'Name is required'),
    student_count: z.coerce.number().min(1, 'Must be at least 1').max(500, 'Too large'),
    batch_id: z.coerce.number().min(1, 'Select a batch'),
})
type SectionFormData = z.infer<typeof sectionSchema>

type Tab = 'batches' | 'sections'

export function BatchesPage() {
    const [activeTab, setActiveTab] = useState<Tab>('batches')

    // ── shared data ────────────────────────────────────────────────────────────
    const [batches, setBatches] = useState<Batch[]>([])
    const [sections, setSections] = useState<Section[]>([])
    const [programs, setPrograms] = useState<Program[]>([])
    const [departments, setDepartments] = useState<Department[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const { toast } = useToast()

    // ── batch modal state ──────────────────────────────────────────────────────
    const [batchModalOpen, setBatchModalOpen] = useState(false)
    const [editBatch, setEditBatch] = useState<Batch | null>(null)
    const [deleteBatch, setDeleteBatch] = useState<Batch | null>(null)
    const [batchImportOpen, setBatchImportOpen] = useState(false)
    const [savingBatch, setSavingBatch] = useState(false)

    // ── section modal state ────────────────────────────────────────────────────
    const [sectionModalOpen, setSectionModalOpen] = useState(false)
    const [editSection, setEditSection] = useState<Section | null>(null)
    const [deleteSection, setDeleteSection] = useState<Section | null>(null)
    const [sectionImportOpen, setSectionImportOpen] = useState(false)
    const [savingSection, setSavingSection] = useState(false)

    // ── section batch filter ───────────────────────────────────────────────────
    const [selectedBatchFilter, setSelectedBatchFilter] = useState<string>('')

    // ── tables ─────────────────────────────────────────────────────────────────
    const batchTable = useTable({ data: batches as any, searchFields: ['name', 'academic_year'], defaultSortKey: 'name' })

    const filteredSections = useMemo(() => {
        if (!selectedBatchFilter) return sections
        return sections.filter(s => String(s.batch_id) === selectedBatchFilter)
    }, [sections, selectedBatchFilter])
    const sectionTable = useTable({ data: filteredSections as any, searchFields: ['name'], defaultSortKey: 'name' })

    // ── forms ──────────────────────────────────────────────────────────────────
    const batchForm = useForm<BatchFormData>({ resolver: zodResolver(batchSchema) as any })
    const sectionForm = useForm<SectionFormData>({ resolver: zodResolver(sectionSchema) as any })

    // ── lookup maps ────────────────────────────────────────────────────────────
    const progMap = useMemo(() => Object.fromEntries(programs.map(p => [p.id, p])), [programs])
    const deptMap = useMemo(() => Object.fromEntries(departments.map(d => [d.id, d.name])), [departments])
    const batchMap = useMemo(() => Object.fromEntries(batches.map(b => [b.id, b])), [batches])

    const getProgInfo = (progId: number) => {
        const prog = progMap[progId]
        if (!prog) return { progName: '—', deptName: '—' }
        return { progName: prog.name, deptName: deptMap[prog.department_id] || '—' }
    }

    // ── load ───────────────────────────────────────────────────────────────────
    async function load() {
        try {
            setError(null)
            const [bat, secs, progs, depts] = await Promise.all([
                batchService.list(),
                sectionService.list(),
                programService.list(),
                departmentService.list(),
            ])
            setBatches(bat.data)
            setSections(secs.data)
            setPrograms(progs.data)
            setDepartments(depts.data)
        } catch (err) {
            setError(getErrorMessage(err))
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => { load() }, [])

    // ── batch actions ──────────────────────────────────────────────────────────
    const openCreateBatch = () => {
        setEditBatch(null)
        batchForm.reset({ name: '', code: '', academic_year: '', program_id: 0 })
        setBatchModalOpen(true)
    }
    const openEditBatch = (b: Batch) => {
        setEditBatch(b)
        batchForm.setValue('name', b.name)
        batchForm.setValue('code', b.code)
        batchForm.setValue('academic_year', b.academic_year)
        batchForm.setValue('program_id', b.program_id)
        setBatchModalOpen(true)
    }
    const onBatchSubmit = async (data: BatchFormData) => {
        setSavingBatch(true)
        try {
            if (editBatch) {
                await batchService.update(editBatch.id, data)
                toast('success', 'Batch updated')
            } else {
                await batchService.create(data)
                toast('success', 'Batch created')
            }
            setBatchModalOpen(false)
            load()
        } catch (err) {
            toast('error', 'Failed to save', getErrorMessage(err))
        } finally {
            setSavingBatch(false)
        }
    }
    const handleDeleteBatch = async () => {
        if (!deleteBatch) return
        setSavingBatch(true)
        try {
            await batchService.delete(deleteBatch.id)
            toast('success', 'Batch deleted')
            setDeleteBatch(null)
            load()
        } catch (err) {
            toast('error', 'Failed to delete', getErrorMessage(err))
        } finally {
            setSavingBatch(false)
        }
    }

    // ── section actions ────────────────────────────────────────────────────────
    const openCreateSection = () => {
        setEditSection(null)
        sectionForm.reset({ name: '', student_count: 40, batch_id: 0 })
        setSectionModalOpen(true)
    }
    const openEditSection = (s: Section) => {
        setEditSection(s)
        sectionForm.setValue('name', s.name)
        sectionForm.setValue('student_count', s.student_count)
        sectionForm.setValue('batch_id', s.batch_id)
        setSectionModalOpen(true)
    }
    const onSectionSubmit = async (data: SectionFormData) => {
        setSavingSection(true)
        try {
            if (editSection) {
                await sectionService.update(editSection.id, data)
                toast('success', 'Section updated')
            } else {
                await sectionService.create(data)
                toast('success', 'Section created')
            }
            setSectionModalOpen(false)
            load()
        } catch (err) {
            toast('error', 'Failed to save', getErrorMessage(err))
        } finally {
            setSavingSection(false)
        }
    }
    const handleDeleteSection = async () => {
        if (!deleteSection) return
        setSavingSection(true)
        try {
            await sectionService.delete(deleteSection.id)
            toast('success', 'Section deleted')
            setDeleteSection(null)
            load()
        } catch (err) {
            toast('error', 'Failed to delete', getErrorMessage(err))
        } finally {
            setSavingSection(false)
        }
    }

    if (loading) return <PageLoader />
    if (error) return <ErrorState message={error} onRetry={load} />

    const tabStyle = (t: Tab) => ({
        padding: '0.5rem 1.25rem',
        borderBottom: activeTab === t ? '2px solid var(--primary)' : '2px solid transparent',
        color: activeTab === t ? 'var(--primary)' : 'var(--text-muted)',
        fontWeight: activeTab === t ? 600 : 400,
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        fontSize: '0.9375rem',
        transition: 'all 0.15s',
    } as React.CSSProperties)

    return (
        <div>
            {/* Page Header */}
            <div className="page-header">
                <div>
                    <h1 className="page-title">Batches & Sections</h1>
                    <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                        Manage academic year batches and class sections
                    </p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    {activeTab === 'batches' ? (
                        <>
                            <button className="btn btn-secondary" onClick={() => setBatchImportOpen(true)}>
                                <Upload size={14} /> Bulk Import
                            </button>
                            <button className="btn btn-primary" onClick={openCreateBatch}>
                                <Plus size={16} /> Add Batch
                            </button>
                        </>
                    ) : (
                        <>
                            <button className="btn btn-secondary" onClick={() => setSectionImportOpen(true)}>
                                <Upload size={14} /> Bulk Import
                            </button>
                            <button className="btn btn-primary" onClick={openCreateSection}>
                                <Plus size={16} /> Add Section
                            </button>
                        </>
                    )}
                </div>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: '1.25rem' }}>
                <button style={tabStyle('batches')} onClick={() => setActiveTab('batches')}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <GraduationCap size={16} /> Batches
                    </span>
                </button>
                <button style={tabStyle('sections')} onClick={() => setActiveTab('sections')}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Users size={16} /> Sections
                    </span>
                </button>
            </div>

            {/* ── Batches Tab ────────────────────────────────────────────────── */}
            {activeTab === 'batches' && (
                <div className="card" style={{ padding: '1.25rem' }}>
                    <DataTable
                        columns={[
                            { key: 'name', label: 'Name', sortable: true },
                            { key: 'code', label: 'Code', sortable: true, render: row => <span className="badge badge-blue">{String(row.code)}</span> },
                            {
                                key: 'section_count', label: 'Sections', render: row => (
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                                        <Users size={13} style={{ color: 'var(--text-muted)' }} />
                                        {String(row.section_count ?? 0)}
                                    </span>
                                )
                            },
                            {
                                key: 'academic_year', label: 'Year', sortable: true, render: row => (
                                    <span className="badge badge-amber">{String(row.academic_year)}</span>
                                )
                            },
                            {
                                key: 'program_code', label: 'Program', sortable: true, render: row => (
                                    <span className="badge badge-gray">{String(row.program_code ?? '—')}</span>
                                )
                            },
                        ]}
                        data={batchTable.paginated as any}
                        search={batchTable.search}
                        onSearch={batchTable.setSearch}
                        page={batchTable.page}
                        totalPages={batchTable.totalPages}
                        onPageChange={batchTable.setPage}
                        total={batchTable.total}
                        sortKey={batchTable.sortKey as string}
                        sortDir={batchTable.sortDir}
                        onSort={(k) => batchTable.toggleSort(k as keyof Batch)}
                        emptyIcon={<GraduationCap size={40} />}
                        emptyTitle="No batches yet"
                        actions={row => (
                            <>
                                <button className="btn btn-ghost btn-icon btn-sm" onClick={() => openEditBatch(row as unknown as Batch)}><Pencil size={15} /></button>
                                <button className="btn btn-ghost btn-icon btn-sm" style={{ color: '#ef4444' }} onClick={() => setDeleteBatch(row as unknown as Batch)}><Trash2 size={15} /></button>
                            </>
                        )}
                    />
                </div>
            )}

            {/* ── Sections Tab ───────────────────────────────────────────────── */}
            {activeTab === 'sections' && (
                <div className="card" style={{ padding: '1.25rem' }}>
                    <DataTable
                        headerRight={
                            batches.length > 0 && (
                                <select
                                    className="input select select-sm"
                                    value={selectedBatchFilter}
                                    onChange={(e) => setSelectedBatchFilter(e.target.value)}
                                    style={{ minWidth: '160px' }}
                                >
                                    <option value="">All Batches</option>
                                    {batches.map(b => (
                                        <option key={b.id} value={String(b.id)}>{b.name} ({b.academic_year})</option>
                                    ))}
                                </select>
                            )
                        }
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
                                    const prog = batch ? progMap[batch.program_id] : null
                                    return <span className="badge badge-gray">{prog?.name || '—'}</span>
                                }
                            },
                        ]}
                        data={sectionTable.paginated as any}
                        search={sectionTable.search}
                        onSearch={sectionTable.setSearch}
                        page={sectionTable.page}
                        totalPages={sectionTable.totalPages}
                        onPageChange={sectionTable.setPage}
                        total={sectionTable.total}
                        sortKey={sectionTable.sortKey as string}
                        sortDir={sectionTable.sortDir}
                        onSort={(k) => sectionTable.toggleSort(k as keyof Section)}
                        emptyIcon={<Users size={40} />}
                        emptyTitle="No sections yet"
                        actions={row => (
                            <>
                                <button className="btn btn-ghost btn-icon btn-sm" onClick={() => openEditSection(row as unknown as Section)}><Pencil size={15} /></button>
                                <button className="btn btn-ghost btn-icon btn-sm" style={{ color: '#ef4444' }} onClick={() => setDeleteSection(row as unknown as Section)}><Trash2 size={15} /></button>
                            </>
                        )}
                    />
                </div>
            )}

            {/* ── Batch Modals ───────────────────────────────────────────────── */}
            <Modal isOpen={batchModalOpen} onClose={() => setBatchModalOpen(false)}
                title={editBatch ? 'Edit Batch' : 'New Batch'}
                footer={
                    <>
                        <button className="btn btn-secondary" onClick={() => setBatchModalOpen(false)} disabled={savingBatch}>Cancel</button>
                        <button className="btn btn-primary" form="batch-form" type="submit" disabled={savingBatch}>
                            {savingBatch ? <span className="spinner" style={{ width: '1rem', height: '1rem' }} /> : null}
                            {editBatch ? 'Save Changes' : 'Create'}
                        </button>
                    </>
                }
            >
                <form id="batch-form" onSubmit={batchForm.handleSubmit(onBatchSubmit as any)} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div className="form-group">
                        <label className="label">Batch Name</label>
                        <input {...batchForm.register('name')} className={`input ${batchForm.formState.errors.name ? 'input-error' : ''}`} placeholder="e.g. Batch 2024" />
                        {batchForm.formState.errors.name && <p className="error-msg">{batchForm.formState.errors.name.message}</p>}
                    </div>
                    <div className="form-group">
                        <label className="label">Batch Code</label>
                        <input {...batchForm.register('code')} className={`input ${batchForm.formState.errors.code ? 'input-error' : ''}`} placeholder="e.g. B24" />
                        {batchForm.formState.errors.code && <p className="error-msg">{batchForm.formState.errors.code.message}</p>}
                    </div>
                    <div className="form-group">
                        <label className="label">Academic Year</label>
                        <input {...batchForm.register('academic_year')} className={`input ${batchForm.formState.errors.academic_year ? 'input-error' : ''}`} placeholder="e.g. 2024-2025" />
                        {batchForm.formState.errors.academic_year && <p className="error-msg">{batchForm.formState.errors.academic_year.message}</p>}
                    </div>
                    <div className="form-group">
                        <label className="label">Program</label>
                        <select {...batchForm.register('program_id')} className={`input select ${batchForm.formState.errors.program_id ? 'input-error' : ''}`}>
                            <option value={0}>Select program...</option>
                            {programs.map(p => <option key={p.id} value={p.id}>[{p.code}] {p.name}</option>)}
                        </select>
                        {batchForm.formState.errors.program_id && <p className="error-msg">{batchForm.formState.errors.program_id.message}</p>}
                    </div>
                </form>
            </Modal>

            <ConfirmModal
                isOpen={!!deleteBatch}
                onClose={() => setDeleteBatch(null)}
                onConfirm={handleDeleteBatch}
                title="Delete Batch"
                message={`Delete batch "${deleteBatch?.name}"? All sections inside will also be removed.`}
                isLoading={savingBatch}
            />

            <BulkImportModal
                isOpen={batchImportOpen}
                onClose={() => setBatchImportOpen(false)}
                resourceName="Batches"
                headers={['Name', 'Code', 'Year', 'ProgramCode']}
                onImport={(f) => batchService.bulkImport(f)}
                onSuccess={load}
            />

            {/* ── Section Modals ─────────────────────────────────────────────── */}
            <Modal isOpen={sectionModalOpen} onClose={() => setSectionModalOpen(false)}
                title={editSection ? 'Edit Section' : 'New Section'}
                footer={
                    <>
                        <button className="btn btn-secondary" onClick={() => setSectionModalOpen(false)} disabled={savingSection}>Cancel</button>
                        <button className="btn btn-primary" form="section-form" type="submit" disabled={savingSection}>
                            {savingSection ? <span className="spinner" style={{ width: '1rem', height: '1rem' }} /> : null}
                            {editSection ? 'Save Changes' : 'Create'}
                        </button>
                    </>
                }
            >
                <form id="section-form" onSubmit={sectionForm.handleSubmit(onSectionSubmit as any)} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div className="form-group">
                        <label className="label">Section Name</label>
                        <input {...sectionForm.register('name')} className={`input ${sectionForm.formState.errors.name ? 'input-error' : ''}`} placeholder="e.g. Section A" />
                        {sectionForm.formState.errors.name && <p className="error-msg">{sectionForm.formState.errors.name.message}</p>}
                    </div>
                    <div className="form-group">
                        <label className="label">Student Count</label>
                        <input {...sectionForm.register('student_count')} type="number" className={`input ${sectionForm.formState.errors.student_count ? 'input-error' : ''}`} placeholder="40" min={1} />
                        {sectionForm.formState.errors.student_count && <p className="error-msg">{sectionForm.formState.errors.student_count.message}</p>}
                    </div>
                    <div className="form-group">
                        <label className="label">Batch</label>
                        <select {...sectionForm.register('batch_id')} className={`input select ${sectionForm.formState.errors.batch_id ? 'input-error' : ''}`}>
                            <option value={0}>Select batch...</option>
                            {batches.map(b => <option key={b.id} value={b.id}>[{b.code}] {b.name} ({b.academic_year})</option>)}
                        </select>
                        {sectionForm.formState.errors.batch_id && <p className="error-msg">{sectionForm.formState.errors.batch_id.message}</p>}
                    </div>
                </form>
            </Modal>

            <ConfirmModal
                isOpen={!!deleteSection}
                onClose={() => setDeleteSection(null)}
                onConfirm={handleDeleteSection}
                title="Delete Section"
                message={`Delete section "${deleteSection?.name}"?`}
                isLoading={savingSection}
            />

            <BulkImportModal
                isOpen={sectionImportOpen}
                onClose={() => setSectionImportOpen(false)}
                resourceName="Sections"
                headers={['Name', 'Count', 'BatchCode']}
                onImport={(f) => sectionService.bulkImport(f)}
                onSuccess={load}
            />
        </div>
    )
}
