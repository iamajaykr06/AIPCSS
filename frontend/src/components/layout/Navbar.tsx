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

import React, { useState, useRef, useEffect } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import {
    LayoutDashboard, Building2, GraduationCap, Briefcase, BookOpen,
    DoorOpen, CalendarDays, Menu, Sun, Moon, LogOut,
    ChevronDown, Layers, Cog, ClipboardList, X, LayoutGrid
} from 'lucide-react'
import { useAuth } from '@/context/useAuth'
import { useTheme } from '@/context/useTheme'
import { getInitials } from '@/lib/utils'

export interface NavigationItem {
    label: string
    icon: React.ReactNode
    path: string
}

export const mainLinks: NavigationItem[] = [
    { label: 'Dashboard', icon: <LayoutDashboard size={18} />, path: '/' },
    { label: 'Timetable', icon: <CalendarDays size={18} />, path: '/timetable' },
    { label: 'Management', icon: <Layers size={18} />, path: '/departments' },
    { label: 'Settings', icon: <Cog size={18} />, path: '/settings' },
]

export const managementLinks: NavigationItem[] = [
    { label: 'Departments', icon: <Building2 size={16} />, path: '/departments' },
    { label: 'Programs', icon: <Layers size={16} />, path: '/programs' },
    { label: 'Batches', icon: <GraduationCap size={16} />, path: '/batches' },
    { label: 'Sections', icon: <LayoutGrid size={16} />, path: '/sections' },
    { label: 'Teachers', icon: <Briefcase size={16} />, path: '/teachers' },
    { label: 'Courses', icon: <BookOpen size={16} />, path: '/courses' },
    { label: 'Workload', icon: <ClipboardList size={16} />, path: '/workload' },
    { label: 'Rooms', icon: <DoorOpen size={16} />, path: '/rooms' },
]

const pageTitles: Record<string, string> = {
    '/': 'Dashboard',
    '/timetable': 'Schedule Planner',
    '/departments': 'Departments',
    '/programs': 'Academic Programs',
    '/batches': 'Student Batches',
    '/sections': 'Batch Sections',
    '/teachers': 'Faculty Management',
    '/courses': 'Course Catalog',
    '/workload': 'Teaching Workload',
    '/rooms': 'Room Allocation',
    '/settings': 'Application Settings',
}

export function Navbar() {
    const navigate = useNavigate()
    const location = useLocation()
    const { user, logout } = useAuth()
    const { theme, toggleTheme } = useTheme()
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
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

    const handleLogout = () => {
        logout()
        navigate('/login')
    }

    const isManageActive = managementLinks.some(link => location.pathname.startsWith(link.path))

    const currentPage = Object.keys(pageTitles).find(path =>
        path === '/' ? location.pathname === '/' : location.pathname.startsWith(path)
    )
    const pageTitle = currentPage ? pageTitles[currentPage] : 'AIPCSS'

    return (
        <nav className="navbar-container">
            <div className="navbar-content">
                {/* Logo & Brand */}
                <Link to="/" className="navbar-brand">
                    <div className="navbar-logo-icon">
                        <CalendarDays size={20} color="white" />
                    </div>
                    <div className="navbar-brand-text">
                        <span className="brand-title">AIPCSS</span>
                        <span className="brand-subtitle">Scheduling System</span>
                    </div>
                </Link>

                <div className="navbar-separator desktop-only" />

                {/* Desktop Navigation */}
                <div className="navbar-links desktop-only">
                    {mainLinks.map((item) => {
                        const isActive = item.label === 'Management'
                            ? isManageActive
                            : (item.path === '/' ? location.pathname === '/' : location.pathname.startsWith(item.path))

                        return (
                            <Link
                                key={item.path}
                                to={item.path}
                                className={`navbar-link ${isActive ? 'active' : ''}`}
                            >
                                {item.icon}
                                <span>{item.label}</span>
                                {isActive && <div className="active-indicator" />}
                            </Link>
                        )
                    })}
                </div>

                {/* Page Title */}
                <div className="navbar-page-title desktop-only">{pageTitle}</div>

                {/* Right Actions */}
                <div className="navbar-actions">
                    <button
                        onClick={toggleTheme}
                        className="btn btn-ghost btn-icon theme-toggle"
                        title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
                    >
                        {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
                    </button>

                    <div ref={dropdownRef} className="user-dropdown-container">
                        <button
                            onClick={() => setDropdownOpen(!dropdownOpen)}
                            className="user-profile-btn"
                        >
                            <div className="avatar">
                                {getInitials(user?.username || 'U')}
                            </div>
                            <span className="user-name desktop-only">{user?.username}</span>
                            <ChevronDown size={14} className={`chevron ${dropdownOpen ? 'open' : ''}`} />
                        </button>

                        {dropdownOpen && (
                            <div className="dropdown-menu navbar-dropdown">
                                <div className="dropdown-header">
                                    <p className="dropdown-user-name">{user?.username}</p>
                                    <p className="dropdown-user-email">{user?.email}</p>
                                    <span className="badge badge-blue">{user?.role}</span>
                                </div>
                                <div className="dropdown-separator" />
                                <button className="dropdown-item danger" onClick={handleLogout}>
                                    <LogOut size={16} />
                                    <span>Sign out</span>
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Mobile Menu Toggle */}
                    <button
                        className="mobile-menu-toggle mobile-only"
                        onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                    >
                        {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
                    </button>
                </div>
            </div>

            {/* Mobile Navigation Menu */}
            {mobileMenuOpen && (
                <div className="mobile-navbar-menu">
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, padding: '0.5rem 1rem', textTransform: 'uppercase' }}>Main</p>
                    {mainLinks.map((item) => {
                        const isActive = item.label === 'Management'
                            ? isManageActive
                            : (item.path === '/' ? location.pathname === '/' : location.pathname.startsWith(item.path))
                        return (
                            <Link
                                key={item.path}
                                to={item.path}
                                className={`mobile-nav-link ${isActive ? 'active' : ''}`}
                                onClick={() => setMobileMenuOpen(false)}
                            >
                                {item.icon}
                                <span>{item.label}</span>
                            </Link>
                        )
                    })}

                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, padding: '1rem 1rem 0.5rem', textTransform: 'uppercase' }}>Management</p>
                    {managementLinks.map((item) => (
                        <Link
                            key={item.path}
                            to={item.path}
                            className={`mobile-nav-link ${location.pathname.startsWith(item.path) ? 'active' : ''}`}
                            onClick={() => setMobileMenuOpen(false)}
                        >
                            {item.icon}
                            <span>{item.label}</span>
                        </Link>
                    ))}

                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, padding: '1rem 1rem 0.5rem', textTransform: 'uppercase' }}>Config</p>
                    <Link
                        to="/settings"
                        className={`mobile-nav-link ${location.pathname.startsWith('/settings') ? 'active' : ''}`}
                        onClick={() => setMobileMenuOpen(false)}
                    >
                        <Cog size={18} />
                        <span>Settings</span>
                    </Link>
                </div>
            )}
        </nav>
    )
}
