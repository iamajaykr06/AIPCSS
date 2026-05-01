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
    Department, DepartmentPayload, PaginatedResponse,
    Program, ProgramPayload,
    Batch, BatchPayload,
    Section, SectionPayload,
    Teacher, TeacherPayload,
    Course, CoursePayload,
    Room, RoomPayload,
} from '@/types'

// ── Departments ─────────────────────────────────────────────────────────────

export const departmentService = {
    async list(page = 1, perPage = 2000): Promise<PaginatedResponse<Department>> {
        const res = await api.get('/resources/departments', { params: { page, per_page: perPage } })
        return res.data
    },
    async get(id: number): Promise<Department> {
        const res = await api.get(`/resources/departments/${id}`)
        return res.data
    },
    async create(payload: DepartmentPayload): Promise<Department> {
        const res = await api.post('/resources/departments', payload)
        return res.data
    },
    async update(id: number, payload: Partial<DepartmentPayload>): Promise<Department> {
        const res = await api.put(`/resources/departments/${id}`, payload)
        return res.data
    },
    async delete(id: number): Promise<void> {
        await api.delete(`/resources/departments/${id}`)
    },
    async bulkImport(file: File) {
        const formData = new FormData();
        formData.append('file', file);
        const res = await api.post('/resources/departments/import', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
        })
        return res.data
    }
}

// ── Programs ────────────────────────────────────────────────────────────────

export const programService = {
    async list(departmentId?: number, page = 1, perPage = 2000): Promise<PaginatedResponse<Program>> {
        const params: Record<string, unknown> = { page, per_page: perPage }
        if (departmentId) params.department_id = departmentId
        const res = await api.get('/resources/programs', { params })
        return res.data
    },
    async get(id: number): Promise<Program> {
        const res = await api.get(`/resources/programs/${id}`)
        return res.data
    },
    async create(payload: ProgramPayload): Promise<Program> {
        const res = await api.post('/resources/programs', payload)
        return res.data
    },
    async update(id: number, payload: Partial<ProgramPayload>): Promise<Program> {
        const res = await api.put(`/resources/programs/${id}`, payload)
        return res.data
    },
    async delete(id: number): Promise<void> {
        await api.delete(`/resources/programs/${id}`)
    },
    async bulkImport(file: File) {
        const formData = new FormData();
        formData.append('file', file);
        const res = await api.post('/resources/programs/import', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
        })
        return res.data
    }
}

// ── Batches ─────────────────────────────────────────────────────────────────

export const batchService = {
    async list(programId?: number, page = 1, perPage = 2000): Promise<PaginatedResponse<Batch>> {
        const params: Record<string, unknown> = { page, per_page: perPage }
        if (programId) params.program_id = programId
        const res = await api.get('/resources/batches', { params })
        return res.data
    },
    async get(id: number): Promise<Batch> {
        const res = await api.get(`/resources/batches/${id}`)
        return res.data
    },
    async create(payload: BatchPayload): Promise<Batch> {
        const res = await api.post('/resources/batches', payload)
        return res.data
    },
    async update(id: number, payload: Partial<BatchPayload>): Promise<Batch> {
        const res = await api.put(`/resources/batches/${id}`, payload)
        return res.data
    },
    async delete(id: number): Promise<void> {
        await api.delete(`/resources/batches/${id}`)
    },
    async bulkImport(file: File) {
        const formData = new FormData();
        formData.append('file', file);
        const res = await api.post('/resources/batches/import', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
        })
        return res.data
    }
}

// ── Sections ────────────────────────────────────────────────────────────────

export const sectionService = {
    async list(batchId?: number, page = 1, perPage = 2000): Promise<PaginatedResponse<Section>> {
        const params: Record<string, unknown> = { page, per_page: perPage }
        if (batchId) params.batch_id = batchId
        const res = await api.get('/resources/sections', { params })
        return res.data
    },
    async get(id: number): Promise<Section> {
        const res = await api.get(`/resources/sections/${id}`)
        return res.data
    },
    async create(payload: SectionPayload): Promise<Section> {
        const res = await api.post('/resources/sections', payload)
        return res.data
    },
    async update(id: number, payload: Partial<SectionPayload>): Promise<Section> {
        const res = await api.put(`/resources/sections/${id}`, payload)
        return res.data
    },
    async delete(id: number): Promise<void> {
        await api.delete(`/resources/sections/${id}`)
    },
    async bulkImport(file: File) {
        const formData = new FormData();
        formData.append('file', file);
        const res = await api.post('/resources/sections/import', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
        })
        return res.data
    }
}

// ── Teachers ────────────────────────────────────────────────────────────────

