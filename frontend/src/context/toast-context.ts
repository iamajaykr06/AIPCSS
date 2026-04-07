import { createContext } from 'react'
import type { Toast, ToastType } from '@/types'

export interface ToastContextValue {
    toasts: Toast[]
    toast: (type: ToastType, title: string, message?: string) => void
    dismiss: (id: string) => void
}

export const ToastContext = createContext<ToastContextValue | null>(null)
