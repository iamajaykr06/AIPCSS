"""
DataLoader - Loads scheduling data from SQLAlchemy models
"""

import re
from typing import List, Optional, Dict, Set
from collections import defaultdict
from sqlalchemy.orm import joinedload, selectinload
from .. import db
from ..models import Teacher, Course, Section, Room, ScheduleSettings, Batch, Program
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
        
        faculty_list = []
        for teacher in teachers:
            # Build availability map
            availability = {}
            if teacher.availability:
                for day, slots in teacher.availability.items():
                    availability[day] = set(slots) if isinstance(slots, list) else {slots}
            else:
                # If no availability set, teacher is available all times
                availability = None  # None means "always available"
            
            # Get qualified course IDs
            qualified_ids = {c.id for c in teacher.qualified_courses}
            
            faculty_list.append(Faculty(
                id=teacher.id,
                name=teacher.name,
                email=teacher.email,
                qualified_course_ids=qualified_ids,
                availability=availability
            ))
        
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
        all_faculty_ids = set()
        for teacher in teachers:
            all_faculty_ids.add(teacher.id)
            for course in teacher.qualified_courses:
                course_faculty_map[course.id].add(teacher.id)
        
        course_list = []
        
        for course in courses:
            # Determine hours based on course type
            hours = 2 if course.course_type == "Lab" else 3
            
            # Get qualified faculty for this course
            qualified_ids = course_faculty_map.get(course.id, set())
            
            # Fallback: if no qualified faculty, allow any department faculty to teach
            if not qualified_ids and all_faculty_ids:
                qualified_ids = all_faculty_ids
            
            course_list.append(SchedulerCourse(
                id=course.id,
                name=course.name,
                code=course.code,
                course_type=course.course_type or "Theory",
                hours_per_week=hours,
                program_code=course.program_code,
                department_id=course.department_id,
                qualified_faculty_ids=qualified_ids
            ))
        
        return course_list
    
    def load_sections(self) -> List[SchedulerSection]:
        """Load sections from database"""
        query = Section.query.options(
            joinedload(Section.batch).joinedload(Batch.program)
        )
        
        if self.department_id:
            query = query.join(Section.batch).join(Batch.program).filter(
                Program.department_id == self.department_id
            )
        
        sections = self._deduplicate_sections(query.all())
        department_ids = {
            section.batch.program.department_id
            for section in sections
            if section.batch and section.batch.program
        }

        if not department_ids:
            return []

        course_query = Course.query
        if self.department_id:
            course_query = course_query.filter(Course.department_id == self.department_id)
        else:
            course_query = course_query.filter(Course.department_id.in_(department_ids))

        all_department_courses = course_query.all()
        courses_by_department = defaultdict(list)
        course_tokens = {}
        course_semesters = {}

        for course in all_department_courses:
            courses_by_department[course.department_id].append(course)
            course_tokens[course.id] = self._normalize_program_code(course.program_code)
            course_semesters[course.id] = self._resolve_course_semester(course)
        
        section_list = []
        for section in sections:
            program = section.batch.program if section.batch else None
            if not program:
                continue

            # Get courses for this section's program and semester
            program_code = program.code
            current_semester = section.batch.current_semester
            section_tokens = self._normalize_program_code(program_code)
            dept_courses = courses_by_department.get(program.department_id, [])
            course_ids = []
            
            for c in dept_courses:
                # Match program
                similarity = self._calculate_program_similarity(
                    c.program_code,
                    program_code,
                    course_tokens.get(c.id),
                    section_tokens
                )
                # Ensure they actually mapped correctly (don't accidentally match None to None and give all courses)
                is_exact_match = (c.program_code and program_code and c.program_code == program_code)
                
                if similarity < 0.3 and not is_exact_match:
                    # Also fallback: only match if both are completely empty and within same department
                    if not (not c.program_code and not program_code and c.department_id == program.department_id):
                        continue
                
                course_sem = course_semesters.get(c.id)
                if course_sem is not None and current_semester is not None:
                    if course_sem != current_semester:
                        continue
                
                course_ids.append(c.id)
            
            # Remove duplicates
            course_ids = list(set(course_ids))
            
            section_list.append(SchedulerSection(
                id=section.id,
                name=section.name,
                student_count=section.student_count,
                batch_id=section.batch_id,
                program_code=program_code,
                department_id=program.department_id,
                current_semester=current_semester,
                batch_code=section.batch.code,
                course_ids=course_ids
            ))
        
        return section_list
    
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
        
        sections = self.load_sections()
        
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
            timeslots=timeslots
        )
