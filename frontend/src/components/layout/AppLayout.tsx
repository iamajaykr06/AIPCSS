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

import React from 'react'
import { Outlet, useLocation, Link } from 'react-router-dom'
import { Navbar } from './Navbar'
import { 
    Building2, Layers, GraduationCap, Briefcase, 
    BookOpen, ClipboardList, DoorOpen, Users
} from 'lucide-react'

const managementLinks = [
    { label: 'Departments', icon: <Building2 size={16} />, path: '/departments' },
    { label: 'Programs', icon: <Layers size={16} />, path: '/programs' },
    { label: 'Batches', icon: <GraduationCap size={16} />, path: '/batches' },
    { label: 'Sections', icon: <Users size={16} />, path: '/sections' },
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
