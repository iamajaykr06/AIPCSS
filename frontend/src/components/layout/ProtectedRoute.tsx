import React from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '@/context/useAuth'
import { PageLoader } from '@/components/ui/Loading'

export function ProtectedRoute() {
    const { isAuthenticated, isLoading } = useAuth()

    if (isLoading) return <PageLoader message="Authenticating..." />
    if (!isAuthenticated) return <Navigate to="/login" replace />
    return <Outlet />
}

export function PublicRoute() {
    const { isAuthenticated, isLoading } = useAuth()

    if (isLoading) return <PageLoader />
    if (isAuthenticated) return <Navigate to="/" replace />
    return <Outlet />
}
