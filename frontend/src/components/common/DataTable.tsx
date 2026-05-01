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
                                    <th
                                        key={String(col.key)}
                                        style={{ cursor: col.sortable ? 'pointer' : 'default' }}
                                        onClick={() => col.sortable && onSort && onSort(col.key as keyof T)}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                                            {col.label}
                                            {col.sortable && (
                                                <span style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                                                    <ChevronUp
                                                        size={10}
                                                        style={{ color: sortKey === col.key && sortDir === 'asc' ? '#3b82f6' : 'var(--text-muted)' }}
                                                    />
                                                    <ChevronDown
                                                        size={10}
                                                        style={{ color: sortKey === col.key && sortDir === 'desc' ? '#3b82f6' : 'var(--text-muted)' }}
                                                    />
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
                                            {col.render ? col.render(row) : String(row[col.key as keyof T] ?? 'N/A')}
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
                    {(() => {
                        let startP = Math.max(1, page - 2)
                        const endP = Math.min(totalPages, startP + 4)
                        if (endP - startP < 4) {
                            startP = Math.max(1, endP - 4)
                        }

                        return Array.from({ length: endP - startP + 1 }, (_, i) => {
                            const p = startP + i
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
                        })
                    })()}
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
