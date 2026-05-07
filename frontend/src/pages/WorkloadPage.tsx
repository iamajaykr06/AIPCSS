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

import React, { useEffect, useState, useMemo, useCallback } from 'react'
import { Check, ClipboardList, Search, User, UserPlus, X, GraduationCap as BatchIcon, Filter, ArrowLeft, Upload,RefreshCw, BarChart3, LayoutGrid, Plus, BookOpen } from 'lucide-react'
import { DataTable } from '@/components/common/DataTable'
import { sectionService, workloadService, departmentService, teacherService, batchService } from '@/services/resources.service'
import { useTable } from '@/hooks/useTable'
import { useToast } from '@/context/useToast'
import { PageLoader } from '@/components/ui/Loading'
import { BulkImportModal } from '@/components/common/BulkImportModal'
import type { Section, Department, Teacher } from '@/types'

interface WorkloadItem {
    course_id: number;
    course_code: string;
    course_name: string;
    course_type: string;
    teacher_id: number | null;
    teacher_name: string | null;
    workload_id: number | null;
    qualified_teachers: {
        id: number;
        name: string;
        email: string;
    }[];
}

interface SectionWorkloadResponse {
    section_id: number;
    section_name: string;
    batch_name: string;
    current_semester?: number;
    courses: WorkloadItem[];
}

