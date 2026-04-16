import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
    Building2, Users, BookOpen, DoorOpen, CalendarDays,
    Layers, GraduationCap, Briefcase, ArrowRight, Zap, TrendingUp, Activity,
} from 'lucide-react'
import { departmentService, teacherService, courseService, roomService } from '@/services/resources.service'
import { schedulingService } from '@/services/scheduling.service'
import { useAuth } from '@/context/useAuth'
import { Skeleton } from '@/components/ui/Loading'
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'

interface StatCardProps {
    icon: React.ReactNode
    label: string
    value: number | string
    color: string
    bgColor: string
    path: string
}

function StatCard({ icon, label, value, color, bgColor, path }: StatCardProps) {
    const navigate = useNavigate()
    return (
        <div
            className="stat-card"
            style={{ cursor: 'pointer' }}
            onClick={() => navigate(path)}
        >
            <div style={{
                width: '3rem', height: '3rem', borderRadius: '50%',
                background: bgColor, display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
            }}>
                <span style={{ color }}>{icon}</span>
            </div>
            <div>
                <p style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-display)', lineHeight: 1.2 }}>
                    {value}
                </p>
                <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', fontWeight: 500, marginTop: '0.125rem' }}>
                    {label}
                </p>
            </div>
        </div>
    )
}

const quickActions = [
    { label: 'Departments', icon: <Building2 size={18} />, path: '/departments', color: '#4f46e5' },
    { label: 'Teachers', icon: <Briefcase size={18} />, path: '/teachers', color: '#059669' },
    { label: 'Timetable', icon: <CalendarDays size={18} />, path: '/timetable', color: '#d97706' },
    { label: 'Programs', icon: <Layers size={18} />, path: '/programs', color: '#14b8a6' },
    { label: 'Batches', icon: <GraduationCap size={18} />, path: '/batches', color: '#f43f5e' },
    { label: 'Sections', icon: <Users size={18} />, path: '/sections', color: '#6366f1' },
]

