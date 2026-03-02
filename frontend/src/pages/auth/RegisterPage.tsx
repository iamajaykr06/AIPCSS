import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { CalendarDays, Mail, Lock, User, Eye, EyeOff } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'
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
            minHeight: '100vh', display: 'flex', alignItems: 'center',
            justifyContent: 'center', background: 'transparent', padding: '2rem',
        }}>
            <div style={{ width: '100%', maxWidth: '420px' }}>
                {/* Logo */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '2rem', justifyContent: 'center' }}>
                    <div style={{
                        width: '2.25rem', height: '2.25rem', borderRadius: '0.75rem',
                        background: 'linear-gradient(135deg, #2563eb, #7c3aed)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                        <CalendarDays size={18} color="white" />
                    </div>
                    <span style={{ fontWeight: 700, fontSize: '1.125rem', color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>
                        ClassScheduler
                    </span>
                </div>

                <div className="card" style={{
                    padding: '2.5rem',
                    background: 'var(--bg-glass)',
                    backdropFilter: 'blur(20px)',
                    WebkitBackdropFilter: 'blur(20px)',
                }}>
                    <div style={{ marginBottom: '1.75rem' }}>
                        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-display)', marginBottom: '0.4rem' }}>
                            Create account
                        </h1>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                            Get started with ClassScheduler
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
                            style={{ width: '100%', height: '2.75rem', fontSize: '0.9375rem', marginTop: '0.5rem' }}>
                            {isLoading ? <Spinner size={18} /> : null}
                            {isLoading ? 'Creating account...' : 'Create account'}
                        </button>
                    </form>

                    <p style={{ textAlign: 'center', marginTop: '1.25rem', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                        Already have an account?{' '}
                        <Link to="/login" style={{ color: '#3b82f6', fontWeight: 500 }}>Sign in</Link>
                    </p>
                </div>
            </div>
        </div>
    )
}
