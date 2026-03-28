import React, { useEffect, useState, useMemo, useCallback } from 'react'
import { Calendar, Play, Download, Search, Info, CheckCircle2, AlertCircle, MapPin, User, BookOpen, Trash2, Plus, GripVertical, Zap } from 'lucide-react'
import { DndContext, DragOverlay, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent, DragStartEvent } from '@dnd-kit/core'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { restrictToFirstScrollableAncestor } from '@dnd-kit/modifiers'
import { schedulingService } from '@/services/scheduling.service'
import { departmentService, teacherService, roomService, courseService, sectionService, programService, batchService } from '@/services/resources.service'
import { useToast } from '@/context/ToastContext'
import { PageLoader, Spinner, EmptyState } from '@/components/ui/Loading'
import { Modal } from '@/components/ui/Modal'
import { getErrorMessage, DAYS, SLOTS } from '@/lib/utils'
import type { TimetableEntry, Department, Teacher, Room, Course, Section, Batch, GenerateScheduleResult } from '@/types'
import { io } from 'socket.io-client'

interface TimetableReadiness {
    sections: Section[]
    courses: Course[]
    rooms: Room[]
    teachers: Teacher[]
    qualifiedTeacherCount: number
    labCoursesCount: number
    labRoomsCount: number
    blockers: string[]
    warnings: string[]
}

const emptyReadiness: TimetableReadiness = {
    sections: [],
    courses: [],
    rooms: [],
    teachers: [],
    qualifiedTeacherCount: 0,
    labCoursesCount: 0,
    labRoomsCount: 0,
    blockers: [],
    warnings: [],
}