export function DashboardPage() {
    const { user } = useAuth()
    const navigate = useNavigate()
    const [stats, setStats] = useState({
        departments: 0,
        teachers: 0,
        courses: 0,
        rooms: 0,
        total_entries: 0,
        conflicts: 0,
        optimization: 100,
        course_type_dist: [] as any[],
        room_dist: [] as any[],
    })
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        async function fetchStats() {
            try {
                const [depts, teachers, courses, rooms, schedStats] = await Promise.all([
                    departmentService.list(1, 100),
                    teacherService.list(undefined, 1, 100),
                    courseService.list(undefined, 1, 100),
                    roomService.list(undefined, 1, 100),
                    schedulingService.getStats(),
                ])
                setStats({
                    departments: depts.meta.total,
                    teachers: teachers.meta.total,
                    courses: courses.meta.total,
                    rooms: rooms.meta.total,
                    total_entries: schedStats.total_entries,
                    conflicts: schedStats.conflicts,
                    optimization: schedStats.optimization,
                    course_type_dist: schedStats.course_type_dist,
                    room_dist: schedStats.room_dist,
                })
            } catch {
                // ignore
            } finally {
                setLoading(false)
            }
        }
        fetchStats()
    }, [])

    const chartData = [
        { name: 'Depts', value: stats.departments, color: '#4f46e5' },
        { name: 'Teachers', value: stats.teachers, color: '#059669' },
        { name: 'Courses', value: stats.courses, color: '#7c3aed' },
        { name: 'Rooms', value: stats.rooms, color: '#d97706' },
    ]

    const roomCapacityData = stats.room_dist && stats.room_dist.length > 0 ? stats.room_dist.map((r, i) => ({
        ...r, color: ['#60a5fa', '#3b82f6', '#2563eb'][i] || '#3b82f6'
    })) : [
        { name: 'Small (1-20)', value: 0, color: '#60a5fa' },
        { name: 'Medium (21-50)', value: 0, color: '#3b82f6' },
        { name: 'Large (51+)', value: 0, color: '#2563eb' },
    ]

    const circumference = 2 * Math.PI * 45
    const strokeDashoffset = circumference - (stats.optimization / 100) * circumference

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

            {/* 1. Welcome Banner */}
            <div
                className="card"
                style={{
                    padding: '1.5rem 1.75rem',
                    borderLeft: '4px solid #4f46e5',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                }}
            >
                <div>
                    <h2 style={{
                        color: 'var(--text-primary)', fontSize: '1.375rem', fontWeight: 700,
                        fontFamily: 'var(--font-display)', marginBottom: '0.25rem',
                    }}>
                        Welcome back, {user?.username}
                    </h2>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                        Here's an overview of your scheduling system
                    </p>
                </div>
                <button
                    className="btn"
                    onClick={() => navigate('/timetable')}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}
                >
                    <CalendarDays size={15} />
                    Generate Timetable
                    <ArrowRight size={13} />
                </button>
            </div>

            {/* 2. Stats Row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
                {loading ? (
                    Array.from({ length: 4 }).map((_, i) => (
                        <Skeleton key={i} style={{ height: '90px', borderRadius: '0.75rem' }} />
                    ))
                ) : (
                    <>
                        <StatCard icon={<Building2 size={20} />} label="Departments" value={stats.departments}
                            color="#4f46e5" bgColor="rgba(79,70,229,0.12)" path="/departments" />
                        <StatCard icon={<Briefcase size={20} />} label="Teachers" value={stats.teachers}
                            color="#059669" bgColor="rgba(5,150,105,0.12)" path="/teachers" />
                        <StatCard icon={<BookOpen size={20} />} label="Courses" value={stats.courses}
                            color="#7c3aed" bgColor="rgba(124,58,237,0.12)" path="/courses" />
                        <StatCard icon={<DoorOpen size={20} />} label="Rooms" value={stats.rooms}
                            color="#d97706" bgColor="rgba(217,119,6,0.12)" path="/rooms" />
                    </>
                )}
            </div>

            {/* 3. Charts Row: Resource Distribution + Schedule Quality */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                {/* Resource Distribution (Bar Chart) */}
                <div className="card" style={{ padding: '1.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem' }}>
                        <Activity size={18} style={{ color: '#4f46e5' }} />
                        <h3 style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.9375rem', fontFamily: 'var(--font-display)' }}>
                            Resource Distribution
                        </h3>
                    </div>
                    {loading ? (
                        <Skeleton style={{ height: '220px', borderRadius: '0.5rem' }} />
                    ) : (
                        <ResponsiveContainer width="100%" height={240}>
                            <BarChart data={chartData} barSize={36}>
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                                <XAxis dataKey="name" tick={{ fontSize: 12, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                                <YAxis tick={{ fontSize: 12, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                                <Tooltip
                                    contentStyle={{
                                        background: 'var(--bg-card)', border: '1px solid var(--border)',
                                        borderRadius: '0.5rem', fontSize: '0.8125rem',
                                    }}
                                />
                                <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                                    {chartData.map((entry, index) => (
                                        <Cell key={index} fill={entry.color} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    )}
                </div>

                {/* Schedule Quality */}
                <div className="card" style={{ padding: '1.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem' }}>
                        <TrendingUp size={18} style={{ color: '#7c3aed' }} />
                        <h3 style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.9375rem', fontFamily: 'var(--font-display)' }}>
                            Schedule Quality
                        </h3>
                    </div>
                    {!loading && (
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ position: 'relative', width: '160px', height: '160px', margin: '0 auto' }}>
                                <svg width="160" height="160" viewBox="0 0 100 100">
                                    <circle cx="50" cy="50" r="45" fill="none" stroke="var(--border)" strokeWidth="6" />
                                    <circle
                                        cx="50" cy="50" r="45" fill="none" stroke="#4f46e5" strokeWidth="6"
                                        strokeDasharray={circumference}
                                        strokeDashoffset={strokeDashoffset}
                                        strokeLinecap="round"
                                        transform="rotate(-90 50 50)"
                                        style={{ transition: 'stroke-dashoffset 0.6s ease' }}
                                    />
                                </svg>
                                <div style={{
                                    position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
                                    alignItems: 'center', justifyContent: 'center',
                                }}>
                                    <span style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>
                                        {stats.optimization}%
                                    </span>
                                    <span style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 500, letterSpacing: '0.05em' }}>
                                        Optimized
                                    </span>
                                </div>
                            </div>
                            <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'center', gap: '2rem' }}>
                                <div style={{ textAlign: 'center' }}>
                                    <p style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                                        {stats.conflicts}
                                    </p>
                                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                        Conflicts
                                    </p>
                                </div>
                                <div style={{ width: '1px', background: 'var(--border)' }} />
                                <div style={{ textAlign: 'center' }}>
                                    <p style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                                        {stats.total_entries}
                                    </p>
                                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                        Lectures Assigned
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* 4. Second Charts Row: Room Capacities + Quick Actions */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                {/* Room Capacities (Horizontal Bar Chart) */}
                <div className="card" style={{ padding: '1.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem' }}>
                        <DoorOpen size={18} style={{ color: '#d97706' }} />
                        <h3 style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.9375rem', fontFamily: 'var(--font-display)' }}>
                            Room Capacities
                        </h3>
                    </div>
                    {loading ? (
                        <Skeleton style={{ height: '220px', borderRadius: '0.5rem' }} />
                    ) : (
                        <ResponsiveContainer width="100%" height={240}>
                            <BarChart data={roomCapacityData} layout="vertical" margin={{ left: 20 }}>
                                <XAxis type="number" hide />
                                <YAxis dataKey="name" type="category" tick={{ fontSize: 12, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                                <Tooltip
                                    contentStyle={{
                                        background: 'var(--bg-card)', border: '1px solid var(--border)',
                                        borderRadius: '0.5rem', fontSize: '0.8125rem',
                                    }}
                                />
                                <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={22}>
                                    {roomCapacityData.map((entry, index) => (
                                        <Cell key={index} fill={entry.color} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    )}
                </div>

                {/* Quick Actions */}
                <div className="card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem' }}>
                        <Zap size={18} style={{ color: '#ef4444' }} />
                        <h3 style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.9375rem', fontFamily: 'var(--font-display)' }}>
                            Quick Controls
                        </h3>
                    </div>
                    <div style={{
                        display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
                        gap: '0.75rem', flex: 1,
                    }}>
                        {quickActions.map(action => (
                            <button
                                key={action.path}
                                onClick={() => navigate(action.path)}
                                className="quick-action-btn"
                                style={{
                                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem',
                                    padding: '1rem 0.5rem', borderRadius: '0.625rem',
                                    background: 'var(--bg-card)', border: '1px solid var(--border)',
                                    cursor: 'pointer', transition: 'all 0.2s ease', textAlign: 'center',
                                }}
                                onMouseEnter={e => {
                                    e.currentTarget.style.borderColor = action.color
                                    e.currentTarget.style.background = `${action.color}0a`
                                    e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.06)'
                                }}
                                onMouseLeave={e => {
                                    e.currentTarget.style.borderColor = 'var(--border)'
                                    e.currentTarget.style.background = 'var(--bg-card)'
                                    e.currentTarget.style.boxShadow = 'none'
                                }}
                            >
                                <div style={{ color: action.color }}>{action.icon}</div>
                                <span style={{ fontWeight: 600, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                    {action.label}
                                </span>
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* 5. System Activity */}
            <div className="card" style={{ padding: '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem' }}>
                    <Activity size={18} style={{ color: '#4f46e5' }} />
                    <h3 style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.9375rem', fontFamily: 'var(--font-display)' }}>
                        System Activity
                    </h3>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
                    {[
                        { action: 'Schedule Generated', user: 'Admin', time: '2m ago', type: 'success' as const },
                        { action: 'Teacher Added: Dr. Alice', user: 'Admin', time: '1h ago', type: 'info' as const },
                        { action: 'Room Reserved: Lab 101', user: 'Admin', time: '3h ago', type: 'info' as const },
                    ].map((item, i) => (
                        <div key={i} style={{
                            display: 'flex', alignItems: 'center', gap: '0.875rem',
                            padding: '0.625rem 0',
                            borderBottom: i < 2 ? '1px solid var(--border)' : 'none',
                        }}>
                            <div style={{
                                width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0,
                                background: item.type === 'success' ? '#059669' : '#4f46e5',
                            }} />
                            <div style={{ flex: 1 }}>
                                <p style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-primary)' }}>
                                    {item.action}
                                </p>
                                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                    by {item.user}
                                </p>
                            </div>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', flexShrink: 0 }}>
                                {item.time}
                            </span>
                        </div>
                    ))}
                </div>
            </div>

            {/* 6. Additional Info Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
                {[
                    { icon: <Layers size={20} />, title: 'Programs', desc: 'Create and manage academic programs under departments', path: '/programs', color: '#14b8a6' },
                    { icon: <GraduationCap size={20} />, title: 'Batches', desc: 'Organize students into year-based batches', path: '/batches', color: '#f43f5e' },
                    { icon: <Users size={20} />, title: 'Sections', desc: 'Divide batches into smaller sections', path: '/sections', color: '#6366f1' },
                ].map(item => (
                    <button
                        key={item.path}
                        onClick={() => navigate(item.path)}
                        className="card"
                        style={{
                            padding: '1.25rem', cursor: 'pointer', textAlign: 'left',
                            transition: 'all 0.2s ease', background: 'var(--bg-card)',
                            border: '1px solid var(--border)', width: '100%',
                        }}
                        onMouseEnter={e => {
                            (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)'
                            (e.currentTarget as HTMLElement).style.borderColor = item.color
                            (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'
                        }}
                        onMouseLeave={e => {
                            (e.currentTarget as HTMLElement).style.boxShadow = 'none'
                            (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'
                            (e.currentTarget as HTMLElement).style.transform = 'translateY(0)'
                        }}
                    >
                        <div style={{
                            width: '2.25rem', height: '2.25rem', borderRadius: '0.5rem',
                            background: `${item.color}15`, display: 'flex', alignItems: 'center',
                            justifyContent: 'center', marginBottom: '0.875rem',
                        }}>
                            <span style={{ color: item.color }}>{item.icon}</span>
                        </div>
                        <p style={{
                            fontWeight: 600, fontSize: '0.9375rem', color: 'var(--text-primary)',
                            marginBottom: '0.375rem', fontFamily: 'var(--font-display)',
                        }}>
                            {item.title}
                        </p>
                        <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                            {item.desc}
                        </p>
                    </button>
                ))}
            </div>
        </div>
    )
}
