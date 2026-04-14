import React, { useEffect, useState, useMemo, useCallback } from 'react'
import { Calendar, Play, Download, Search, Info, CheckCircle2, AlertCircle, MapPin, User, BookOpen, Trash2, Plus, GripVertical, Zap } from 'lucide-react'
import { KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent, DragStartEvent } from '@dnd-kit/core'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { restrictToFirstScrollableAncestor } from '@dnd-kit/modifiers'
import { schedulingService } from '@/services/scheduling.service'
import { departmentService, teacherService, roomService, courseService, sectionService, programService, batchService } from '@/services/resources.service'
import { useToast } from '@/context/useToast'
import { PageLoader, Spinner, EmptyState } from '@/components/ui/Loading'
import { Modal } from '@/components/ui/Modal'
import { getErrorMessage, DAYS, SLOTS } from '@/lib/utils'
import type { TimetableEntry, Department, Teacher, Room, Course, Section, Batch, Program, GenerateScheduleResult, ScheduleBreak } from '@/types'
import { io } from 'socket.io-client'

interface TimetableReadiness {
    sections: Section[]
    courses: Course[]
    rooms: Room[]
    teachers: Teacher[]
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
    labCoursesCount: 0,
    labRoomsCount: 0,
    blockers: [],
    warnings: [],
}

// Color palette matching the manual timetable
const BATCH_COLORS: Record<string, { bg: string; text: string; border: string }> = {
    'BCA I': { bg: '#90EE90', text: '#000', border: '#228B22' },
    'BCA III': { bg: '#87CEEB', text: '#000', border: '#4169E1' },
    'BCA V': { bg: '#DDA0DD', text: '#000', border: '#8B008B' },
    'MCA I': { bg: '#F4A460', text: '#000', border: '#D2691E' },
    'MCA III': { bg: '#FFB6C1', text: '#000', border: '#C71585' },
    'B.TECH CSE I': { bg: '#20B2AA', text: '#fff', border: '#008B8B' },
    'B.TECH CSE III': { bg: '#98FB98', text: '#000', border: '#32CD32' },
    'B.TECH CSE V': { bg: '#87CEFA', text: '#000', border: '#1E90FF' },
    'B.TECH CSE VII': { bg: '#D8BFD8', text: '#000', border: '#9932CC' },
}

const COURSE_COLORS: Record<string, string> = {
    'Break': '#FFFF00',
    'Mathematics': '#FFB6C1',
    'Programming': '#87CEEB',
    'Lab': '#90EE90',
    'Theory': '#F4A460',
    'Computer': '#DDA0DD',
    'Database': '#98FB98',
    'Network': '#FFE4B5',
    'Project': '#D8BFD8',
    'Soft Skill': '#FFDAB9',
    'Language': '#E6E6FA',
    'English': '#FFA07A',
    'Environment': '#98FB98',
    'Default': '#F0F0F0',
}

// Generate a unique color for a teacher based on their name hash
function getTeacherColor(name: string): string {
    // Generate hash from teacher name
    let hash = 0
    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash)
    }
    const hue = Math.abs(hash) % 360
    // Use 70% saturation and 80% lightness for vibrant but readable colors
    return `hsl(${hue}, 70%, 80%)`
}

// Get color for a course based on its name
function getCourseColor(courseName: string, isLab: boolean): string {
    if (!courseName) return COURSE_COLORS.Default
    const lower = courseName.toLowerCase()

    if (lower.includes('break')) return COURSE_COLORS.Break
    if (isLab || lower.includes('lab')) return COURSE_COLORS.Lab
    if (lower.includes('mathematics') || lower.includes('math')) return COURSE_COLORS.Mathematics
    if (lower.includes('programming') || lower.includes('coding')) return COURSE_COLORS.Programming
    if (lower.includes('computer') || lower.includes('fundamental')) return COURSE_COLORS.Computer
    if (lower.includes('database')) return COURSE_COLORS.Database
    if (lower.includes('network')) return COURSE_COLORS.Network
    if (lower.includes('project')) return COURSE_COLORS.Project
    if (lower.includes('soft') || lower.includes('skill')) return COURSE_COLORS['Soft Skill']
    if (lower.includes('language')) return COURSE_COLORS.Language
    if (lower.includes('english')) return COURSE_COLORS.English
    if (lower.includes('environment')) return COURSE_COLORS.Environment

    // Assign colors based on first character of course name for variety
    const colors = Object.values(COURSE_COLORS).filter(c => c !== COURSE_COLORS.Break)
    let hash = 0
    for (let i = 0; i < courseName.length; i++) {
        hash = courseName.charCodeAt(i) + ((hash << 5) - hash)
    }
    return colors[Math.abs(hash) % colors.length] || COURSE_COLORS.Default
}

// Get batch display info
function getBatchColor(batchName: string): { bg: string; text: string; border: string } {
    // Match batch name patterns
    for (const [key, value] of Object.entries(BATCH_COLORS)) {
        if (batchName.toUpperCase().includes(key.toUpperCase())) {
            return value
        }
    }
    // Default color for unknown batches
    return { bg: '#E0E0E0', text: '#000', border: '#999' }
}
 
interface BatchTimetableViewProps {
    timetable: TimetableEntry[]
    batches: Batch[]
    sections: Section[]
    teachers: Teacher[]
    workingDays: string[]
    displaySlots: Array<{ key: string; label: string; isBreak: boolean }>
    onDelete: (id: number) => void
    conflictIds?: Set<number>
}

