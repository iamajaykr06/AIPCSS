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

import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { CalendarDays, Mail, Lock, User, Eye, EyeOff } from 'lucide-react'
import { useAuth } from '@/context/useAuth'
import { useToast } from '@/context/useToast'
import { getErrorMessage } from '@/lib/utils'
import { Spinner } from '@/components/ui/Loading'

const schema = z.object({
    username: z.string().min(2, 'Username must be at least 2 characters'),
    email: z.string().email('Enter a valid email'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string(),
}).refine(d => d.password === d.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
})
type FormData = z.infer<typeof schema>

export function RegisterPage() {
    const [showPassword, setShowPassword] = useState(false)
    const [isLoading, setIsLoading] = useState(false)
    const { register: registerUser } = useAuth()
    const { toast } = useToast()
    const navigate = useNavigate()

    const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
        resolver: zodResolver(schema),
    })

    const onSubmit = async (data: FormData) => {
        setIsLoading(true)
        try {
            await registerUser(data.username, data.email, data.password)
            toast('success', 'Account created!', 'You can now sign in.')
            navigate('/login')
        } catch (err) {
            toast('error', 'Registration failed', getErrorMessage(err))
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <div style={{
            minHeight: '100vh',
            display: 'flex',
            background: 'var(--bg-main)',
        }}>
            {/* Left panel - 60% */}
            <div style={{
                flex: '0 0 60%',
                display: 'none',
                background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%)',
                padding: '3rem',
                flexDirection: 'column',
                justifyContent: 'space-between',
                position: 'relative',
                overflow: 'hidden',
            }}
                className="lg:flex"
            >
                {/* Decorative geometric shapes */}
                <div style={{
                    position: 'absolute', width: '600px', height: '600px',
                    borderRadius: '50%', background: '#ffffff08',
                    top: '-200px', left: '-200px',
                }} />
                <div style={{
                    position: 'absolute', width: '400px', height: '400px',
                    borderRadius: '50%', background: '#ffffff08',
                    bottom: '-100px', right: '-100px',
                }} />
                <div style={{
                    position: 'absolute', width: '180px', height: '180px',
                    borderRadius: '1rem', background: '#ffffff08',
                    bottom: '25%', left: '8%', transform: 'rotate(30deg)',
                }} />
                <div style={{
                    position: 'absolute', width: '100px', height: '100px',
                    borderRadius: '50%', background: '#ffffff08',
                    top: '15%', left: '35%',
                }} />

                {/* Top: Logo */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', position: 'relative' }}>
                    <div style={{
                        width: '2.5rem', height: '2.5rem', borderRadius: '0.75rem',
                        background: '#4f46e5',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                        <CalendarDays size={20} color="white" />
                    </div>
                    <div>
                        <span style={{ color: '#ffffff', fontWeight: 700, fontSize: '1.25rem', fontFamily: 'var(--font-display)' }}>
                            AIPCSS
                        </span>
                        <p style={{ color: 'rgba(148,163,184,0.7)', fontSize: '0.75rem', marginTop: '0.125rem' }}>
                            Automated Institutional Program Course Scheduling System
                        </p>
                    </div>
                </div>

                {/* Center: Headline and description */}
                <div style={{ position: 'relative' }}>
                    <h2 style={{
                        color: '#ffffff', fontSize: '2.5rem', fontWeight: 800,
                        lineHeight: 1.2, fontFamily: 'var(--font-display)', marginBottom: '1.25rem',
                    }}>
                        Start{' '}
                        <span style={{
                            background: 'linear-gradient(135deg, #818cf8, #c084fc)',
                            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                        }}>
                            Scheduling
                        </span>
                    </h2>
                    <p style={{ color: 'rgba(148,163,184,0.7)', fontSize: '1rem', lineHeight: 1.7, maxWidth: '380px' }}>
                        Create your account and join the intelligent scheduling platform. Streamline your institution&apos;s timetable management with AI-powered automation.
                    </p>

                    <div style={{ display: 'flex', gap: '2.5rem', marginTop: '2.5rem' }}>
                        {[
                            { label: 'Multi-Department', icon: '🏛' },
                            { label: 'Smart Constraints', icon: '🧠' },
                            { label: 'Zero Conflicts', icon: '✓' },
                        ].map(stat => (
                            <div key={stat.label} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <div style={{
                                    width: '2rem', height: '2rem', borderRadius: '0.5rem',
                                    background: '#fbbf24',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: '0.75rem',
                                }}>
                                    {stat.icon}
                                </div>
                                <span style={{ color: '#ffffff', fontSize: '0.875rem', fontWeight: 600 }}>
                                    {stat.label}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Bottom spacer */}
                <div />
            </div>

            {/* Right panel - 40% form */}
            <div style={{
                flex: '1',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '2rem',
                background: 'var(--bg-main)',
            }}>
                <div style={{
                    width: '100%',
                    maxWidth: '420px',
                    padding: '3rem',
                    background: 'var(--bg-card)',
                    borderRadius: 'var(--radius-2xl)',
                    boxShadow: 'var(--shadow-lg)',
                    border: '1px solid var(--border)',
                    backdropFilter: 'blur(8px)',
                }}>
                    {/* Mobile logo - hidden on desktop */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}
                        className="lg:hidden"
                    >
                        <div style={{
                            width: '2rem', height: '2rem', borderRadius: '0.625rem',
                            background: '#4f46e5',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                            <CalendarDays size={16} color="white" />
                        </div>
                        <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>AIPCSS</span>
                    </div>

                    <div style={{ marginBottom: '2rem' }}>
                        <h1 style={{
                            fontSize: '1.75rem', fontWeight: 800,
                            color: 'var(--text-primary)', fontFamily: 'var(--font-display)',
                            marginBottom: '0.5rem',
                        }}>
                            Create your account
                        </h1>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.9375rem' }}>
                            Get started with AIPCSS
                        </p>
                    </div>

                    <form onSubmit={handleSubmit(onSubmit)} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <div className="form-group">
                            <label className="label" htmlFor="reg-username">Username</label>
                            <div style={{ position: 'relative' }}>
                                <User size={15} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                                <input {...register('username')} id="reg-username" placeholder="john_doe"
                                    className={`input ${errors.username ? 'input-error' : ''}`} style={{ paddingLeft: '2.25rem' }} />
                            </div>
                            {errors.username && <p className="error-msg">{errors.username.message}</p>}
                        </div>

                        <div className="form-group">
                            <label className="label" htmlFor="reg-email">Email</label>
                            <div style={{ position: 'relative' }}>
                                <Mail size={15} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                                <input {...register('email')} id="reg-email" type="email" placeholder="you@university.edu"
                                    className={`input ${errors.email ? 'input-error' : ''}`} style={{ paddingLeft: '2.25rem' }} />
                            </div>
                            {errors.email && <p className="error-msg">{errors.email.message}</p>}
                        </div>

                        <div className="form-group">
                            <label className="label" htmlFor="reg-password">Password</label>
                            <div style={{ position: 'relative' }}>
                                <Lock size={15} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                                <input {...register('password')} id="reg-password"
                                    type={showPassword ? 'text' : 'password'} placeholder="Min. 8 characters"
                                    className={`input ${errors.password ? 'input-error' : ''}`}
                                    style={{ paddingLeft: '2.25rem', paddingRight: '2.5rem' }} />
                                <button type="button" onClick={() => setShowPassword(p => !p)}
                                    style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                                </button>
                            </div>
                            {errors.password && <p className="error-msg">{errors.password.message}</p>}
                        </div>

                        <div className="form-group">
                            <label className="label" htmlFor="reg-confirm">Confirm Password</label>
                            <div style={{ position: 'relative' }}>
                                <Lock size={15} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                                <input {...register('confirmPassword')} id="reg-confirm"
                                    type={showPassword ? 'text' : 'password'} placeholder="Repeat password"
                                    className={`input ${errors.confirmPassword ? 'input-error' : ''}`}
                                    style={{ paddingLeft: '2.25rem' }} />
                            </div>
                            {errors.confirmPassword && <p className="error-msg">{errors.confirmPassword.message}</p>}
                        </div>

                        <button type="submit" className="btn btn-primary" disabled={isLoading}
                            style={{ 
                                width: '100%', 
                                height: '3.25rem', 
                                fontSize: '1rem', 
                                marginTop: '1rem', 
                                background: 'linear-gradient(135deg, #6366f1, #818cf8)',
                                borderRadius: 'var(--radius-lg)',
                                fontWeight: 700,
                                letterSpacing: '0.025em'
                            }}>
                            {isLoading ? <Spinner size={20} color="white" /> : null}
                            {isLoading ? 'Creating account...' : 'Create account'}
                        </button>
                    </form>

                    <p style={{ textAlign: 'center', marginTop: '1.25rem', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                        Already have an account?{' '}
                        <Link to="/login" style={{ color: '#4f46e5', fontWeight: 600 }}>Sign in</Link>
                    </p>
                </div>
            </div>
        </div>
    )
}
