// ── Auth ────────────────────────────────────────────────────────────────────

export type UserRole = 'admin' | 'dept_head' | 'viewer';

export interface User {
    id: number;
    username: string;
    email: string;
    role: UserRole;
    is_active: boolean;
}

export interface AuthTokens {
    access_token: string;
    refresh_token: string;
    user: User;
}

export interface LoginPayload {
    email: string;
    password: string;
}

export interface RegisterPayload {
    username: string;
    email: string;
    password: string;
    role?: UserRole;
}

// ── Pagination ───────────────────────────────────────────────────────────────

export interface PaginationMeta {
    page: number;
    per_page: number;
    total: number;
    pages: number;
}

export interface PaginatedResponse<T> {
    data: T[];
    meta: PaginationMeta;
}

// ── Department ───────────────────────────────────────────────────────────────

export interface Department {
    id: number;
    name: string;
    code: string;
}

export interface DepartmentPayload {
    name: string;
    code: string;
}

// ── Program ───────────────────────────────────────────────────────────────

export interface Program {
    id: number;
    name: string;
    code: string;
    department_id: number;
}

export interface ProgramPayload {
    name: string;
    code: string;
    department_id: number;
}

// ── Batch ─────────────────────────────────────────────────────────────────

export interface Batch {
    id: number;
    name: string;
    academic_year: string;
    program_id: number;
}

export interface BatchPayload {
    name: string;
    academic_year: string;
    program_id: number;
}

// ── Section ───────────────────────────────────────────────────────────────

export interface Section {
    id: number;
    name: string;
    student_count: number;
    batch_id: number;
}

export interface SectionPayload {
    name: string;
    student_count: number;
    batch_id: number;
}

// ── Teacher ────────────────────────────────────────────────────────────────

export interface TeacherDept {
    id: number;
    name: string;
}

export interface TeacherCourse {
    id: number;
    name: string;
    code: string;
}

export interface Availability {
    [day: string]: string[];
}

export interface Teacher {
    id: number;
    name: string;
    email: string;
    availability: Availability | null;
    departments: TeacherDept[];
    qualified_courses: TeacherCourse[];
}

export interface TeacherPayload {
    name: string;
    email: string;
    availability?: Availability | null;
    department_ids?: number[];
}

// ── Course / Subject ──────────────────────────────────────────────────────

export type CourseType = 'Theory' | 'Lab';

export interface Course {
    id: number;
    name: string;
    code: string;
    credits: number;
    course_type: CourseType;
    department_id: number;
}

export interface CoursePayload {
    name: string;
    code: string;
    credits: number;
    course_type: CourseType;
    department_id: number;
}

// ── Room ──────────────────────────────────────────────────────────────────

export type RoomType = 'Classroom' | 'Lecture Hall' | 'Lab' | 'Seminar Room' | 'Auditorium';

export interface Room {
    id: number;
    name: string;
    capacity: number;
    room_type: RoomType;
}

export interface RoomPayload {
    name: string;
    capacity: number;
    room_type: RoomType;
}

// ── Workload ───────────────────────────────────────────────────────────────

export interface Workload {
    id: number;
    teacher: { id: number; name: string } | null;
    course: { id: number; name: string; code: string } | null;
    section: { id: number; name: string } | null;
    hours_per_week: number;
    session_duration: number;
    teacher_id?: number;
    course_id?: number;
    section_id?: number;
}

export interface WorkloadPayload {
    teacher_id: number;
    course_id: number;
    section_id: number;
    hours_per_week: number;
    session_duration: number;
}

// ── Timetable ──────────────────────────────────────────────────────────────

export type Day = 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday';
export type TimeSlot = '09:00-10:00' | '10:00-11:00' | '11:00-12:00' | '01:00-02:00' | '02:00-03:00';

export interface TimetableEntry {
    id: number;
    day: Day;
    timeslot: TimeSlot;
    sections: Array<{ id: number; name: string }>;
    course: { id: number; name: string; type: CourseType };
    teacher: { id: number; name: string };
    room: { id: number; name: string; capacity: number | null };
}

export interface GenerateSchedulePayload {
    department_id: number;
}

export interface GenerateScheduleResult {
    status: 'success' | 'partial_success' | 'error';
    entries_created: number;
    incomplete_workloads: Array<{
        course: string;
        section: string;
        teacher: string;
        allocated: number;
        required: number;
        reason: string;
    }>;
    errors: string[];
    message: string;
}

export interface TimetableViewResponse {
    data: TimetableEntry[];
    department: string;
    total: number;
}

export interface GroupedTimetableResponse {
    data: Record<string, TimetableEntry[]>;
    department: string;
}

// ── UI ─────────────────────────────────────────────────────────────────────

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
    id: string;
    type: ToastType;
    title: string;
    message?: string;
}

export interface ModalState {
    isOpen: boolean;
    mode: 'create' | 'edit' | 'delete' | 'view';
    data?: unknown;
}

// ── API Error ─────────────────────────────────────────────────────────────

export interface ApiError {
    error: string;
    details?: string[];
}
