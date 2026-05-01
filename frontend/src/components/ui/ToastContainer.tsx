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

import React from 'react'
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from 'lucide-react'
import { useToast } from '@/context/useToast'
import type { ToastType } from '@/types'

const icons: Record<ToastType, React.ReactNode> = {
    success: <CheckCircle size={18} className="text-emerald-500" />,
    error: <AlertCircle size={18} className="text-red-500" />,
    warning: <AlertTriangle size={18} className="text-amber-500" />,
    info: <Info size={18} className="text-blue-500" />,
}

export function ToastContainer() {
    const { toasts, dismiss } = useToast()

    return (
        <div className="toast-container">
            {toasts.map(toast => (
                <div
                    key={toast.id}
                    className={`toast toast-${toast.type}`}
                    role="alert"
                >
                    {icons[toast.type]}
                    <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>
                            {toast.title}
                        </p>
                        {toast.message && (
                            <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                                {toast.message}
                            </p>
                        )}
                    </div>
                    <button
                        onClick={() => dismiss(toast.id)}
                        className="btn-ghost btn-icon btn-sm flex-shrink-0"
                        aria-label="Dismiss"
                    >
                        <X size={14} />
                    </button>
                </div>
            ))}
        </div>
    )
}
