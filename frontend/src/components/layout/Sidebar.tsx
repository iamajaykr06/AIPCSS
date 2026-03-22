import React, { useState, useRef, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
    LayoutDashboard, Building2, GraduationCap, Users, BookOpen,
    DoorOpen, CalendarDays, Menu, X, Sun, Moon, LogOut,
    ChevronDown, Settings, Bell, User, Layers, Briefcase,
    BookMarked,
} from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useTheme } from '@/context/ThemeContext'
import { getInitials } from '@/lib/utils'

interface NavItem {
    label: string
    icon: React.ReactNode
    path: string
    section?: string
    badge?: string
}

const navItems: NavItem[] = [
    { label: 'Dashboard', icon: <LayoutDashboard size={18} />, path: '/', section: 'Overview' },
    { label: 'Departments', icon: <Building2 size={18} />, path: '/departments', section: 'Management' },
    { label: 'Programs', icon: <Layers size={18} />, path: '/programs', section: 'Management' },
    { label: 'Batches', icon: <GraduationCap size={18} />, path: '/batches', section: 'Management' },
    { label: 'Teachers', icon: <Briefcase size={18} />, path: '/teachers', section: 'Management' },
    { label: 'Courses', icon: <BookOpen size={18} />, path: '/courses', section: 'Management' },
    { label: 'Rooms', icon: <DoorOpen size={18} />, path: '/rooms', section: 'Management' },
    { label: 'Timetable', icon: <CalendarDays size={18} />, path: '/timetable', section: 'Scheduling' },
]

interface SidebarProps {
    open: boolean
    onClose: () => void
}

export function Sidebar({ open, onClose }: SidebarProps) {
    const navigate = useNavigate()
    const location = useLocation()
    const { user, logout } = useAuth()

    const sections = [...new Set(navItems.map(i => i.section!))].filter(Boolean)

    const handleNav = (path: string) => {
        navigate(path)
        onClose()
    }

    const handleLogout = () => {
        logout()
        navigate('/login')
    }

    return (
        <>
            {/* Mobile overlay */}
            {open && (
                <div
                    className="fixed inset-0 z-30 bg-black/50 lg:hidden"
                    onClick={onClose}
                />
            )}

            <aside
                className="sidebar"
                style={{
                    transform: open ? 'translateX(0)' : 'translateX(-100%)',
                }}
            >
                {/* Logo */}
                <div style={{
                    padding: '1.25rem 1.25rem 1rem',
                    borderBottom: '1px solid rgba(255,255,255,0.08)',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div style={{
                            width: '2.25rem', height: '2.25rem', borderRadius: '0.75rem',
                            background: 'linear-gradient(135deg, #2563eb, #7c3aed)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            flexShrink: 0,
                        }}>
                            <CalendarDays size={18} color="white" />
                        </div>
                        <div>
                            <p style={{ color: 'white', fontWeight: 700, fontSize: '0.9375rem', lineHeight: 1.2, fontFamily: 'var(--font-display)' }}>
                                ClassScheduler
                            </p>
                            <p style={{ color: 'rgba(148,163,184,0.8)', fontSize: '0.6875rem' }}>AI-Powered</p>
                        </div>
                    </div>
                </div>

                {/* Nav */}
                <nav style={{ flex: 1, overflowY: 'auto', padding: '0.75rem 0' }}>
                    {sections.map(section => (
                        <div key={section} style={{ marginBottom: '1rem' }}>
                            <p className="sidebar-section-label">{section}</p>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.125rem' }}>
                                {navItems
                                    .filter(item => item.section === section)
                                    .map(item => {
                                        const isActive = item.path === '/'
                                            ? location.pathname === '/'
                                            : location.pathname.startsWith(item.path)
                                        return (
                                            <button
                                                key={item.path}
                                                onClick={() => handleNav(item.path)}
                                                className={`sidebar-item ${isActive ? 'active' : ''}`}
                                            >
                                                {item.icon}
                                                <span style={{ flex: 1, textAlign: 'left' }}>{item.label}</span>
                                                {item.badge && (
                                                    <span className="badge badge-blue" style={{ fontSize: '0.625rem', padding: '0.0625rem 0.375rem' }}>
                                                        {item.badge}
                                                    </span>
                                                )}
                                            </button>
                                        )
                                    })}
                            </div>
                        </div>
                    ))}
                </nav>

                <div style={{
                    padding: '0.75rem',
                    borderTop: '1px solid rgba(255,255,255,0.08)',
                }}>
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: '0.75rem',
                        padding: '0.625rem 0.5rem', borderRadius: '0.75rem',
                        background: 'rgba(255,255,255,0.03)',
                    }}>
                        <div className="avatar">
                            {getInitials(user?.username || 'User')}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ color: 'white', fontSize: '0.875rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {user?.username}
                            </p>
                            <p style={{ color: 'rgba(148,163,184,0.7)', fontSize: '0.6875rem' }}>
                                {user?.role}
                            </p>
                        </div>
                        <button
                            onClick={handleLogout}
                            className="btn btn-ghost btn-icon btn-sm"
                            style={{ color: 'rgba(148,163,184,0.7)' }}
                            title="Logout"
                        >
                            <LogOut size={16} />
                        </button>
                    </div>
                </div>
            </aside>
        </>
    )
}

