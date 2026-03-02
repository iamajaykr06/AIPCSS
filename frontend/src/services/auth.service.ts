import api from '@/lib/axios'
import type { LoginPayload, RegisterPayload, AuthTokens, User } from '@/types'

export const authService = {
    async login(payload: LoginPayload): Promise<AuthTokens> {
        const res = await api.post('/auth/login', payload)
        return res.data
    },

    async register(payload: RegisterPayload): Promise<{ message: string; user: User }> {
        const res = await api.post('/auth/register', payload)
        return res.data
    },

    async refresh(): Promise<{ access_token: string }> {
        const refreshToken = localStorage.getItem('refresh_token')
        const res = await api.post('/auth/refresh', {}, {
            headers: { Authorization: `Bearer ${refreshToken}` }
        })
        return res.data
    },

    async getMe(): Promise<{ user: User }> {
        const res = await api.get('/auth/me')
        return res.data
    },

    async listUsers(): Promise<{ users: User[] }> {
        const res = await api.get('/auth/users')
        return res.data
    },

    async updateUserRole(userId: number, role: string): Promise<{ user: User }> {
        const res = await api.put(`/auth/users/${userId}/role`, { role })
        return res.data
    },

    async deactivateUser(userId: number): Promise<{ message: string }> {
        const res = await api.put(`/auth/users/${userId}/deactivate`)
        return res.data
    },
}