function BatchTimetableView({ timetable, batches, sections, teachers, workingDays, displaySlots, onDelete, conflictIds }: BatchTimetableViewProps) {

    // Build teacher color mapping using teacher name hash (consistent with legend)
    const teacherColors = useMemo(() => {
        const colors = new Map<number, string>()
        teachers.forEach(teacher => {
            if (teacher.id && teacher.name) {
                colors.set(teacher.id, getTeacherColor(teacher.name))
            }
        })
        return colors
    }, [teachers])

    // ── Build a 3-level grid: day → batchId → slot → entries ──────────────
    const grid = useMemo(() => {
        const g: Record<string, Record<string, Record<string, TimetableEntry[]>>> = {}

        workingDays.forEach(day => {
            g[day] = {}
            batches.forEach(batch => {
                g[day][String(batch.id)] = {}
                displaySlots.forEach(slot => {
                    if (!slot.isBreak) {
                        g[day][String(batch.id)][slot.key] = []
                    }
                })
            })
        })

        timetable.forEach(entry => {
            entry.sections?.forEach(section => {
                const fullSection = sections.find(s => s.id === section.id)
                if (!fullSection) return
                const batchKey = String(fullSection.batch_id)
                const dayGrid = g[entry.day]?.[batchKey]
                if (!dayGrid) return
                const slot = entry.timeslot
                if (dayGrid[slot] && !dayGrid[slot].find(e => e.id === entry.id)) {
                    dayGrid[slot].push(entry)
                }
            })
        })

        return g
    }, [timetable, batches, sections, workingDays, displaySlots])

    // ── Infer the "home room" for each batch (most-used room) ──────────────
    const batchRooms = useMemo(() => {
        const counts: Record<string, Record<string, number>> = {}

        timetable.forEach(entry => {
            if (!entry.room) return
            entry.sections?.forEach(section => {
                const full = sections.find(s => s.id === section.id)
                if (!full) return
                const key = String(full.batch_id)
                counts[key] = counts[key] || {}
                counts[key][entry.room!.name] = (counts[key][entry.room!.name] || 0) + 1
            })
        })

        const result: Record<string, string> = {}
        Object.entries(counts).forEach(([batchId, rooms]) => {
            const top = Object.entries(rooms).sort((a, b) => b[1] - a[1])[0]
            if (top) result[batchId] = top[0]
        })
        return result
    }, [timetable, sections])

    const sortedBatches = useMemo(() =>
        [...batches].sort((a, b) => (a.code || a.name).localeCompare(b.code || b.name))
    , [batches])

    // ── For each (day, batchId) compute per-slot rendering metadata ────────
    // Returns: Map<slot, { entry | null, colSpan: number, skip: boolean }>
    const getSlotMeta = (day: string, batchId: string) => {
        const meta: Record<string, { entry: TimetableEntry | null; colSpan: number; skip: boolean }> = {}
        const skipSet = new Set<string>()

        displaySlots.forEach((slot, i) => {
            if (skipSet.has(slot.key)) {
                meta[slot.key] = { entry: null, colSpan: 1, skip: true }
                return
            }

            if (slot.isBreak) {
                meta[slot.key] = { entry: null, colSpan: 1, skip: false }
                return
            }

            const entries = grid[day]?.[batchId]?.[slot.key] || []
            const entry = entries[0] || null

            let colSpan = 1

            if (entry) {
                const isLabEntry = entry.course?.type === 'Lab' || entry.course?.name?.toLowerCase().includes('lab')
                if (!isLabEntry) {
                    meta[slot.key] = { entry, colSpan, skip: false }
                    return
                }
                // Look ahead for consecutive identical course+teacher+room
                for (let j = i + 1; j < displaySlots.length; j++) {
                    const nextSlot = displaySlots[j]
                    if (nextSlot.isBreak) {
                        break
                    }
                    const nextEntries = grid[day]?.[batchId]?.[nextSlot.key] || []
                    const nextEntry = nextEntries[0]
                    if (
                        nextEntry &&
                        nextEntry.course?.id === entry.course?.id &&
                        nextEntry.teacher?.id === entry.teacher?.id &&
                        nextEntry.room?.id === entry.room?.id
                    ) {
                        colSpan++
                        skipSet.add(nextSlot.key)
                    } else {
                        break
                    }
                }
            }

            meta[slot.key] = { entry, colSpan, skip: false }
        })

        return meta
    }

    // ── Shared style helpers ───────────────────────────────────────────────
    const th = (bg: string, color: string, width?: string): React.CSSProperties => ({
        padding: '0.75rem 0.5rem',
        background: bg,
        color,
        border: '1px solid var(--border)',
        textAlign: 'center',
        fontWeight: 700,
        fontSize: '0.725rem',
        whiteSpace: 'nowrap',
        textTransform: 'uppercase',
        letterSpacing: '0.025em',
        ...(width ? { width } : { minWidth: '100px' }),
    })

    const totalCols = displaySlots.length + 1   // +1 for the Program column

    return (
        <div style={{ 
            overflowX: 'auto', 
            padding: '1.25rem', 
            background: 'var(--bg-card)', 
            borderRadius: '1rem',
            border: '1px solid var(--border)',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)'
        }}>
            <table style={{
                width: '100%',
                borderCollapse: 'separate',
                borderSpacing: 0,
                fontSize: '0.6875rem',
                minWidth: '1000px',
                tableLayout: 'fixed',
                borderRadius: '0.75rem',
                overflow: 'hidden',
                border: '1px solid var(--border)',
            }}>

                {/* ── Column widths ─────────────────────────────────── */}
                <colgroup>
                    <col style={{ width: '88px' }} />
                    {displaySlots.map(slot => <col key={slot.key} />)}
                </colgroup>

                {/* ── Header row ──────────────────────────────────────── */}
                <thead>
                    <tr>
                        <th style={th('var(--bg)', 'var(--text-muted)', '100px')}>Batch</th>
                        {displaySlots.map(slot => {
                            return (
                                <th key={slot.key} style={th(slot.isBreak ? 'rgba(239, 68, 68, 0.05)' : 'var(--bg)', slot.isBreak ? '#ef4444' : 'var(--text-primary)')}>
                                    <div style={{ fontSize: '0.65rem', fontWeight: 600, opacity: 0.7 }}>Slot</div>
                                    {slot.label}
                                </th>
                            )
                        })}
                    </tr>
                </thead>

                {/* ── Body: day sections → batch rows ─────────────────── */}
                <tbody>
                    {workingDays.map(day => (
                        <React.Fragment key={day}>

                            {/* Day separator */}
                            <tr>
                                <td
                                    colSpan={totalCols}
                                    style={{
                                        padding: '0.75rem 1rem',
                                        background: 'rgba(59, 130, 246, 0.08)',
                                        borderBottom: '1px solid var(--border)',
                                        borderTop: '1px solid var(--border)',
                                        textAlign: 'left',
                                        fontWeight: 800,
                                        fontSize: '0.875rem',
                                        color: 'var(--primary)',
                                        letterSpacing: '0.05em',
                                        textTransform: 'uppercase',
                                    }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <Calendar size={16} />
                                        {day}
                                    </div>
                                </td>
                            </tr>

                            {/* One row per batch */}
                            {sortedBatches.map((batch, bi) => {
                                const batchKey = String(batch.id)
                                const slotMeta = getSlotMeta(day, batchKey)
                                // Alternate very subtle zebra stripe on batch rows
                                const rowBg = bi % 2 === 0 ? 'var(--bg-card)' : 'var(--bg)'

                                return (
                                    <tr key={batch.id} style={{ height: '56px' }}>

                                        {/* Program / batch label */}
                                        <td style={{
                                            padding: '0.75rem 0.5rem',
                                            background: 'var(--bg)',
                                            borderRight: '1px solid var(--border)',
                                            borderBottom: '1px solid var(--border)',
                                            textAlign: 'center',
                                            verticalAlign: 'middle',
                                            fontWeight: 700,
                                        }}>
                                            <div style={{ fontWeight: 800, color: 'var(--text-primary)', fontSize: '0.75rem' }}>{batch.name}</div>
                                            {batch.academic_year && (
                                                <div style={{ fontWeight: 500, color: 'var(--text-muted)', fontSize: '0.625rem', marginTop: '0.1rem' }}>
                                                    {batch.academic_year}
                                                </div>
                                            )}
                                            {batchRooms[batchKey] && (
                                                <div style={{
                                                    marginTop: '0.4rem',
                                                    fontWeight: 600,
                                                    color: 'var(--primary)',
                                                    fontSize: '0.625rem',
                                                    background: 'rgba(59, 130, 246, 0.08)',
                                                    border: '1px solid rgba(59, 130, 246, 0.15)',
                                                    borderRadius: '6px',
                                                    padding: '2px 6px',
                                                    display: 'inline-block',
                                                }}>
                                                    📍 {batchRooms[batchKey]}
                                                </div>
                                            )}
                                        </td>

                                        {/* Time slot cells */}
                                        {displaySlots.map(slot => {
                                            const { entry, colSpan, skip } = slotMeta[slot.key]
                                            if (skip) return null   // rendered as part of a multi-span cell

                                            const isBreakSlot = slot.isBreak

                                            // ── BREAK column ──
                                            if (isBreakSlot) {
                                                return (
                                                    <td key={slot.key} style={{
                                                        borderRight: '1px solid var(--border)',
                                                        borderBottom: '1px solid var(--border)',
                                                        background: 'rgba(0, 0, 0, 0.02)',
                                                        textAlign: 'center',
                                                        verticalAlign: 'middle',
                                                    }}>
                                                        {/* Removed repetitive text to reduce noise */}
                                                    </td>
                                                )
                                            }

                                            // ── Empty cell ──
                                            if (!entry) {
                                                return (
                                                    <td key={slot.key} colSpan={colSpan} style={{
                                                        borderRight: '1px solid var(--border)',
                                                        borderBottom: '1px solid var(--border)',
                                                        background: rowBg,
                                                    }} />
                                                )
                                            }

                                            // ── Course cell ──
                                            const isLab = entry.course?.type === 'Lab' ||
                                                          entry.course?.name?.toLowerCase().includes('lab')
                                            const bgColor = getCourseColor(entry.course?.name || '', isLab)
                                            const isMultiSpan = colSpan > 1

                                            // Get teacher color (consistent with legend)
                                            const teacherColor = entry.teacher?.id
                                                ? teacherColors.get(entry.teacher.id) || '#E0E0E0'
                                                : '#E0E0E0'

                                            const hasConflict = entry.id && conflictIds?.has(entry.id)

                                            return (
                                                <td
                                                    key={slot.key}
                                                    colSpan={colSpan}
                                                    title={hasConflict ? `CONFLICT: ${entry.course?.name} has a scheduling clash!` : `${entry.course?.name} | ${entry.teacher?.name} | ${entry.room?.name}`}
                                                    style={{
                                                        padding: '0.5rem 0.625rem',
                                                        borderRight: '1px solid var(--border)',
                                                        borderBottom: '1px solid var(--border)',
                                                        background: hasConflict ? 'rgba(239, 68, 68, 0.1)' : bgColor,
                                                        verticalAlign: 'top',
                                                        position: 'relative',
                                                        borderLeft: `5px solid ${hasConflict ? '#ef4444' : teacherColor}`,
                                                        boxShadow: hasConflict ? 'inset 0 0 0 1px rgba(239, 68, 68, 0.4)' : 'none',
                                                        cursor: 'pointer',
                                                        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
                                                    }}
                                                >
                                                    {/* Multi-span badge */}
                                                    {isMultiSpan && (
                                                        <span style={{
                                                            position: 'absolute',
                                                            top: 2,
                                                            right: 2,
                                                            background: 'rgba(0,0,0,0.25)',
                                                            color: '#fff',
                                                            fontSize: '0.45rem',
                                                            padding: '1px 3px',
                                                            borderRadius: '3px',
                                                            fontWeight: 700,
                                                        }}>
                                                            {colSpan}h
                                                        </span>
                                                    )}

                                                    {/* Course name */}
                                                    <div style={{
                                                        fontWeight: 700,
                                                        fontSize: '0.5625rem',
                                                        lineHeight: 1.25,
                                                        marginBottom: '0.15rem',
                                                        color: '#000',
                                                        overflow: 'hidden',
                                                        display: '-webkit-box',
                                                        WebkitLineClamp: 3,
                                                        WebkitBoxOrient: 'vertical',
                                                    }}>
                                                        {entry.course?.name}
                                                    </div>

                                                    {/* Teacher name */}
                                                    {entry.teacher?.name && (
                                                        <div style={{
                                                            fontSize: '0.5rem',
                                                            color: '#111',
                                                            lineHeight: 1.2,
                                                            overflow: 'hidden',
                                                            display: '-webkit-box',
                                                            WebkitLineClamp: 2,
                                                            WebkitBoxOrient: 'vertical',
                                                        }}>
                                                            {entry.teacher.name}
                                                        </div>
                                                    )}

                                                    {/* Sections (if multiple) */}
                                                    {(entry.sections?.length ?? 0) > 1 && (
                                                        <div style={{
                                                            fontSize: '0.45rem',
                                                            color: '#333',
                                                            marginTop: '2px',
                                                            fontStyle: 'italic',
                                                        }}>
                                                            {entry.sections?.map(s => s.name).join(' & ')}
                                                        </div>
                                                    )}
                                                </td>
                                            )
                                        })}
                                    </tr>
                                )
                            })}
                        </React.Fragment>
                    ))}
                </tbody>
            </table>
        </div>
    )
}

