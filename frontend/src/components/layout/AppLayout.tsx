import React from 'react'
import { Outlet, useLocation, Link } from 'react-router-dom'
import { Navbar } from './Navbar'
import { 
    Building2, Layers, GraduationCap, Briefcase, 
    BookOpen, ClipboardList, DoorOpen, LayoutGrid
} from 'lucide-react'

const managementLinks = [
    { label: 'Departments', icon: <Building2 size={16} />, path: '/departments' },
    { label: 'Programs', icon: <Layers size={16} />, path: '/programs' },
    { label: 'Batches', icon: <GraduationCap size={16} />, path: '/batches' },
    { label: 'Sections', icon: <LayoutGrid size={16} />, path: '/sections' },
    { label: 'Teachers', icon: <Briefcase size={16} />, path: '/teachers' },
    { label: 'Courses', icon: <BookOpen size={16} />, path: '/courses' },
    { label: 'Workload', icon: <ClipboardList size={16} />, path: '/workload' },
    { label: 'Rooms', icon: <DoorOpen size={16} />, path: '/rooms' },
]

export function AppLayout() {
    const location = useLocation()
    
    const isManageActive = managementLinks.some(link => location.pathname.startsWith(link.path))

    return (
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: 'var(--bg-main)' }}>
            <Navbar />
            
            {/* Secondary Management Tab Bar */}
            {isManageActive && (
                <div className="sub-navbar">
                    <div className="sub-navbar-content">
                        {managementLinks.map((link) => {
                            const isActive = location.pathname.startsWith(link.path)
                            return (
                                <Link
                                    key={link.path}
                                    to={link.path}
                                    className={`sub-nav-link ${isActive ? 'active' : ''}`}
                                >
                                    {link.icon}
                                    <span>{link.label}</span>
                                </Link>
                            )
                        })}
                    </div>
                </div>
            )}
            
            <main style={{ 
                flex: 1, 
                padding: '1.5rem', 
                maxWidth: '1400px', 
                width: '100%',
                margin: '0 auto',
                overflowX: 'hidden' 
            }}>
                <Outlet />
            </main>
        </div>
    )
}