export function TimetablePage() {
    const [departments, setDepartments] = useState<Department[]>([])
    const [genProgress, setGenProgress] = useState<number>(0)
    const [genStatus, setGenStatus] = useState<string>('')
    const [selectedDeptId, setSelectedDeptId] = useState<number | null>(null)
    const [timetable, setTimetable] = useState<TimetableEntry[]>([])
    const [loading, setLoading] = useState(true)
    const [generating, setGenerating] = useState(false)
    const [viewType, setViewType] = useState<'Grid' | 'List'>('Grid')
    const [filterType, setFilterType] = useState<'All' | 'Teacher' | 'Room'>('All')
    const [filterId, setFilterId] = useState<number | null>(null)
    const [entryModalOpen, setEntryModalOpen] = useState(false)
    const [selectedSlot, setSelectedSlot] = useState<{ day: string, slot: string } | null>(null)
    const [teachers, setTeachers] = useState<Teacher[]>([])
    const [rooms, setRooms] = useState<Room[]>([])
    const [courses, setCourses] = useState<Course[]>([])
    const [sections, setSections] = useState<Section[]>([])
    const [saving, setSaving] = useState(false)
    const [searchQuery, setSearchQuery] = useState('')
    const [resolutionModalOpen, setResolutionModalOpen] = useState(false)
    const [strictMode, setStrictMode] = useState(false)
    const [suggestingEntry, setSuggestingEntry] = useState<TimetableEntry | null>(null)
    const [readinessLoading, setReadinessLoading] = useState(false)
    const [readiness, setReadiness] = useState<TimetableReadiness>(emptyReadiness)
    const [generationResult, setGenerationResult] = useState<GenerateScheduleResult | null>(null)

    // Form state for manual entry
    const [formData, setFormData] = useState({
        teacher_id: '',
        room_id: '',
        course_id: '',
        section_id: ''
    })

    const { toast } = useToast()

    // Sensors for DND
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
        useSensor(KeyboardSensor)
    )

    const [activeId, setActiveId] = useState<number | null>(null)

    useEffect(() => {
        async function fetchDepts() {
            try {
                const res = await departmentService.list(1, 100)
                const depts = res.data || []
                setDepartments(depts)
                if (depts.length > 0) {
                    setSelectedDeptId(depts[0].id)
                }
            } catch (err) {
                toast('error', 'Failed to load departments', getErrorMessage(err))
            } finally {
                setLoading(false)
            }
        }
        fetchDepts()
    }, [toast])

    const fetchTimetable = useCallback(async (deptId: number) => {
        setLoading(true)
        try {
            const res = await schedulingService.viewTimetable(deptId)
            setTimetable(res.data || [])
        } catch {
            // Don't toast 404s, just show empty state
            setTimetable([])
        } finally {
            setLoading(false)
        }
    }, [])

    const loadDepartmentSections = useCallback(async (deptId: number): Promise<Section[]> => {
        const programRes = await programService.list(deptId, 1, 500)
        const programs = programRes.data || []
        if (programs.length === 0) return []

        const batchResults = await Promise.all(
            programs.map(program => batchService.list(program.id, 1, 500))
        )
        const batches = batchResults.flatMap(result => result.data || [])
        if (batches.length === 0) return []

        const sectionResults = await Promise.all(
            batches.map((batch: Batch) => sectionService.list(batch.id, 1, 500))
        )

        return sectionResults.flatMap(result => result.data || [])
    }, [])

    const loadReadiness = useCallback(async (deptId: number): Promise<TimetableReadiness> => {
        setReadinessLoading(true)
        try {
            const [sectionData, courseRes, roomRes, teacherRes] = await Promise.all([
                loadDepartmentSections(deptId),
                courseService.list(deptId, 1, 500),
                roomService.list(undefined, 1, 500),
                teacherService.list(undefined, 1, 500),
            ])

            const deptCourses = courseRes.data || []
            const deptRooms = (roomRes.data || []).filter(room => !room.department_id || room.department_id === deptId)
            const allTeachers = teacherRes.data || []
            const deptCourseIds = new Set(deptCourses.map(course => course.id))
            const qualifiedTeacherCount = allTeachers.filter(teacher =>
                teacher.qualified_courses?.some(course => deptCourseIds.has(course.id))
            ).length
            const labCoursesCount = deptCourses.filter(course => course.course_type === 'Lab').length
            const labRoomsCount = deptRooms.filter(room => room.room_type.toLowerCase().includes('lab')).length

            const blockers: string[] = []
            const warnings: string[] = []

            if (sectionData.length === 0) blockers.push('No sections found for this department.')
            if (deptCourses.length === 0) blockers.push('No courses found for this department.')
            if (deptRooms.length === 0) blockers.push('No rooms are available for this department.')
            if (allTeachers.length === 0) blockers.push('No teachers are available in the system.')

            if (allTeachers.length > 0 && qualifiedTeacherCount === 0) {
                warnings.push('No teacher is qualified for the department courses yet. Strict mode will fail.')
            }
            if (labCoursesCount > 0 && labRoomsCount === 0) {
                warnings.push('Lab courses exist, but no lab rooms are available for this department.')
            }

            const nextReadiness = {
                sections: sectionData,
                courses: deptCourses,
                rooms: deptRooms,
                teachers: allTeachers,
                qualifiedTeacherCount,
                labCoursesCount,
                labRoomsCount,
                blockers,
                warnings,
            }

            setReadiness(nextReadiness)
            return nextReadiness
        } catch (err) {
            const fallback = {
                ...emptyReadiness,
                blockers: ['Could not load timetable readiness data.'],
            }
            setReadiness(fallback)
            toast('error', 'Failed to inspect scheduling readiness', getErrorMessage(err))
            return fallback
        } finally {
            setReadinessLoading(false)
        }
    }, [loadDepartmentSections, toast])

    useEffect(() => {
        if (selectedDeptId) {
            setGenerationResult(null)
            setFormData({ teacher_id: '', room_id: '', course_id: '', section_id: '' })
            fetchTimetable(selectedDeptId)
            loadReadiness(selectedDeptId)
        } else {
            setReadiness(emptyReadiness)
        }
    }, [fetchTimetable, loadReadiness, selectedDeptId])

    useEffect(() => {
        const socket = io('/', { path: '/socket.io' })

        socket.on('generation_progress', (data: { percentage: number, current_section: string, status: string }) => {
            setGenProgress(data.percentage)
            setGenStatus(`Scheduling ${data.current_section}...`)
        })

        return () => {
            socket.off('generation_progress')
            socket.disconnect()
        }
    }, [])

    const handleGenerate = async () => {
        if (!selectedDeptId) {
            toast('error', 'No department selected', 'Please select a department first.')
            return
        }
        if (readiness.blockers.length > 0) {
            toast('error', 'Generation blocked', readiness.blockers[0])
            return
        }
        if (strictMode && readiness.qualifiedTeacherCount === 0) {
            toast('error', 'Strict mode cannot run', 'Assign at least one qualified teacher or turn off strict mode.')
            return
        }
        setGenerating(true)
        setGenProgress(0)
        setGenStatus('Initializing AI engine...')
        setGenerationResult(null)
        try {
            toast('info', 'Generation started', 'AI is calculating the optimal schedule...')
            const result = await schedulingService.generateTimetable({
                department_id: selectedDeptId,
                strict_mode: strictMode,
            })
            setGenerationResult(result)
            const skipped = result.incomplete_workloads?.length || 0
            if (result.status === 'partial_success' || skipped > 0) {
                toast(
                    'warning',
                    'Generated with warnings',
                    `Created ${result.entries_created} entries, ${skipped} workloads incomplete.`
                )
            } else {
                toast('success', 'Success', 'Timetable generated successfully!')
            }
            await Promise.all([
                fetchTimetable(selectedDeptId),
                loadReadiness(selectedDeptId),
            ])
        } catch (err) {
            toast('error', 'Generation failed', getErrorMessage(err))
        } finally {
            setGenerating(false)
            setGenProgress(0)
            setGenStatus('')
        }
    }

    // Group timetable data for grid display: day -> slot -> entry
    const handleExport = () => {
        if (!timetable.length || !selectedDeptId) {
            toast('error', 'No data to export', 'Please generate a timetable first.')
            return
        }
        const headers = ['Day', 'Time', 'Course', 'Section', 'Teacher', 'Room']
        const rows = timetable.map(entry => [
            entry.day,
            entry.timeslot,
            entry.course?.name || '',
            entry.sections?.map(s => s.name).join(' & ') || '',
            entry.teacher?.name || '',
            entry.room?.name || ''
        ])
        const csvContent = [headers, ...rows].map(r => r.join(',')).join('\n')
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.setAttribute('href', url)
        link.setAttribute('download', `timetable_dept_${selectedDeptId}.csv`)
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        URL.revokeObjectURL(url) // Clean up
    }

    const handleClear = async () => {
        if (!selectedDeptId) {
            toast('error', 'No department selected', 'Please select a department first.')
            return
        }
        if (!window.confirm('Are you sure you want to clear the entire timetable for this department?')) return
        try {
            await schedulingService.clearTimetable(selectedDeptId)
            toast('success', 'Cleared', 'Timetable has been removed.')
            setTimetable([])
            setGenerationResult(null)
        } catch (err) {
            toast('error', 'Error', getErrorMessage(err))
        }
    }

    const handleDeleteEntry = async (entryId: number) => {
        if (!window.confirm('Delete this entry?')) return
        try {
            await schedulingService.deleteEntry(entryId)
            setTimetable(prev => prev.filter(e => e.id !== entryId))
            toast('success', 'Entry deleted')
        } catch (err) {
            toast('error', 'Delete failed', getErrorMessage(err))
        }
    }

    const loadModalData = async () => {
        try {
            if (!selectedDeptId) return

            if (readiness.courses.length > 0 || readiness.sections.length > 0 || readiness.rooms.length > 0 || readiness.teachers.length > 0) {
                setTeachers(readiness.teachers)
                setRooms(readiness.rooms)
                setCourses(readiness.courses)
                setSections(readiness.sections)
                return
            }

            const nextReadiness = await loadReadiness(selectedDeptId)
            setTeachers(nextReadiness.teachers)
            setRooms(nextReadiness.rooms)
            setCourses(nextReadiness.courses)
            setSections(nextReadiness.sections)
        } catch (err) {
            toast('error', 'Failed to load resources', getErrorMessage(err))
        }
    }

    const openAddModal = (day: string, slot: string) => {
        setSelectedSlot({ day, slot })
        setEntryModalOpen(true)
        loadModalData()
    }

    const handleManualSubmit = async () => {
        if (!selectedSlot || !selectedDeptId) {
            toast('error', 'Missing information', 'Please select a time slot and department.')
            return
        }
        if (!formData.teacher_id || !formData.course_id || !formData.room_id || !formData.section_id) {
            toast('error', 'Missing fields', 'All fields are required for manual entry.')
            return
        }

        setSaving(true)
        try {
            await schedulingService.createEntry({
                ...formData,
                day: selectedSlot.day,
                timeslot: selectedSlot.slot,
                department_id: selectedDeptId,
                teacher_id: parseInt(formData.teacher_id),
                course_id: parseInt(formData.course_id),
                room_id: parseInt(formData.room_id),
                section_id: parseInt(formData.section_id)
            })
            toast('success', 'Entry created')
            setEntryModalOpen(false)
            fetchTimetable(selectedDeptId)
            setFormData({ teacher_id: '', room_id: '', course_id: '', section_id: '' })
        } catch (err) {
            toast('error', 'Failed to create', getErrorMessage(err))
        } finally {
            setSaving(false)
        }
    }

    const handleDragStart = (event: DragStartEvent) => {
        setActiveId(event.active.id as number)
    }

    const handleDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event
        setActiveId(null)

        if (!over || !selectedDeptId) return

        const entryId = active.id as number
        const dropData = over.id as string // format: "day|slot"
        const [newDay, newSlot] = dropData.split('|') as [TimetableEntry['day'], TimetableEntry['timeslot']]

        const entry = timetable.find(e => e.id === entryId)
        if (!entry || (entry.day === newDay && entry.timeslot === newSlot)) return

        try {
            await schedulingService.updateEntry(entryId, { day: newDay, timeslot: newSlot })
            setTimetable(prev => prev.map(e => e.id === entryId ? { ...e, day: newDay, timeslot: newSlot } : e))
            toast('success', 'Entry moved', `Moved to ${newDay} ${newSlot}`)
        } catch (err) {
            toast('error', 'Update failed', getErrorMessage(err))
        }
    }

    const filteredTimetable = useMemo(() => {
        let items = timetable
        if (filterType === 'Teacher' && filterId) items = items.filter(e => e.teacher?.id === filterId)
        if (filterType === 'Room' && filterId) items = items.filter(e => e.room?.id === filterId)

        if (searchQuery) {
            const q = searchQuery.toLowerCase()
            items = items.filter(e =>
                e.course?.name?.toLowerCase().includes(q) ||
                e.teacher?.name?.toLowerCase().includes(q) ||
                e.sections?.some(s => s.name.toLowerCase().includes(q))
            )
        }
        return items
    }, [timetable, filterType, filterId, searchQuery])

    // Find all entries that have conflicts with ANY other entry in the ENTIRE timetable
    // Not just the ones in the same cell (e.g. teacher double booked in two different rooms at same time)
    const entriesWithConflicts = useMemo(() => {
        const conflictIds = new Set<number>()
        for (let i = 0; i < timetable.length; i++) {
            for (let j = i + 1; j < timetable.length; j++) {
                const e1 = timetable[i]
                const e2 = timetable[j]
                if (e1.day === e2.day && e1.timeslot === e2.timeslot) {
                    const sharesSection = e1.sections?.some(s1 => e2.sections?.some(s2 => s1.id === s2.id))
                    if (sharesSection ||
                        e1.teacher?.id === e2.teacher?.id ||
                        e1.room?.id === e2.room?.id) {
                        conflictIds.add(e1.id)
                        conflictIds.add(e2.id)
                    }
                }
            }
        }
        return conflictIds
    }, [timetable])

    // Detect multi-hour sessions and group them
    const multiHourSessions = useMemo(() => {
        const sessions: Array<{
            entry: TimetableEntry,
            duration: number,
            slots: string[]
        }> = []
        
        filteredTimetable.forEach(entry => {
            // Check if this is part of an already processed multi-hour session
            const existing = sessions.find(s => s.entry.id === entry.id)
            if (existing) return
            
            // Find consecutive slots for this course/teacher/room combination
            const daySlots = SLOTS
            const entrySlotIndex = daySlots.indexOf(entry.timeslot)
            if (entrySlotIndex === -1) return
            
            let duration = 1
            const slots = [entry.timeslot]
            
            // Look for consecutive slots with same course/teacher/room
            for (let i = entrySlotIndex + 1; i < daySlots.length; i++) {
                const nextSlot = daySlots[i]
                const nextEntry = filteredTimetable.find(e => 
                    e.day === entry.day && 
                    e.timeslot === nextSlot &&
                    e.course?.id === entry.course?.id &&
                    e.teacher?.id === entry.teacher?.id &&
                    e.room?.id === entry.room?.id
                )
                
                if (nextEntry) {
                    duration++
                    slots.push(nextSlot)
                } else {
                    break
                }
            }
            
            // If it spans multiple hours, mark it as a multi-hour session
            if (duration > 1) {
                sessions.push({ entry, duration, slots })
            }
        })
        
        return sessions
    }, [filteredTimetable])

    const scheduleGrid = useMemo(() => {
        const grid: Record<string, Record<string, TimetableEntry[]>> = {}
        DAYS.forEach((day: string) => {
            grid[day] = {}
            SLOTS.forEach((slot: string) => {
                // Filter out entries that are part of multi-hour sessions (they'll be handled separately)
                grid[day][slot] = filteredTimetable.filter(entry => 
                    entry.day === day && 
                    entry.timeslot === slot &&
                    !multiHourSessions.some(session => session.entry.id === entry.id)
                )
            })
        })
        return grid
    }, [filteredTimetable, multiHourSessions])

    const uniqueTeachers = useMemo(() => {
        const seen = new Set<number>()
        return timetable
            .map(e => e.teacher)
            .filter((t): t is NonNullable<typeof t> => {
                if (!t || seen.has(t.id)) return false
                seen.add(t.id)
                return true
            })
    }, [timetable])

    const uniqueRooms = useMemo(() => {
        const seen = new Set<number>()
        return timetable
            .map(e => e.room)
            .filter((r): r is NonNullable<typeof r> => {
                if (!r || seen.has(r.id)) return false
                seen.add(r.id)
                return true
            })
    }, [timetable])

    const selectedCourse = useMemo(
        () => courses.find(course => course.id === Number(formData.course_id)) ?? null,
        [courses, formData.course_id]
    )

    const selectedSection = useMemo(
        () => sections.find(section => section.id === Number(formData.section_id)) ?? null,
        [sections, formData.section_id]
    )

    const suggestedTeachers = useMemo(() => {
        if (!selectedCourse) return teachers
        const matchingTeachers = teachers.filter(teacher =>
            teacher.qualified_courses?.some(course => course.id === selectedCourse.id)
        )
        return matchingTeachers.length > 0 ? matchingTeachers : teachers
    }, [teachers, selectedCourse])

    const suggestedRooms = useMemo(() => {
        return rooms.filter(room => {
            if (selectedCourse?.course_type === 'Lab' && !room.room_type.toLowerCase().includes('lab')) {
                return false
            }
            if (!selectedSection) return true
            return room.capacity >= selectedSection.student_count
        })
    }, [rooms, selectedCourse, selectedSection])

    useEffect(() => {
        if (!entryModalOpen) return

        if (formData.teacher_id && !suggestedTeachers.some(teacher => teacher.id === Number(formData.teacher_id))) {
            setFormData(prev => ({ ...prev, teacher_id: '' }))
        }

        if (formData.room_id && !suggestedRooms.some(room => room.id === Number(formData.room_id))) {
            setFormData(prev => ({ ...prev, room_id: '' }))
        }
    }, [entryModalOpen, formData.teacher_id, formData.room_id, suggestedTeachers, suggestedRooms])

    const readinessTone = readiness.blockers.length > 0
        ? { color: '#dc2626', bg: 'rgba(239, 68, 68, 0.08)', border: 'rgba(239, 68, 68, 0.2)', label: 'Blocked' }
        : readiness.warnings.length > 0
            ? { color: '#d97706', bg: 'rgba(245, 158, 11, 0.08)', border: 'rgba(245, 158, 11, 0.2)', label: 'Needs Attention' }
            : { color: '#059669', bg: 'rgba(16, 185, 129, 0.08)', border: 'rgba(16, 185, 129, 0.2)', label: 'Ready' }

    const visibleEntryCount = filteredTimetable.length
    const conflictCount = entriesWithConflicts.size
    const generationDisabled = !selectedDeptId || generating || readinessLoading || readiness.blockers.length > 0 || (strictMode && readiness.qualifiedTeacherCount === 0)
    const hasQualifiedTeacherForSelectedCourse = selectedCourse
        ? teachers.some(teacher => teacher.qualified_courses?.some(course => course.id === selectedCourse.id))
        : false

    if (loading && departments.length === 0) return <PageLoader />

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div className="page-header">
                <div>
                    <h1 className="page-title">Class Timetable</h1>
                    <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                        Generate, review, and fine-tune department schedules with fewer conflicts
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    <select
                        value={selectedDeptId || ''}
                        onChange={e => { setSelectedDeptId(Number(e.target.value)); setFilterType('All'); setFilterId(null) }}
                        className="input select"
                        style={{ width: '180px' }}
                    >
                        {departments.map(d => (
                            <option key={d.id} value={d.id}>{d.name}</option>
                        ))}
                    </select>
                    <div style={{ display: 'flex', alignItems: 'center', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '0.5rem', padding: '2px' }}>
                        <select
                            value={filterType}
                            onChange={e => {
                                const nextFilter = e.target.value
                                if (nextFilter === 'All' || nextFilter === 'Teacher' || nextFilter === 'Room') {
                                    setFilterType(nextFilter)
                                    setFilterId(null)
                                }
                            }}
                            className="input select"
                            style={{ width: '100px', border: 'none', background: 'transparent' }}
                        >
                            <option value="All">All View</option>
                            <option value="Teacher">Teacher</option>
                            <option value="Room">Room</option>
                        </select>
                        {(filterType === 'Teacher' || filterType === 'Room') && (
                            <select
                                value={filterId || ''}
                                onChange={e => setFilterId(Number(e.target.value))}
                                className="input select"
                                style={{ width: '180px', border: 'none', borderLeft: '1px solid var(--border)', background: 'transparent' }}
                            >
                                <option value="">Select...</option>
                                {filterType === 'Teacher'
                                    ? uniqueTeachers.map(t => <option key={t?.id} value={t?.id}>{t?.name}</option>)
                                    : uniqueRooms.map(r => <option key={r?.id} value={r?.id}>{r?.name}</option>)
                                }
                            </select>
                        )}
                    </div>
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                        <Search size={16} style={{ position: 'absolute', left: '0.75rem', color: 'var(--text-muted)' }} />
                        <input
                            type="text"
                            placeholder="Search timetable..."
                            className="input"
                            style={{ paddingLeft: '2.5rem', width: '220px' }}
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                        />
                    </div>
                    <button
                        className="btn btn-secondary"
                        onClick={handleExport}
                        disabled={!timetable.length}
                    >
                        <Download size={16} /> Export CSV
                    </button>
                    <button
                        className="btn btn-ghost"
                        style={{ color: '#ef4444' }}
                        onClick={handleClear}
                        disabled={!timetable.length}
                    >
                        <Trash2 size={16} /> Clear
                    </button>
                    <button
                        className="btn btn-primary"
                        onClick={handleGenerate}
                        disabled={generationDisabled}
                        title={readiness.blockers[0] || (strictMode && readiness.qualifiedTeacherCount === 0 ? 'Add qualified teachers or disable strict mode.' : undefined)}
                    >
                        {generating ? <Spinner size={16} /> : <Play size={16} />}
                        {generating ? 'Generating...' : timetable.length ? 'Regenerate' : 'Generate'}
                    </button>
                </div>
            </div>

            <div
                className="card"
                style={{
                    padding: '1.25rem',
                    display: 'grid',
                    gap: '1rem',
                    background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.03), rgba(59, 130, 246, 0.05))',
                    border: `1px solid ${readinessTone.border}`,
                }}
            >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.5rem' }}>
                            <span
                                style={{
                                    fontSize: '0.75rem',
                                    fontWeight: 700,
                                    color: readinessTone.color,
                                    background: readinessTone.bg,
                                    border: `1px solid ${readinessTone.border}`,
                                    borderRadius: '999px',
                                    padding: '0.25rem 0.625rem',
                                }}
                            >
                                {readinessTone.label}
                            </span>
                            {readinessLoading && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Checking resources...</span>}
                        </div>
                        <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>Generation readiness</h3>
                        <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginTop: '0.35rem', maxWidth: '680px' }}>
                            Before generating, make sure this department has sections, courses, rooms, and qualified teachers. This panel highlights the common setup gaps that usually cause weak or incomplete timetables.
                        </p>
                    </div>
                    <label
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            fontSize: '0.8125rem',
                            color: 'var(--text-secondary)',
                            border: '1px solid var(--border)',
                            borderRadius: '0.75rem',
                            padding: '0.625rem 0.875rem',
                            background: 'var(--bg-card)',
                        }}
                        title="If enabled, the scheduler will only use explicitly qualified teachers."
                    >
                        <input
                            type="checkbox"
                            checked={strictMode}
                            onChange={(e) => setStrictMode(e.target.checked)}
                        />
                        Strict qualified teachers only
                    </label>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.75rem' }}>
                    {[
                        { label: 'Sections', value: readiness.sections.length, tone: '#2563eb' },
                        { label: 'Courses', value: readiness.courses.length, tone: '#7c3aed' },
                        { label: 'Rooms', value: readiness.rooms.length, tone: '#059669' },
                        { label: 'Qualified Teachers', value: readiness.qualifiedTeacherCount, tone: '#d97706' },
                    ].map(item => (
                        <div key={item.label} className="card" style={{ padding: '0.9rem', background: 'var(--bg-card)' }}>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>{item.label}</div>
                            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: item.tone }}>{item.value}</div>
                        </div>
                    ))}
                </div>

                {readiness.blockers.length > 0 ? (
                    <div style={{ display: 'grid', gap: '0.5rem' }}>
                        {readiness.blockers.map(message => (
                            <div
                                key={message}
                                style={{
                                    display: 'flex',
                                    alignItems: 'flex-start',
                                    gap: '0.625rem',
                                    padding: '0.875rem 1rem',
                                    borderRadius: '0.75rem',
                                    background: 'rgba(239, 68, 68, 0.08)',
                                    color: '#b91c1c',
                                    border: '1px solid rgba(239, 68, 68, 0.12)',
                                }}
                            >
                                <AlertCircle size={16} style={{ marginTop: '0.1rem', flexShrink: 0 }} />
                                <span style={{ fontSize: '0.8125rem', fontWeight: 500 }}>{message}</span>
                            </div>
                        ))}
                    </div>
                ) : null}

                {readiness.warnings.length > 0 ? (
                    <div style={{ display: 'grid', gap: '0.5rem' }}>
                        {readiness.warnings.map(message => (
                            <div
                                key={message}
                                style={{
                                    display: 'flex',
                                    alignItems: 'flex-start',
                                    gap: '0.625rem',
                                    padding: '0.875rem 1rem',
                                    borderRadius: '0.75rem',
                                    background: 'rgba(245, 158, 11, 0.08)',
                                    color: '#b45309',
                                    border: '1px solid rgba(245, 158, 11, 0.12)',
                                }}
                            >
                                <Info size={16} style={{ marginTop: '0.1rem', flexShrink: 0 }} />
                                <span style={{ fontSize: '0.8125rem', fontWeight: 500 }}>{message}</span>
                            </div>
                        ))}
                    </div>
                ) : null}
            </div>

            {generating && (
                <div className="card" style={{
                    padding: '1.5rem',
                    background: 'var(--bg-card)',
                    border: '1px solid var(--primary)',
                    boxShadow: '0 4px 20px rgba(59, 130, 246, 0.1)',
                    marginBottom: '1rem'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <Zap size={20} style={{ color: 'var(--primary)', animation: 'pulse 2s infinite' }} />
                            <div>
                                <h3 style={{ fontSize: '0.9375rem', fontWeight: 700 }}>AI Optimizer Running</h3>
                                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{genStatus}</p>
                            </div>
                        </div>
                        <span style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--primary)' }}>{genProgress}%</span>
                    </div>
                    <div style={{ height: '8px', background: 'var(--bg)', borderRadius: '4px', overflow: 'hidden' }}>
                        <div
                            style={{
                                height: '100%',
                                background: 'linear-gradient(90deg, var(--primary) 0%, #6366f1 100%)',
                                width: `${genProgress}%`,
                                transition: 'width 0.4s ease-out'
                            }}
                        />
                    </div>
                </div>
            )}

            {generationResult && !generating && (
                <div
                    className="card"
                    style={{
                        padding: '1.25rem',
                        display: 'grid',
                        gap: '1rem',
                        border: generationResult.status === 'success'
                            ? '1px solid rgba(16, 185, 129, 0.2)'
                            : '1px solid rgba(245, 158, 11, 0.2)',
                        background: generationResult.status === 'success'
                            ? 'rgba(16, 185, 129, 0.05)'
                            : 'rgba(245, 158, 11, 0.05)',
                    }}
                >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
                                {generationResult.status === 'success' ? (
                                    <CheckCircle2 size={18} color="#059669" />
                                ) : (
                                    <AlertCircle size={18} color="#d97706" />
                                )}
                                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                                    {generationResult.status === 'success' ? 'Generation completed' : 'Generation completed with warnings'}
                                </h3>
                            </div>
                            <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>{generationResult.message}</p>
                        </div>
                        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                            <div className="card" style={{ padding: '0.75rem 1rem', background: 'var(--bg-card)' }}>
                                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Entries created</div>
                                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)' }}>{generationResult.entries_created}</div>
                            </div>
                            <div className="card" style={{ padding: '0.75rem 1rem', background: 'var(--bg-card)' }}>
                                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Incomplete workloads</div>
                                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#d97706' }}>{generationResult.incomplete_workloads.length}</div>
                            </div>
                        </div>
                    </div>

                    {generationResult.incomplete_workloads.length > 0 && (
                        <div style={{ display: 'grid', gap: '0.5rem' }}>
                            {generationResult.incomplete_workloads.slice(0, 4).map(item => (
                                <div key={`${item.course}-${item.section}-${item.teacher}`} style={{ padding: '0.75rem 0.9rem', borderRadius: '0.75rem', background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                                    <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                                        {item.course} • {item.section}
                                    </div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                                        {item.reason} {item.required ? `(${item.allocated}/${item.required} hours allocated)` : ''}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {generationResult.errors.length > 0 && (
                        <div style={{ display: 'grid', gap: '0.5rem' }}>
                            {generationResult.errors.slice(0, 3).map(error => (
                                <div key={error} style={{ fontSize: '0.8125rem', color: '#b91c1c' }}>
                                    {error}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {loading ? (
                <div style={{ height: '400px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Spinner size={32} />
                </div>
            ) : timetable.length === 0 ? (
                <div className="card" style={{ padding: '4rem 2rem' }}>
                    <EmptyState
                        icon={<Calendar size={48} />}
                        title="No timetable found"
                        description={
                            readiness.blockers.length > 0
                                ? 'Finish the blocked setup items above, then generate the timetable.'
                                : 'Run the AI generator to create a workable first draft for this department.'
                        }
                        action={
                            <button className="btn btn-primary" onClick={handleGenerate} disabled={generationDisabled} style={{ marginTop: '1.5rem' }}>
                                {generating ? <Spinner size={16} /> : <Play size={16} />}
                                Generate Timetable Now
                            </button>
                        }
                    />
                </div>
            ) : (
                <div className="card" style={{ overflow: 'hidden' }}>
                    <div style={{ padding: '1.25rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-card)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: conflictCount > 0 ? '#d97706' : '#10b981', fontSize: '0.8125rem', fontWeight: 600 }}>
                                {conflictCount > 0 ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}
                                {conflictCount > 0 ? `${conflictCount} conflict${conflictCount > 1 ? 's' : ''} need attention` : 'Conflict-free schedule'}
                            </div>
                            <span style={{ height: '1rem', width: '1px', background: 'var(--border)' }} />
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)', fontSize: '0.8125rem' }}>
                                <BookOpen size={16} /> {visibleEntryCount} shown of {timetable.length} total entries
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button
                                className={`btn btn-sm ${viewType === 'Grid' ? 'btn-primary' : 'btn-secondary'}`}
                                onClick={() => setViewType('Grid')}
                            >
                                Grid View
                            </button>
                            <button
                                className={`btn btn-sm ${viewType === 'List' ? 'btn-primary' : 'btn-secondary'}`}
                                onClick={() => setViewType('List')}
                            >
                                List View
                            </button>
                        </div>
                    </div>

                    {viewType === 'Grid' ? (
                        <div style={{ overflowX: 'auto', padding: '1rem' }}>
                            <DndContext
                                sensors={sensors}
                                collisionDetection={closestCenter}
                                onDragStart={handleDragStart}
                                onDragEnd={handleDragEnd}
                                modifiers={[restrictToFirstScrollableAncestor]}
                            >
                                <table style={{ 
    width: '100%', 
    borderCollapse: 'separate', 
    borderSpacing: '4px', 
    backgroundColor: 'var(--bg-main)',
    borderRadius: '0.75rem',
    overflow: 'hidden'
}}>
    <thead>
        <tr style={{ backgroundColor: 'var(--bg-card)' }}>
            <th style={{ 
                width: '120px', 
                padding: '1rem', 
                textAlign: 'left', 
                fontWeight: 700, 
                color: 'var(--text-primary)',
                borderBottom: '2px solid var(--border)',
                fontSize: '0.875rem'
            }}>
                Day
            </th>
            {SLOTS.map((slot: string) => (
                <th key={slot} style={{ 
                    padding: '0.75rem 0.5rem', 
                    textAlign: 'center',
                    borderBottom: '2px solid var(--border)',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    color: 'var(--text-muted)',
                    minWidth: '140px'
                }}>
                    <div style={{ fontSize: '0.625rem', textTransform: 'uppercase', marginBottom: '0.25rem', opacity: 0.7 }}>
                        Time
                    </div>
                    <div style={{ fontSize: '0.812rem', color: 'var(--text-primary)', fontWeight: 600 }}>
                        {slot}
                    </div>
                </th>
            ))}
        </tr>
    </thead>
    <tbody>
                {DAYS.map((day: string) => (
                    <tr key={day}>
                        <td style={{ 
                            padding: '1rem',
                            verticalAlign: 'middle',
                            fontWeight: 700,
                            color: 'var(--text-primary)',
                            backgroundColor: 'var(--bg-card)',
                            borderRight: '1px solid var(--border)',
                            fontSize: '0.875rem',
                            textAlign: 'center'
                        }}>
                            {day}
                        </td>
                        {SLOTS.map((slot: string) => {
                    // Check if this slot should be skipped due to multi-hour session
                                                    const multiHourSession = multiHourSessions.find(session => 
                                                        session.entry.day === day && 
                                                        session.slots.includes(slot) &&
                                                        session.slots[0] === slot // Only show card on first slot
                                                    )
                                                    
                                                    const isConflict = activeId ? (() => {
                                                        const activeEntry = timetable.find(e => e.id === activeId)
                                                        if (!activeEntry) return false
                                                        return timetable.some(e =>
                                                            e.id !== activeId &&
                                                            e.day === day &&
                                                            e.timeslot === slot &&
                                                            (e.sections?.some(as => activeEntry.sections?.some(es => es.id === as.id)) ||
                                                                e.teacher?.id === activeEntry.teacher?.id ||
                                                                e.room?.id === activeEntry.room?.id)
                                                        )
                                                    })() : false

                                                    // Skip cells that are part of multi-hour sessions (except the first one)
                                                    const skipCell = multiHourSessions.some(session => 
                                                        session.entry.day === day && 
                                                        session.slots.includes(slot) && 
                                                        session.slots[0] !== slot
                                                    )

                                                    if (skipCell) return null

                                                    return (
                                                        <DroppableCell 
                                                            key={slot} 
                                                            id={`${day}|${slot}`} 
                                                            onAdd={() => openAddModal(day, slot)} 
                                                            isConflict={isConflict}
                                                            multiHourSession={multiHourSession}
                                                        >
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minHeight: '80px', padding: '0.5rem' }}>
                                                                {multiHourSession ? (
                                                                    <MultiHourCard
                                                                        session={multiHourSession}
                                                                        onDelete={() => handleDeleteEntry(multiHourSession.entry.id)}
                                                                        hasConflict={entriesWithConflicts.has(multiHourSession.entry.id)}
                                                                        onResolve={() => { setSuggestingEntry(multiHourSession.entry); setResolutionModalOpen(true) }}
                                                                    />
                                                                ) : (
                                                                    scheduleGrid[day][slot].map((entry) => (
                                                                        <DraggableCard
                                                                            key={entry.id}
                                                                            entry={entry}
                                                                            onDelete={() => handleDeleteEntry(entry.id)}
                                                                            hasConflict={entriesWithConflicts.has(entry.id)}
                                                                            onResolve={() => { setSuggestingEntry(entry); setResolutionModalOpen(true) }}
                                                                        />
                                                                    ))
                                                                )}
                                                            </div>
                                                        </DroppableCell>
                                                    )
                                                })}
            </tr>
        ))}
    </tbody>
</table>

                                <DragOverlay>
                                    {activeId ? (
                                        <div className="card" style={{
                                            padding: '1rem',
                                            borderLeft: '4px solid #3b82f6',
                                            background: 'var(--bg-card)',
                                            width: '240px',
                                            opacity: 0.9,
                                            boxShadow: 'var(--shadow-floating)',
                                            backdropFilter: 'blur(16px)',
                                            borderRadius: 'var(--radius-xl)'
                                        }}>
                                            <div style={{ fontSize: '0.75rem', fontWeight: 700 }}>
                                                {timetable.find(e => e.id === activeId)?.course?.name}
                                            </div>
                                            <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>
                                                {(() => {
                                                    const ae = timetable.find(e => e.id === activeId)
                                                    return ae?.sections?.map(s => s.name).join(', ')
                                                })()}
                                            </div>
                                        </div>
                                    ) : null}
                                </DragOverlay>
                            </DndContext>
                        </div>
                    ) : (
                        <div style={{ padding: '1rem' }}>
                            <div style={{ overflowX: 'auto' }}>
                                <table className="data-table">
                                    <thead>
                                        <tr>
                                            <th>Day</th>
                                            <th>Time</th>
                                            <th>Course</th>
                                            <th>Section</th>
                                            <th>Teacher</th>
                                            <th>Room</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredTimetable.map((entry) => (
                                            <tr key={entry.id}>
                                                <td style={{ fontWeight: 600 }}>{entry.day}</td>
                                                <td><span className="badge badge-amber">{entry.timeslot}</span></td>
                                                <td>{entry.course?.name}</td>
                                                <td>
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px' }}>
                                                        {entry.sections?.map(s => (
                                                            <span key={s.id} className="badge badge-gray">{s.name}</span>
                                                        ))}
                                                    </div>
                                                </td>
                                                <td>{entry.teacher?.name}</td>
                                                <td><span className="badge badge-blue">{entry.room?.name}</span></td>
                                                <td>
                                                    <button className="btn btn-ghost btn-icon btn-sm" style={{ color: '#ef4444' }} onClick={() => handleDeleteEntry(entry.id)}>
                                                        <Trash2 size={14} />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Constraints info */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
                <div className="card" style={{ padding: '1.25rem', display: 'flex', gap: '1rem' }}>
                    <div style={{ width: '2.5rem', height: '2.5rem', borderRadius: '50%', background: 'rgba(59,130,246,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Info size={18} color="#3b82f6" />
                    </div>
                    <div>
                        <h4 style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)' }}>Teacher Availability</h4>
                        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>Schedule is guaranteed to respect each teacher&apos;s preferred working hours.</p>
                    </div>
                </div>
                <div className="card" style={{ padding: '1.25rem', display: 'flex', gap: '1rem' }}>
                    <div style={{ width: '2.5rem', height: '2.5rem', borderRadius: '50%', background: 'rgba(16,185,129,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <MapPin size={18} color="#10b981" />
                    </div>
                    <div>
                        <h4 style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)' }}>Room Optimization</h4>
                        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>Rooms are assigned based on capacity and course type requirements.</p>
                    </div>
                </div>
                <div className="card" style={{ padding: '1.25rem', display: 'flex', gap: '1rem' }}>
                    <div style={{ width: '2.5rem', height: '2.5rem', borderRadius: '50%', background: 'rgba(124,58,237,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <AlertCircle size={18} color="#7c3aed" />
                    </div>
                    <div>
                        <h4 style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)' }}>Zero Conflicts</h4>
                        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>AI ensures no section, teacher, or room is double-booked.</p>
                    </div>
                </div>
            </div>

            <Modal
                isOpen={entryModalOpen}
                onClose={() => setEntryModalOpen(false)}
                title={`Add Timetable Entry: ${selectedSlot?.day} ${selectedSlot?.slot}`}
                footer={
                    <>
                        <button className="btn btn-secondary" onClick={() => setEntryModalOpen(false)}>Cancel</button>
                        <button className="btn btn-primary" onClick={handleManualSubmit} disabled={saving}>
                            {saving ? <Spinner size={16} /> : <Plus size={16} />}
                            Save Entry
                        </button>
                    </>
                }
            >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    <div
                        style={{
                            padding: '0.875rem 1rem',
                            borderRadius: '0.75rem',
                            background: 'rgba(59, 130, 246, 0.06)',
                            border: '1px solid rgba(59, 130, 246, 0.12)',
                            fontSize: '0.8125rem',
                            color: 'var(--text-secondary)',
                        }}
                    >
                        Pick a course first. Teacher options will prefer qualified faculty, and room options will prefer a matching capacity and room type.
                    </div>
                    <div className="form-group">
                        <label className="label">Course</label>
                        <select
                            className="input select"
                            value={formData.course_id}
                            onChange={e => setFormData({ ...formData, course_id: e.target.value })}
                        >
                            <option value="">Select Course...</option>
                            {courses.map(c => <option key={c.id} value={c.id}>{c.name} ({c.code})</option>)}
                        </select>
                    </div>
                    <div className="form-group">
                        <label className="label">Section</label>
                        <select
                            className="input select"
                            value={formData.section_id}
                            onChange={e => setFormData({ ...formData, section_id: e.target.value })}
                        >
                            <option value="">Select Section...</option>
                            {sections.map((s: Section) => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                    </div>
                    <div className="form-group">
                        <label className="label">Teacher</label>
                        <select
                            className="input select"
                            value={formData.teacher_id}
                            onChange={e => setFormData({ ...formData, teacher_id: e.target.value })}
                        >
                            <option value="">Select Teacher...</option>
                            {suggestedTeachers.map((t: Teacher) => (
                                <option key={t.id} value={t.id}>
                                    {t.name}
                                    {selectedCourse && t.qualified_courses?.some(course => course.id === selectedCourse.id) ? ' - Qualified' : ''}
                                </option>
                            ))}
                        </select>
                        {selectedCourse && suggestedTeachers.length === teachers.length && !hasQualifiedTeacherForSelectedCourse && (
                            <p className="error-msg">No teacher is explicitly qualified for this course yet. The list is showing all teachers as a fallback.</p>
                        )}
                    </div>
                    <div className="form-group">
                        <label className="label">Room</label>
                        <select
                            className="input select"
                            value={formData.room_id}
                            onChange={e => setFormData({ ...formData, room_id: e.target.value })}
                        >
                            <option value="">Select Room...</option>
                            {suggestedRooms.map((r: Room) => (
                                <option key={r.id} value={r.id}>
                                    {r.name} (Cap: {r.capacity}, {r.room_type})
                                </option>
                            ))}
                        </select>
                        {selectedSection && suggestedRooms.length === 0 && (
                            <p className="error-msg">No room fits this section size and course type. Add a larger or matching room first.</p>
                        )}
                    </div>
                </div>
            </Modal>

            <Modal
                isOpen={resolutionModalOpen}
                onClose={() => setResolutionModalOpen(false)}
                title="Resolve Conflict"
            >
                {suggestingEntry ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                        <div className="card" style={{ padding: '1rem', background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.1)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
                                <AlertCircle size={20} color="#ef4444" />
                                <h4 style={{ fontWeight: 700, fontSize: '0.875rem' }}>Conflict in current slot ({suggestingEntry.day} {suggestingEntry.timeslot})</h4>
                            </div>
                            <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                                <p><strong>Course:</strong> {suggestingEntry.course?.name}</p>
                                <p><strong>Teacher:</strong> {suggestingEntry.teacher?.name}</p>
                                <p><strong>Sections:</strong> {suggestingEntry.sections?.map(s => s.name).join(', ')}</p>
                                <p><strong>Room:</strong> {suggestingEntry.room?.name}</p>
                            </div>
                        </div>

                        <div>
                            <h4 style={{ fontWeight: 700, fontSize: '0.875rem', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <Zap size={16} color="#fbbf24" /> Conflict-Free Suggestions
                            </h4>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '0.75rem', maxHeight: '200px', overflowY: 'auto' }}>
                                {(() => {
                                    const suggestions: Array<{ day: TimetableEntry['day'], slot: TimetableEntry['timeslot'] }> = [];
                                    DAYS.forEach((d: string) => {
                                        SLOTS.forEach((s: string) => {
                                            const hasConf = timetable.some((e: TimetableEntry) =>
                                                e.id !== suggestingEntry.id &&
                                                e.day === d &&
                                                e.timeslot === s &&
                                                (e.teacher?.id === suggestingEntry.teacher?.id ||
                                                    e.room?.id === suggestingEntry.room?.id ||
                                                    e.sections?.some((as: { id: number; name: string }) => suggestingEntry.sections?.some((es: { id: number; name: string }) => es.id === as.id)))
                                            );
                                            if (!hasConf) suggestions.push({
                                                day: d as TimetableEntry['day'],
                                                slot: s as TimetableEntry['timeslot'],
                                            });
                                        });
                                    });

                                    if (suggestions.length === 0) {
                                        return <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', gridColumn: '1/-1' }}>No completely free slots found. Try adding more rooms or adjusting teacher availability.</p>;
                                    }

                                    return suggestions.slice(0, 10).map(s => (
                                        <button
                                            key={`${s.day}-${s.slot}`}
                                            className="btn btn-ghost"
                                            onClick={async () => {
                                                try {
                                                    await schedulingService.updateEntry(suggestingEntry.id, { day: s.day, timeslot: s.slot });
                                                    setTimetable((prev: TimetableEntry[]) => prev.map((e: TimetableEntry) => e.id === suggestingEntry.id ? { ...e, day: s.day, timeslot: s.slot } : e));
                                                    toast('success', 'Resolved', `Moved to ${s.day} ${s.slot}`);
                                                    setResolutionModalOpen(false);
                                                } catch (err) {
                                                    toast('error', 'Failed', getErrorMessage(err));
                                                }
                                            }}
                                            style={{
                                                justifyContent: 'flex-start',
                                                textAlign: 'left',
                                                padding: '0.5rem',
                                                border: '1px solid var(--border)',
                                                height: 'auto',
                                                flexDirection: 'column',
                                                alignItems: 'flex-start'
                                            }}
                                        >
                                            <div style={{ fontSize: '0.75rem', fontWeight: 700 }}>{s.day}</div>
                                            <div style={{ fontSize: '0.625rem', color: 'var(--text-muted)' }}>{s.slot}</div>
                                        </button>
                                    ));
                                })()}
                            </div>
                        </div>
                    </div>
                ) : null}
            </Modal>
        </div>
    )
}

function DraggableCard({ entry, onDelete, hasConflict, onResolve }: { entry: TimetableEntry, onDelete: () => void, hasConflict?: boolean, onResolve?: () => void }) {
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
        id: entry.id,
    })

    const style = {
        transform: CSS.Translate.toString(transform),
        opacity: isDragging ? 0 : 1,
        cursor: 'default'
    }

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={`card ${hasConflict ? 'border-danger' : ''}`}
        >
            <div style={{
                minHeight: '70px',
                padding: '0.75rem',
                borderLeft: `3px solid ${hasConflict ? '#ef4444' : '#3b82f6'}`,
                background: hasConflict ? 'rgba(239, 68, 68, 0.05)' : 'rgba(59, 130, 246, 0.05)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                position: 'relative',
                borderRadius: '0.5rem',
                border: '1px solid var(--border)',
                boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
            }}>
                <div
                    {...listeners}
                    {...attributes}
                    style={{
                        position: 'absolute',
                        top: '0.25rem',
                        right: '0.25rem',
                        cursor: 'grab',
                        color: 'var(--text-muted)',
                        padding: '2px',
                        zIndex: 10,
                        opacity: 0.6
                    }}
                >
                    <GripVertical size={12} />
                </div>

                {hasConflict && (
                    <button
                        onClick={(e) => { e.stopPropagation(); onResolve?.() }}
                        style={{
                            position: 'absolute',
                            bottom: '0.25rem',
                            right: '1.5rem',
                            background: '#f59e0b',
                            border: 'none',
                            borderRadius: '3px',
                            padding: '1px 4px',
                            color: 'white',
                            cursor: 'pointer',
                            zIndex: 10,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '2px',
                            fontSize: '0.5625rem',
                            fontWeight: 600
                        }}
                        title="Find conflict-free slot"
                    >
                        <Zap size={8} /> Fix
                    </button>
                )}

                <div style={{ paddingRight: '1.5rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.25rem' }}>
                        <div style={{ 
                            fontSize: '0.6875rem', 
                            fontWeight: 600, 
                            color: hasConflict ? '#dc2626' : 'var(--text-primary)', 
                            overflow: 'hidden', 
                            whiteSpace: 'nowrap', 
                            textOverflow: 'ellipsis', 
                            maxWidth: '70%',
                            lineHeight: '1.2'
                        }}>
                            {entry.course?.name}
                        </div>
                        <div style={{ display: 'flex', gap: '2px' }}>
                            <button
                                onClick={(e) => { e.stopPropagation(); onDelete() }}
                                style={{ 
                                    background: 'none', 
                                    border: 'none', 
                                    padding: '0', 
                                    color: '#ef4444', 
                                    cursor: 'pointer', 
                                    opacity: 0.6,
                                    fontSize: '0.75rem'
                                }}
                                title="Delete entry"
                            >
                                <Trash2 size={10} />
                            </button>
                        </div>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px' }}>
                        {entry.sections?.map(s => (
                            <span key={s.id} style={{ 
                                fontSize: '0.5625rem', 
                                padding: '1px 4px', 
                                background: 'rgba(255, 255, 255, 0.8)', 
                                border: '1px solid var(--border)', 
                                borderRadius: '3px', 
                                color: 'var(--text-secondary)',
                                fontWeight: 500
                            }}>
                                {s.name}
                            </span>
                        ))}
                    </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.125rem', fontSize: '0.5625rem', color: 'var(--text-secondary)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        <User size={8} /> {entry.teacher?.name?.split(' ').map(n => n[0]).join('').toUpperCase()}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        <MapPin size={8} /> {entry.room?.name}
                    </div>
                </div>
            </div>
        </div>
    )
}

function MultiHourCard({ session, onDelete, hasConflict, onResolve }: { 
    session: { entry: TimetableEntry, duration: number, slots: string[] }, 
    onDelete: () => void, 
    hasConflict?: boolean, 
    onResolve?: () => void 
}) {
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
        id: session.entry.id,
    })

    const style = {
        transform: CSS.Translate.toString(transform),
        opacity: isDragging ? 0 : 1,
        cursor: 'default'
    }

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={`card ${hasConflict ? 'border-danger' : ''}`}
        >
            <div style={{
                minHeight: '70px',
                padding: '0.75rem',
                borderLeft: `3px solid ${hasConflict ? '#ef4444' : '#10b981'}`, // Green for lab courses
                background: hasConflict ? 'rgba(239, 68, 68, 0.05)' : 'rgba(16, 185, 129, 0.05)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                position: 'relative',
                borderRadius: '0.5rem',
                border: '1px solid var(--border)',
                boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
            }}>
                <div
                    {...listeners}
                    {...attributes}
                    style={{
                        position: 'absolute',
                        top: '0.25rem',
                        right: '0.25rem',
                        cursor: 'grab',
                        color: 'var(--text-muted)',
                        padding: '2px',
                        zIndex: 10,
                        opacity: 0.6
                    }}
                >
                    <GripVertical size={12} />
                </div>

                {hasConflict && (
                    <button
                        onClick={(e) => { e.stopPropagation(); onResolve?.() }}
                        style={{
                            position: 'absolute',
                            bottom: '0.25rem',
                            right: '1.5rem',
                            background: '#f59e0b',
                            border: 'none',
                            borderRadius: '3px',
                            padding: '1px 4px',
                            color: 'white',
                            cursor: 'pointer',
                            zIndex: 10,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '2px',
                            fontSize: '0.5625rem',
                            fontWeight: 600
                        }}
                        title="Find conflict-free slot"
                    >
                        <Zap size={8} /> Fix
                    </button>
                )}

                <div style={{ paddingRight: '1.5rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.25rem' }}>
                        <div style={{ 
                            fontSize: '0.6875rem', 
                            fontWeight: 600, 
                            color: hasConflict ? '#dc2626' : '#059669', // Green for lab
                            overflow: 'hidden', 
                            whiteSpace: 'nowrap', 
                            textOverflow: 'ellipsis', 
                            maxWidth: '70%',
                            lineHeight: '1.2',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.25rem'
                        }}>
                            {session.entry.course?.name}
                            <span style={{
                                fontSize: '0.5625rem',
                                padding: '1px 3px',
                                background: '#10b981',
                                color: 'white',
                                borderRadius: '3px',
                                fontWeight: 500
                            }}>
                                {session.duration}h
                            </span>
                        </div>
                        <div style={{ display: 'flex', gap: '2px' }}>
                            <button
                                onClick={(e) => { e.stopPropagation(); onDelete() }}
                                style={{ 
                                    background: 'none', 
                                    border: 'none', 
                                    padding: '0', 
                                    color: '#ef4444', 
                                    cursor: 'pointer', 
                                    opacity: 0.6,
                                    fontSize: '0.75rem'
                                }}
                                title="Delete entry"
                            >
                                <Trash2 size={10} />
                            </button>
                        </div>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px' }}>
                        {session.entry.sections?.map(s => (
                            <span key={s.id} style={{ 
                                fontSize: '0.5625rem', 
                                padding: '1px 4px', 
                                background: 'rgba(255, 255, 255, 0.8)', 
                                border: '1px solid var(--border)', 
                                borderRadius: '3px', 
                                color: 'var(--text-secondary)',
                                fontWeight: 500
                            }}>
                                {s.name}
                            </span>
                        ))}
                    </div>
                    <div style={{ fontSize: '0.5625rem', color: 'var(--text-muted)', marginTop: '0.125rem' }}>
                        {session.slots.join(' - ')}
                    </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.125rem', fontSize: '0.5625rem', color: 'var(--text-secondary)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        <User size={8} /> {session.entry.teacher?.name?.split(' ').map(n => n[0]).join('').toUpperCase()}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        <MapPin size={8} /> {session.entry.room?.name}
                    </div>
                </div>
            </div>
        </div>
    )
}

function DroppableCell({ id, children, onAdd, isConflict, multiHourSession }: { 
    id: string, 
    children: React.ReactNode, 
    onAdd: () => void, 
    isConflict?: boolean,
    multiHourSession?: { entry: TimetableEntry, duration: number, slots: string[] }
}) {
    const { isOver, setNodeRef } = useDroppable({
        id: id,
    })

    const style = {
        width: '100%',
        height: '100%',
        minHeight: '80px',
        background: isOver
            ? (isConflict ? 'rgba(239, 68, 68, 0.1)' : 'rgba(59, 130, 246, 0.1)')
            : 'var(--bg)',
        borderRadius: '0.5rem',
        transition: 'all 0.2s ease',
        border: '1px solid var(--border)',
        position: 'relative' as const,
        padding: '0.5rem'
    }

    const childElement = React.isValidElement<{ children?: React.ReactNode }>(children) ? children : null
    const hasEntries = React.Children.count(childElement?.props.children) > 0

    return (
        <td 
            ref={setNodeRef} 
            colSpan={multiHourSession?.duration}
            style={{ 
                padding: '0.25rem',
                backgroundColor: 'var(--bg-main)',
                verticalAlign: 'top',
            }}
        >
            <div style={style}>
                {isOver && isConflict && (
                    <div style={{
                        position: 'absolute',
                        top: '-1.5rem',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        background: '#ef4444',
                        color: 'white',
                        fontSize: '0.625rem',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        whiteSpace: 'nowrap',
                        zIndex: 20,
                        fontWeight: 700,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                    }}>
                        <AlertCircle size={10} /> Conflict Detected
                    </div>
                )}
                {children}
                {!hasEntries && !isOver && !multiHourSession && (
                    <div
                        onClick={onAdd}
                        style={{
                            height: '60px',
                            border: '1px dashed var(--border)',
                            borderRadius: '0.5rem',
                            opacity: 0.4,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease'
                        }}
                        onMouseEnter={e => { e.currentTarget.style.opacity = '0.8'; e.currentTarget.style.borderColor = 'var(--primary)' }}
                        onMouseLeave={e => { e.currentTarget.style.opacity = '0.4'; e.currentTarget.style.borderColor = 'var(--border)' }}
                    >
                        <Plus size={20} />
                    </div>
                )}
            </div>
        </td>
    )
}
