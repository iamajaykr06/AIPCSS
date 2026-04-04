import { useEffect, useState } from 'react'
import {
  Settings, Clock, Calendar, Coffee, RotateCcw, Save, Eye, Plus, Trash2,
  AlertCircle, Check, ChevronRight, Sun, Moon, Timer, LayoutGrid,
  GraduationCap, ArrowRight, Sparkles, X, GripVertical
} from 'lucide-react'
import { useToast } from '@/context/ToastContext'
import { settingsService } from '@/services/settings.service'
import type { ScheduleSettings, DayOfWeek, ScheduleTimeSlot, ScheduleBreak } from '@/types'

const DAYS_OF_WEEK: DayOfWeek[] = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

const DAY_COLORS: Record<DayOfWeek, { bg: string; border: string; text: string }> = {
  Monday: { bg: 'bg-blue-500/10', border: 'border-blue-500/30', text: 'text-blue-600 dark:text-blue-400' },
  Tuesday: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', text: 'text-emerald-600 dark:text-emerald-400' },
  Wednesday: { bg: 'bg-violet-500/10', border: 'border-violet-500/30', text: 'text-violet-600 dark:text-violet-400' },
  Thursday: { bg: 'bg-amber-500/10', border: 'border-amber-500/30', text: 'text-amber-600 dark:text-amber-400' },
  Friday: { bg: 'bg-rose-500/10', border: 'border-rose-500/30', text: 'text-rose-600 dark:text-rose-400' },
  Saturday: { bg: 'bg-cyan-500/10', border: 'border-cyan-500/30', text: 'text-cyan-600 dark:text-cyan-400' },
  Sunday: { bg: 'bg-pink-500/10', border: 'border-pink-500/30', text: 'text-pink-600 dark:text-pink-400' },
}