export const teacherService = {
    async list(departmentId?: number, page = 1, perPage = 2000): Promise<PaginatedResponse<Teacher>> {
        const params: Record<string, unknown> = { page, per_page: perPage }
        if (departmentId) params.department_id = departmentId
        const res = await api.get('/resources/teachers', { params })
        return res.data
    },
    async get(id: number): Promise<Teacher> {
        const res = await api.get(`/resources/teachers/${id}`)
        return res.data
    },
    async create(payload: TeacherPayload): Promise<Teacher> {
        const res = await api.post('/resources/teachers', payload)
        return res.data
    },
    async update(id: number, payload: Partial<TeacherPayload>): Promise<Teacher> {
        const res = await api.put(`/resources/teachers/${id}`, payload)
        return res.data
    },
    async delete(id: number): Promise<void> {
        await api.delete(`/resources/teachers/${id}`)
    },
    async addQualification(teacherId: number, courseId: number): Promise<{ message: string }> {
        const res = await api.post(`/resources/teachers/${teacherId}/qualifications`, { course_id: courseId })
        return res.data
    },
    async removeQualification(teacherId: number, courseId: number): Promise<{ message: string }> {
        const res = await api.delete(`/resources/teachers/${teacherId}/qualifications/${courseId}`)
        return res.data
    },
    async bulkImport(file: File) {
        const formData = new FormData();
        formData.append('file', file);
        const res = await api.post('/resources/teachers/import', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
        })
        return res.data
    }
}

// ── Courses ─────────────────────────────────────────────────────────────────

export const courseService = {
    async list(departmentId?: number, page = 1, perPage = 2000): Promise<PaginatedResponse<Course>> {
        const params: Record<string, unknown> = { page, per_page: perPage }
        if (departmentId) params.department_id = departmentId
        const res = await api.get('/resources/courses', { params })
        return res.data
    },
    async get(id: number): Promise<Course> {
        const res = await api.get(`/resources/courses/${id}`)
        return res.data
    },
    async create(payload: CoursePayload): Promise<Course> {
        const res = await api.post('/resources/courses', payload)
        return res.data
    },
    async update(id: number, payload: Partial<CoursePayload>): Promise<Course> {
        const res = await api.put(`/resources/courses/${id}`, payload)
        return res.data
    },
    async delete(id: number): Promise<void> {
        await api.delete(`/resources/courses/${id}`)
    },
    async bulkImport(file: File) {
        const formData = new FormData();
        formData.append('file', file);
        const res = await api.post('/resources/courses/import', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
        })
        return res.data
    }
}

// ── Rooms ────────────────────────────────────────────────────────────────────

export const roomService = {
    async list(roomType?: string, page = 1, perPage = 2000): Promise<PaginatedResponse<Room>> {
        const params: Record<string, unknown> = { page, per_page: perPage }
        if (roomType) params.room_type = roomType
        const res = await api.get('/resources/rooms', { params })
        return res.data
    },
    async get(id: number): Promise<Room> {
        const res = await api.get(`/resources/rooms/${id}`)
        return res.data
    },
    async create(payload: RoomPayload): Promise<Room> {
        const res = await api.post('/resources/rooms', payload)
        return res.data
    },
    async update(id: number, payload: Partial<RoomPayload>): Promise<Room> {
        const res = await api.put(`/resources/rooms/${id}`, payload)
        return res.data
    },
    async delete(id: number): Promise<void> {
        await api.delete(`/resources/rooms/${id}`)
    },
    async bulkImport(file: File) {
        const formData = new FormData();
        formData.append('file', file);
        const res = await api.post('/resources/rooms/import', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
        })
        return res.data
    }
}

// ── Workload ────────────────────────────────────────────────────────────────

export const workloadService = {
    async getSectionWorkload(sectionId: number) {
        const res = await api.get(`/workload/sections/${sectionId}`)
        return res.data
    },
    async assign(sectionId: number, courseId: number, teacherId: number) {
        const res = await api.post('/workload/assign', { section_id: sectionId, course_id: courseId, teacher_id: teacherId })
        return res.data
    },
    async unassign(sectionId: number, courseId: number) {
        const res = await api.post('/workload/unassign', { section_id: sectionId, course_id: courseId })
        return res.data
    },
    async bulkImport(file: File) {
        const formData = new FormData();
        formData.append('file', file);
        const res = await api.post('/workload/import', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
        })
        return res.data
    },
    async autoAssignAll() {
        const response = await api.post('/workload/auto-assign-all')
        return response.data
    },
    async rebalanceAll() {
        const response = await api.post('/workload/rebalance-all')
        return response.data
    }
}
