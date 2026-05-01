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
