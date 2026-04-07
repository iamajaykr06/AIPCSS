import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { CalendarDays, Mail, Lock, Eye, EyeOff, Sparkles } from 'lucide-react'
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
            background: 'transparent',
        }}>
            {/* Left panel */}
            <div style={{
                flex: '1',
                display: 'none',
                background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.9) 0%, rgba(30, 27, 75, 0.8) 50%, rgba(15, 23, 42, 0.9) 100%)',
                backdropFilter: 'blur(10px)',
                padding: '3rem',
                flexDirection: 'column',
                justifyContent: 'space-between',
                position: 'relative',
                overflow: 'hidden',
            }}
                className="lg:flex"
            >
                {/* Decorative circles */}
                <div style={{
                    position: 'absolute', width: '600px', height: '600px',
                    borderRadius: '50%', background: 'rgba(37,99,235,0.08)',
                    top: '-200px', left: '-200px',
                }} />
                <div style={{
                    position: 'absolute', width: '400px', height: '400px',
                    borderRadius: '50%', background: 'rgba(124,58,237,0.08)',
                    bottom: '-100px', right: '-100px',
                }} />

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', position: 'relative' }}>
                    <div style={{
                        width: '2.5rem', height: '2.5rem', borderRadius: '0.875rem',
                        background: 'linear-gradient(135deg, #2563eb, #7c3aed)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                        <CalendarDays size={20} color="white" />
                    </div>
                    <span style={{ color: 'white', fontWeight: 700, fontSize: '1.25rem', fontFamily: 'var(--font-display)' }}>
                        ClassScheduler
                    </span>
                </div>

                <div style={{ position: 'relative' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
                        <Sparkles size={16} color="#7c3aed" />
                        <span style={{ color: '#a78bfa', fontSize: '0.875rem', fontWeight: 500 }}>AI-Powered Scheduling</span>
                    </div>
                    <h2 style={{
                        color: 'white', fontSize: '2.5rem', fontWeight: 800,
                        lineHeight: 1.2, fontFamily: 'var(--font-display)', marginBottom: '1.25rem',
                    }}>
                        Intelligent<br />
                        <span style={{
                            background: 'linear-gradient(135deg, #60a5fa, #a78bfa)',
                            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                        }}>
                            Classroom<br />Scheduling
                        </span>
                    </h2>
                    <p style={{ color: 'rgba(148,163,184,0.8)', fontSize: '1rem', lineHeight: 1.7, maxWidth: '340px' }}>
                        Generate conflict-free timetables automatically. Manage departments, teachers, rooms, and courses with ease.
                    </p>

                    <div style={{ display: 'flex', gap: '2rem', marginTop: '2.5rem' }}>
                        {[
                            { label: 'Departments', value: 'Multi' },
                            { label: 'Constraints', value: 'Smart' },
                            { label: 'Conflicts', value: 'Zero' },
                        ].map(stat => (
                            <div key={stat.label}>
                                <p style={{ color: 'white', fontSize: '1.5rem', fontWeight: 800, fontFamily: 'var(--font-display)' }}>
                                    {stat.value}
                                </p>
                                <p style={{ color: 'rgba(148,163,184,0.7)', fontSize: '0.8125rem' }}>{stat.label}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Right panel - form */}
            <div style={{
                flex: '1',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '2rem',
            }}>
                <div className="card" style={{
                    width: '100%',
                    maxWidth: '430px',
                    padding: '2.5rem',
                    background: 'var(--bg-glass)',
                    backdropFilter: 'blur(20px)',
                    WebkitBackdropFilter: 'blur(20px)',
                }}>
                    <div style={{ marginBottom: '2rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}
                            className="lg:hidden"
                        >
                            <div style={{
                                width: '2rem', height: '2rem', borderRadius: '0.625rem',
                                background: 'linear-gradient(135deg, #2563eb, #7c3aed)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                                <CalendarDays size={16} color="white" />
                            </div>
                            <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>ClassScheduler</span>
                        </div>
                        <h1 style={{
                            fontSize: '1.75rem', fontWeight: 800,
                            color: 'var(--text-primary)', fontFamily: 'var(--font-display)',
                            marginBottom: '0.5rem',
                        }}>
                            Welcome back
                        </h1>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.9375rem' }}>
                            Sign in to your account to continue
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
                            style={{ width: '100%', height: '2.75rem', fontSize: '0.9375rem', marginTop: '0.5rem' }}
                        >
                            {isLoading ? <Spinner size={18} /> : null}
                            {isLoading ? 'Signing in...' : 'Sign in'}
                        </button>
                    </form>

                    <p style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                        Don&apos;t have an account?{' '}
                        <Link to="/register" style={{ color: '#3b82f6', fontWeight: 500 }}>
                            Create one
                        </Link>
                    </p>
                </div>
            </div>
        </div>
    )
}
