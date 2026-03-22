import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
    Building2, Users, BookOpen, DoorOpen, CalendarDays,
    Layers, GraduationCap, Briefcase, ArrowRight, Zap, TrendingUp, Activity,
} from 'lucide-react'
import { departmentService, teacherService, courseService, roomService } from '@/services/resources.service'
import { schedulingService } from '@/services/scheduling.service'
import { useAuth } from '@/context/AuthContext'
import { Skeleton } from '@/components/ui/Loading'
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
    PieChart, Pie, Legend,
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
            <div>
                <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: '0.375rem', fontWeight: 500 }}>
                    {label}
                </p>
                <p style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-display)', lineHeight: 1 }}>
                    {value}
                </p>
            </div>
            <div style={{
                width: '3rem', height: '3rem', borderRadius: '0.875rem',
                background: bgColor, display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
            }}>
                <span style={{ color }}>{icon}</span>
            </div>
        </div>
    )
}

const quickActions = [
    { label: 'Manage Departments', icon: <Building2 size={20} />, path: '/departments', color: '#3b82f6', desc: 'Add or edit departments' },
    { label: 'Add Teachers', icon: <Briefcase size={20} />, path: '/teachers', color: '#10b981', desc: 'Manage teaching staff' },
    { label: 'Generate Timetable', icon: <Zap size={20} />, path: '/timetable', color: '#f59e0b', desc: 'AI schedule generation' },
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
        { name: 'Depts', value: stats.departments, color: '#3b82f6' },
        { name: 'Teachers', value: stats.teachers, color: '#10b981' },
        { name: 'Courses', value: stats.courses, color: '#7c3aed' },
        { name: 'Rooms', value: stats.rooms, color: '#f59e0b' },
    ]

    const roomCapacityData = stats.room_dist && stats.room_dist.length > 0 ? stats.room_dist.map((r, i) => ({
        ...r, color: ['#60a5fa', '#3b82f6', '#2563eb'][i] || '#3b82f6'
    })) : [
        { name: 'Small (1-20)', value: 0, color: '#60a5fa' },
        { name: 'Medium (21-50)', value: 0, color: '#3b82f6' },
        { name: 'Large (51+)', value: 0, color: '#2563eb' },
    ]

    const courseTypeData = stats.course_type_dist && stats.course_type_dist.length > 0 ? stats.course_type_dist.map((c, i) => ({
        ...c, color: i % 2 === 0 ? '#8b5cf6' : '#d946ef'
    })) : [
        { name: 'Theory', value: 0, color: '#8b5cf6' },
        { name: 'Lab', value: 0, color: '#d946ef' },
    ]

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
            {/* Welcome Banner */}
            <div style={{
                background: 'linear-gradient(135deg, #1e40af 0%, #4c1d95 100%)',
                borderRadius: '1.25rem',
                padding: '1.75rem 2rem',
                position: 'relative',
                overflow: 'hidden',
            }}>
                {/* Decorative circles */}
                <div style={{
                    position: 'absolute', width: '300px', height: '300px', borderRadius: '50%',
                    background: 'rgba(255,255,255,0.04)', right: '-80px', top: '-80px',
                }} />
                <div style={{
                    position: 'absolute', width: '200px', height: '200px', borderRadius: '50%',
                    background: 'rgba(255,255,255,0.04)', right: '80px', bottom: '-60px',
                }} />
                <div style={{ position: 'relative' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                        <Zap size={16} color="#fbbf24" />
                        <span style={{ color: '#fbbf24', fontSize: '0.8125rem', fontWeight: 600 }}>
                            AI-Powered Scheduling System
                        </span>
                    </div>
                    <h2 style={{
                        color: 'white', fontSize: '1.625rem', fontWeight: 800,
                        fontFamily: 'var(--font-display)', marginBottom: '0.5rem',
                    }}>
                        Welcome back, {user?.username}! 👋
                    </h2>
                    <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.9375rem', maxWidth: '480px' }}>
                        Your intelligent classroom scheduling platform. Manage resources and generate conflict-free timetables instantly.
                    </p>
                    <button
                        className="btn"
                        onClick={() => navigate('/timetable')}
                        style={{
                            marginTop: '1.25rem', background: 'rgba(255,255,255,0.15)',
                            color: 'white', border: '1px solid rgba(255,255,255,0.25)',
                            backdropFilter: 'blur(12px)',
                            WebkitBackdropFilter: 'blur(12px)',
                        }}
                    >
                        <CalendarDays size={16} />
                        Generate Timetable
                        <ArrowRight size={14} />
                    </button>
                </div>
            </div>

            {/* Stats */}
            <div>
                <h3 style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '1rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    System Overview
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                    {loading ? (
                        Array.from({ length: 4 }).map((_, i) => (
                            <Skeleton key={i} style={{ height: '100px', borderRadius: '0.75rem' }} />
                        ))
                    ) : (
                        <>
                            <StatCard icon={<Building2 size={22} />} label="Departments" value={stats.departments}
                                color="#3b82f6" bgColor="rgba(59,130,246,0.12)" path="/departments" />
                            <StatCard icon={<Briefcase size={22} />} label="Teachers" value={stats.teachers}
                                color="#10b981" bgColor="rgba(16,185,129,0.12)" path="/teachers" />
                            <StatCard icon={<BookOpen size={22} />} label="Courses" value={stats.courses}
                                color="#7c3aed" bgColor="rgba(124,58,237,0.12)" path="/courses" />
                            <StatCard icon={<DoorOpen size={22} />} label="Rooms" value={stats.rooms}
                                color="#f59e0b" bgColor="rgba(245,158,11,0.12)" path="/rooms" />
                        </>
                    )}
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>
                {/* Resource Summary Bar Chart */}
                <div className="card" style={{ padding: '1.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem' }}>
                        <Activity size={18} style={{ color: '#3b82f6' }} />
                        <h3 style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.9375rem' }}>
                            Resource Distribution
                        </h3>
                    </div>
                    {loading ? (
                        <Skeleton style={{ height: '200px', borderRadius: '0.5rem' }} />
                    ) : (
                        <ResponsiveContainer width="100%" height={240}>
                            <BarChart data={chartData} barSize={32}>
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                                <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                                <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                                <Tooltip
                                    contentStyle={{
                                        background: 'var(--bg-card)', border: '1px solid var(--border)',
                                        borderRadius: '0.5rem', fontSize: '0.75rem',
                                    }}
                                />
                                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                                    {chartData.map((entry, index) => (
                                        <Cell key={index} fill={entry.color} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    )}
                </div>

                {/* Course Type Pie Chart */}
                <div className="card" style={{ padding: '1.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem' }}>
                        <TrendingUp size={18} style={{ color: '#7c3aed' }} />
                        <h3 style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.9375rem' }}>
                            Schedule Quality
                        </h3>
                    </div>
                    {!loading && (
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ position: 'relative', width: '140px', height: '140px', margin: '0 auto' }}>
                                <svg width="140" height="140" viewBox="0 0 100 100">
                                    <circle cx="50" cy="50" r="45" fill="none" stroke="var(--border)" strokeWidth="8" />
                                    <circle cx="50" cy="50" r="45" fill="none" stroke="#10b981" strokeWidth="8"
                                        strokeDasharray="212" strokeDashoffset="42" strokeLinecap="round" transform="rotate(-90 50 50)" />
                                </svg>
                                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                                    <span style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)' }}>{stats.optimization}%</span>
                                    <span style={{ fontSize: '0.625rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Optimized</span>
                                </div>
                            </div>
                            <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'center', gap: '1rem' }}>
                                <div style={{ textAlign: 'left' }}>
                                    <p style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-primary)' }}>{stats.conflicts} Conflicts</p>
                                    <p style={{ fontSize: '0.625rem', color: stats.conflicts > 0 ? '#ef4444' : '#10b981' }}>
                                        {stats.conflicts > 10 ? 'Severe' : stats.conflicts > 0 ? 'Improveable' : 'Perfect'}
                                    </p>
                                </div>
                                <div style={{ width: '1px', background: 'var(--border)' }} />
                                <div style={{ textAlign: 'left' }}>
                                    <p style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-primary)' }}>{stats.total_entries} Lectures</p>
                                    <p style={{ fontSize: '0.625rem', color: '#3b82f6' }}>Assigned</p>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Room Distribution */}
                <div className="card" style={{ padding: '1.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem' }}>
                        <DoorOpen size={18} style={{ color: '#f59e0b' }} />
                        <h3 style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.9375rem' }}>
                            Room Capacities
                        </h3>
                    </div>
                    {loading ? (
                        <Skeleton style={{ height: '200px', borderRadius: '0.5rem' }} />
                    ) : (
                        <ResponsiveContainer width="100%" height={240}>
                            <BarChart data={roomCapacityData} layout="vertical" margin={{ left: 20 }}>
                                <XAxis type="number" hide />
                                <YAxis dataKey="name" type="category" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                                <Tooltip />
                                <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={20}>
                                    {roomCapacityData.map((entry, index) => (
                                        <Cell key={index} fill={entry.color} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    )}
                </div>

                {/* Quick Actions (now more compact) */}
                <div className="card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem' }}>
                        <Zap size={18} style={{ color: '#ef4444' }} />
                        <h3 style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.9375rem' }}>
                            Quick Controls
                        </h3>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', flex: 1 }}>
                        {quickActions.map(action => (
                            <button
                                key={action.path}
                                onClick={() => navigate(action.path)}
                                style={{
                                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem',
                                    padding: '0.75rem 0.5rem', borderRadius: '0.75rem',
                                    background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)',
                                    cursor: 'pointer', transition: 'all 0.15s ease', textAlign: 'center',
                                    backdropFilter: 'blur(8px)',
                                }}
                                onMouseEnter={e => { e.currentTarget.style.borderColor = action.color; e.currentTarget.style.background = `${action.color}15` }}
                                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'rgba(255,255,255,0.03)' }}
                            >
                                <div style={{ color: action.color }}>{action.icon}</div>
                                <span style={{ fontWeight: 600, fontSize: '0.75rem', color: 'var(--text-primary)' }}>
                                    {action.label.split(' ')[1] || action.label}
                                </span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Recent Activity List */}
                <div className="card" style={{ padding: '1.5rem', gridColumn: '1 / -1' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem' }}>
                        <Activity size={18} style={{ color: '#3b82f6' }} />
                        <h3 style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.9375rem' }}>
                            System Activity
                        </h3>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        {[
                            { action: 'Schedule Generated', user: 'Admin', time: '2m ago', type: 'success' },
                            { action: 'Teacher Added: Dr. Alice', user: 'Admin', time: '1h ago', type: 'info' },
                            { action: 'Room Reserved: Lab 101', user: 'Admin', time: '3h ago', type: 'info' },
                        ].map((item, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                <div style={{ width: '0.5rem', height: '0.5rem', borderRadius: '50%', background: item.type === 'success' ? '#10b981' : '#3b82f6' }} />
                                <div style={{ flex: 1 }}>
                                    <p style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-primary)' }}>{item.action}</p>
                                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>by {item.user}</p>
                                </div>
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{item.time}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Info cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
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
                            transition: 'all 0.15s ease', background: 'none', border: '1px solid var(--border)', width: '100%',
                        }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-elevated)'; (e.currentTarget as HTMLElement).style.borderColor = item.color }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = 'none'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)' }}
                    >
                        <div style={{
                            width: '2.25rem', height: '2.25rem', borderRadius: '0.625rem',
                            background: `${item.color}18`, display: 'flex', alignItems: 'center',
                            justifyContent: 'center', marginBottom: '0.875rem',
                        }}>
                            <span style={{ color: item.color }}>{item.icon}</span>
                        </div>
                        <p style={{ fontWeight: 600, fontSize: '0.9375rem', color: 'var(--text-primary)', marginBottom: '0.375rem' }}>
                            {item.title}
                        </p>
                        <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>{item.desc}</p>
                    </button>
                ))}
            </div>
        </div>
    )
}
