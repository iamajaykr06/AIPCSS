import React from 'react'

// ── Spinner ───────────────────────────────────────────────────────────────────

export function Spinner({ size = 20 }: { size?: number }) {
    return (
        <div
            className="spinner"
            style={{ width: size, height: size }}
            role="status"
            aria-label="Loading"
        />
    )
}

// ── Page Loader ──────────────────────────────────────────────────────────────

export function PageLoader({ message = 'Loading...' }: { message?: string }) {
    return (
        <div className="page-loader">
            <Spinner size={32} />
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{message}</p>
        </div>
    )
}

// ── Skeleton ─────────────────────────────────────────────────────────────────

export function Skeleton({ className = '', style }: { className?: string; style?: React.CSSProperties }) {
    return <div className={`skeleton ${className}`} style={style} />
}

export function TableSkeleton({ rows = 5, cols = 5 }: { rows?: number; cols?: number }) {
    return (
        <div className="table-wrapper">
            <table className="table">
                <thead>
                    <tr>
                        {Array.from({ length: cols }).map((_, i) => (
                            <th key={i}><Skeleton style={{ height: '0.75rem', width: '80%' }} /></th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {Array.from({ length: rows }).map((_, r) => (
                        <tr key={r}>
                            {Array.from({ length: cols }).map((_, c) => (
                                <td key={c}><Skeleton style={{ height: '1rem', width: c === 0 ? '60%' : '80%' }} /></td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}

// ── Empty State ───────────────────────────────────────────────────────────────

interface EmptyStateProps {
    icon?: React.ReactNode
    title: string
    description?: string
    action?: React.ReactNode
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
    return (
        <div className="empty-state">
            {icon && (
                <div style={{ color: 'var(--text-muted)', opacity: 0.6 }}>
                    {icon}
                </div>
            )}
            <div>
                <p className="font-semibold text-base" style={{ color: 'var(--text-secondary)' }}>{title}</p>
                {description && (
                    <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>{description}</p>
                )}
            </div>
            {action}
        </div>
    )
}

// ── Error State ───────────────────────────────────────────────────────────────

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
    return (
        <div className="empty-state">
            <div style={{ color: '#ef4444' }}>
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="15" y1="9" x2="9" y2="15" />
                    <line x1="9" y1="9" x2="15" y2="15" />
                </svg>
            </div>
            <div>
                <p className="font-semibold text-base" style={{ color: 'var(--text-secondary)' }}>Something went wrong</p>
                <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>{message}</p>
            </div>
            {onRetry && (
                <button className="btn btn-secondary btn-sm" onClick={onRetry}>Try again</button>
            )}
        </div>
    )
}
