import React, { useState, useCallback, type ReactNode } from 'react'
import type { Toast, ToastType } from '@/types'
import { ToastContext } from './toast-context'

export function ToastProvider({ children }: { children: ReactNode }) {
    const [toasts, setToasts] = useState<Toast[]>([])

    const toast = useCallback((type: ToastType, title: string, message?: string) => {
        const id = Math.random().toString(36).slice(2)
        setToasts(prev => [...prev, { id, type, title, message }])
        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id))
        }, 4000)
    }, [])

    const dismiss = useCallback((id: string) => {
        setToasts(prev => prev.filter(t => t.id !== id))
    }, [])

    return (
        <ToastContext.Provider value={{ toasts, toast, dismiss }}>
            {children}
        </ToastContext.Provider>
    )
}
