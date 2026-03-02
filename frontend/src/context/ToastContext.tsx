import React, { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import type { Toast, ToastType } from '@/types'

interface ToastContextValue {
    toasts: Toast[]
    toast: (type: ToastType, title: string, message?: string) => void
    dismiss: (id: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

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

export function useToast() {
    const ctx = useContext(ToastContext)
    if (!ctx) throw new Error('useToast must be used inside ToastProvider')
    return ctx
}
