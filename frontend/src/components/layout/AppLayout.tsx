import React, { useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Sidebar, Header } from './Sidebar'

const pageTitles: Record<string, string> = {
    '/': 'Dashboard',
    '/departments': 'Departments',
    '/programs': 'Programs',
    '/batches': 'Batches & Sections',
    '/teachers': 'Teachers',
    '/courses': 'Courses',
    '/rooms': 'Rooms',
    '/timetable': 'Timetable',
}

export function AppLayout() {
    const [sidebarOpen, setSidebarOpen] = useState(true)
    const location = useLocation()

    const pageTitle = Object.entries(pageTitles).find(([path]) =>
        path === '/' ? location.pathname === '/' : location.pathname.startsWith(path)
    )?.[1] || 'ClassScheduler'

    return (
        <div style={{ display: 'flex', minHeight: '100vh', background: 'transparent' }}>
            <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

            {/* Main content */}
            <div
                style={{
                    flex: 1,
                    marginLeft: sidebarOpen ? '260px' : '0',
                    transition: 'margin-left 0.25s ease',
                    minWidth: 0,
                    display: 'flex',
                    flexDirection: 'column',
                }}
            >
                <Header onMenuToggle={() => setSidebarOpen(p => !p)} pageTitle={pageTitle} />
                <main style={{ flex: 1, padding: '1.5rem', maxWidth: '100%', overflowX: 'hidden' }}>
                    <Outlet />
                </main>
            </div>
        </div>
    )
}