interface HeaderProps {
    onMenuToggle: () => void
    pageTitle: string
}

export function Header({ onMenuToggle, pageTitle }: HeaderProps) {
    const { theme, toggleTheme } = useTheme()
    const { user, logout } = useAuth()
    const navigate = useNavigate()
    const [dropdownOpen, setDropdownOpen] = useState(false)
    const dropdownRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        function handler(e: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setDropdownOpen(false)
            }
        }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [])

    return (
        <header style={{
            height: '64px',
            borderBottom: '1px solid var(--border)',
            background: 'var(--bg-glass)',
            backdropFilter: 'blur(var(--glass-blur))',
            WebkitBackdropFilter: 'blur(var(--glass-blur))',
            display: 'flex',
            alignItems: 'center',
            paddingLeft: '1rem',
            paddingRight: '1.5rem',
            gap: '1rem',
            position: 'sticky',
            top: 0,
            zIndex: 20,
        }}>
            <button
                onClick={onMenuToggle}
                className="btn btn-ghost btn-icon"
                aria-label="Toggle menu"
            >
                <Menu size={20} />
            </button>

            <h1 style={{
                fontSize: '1.0625rem',
                fontWeight: 600,
                color: 'var(--text-primary)',
                flex: 1,
                fontFamily: 'var(--font-display)',
            }}>
                {pageTitle}
            </h1>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                {/* Theme toggle */}
                <button
                    onClick={toggleTheme}
                    className="btn btn-ghost btn-icon"
                    aria-label="Toggle theme"
                    title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
                >
                    {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
                </button>

                {/* User dropdown */}
                <div ref={dropdownRef} style={{ position: 'relative' }}>
                    <button
                        onClick={() => setDropdownOpen(p => !p)}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '0.5rem',
                            padding: '0.375rem 0.625rem',
                            borderRadius: '0.5rem', border: '1px solid var(--border)',
                            background: 'var(--bg)', cursor: 'pointer',
                            transition: 'background 0.15s',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--border)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'var(--bg)')}
                    >
                        <div className="avatar" style={{ width: '1.75rem', height: '1.75rem', fontSize: '0.6875rem' }}>
                            {getInitials(user?.username || 'U')}
                        </div>
                        <span style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--text-primary)' }}>
                            {user?.username}
                        </span>
                        <ChevronDown size={14} style={{ color: 'var(--text-muted)' }} />
                    </button>

                    {dropdownOpen && (
                        <div className="dropdown-menu" style={{ position: 'absolute', right: 0, top: 'calc(100% + 0.5rem)' }}>
                            <div style={{ padding: '0.5rem 0.75rem 0.5rem' }}>
                                <p style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                                    {user?.username}
                                </p>
                                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{user?.email}</p>
                                <span className="badge badge-blue" style={{ marginTop: '0.375rem' }}>{user?.role}</span>
                            </div>
                            <div className="dropdown-separator" />
                            <button
                                className="dropdown-item danger"
                                onClick={() => { logout(); navigate('/login') }}
                            >
                                <LogOut size={15} />
                                Sign out
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </header>
    )
}