export function WorkloadPage() {
    const { toast } = useToast()

    // Data states
    const [sections, setSections] = useState<Section[]>([])
    const [departments, setDepartments] = useState<Department[]>([])
    const [allTeachers, setAllTeachers] = useState<Teacher[]>([])

    // UI states
    const [selectedDeptId, setSelectedDeptId] = useState<number | 'all'>('all')
    const [selectedSectionId, setSelectedSectionId] = useState<number | null>(null)
    const [workloadData, setWorkloadData] = useState<SectionWorkloadResponse | null>(null)
    const [viewMode, setViewMode] = useState<'selection' | 'mapping'>('selection')

    const [loading, setLoading] = useState(true)
    const [loadingWorkload, setLoadingWorkload] = useState(false)
    const [searchQuery, setSearchQuery] = useState('')
    const [importModalOpen, setImportModalOpen] = useState(false)
    const [activeTab, setActiveTab] = useState<'sections' | 'summary'>('sections')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [summaryData, setSummaryData] = useState<any[]>([])
    const [loadingSummary, setLoadingSummary] = useState(false)
    const [quickAddOpen, setQuickAddOpen] = useState(false)
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const summaryTable = useTable({ data: summaryData as any, searchFields: ['teacher_name', 'teacher_email'] as any, defaultSortKey: 'teacher_name' })

    // Manual Add State
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [allBatches, setAllBatches] = useState<any[]>([])
    const [selectedBatchId, setSelectedBatchId] = useState<number | ''>('')
    const [selectedSectionIdManual, setSelectedSectionIdManual] = useState<number | ''>('')
    const [selectedCourseIdManual, setSelectedCourseIdManual] = useState<number | ''>('')
    const [selectedTeacherIdManual, setSelectedTeacherIdManual] = useState<number | ''>('')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [availableCourses, setAvailableCourses] = useState<any[]>([])
    const [submitting, setSubmitting] = useState(false)

    // ── Load initial data ──────────────────────────────────────────────────────
    const loadResources = useCallback(async () => {
        setLoading(true)
        try {
            const [secsRes, deptsRes, teachersRes, batchesRes] = await Promise.all([
                sectionService.list(),
                departmentService.list(),
                teacherService.list(),
                batchService.list()
            ])
            setSections(secsRes.data)
            setDepartments(deptsRes.data)
            setAllTeachers(teachersRes.data)
            setAllBatches(batchesRes.data)
        } catch {
            toast('error', 'Failed to load resources')
        } finally {
            setLoading(false)
        }
    }, [toast])

    useEffect(() => {
        loadResources()
    }, [loadResources])

    const loadSummary = useCallback(async () => {
        setLoadingSummary(true)
        try {
            const data = await workloadService.getSummary()
            setSummaryData(data)
        } catch {
            toast('error', 'Failed to load workload summary')
        } finally {
            setLoadingSummary(false)
        }
    }, [toast])

    useEffect(() => {
        if (activeTab === 'summary') {
            loadSummary()
        }
    }, [activeTab, loadSummary])

    // ── Load workload for selected section ─────────────────────────────────────
    useEffect(() => {
        if (!selectedSectionId) {
            setWorkloadData(null)
            setViewMode('selection')
            return
        }

        async function fetchWorkload() {
            setLoadingWorkload(true)
            try {
                const data = await workloadService.getSectionWorkload(selectedSectionId!)
                setWorkloadData(data)
                setViewMode('mapping')
            } catch {
                toast('error', 'Failed to fetch workload assignments')
            } finally {
                setLoadingWorkload(false)
            }
        }
        fetchWorkload()
    }, [selectedSectionId, toast])

    // ── Filtered sections ──────────────────────────────────────────────────────
    const filteredSections = useMemo(() => {
        const query = searchQuery.toLowerCase()
        return sections.filter(s => {
            const matchesSearch = s.name.toLowerCase().includes(query) ||
                (s.batch_name?.toLowerCase().includes(query)) ||
                (s.program_name?.toLowerCase().includes(query));

            const matchesDept = selectedDeptId === 'all' || s.department_id === selectedDeptId;

            return matchesSearch && matchesDept;
        })
    }, [sections, searchQuery, selectedDeptId])

    useEffect(() => {
        if (!selectedBatchId || !selectedSectionIdManual) {
            setAvailableCourses([])
            return
        }
        async function fetchBatchCourses() {
            try {
                const res = await workloadService.getSectionWorkload(selectedSectionIdManual as number)
                setAvailableCourses(res.courses)
            } catch {
                toast('error', 'Failed to fetch courses for this section')
            }
        }
        fetchBatchCourses()
    }, [selectedBatchId, selectedSectionIdManual, toast])

    // ── Handlers ───────────────────────────────────────────────────────────────
    const handleManualAdd = async () => {
        if (!selectedSectionIdManual || !selectedCourseIdManual || !selectedTeacherIdManual) {
            toast('error', 'Please select all fields')
            return
        }
        setSubmitting(true)
        try {
            await workloadService.assign(
                selectedSectionIdManual as number,
                selectedCourseIdManual as number,
                selectedTeacherIdManual as number
            )
            toast('success', 'Workload added successfully')
            setQuickAddOpen(false)
            // Reset
            setSelectedBatchId('')
            setSelectedSectionIdManual('')
            setSelectedCourseIdManual('')
            setSelectedTeacherIdManual('')
            loadResources()
            if (activeTab === 'summary') loadSummary()
        } catch {
            toast('error', 'Failed to add workload')
        } finally {
            setSubmitting(false)
        }
    }
    const handleAssign = async (courseId: number, teacherId: number) => {
        if (!selectedSectionId) return
        try {
            await workloadService.assign(selectedSectionId, courseId, teacherId)
            toast('success', 'Teacher assigned successfully')
            // Refresh local data
            const data = await workloadService.getSectionWorkload(selectedSectionId)
            setWorkloadData(data)
        } catch {
            toast('error', 'Assignment failed')
        }
    }

    const handleUnassign = async (courseId: number) => {
        if (!selectedSectionId) return
        try {
            await workloadService.unassign(selectedSectionId, courseId)
            toast('success', 'Assignment removed')
            // Refresh
            const data = await workloadService.getSectionWorkload(selectedSectionId)
            setWorkloadData(data)
        } catch {
            toast('error', 'Failed to remove assignment')
        }
    }


    if (loading) return <PageLoader />

    return (
        <div style={{ padding: '0 1rem', maxWidth: '1400px', margin: '0 auto' }}>

            {/* ── Page Title ── */}
            <div className="page-header" style={{ marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flex: 1 }}>
                    {viewMode === 'mapping' && (
                        <button
                            className="btn btn-ghost btn-icon"
                            onClick={() => setSelectedSectionId(null)}
                            style={{ borderRadius: '50%', background: 'var(--bg-card)', border: '1px solid var(--border)' }}
                        >
                            <ArrowLeft size={20} />
                        </button>
                    )}
                    <div>
                        <h1 className="page-title">Workload Allocation</h1>
                        <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                            {viewMode === 'mapping' ? 'Assign instructors to courses' : 'Manage faculty teaching assignments'}
                        </p>
                    </div>
                </div>

                {viewMode === 'selection' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem' }}>
                        <button className="btn btn-secondary" onClick={() => setImportModalOpen(true)}>
                            <Upload size={14} /> Bulk Import
                        </button>
                        <button className="btn btn-primary" onClick={() => setQuickAddOpen(true)}>
                            <Plus size={16} /> Add Workload
                        </button>
                    </div>
                )}
            </div>

            {/* ── Tab Switcher (Only in Selection Mode) ── */}
            {viewMode === 'selection' && (
                <div className="tabs" style={{ marginBottom: '2rem', borderBottom: '1px solid var(--border)', display: 'flex', gap: '2rem' }}>
                    <button
                        className={`tab-item ${activeTab === 'sections' ? 'active' : ''}`}
                        onClick={() => setActiveTab('sections')}
                        style={{
                            padding: '0.75rem 0.5rem',
                            fontSize: '0.9375rem',
                            fontWeight: 600,
                            color: activeTab === 'sections' ? 'var(--primary)' : 'var(--text-muted)',
                            borderBottom: activeTab === 'sections' ? '2px solid var(--primary)' : '2px solid transparent',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.625rem',
                            transition: 'all 0.2s'
                        }}
                    >
                        <LayoutGrid size={18} /> Section-wise Allocation
                    </button>
                    <button
                        className={`tab-item ${activeTab === 'summary' ? 'active' : ''}`}
                        onClick={() => setActiveTab('summary')}
                        style={{
                            padding: '0.75rem 0.5rem',
                            fontSize: '0.9375rem',
                            fontWeight: 600,
                            color: activeTab === 'summary' ? 'var(--primary)' : 'var(--text-muted)',
                            borderBottom: activeTab === 'summary' ? '2px solid var(--primary)' : '2px solid transparent',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.625rem',
                            transition: 'all 0.2s'
                        }}
                    >
                        <BarChart3 size={18} /> Teacher-wise Summary
                    </button>
                </div>
            )}

            {/* ── SELECTION MODE: Sections Grid ── */}
            {viewMode === 'selection' && activeTab === 'sections' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>

                    {/* Filters Bar */}
                    <div className="card" style={{ padding: '1.25rem', display: 'flex', flexWrap: 'wrap', gap: '1.5rem', alignItems: 'center' }}>
                        <div style={{ flex: 1, minWidth: '300px' }}>
                            <label className="label" style={{ marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <Filter size={14} /> Filter by Department
                            </label>
                            <select
                                className="input select"
                                value={selectedDeptId}
                                onChange={e => setSelectedDeptId(e.target.value === 'all' ? 'all' : parseInt(e.target.value))}
                            >
                                <option value="all">All Departments</option>
                                {departments.map(d => (
                                    <option key={d.id} value={d.id}>{d.name}</option>
                                ))}
                            </select>
                        </div>

                        <div style={{ flex: 2, minWidth: '300px' }}>
                            <label className="label" style={{ marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <Search size={14} /> Search Sections
                            </label>
                            <div className="input-group">
                                <input
                                    className="input"
                                    placeholder="Search by section name, batch, or program..."
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Sections Grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.5rem' }}>
                        {filteredSections.map(sec => (
                            <div
                                key={sec.id}
                                className="card card-hover"
                                onClick={() => setSelectedSectionId(sec.id)}
                                style={{
                                    padding: '1.5rem',
                                    cursor: 'pointer',
                                    border: '1px solid var(--border)',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '1rem',
                                    position: 'relative',
                                    overflow: 'hidden'
                                }}
                            >
                                <div style={{ position: 'absolute', top: 0, right: 0, width: '4px', height: '100%', background: 'var(--primary)' }} />

                                <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--primary)', letterSpacing: '0.05em' }}>
                                    {sec.program_name}
                                </span>

                                <div>
                                    <h3 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>{sec.name}</h3>
                                    <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>{sec.batch_name}</p>
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.5rem' }}>
                                    <div className="badge badge-gray" style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                                        <BatchIcon size={14} />
                                        Batch Code: {sec.batch_id}
                                    </div>
                                    <div className="badge badge-blue">
                                        Click to Manage
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {filteredSections.length === 0 && (
                        <div style={{ textAlign: 'center', padding: '5rem', color: 'var(--text-muted)' }}>
                            <ClipboardList size={64} style={{ opacity: 0.2, marginBottom: '1rem' }} />
                            <h3>No sections found matching your criteria</h3>
                        </div>
                    )}
                </div>
            )}

            {/* ── SELECTION MODE: Summary View ── */}
            {viewMode === 'selection' && activeTab === 'summary' && (
                <div className="card" style={{ padding: '1.5rem' }}>
                    <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h3 style={{ margin: 0, fontWeight: 700 }}>Faculty Workload Summary</h3>
                        <button className="btn btn-ghost btn-sm" onClick={loadSummary} disabled={loadingSummary}>
                            <RefreshCw size={14} className={loadingSummary ? 'animate-spin' : ''} style={{ marginRight: '0.5rem' }} /> Refresh Data
                        </button>
                    </div>

                    <DataTable
                        columns={[
                            {
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                key: 'teacher_name', label: 'Teacher', sortable: true, render: (row: any) => (
                                    <div>
                                        <div style={{ fontWeight: 600 }}>{row.teacher_name}</div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{row.teacher_email}</div>
                                    </div>
                                )
                            },
                            {
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                key: 'departments', label: 'Departments', render: (row: any) => (
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                                        {(row.departments || []).map((d: string) => <span key={d} className="badge badge-gray" style={{ fontSize: '0.7rem' }}>{d}</span>)}
                                    </div>
                                )
                            },
                            {
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                key: 'course_count', label: 'Courses', sortable: true, render: (row: any) => (
                                    <span className="badge badge-blue">{row.course_count} Courses</span>
                                )
                            },
                            {
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                key: 'total_hours', label: 'Total Hours', sortable: true, render: (row: any) => (
                                    <span className="badge badge-violet">{row.total_hours} hrs / week</span>
                                )
                            },
                            {
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                key: 'assignments', label: 'Teaching Assignments', render: (row: any) => (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                                        {(row.assignments || []).slice(0, 3).map((a: any) => (
                                            <div key={a.id} style={{ fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                <BookOpen size={12} style={{ color: 'var(--text-muted)' }} />
                                                <span style={{ fontWeight: 500 }}>{a.course_code}</span>
                                                <span style={{ color: 'var(--text-muted)' }}>({a.section_name})</span>
                                            </div>
                                        ))}
                                        {(row.assignments || []).length > 3 && (
                                            <span style={{ fontSize: '0.75rem', color: 'var(--primary)', fontWeight: 600 }}>+ {row.assignments.length - 3} more...</span>
                                        )}
                                    </div>
                                )
                            }
                        ]}
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        data={summaryTable.paginated as any}
                        search={summaryTable.search}
                        onSearch={summaryTable.setSearch}
                        page={summaryTable.page}
                        totalPages={summaryTable.totalPages}
                        onPageChange={summaryTable.setPage}
                        total={summaryTable.total}
                        sortKey={summaryTable.sortKey as string}
                        sortDir={summaryTable.sortDir}
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        onSort={(k) => summaryTable.toggleSort(k as any)}
                        emptyTitle="No workload data available"
                    />
                </div>
            )}

            {/* ── MAPPING MODE: Allocation Cards ── */}
            {viewMode === 'mapping' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

                    {/* Header Info */}
                    <div className="card" style={{ padding: '1.5rem', background: 'var(--bg-glass)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                <span className="badge badge-blue">{workloadData?.batch_name}</span>
                                {workloadData?.current_semester && (
                                    <span className="badge badge-violet">Semester {workloadData.current_semester}</span>
                                )}
                            </div>
                            <h2 style={{ fontSize: '1.75rem', fontWeight: 800 }}>Manage Workload: {workloadData?.section_name}</h2>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.5rem' }}>
                            <div className="badge badge-primary" style={{ fontSize: '0.9rem', padding: '0.5rem 1rem' }}>
                                {workloadData?.courses.filter(c => c.teacher_id).length} / {workloadData?.courses.length} Assigned
                            </div>
                            <div style={{ width: '250px', height: '8px', background: 'var(--border)', borderRadius: '4px', overflow: 'hidden' }}>
                                <div style={{
                                    width: `${((workloadData?.courses.filter(c => c.teacher_id).length || 0) / (workloadData?.courses.length || 1)) * 100}%`,
                                    height: '100%',
                                    background: 'var(--primary)',
                                    transition: 'width 0.5s ease-out'
                                }} />
                            </div>
                        </div>
                    </div>

                    {loadingWorkload ? (
                        <div style={{ padding: '5rem', textAlign: 'center' }}><span className="spinner" /></div>
                    ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))', gap: '1.5rem' }}>
                            {workloadData?.courses.map(course => (
                                <div key={course.course_id} className="card" style={{
                                    padding: '1.5rem',
                                    border: '1px solid var(--border)',
                                    background: course.teacher_id ? 'var(--bg-card)' : 'rgba(254, 243, 199, 0.2)'
                                }}>

                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
                                        <div>
                                            <span className="badge badge-gray" style={{ marginBottom: '0.75rem' }}>{course.course_code}</span>
                                            <h3 style={{ fontWeight: 700, fontSize: '1.125rem' }}>{course.course_name}</h3>
                                        </div>
                                        <span className={`badge ${course.course_type === 'Lab' ? 'badge-violet' : 'badge-amber'}`}>
                                            {course.course_type}
                                        </span>
                                    </div>

                                    <div style={{ background: 'var(--bg-light)', padding: '1.25rem', borderRadius: '1rem', border: '1px solid var(--border)' }}>
                                        <label className="label" style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)' }}>
                                            <User size={14} /> Assign Instructor (Global List)
                                        </label>
                                        <div style={{ display: 'flex', gap: '0.75rem' }}>
                                            <select
                                                className="input select"
                                                value={course.teacher_id || ''}
                                                onChange={e => {
                                                    const tid = parseInt(e.target.value)
                                                    if (tid) handleAssign(course.course_id, tid)
                                                }}
                                                style={{ flex: 1, fontWeight: 500 }}
                                            >
                                                <option value="">Choose Instructor...</option>
                                                {/* Group Teachers by Department for cross-dept awareness */}
                                                {departments.map(dept => (
                                                    <optgroup key={dept.id} label={`${dept.name} Faculty`}>
                                                        {allTeachers
                                                            .filter(t => t.departments.some(td => td.id === dept.id))
                                                            .map(t => (
                                                                <option key={t.id} value={t.id}>
                                                                    {t.name}
                                                                </option>
                                                            ))
                                                        }
                                                    </optgroup>
                                                ))}
                                            </select>
                                            {course.teacher_id && (
                                                <button
                                                    className="btn btn-ghost btn-icon"
                                                    style={{ color: '#ef4444', background: 'rgba(239, 68, 68, 0.1)' }}
                                                    onClick={() => handleUnassign(course.course_id)}
                                                >
                                                    <X size={18} />
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    <div style={{ marginTop: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                        {course.teacher_id ? (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', color: 'var(--primary)', fontSize: '0.875rem', fontWeight: 700 }}>
                                                <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                    <Check size={16} />
                                                </div>
                                                Allocation Complete
                                            </div>
                                        ) : (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', color: '#d97706', fontSize: '0.875rem', fontWeight: 700 }}>
                                                <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'rgba(254, 243, 199, 0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                    <UserPlus size={16} />
                                                </div>
                                                Pending Selection
                                            </div>
                                        )}

                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            <BulkImportModal
                isOpen={importModalOpen}
                onClose={() => setImportModalOpen(false)}
                resourceName="Workload Assignments"
                headers={['BatchName', 'SectionName', 'CourseCode', 'TeacherEmail']}
                formatExamples={{
                    'BatchName': 'Batch 2024-28',
                    'SectionName': 'A',
                    'CourseCode': 'CS101',
                    'TeacherEmail': 'john.doe@university.edu'
                }}
                onImport={(f) => workloadService.bulkImport(f)}
                onSuccess={loadResources}
            />

            {/* ── Quick Add Modal ── */}
            {quickAddOpen && (
                <div className="modal-overlay">
                    <div className="modal-content" style={{ maxWidth: '500px' }}>
                        <div className="modal-header">
                            <h2 className="modal-title">Add Workload Assignment</h2>
                            <button className="btn-icon" onClick={() => setQuickAddOpen(false)}><X size={20} /></button>
                        </div>

                        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                            <div>
                                <label className="label">Select Batch</label>
                                <select className="input select" value={selectedBatchId} onChange={e => {
                                    setSelectedBatchId(e.target.value ? parseInt(e.target.value) : '')
                                    setSelectedSectionIdManual('')
                                    setSelectedCourseIdManual('')
                                }}>
                                    <option value="">Choose Batch...</option>
                                    {allBatches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                                </select>
                            </div>

                            {selectedBatchId && (
                                <div>
                                    <label className="label">Select Section</label>
                                    <select className="input select" value={selectedSectionIdManual} onChange={e => {
                                        setSelectedSectionIdManual(e.target.value ? parseInt(e.target.value) : '')
                                        setSelectedCourseIdManual('')
                                    }}>
                                        <option value="">Choose Section...</option>
                                        {sections.filter(s => s.batch_id === selectedBatchId).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                    </select>
                                </div>
                            )}

                            {selectedSectionIdManual && (
                                <div>
                                    <label className="label">Select Course</label>
                                    <select className="input select" value={selectedCourseIdManual} onChange={e => setSelectedCourseIdManual(e.target.value ? parseInt(e.target.value) : '')}>
                                        <option value="">Choose Course...</option>
                                        {availableCourses.map(c => <option key={c.course_id} value={c.course_id}>{c.course_code} - {c.course_name}</option>)}
                                    </select>
                                </div>
                            )}

                            <div>
                                <label className="label">Select Faculty</label>
                                <select className="input select" value={selectedTeacherIdManual} onChange={e => setSelectedTeacherIdManual(e.target.value ? parseInt(e.target.value) : '')}>
                                    <option value="">Choose Teacher...</option>
                                    {allTeachers.map(t => <option key={t.id} value={t.id}>{t.name} ({t.email})</option>)}
                                </select>
                            </div>
                        </div>

                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={() => setQuickAddOpen(false)}>Cancel</button>
                            <button className="btn btn-primary" onClick={handleManualAdd} disabled={submitting}>
                                {submitting ? 'Saving...' : 'Save Assignment'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
