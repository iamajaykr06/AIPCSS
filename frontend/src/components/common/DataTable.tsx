import React from 'react'
import { Search, ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { TableSkeleton, EmptyState } from '@/components/ui/Loading'

interface Column<T> {
    key: keyof T | string
    label: string
    sortable?: boolean
    render?: (row: T) => React.ReactNode
}

interface DataTableProps<T extends Record<string, unknown>> {
    columns: Column<T>[]
    data: T[]
    isLoading?: boolean
    search: string
    onSearch: (v: string) => void
    page: number
    totalPages: number
    onPageChange: (p: number) => void
    total: number
    actions?: (row: T) => React.ReactNode
    sortKey?: keyof T | string
    sortDir?: 'asc' | 'desc'
    onSort?: (key: keyof T) => void
    emptyIcon?: React.ReactNode
    emptyTitle?: string
    emptyDescription?: string
    headerRight?: React.ReactNode
}

export function DataTable<T extends Record<string, unknown>>({
    columns, data, isLoading, search, onSearch,
    page, totalPages, onPageChange, total,
    actions, sortKey, sortDir, onSort,
    emptyIcon, emptyTitle = 'No records found',
    emptyDescription, headerRight,
}: DataTableProps<T>) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Search + header right */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                <div className="search-wrapper" style={{ flex: 1, minWidth: '200px', maxWidth: '340px' }}>
                    <Search size={15} className="search-icon" />
                    <input
                        className="input search-input"
                        placeholder="Search..."
                        value={search}
                        onChange={e => onSearch(e.target.value)}
                    />
                </div>
                {total > 0 && (
                    <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginLeft: 'auto' }}>
                        {total} record{total !== 1 ? 's' : ''}
                    </p>
                )}
                {headerRight}
            </div>

            {/* Table */}
            {isLoading ? (
                <TableSkeleton rows={5} cols={columns.length + (actions ? 1 : 0)} />
            ) : data.length === 0 ? (
                <div className="table-wrapper">
                    <EmptyState
                        icon={emptyIcon}
                        title={search ? `No results for "${search}"` : emptyTitle}
                        description={search ? 'Try a different search term' : emptyDescription}
                    />
                </div>
            ) : (
                <div className="table-wrapper">
                    <table className="table">
                        <thead>
                            <tr>
                                {columns.map(col => (
                                    <th key={String(col.key)}
                                        style={{ cursor: col.sortable ? 'pointer' : 'default' }}
                                        onClick={() => col.sortable && onSort && onSort(col.key as keyof T)}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                                            {col.label}
                                            {col.sortable && (
                                                <span style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                                                    <ChevronUp size={10}
                                                        style={{ color: sortKey === col.key && sortDir === 'asc' ? '#3b82f6' : 'var(--text-muted)' }} />
                                                    <ChevronDown size={10}
                                                        style={{ color: sortKey === col.key && sortDir === 'desc' ? '#3b82f6' : 'var(--text-muted)' }} />
                                                </span>
                                            )}
                                        </div>
                                    </th>
                                ))}
                                {actions && <th style={{ width: '1px', whiteSpace: 'nowrap' }}>Actions</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {data.map((row, i) => (
                                <tr key={i}>
                                    {columns.map(col => (
                                        <td key={String(col.key)}>
                                            {col.render ? col.render(row) : String(row[col.key as keyof T] ?? '—')}
                                        </td>
                                    ))}
                                    {actions && (
                                        <td>
                                            <div style={{ display: 'flex', gap: '0.375rem', alignItems: 'center' }}>
                                                {actions(row)}
                                            </div>
                                        </td>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.5rem' }}>
                    <button
                        className="btn btn-secondary btn-sm btn-icon"
                        onClick={() => onPageChange(page - 1)}
                        disabled={page === 1}
                    >
                        <ChevronLeft size={16} />
                    </button>
                    {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                        const p = i + 1
                        return (
                            <button
                                key={p}
                                className={`btn btn-sm ${p === page ? 'btn-primary' : 'btn-secondary'}`}
                                style={{ minWidth: '2rem', padding: '0.25rem 0.5rem' }}
                                onClick={() => onPageChange(p)}
                            >
                                {p}
                            </button>
                        )
                    })}
                    <button
                        className="btn btn-secondary btn-sm btn-icon"
                        onClick={() => onPageChange(page + 1)}
                        disabled={page === totalPages}
                    >
                        <ChevronRight size={16} />
                    </button>
                </div>
            )}
        </div>
    )
}