export function TimetablePage() {
    const [departments, setDepartments] = useState<Department[]>([])
    const [genProgress, setGenProgress] = useState<number>(0)
    const [genStatus, setGenStatus] = useState<string>('')
    const [selectedDeptId, setSelectedDeptId] = useState<number | 'all' | null>('all')
    const [timetable, setTimetable] = useState<TimetableEntry[]>([])
    const [loading, setLoading] = useState(true)
    const [generating, setGenerating] = useState(false)
    const [viewType, setViewType] = useState<'Grid' | 'List' | 'Batch'>('Batch')
    const [filterType, setFilterType] = useState<'All' | 'Teacher' | 'Room' | 'Section'>('All')
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
    const [readinessLoading, setReadinessLoading] = useState(false)
    const [readiness, setReadiness] = useState<TimetableReadiness>(emptyReadiness)
    const [generationResult, setGenerationResult] = useState<GenerateScheduleResult | null>(null)
    const [batches, setBatches] = useState<Batch[]>([])
    const [programs, setPrograms] = useState<Program[]>([])
    const [selectedProgramId, setSelectedProgramId] = useState<number | null>(null)
    const [selectedBatchId, setSelectedBatchId] = useState<number | null>(null)
    const [workingDays, setWorkingDays] = useState<string[]>([...DAYS])
    const [timeSlots, setTimeSlots] = useState<string[]>([...SLOTS])
    const [breaks, setBreaks] = useState<ScheduleBreak[]>([])
    const [activeTab, setActiveTab] = useState<'Schedule' | 'Faculty' | 'Readiness'>('Schedule')
    const [compactView, setCompactView] = useState(false)

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

    const displaySlots = useMemo(() => {
        const teaching = timeSlots.map(slot => {
            const [start, end] = slot.split('-')
            return { key: slot, label: slot, isBreak: false, start, end }
        })
        const pauseSlots = (breaks || []).map((item, index) => ({
            key: `break-${item.start}-${item.end}-${index}`,
            label: item.label || `${item.start}-${item.end}`,
            isBreak: true,
            start: item.start,
            end: item.end,
        }))

        return [...teaching, ...pauseSlots].sort((left, right) => left.start.localeCompare(right.start))
    }, [timeSlots, breaks])

    useEffect(() => {
        async function fetchDepts() {
            try {
                const res = await departmentService.list(1, 100)
                const depts = res.data || []
                setDepartments(depts)
                setSelectedDeptId('all')
            } catch (err) {
                toast('error', 'Failed to load departments', getErrorMessage(err))
            } finally {
                setLoading(false)
            }
        }
        fetchDepts()
    }, [toast])

    const fetchTimetable = useCallback(async (deptId: number | 'all') => {
        setLoading(true)
        try {
            const res = deptId === 'all'
                ? await schedulingService.viewAllTimetables()
                : await schedulingService.viewTimetable(deptId)
            setTimetable(res.data || [])
            setWorkingDays(res.working_days?.length ? res.working_days : [...DAYS])
            const nextTimeSlots = res.time_slots?.map(slot => `${slot.start}-${slot.end}`) || []
            setTimeSlots(nextTimeSlots.length ? nextTimeSlots : [...SLOTS])
            setBreaks(res.breaks || [])
        } catch {
            // Don't toast 404s, just show empty state
            setTimetable([])
            setWorkingDays([...DAYS])
            setTimeSlots([...SLOTS])
            setBreaks([])
        } finally {
            setLoading(false)
        }
    }, [])

    const loadDepartmentSections = useCallback(async (deptId: number | 'all'): Promise<{ sections: Section[], batches: Batch[] }> => {
        const programRes = await programService.list(deptId === 'all' ? undefined : deptId, 1, 500)
        const programs = programRes.data || []
        if (programs.length === 0) return { sections: [], batches: [] }

        const batchResults = await Promise.all(
            programs.map(program => batchService.list(program.id, 1, 500))
        )
        const allBatches = batchResults.flatMap(result => result.data || [])
        setBatches(allBatches)
        if (allBatches.length === 0) return { sections: [], batches: [] }

        const sectionResults = await Promise.all(
            allBatches.map((batch: Batch) => sectionService.list(batch.id, 1, 500))
        )

        return { sections: sectionResults.flatMap(result => result.data || []), batches: allBatches }
    }, [])

    const loadReadiness = useCallback(async (deptId: number | 'all'): Promise<TimetableReadiness> => {
        setReadinessLoading(true)
        try {
            const [sectionResult, courseRes, roomRes, teacherRes] = await Promise.all([
                loadDepartmentSections(deptId),
                courseService.list(deptId === 'all' ? undefined : deptId, 1, 500),
                roomService.list(undefined, 1, 500),
                teacherService.list(deptId === 'all' ? undefined : deptId, 1, 500),
            ])

            const sectionData = sectionResult.sections
            const deptCourses = courseRes.data || []
            const deptRooms = (roomRes.data || []).filter(room => !room.department_id || deptId === 'all' || room.department_id === deptId)
            const allTeachers = teacherRes.data || []
            const labCoursesCount = deptCourses.filter(course => course.course_type === 'Lab').length
            const labRoomsCount = deptRooms.filter(room => room.room_type.toLowerCase().includes('lab')).length

            const blockers: string[] = []
            const warnings: string[] = []

            if (sectionData.length === 0) blockers.push('No sections found for this department.')
            if (deptCourses.length === 0) blockers.push('No courses found for this department.')
            if (deptRooms.length === 0) blockers.push('No rooms are available for this department.')
            if (allTeachers.length === 0) blockers.push('No teachers are available in the system.')

            if (labCoursesCount > 0 && labRoomsCount === 0) {
                warnings.push('Lab courses exist, but no lab rooms are available for this department.')
            }

            const nextReadiness = {
                sections: sectionData,
                courses: deptCourses,
                rooms: deptRooms,
                teachers: allTeachers,
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
        if (selectedDeptId !== null) {
            setGenerationResult(null)
            setFormData({ teacher_id: '', room_id: '', course_id: '', section_id: '' })
            setSelectedProgramId(null)
            setSelectedBatchId(null)
            fetchTimetable(selectedDeptId)
            loadReadiness(selectedDeptId)
            // Load programs for filter
            programService.list(selectedDeptId === 'all' ? undefined : selectedDeptId, 1, 500)
                .then(res => setPrograms(res.data || []))
                .catch(() => setPrograms([]))
        } else {
            setReadiness(emptyReadiness)
            setPrograms([])
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

        setGenerating(true)
        setGenProgress(0)
        setGenStatus('Initializing AI engine...')
        setGenerationResult(null)
        try {
            toast('info', 'Generation started', 'AI is calculating the optimal schedule...')
            if (selectedDeptId === 'all') {
                const res: any = await schedulingService.generateAllTimetables({})
                const results = res.results || []
                
                const totalCreated = results.reduce((sum: number, r: any) => sum + (r.entries_created || 0), 0)
                const totalSkipped = results.reduce((sum: number, r: any) => sum + (r.incomplete_workloads?.length || 0), 0)
                
                const combinedResult: GenerateScheduleResult = {
                    status: totalSkipped > 0 ? 'partial_success' : 'success',
                    entries_created: totalCreated,
                    incomplete_workloads: results.flatMap((r: any) => r.incomplete_workloads || []),
                    errors: results.flatMap((r: any) => r.errors || []),
                    message: res.message || `Generated ${totalCreated} entries across all departments.`
                }
                setGenerationResult(combinedResult)
                
                if (combinedResult.status === 'partial_success' || totalSkipped > 0) {
                    toast(
                        'warning',
                        'Generated with warnings',
                        `Created ${totalCreated} entries, ${totalSkipped} workloads incomplete.`
                    )
                } else {
                    toast('success', 'Success', 'All timetables generated successfully!')
                }
            } else {
                const result = await schedulingService.generateTimetable({
                    department_id: selectedDeptId,
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
        
        if (selectedDeptId === 'all') {
            if (!window.confirm('Are you sure you want to clear the entire timetable for ALL departments?')) return
            try {
                // Delete one by one if backend doesn't support /clear/all
                await Promise.all(departments.map(d => schedulingService.clearTimetable(d.id)))
                toast('success', 'Cleared', 'All timetables have been removed.')
                setTimetable([])
                setGenerationResult(null)
            } catch (err) {
                toast('error', 'Error', getErrorMessage(err))
            }
        } else {
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
            let deptIdToUse: number;
            if (selectedDeptId === 'all') {
                const section = sections.find(s => s.id === parseInt(formData.section_id));
                if (!section) throw new Error('Could not determine department for this section');
                // We need the department ID. The section only has batch_id. 
                // We might need to find the batch, then the program, then the department.
                const batch = batches.find(b => b.id === section.batch_id);
                const program = programs.find(p => p.id === batch?.program_id);
                if (!program?.department_id) throw new Error('Could not determine department');
                deptIdToUse = program.department_id;
            } else {
                deptIdToUse = selectedDeptId as number;
            }

            await schedulingService.createEntry({
                ...formData,
                day: selectedSlot.day,
                timeslot: selectedSlot.slot,
                department_id: deptIdToUse,
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

    // Compute which batch IDs belong to the selected program (for program filter)
    const programBatchIds = useMemo(() => {
        if (!selectedProgramId) return null   // null means "all batches"
        const ids = new Set(batches.filter(b => b.program_id === selectedProgramId).map(b => b.id))
        return ids
    }, [batches, selectedProgramId])

    // Batches visible in the Batch timetable view (respects program + batch filter)
    const visibleBatches = useMemo(() => {
        let list = batches
        if (programBatchIds) list = list.filter(b => programBatchIds.has(b.id))
        if (selectedBatchId) list = list.filter(b => b.id === selectedBatchId)
        return list
    }, [batches, programBatchIds, selectedBatchId])

    const filteredTimetable = useMemo(() => {
        let items = timetable

        // Filter by program / batch (match entries whose sections belong to visible batches)
        if (programBatchIds || selectedBatchId) {
            const allowedBatchIds = new Set(visibleBatches.map(b => b.id))
            items = items.filter(entry =>
                entry.sections?.some(sec => {
                    const fullSection = readiness.sections.find(s => s.id === sec.id)
                    return fullSection ? allowedBatchIds.has(fullSection.batch_id) : false
                })
            )
        }

        if (filterType === 'Section' && filterId) items = items.filter(e => e.sections?.some(s => s.id === filterId))
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
    }, [timetable, filterType, filterId, searchQuery, programBatchIds, selectedBatchId, visibleBatches, readiness.sections])

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

            const isLab = entry.course?.type === 'Lab' || entry.course?.name?.toLowerCase().includes('lab')
            if (!isLab) return

            // Find consecutive slots for this course/teacher/room combination
            const daySlots = timeSlots
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
    }, [filteredTimetable, timeSlots])

    const scheduleGrid = useMemo(() => {
        const grid: Record<string, Record<string, TimetableEntry[]>> = {}
        workingDays.forEach((day: string) => {
            grid[day] = {}
            timeSlots.forEach((slot: string) => {
                // Filter out entries that are part of multi-hour sessions (they'll be handled separately)
                grid[day][slot] = filteredTimetable.filter(entry =>
                    entry.day === day &&
                    entry.timeslot === slot &&
                    !multiHourSessions.some(session => session.entry.id === entry.id)
                )
            })
        })
        return grid
    }, [filteredTimetable, multiHourSessions, workingDays, timeSlots])

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

    // Extract unique sections with batch info for legend table
    const sectionLegend = useMemo(() => {
        const seen = new Set<number>()
        const sectionsWithBatch: Array<{
            id: number
            shortName: string
            fullName: string
            batchName: string
            batchYear: string
            studentCount: number
        }> = []

        timetable.forEach(entry => {
            entry.sections?.forEach(section => {
                if (seen.has(section.id)) return
                seen.add(section.id)

                // Find the section from readiness data to get batch_id
                const fullSection = readiness.sections.find(s => s.id === section.id)
                const batch = fullSection ? batches.find(b => b.id === fullSection.batch_id) : null

                sectionsWithBatch.push({
                    id: section.id,
                    shortName: section.name,
                    fullName: fullSection?.name || section.name,
                    batchName: batch?.name || '-',
                    batchYear: batch?.academic_year || '-',
                    studentCount: fullSection?.student_count || 0
                })
            })
        })

        return sectionsWithBatch.sort((a, b) => a.shortName.localeCompare(b.shortName))
    }, [timetable, readiness.sections, batches])

    // Extract unique courses for legend table
    const courseLegend = useMemo(() => {
        const seen = new Set<number>()
        const coursesList: Array<{
            id: number
            code: string
            name: string
            type: string
        }> = []

        timetable.forEach(entry => {
            if (!entry.course || seen.has(entry.course.id)) return
            seen.add(entry.course.id)

            const fullCourse = readiness.courses.find(c => c.id === entry.course.id)
            coursesList.push({
                id: entry.course.id,
                code: fullCourse?.code || '-',
                name: entry.course.name,
                type: entry.course.type || fullCourse?.course_type || '-'
            })
        })

        return coursesList.sort((a, b) => a.code.localeCompare(b.code))
    }, [timetable, readiness.courses])

    // Extract unique teachers for legend table
    const teacherLegend = useMemo(() => {
        const seen = new Set<number>()
        const teachersList: Array<{
            id: number
            shortName: string
            fullName: string
        }> = []

        timetable.forEach(entry => {
            if (!entry.teacher || seen.has(entry.teacher.id)) return
            seen.add(entry.teacher.id)

            const fullTeacher = readiness.teachers.find(t => t.id === entry.teacher.id)
            teachersList.push({
                id: entry.teacher.id,
                shortName: entry.teacher.name?.split(' ').map(n => n[0]).join('').toUpperCase() || '-',
                fullName: entry.teacher.name || '-'
            })
        })

        return teachersList.sort((a, b) => a.shortName.localeCompare(b.shortName))
    }, [timetable, readiness.teachers])

    const selectedCourse = useMemo(
        () => courses.find(course => course.id === Number(formData.course_id)) ?? null,
        [courses, formData.course_id]
    )

    const selectedSection = useMemo(
        () => sections.find(section => section.id === Number(formData.section_id)) ?? null,
        [sections, formData.section_id]
    )

    const suggestedTeachers = useMemo(() => {
        return teachers
    }, [teachers])

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

        if (formData.teacher_id && !suggestedTeachers.some(t => t.id === Number(formData.teacher_id))) {
            setFormData(prev => ({ ...prev, teacher_id: '' }))
        }
    }, [suggestedTeachers, entryModalOpen, formData.teacher_id])

    const readinessTone = readiness.blockers.length > 0
        ? { color: '#ef4444', bg: 'rgba(239, 68, 68, 0.04)', border: 'rgba(239, 68, 68, 0.15)', label: 'Configuration Blocked' }
        : readiness.warnings.length > 0
            ? { color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.04)', border: 'rgba(245, 158, 11, 0.15)', label: 'Needs Attention' }
            : { color: '#10b981', bg: 'rgba(16, 185, 129, 0.04)', border: 'rgba(16, 185, 129, 0.15)', label: 'System Ready' }

    const visibleEntryCount = filteredTimetable.length
    const conflictCount = entriesWithConflicts.size
    const generationDisabled = !selectedDeptId || generating || readinessLoading || readiness.blockers.length > 0
    const unscheduledSectionCounts = useMemo(() => {
        const counts = new Map<string, number>()
        for (const item of generationResult?.incomplete_workloads || []) {
            counts.set(item.section, (counts.get(item.section) || 0) + 1)
        }
        return Array.from(counts.entries()).sort((left, right) => right[1] - left[1])
    }, [generationResult])

    if (loading && departments.length === 0) return <PageLoader />

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', animation: 'fadeIn 0.5s ease-out' }}>
            <style>
                {`
                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(10px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                @keyframes slideUp {
                    from { opacity: 0; transform: translateY(20px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .select:focus {
                    border-color: var(--primary) !important;
                    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1) !important;
                    outline: none !important;
                }
                .btn:hover {
                    filter: brightness(0.95);
                    transform: translateY(-1px);
                }
                .btn:active {
                    transform: translateY(0);
                }
                `}
            </style>
            <div className="card" style={{ 
                padding: '2rem', 
                background: 'linear-gradient(135deg, var(--bg-card) 0%, rgba(59, 130, 246, 0.03) 100%)',
                border: '1px solid var(--border)',
                borderRadius: '1.25rem',
                boxShadow: '0 4px 20px -5px rgba(0, 0, 0, 0.05)',
                display: 'flex',
                flexDirection: 'column',
                gap: '1.5rem'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div style={{ 
                            width: '2.5rem', 
                            height: '2.5rem', 
                            borderRadius: '10px', 
                            background: 'var(--primary)', 
                            color: 'white', 
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'center',
                            boxShadow: '0 4px 12px -2px rgba(59, 130, 246, 0.25)'
                        }}>
                            <Calendar size={20} />
                        </div>
                        <div>
                            <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.025em' }}>
                                Timetable Central
                            </h1>
                            <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                                Academic Resource Management & AI Optimization
                            </p>
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '0.5rem', background: 'var(--bg)', padding: '4px', borderRadius: '12px', border: '1px solid var(--border)' }}>
                        {(['Schedule', 'Faculty', 'Readiness'] as const).map(tab => (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                style={{
                                    padding: '0.5rem 1rem',
                                    borderRadius: '8px',
                                    fontSize: '0.8125rem',
                                    fontWeight: 700,
                                    border: 'none',
                                    cursor: 'pointer',
                                    background: activeTab === tab ? 'var(--bg-card)' : 'transparent',
                                    color: activeTab === tab ? 'var(--primary)' : 'var(--text-muted)',
                                    boxShadow: activeTab === tab ? '0 2px 8px rgba(0,0,0,0.05)' : 'none',
                                    transition: 'all 0.2s ease'
                                }}
                            >
                                {tab}
                            </button>
                        ))}
                    </div>
                </div>

                <div style={{ 
                    display: 'flex', 
                    gap: '1rem', 
                    flexWrap: 'wrap', 
                    padding: '1.25rem', 
                    background: 'rgba(255, 255, 255, 0.4)', 
                    borderRadius: '1rem', 
                    border: '1px solid rgba(0, 0, 0, 0.03)',
                    alignItems: 'center'
                }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                        <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', marginLeft: '0.25rem' }}>Department Scope</label>
                        <select
                            value={selectedDeptId || ''}
                            onChange={e => { 
                                const val = e.target.value === 'all' ? 'all' : Number(e.target.value);
                                setSelectedDeptId(val); 
                                setFilterType('All'); 
                                setFilterId(null); 
                            }}
                            className="input select"
                            style={{ width: '200px', height: '42px', borderRadius: '10px' }}
                        >
                            <option value="all">🌐 All Departments</option>
                            {departments.map(d => (
                                <option key={d.id} value={d.id}>{d.name}</option>
                            ))}
                        </select>
                    </div>

                    <div style={{ height: '32px', width: '1px', background: 'var(--border)', alignSelf: 'flex-end', margin: '0 0.5rem 5px 0' }} />

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                        <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', marginLeft: '0.25rem' }}>Curriculum Filter</label>
                        <div style={{ display: 'flex', gap: '0.75rem' }}>
                            <select
                                value={selectedProgramId ?? ''}
                                onChange={e => {
                                    const val = e.target.value ? Number(e.target.value) : null
                                    setSelectedProgramId(val)
                                    setSelectedBatchId(null)
                                }}
                                className="input select"
                                style={{ width: '160px', height: '42px', borderRadius: '10px' }}
                            >
                                <option value="">All Programs</option>
                                {programs.map(p => (
                                    <option key={p.id} value={p.id}>{p.name}</option>
                                ))}
                            </select>

                            {selectedProgramId && (
                                <select
                                    value={selectedBatchId ?? ''}
                                    onChange={e => {
                                        const val = e.target.value ? Number(e.target.value) : null
                                        setSelectedBatchId(val)
                                    }}
                                    className="input select"
                                    style={{ width: '140px', height: '42px', borderRadius: '10px' }}
                                >
                                    <option value="">All Batches</option>
                                    {batches
                                        .filter(b => b.program_id === selectedProgramId)
                                        .map(b => (
                                            <option key={b.id} value={b.id}>{b.name}</option>
                                        ))
                                    }
                                </select>
                            )}

                            {selectedBatchId && (
                                <select
                                    value={filterType === 'Section' ? filterId ?? '' : ''}
                                    onChange={e => {
                                        const val = e.target.value ? Number(e.target.value) : null
                                        setFilterType(val ? 'Section' : 'All')
                                        setFilterId(val)
                                    }}
                                    className="input select"
                                    style={{ width: '120px', height: '42px', borderRadius: '10px' }}
                                >
                                    <option value="">All Sections</option>
                                    {readiness.sections
                                        .filter(s => s.batch_id === selectedBatchId)
                                        .map(s => (
                                            <option key={s.id} value={s.id}>{s.name}</option>
                                        ))
                                    }
                                </select>
                            )}
                        </div>
                    </div>

                    <div style={{ flex: 1 }} />

                    <div style={{ display: 'flex', gap: '0.75rem', alignSelf: 'flex-end', marginBottom: '2px' }}>
                        <button 
                            className="btn btn-ghost" 
                            onClick={handleExport}
                            style={{ height: '42px', borderRadius: '10px' }}
                        >
                            <Download size={18} /> Export
                        </button>
                        <button 
                            className="btn btn-secondary" 
                            onClick={handleClear}
                            style={{ height: '42px', borderRadius: '10px', color: '#ef4444' }}
                        >
                            <Trash2 size={18} /> Clear
                        </button>
                        <button 
                            className={`btn ${generating ? 'btn-secondary' : 'btn-primary'}`}
                            onClick={handleGenerate} 
                            disabled={generationDisabled}
                            style={{ 
                                height: '42px', 
                                borderRadius: '10px', 
                                padding: '0 1.5rem',
                                boxShadow: generating ? 'none' : '0 4px 12px rgba(59, 130, 246, 0.3)'
                            }}
                        >
                            {generating ? <Spinner size={18} /> : <Zap size={18} />}
                            <span style={{ marginLeft: '0.5rem' }}>
                                {generating ? 'Processing...' : (selectedDeptId === 'all' ? 'Generate All' : 'Generate Now')}
                            </span>
                        </button>
                    </div>
                </div>
            </div>

            {/* Sub-toolbar for search and views */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                    <div style={{ position: 'relative' }}>
                        <Search size={16} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                        <input
                            type="text"
                            placeholder="Quick search (teacher, course, room)..."
                            className="input"
                            style={{ paddingLeft: '2.75rem', width: '300px', borderRadius: '12px', border: '1px solid var(--border)', height: '40px' }}
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                        />
                    </div>

                    <div style={{ display: 'flex', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '3px', height: '40px' }}>
                        <select
                            value={filterType}
                            onChange={e => {
                                const nextFilter = e.target.value
                                if (nextFilter === 'All' || nextFilter === 'Teacher' || nextFilter === 'Room' || nextFilter === 'Section') {
                                    setFilterType(nextFilter as any)
                                    setFilterId(null)
                                }
                            }}
                            className="input select"
                            style={{ width: '105px', border: 'none', background: 'transparent', height: '100%', fontSize: '0.8125rem', fontWeight: 600 }}
                        >
                            <option value="All">All Scope</option>
                            <option value="Teacher">Teacher</option>
                            <option value="Room">Room</option>
                            {!selectedBatchId && <option value="Section">Section</option>}
                        </select>
                        {(filterType === 'Teacher' || filterType === 'Room' || (filterType === 'Section' && !selectedBatchId)) && (
                            <select
                                value={filterId || ''}
                                onChange={e => setFilterId(Number(e.target.value))}
                                className="input select"
                                style={{ width: '180px', border: 'none', borderLeft: '1px solid var(--border)', background: 'transparent', height: '100%', fontSize: '0.8125rem' }}
                            >
                                <option value="">Select specific...</option>
                            </select>
                        )}
                    </div>
                </div>
            </div>


            {activeTab === 'Readiness' && (
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
                            Before generating, make sure this department has sections, courses, rooms, and teachers. This panel highlights the common setup gaps that usually cause weak or incomplete timetables.
                        </p>
                    </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.75rem' }}>
                    {[
                        { label: 'Sections', value: readiness.sections.length, tone: '#2563eb' },
                        { label: 'Courses', value: readiness.courses.length, tone: '#7c3aed' },
                        { label: 'Rooms', value: readiness.rooms.length, tone: '#059669' },
                        { label: 'Teachers', value: readiness.teachers.length, tone: '#d97706' },
                        { label: 'Batches', value: batches.length, tone: '#0891b2' },
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
            )}

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

            {generationResult && generationResult.incomplete_workloads.length > 0 && (
                <div
                    className="card"
                    style={{
                        overflow: 'hidden',
                        border: '1px solid rgba(245, 158, 11, 0.18)',
                        background: 'rgba(245, 158, 11, 0.04)',
                    }}
                >
                    <div
                        style={{
                            padding: '1rem 1.25rem',
                            borderBottom: '1px solid rgba(245, 158, 11, 0.18)',
                            display: 'flex',
                            justifyContent: 'space-between',
                            gap: '1rem',
                            alignItems: 'center',
                            flexWrap: 'wrap',
                        }}
                    >
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.3rem' }}>
                                <AlertCircle size={18} color="#d97706" />
                                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                                    Unscheduled Workloads
                                </h3>
                            </div>
                            <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                                These courses or batches could not be placed with the current rooms, faculty, and timetable rules.
                            </p>
                        </div>
                        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                            <div className="card" style={{ padding: '0.75rem 1rem', background: 'var(--bg-card)' }}>
                                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Unscheduled items</div>
                                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#d97706' }}>
                                    {generationResult.incomplete_workloads.length}
                                </div>
                            </div>
                            <div className="card" style={{ padding: '0.75rem 1rem', background: 'var(--bg-card)' }}>
                                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Affected sections</div>
                                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                                    {unscheduledSectionCounts.length}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div style={{ padding: '1rem 1.25rem', display: 'grid', gap: '1rem' }}>
                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                            {unscheduledSectionCounts.slice(0, 8).map(([sectionName, count]) => (
                                <span
                                    key={sectionName}
                                    style={{
                                        fontSize: '0.75rem',
                                        fontWeight: 600,
                                        color: '#92400e',
                                        background: 'rgba(245, 158, 11, 0.12)',
                                        border: '1px solid rgba(245, 158, 11, 0.18)',
                                        borderRadius: '999px',
                                        padding: '0.3rem 0.65rem',
                                    }}
                                >
                                    {sectionName}: {count}
                                </span>
                            ))}
                        </div>

                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '760px' }}>
                                <thead>
                                    <tr style={{ background: 'rgba(245, 158, 11, 0.08)' }}>
                                        <th style={{ padding: '0.75rem', textAlign: 'left', fontSize: '0.75rem', borderBottom: '1px solid var(--border)' }}>Section</th>
                                        <th style={{ padding: '0.75rem', textAlign: 'left', fontSize: '0.75rem', borderBottom: '1px solid var(--border)' }}>Course</th>
                                        <th style={{ padding: '0.75rem', textAlign: 'left', fontSize: '0.75rem', borderBottom: '1px solid var(--border)' }}>Teacher</th>
                                        <th style={{ padding: '0.75rem', textAlign: 'left', fontSize: '0.75rem', borderBottom: '1px solid var(--border)' }}>Allocated</th>
                                        <th style={{ padding: '0.75rem', textAlign: 'left', fontSize: '0.75rem', borderBottom: '1px solid var(--border)' }}>Reason</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {generationResult.incomplete_workloads.map(item => (
                                        <tr key={`${item.section}-${item.course}-${item.reason}`}>
                                            <td style={{ padding: '0.75rem', fontSize: '0.8125rem', borderBottom: '1px solid var(--border)' }}>{item.section}</td>
                                            <td style={{ padding: '0.75rem', fontSize: '0.8125rem', borderBottom: '1px solid var(--border)', fontWeight: 600 }}>{item.course}</td>
                                            <td style={{ padding: '0.75rem', fontSize: '0.8125rem', borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>{item.teacher}</td>
                                            <td style={{ padding: '0.75rem', fontSize: '0.8125rem', borderBottom: '1px solid var(--border)' }}>
                                                {item.required ? `${item.allocated}/${item.required}` : item.allocated}
                                            </td>
                                            <td style={{ padding: '0.75rem', fontSize: '0.8125rem', borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>{item.reason}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'Schedule' && (
                <>
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
                                        : selectedDeptId === 'all' 
                                            ? 'Run the AI generator to create a workable first draft for all departments in the university.'
                                            : 'Run the AI generator to create a workable first draft for this department.'
                                }
                                action={
                                    <button className="btn btn-primary" onClick={handleGenerate} disabled={generationDisabled} style={{ marginTop: '1.5rem' }}>
                                        {generating ? <Spinner size={16} /> : <Play size={16} />}
                                        {selectedDeptId === 'all' ? 'Generate All Timetables' : 'Generate Timetable Now'}
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
                            </div>

                            <BatchTimetableView
                                timetable={filteredTimetable}
                                batches={visibleBatches}
                                sections={readiness.sections}
                                teachers={readiness.teachers}
                                workingDays={workingDays}
                                displaySlots={displaySlots}
                                onDelete={handleDeleteEntry}
                                conflictIds={entriesWithConflicts}
                            />
                        </div>
                    )}
                </>
            )}

            {/* Legend Section */}
            {activeTab === 'Faculty' && (
                <div style={{ animation: 'fadeIn 0.5s ease-out' }}>
                    <div style={{ 
                        padding: '0.5rem 0', 
                        marginBottom: '1.5rem',
                        display: 'flex',
                        alignItems: 'baseline',
                        gap: '0.75rem'
                    }}>
                        <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.025em' }}>Faculty Directory</h2>
                        <span style={{ fontSize: '0.9375rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                            {teacherLegend.length} instructors active in this view
                        </span>
                    </div>

                    <div style={{ 
                        display: 'grid', 
                        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', 
                        gap: '1.25rem'
                    }}>
                        {teacherLegend.map((teacher) => {
                            const tColor = getTeacherColor(teacher.fullName);
                            return (
                                <div 
                                    key={teacher.id} 
                                    className="card teacher-card"
                                    style={{ 
                                        padding: '1rem',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '1rem',
                                        background: 'var(--bg-card)',
                                        borderRadius: '1.25rem',
                                        border: '1px solid var(--border)',
                                        boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                                        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                        cursor: 'default',
                                        position: 'relative',
                                        overflow: 'hidden'
                                    }}
                                >
                                    <div style={{ 
                                        width: '3rem', 
                                        height: '3rem', 
                                        borderRadius: '12px', 
                                        background: tColor, 
                                        color: '#000',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: '1rem',
                                        fontWeight: 800,
                                        boxShadow: `0 4px 12px ${tColor}33`,
                                        zIndex: 1
                                    }}>
                                        {teacher.shortName || teacher.fullName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0, zIndex: 1 }}>
                                        <div style={{ 
                                            fontSize: '0.9375rem', 
                                            fontWeight: 700, 
                                            color: 'var(--text-primary)',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            whiteSpace: 'nowrap'
                                        }}>
                                            {teacher.fullName}
                                        </div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.1rem' }}>
                                            Faculty ID: #{teacher.id}
                                        </div>
                                    </div>
                                    <div style={{ 
                                        position: 'absolute', 
                                        top: 0, 
                                        bottom: 0, 
                                        left: 0, 
                                        width: '4px', 
                                        background: tColor,
                                        opacity: 0.8
                                    }} />
                                </div>
                            );
                        })}
                    </div>
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
                        Pick a course first. Room options will prefer a matching capacity and room type.
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
                                </option>
                            ))}
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
                                    workingDays.forEach((d: string) => {
                                        timeSlots.forEach((s: string) => {
                                            const hasConf = timetable.some((e: TimetableEntry) => {
                                                if (e.id === suggestingEntry.id) return false;
                                                if (e.day !== d || e.timeslot !== s) return false;
                                                
                                                const teacherConflict = e.teacher?.id === suggestingEntry.teacher?.id;
                                                const roomConflict = e.room?.id === suggestingEntry.room?.id;
                                                const sectionConflict = e.sections?.some(as => 
                                                    suggestingEntry.sections?.some(es => es.id === as.id)
                                                );

                                                return teacherConflict || roomConflict || sectionConflict;
                                            });
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

function DraggableCard({ entry, onDelete, hasConflict, onResolve, batches, sections }: { entry: TimetableEntry; onDelete: () => void; hasConflict?: boolean; onResolve?: () => void; batches: Batch[]; sections: Section[] }) {
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
        id: entry.id,
    });

    const style = {
        transform: CSS.Translate.toString(transform),
        opacity: isDragging ? 0 : 1,
        cursor: 'default',
    };

    return (
        <div ref={setNodeRef} style={style} className={`card ${hasConflict ? 'border-danger' : ''}`}>
            <div
                style={{
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
                    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
                }}
            >
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
                        opacity: 0.6,
                    }}
                >
                    <GripVertical size={12} />
                </div>

                {hasConflict && (
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onResolve?.();
                        }}
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
                            fontWeight: 600,
                        }}
                        title="Find conflict-free slot"
                    >
                        <Zap size={8} /> Fix
                    </button>
                )}

                <div style={{ paddingRight: '1.5rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.25rem' }}>
                        <div
                            style={{
                                fontSize: '0.6875rem',
                                fontWeight: 600,
                                color: hasConflict ? '#dc2626' : 'var(--text-primary)',
                                overflow: 'hidden',
                                whiteSpace: 'nowrap',
                                textOverflow: 'ellipsis',
                                maxWidth: '70%',
                                lineHeight: '1.2',
                            }}
                        >
                            {entry.course?.name}
                        </div>
                        <div style={{ display: 'flex', gap: '2px' }}>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onDelete();
                                }}
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    padding: '0',
                                    color: '#ef4444',
                                    cursor: 'pointer',
                                    opacity: 0.6,
                                    fontSize: '0.75rem',
                                }}
                                title="Delete entry"
                            >
                                <Trash2 size={10} />
                            </button>
                        </div>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px' }}>
                        {entry.sections?.map((s) => {
                            const fullSection = sections.find((sec) => sec.id === s.id);
                            const batch = fullSection ? batches.find((b) => b.id === fullSection.batch_id) : null;
                            return (
                                <span
                                    key={s.id}
                                    style={{
                                        fontSize: '0.5625rem',
                                        padding: '1px 4px',
                                        background: 'rgba(255, 255, 255, 0.8)',
                                        border: '1px solid var(--border)',
                                        borderRadius: '3px',
                                        color: 'var(--text-secondary)',
                                        fontWeight: 500,
                                    }}
                                >
                                    {s.name}
                                    {batch ? ` (${batch.name})` : ''}
                                </span>
                            );
                        })}
                    </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.125rem', fontSize: '0.5625rem', color: 'var(--text-secondary)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        <User size={8} /> {entry.teacher?.name?.split(' ').map((n) => n[0]).join('').toUpperCase()}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        <MapPin size={8} /> {entry.room?.name}
                    </div>
                </div>
            </div>
        </div>
    );
}

function MultiHourCard({ session, onDelete, hasConflict, onResolve, batches, sections }: { session: { entry: TimetableEntry; duration: number; slots: string[] }; onDelete: () => void; hasConflict?: boolean; onResolve?: () => void; batches: Batch[]; sections: Section[] }) {
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
        id: session.entry.id,
    });

    const style = {
        transform: CSS.Translate.toString(transform),
        opacity: isDragging ? 0 : 1,
        cursor: 'default',
    };

    return (
        <div ref={setNodeRef} style={style} className={`card ${hasConflict ? 'border-danger' : ''}`}>
            <div
                style={{
                    minHeight: '70px',
                    padding: '0.75rem',
                    borderLeft: `3px solid ${hasConflict ? '#ef4444' : '#10b981'}`,
                    background: hasConflict ? 'rgba(239, 68, 68, 0.05)' : 'rgba(16, 185, 129, 0.05)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    position: 'relative',
                    borderRadius: '0.5rem',
                    border: '1px solid var(--border)',
                    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
                }}
            >
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
                        opacity: 0.6,
                    }}
                >
                    <GripVertical size={12} />
                </div>

                {hasConflict && (
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onResolve?.();
                        }}
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
                            fontWeight: 600,
                        }}
                        title="Find conflict-free slot"
                    >
                        <Zap size={8} /> Fix
                    </button>
                )}

                <div style={{ paddingRight: '1.5rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.25rem' }}>
                        <div
                            style={{
                                fontSize: '0.6875rem',
                                fontWeight: 600,
                                color: hasConflict ? '#dc2626' : '#059669',
                                overflow: 'hidden',
                                whiteSpace: 'nowrap',
                                textOverflow: 'ellipsis',
                                maxWidth: '70%',
                                lineHeight: '1.2',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.25rem',
                            }}
                        >
                            {session.entry.course?.name}
                            <span
                                style={{
                                    fontSize: '0.5625rem',
                                    padding: '1px 3px',
                                    background: '#10b981',
                                    color: 'white',
                                    borderRadius: '3px',
                                    fontWeight: 500,
                                }}
                            >
                                {session.duration}h
                            </span>
                        </div>
                        <div style={{ display: 'flex', gap: '2px' }}>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onDelete();
                                }}
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    padding: '0',
                                    color: '#ef4444',
                                    cursor: 'pointer',
                                    opacity: 0.6,
                                    fontSize: '0.75rem',
                                }}
                                title="Delete entry"
                            >
                                <Trash2 size={10} />
                            </button>
                        </div>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px' }}>
                        {session.entry.sections?.map((s) => {
                            const fullSection = sections.find((sec) => sec.id === s.id);
                            const batch = fullSection ? batches.find((b) => b.id === fullSection.batch_id) : null;
                            return (
                                <span
                                    key={s.id}
                                    style={{
                                        fontSize: '0.5625rem',
                                        padding: '1px 4px',
                                        background: 'rgba(255, 255, 255, 0.8)',
                                        border: '1px solid var(--border)',
                                        borderRadius: '3px',
                                        color: 'var(--text-secondary)',
                                        fontWeight: 500,
                                    }}
                                >
                                    {s.name}
                                    {batch ? ` (${batch.name})` : ''}
                                </span>
                            );
                        })}
                    </div>
                    <div style={{ fontSize: '0.5625rem', color: 'var(--text-muted)', marginTop: '0.125rem' }}>{session.slots.join(' - ')}</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.125rem', fontSize: '0.5625rem', color: 'var(--text-secondary)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        <User size={8} /> {session.entry.teacher?.name?.split(' ').map((n) => n[0]).join('').toUpperCase()}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        <MapPin size={8} /> {session.entry.room?.name}
                    </div>
                </div>
            </div>
        </div>
    );
}

