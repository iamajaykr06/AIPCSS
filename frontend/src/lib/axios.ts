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

import axios from 'axios'

const api = axios.create({
    baseURL: '/api',
    headers: {
        'Content-Type': 'application/json',
    },
})

// Track in-flight refresh to prevent concurrent 401 retries
let refreshPromise: Promise<string> | null = null

// Request interceptor — attach JWT access token
api.interceptors.request.use(config => {
    const token = localStorage.getItem('access_token')
    if (token) {
        config.headers.Authorization = `Bearer ${token}`
    }
    return config
})

// Response interceptor — handle 401 by attempting token refresh
api.interceptors.response.use(
    response => response,
    async error => {
        const originalRequest = error.config

        if (
            error.response?.status === 401 &&
            !originalRequest._retry &&
            !originalRequest.url?.includes('/auth/login') &&
            !originalRequest.url?.includes('/auth/refresh')
        ) {
            originalRequest._retry = true

            // If a refresh is already in-flight, wait for it
            if (refreshPromise) {
                try {
                    const token = await refreshPromise
                    originalRequest.headers.Authorization = `Bearer ${token}`
                    return api(originalRequest)
                } catch {
                    return Promise.reject(error)
                }
            }

            // Start new refresh
            refreshPromise = (async () => {
                const refreshToken = localStorage.getItem('refresh_token')
                if (!refreshToken) throw new Error('No refresh token')

                const res = await axios.post('/api/auth/refresh', {}, {
                    headers: { Authorization: `Bearer ${refreshToken}` },
                })

                const newToken = res.data.access_token
                localStorage.setItem('access_token', newToken)
                return newToken
            })().finally(() => {
                refreshPromise = null
            })

            try {
                const token = await refreshPromise
                originalRequest.headers.Authorization = `Bearer ${token}`
                return api(originalRequest)
            } catch {
                refreshPromise = null
                // Refresh failed — clear auth state
                localStorage.removeItem('access_token')
                localStorage.removeItem('refresh_token')
                localStorage.removeItem('user')
                window.location.href = '/login'
                return Promise.reject(error)
            }
        }

        return Promise.reject(error)
    },
)

export default api
