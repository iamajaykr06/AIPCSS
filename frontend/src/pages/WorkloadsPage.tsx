import React, { useEffect, useState } from 'react'
import { Plus, Trash2, UserPlus, BookOpen, Users, Building2 } from 'lucide-react'
import { schedulingService } from '@/services/scheduling.service'
import { teacherService, courseService, sectionService, departmentService } from '@/services/resources.service'
import { useToast } from '@/context/ToastContext'
import { useTable } from '@/hooks/useTable'
import { DataTable } from '@/components/common/DataTable'
import { Modal, ConfirmModal } from '@/components/ui/Modal'
import { PageLoader, ErrorState, Spinner } from '@/components/ui/Loading'
import { getErrorMessage } from '@/lib/utils'
import type { Workload, Teacher, Course, Section, Department } from '@/types'

export function WorkloadsPage() {
    const [workloads, setWorkloads] = useState<Workload[]>([])
    const [teachers, setTeachers] = useState<Teacher[]>([])
    const [courses, setCourses] = useState<Course[]>([])
    const [sections, setSections] = useState<Section[]>([])
    const [departments, setDepartments] = useState<Department[]>([])

    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    const [modalOpen, setModalOpen] = useState(false)
    const [deleteItem, setDeleteItem] = useState<Workload | null>(null)
    const [saving, setSaving] = useState(false)

    // Form state
    const [selectedTeacher, setSelectedTeacher] = useState<string>('')
    const [selectedCourse, setSelectedCourse] = useState<string>('')
    const [selectedSection, setSelectedSection] = useState<string>('')
    const [selectedDept, setSelectedDept] = useState<string>('')
    const [sessionDuration, setSessionDuration] = useState<number>(1)

    const { toast } = useToast()

    async function loadData() {
        try {
            setError(null)
            const [w, t, c, s, d] = await Promise.all([
                schedulingService.getWorkloads(),
                teacherService.list(undefined, 1, 500),
                courseService.list(undefined, 1, 500),
                sectionService.list(undefined, 1, 500),
                departmentService.list(1, 100)
            ])
            setWorkloads(w.data)
            setTeachers(t.data)
            setCourses(c.data)
            setSections(s.data)
            setDepartments(d.data)
        } catch (err) {
            setError(getErrorMessage(err))
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => { loadData() }, [])

    const table = useTable({
        data: workloads as any,
        searchFields: [] as any,
    })

    // Manual filtering for search
    const filteredWorkloads = workloads.filter(w => {
        const tName = w.teacher?.name?.toLowerCase() || ''
        const cName = w.course?.name?.toLowerCase() || ''
        const sName = w.section?.name?.toLowerCase() || ''
        const search = table.search.toLowerCase()
        return tName.includes(search) || cName.includes(search) || sName.includes(search)
    })

    // Group sections by batch/program for better selection
    // (In a real app, we'd filter these based on selectedDept)

    const handleAdd = async () => {
        if (!selectedTeacher || !selectedCourse || !selectedSection) {
            toast('error', 'Missing fields', 'Please select a teacher, course, and section.')
            return
        }

        setSaving(true)
        try {
            await schedulingService.createWorkload({
                teacher_id: parseInt(selectedTeacher),
                course_id: parseInt(selectedCourse),
                section_id: parseInt(selectedSection),
                hours_per_week: 3,
                session_duration: sessionDuration
            })
            toast('success', 'Workload assigned')
            setModalOpen(false)
            loadData()
            // Reset form
            setSelectedTeacher('')
            setSelectedCourse('')
            setSelectedSection('')
        } catch (err) {
            toast('error', 'Failed to assign', getErrorMessage(err))
        } finally {
            setSaving(false)
        }
    }

    const handleDelete = async () => {
        if (!deleteItem) return
        setSaving(true)
        try {
            await schedulingService.deleteWorkload(deleteItem.id)
            toast('success', 'Workload removed')
            setDeleteItem(null)
            loadData()
        } catch (err) {
            toast('error', 'Failed to remove', getErrorMessage(err))
        } finally {
            setSaving(false)
        }
    }

    if (loading) return <PageLoader />
    if (error) return <ErrorState message={error} onRetry={loadData} />

    // Filter courses/teachers based on department if selected
    const displayTeachers = selectedDept
        ? teachers.filter(t => t.departments.some(d => d.id === parseInt(selectedDept)))
        : teachers

    const displayCourses = selectedDept
        ? courses.filter(c => c.department_id === parseInt(selectedDept))
        : courses

    return (
        <div>
            <div className="page-header">
                <div>
                    <h1 className="page-title">Teaching Workloads</h1>
                    <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                        Assign teachers to courses and sections to build the schedule
                    </p>
                </div>
                <button className="btn btn-primary" onClick={() => setModalOpen(true)}>
                    <Plus size={16} /> New Assignment
                </button>
            </div>

            <div className="card" style={{ padding: '1.25rem' }}>
                <DataTable
                    columns={[
                        {
                            key: 'teacher', label: 'Teacher', render: row => {
                                const w = row as unknown as Workload
                                return (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <div className="avatar" style={{ width: '1.75rem', height: '1.75rem', fontSize: '0.625rem' }}>
                                            {w.teacher?.name?.split(' ').map(n => n[0]).join('') || '?'}
                                        </div>
                                        <span style={{ fontWeight: 500 }}>{w.teacher?.name || 'Unknown'}</span>
                                    </div>
                                )
                            }
                        },
                        {
                            key: 'course', label: 'Course', render: row => {
                                const w = row as unknown as Workload
                                return (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <BookOpen size={14} style={{ color: 'var(--text-muted)' }} />
                                        <span>{w.course?.name || 'Unknown'}</span>
                                    </div>
                                )
                            }
                        },
                        {
                            key: 'section', label: 'Section', render: row => {
                                const w = row as unknown as Workload
                                return (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <Users size={14} style={{ color: 'var(--text-muted)' }} />
                                        <span className="badge badge-gray">{w.section?.name || 'Unknown'}</span>
                                    </div>
                                )
                            }
                        },
                    ]}
                    data={filteredWorkloads as any}
                    search={table.search}
                    onSearch={table.setSearch}
                    page={table.page}
                    totalPages={Math.ceil(filteredWorkloads.length / table.perPage)}
                    onPageChange={table.setPage}
                    total={filteredWorkloads.length}
                    emptyIcon={<UserPlus size={40} />}
                    emptyTitle="No workloads assigned"
                    actions={row => (
                        <button className="btn btn-ghost btn-icon btn-sm" style={{ color: '#ef4444' }}
                            onClick={() => setDeleteItem(row as unknown as Workload)}>
                            <Trash2 size={15} />
                        </button>
                    )}
                />
            </div>

            <Modal
                isOpen={modalOpen}
                onClose={() => setModalOpen(false)}
                title="Assign Teacher Workload"
                footer={
                    <>
                        <button className="btn btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button>
                        <button className="btn btn-primary" onClick={handleAdd} disabled={saving}>
                            {saving && <Spinner size={14} />}
                            Assign Workload
                        </button>
                    </>
                }
            >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    <div className="form-group">
                        <label className="label">Filter by Department (Optional)</label>
                        <select value={selectedDept} onChange={e => setSelectedDept(e.target.value)} className="input select">
                            <option value="">All Departments</option>
                            {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                        </select>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1rem' }}>
                        <div className="form-group">
                            <label className="label">Teacher</label>
                            <select value={selectedTeacher} onChange={e => setSelectedTeacher(e.target.value)} className="input select">
                                <option value="">Select a teacher...</option>
                                {displayTeachers.map(t => (
                                    <option key={t.id} value={t.id}>{t.name} ({t.email})</option>
                                ))}
                            </select>
                        </div>

                        <div className="form-group">
                            <label className="label">Course</label>
                            <select value={selectedCourse} onChange={e => setSelectedCourse(e.target.value)} className="input select">
                                <option value="">Select a course...</option>
                                {displayCourses.map(c => (
                                    <option key={c.id} value={c.id}>{c.name} ({c.code}) - {c.course_type}</option>
                                ))}
                            </select>
                        </div>

                        <div className="form-group">
                            <label className="label">Section</label>
                            <select value={selectedSection} onChange={e => setSelectedSection(e.target.value)} className="input select">
                                <option value="">Select a section...</option>
                                {sections.map(s => (
                                    <option key={s.id} value={s.id}>{s.name} (ID: {s.id})</option>
                                ))}
                            </select>
                        </div>

                        <div className="form-group">
                            <label className="label">Session Duration (H)</label>
                            <select
                                value={sessionDuration}
                                onChange={e => setSessionDuration(parseInt(e.target.value))}
                                className="input select"
                            >
                                <option value={1}>1 Hour (Standard)</option>
                                <option value={2}>2 Hour Block</option>
                                <option value={3}>3 Hour Lab Block</option>
                                <option value={4}>4 Hour Intensive</option>
                            </select>
                            <p style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                                The AI will try to find a consecutive block of time for this duration.
                            </p>
                        </div>
                    </div>

                    <div style={{ padding: '0.75rem', background: 'rgba(59,130,246,0.08)', borderRadius: '0.5rem', border: '1px solid rgba(59,130,246,0.1)' }}>
                        <p style={{ fontSize: '0.8125rem', color: '#1e40af', lineHeight: 1.5 }}>
                            <strong>Note:</strong> Timetable generation will try to place these assignments into the schedule based on teacher availability and room constraints.
                        </p>
                    </div>
                </div>
            </Modal>

            <ConfirmModal
                isOpen={!!deleteItem}
                onClose={() => setDeleteItem(null)}
                onConfirm={handleDelete}
                title="Remove Workload"
                message="This will remove the teacher's assignment for this course and section. The timetable for this specific slot will be cleared if it was generated."
                isLoading={saving}
            />
        </div>
    )
}
