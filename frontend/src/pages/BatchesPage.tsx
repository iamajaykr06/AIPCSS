/**
 * Copyright 2026 Zaid Alam, Ajay Kumar, Aboni Mohan Sahu, Rohit Kumar Yadav
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import React, { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, GraduationCap, Users, Upload } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { batchService, programService, sectionService } from '@/services/resources.service'
import { useToast } from '@/context/useToast'
import { useTable } from '@/hooks/useTable'
import { DataTable } from '@/components/common/DataTable'
import { Modal, ConfirmModal } from '@/components/ui/Modal'
import { PageLoader, ErrorState } from '@/components/ui/Loading'
import { BulkImportModal } from '@/components/common/BulkImportModal'
import { getErrorMessage } from '@/lib/utils'
import type { Batch, Program, Section } from '@/types'

// ── Batch form schema ────────────────────────────────────────────────────────
const batchSchema = z.object({
    name: z.string().min(1, 'Name is required'),
    code: z.string().min(1, 'Code is required'),
    academic_year: z.string().min(4, 'Academic year required'),
    program_id: z.coerce.number().min(1, 'Select a program'),
    current_semester: z.coerce.number().min(1).max(10).default(1),
})
type BatchFormData = z.infer<typeof batchSchema>

// ── Section form schema ──────────────────────────────────────────────────────
const sectionSchema = z.object({
    name: z.string().min(1, 'Name is required'),
    student_count: z.coerce.number().min(1, 'Must be at least 1').max(500, 'Too large'),
    batch_id: z.coerce.number().min(1, 'Select a batch'),
})
type SectionFormData = z.infer<typeof sectionSchema>

export function BatchesPage() {
    const [activeTab, setActiveTab] = useState<'batches' | 'sections'>('batches')

    return (
        <div>
            {/* Tab Bar */}
            <div style={{
                display: 'flex',
                gap: '0.25rem',
                marginBottom: '1.25rem',
                borderBottom: '2px solid var(--border)',
                paddingBottom: '0',
            }}>
                {(['batches', 'sections'] as const).map(tab => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        style={{
                            padding: '0.625rem 1.25rem',
                            border: 'none',
                            background: 'transparent',
                            cursor: 'pointer',
                            fontSize: '0.9375rem',
                            fontWeight: activeTab === tab ? 700 : 500,
                            color: activeTab === tab ? 'var(--primary)' : 'var(--text-muted)',
                            borderBottom: activeTab === tab ? '2px solid var(--primary)' : '2px solid transparent',
                            marginBottom: '-2px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            transition: 'all 0.2s ease',
                        }}
                    >
                        {tab === 'batches' ? <GraduationCap size={16} /> : <Users size={16} />}
                        {tab === 'batches' ? 'Batches' : 'Sections'}
                    </button>
                ))}
            </div>

            {activeTab === 'batches' ? <BatchesTab /> : <SectionsTab />}
        </div>
    )
}

// ══════════════════════════════════════════════════════════════════════════════
// BATCHES TAB
// ══════════════════════════════════════════════════════════════════════════════

