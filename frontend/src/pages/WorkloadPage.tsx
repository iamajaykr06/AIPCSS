import React, { useEffect, useState, useMemo } from 'react'
import { Check, ClipboardList, Search, User, UserPlus, X, GraduationCap as BatchIcon, Filter, ArrowLeft, Upload, Zap, RefreshCw } from 'lucide-react'
import { sectionService, workloadService, departmentService, teacherService } from '@/services/resources.service'
import { useToast } from '@/context/useToast'
import { PageLoader, ErrorState } from '@/components/ui/Loading'
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

    // ── Load initial data ──────────────────────────────────────────────────────
    async function loadResources() {
        setLoading(true)
        try {
            const [secsRes, deptsRes, teachersRes] = await Promise.all([
                sectionService.list(),
                departmentService.list(),
                teacherService.list()
            ])
            setSections(secsRes.data)
            setDepartments(deptsRes.data)
            setAllTeachers(teachersRes.data)
        } catch (err) {
            toast('error', 'Failed to load resources')
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        loadResources()
    }, [])

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
            } catch (err) {
                toast('error', 'Failed to fetch workload assignments')
            } finally {
                setLoadingWorkload(false)
            }
        }
        fetchWorkload()
    }, [selectedSectionId])

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

    // ── Handlers ───────────────────────────────────────────────────────────────
    const handleAssign = async (courseId: number, teacherId: number) => {
        if (!selectedSectionId) return
        try {
            await workloadService.assign(selectedSectionId, courseId, teacherId)
            toast('success', 'Teacher assigned successfully')
            // Refresh local data
            const data = await workloadService.getSectionWorkload(selectedSectionId)
            setWorkloadData(data)
        } catch (err) {
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
        } catch (err) {
            toast('error', 'Failed to remove assignment')
        }
    }

    const handleAutoAssign = async () => {
        if (!window.confirm("Auto-assign teachers for ALL batches & sections? (Only unassigned courses will be affected)")) return
        setLoading(true)
        try {
            const res = await workloadService.autoAssignAll()
            toast('success', res.message)
            await loadResources()
        } catch (err) {
            toast('error', 'Auto-assignment failed')
        } finally {
            setLoading(false)
        }
    }

    const handleRebalance = async () => {
        if (!window.confirm("🛑 CRITICAL ACTION: This will DELETE ALL current assignments (including those from Bulk Import!) and recreate them evenly across all faculty to solve teacher-overload issues. Is this what you want?")) return
        setLoading(true)
        try {
            const res = await workloadService.rebalanceAll()
            toast('success', res.message || 'Workload rebalanced successfully')
            await loadResources()
        } catch (err) {
            toast('error', 'Rebalance failed')
        } finally {
            setLoading(false)
        }
    }

    if (loading) return <PageLoader />

    return (
        <div style={{ padding: '0 1rem', maxWidth: '1400px', margin: '0 auto' }}>
            
            {/* ── Page Title ── */}
            <div className="page-header" style={{ marginBottom: '2rem' }}>
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
                            Assign instructors to courses for class sections
                        </p>
                    </div>
                </div>
                {viewMode === 'selection' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem' }}>
                        <button 
                            className="btn" 
                            onClick={handleRebalance}
                            title="RESET & OPTIMIZE: This will clear all 582 current assignments and re-assign them across all sections evenly to solve teacher-overload issues."
                            style={{ 
                                background: 'linear-gradient(135deg, #f97316 0%, #dc2626 100%)', 
                                color: 'white',
                                border: 'none',
                                fontWeight: 700,
                                boxShadow: '0 4px 12px rgba(220, 38, 38, 0.3)',
                                padding: '0.75rem 1.25rem',
                                borderRadius: '10px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                transition: 'transform 0.2s ease'
                            }}
                            onMouseOver={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
                            onMouseOut={(e) => e.currentTarget.style.transform = 'scale(1)'}
                        >
                            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} /> 
                            <span>Smart Rebalance (Reset All)</span>
                        </button>
                        <button 
                            className="btn" 
                            onClick={handleAutoAssign}
                            style={{ 
                                background: 'linear-gradient(135deg, #f59e0b 0%, #ea580c 100%)', 
                                color: 'white',
                                border: 'none',
                                fontWeight: 700,
                                boxShadow: '0 4px 14px 0 rgba(234, 88, 12, 0.3)'
                            }}
                        >
                            <Zap size={14} fill="white" /> Auto-Assign All
                        </button>
                        <button className="btn btn-secondary" onClick={() => setImportModalOpen(true)}>
                            <Upload size={14} /> Bulk Import Assignments
                        </button>
                    </div>
                )}
            </div>

            {/* ── SELECTION MODE: Grid of Sections ── */}
            {viewMode === 'selection' && (
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

            {/* ── MAPPING MODE: Allocation Cards ── */}
            {viewMode === 'mapping' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    
                    {/* Header Info */}
                    <div className="card" style={{ padding: '1.5rem', background: 'var(--bg-glass)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <span className="badge badge-blue" style={{ marginBottom: '0.5rem' }}>{workloadData?.batch_name}</span>
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
                                        
                                        {/* Qualification Warning if relevant */}
                                        {course.teacher_id && !course.qualified_teachers.some(qt => qt.id === course.teacher_id) && (
                                            <div className="badge badge-amber" style={{ fontSize: '0.7rem' }}>
                                                Cross-Dept / Non-Qual
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
        </div>
    )
}
