import React, { useEffect, useState, useMemo } from 'react'
import { Calendar, Play, Download, Search, Info, CheckCircle2, AlertCircle, Clock, MapPin, User, BookOpen, Trash2, Plus, X, GripVertical, Zap } from 'lucide-react'
import { DndContext, DragOverlay, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent, DragStartEvent } from '@dnd-kit/core'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { restrictToFirstScrollableAncestor } from '@dnd-kit/modifiers'
import { schedulingService } from '@/services/scheduling.service'
import { departmentService, teacherService, roomService, courseService, sectionService } from '@/services/resources.service'
import { useToast } from '@/context/ToastContext'
import { PageLoader, Spinner, EmptyState } from '@/components/ui/Loading'
import { Modal } from '@/components/ui/Modal'
import { getErrorMessage, DAYS, SLOTS } from '@/lib/utils'
import type { TimetableEntry, Department, Teacher, Room, Course, Section } from '@/types'
import { io } from 'socket.io-client'

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
    const [suggestingEntry, setSuggestingEntry] = useState<TimetableEntry | null>(null)

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
    }, [])

    useEffect(() => {
        if (selectedDeptId) {
            fetchTimetable(selectedDeptId)
        }
    }, [selectedDeptId])

    const fetchTimetable = async (deptId: number) => {
        setLoading(true)
        try {
            const res = await schedulingService.viewTimetable(deptId)
            setTimetable(res.data || [])
        } catch (err) {
            // Don't toast 404s, just show empty state
            setTimetable([])
        } finally {
            setLoading(false)
        }
    }

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
        setGenerating(true)
        setGenProgress(0)
        setGenStatus('Initializing AI engine...')
        try {
            toast('info', 'Generation started', 'AI is calculating the optimal schedule...')
            await schedulingService.generateTimetable({ department_id: selectedDeptId })
            toast('success', 'Success', 'Timetable generated successfully!')
            fetchTimetable(selectedDeptId)
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
            const [t, r, c, s] = await Promise.all([
                teacherService.list(undefined, 1, 500),
                roomService.list(undefined, 1, 500),
                courseService.list(undefined, 1, 500),
                sectionService.list(undefined, 1, 500)
            ])
            setTeachers(t.data || [])
            setRooms(r.data || [])
            setCourses(c.data || [])
            setSections(s.data || [])
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
        const [newDay, newSlot] = dropData.split('|')

        const entry = timetable.find(e => e.id === entryId)
        if (!entry || (entry.day === newDay && entry.timeslot === newSlot)) return

        try {
            await schedulingService.updateEntry(entryId, { day: newDay, timeslot: newSlot })
            setTimetable(prev => prev.map(e => e.id === entryId ? { ...e, day: newDay, timeslot: newSlot } as any : e))
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
            let slots = [entry.timeslot]
            
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
        DAYS.forEach(day => {
            grid[day] = {}
            SLOTS.forEach(slot => {
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

    if (loading && departments.length === 0) return <PageLoader />

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div className="page-header">
                <div>
                    <h1 className="page-title">Class Timetable</h1>
                    <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                        View and manage department schedules
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
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
                            onChange={e => { setFilterType(e.target.value as any); setFilterId(null) }}
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
                        disabled={generating || !selectedDeptId}
                    >
                        {generating ? <Spinner size={16} /> : <Play size={16} />}
                        {generating ? 'Generating...' : 'Regenerate'}
                    </button>
                </div>
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

            {loading ? (
                <div style={{ height: '400px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Spinner size={32} />
                </div>
            ) : timetable.length === 0 ? (
                <div className="card" style={{ padding: '4rem 2rem' }}>
                    <EmptyState
                        icon={<Calendar size={48} />}
                        title="No timetable found"
                        description="Run the AI generator to create a conflict-free schedule for this department."
                        action={
                            <button className="btn btn-primary" onClick={handleGenerate} disabled={generating} style={{ marginTop: '1.5rem' }}>
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
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#10b981', fontSize: '0.8125rem', fontWeight: 600 }}>
                                <CheckCircle2 size={16} /> Conflict-Free Schedule
                            </div>
                            <span style={{ height: '1rem', width: '1px', background: 'var(--border)' }} />
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)', fontSize: '0.8125rem' }}>
                                <BookOpen size={16} /> {timetable.length} Lectures Assigned
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
        {DAYS.map(day => (
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
                {SLOTS.map((slot: string, slotIndex) => {
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
                            {sections.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
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
                            {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
                    </div>
                    <div className="form-group">
                        <label className="label">Room</label>
                        <select
                            className="input select"
                            value={formData.room_id}
                            onChange={e => setFormData({ ...formData, room_id: e.target.value })}
                        >
                            <option value="">Select Room...</option>
                            {rooms.map(r => <option key={r.id} value={r.id}>{r.name} (Cap: {r.capacity})</option>)}
                        </select>
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
                                    const suggestions: { day: string, slot: string }[] = [];
                                    DAYS.forEach(d => {
                                        SLOTS.forEach(s => {
                                            const hasConf = timetable.some(e =>
                                                e.id !== suggestingEntry.id &&
                                                e.day === d &&
                                                e.timeslot === s &&
                                                (e.teacher?.id === suggestingEntry.teacher?.id ||
                                                    e.room?.id === suggestingEntry.room?.id ||
                                                    e.sections?.some(as => suggestingEntry.sections?.some(es => es.id === as.id)))
                                            );
                                            if (!hasConf) suggestions.push({ day: d, slot: s });
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
                                                    setTimetable(prev => prev.map(e => e.id === suggestingEntry.id ? { ...e, day: s.day, timeslot: s.slot } as any : e));
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

    const hasEntries = React.Children.count((children as any).props.children) > 0

    return (
        <td 
            ref={setNodeRef} 
            style={{ 
                padding: '0.25rem',
                backgroundColor: 'var(--bg-main)',
                verticalAlign: 'top',
                ...(multiHourSession && { colSpan: multiHourSession.duration })
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
