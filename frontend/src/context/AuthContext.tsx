import React, { useState, useCallback, type ReactNode } from 'react'
import type { User } from '@/types'
import { authService } from '@/services/auth.service'
import { AuthContext } from './auth-context'

function clearStoredAuth() {
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    localStorage.removeItem('user')
}

function readStoredUser(): User | null {
    if (typeof window === 'undefined') {
        return null
    }

    const storedUser = localStorage.getItem('user')
    const token = localStorage.getItem('access_token')
    if (!storedUser || !token) {
        return null
    }

    try {
        return JSON.parse(storedUser) as User
    } catch {
        clearStoredAuth()
        return null
    }
}

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(() => readStoredUser())
    const isLoading = false

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
        clearStoredAuth()
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