function BatchesTab() {
    // ── data ──────────────────────────────────────────────────────────────────
    const [batches, setBatches] = useState<Batch[]>([])
    const [programs, setPrograms] = useState<Program[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const { toast } = useToast()

    // ── modal state ───────────────────────────────────────────────────────────
    const [batchModalOpen, setBatchModalOpen] = useState(false)
    const [editBatch, setEditBatch] = useState<Batch | null>(null)
    const [deleteBatch, setDeleteBatch] = useState<Batch | null>(null)
    const [batchImportOpen, setBatchImportOpen] = useState(false)
    const [savingBatch, setSavingBatch] = useState(false)

    // ── table ─────────────────────────────────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const batchTable = useTable({ data: batches as any, searchFields: ['name', 'academic_year'], defaultSortKey: 'name' })

    // ── form ──────────────────────────────────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const batchForm = useForm<BatchFormData>({ resolver: zodResolver(batchSchema) as any })


    // ── load ───────────────────────────────────────────────────────────────────
    async function load() {
        try {
            setError(null)
            const [bat, progs] = await Promise.all([
                batchService.list(),
                programService.list(),
            ])
            setBatches(bat.data)
            setPrograms(progs.data)
        } catch (err) {
            setError(getErrorMessage(err))
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => { load() }, [])

    // ── actions ────────────────────────────────────────────────────────────────
    const openCreateBatch = () => {
        setEditBatch(null)
        batchForm.reset({ name: '', code: '', academic_year: '', program_id: 0, current_semester: 1 })
        setBatchModalOpen(true)
    }
    const openEditBatch = (b: Batch) => {
        setEditBatch(b)
        batchForm.setValue('name', b.name)
        batchForm.setValue('code', b.code)
        batchForm.setValue('academic_year', b.academic_year)
        batchForm.setValue('program_id', b.program_id)
        batchForm.setValue('current_semester', b.current_semester)
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

    if (loading) return <PageLoader />
    if (error) return <ErrorState message={error} onRetry={load} />

    return (
        <div>
            {/* Page Header */}
            <div className="page-header">
                <div>
                    <h1 className="page-title">Batches</h1>
                    <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                        Manage academic year batches
                    </p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <button className="btn btn-secondary" onClick={() => setBatchImportOpen(true)}>
                        <Upload size={14} /> Bulk Import
                    </button>
                    <button className="btn btn-primary" onClick={openCreateBatch}>
                        <Plus size={16} /> Add Batch
                    </button>
                </div>
            </div>

            {/* Batches Table */}
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
                        {
                            key: 'current_semester', label: 'Semester', sortable: true, render: row => {
                                const sem = row.current_semester ?? (row as any).currentSemester;
                                return (
                                    <span className="badge badge-violet">
                                        {sem !== undefined && sem !== null ? String(sem) : '—'}
                                    </span>
                                );
                            }
                        },
                    ]}
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

            {/* ── Batch Modal ────────────────────────────────────────────────── */}
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
                <form id="batch-form" onSubmit={batchForm.handleSubmit(onBatchSubmit as (data: BatchFormData) => Promise<void>)} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
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
                    <div className="form-group">
                        <label className="label">Current Semester</label>
                        <input {...batchForm.register('current_semester')} type="number" min={1} max={10} className={`input ${batchForm.formState.errors.current_semester ? 'input-error' : ''}`} placeholder="e.g. 1" />
                        {batchForm.formState.errors.current_semester && <p className="error-msg">{batchForm.formState.errors.current_semester.message}</p>}
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
                headers={['Name', 'Code', 'AcademicYear', 'ProgramCode', 'CurrentSemester']}
                formatExamples={{
                    'Name': 'B.Tech Mining-2024',
                    'Code': 'B24',
                    'AcademicYear': '2024-2028',
                    'ProgramCode': 'BT-MINING',
                    'CurrentSemester': '1'
                }}
                onImport={(f) => batchService.bulkImport(f)}
                onSuccess={load}
            />
        </div>
    )
}

// ══════════════════════════════════════════════════════════════════════════════
// SECTIONS TAB
// ══════════════════════════════════════════════════════════════════════════════

function SectionsTab() {
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const table = useTable({ data: sections as any, searchFields: ['name'], defaultSortKey: 'name' })
    const { register, handleSubmit, reset, formState: { errors }, setValue } = useForm<SectionFormData>({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        resolver: zodResolver(sectionSchema) as any,
    })

    async function load() {
        try {
            setError(null)
            const [secs, bats, progs] = await Promise.all([
                sectionService.list(undefined, 1, 500),
                batchService.list(undefined, 1, 500),
                programService.list(undefined, 1, 500),
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

    const onSubmit = async (data: SectionFormData) => {
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
            {/* Page Header */}
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

            {/* Sections Table */}
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
                        {
                            key: 'semester', label: 'Semester', render: row => {
                                const batch = batchMap[row.batch_id as number];
                                const sem = batch?.current_semester ?? (batch as any)?.currentSemester;
                                return <span className="badge badge-violet">{sem !== undefined && sem !== null ? String(sem) : '—'}</span>;
                            }
                        },
                    ]}
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

            {/* Section Modal */}
            <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)}
                title={editItem ? 'Edit Section' : 'New Section'}
                footer={
                    <>
                        <button className="btn btn-secondary" onClick={() => setModalOpen(false)} disabled={saving}>Cancel</button>
                        <button className="btn btn-primary" form="section-form-inline" type="submit" disabled={saving}>
                            {saving ? <span className="spinner" style={{ width: '1rem', height: '1rem' }} /> : null}
                            {editItem ? 'Save Changes' : 'Create'}
                        </button>
                    </>
                }
            >
                <form id="section-form-inline" onSubmit={handleSubmit(onSubmit as (data: SectionFormData) => Promise<void>)} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
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
