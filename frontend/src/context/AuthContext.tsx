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

import React, { useState, useCallback, useEffect, type ReactNode } from 'react'
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
    const [user, setUser] = useState<User | null>(null)
    const [isLoading, setIsLoading] = useState(true)

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

    useEffect(() => {
        // Validate stored token on mount
        async function validateToken() {
            try {
                const stored = readStoredUser()
                if (!stored) {
                    setIsLoading(false)
                    return
                }
                // Call server to verify token is still valid
                const response = await authService.getMe()
                setUser(response.user)
            } catch {
                // Token expired or invalid — or backend is not running.
                // Clear auth state silently so the user sees the login page
                // instead of console errors.
                clearStoredAuth()
                setUser(null)
            } finally {
                setIsLoading(false)
            }
        }
        validateToken()
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
