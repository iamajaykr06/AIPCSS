"""
DataLoader - Loads scheduling data from SQLAlchemy models
"""

from typing import List, Optional, Dict, Set
from collections import defaultdict
from .. import db
from ..models import Teacher, Course, Section, Room, ScheduleSettings, Batch, Program
from .models import Faculty, Room as SchedulerRoom, Course as SchedulerCourse, Section as SchedulerSection, Timeslot


class DataLoader:
    """Load and prepare data for scheduling"""
    
    def __init__(self, department_id: Optional[int] = None):
        self.department_id = department_id
        self.settings = ScheduleSettings.get_or_create_default()
    
    def load_faculty(self) -> List[Faculty]:
        """Load faculty from database"""
        query = Teacher.query
        if self.department_id:
            query = query.join(Teacher.departments).filter_by(id=self.department_id)
        
        teachers = query.all()
        
        faculty_list = []
        for teacher in teachers:
            # Build availability map
            availability = {}
            if teacher.availability:
                for day, slots in teacher.availability.items():
                    availability[day] = set(slots) if isinstance(slots, list) else {slots}
            
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
        
        # Get qualified faculty for each course
        course_faculty_map = defaultdict(set)
        for teacher in Teacher.query.all():
            for course in teacher.qualified_courses:
                course_faculty_map[course.id].add(teacher.id)
        
        course_list = []
        # Get all faculty IDs for this department as fallback
        all_faculty_ids = set()
        for teacher in Teacher.query.all():
            if self.department_id:
                # Check if teacher belongs to this department
                if any(d.id == self.department_id for d in teacher.departments):
                    all_faculty_ids.add(teacher.id)
            else:
                all_faculty_ids.add(teacher.id)
        
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
        query = Section.query.join(Section.batch).join(Batch.program)
        
        if self.department_id:
            from ..models import Program
            query = query.join(Program.department).filter_by(id=self.department_id)
        
        sections = query.all()
        
        section_list = []
        for section in sections:
            # Get courses for this section's program and semester
            program_code = section.batch.program.code if section.batch.program else None
            current_semester = section.batch.current_semester
            
            # Match courses - handle different naming conventions
            # Program codes in courses may differ from program.name
            # e.g., "B.Sc Agriculture" vs "B.SC. AGRI", "B.Tech Mining" vs "B.Tech MIE"
            # Also filter by current semester
            dept_courses = Course.query.filter_by(department_id=section.batch.program.department_id).all()
            course_ids = []
            
            def normalize_code(code):
                """Normalize program code for matching"""
                if not code:
                    return set()
                # Split by common separators and filter meaningful words
                import re
                words = re.split(r'[.\s,_\-]+', code.upper())
                # Filter out short words but keep abbreviations (2+ chars)
                return {w for w in words if len(w) >= 2}
            
            def calculate_similarity(code1, code2):
                """Calculate word overlap similarity between two program codes"""
                words1 = normalize_code(code1)
                words2 = normalize_code(code2)
                
                if not words1 or not words2:
                    return 0.0
                
                # Check for exact match
                if code1 == code2:
                    return 1.0
                
                # Check word overlap
                intersection = words1 & words2
                union = words1 | words2
                
                # Check if any word from one is substring of another
                for w1 in words1:
                    for w2 in words2:
                        if w1 in w2 or w2 in w1:
                            return 0.8
                
                # Jaccard similarity
                return len(intersection) / len(union) if union else 0.0
            
            for c in dept_courses:
                # Match program
                similarity = calculate_similarity(c.program_code, program_code)
                # Ensure they actually mapped correctly (don't accidentally match None to None and give all courses)
                is_exact_match = (c.program_code and program_code and c.program_code == program_code)
                
                if similarity < 0.3 and not is_exact_match:
                    # Also fallback: only match if both are completely empty and within same department
                    if not (not c.program_code and not program_code and c.department_id == section.batch.program.department_id):
                        continue
                
                # Filter by current semester (if course has semester specified)
                course_sem = c.semester
                if course_sem is None and c.semester_name:
                    # Attempt to extract digit from string like "Semester 3", "3", "III"
                    import re
                    digits = re.findall(r'\d+', str(c.semester_name))
                    if digits:
                        course_sem = int(digits[0])
                    else:
                        # try roman numerals? I, II, III, IV, V, VI, VII, VIII
                        roman_map = {'I': 1, 'II': 2, 'III': 3, 'IV': 4, 'V': 5, 'VI': 6, 'VII': 7, 'VIII': 8}
                        sem_upper = str(c.semester_name).strip().upper().replace('SEMESTER', '').strip()
                        if sem_upper in roman_map:
                            course_sem = roman_map[sem_upper]
                            
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
                department_id=self.department_id,
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
        faculty = self.load_faculty()
        rooms = self.load_rooms()
        timeslots = self.load_timeslots()
        
        return SchedulingProblem(
            sections=sections,
            courses=courses,
            faculty=faculty,
            rooms=rooms,
            timeslots=timeslots
        )
