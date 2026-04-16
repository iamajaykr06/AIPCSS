// ── Auth ────────────────────────────────────────────────────────────────────

export type UserRole = 'admin' | 'dept_head' | 'teacher' | 'viewer';

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
    code: string;
    academic_year: string;
    program_id: number;
    program_code?: string;
    section_count?: number;
}

export interface BatchPayload {
    name: string;
    code: string;
    academic_year: string;
    program_id: number;
}

// ── Section ───────────────────────────────────────────────────────────────

export interface Section {
    id: number;
    name: string;
    student_count: number;
    batch_id: number;
    batch_name?: string;
    program_name?: string;
    department_id?: number | null;
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
    phone?: string;
    abbreviation?: string | null;
    availability: Availability | null;
    departments: TeacherDept[];
    qualified_courses: TeacherCourse[];
}

export interface TeacherPayload {
    name: string;
    email: string;
    phone?: string;
    availability?: Availability | null;
    department_ids?: number[];
}

// ── Course / Subject ──────────────────────────────────────────────────────

export type CourseType = 'Theory' | 'Lab';

export interface Course {
    id: number;
    name: string;
    code: string;
    semester: number;
    course_type: CourseType;
    department_id: number;
    program_code?: string;
    department_code?: string;
}

export interface CoursePayload {
    name: string;
    code: string;
    semester: number;
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
    department_id?: number | null;
    program_id?: number | null;
}

export interface RoomPayload {
    name: string;
    capacity: number;
    room_type: RoomType;
    department_id?: number | null;
    program_id?: number | null;
}


// ── Timetable ──────────────────────────────────────────────────────────────

export type Day = 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday';
export type TimeSlot = string;

export interface TimetableEntry {
    id: number;
    day: Day;
    timeslot: TimeSlot;
    sections: Array<{ id: number; name: string }>;
    course: { id: number; name: string; code?: string; type: CourseType };
    teacher: { id: number; name: string; abbreviation?: string };
    room: { id: number; name: string; capacity: number | null };
}

export interface GenerateSchedulePayload {
    department_id: number;
    strict_mode?: boolean;
    engine?: 'auto' | 'hybrid' | 'ortools';
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
    breaks: ScheduleBreak[];
    time_slots: ScheduleTimeSlot[];
    working_days: DayOfWeek[];
    department: string;
    total: number;
}

export interface GroupedTimetableResponse {
    data: Record<string, TimetableEntry[]>;
    department: string;
}

export interface SchedulingStats {
    total_entries: number;
    conflicts: number;
    optimization: number;
    course_type_dist: Array<{ name: string; value: number }>;
    room_dist: Array<{ name: string; value: number }>;
}

// ── Schedule Settings ─────────────────────────────────────────────────────────

export type DayOfWeek = 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday';

export interface ScheduleTimeSlot {
    start: string;
    end: string;
    label: string;
}

export interface ScheduleBreak {
    start: string;
    end: string;
    label: string;
    type?: string;
}

export interface ScheduleSettings {
    id: number;
    working_days: DayOfWeek[];
    time_slots: ScheduleTimeSlot[];
    breaks: ScheduleBreak[];
    slot_duration_minutes: number;
    start_time: string;
    end_time: string;
    max_consecutive_slots: number;
    min_break_between_classes: number;
    created_at?: string;
    updated_at?: string;
}

export interface ScheduleSettingsPayload {
    working_days?: DayOfWeek[];
    time_slots?: ScheduleTimeSlot[];
    breaks?: ScheduleBreak[];
    slot_duration_minutes?: number;
    start_time?: string;
    end_time?: string;
    max_consecutive_slots?: number;
    min_break_between_classes?: number;
}

export interface SchedulePreview {
    working_days: DayOfWeek[];
    time_slots: ScheduleTimeSlot[];
    breaks: ScheduleBreak[];
    total_slots_per_day: number;
    total_slots_per_week: number;
    slot_duration_minutes: number;
    schedule_grid: Record<string, Array<{
        time: ScheduleTimeSlot;
        is_break: boolean;
    }>>;
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