function DroppableCell({ id, children, onAdd, isConflict, multiHourSession }: { id: string; children: React.ReactNode; onAdd: () => void; isConflict?: boolean; multiHourSession?: { entry: TimetableEntry; duration: number; slots: string[] } }) {
    const { isOver, setNodeRef } = useDroppable({
        id: id,
    });

    const style = {
        width: '100%',
        height: '100%',
        minHeight: '80px',
        background: isOver ? (isConflict ? 'rgba(239, 68, 68, 0.1)' : 'rgba(59, 130, 246, 0.1)') : 'var(--bg)',
        borderRadius: '0.5rem',
        transition: 'all 0.2s ease',
        border: '1px solid var(--border)',
        position: 'relative' as const,
        padding: '0.5rem',
    };

    const childElement = React.isValidElement<{ children?: React.ReactNode }>(children) ? children : null;
    const hasEntries = React.Children.count(childElement?.props.children) > 0;

    return (
        <td ref={setNodeRef} colSpan={multiHourSession?.duration} style={{ padding: '0.25rem', backgroundColor: 'var(--bg-main)', verticalAlign: 'top' }}>
            <div style={style}>
                {isOver && isConflict && (
                    <div
                        style={{
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
                            gap: '4px',
                        }}
                    >
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
                            transition: 'all 0.2s ease',
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.opacity = '0.8';
                            e.currentTarget.style.borderColor = 'var(--primary)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.opacity = '0.4';
                            e.currentTarget.style.borderColor = 'var(--border)';
                        }}
                    >
                        <Plus size={20} />
                    </div>
                )}
            </div>
        </td>
    );
}
