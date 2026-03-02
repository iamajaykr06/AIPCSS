import api from '@/lib/axios'

export interface Program {
  id: number
  code: string
  name: string
  department_id: number
  department?: string
}

export interface Course {
  id: number
  code: string
  name: string
  course_type: 'Theory' | 'Lab'
  credits: number
  department_id: number
  department?: string
}
export interface ProgramCourse {
  id: number
  program_id: number
  program_code: string
  course_id: number
  course_code: string
  course_name: string
  course_type: 'Theory' | 'Lab'
  semester_number: number
  semester_display: string
}

export interface Batch {
  id: number
  name: string
  academic_year: string
  current_semester: number
  program?: {
    id: number
    code: string
    name: string
  }
}

export interface CurriculumData {
  [programName: string]: {
    [semesterName: string]: ProgramCourse[]
  }
}

export const curriculumService = {
  // ── Programs ──────────────────────────────────────────────────────────────

  async getPrograms(): Promise<{ programs: Program[] }> {
    const res = await api.get('/curriculum/programs')
    return res.data
  },

  async createProgram(data: {
    code: string
    name: string
    department_id: number
  }): Promise<{ message: string; program: Program }> {
    const res = await api.post('/curriculum/programs', data)
    return res.data
  },

  async updateProgram(programId: number, data: Partial<Program>): Promise<{ message: string; program: Program }> {
    const res = await api.put(`/curriculum/programs/${programId}`, data)
    return res.data
  },

  async deleteProgram(programId: number): Promise<{ message: string }> {
    const res = await api.delete(`/curriculum/programs/${programId}`)
    return res.data
  },

  // ── Courses ───────────────────────────────────────────────────────────────

  async getCourses(): Promise<{ courses: Course[] }> {
    const res = await api.get('/curriculum/courses')
    return res.data
  },

  async createCourse(data: {
    code: string
    name: string
    course_type: 'Theory' | 'Lab'
    credits?: number
    department_id: number
  }): Promise<{ message: string; course: Course }> {
    const res = await api.post('/curriculum/courses', data)
    return res.data
  },

  async updateCourse(courseId: number, data: Partial<Course>): Promise<{ message: string; course: Course }> {
    const res = await api.put(`/curriculum/courses/${courseId}`, data)
    return res.data
  },

  async deleteCourse(courseId: number): Promise<{ message: string }> {
    const res = await api.delete(`/curriculum/courses/${courseId}`)
    return res.data
  },

  // ── Curriculum Management ─────────────────────────────────────────────────────

  async getCurriculum(programId?: number): Promise<{ curriculum: CurriculumData }> {
    const params = programId ? { program_id: programId } : {}
    const res = await api.get('/curriculum/curriculum', { params })
    return res.data
  },

  async addCurriculumItem(data: {
    program_id: number
    course_id: number
    semester_number: number
  }): Promise<{ message: string; curriculum_item: ProgramCourse }> {
    const res = await api.post('/curriculum/curriculum', data)
    return res.data
  },

  async updateCurriculumItem(curriculumId: number, data: {
    semester_number?: number
  }): Promise<{ message: string; curriculum_item: ProgramCourse }> {
    const res = await api.put(`/curriculum/curriculum/${curriculumId}`, data)
    return res.data
  },

  async deleteCurriculumItem(curriculumId: number): Promise<{ message: string }> {
    const res = await api.delete(`/curriculum/curriculum/${curriculumId}`)
    return res.data
  },

  // ── Batches ───────────────────────────────────────────────────────────────

  async getBatches(): Promise<{ batches: Batch[] }> {
    const res = await api.get('/curriculum/batches')
    return res.data
  },

  async updateBatchSemester(batchId: number, currentSemester: number): Promise<{ message: string; batch: Batch }> {
    const res = await api.put(`/curriculum/batches/${batchId}/semester`, {
      current_semester: currentSemester
    })
    return res.data
  },

  async getBatchCurrentCourses(batchId: number): Promise<{
    batch: Batch
    courses: Course[]
  }> {
    const res = await api.get(`/curriculum/batches/${batchId}/current-courses`)
    return res.data
  }
}
