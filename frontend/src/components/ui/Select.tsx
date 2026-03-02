import React, { useState, useRef, useEffect } from 'react'
import { ChevronDown } from 'lucide-react'

interface SelectOption {
    value: string | number
    label: string
}

interface SelectProps {
    value: string | number | undefined
    onChange: (value: string | number) => void
    options: SelectOption[]
    placeholder?: string
    disabled?: boolean
    className?: string
    id?: string
}

export function Select({ value, onChange, options, placeholder = 'Select...', disabled, className, id }: SelectProps) {
    const [open, setOpen] = useState(false)
    const ref = useRef<HTMLDivElement>(null)

    useEffect(() => {
        function handler(e: MouseEvent) {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
        }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [])

    const selected = options.find(o => o.value === value)

    return (
        <div ref={ref} className={`relative ${className || ''}`} id={id}>
            <button
                type="button"
                disabled={disabled}
                onClick={() => setOpen(p => !p)}
                className="input flex items-center justify-between gap-2 text-left cursor-pointer"
                style={{ minHeight: '2.25rem' }}
            >
                <span style={{ color: selected ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                    {selected?.label || placeholder}
                </span>
                <ChevronDown size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>
            {open && (
                <div className="dropdown-menu absolute top-full left-0 right-0 mt-1 max-h-52 overflow-y-auto z-50">
                    {options.map(opt => (
                        <button
                            key={opt.value}
                            type="button"
                            className={`dropdown-item ${opt.value === value ? 'font-medium' : ''}`}
                            style={{ color: opt.value === value ? '#3b82f6' : 'var(--text-primary)' }}
                            onClick={() => { onChange(opt.value); setOpen(false) }}
                        >
                            {opt.label}
                        </button>
                    ))}
                    {options.length === 0 && (
                        <p className="text-sm px-3 py-2" style={{ color: 'var(--text-muted)' }}>No options</p>
                    )}
                </div>
            )}
        </div>
    )
}

// Native select for forms
export function NativeSelect({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
    return (
        <select
            {...props}
            className={`input select ${className || ''}`}
        />
    )
}
