import { useState, useMemo } from 'react'

interface UseTableOptions<T> {
    data: T[]
    searchFields: (keyof T)[]
    defaultSortKey?: keyof T
}

export function useTable<T extends Record<string, unknown>>({
    data,
    searchFields,
    defaultSortKey,
}: UseTableOptions<T>) {
    const [search, setSearch] = useState('')
    const [sortKey, setSortKey] = useState<keyof T | undefined>(defaultSortKey)
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
    const [page, setPage] = useState(1)
    const perPage = 10

    const filtered = useMemo(() => {
        if (!search.trim()) return data
        const q = search.toLowerCase()
        return data.filter(row =>
            searchFields.some(field => String(row[field] ?? '').toLowerCase().includes(q))
        )
    }, [data, search, searchFields])

    const sorted = useMemo(() => {
        if (!sortKey) return filtered
        return [...filtered].sort((a, b) => {
            const av = String(a[sortKey] ?? '')
            const bv = String(b[sortKey] ?? '')
            return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
        })
    }, [filtered, sortKey, sortDir])

    const totalPages = Math.max(1, Math.ceil(sorted.length / perPage))
    const paginated = sorted.slice((page - 1) * perPage, page * perPage)

    const toggleSort = (key: keyof T) => {
        if (sortKey === key) {
            setSortDir(d => d === 'asc' ? 'desc' : 'asc')
        } else {
            setSortKey(key)
            setSortDir('asc')
        }
        setPage(1)
    }

    const handleSearch = (value: string) => {
        setSearch(value)
        setPage(1)
    }

    return {
        search, setSearch: handleSearch,
        sortKey, sortDir, toggleSort,
        page, setPage, totalPages, perPage,
        filtered, paginated,
        total: filtered.length,
    }
}
