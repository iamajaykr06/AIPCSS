import React, { useState, useEffect } from 'react'
import { Plus, Edit2, Trash2, BookOpen, Users, Calendar, Save, X } from 'lucide-react'
import { curriculumService, type Program, type Course, type ProgramCourse, type Batch, type CurriculumData } from '@/services/curriculum.service'
import { useToast } from '@/context/ToastContext'
import { Spinner } from '@/components/ui/Loading'

export function CurriculumManagement() {
  const [activeTab, setActiveTab] = useState<'programs' | 'courses' | 'curriculum' | 'batches'>('programs')
  const [loading, setLoading] = useState(true)
  const [programs, setPrograms] = useState<Program[]>([])
  const [courses, setCourses] = useState<Course[]>([])
  const [curriculum, setCurriculum] = useState<CurriculumData>({})
  const [batches, setBatches] = useState<Batch[]>([])
  
  // Form states
  const [showProgramForm, setShowProgramForm] = useState(false)
  const [showCourseForm, setShowCourseForm] = useState(false)
  const [editingProgram, setEditingProgram] = useState<Program | null>(null)
  const [editingCourse, setEditingCourse] = useState<Course | null>(null)
  
  const { toast } = useToast()

  // Load data
  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      setLoading(true)
      const [programsRes, coursesRes, curriculumRes, batchesRes] = await Promise.all([
        curriculumService.getPrograms(),
        curriculumService.getCourses(),
        curriculumService.getCurriculum(),
        curriculumService.getBatches()
      ])
      
      setPrograms(programsRes.programs)
      setCourses(coursesRes.courses)
      setCurriculum(curriculumRes.curriculum)
      setBatches(batchesRes.batches)
    } catch (error) {
      toast('error', 'Failed to load data', 'Please try again later')
    } finally {
      setLoading(false)
    }
  }

  // ── Program Management ─────────────────────────────────────────────────────

  const handleCreateProgram = async (data: Omit<Program, 'id'>) => {
    try {
      await curriculumService.createProgram(data)
      toast('success', 'Program created', `${data.code} - ${data.name}`)
      setShowProgramForm(false)
      loadData()
    } catch (error: any) {
      toast('error', 'Failed to create program', error.response?.data?.error || 'Please try again')
    }
  }

  const handleUpdateProgram = async (id: number, data: Partial<Program>) => {
    try {
      await curriculumService.updateProgram(id, data)
      toast('success', 'Program updated', 'Changes saved successfully')
      setEditingProgram(null)
      loadData()
    } catch (error: any) {
      toast('error', 'Failed to update program', error.response?.data?.error || 'Please try again')
    }
  }

  const handleDeleteProgram = async (id: number, name: string) => {
    if (!confirm(`Are you sure you want to delete ${name}?`)) return
    
    try {
      await curriculumService.deleteProgram(id)
      toast('success', 'Program deleted', `${name} has been removed`)
      loadData()
    } catch (error: any) {
      toast('error', 'Failed to delete program', error.response?.data?.error || 'Please try again')
    }
  }

  // ── Course Management ──────────────────────────────────────────────────────

  const handleCreateCourse = async (data: Omit<Course, 'id'>) => {
    try {
      await curriculumService.createCourse(data)
      toast('success', 'Course created', `${data.code} - ${data.name}`)
      setShowCourseForm(false)
      loadData()
    } catch (error: any) {
      toast('error', 'Failed to create course', error.response?.data?.error || 'Please try again')
    }
  }

  const handleUpdateCourse = async (id: number, data: Partial<Course>) => {
    try {
      await curriculumService.updateCourse(id, data)
      toast('success', 'Course updated', 'Changes saved successfully')
      setEditingCourse(null)
      loadData()
    } catch (error: any) {
      toast('error', 'Failed to update course', error.response?.data?.error || 'Please try again')
    }
  }

  const handleDeleteCourse = async (id: number, name: string) => {
    if (!confirm(`Are you sure you want to delete ${name}?`)) return
    
    try {
      await curriculumService.deleteCourse(id)
      toast('success', 'Course deleted', `${name} has been removed`)
      loadData()
    } catch (error: any) {
      toast('error', 'Failed to delete course', error.response?.data?.error || 'Please try again')
    }
  }

  // ── Batch Semester Update ─────────────────────────────────────────────────

  const handleUpdateBatchSemester = async (batchId: number, newSemester: number) => {
    try {
      await curriculumService.updateBatchSemester(batchId, newSemester)
      toast('success', 'Batch semester updated', 'Changes saved successfully')
      loadData()
    } catch (error: any) {
      toast('error', 'Failed to update batch', error.response?.data?.error || 'Please try again')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <Spinner size={24} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Curriculum Management</h1>
        <p className="text-gray-600">Manage programs, courses, and curriculum structure</p>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          {[
            { id: 'programs', label: 'Programs', icon: BookOpen },
            { id: 'courses', label: 'Courses', icon: BookOpen },
            { id: 'curriculum', label: 'Curriculum', icon: Calendar },
            { id: 'batches', label: 'Batches', icon: Users }
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id as any)}
              className={`py-2 px-1 border-b-2 font-medium text-sm flex items-center gap-2 ${
                activeTab === id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
        </nav>
      </div>

      {/* Programs Tab */}
      {activeTab === 'programs' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold">Programs</h2>
            <button
              onClick={() => setShowProgramForm(true)}
              className="btn btn-primary flex items-center gap-2"
            >
              <Plus size={16} />
              Add Program
            </button>
          </div>

          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Code</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Department</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {programs.map((program) => (
                  <tr key={program.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {editingProgram?.id === program.id ? (
                        <input
                          type="text"
                          value={editingProgram.code}
                          onChange={(e) => setEditingProgram({ ...editingProgram, code: e.target.value })}
                          className="input input-sm"
                        />
                      ) : (
                        program.code
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {editingProgram?.id === program.id ? (
                        <input
                          type="text"
                          value={editingProgram.name}
                          onChange={(e) => setEditingProgram({ ...editingProgram, name: e.target.value })}
                          className="input input-sm"
                        />
                      ) : (
                        program.name
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {program.department || 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      {editingProgram?.id === program.id ? (
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => handleUpdateProgram(program.id, editingProgram)}
                            className="text-green-600 hover:text-green-900"
                          >
                            <Save size={16} />
                          </button>
                          <button
                            onClick={() => setEditingProgram(null)}
                            className="text-gray-600 hover:text-gray-900"
                          >
                            <X size={16} />
                          </button>
                        </div>
                      ) : (
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => setEditingProgram(program)}
                            className="text-blue-600 hover:text-blue-900"
                          >
                            <Edit2 size={16} />
                          </button>
                          <button
                            onClick={() => handleDeleteProgram(program.id, program.name)}
                            className="text-red-600 hover:text-red-900"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Courses Tab */}
      {activeTab === 'courses' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold">Courses</h2>
            <button
              onClick={() => setShowCourseForm(true)}
              className="btn btn-primary flex items-center gap-2"
            >
              <Plus size={16} />
              Add Course
            </button>
          </div>

          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Code</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Credits</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {courses.map((course) => (
                  <tr key={course.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {editingCourse?.id === course.id ? (
                        <input
                          type="text"
                          value={editingCourse.code}
                          onChange={(e) => setEditingCourse({ ...editingCourse, code: e.target.value })}
                          className="input input-sm"
                        />
                      ) : (
                        course.code
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {editingCourse?.id === course.id ? (
                        <input
                          type="text"
                          value={editingCourse.name}
                          onChange={(e) => setEditingCourse({ ...editingCourse, name: e.target.value })}
                          className="input input-sm"
                        />
                      ) : (
                        course.name
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        course.course_type === 'Theory' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'
                      }`}>
                        {course.course_type}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {course.credits}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      {editingCourse?.id === course.id ? (
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => handleUpdateCourse(course.id, editingCourse)}
                            className="text-green-600 hover:text-green-900"
                          >
                            <Save size={16} />
                          </button>
                          <button
                            onClick={() => setEditingCourse(null)}
                            className="text-gray-600 hover:text-gray-900"
                          >
                            <X size={16} />
                          </button>
                        </div>
                      ) : (
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => setEditingCourse(course)}
                            className="text-blue-600 hover:text-blue-900"
                          >
                            <Edit2 size={16} />
                          </button>
                          <button
                            onClick={() => handleDeleteCourse(course.id, course.name)}
                            className="text-red-600 hover:text-red-900"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Curriculum Tab */}
      {activeTab === 'curriculum' && (
        <div className="space-y-6">
          <h2 className="text-lg font-semibold">Program Curriculum</h2>
          
          {Object.entries(curriculum).map(([programName, semesters]) => (
            <div key={programName} className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">{programName}</h3>
              
              {Object.entries(semesters).map(([semesterName, courses]) => (
                <div key={semesterName} className="mb-6">
                  <h4 className="text-md font-medium text-gray-700 mb-3">{semesterName}</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {courses.map((course) => (
                      <div key={course.id} className="border rounded-lg p-4 hover:shadow-md transition-shadow">
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <h5 className="font-medium text-gray-900">{course.course_code}</h5>
                            <p className="text-sm text-gray-600">{course.course_name}</p>
                          </div>
                          <span className={`px-2 py-1 text-xs rounded-full ${
                            course.course_type === 'Theory' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'
                          }`}>
                            {course.course_type}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-gray-500">{course.credits} credits</span>
                          <div className="flex gap-2">
                            <button
                              onClick={() => {/* TODO: Implement edit curriculum */}}
                              className="text-blue-600 hover:text-blue-900"
                            >
                              <Edit2 size={14} />
                            </button>
                            <button
                              onClick={() => {/* TODO: Implement delete curriculum */}}
                              className="text-red-600 hover:text-red-900"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Batches Tab */}
      {activeTab === 'batches' && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Batch Management</h2>
          
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Program</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Academic Year</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Current Semester</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {batches.map((batch) => (
                  <tr key={batch.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {batch.name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {batch.program?.name || 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {batch.academic_year}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <select
                        value={batch.current_semester}
                        onChange={(e) => handleUpdateBatchSemester(batch.id, parseInt(e.target.value))}
                        className="input input-sm"
                      >
                        {[1, 2, 3, 4, 5, 6, 7, 8].map(sem => (
                          <option key={sem} value={sem}>Semester {sem}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button
                        onClick={() => {/* TODO: View current courses */}}
                        className="text-blue-600 hover:text-blue-900"
                      >
                        View Courses
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Program Form Modal */}
      {showProgramForm && (
        <ProgramForm
          onClose={() => setShowProgramForm(false)}
          onSubmit={handleCreateProgram}
        />
      )}

      {/* Course Form Modal */}
      {showCourseForm && (
        <CourseForm
          onClose={() => setShowCourseForm(false)}
          onSubmit={handleCreateCourse}
        />
      )}
    </div>
  )
}

// ── Form Components ───────────────────────────────────────────────────────────

interface ProgramFormProps {
  onClose: () => void
  onSubmit: (data: Omit<Program, 'id'>) => void
}

function ProgramForm({ onClose, onSubmit }: ProgramFormProps) {
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    department_id: 1 // TODO: Get from departments API
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit(formData)
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Add Program</h3>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Code</label>
            <input
              type="text"
              value={formData.code}
              onChange={(e) => setFormData({ ...formData, code: e.target.value })}
              className="input"
              required
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700">Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="input"
              required
            />
          </div>
          
          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="btn btn-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
            >
              Create Program
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

interface CourseFormProps {
  onClose: () => void
  onSubmit: (data: Omit<Course, 'id'>) => void
}

function CourseForm({ onClose, onSubmit }: CourseFormProps) {
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    course_type: 'Theory' as 'Theory' | 'Lab',
    credits: 4,
    department_id: 1 // TODO: Get from departments API
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit(formData)
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Add Course</h3>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Code</label>
            <input
              type="text"
              value={formData.code}
              onChange={(e) => setFormData({ ...formData, code: e.target.value })}
              className="input"
              required
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700">Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="input"
              required
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700">Type</label>
            <select
              value={formData.course_type}
              onChange={(e) => setFormData({ ...formData, course_type: e.target.value as 'Theory' | 'Lab' })}
              className="input"
            >
              <option value="Theory">Theory</option>
              <option value="Lab">Lab</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700">Credits</label>
            <input
              type="number"
              value={formData.credits}
              onChange={(e) => setFormData({ ...formData, credits: parseInt(e.target.value) })}
              className="input"
              min="1"
              max="10"
              required
            />
          </div>
          
          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="btn btn-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
            >
              Create Course
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
