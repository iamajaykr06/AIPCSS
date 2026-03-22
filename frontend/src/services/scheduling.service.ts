import api from '@/lib/axios'
import type {
    GenerateSchedulePayload, GenerateScheduleResult,
    TimetableViewResponse, GroupedTimetableResponse,
} from '@/types'

export const schedulingService = {
    // Timetable generation
    async generateTimetable(payload: GenerateSchedulePayload): Promise<GenerateScheduleResult> {
        const res = await api.post('/scheduling/generate', payload)
        return res.data
    },

    // Timetable viewing
    async viewTimetable(deptId: number): Promise<TimetableViewResponse> {
        const res = await api.get(`/scheduling/view/${deptId}`)
        return res.data
    },

    async viewGroupedTimetable(deptId: number): Promise<GroupedTimetableResponse> {
        const res = await api.get(`/scheduling/view/${deptId}`, { params: { group_by: 'section' } })
        return res.data
    },

    async clearTimetable(deptId: number): Promise<{ message: string }> {
        const res = await api.delete(`/scheduling/view/${deptId}`)
        return res.data
    },

    // Manual Entry Management
    async createEntry(payload: any): Promise<{ message: string; id: number }> {
        const res = await api.post('/scheduling/entries', payload)
        return res.data
    },

    async deleteEntry(id: number): Promise<void> {
        await api.delete(`/scheduling/entries/${id}`)
    },

    async updateEntry(id: number, payload: any): Promise<{ message: string }> {
        const res = await api.patch(`/scheduling/entries/${id}`, payload)
        return res.data
    },

    async getStats(): Promise<any> {
        const res = await api.get('/scheduling/stats')
        return res.data
    }
}