export function SettingsPage() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [settings, setSettings] = useState<ScheduleSettings | null>(null)
  const [activeTab, setActiveTab] = useState<'general' | 'timeslots' | 'breaks' | 'preview'>('general')
  const [hasChanges, setHasChanges] = useState(false)

  // Form states
  const [workingDays, setWorkingDays] = useState<DayOfWeek[]>([])
  const [timeSlots, setTimeSlots] = useState<ScheduleTimeSlot[]>([])
  const [breaks, setBreaks] = useState<ScheduleBreak[]>([])
  const [slotDuration, setSlotDuration] = useState(60)
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('16:00')
  const [maxConsecutive, setMaxConsecutive] = useState(3)
  const [minBreak, setMinBreak] = useState(0)

  // New slot/break form states
  const [showAddSlot, setShowAddSlot] = useState(false)
  const [showAddBreak, setShowAddBreak] = useState(false)
  const [newSlotStart, setNewSlotStart] = useState('')
  const [newSlotEnd, setNewSlotEnd] = useState('')
  const [newSlotLabel, setNewSlotLabel] = useState('')
  const [newBreakStart, setNewBreakStart] = useState('')
  const [newBreakEnd, setNewBreakEnd] = useState('')
  const [newBreakLabel, setNewBreakLabel] = useState('')
  const [newBreakType, setNewBreakType] = useState<'break' | 'lunch'>('break')

  useEffect(() => {
    loadSettings()
  }, [])

  // Track changes
  useEffect(() => {
    if (settings) {
      const changed =
        JSON.stringify(workingDays) !== JSON.stringify(settings.working_days) ||
        JSON.stringify(timeSlots) !== JSON.stringify(settings.time_slots) ||
        JSON.stringify(breaks) !== JSON.stringify(settings.breaks) ||
        slotDuration !== settings.slot_duration_minutes ||
        startTime !== settings.start_time ||
        endTime !== settings.end_time ||
        maxConsecutive !== settings.max_consecutive_slots ||
        minBreak !== settings.min_break_between_classes
      setHasChanges(changed)
    }
  }, [workingDays, timeSlots, breaks, slotDuration, startTime, endTime, maxConsecutive, minBreak, settings])

  const loadSettings = async () => {
    try {
      setLoading(true)
      const data = await settingsService.getScheduleSettings()
      setSettings(data)
      setWorkingDays(data.working_days)
      setTimeSlots(data.time_slots)
      setBreaks(data.breaks)
      setSlotDuration(data.slot_duration_minutes)
      setStartTime(data.start_time)
      setEndTime(data.end_time)
      setMaxConsecutive(data.max_consecutive_slots)
      setMinBreak(data.min_break_between_classes)
    } catch {
      toast('error', 'Failed to load settings')
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    try {
      setSaving(true)
      await settingsService.updateScheduleSettings({
        working_days: workingDays,
        time_slots: timeSlots,
        breaks: breaks,
        slot_duration_minutes: slotDuration,
        start_time: startTime,
        end_time: endTime,
        max_consecutive_slots: maxConsecutive,
        min_break_between_classes: minBreak,
      })
      toast('success', 'Settings saved successfully')
      setHasChanges(false)
      loadSettings()
    } catch {
      toast('error', 'Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  const handleReset = async () => {
    if (!confirm('Reset all settings to defaults? This cannot be undone.')) return
    try {
      setSaving(true)
      await settingsService.resetScheduleSettings()
      toast('success', 'Settings reset to defaults')
      setHasChanges(false)
      loadSettings()
    } catch {
      toast('error', 'Failed to reset settings')
    } finally {
      setSaving(false)
    }
  }

  const toggleWorkingDay = (day: DayOfWeek) => {
    setWorkingDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    )
  }

  const addTimeSlot = () => {
    if (!newSlotStart || !newSlotEnd) return
    const newSlot: ScheduleTimeSlot = {
      start: newSlotStart,
      end: newSlotEnd,
      label: newSlotLabel || `Period ${timeSlots.length + 1}`,
    }
    setTimeSlots(prev => [...prev, newSlot].sort((a, b) => a.start.localeCompare(b.start)))
    setNewSlotStart('')
    setNewSlotEnd('')
    setNewSlotLabel('')
    setShowAddSlot(false)
    toast('success', 'Time slot added')
  }

  const removeTimeSlot = (index: number) => {
    setTimeSlots(prev => prev.filter((_, i) => i !== index))
  }

  const addBreak = () => {
    if (!newBreakStart || !newBreakEnd) return
    const newBrk: ScheduleBreak = {
      start: newBreakStart,
      end: newBreakEnd,
      label: newBreakLabel || (newBreakType === 'lunch' ? 'Lunch Break' : 'Break'),
      type: newBreakType,
    }
    setBreaks(prev => [...prev, newBrk].sort((a, b) => a.start.localeCompare(b.start)))
    setNewBreakStart('')
    setNewBreakEnd('')
    setNewBreakLabel('')
    setShowAddBreak(false)
    toast('success', 'Break added')
  }

  const removeBreak = (index: number) => {
    setBreaks(prev => prev.filter((_, i) => i !== index))
  }

  const generateTimeSlots = () => {
    const slots: ScheduleTimeSlot[] = []
    let slotNum = 1

    const timeToMinutes = (time: string) => {
      const [h, m] = time.split(':').map(Number)
      return h * 60 + m
    }

    const minutesToTime = (minutes: number) => {
      const h = Math.floor(minutes / 60)
      const m = minutes % 60
      return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`
    }

    let currentMinutes = timeToMinutes(startTime)
    const endMinutes = timeToMinutes(endTime)

    while (currentMinutes + slotDuration <= endMinutes) {
      const start = minutesToTime(currentMinutes)
      const end = minutesToTime(currentMinutes + slotDuration)
      slots.push({ start, end, label: `Period ${slotNum}` })
      currentMinutes += slotDuration
      slotNum++
    }

    setTimeSlots(slots)
    toast('success', `Generated ${slots.length} time slots`)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-primary-500/30 border-t-primary-500 rounded-full animate-spin" />
          <p className="text-surface-500 text-sm">Loading settings...</p>
        </div>
      </div>
    )
  }

  const StatCard = ({ icon: Icon, label, value, color }: { icon: any, label: string, value: string | number, color: string }) => (
    <div className="card p-4 hover:shadow-elevated transition-all duration-300 group">
      <div className="flex items-center gap-4">
        <div className={`w-12 h-12 rounded-xl ${color} flex items-center justify-center transition-transform group-hover:scale-110`}>
          <Icon size={22} className="text-white" />
        </div>
        <div>
          <p className="text-xs text-surface-500 font-medium uppercase tracking-wide">{label}</p>
          <p className="text-2xl font-bold text-surface-800 dark:text-surface-100">{value}</p>
        </div>
      </div>
    </div>
  )

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-surface-900 dark:text-surface-100 flex items-center gap-2">
            <Settings className="text-primary-500" />
            Schedule Settings
          </h1>
          <p className="text-surface-500 mt-1">
            Configure your institution's scheduling parameters and constraints
          </p>
        </div>
        <div className="flex items-center gap-3">
          {hasChanges && (
            <span className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1 bg-amber-100 dark:bg-amber-900/30 px-3 py-1.5 rounded-full">
              <AlertCircle size={14} />
              Unsaved changes
            </span>
          )}
          <button onClick={handleReset} className="btn btn-secondary" disabled={saving}>
            <RotateCcw size={16} />
            Reset
          </button>
          <button
            onClick={handleSave}
            className="btn btn-primary"
            disabled={saving || !hasChanges}
          >
            <Save size={16} />
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          icon={Calendar}
          label="Working Days"
          value={workingDays.length}
          color="bg-gradient-to-br from-blue-500 to-blue-600"
        />
        <StatCard
          icon={Clock}
          label="Time Slots"
          value={timeSlots.length}
          color="bg-gradient-to-br from-emerald-500 to-emerald-600"
        />
        <StatCard
          icon={Coffee}
          label="Breaks"
          value={breaks.length}
          color="bg-gradient-to-br from-amber-500 to-amber-600"
        />
        <StatCard
          icon={Timer}
          label="Duration"
          value={`${slotDuration}m`}
          color="bg-gradient-to-br from-violet-500 to-violet-600"
        />
      </div>

      {/* Modern Tab Navigation */}
      <div className="flex flex-wrap gap-2 p-1.5 bg-surface-100/50 dark:bg-surface-800/50 rounded-2xl">
        {[
          { id: 'general', label: 'General', icon: Settings, desc: 'Days & basic config' },
          { id: 'timeslots', label: 'Time Slots', icon: Clock, desc: 'Class periods' },
          { id: 'breaks', label: 'Breaks', icon: Coffee, desc: 'Rest periods' },
          { id: 'preview', label: 'Preview', icon: LayoutGrid, desc: 'Visual overview' },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex-1 min-w-[140px] flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 ${
              activeTab === tab.id
                ? 'bg-white dark:bg-surface-800 shadow-elevated text-primary-600 dark:text-primary-400'
                : 'hover:bg-white/50 dark:hover:bg-surface-800/50 text-surface-600 dark:text-surface-400'
            }`}
          >
            <tab.icon size={18} className={activeTab === tab.id ? 'text-primary-500' : ''} />
            <div className="text-left">
              <p className="font-semibold text-sm">{tab.label}</p>
              <p className="text-xs opacity-70">{tab.desc}</p>
            </div>
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="card p-6">
        {/* General Tab */}
        {activeTab === 'general' && (
          <div className="space-y-8 animate-in fade-in duration-300">
            {/* Working Days Section */}
            <section>
              <div className="flex items-center gap-2 mb-4">
                <Sun className="text-amber-500" size={20} />
                <h3 className="text-lg font-semibold">Working Days</h3>
                <span className="text-xs text-surface-400 ml-2">Select days when classes are held</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-3">
                {DAYS_OF_WEEK.map(day => {
                  const isSelected = workingDays.includes(day)
                  const colors = DAY_COLORS[day]
                  return (
                    <button
                      key={day}
                      onClick={() => toggleWorkingDay(day)}
                      className={`relative p-4 rounded-xl border-2 transition-all duration-200 flex flex-col items-center gap-2 ${
                        isSelected
                          ? `${colors.bg} ${colors.border} ${colors.text} shadow-md`
                          : 'bg-surface-50 dark:bg-surface-800/50 border-surface-200 dark:border-surface-700 hover:border-surface-300'
                      }`}
                    >
                      {isSelected && (
                        <div className="absolute top-1.5 right-1.5">
                          <Check size={12} className={colors.text} />
                        </div>
                      )}
                      <span className="text-2xl font-bold">{day.slice(0, 2)}</span>
                      <span className="text-xs font-medium">{day}</span>
                    </button>
                  )
                })}
              </div>
            </section>

            {/* Time Configuration */}
            <section>
              <div className="flex items-center gap-2 mb-4">
                <Clock className="text-primary-500" size={20} />
                <h3 className="text-lg font-semibold">Time Configuration</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-surface-700 dark:text-surface-300">Slot Duration (minutes)</label>
                  <input
                    type="number"
                    min={15}
                    max={180}
                    step={5}
                    value={slotDuration}
                    onChange={e => setSlotDuration(Number(e.target.value))}
                    className="input w-full"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-surface-700 dark:text-surface-300">Start Time</label>
                  <input
                    type="time"
                    value={startTime}
                    onChange={e => setStartTime(e.target.value)}
                    className="input w-full"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-surface-700 dark:text-surface-300">End Time</label>
                  <input
                    type="time"
                    value={endTime}
                    onChange={e => setEndTime(e.target.value)}
                    className="input w-full"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-surface-700 dark:text-surface-300">Max Consecutive</label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={maxConsecutive}
                    onChange={e => setMaxConsecutive(Number(e.target.value))}
                    className="input w-full"
                  />
                </div>
              </div>
            </section>

            {/* Constraints */}
            <section>
              <div className="flex items-center gap-2 mb-4">
                <GraduationCap className="text-emerald-500" size={20} />
                <h3 className="text-lg font-semibold">Scheduling Constraints</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 bg-surface-50 dark:bg-surface-800/50 rounded-xl">
                  <label className="text-sm font-medium text-surface-700 dark:text-surface-300 block mb-2">
                    Minimum Break Between Classes
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min={0}
                      max={60}
                      step={5}
                      value={minBreak}
                      onChange={e => setMinBreak(Number(e.target.value))}
                      className="flex-1 accent-primary-500"
                    />
                    <span className="text-sm font-semibold w-16 text-right">{minBreak}m</span>
                  </div>
                </div>
                <div className="p-4 bg-surface-50 dark:bg-surface-800/50 rounded-xl">
                  <label className="text-sm font-medium text-surface-700 dark:text-surface-300 block mb-2">
                    Max Consecutive Slots
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min={1}
                      max={8}
                      value={maxConsecutive}
                      onChange={e => setMaxConsecutive(Number(e.target.value))}
                      className="flex-1 accent-primary-500"
                    />
                    <span className="text-sm font-semibold w-16 text-right">{maxConsecutive}</span>
                  </div>
                </div>
              </div>
            </section>
          </div>
        )}

        {/* Time Slots Tab */}
        {activeTab === 'timeslots' && (
          <div className="space-y-6 animate-in fade-in duration-300">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold">Time Slots</h3>
                <p className="text-sm text-surface-500">Define the class periods for your schedule</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={generateTimeSlots}
                  className="btn btn-secondary"
                >
                  <Sparkles size={16} className="text-amber-500" />
                  Auto Generate
                </button>
                <button
                  onClick={() => setShowAddSlot(true)}
                  className="btn btn-primary"
                >
                  <Plus size={16} />
                  Add Slot
                </button>
              </div>
            </div>

            {showAddSlot && (
              <div className="p-4 bg-primary-50/50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800 rounded-xl animate-in slide-in-from-top-2">
                <div className="flex items-end gap-3 flex-wrap">
                  <div className="flex-1 min-w-[140px]">
                    <label className="text-xs font-medium text-surface-600 dark:text-surface-400 block mb-1">Start</label>
                    <input
                      type="time"
                      value={newSlotStart}
                      onChange={e => setNewSlotStart(e.target.value)}
                      className="input w-full"
                    />
                  </div>
                  <ArrowRight className="text-surface-400 mb-3" size={16} />
                  <div className="flex-1 min-w-[140px]">
                    <label className="text-xs font-medium text-surface-600 dark:text-surface-400 block mb-1">End</label>
                    <input
                      type="time"
                      value={newSlotEnd}
                      onChange={e => setNewSlotEnd(e.target.value)}
                      className="input w-full"
                    />
                  </div>
                  <div className="flex-[2] min-w-[180px]">
                    <label className="text-xs font-medium text-surface-600 dark:text-surface-400 block mb-1">Label</label>
                    <input
                      type="text"
                      value={newSlotLabel}
                      onChange={e => setNewSlotLabel(e.target.value)}
                      placeholder={`Period ${timeSlots.length + 1}`}
                      className="input w-full"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button onClick={addTimeSlot} className="btn btn-primary">
                      <Check size={16} />
                    </button>
                    <button onClick={() => setShowAddSlot(false)} className="btn btn-ghost">
                      <X size={16} />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {timeSlots.length === 0 ? (
              <div className="text-center py-12 text-surface-400">
                <Clock size={48} className="mx-auto mb-4 opacity-30" />
                <p>No time slots configured</p>
                <button onClick={() => setShowAddSlot(true)} className="text-primary-500 hover:underline mt-2">
                  Add your first slot
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {timeSlots.map((slot, index) => (
                  <div
                    key={index}
                    className="group flex items-center gap-4 p-4 bg-surface-50 dark:bg-surface-800/50 rounded-xl border border-surface-200 dark:border-surface-700 hover:border-primary-300 dark:hover:border-primary-700 transition-all"
                  >
                    <GripVertical className="text-surface-300 cursor-grab" size={18} />
                    <div className="w-14 h-14 rounded-xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
                      <Clock className="text-primary-500" size={22} />
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold text-surface-800 dark:text-surface-200">{slot.label}</p>
                      <p className="text-sm text-surface-500">{slot.start} - {slot.end}</p>
                    </div>
                    <div className="text-sm text-surface-400">
                      {(() => {
                        const [h1, m1] = slot.start.split(':').map(Number)
                        const [h2, m2] = slot.end.split(':').map(Number)
                        const mins = (h2 * 60 + m2) - (h1 * 60 + m1)
                        return `${mins} min`
                      })()}
                    </div>
                    <button
                      onClick={() => removeTimeSlot(index)}
                      className="opacity-0 group-hover:opacity-100 p-2 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/30 rounded-lg transition-all"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Breaks Tab */}
        {activeTab === 'breaks' && (
          <div className="space-y-6 animate-in fade-in duration-300">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold">Breaks</h3>
                <p className="text-sm text-surface-500">Define rest periods and lunch breaks</p>
              </div>
              <button
                onClick={() => setShowAddBreak(true)}
                className="btn btn-primary"
              >
                <Plus size={16} />
                Add Break
              </button>
            </div>

            {showAddBreak && (
              <div className="p-4 bg-amber-50/50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl animate-in slide-in-from-top-2">
                <div className="flex items-end gap-3 flex-wrap">
                  <div className="flex-1 min-w-[140px]">
                    <label className="text-xs font-medium text-surface-600 dark:text-surface-400 block mb-1">Start</label>
                    <input
                      type="time"
                      value={newBreakStart}
                      onChange={e => setNewBreakStart(e.target.value)}
                      className="input w-full"
                    />
                  </div>
                  <ArrowRight className="text-surface-400 mb-3" size={16} />
                  <div className="flex-1 min-w-[140px]">
                    <label className="text-xs font-medium text-surface-600 dark:text-surface-400 block mb-1">End</label>
                    <input
                      type="time"
                      value={newBreakEnd}
                      onChange={e => setNewBreakEnd(e.target.value)}
                      className="input w-full"
                    />
                  </div>
                  <div className="flex-[2] min-w-[160px]">
                    <label className="text-xs font-medium text-surface-600 dark:text-surface-400 block mb-1">Label</label>
                    <input
                      type="text"
                      value={newBreakLabel}
                      onChange={e => setNewBreakLabel(e.target.value)}
                      placeholder="Break name"
                      className="input w-full"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-surface-600 dark:text-surface-400 block mb-1">Type</label>
                    <select
                      value={newBreakType}
                      onChange={e => setNewBreakType(e.target.value as 'break' | 'lunch')}
                      className="input"
                    >
                      <option value="break">Break</option>
                      <option value="lunch">Lunch</option>
                    </select>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={addBreak} className="btn btn-primary">
                      <Check size={16} />
                    </button>
                    <button onClick={() => setShowAddBreak(false)} className="btn btn-ghost">
                      <X size={16} />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {breaks.length === 0 ? (
              <div className="text-center py-12 text-surface-400">
                <Coffee size={48} className="mx-auto mb-4 opacity-30" />
                <p>No breaks configured</p>
                <button onClick={() => setShowAddBreak(true)} className="text-amber-500 hover:underline mt-2">
                  Add a break
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {breaks.map((brk, index) => (
                  <div
                    key={index}
                    className="group flex items-center gap-4 p-4 bg-amber-50/50 dark:bg-amber-900/20 rounded-xl border border-amber-200 dark:border-amber-800/50 hover:border-amber-300 dark:hover:border-amber-700 transition-all"
                  >
                    <GripVertical className="text-amber-300 cursor-grab" size={18} />
                    <div className="w-14 h-14 rounded-xl bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center">
                      <Coffee className="text-amber-600 dark:text-amber-400" size={22} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-surface-800 dark:text-surface-200">{brk.label}</p>
                        {brk.type && (
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            brk.type === 'lunch'
                              ? 'bg-amber-200 dark:bg-amber-800 text-amber-800 dark:text-amber-200'
                              : 'bg-surface-200 dark:bg-surface-700 text-surface-700 dark:text-surface-300'
                          }`}>
                            {brk.type}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-surface-500">{brk.start} - {brk.end}</p>
                    </div>
                    <div className="text-sm text-surface-400">
                      {(() => {
                        const [h1, m1] = brk.start.split(':').map(Number)
                        const [h2, m2] = brk.end.split(':').map(Number)
                        const mins = (h2 * 60 + m2) - (h1 * 60 + m1)
                        return `${mins} min`
                      })()}
                    </div>
                    <button
                      onClick={() => removeBreak(index)}
                      className="opacity-0 group-hover:opacity-100 p-2 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/30 rounded-lg transition-all"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Preview Tab */}
        {activeTab === 'preview' && (
          <div className="space-y-6 animate-in fade-in duration-300">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold">Schedule Preview</h3>
                <p className="text-sm text-surface-500">Visual representation of your weekly schedule</p>
              </div>
              <div className="flex gap-2 text-xs">
                <span className="flex items-center gap-1 px-2 py-1 bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 rounded">
                  <div className="w-2 h-2 rounded-full bg-primary-500" />
                  Class
                </span>
                <span className="flex items-center gap-1 px-2 py-1 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 rounded">
                  <div className="w-2 h-2 rounded-full bg-amber-500" />
                  Break
                </span>
              </div>
            </div>

            {timeSlots.length === 0 || workingDays.length === 0 ? (
              <div className="text-center py-12 text-surface-400">
                <LayoutGrid size={48} className="mx-auto mb-4 opacity-30" />
                <p>Add working days and time slots to see preview</p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-surface-200 dark:border-surface-700">
                <table className="w-full">
                  <thead>
                    <tr className="bg-surface-100 dark:bg-surface-800">
                      <th className="p-3 text-left text-xs font-semibold text-surface-500 w-28">Time</th>
                      <th className="p-3 text-left text-xs font-semibold text-surface-500 w-32">Type</th>
                      {workingDays.map(day => (
                        <th key={day} className={`p-3 text-center text-xs font-semibold ${DAY_COLORS[day].text}`}>
                          {day.slice(0, 3)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      // Combine slots and breaks, sort by start time
                      const allPeriods = [
                        ...timeSlots.map(s => ({ ...s, periodType: 'slot' as const })),
                        ...breaks.map(b => ({ ...b, periodType: 'break' as const, label: b.label || 'Break' }))
                      ].sort((a, b) => a.start.localeCompare(b.start))

                      return allPeriods.map((period, idx) => {
                        const isBreak = period.periodType === 'break'
                        return (
                          <tr key={idx} className={`border-t border-surface-200 dark:border-surface-700 ${isBreak ? 'bg-amber-50/30 dark:bg-amber-900/10' : ''}`}>
                            <td className="p-3">
                              <div className="text-xs font-medium text-surface-700 dark:text-surface-300">{period.start}</div>
                              <div className="text-xs text-surface-400">{period.end}</div>
                            </td>
                            <td className="p-3">
                              <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium ${
                                isBreak
                                  ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
                                  : 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400'
                              }`}>
                                {isBreak ? <Coffee size={12} /> : <Clock size={12} />}
                                {isBreak ? period.label : 'Class'}
                              </div>
                            </td>
                            {workingDays.map(day => (
                              <td key={day} className="p-2">
                                <div className={`h-10 rounded-lg flex items-center justify-center text-xs font-medium ${
                                  isBreak
                                    ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                                    : 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300 border border-primary-200 dark:border-primary-800'
                                }`}>
                                  {isBreak ? '☕' : period.label}
                                </div>
                              </td>
                            ))}
                          </tr>
                        )
                      })
                    })()}
                  </tbody>
                </table>
              </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-surface-50 dark:bg-surface-800/50 rounded-xl">
              <div className="text-center">
                <p className="text-2xl font-bold text-surface-800 dark:text-surface-100">
                  {timeSlots.length * workingDays.length}
                </p>
                <p className="text-xs text-surface-500">Total Periods/Week</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-surface-800 dark:text-surface-100">
                  {breaks.length * workingDays.length}
                </p>
                <p className="text-xs text-surface-500">Break Slots/Week</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-surface-800 dark:text-surface-100">
                  {timeSlots.length > 0 ? Math.round((timeSlots.length * slotDuration) / 60 * 10) / 10 : 0}h
                </p>
                <p className="text-xs text-surface-500">Hours/Day</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-surface-800 dark:text-surface-100">
                  {workingDays.length > 0 && timeSlots.length > 0
                    ? Math.round(timeSlots.length * slotDuration * workingDays.length / 60 * 10) / 10
                    : 0}h
                </p>
                <p className="text-xs text-surface-500">Hours/Week</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}