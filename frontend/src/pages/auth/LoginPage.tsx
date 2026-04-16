import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { CalendarDays, Mail, Lock, Eye, EyeOff } from 'lucide-react'
import { useAuth } from '@/context/useAuth'
import { useToast } from '@/context/useToast'
import { getErrorMessage } from '@/lib/utils'
import { Spinner } from '@/components/ui/Loading'

const schema = z.object({
    email: z.string().email('Enter a valid email'),
    password: z.string().min(1, 'Password is required'),
})
type FormData = z.infer<typeof schema>

export function LoginPage() {
    const [showPassword, setShowPassword] = useState(false)
    const [isLoading, setIsLoading] = useState(false)
    const { login } = useAuth()
    const { toast } = useToast()
    const navigate = useNavigate()

    const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
        resolver: zodResolver(schema),
    })

    const onSubmit = async (data: FormData) => {
        setIsLoading(true)
        try {
            await login(data.email, data.password)
            toast('success', 'Welcome back!', 'You have been logged in successfully.')
            navigate('/')
        } catch (err) {
            toast('error', 'Login failed', getErrorMessage(err))
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <div style={{
            minHeight: '100vh',
            display: 'flex',
            background: '#ffffff',
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
                    position: 'absolute', width: '200px', height: '200px',
                    borderRadius: '1rem', background: '#ffffff08',
                    top: '40%', right: '10%', transform: 'rotate(45deg)',
                }} />
                <div style={{
                    position: 'absolute', width: '120px', height: '120px',
                    borderRadius: '50%', background: '#ffffff08',
                    top: '20%', right: '30%',
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
                        Intelligent{' '}
                        <span style={{
                            background: 'linear-gradient(135deg, #818cf8, #c084fc)',
                            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                        }}>
                            Timetable Generation
                        </span>
                    </h2>
                    <p style={{ color: 'rgba(148,163,184,0.7)', fontSize: '1rem', lineHeight: 1.7, maxWidth: '380px' }}>
                        Generate conflict-free timetables automatically with AI-powered scheduling. Manage departments, teachers, rooms, and courses effortlessly.
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
                background: '#ffffff',
            }}>
                <div style={{
                    width: '100%',
                    maxWidth: '420px',
                    padding: '2.5rem',
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
                            Welcome back
                        </h1>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.9375rem' }}>
                            Sign in to your account
                        </p>
                    </div>

                    <form onSubmit={handleSubmit(onSubmit)} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                        <div className="form-group">
                            <label className="label" htmlFor="email">Email address</label>
                            <div style={{ position: 'relative' }}>
                                <Mail size={16} style={{
                                    position: 'absolute', left: '0.75rem', top: '50%',
                                    transform: 'translateY(-50%)', color: 'var(--text-muted)',
                                }} />
                                <input
                                    {...register('email')}
                                    id="email"
                                    type="email"
                                    placeholder="you@example.com"
                                    className={`input ${errors.email ? 'input-error' : ''}`}
                                    style={{ paddingLeft: '2.25rem' }}
                                    autoComplete="email"
                                />
                            </div>
                            {errors.email && <p className="error-msg">{errors.email.message}</p>}
                        </div>

                        <div className="form-group">
                            <label className="label" htmlFor="password">Password</label>
                            <div style={{ position: 'relative' }}>
                                <Lock size={16} style={{
                                    position: 'absolute', left: '0.75rem', top: '50%',
                                    transform: 'translateY(-50%)', color: 'var(--text-muted)',
                                }} />
                                <input
                                    {...register('password')}
                                    id="password"
                                    type={showPassword ? 'text' : 'password'}
                                    placeholder="••••••••"
                                    className={`input ${errors.password ? 'input-error' : ''}`}
                                    style={{ paddingLeft: '2.25rem', paddingRight: '2.5rem' }}
                                    autoComplete="current-password"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(p => !p)}
                                    style={{
                                        position: 'absolute', right: '0.75rem', top: '50%',
                                        transform: 'translateY(-50%)', color: 'var(--text-muted)',
                                        background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                                    }}
                                >
                                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                </button>
                            </div>
                            {errors.password && <p className="error-msg">{errors.password.message}</p>}
                        </div>

                        <button
                            type="submit"
                            className="btn btn-primary"
                            disabled={isLoading}
                            style={{ width: '100%', height: '2.75rem', fontSize: '0.9375rem', marginTop: '0.5rem', background: '#4f46e5', borderRadius: '0.5rem' }}
                        >
                            {isLoading ? <Spinner size={18} /> : null}
                            {isLoading ? 'Signing in...' : 'Sign in'}
                        </button>
                    </form>

                    <p style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                        Don&apos;t have an account?{' '}
                        <Link to="/register" style={{ color: '#4f46e5', fontWeight: 600 }}>
                            Create one
                        </Link>
                    </p>
                </div>
            </div>
        </div>
    )
}
