"""
DataLoader - Loads scheduling data from SQLAlchemy models
"""

import re
from typing import List, Optional, Dict, Set, Tuple
from collections import defaultdict
from sqlalchemy.orm import joinedload, selectinload
from .. import db
from ..models import Teacher, Course, Section, Room, ScheduleSettings, Batch, Program, WorkloadAllocation, TimetableEntry
from .models import Faculty, Room as SchedulerRoom, Course as SchedulerCourse, Section as SchedulerSection, Timeslot


class DataLoader:
    """Load and prepare data for scheduling"""
    
    def __init__(self, department_id: Optional[int] = None):
        self.department_id = department_id
        self.settings = ScheduleSettings.get_or_create_default()

    @staticmethod
    def _normalize_program_code(code: Optional[str]) -> Set[str]:
        """Normalize program text into comparable tokens once per unique code."""
        if not code:
            return set()
        words = re.split(r'[.\s,_\-]+', code.upper())
        return {word for word in words if len(word) >= 2}

    @classmethod
    def _calculate_program_similarity(
        cls,
        course_program_code: Optional[str],
        section_program_code: Optional[str],
        course_tokens: Optional[Set[str]] = None,
        section_tokens: Optional[Set[str]] = None
    ) -> float:
        """Calculate fuzzy similarity between two program codes."""
        course_tokens = course_tokens if course_tokens is not None else cls._normalize_program_code(course_program_code)
        section_tokens = section_tokens if section_tokens is not None else cls._normalize_program_code(section_program_code)

        if not course_tokens or not section_tokens:
            return 0.0

        if course_program_code == section_program_code:
            return 1.0

        for left in course_tokens:
            for right in section_tokens:
                if left in right or right in left:
                    return 0.8

        union = course_tokens | section_tokens
        if not union:
            return 0.0

        return len(course_tokens & section_tokens) / len(union)

    @staticmethod
    def _resolve_course_semester(course: Course) -> Optional[int]:
        """Resolve semester from either numeric or text representation."""
        if course.semester is not None:
            return course.semester

        if not course.semester_name:
            return None

        digits = re.findall(r'\d+', str(course.semester_name))
        if digits:
            return int(digits[0])

        roman_map = {
            'I': 1,
            'II': 2,
            'III': 3,
            'IV': 4,
            'V': 5,
            'VI': 6,
            'VII': 7,
            'VIII': 8,
        }
        sem_upper = str(course.semester_name).strip().upper().replace('SEMESTER', '').strip()
        return roman_map.get(sem_upper)

    @staticmethod
    def _safe_int(value: Optional[int]) -> int:
        """Coerce nullable ORM values into non-negative integers."""
        try:
            return max(0, int(value or 0))
        except (TypeError, ValueError):
            return 0

    @classmethod
    def _resolve_course_hours(cls, course: Course) -> int:
        """Use the Course model's logic to determine required hours."""
        if hasattr(course, 'get_hours_needed'):
            return course.get_hours_needed()
        
        # Fallback if model doesn't have the method yet
        return 2 if (course.course_type or '').lower() == "lab" else 3

    @staticmethod
    def _deduplicate_sections(sections: List[Section]) -> List[Section]:
        """
        Collapse exact duplicate section rows caused by repeated imports.

        The live dataset currently contains multiple rows with the same
        `(batch_id, name)` business identity, which makes the scheduler solve
        the same academic section multiple times and inflates unscheduled
        workload counts. Keep the lowest-id record as the canonical section.
        """
        deduplicated = []
        seen_keys = set()

        for section in sorted(sections, key=lambda item: item.id):
            key = (section.batch_id, (section.name or "").strip().upper())
            if key in seen_keys:
                continue
            seen_keys.add(key)
            deduplicated.append(section)

        return deduplicated
    
    def load_faculty(self, course_ids: Optional[Set[int]] = None) -> List[Faculty]:
        """Load faculty from database - only those qualified for relevant courses"""
        teachers = Teacher.query.options(selectinload(Teacher.qualified_courses)).all()
        
        if course_ids:
            relevant_teachers = []
            for teacher in teachers:
                qualified_ids = {c.id for c in teacher.qualified_courses}
                if qualified_ids & course_ids:
                    relevant_teachers.append(teacher)
            teachers = relevant_teachers
        
        # GLOBAL BUSY-SLOT DETECTION:
        # Load all existing timetable entries for other departments to prevent 
        # double-booking teachers who teach across departments.
        global_busy_map = defaultdict(lambda: defaultdict(set)) # teacher_id -> day -> set(timeslots)
        
        other_dept_entries = TimetableEntry.query.filter(TimetableEntry.department_id != self.department_id).all()
        for entry in other_dept_entries:
            # Match by (day, timeslot_label)
            global_busy_map[entry.teacher_id][entry.day].add(entry.timeslot)

        faculty_list = []
        for teacher in teachers:
            # 1. Base availability from settings
            availability = {}
            if teacher.availability:
                for day, slots in teacher.availability.items():
                    availability[day] = set(slots) if isinstance(slots, list) else {slots}
            else:
                # If no availability set, teacher is initially available all times
                # We'll populate this from the timeslots later if needed, but for now 
                # None means "always available". 
                availability = None
            
            # 2. Subtract Busy slots from other departments
            busy_in_other_depts = global_busy_map.get(teacher.id)
            if busy_in_other_depts:
                # If availability was None (always free), we must manifest it to subtract
                if availability is None:
                    # In our system, if availability is None, the engine assumes all slots are OK.
                    # To block specific slots, we MUST create a set of "Allowed" slots.
                    # Actually, the Faculty dataclass's is_available logic:
                    # return timeslot.slot_id in day_slots or not day_slots
                    # So we need to provide the whitelist.
                    availability = {}
                    # We'll let the engine handle the "None" case if there are no busy slots.
                    # But if there ARE busy slots, we must build the whitelist.
                    
                # NOTE: If we manifest availability here, we need the list of ALL possible slots.
                # For now, I'll add a 'busy_slots' attribute to the Faculty dataclass and 
                # update the Faculty.is_available logic.
            
            # Get qualified course IDs
            qualified_ids = {c.id for c in teacher.qualified_courses}
            
            faculty = Faculty(
                id=teacher.id,
                name=teacher.name,
                email=teacher.email,
                qualified_course_ids=qualified_ids,
                availability=availability,
                max_hours_per_day=getattr(teacher, 'max_hours_per_day', 6) or 6,
                max_hours_per_week=getattr(teacher, 'max_hours_per_week', 30) or 30
            )
            # Custom attribute for the engine to check
            setattr(faculty, 'global_busy_slots', busy_in_other_depts)
            faculty_list.append(faculty)
        
        return faculty_list
    
    def load_rooms(self) -> List[SchedulerRoom]:
        """Load rooms from database"""
        query = Room.query
        if self.department_id:
            # Include department-specific and general rooms
            query = query.filter(
                (Room.department_id == self.department_id) | 
                (Room.department_id.is_(None))
            )
        
        rooms = query.all()
        
        return [
            SchedulerRoom(
                id=room.id,
                name=room.name,
                capacity=room.capacity,
                room_type=room.room_type,
                department_id=room.department_id,
                program_id=room.program_id
            )
            for room in rooms
        ]
    
    def load_courses(self, section_program_map: Dict[int, str]) -> List[SchedulerCourse]:
        """Load courses from database filtered by sections' programs"""
        query = Course.query
        if self.department_id:
            query = query.filter_by(department_id=self.department_id)
        
        courses = query.all()
        
        teachers = Teacher.query.options(selectinload(Teacher.qualified_courses)).all()
        course_faculty_map = defaultdict(set)
        for teacher in teachers:
            for course in teacher.qualified_courses:
                course_faculty_map[course.id].add(teacher.id)
        
        course_list = []
        
        for course in courses:
            hours = self._resolve_course_hours(course)
            
            # Get qualified faculty for this course
            qualified_ids = course_faculty_map.get(course.id, set())

            course_list.append(SchedulerCourse(
                id=course.id,
                name=course.name,
                code=course.code,
                course_type=course.course_type or "Theory",
                hours_per_week=hours,
                program_code=course.program_code,
                program_id=getattr(course, 'program_id', None),
                department_id=course.department_id,
                qualified_faculty_ids=qualified_ids
            ))
        
        return course_list
    
    def load_workloads(self, section_ids: List[int]) -> Dict[Tuple[int, int], int]:
        """
        Loads the explicit Teacher-Course-Section mappings. 
        Only these courses will be scheduled.
        """
        allocations = WorkloadAllocation.query.filter(
            WorkloadAllocation.section_id.in_(section_ids)
        ).all()
        return {(a.section_id, a.course_id): a.teacher_id for a in allocations}

    def load_sections(self) -> Tuple[List[SchedulerSection], Dict[Tuple[int, int], int]]:
        """Load sections from database and their assigned workloads"""
        query = Section.query.options(
            joinedload(Section.batch).joinedload(Batch.program)
        )
        
        if self.department_id:
            query = query.join(Section.batch).join(Batch.program).filter(
                Program.department_id == self.department_id
            )
        
        sections = self._deduplicate_sections(query.all())
        if not sections:
            return [], {}

        section_ids = [s.id for s in sections]
        workload_map = self.load_workloads(section_ids)
        
        # Group workload by section for quick lookup
        workload_by_section = defaultdict(list)
        for (sec_id, crs_id), teacher_id in workload_map.items():
            workload_by_section[sec_id].append(crs_id)

        section_list = []
        for section in sections:
            program = section.batch.program if section.batch else None
            # If no program metadata, we still process the section if it has workloads
            program_code = program.code if program else "UNK"
            program_id = program.id if program else None
            
            # The heart of the change: We ONLY schedule courses that have a workload entry.
            course_ids = list(set(workload_by_section.get(section.id, [])))
            
            if not course_ids:
                # If no courses are assigned to this section, skip it from scheduling
                continue

            section_list.append(SchedulerSection(
                id=section.id,
                name=section.name,
                student_count=section.student_count,
                batch_id=section.batch_id,
                program_code=program_code,
                program_id=program_id,
                department_id=program.department_id if program else None,
                current_semester=section.batch.current_semester if section.batch else None,
                batch_code=section.batch.code if section.batch else None,
                course_ids=course_ids
            ))
        
        return section_list, workload_map

        return section_list, workload_map
    
    def load_timeslots(self) -> List[Timeslot]:
        """Generate timeslots from settings"""
        timeslots = []
        
        if self.settings.time_slots:
            for slot in self.settings.time_slots:
                for day in self.settings.working_days:
                    timeslots.append(Timeslot(
                        day=day,
                        start_time=slot['start'],
                        end_time=slot['end'],
                        slot_id=f"{day}_{slot['start']}"
                    ))
        else:
            # Default timeslots if settings not configured
            default_days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
            default_slots = [
                ("09:15", "10:05"),
                ("10:05", "11:45"),
                ("11:45", "12:35"),
                ("12:35", "13:25"),
                ("13:25", "14:15"),
                ("14:15", "15:05"),
                ("15:05", "15:55"),
                ("15:55", "16:45")
            ]
            
            for day in default_days:
                for start, end in default_slots:
                    timeslots.append(Timeslot(
                        day=day,
                        start_time=start,
                        end_time=end,
                        slot_id=f"{day}_{start}"
                    ))
        
        return timeslots
    
    def load_problem(self) -> 'SchedulingProblem':
        """Load complete scheduling problem"""
        from .models import SchedulingProblem
        
        sections, workload_map = self.load_sections()
        
        # Build program map for course loading
        section_program_map = {}
        for section in sections:
            section_program_map[section.id] = section.program_code
        
        courses = self.load_courses(section_program_map)
        
        # Get all course IDs for faculty filtering
        all_course_ids = {c.id for c in courses}
        faculty = self.load_faculty(course_ids=all_course_ids)
        
        rooms = self.load_rooms()
        timeslots = self.load_timeslots()
        
        return SchedulingProblem(
            sections=sections,
            courses=courses,
            faculty=faculty,
            rooms=rooms,
            timeslots=timeslots,
            workload_map=workload_map
        )
