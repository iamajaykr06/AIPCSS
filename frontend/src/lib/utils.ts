import type { AxiosError } from 'axios'

/**
 * Extract a human-readable error message from an unknown error value.
 */
export function getErrorMessage(error: unknown): string {
    if (!error) return 'An unknown error occurred'

    // Axios-style error
    if (typeof error === 'object' && error !== null && 'response' in error) {
        const axiosErr = error as AxiosError<{ 
            error?: string; 
            message?: string; 
            details?: string[]; 
            errors?: string[];
        }>
        const data = axiosErr.response?.data
        if (data) {
            // Check for details, errors, error, or message in that order
            if (data.details && Array.isArray(data.details)) {
                return data.details.join(', ')
            }
            if (data.errors && Array.isArray(data.errors)) {
                return data.errors.join(', ')
            }
            return data.error || data.message || axiosErr.message
        }
        return axiosErr.message
    }

    if (error instanceof Error) return error.message
    if (typeof error === 'string') return error

    return 'An unknown error occurred'
}

/**
 * Get initials from a name string (e.g., "John Doe" -> "JD").
 */
export function getInitials(name: string): string {
    if (!name) return '?'
    return name
        .split(/\s+/)
        .filter(Boolean)
        .map(word => word[0].toUpperCase())
        .slice(0, 2)
        .join('')
}

/**
 * Working days used across the timetable UI.
 */
export const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'] as const

/**
 * Default time-slot labels used in the timetable grid.
 * These match the backend's default ScheduleSettings.
 */
export const SLOTS: string[] = [
    '09:00-10:00',
    '10:00-11:00',
    '11:00-12:00',
    '13:00-14:00',
    '14:00-15:00',
    '15:00-16:00',
]
