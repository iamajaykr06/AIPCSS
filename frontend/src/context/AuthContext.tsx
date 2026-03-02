import React, { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import type { User } from '@/types'
import { authService } from '@/services/auth.service'
import { getErrorMessage } from '@/lib/utils'

interface AuthContextValue {
    user: User | null
    isAuthenticated: boolean
    isLoading: boolean
    login: (email: string, password: string) => Promise<void>
    register: (username: string, email: string, password: string) => Promise<void>
    logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null)
    const [isLoading, setIsLoading] = useState(true)

    // Initialize from localStorage
    useEffect(() => {
        const storedUser = localStorage.getItem('user')
        const token = localStorage.getItem('access_token')
        if (storedUser && token) {
            try {
                setUser(JSON.parse(storedUser))
            } catch {
                localStorage.clear()
            }
        }
        setIsLoading(false)
    }, [])

    const login = useCallback(async (email: string, password: string) => {
        const data = await authService.login({ email, password })
        localStorage.setItem('access_token', data.access_token)
        localStorage.setItem('refresh_token', data.refresh_token)
        localStorage.setItem('user', JSON.stringify(data.user))
        setUser(data.user)
    }, [])

    const register = useCallback(async (username: string, email: string, password: string) => {
        await authService.register({ username, email, password })
    }, [])

    const logout = useCallback(() => {
        localStorage.removeItem('access_token')
        localStorage.removeItem('refresh_token')
        localStorage.removeItem('user')
        setUser(null)
    }, [])

    return (
        <AuthContext.Provider value={{
            user,
            isAuthenticated: !!user,
            isLoading,
            login,
            register,
            logout,
        }}>
            {children}
        </AuthContext.Provider>
    )
}

export function useAuth() {
    const ctx = useContext(AuthContext)
    if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
    return ctx
}
