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

import api from '@/lib/axios'
import type {
    GenerateSchedulePayload, GenerateScheduleResult,
    TimetableViewResponse, GroupedTimetableResponse, SchedulingStats,
} from '@/types'

interface CreateEntryPayload {
    day: string;
    timeslot: string;
    section_id: number;
    course_id: number;
    teacher_id: number;
    room_id: number;
    department_id: number;
}

interface UpdateEntryPayload {
    day?: string;
    timeslot?: string;
    room_id?: number;
    teacher_id?: number;
    course_id?: number;
    section_id?: number;
}

export const schedulingService = {
    // Timetable generation
    async generateTimetable(payload: GenerateSchedulePayload): Promise<GenerateScheduleResult> {
        const res = await api.post('/scheduling/generate', payload)
        return res.data
    },

    async generateAllTimetables(payload: Partial<GenerateSchedulePayload>): Promise<GenerateScheduleResult[]> {
        const res = await api.post('/scheduling/generate/all', payload)
        return res.data
    },

    // Timetable viewing
    async viewTimetable(deptId: number): Promise<TimetableViewResponse> {
        const res = await api.get(`/scheduling/view/${deptId}`)
        return res.data
    },

    async viewAllTimetables(): Promise<TimetableViewResponse> {
        const res = await api.get(`/scheduling/view/all`)
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
    async createEntry(payload: CreateEntryPayload): Promise<{ message: string; id: number }> {
        const res = await api.post('/scheduling/entries', payload)
        return res.data
    },

    async deleteEntry(id: number): Promise<void> {
        await api.delete(`/scheduling/entries/${id}`)
    },

    async updateEntry(id: number, payload: UpdateEntryPayload): Promise<{ message: string }> {
        const res = await api.patch(`/scheduling/entries/${id}`, payload)
        return res.data
    },

    async getStats(): Promise<SchedulingStats> {
        const res = await api.get('/scheduling/stats')
        return res.data
    },

    // PDF Export
    async exportDepartmentPDF(deptId: number, semester?: string): Promise<Blob> {
        const res = await api.get(`/pdf/${deptId}`, {
            params: semester ? { semester } : {},
            responseType: 'blob',
        })
        return res.data as Blob
    },

    async exportAllDepartmentsPDF(): Promise<Blob> {
        const res = await api.get('/pdf/all', { responseType: 'blob' })
        return res.data as Blob
    },
}
