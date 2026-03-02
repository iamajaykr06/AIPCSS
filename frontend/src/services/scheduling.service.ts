import api from '@/lib/axios'
import type {
    Workload, WorkloadPayload,
    GenerateSchedulePayload, GenerateScheduleResult,
    TimetableViewResponse, GroupedTimetableResponse,
} from '@/types'

export const schedulingService = {
    // Workloads
    async getWorkloads(filters?: { section_id?: number; teacher_id?: number }): Promise<{ data: Workload[] }> {
        const res = await api.get('/scheduling/workloads', { params: filters })
        return res.data
    },

    async createWorkload(payload: WorkloadPayload): Promise<{ message: string; id: number }> {
        const res = await api.post('/scheduling/workloads', payload)
        return res.data
    },

    async deleteWorkload(id: number): Promise<void> {
        await api.delete(`/scheduling/workloads/${id}`)
    },

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
