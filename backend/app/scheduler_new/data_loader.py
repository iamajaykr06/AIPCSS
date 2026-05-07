"""
Copyright 2026 Zaid Alam, Ajay Kumar, Aboni Mohan Sahu, Rohit Kumar Yadav

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
"""

import re
from typing import List, Optional, Dict, Set, Tuple, TYPE_CHECKING
from collections import defaultdict
from sqlalchemy.orm import joinedload
from ..models import (
    Teacher,
    Course,
    Section,
    Room,
    ScheduleSettings,
    Batch,
    Program,
    WorkloadAllocation,
    TimetableEntry,
)
from .models import Faculty, Room as SchedulerRoom, Course as SchedulerCourse, Section as SchedulerSection, Timeslot

if TYPE_CHECKING:
    from .models import SchedulingProblem


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
        words = re.split(r"[.\s,_\-]+", code.upper())
        return {word for word in words if len(word) >= 2}

    @classmethod
    def _calculate_program_similarity(
        cls,
        course_program_code: Optional[str],
        section_program_code: Optional[str],
        course_tokens: Optional[Set[str]] = None,
        section_tokens: Optional[Set[str]] = None,
    ) -> float:
        """Calculate fuzzy similarity between two program codes."""
        course_tokens = course_tokens if course_tokens is not None else cls._normalize_program_code(course_program_code)
        section_tokens = (
            section_tokens if section_tokens is not None else cls._normalize_program_code(section_program_code)
        )

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

        sem_name = getattr(course, "semester_name", None)
        if not sem_name:
            return None

        digits = re.findall(r"\d+", str(sem_name))
        if digits:
            return int(digits[0])

        roman_map = {
            "I": 1,
            "II": 2,
            "III": 3,
            "IV": 4,
            "V": 5,
            "VI": 6,
            "VII": 7,
            "VIII": 8,
        }
        sem_upper = str(sem_name).strip().upper().replace("SEMESTER", "").strip()
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
        if hasattr(course, "get_hours_needed"):
            return course.get_hours_needed()

        # Fallback if model doesn't have the method yet
        return 2 if (course.course_type or "").lower() == "lab" else 3

    def load_faculty(self, course_ids: Optional[Set[int]] = None) -> List[Faculty]:
        """Load all faculty from database"""
        teachers = Teacher.query.all()

        # GLOBAL BUSY-SLOT DETECTION:
        # Load all existing timetable entries for other departments to prevent
        # double-booking teachers who teach across departments.
        global_busy_map = defaultdict(lambda: defaultdict(set))  # teacher_id -> day -> set(timeslots)

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
                availability = None

            # 2. Subtract Busy slots from other departments
            busy_in_other_depts = global_busy_map.get(teacher.id)
            if busy_in_other_depts:
                # If availability was None (always free), we must manifest it to subtract busy slots
                if availability is None:
                    # Build availability from ALL configured timeslots
                    availability = {}
                    if self.settings.time_slots and self.settings.working_days:
                        for day in self.settings.working_days:
                            slot_ids = set()
                            for slot in self.settings.time_slots:
                                slot_ids.add(f"{day}_{slot['start']}")
                            availability[day] = slot_ids

                # Subtract busy slots from availability
                for day, busy_labels in busy_in_other_depts.items():
                    if day not in availability:
                        availability[day] = set()
                    # Convert label format "09:15-10:05" → slot_id "Monday_09:15"
                    for label in busy_labels:
                        start = label.split("-")[0] if "-" in label else label
                        slot_id = f"{day}_{start}"
                        availability[day].discard(slot_id)

            faculty = Faculty(
                id=teacher.id,
                name=teacher.name,
                email=teacher.email,
                availability=availability,
                max_hours_per_day=getattr(teacher, "max_hours_per_day", 6) or 6,
                max_hours_per_week=getattr(teacher, "max_hours_per_week", 30) or 30,
            )
            # Custom attribute for the engine to check
            setattr(faculty, "global_busy_slots", busy_in_other_depts)
            faculty_list.append(faculty)

        return faculty_list

    def load_rooms(self) -> List[SchedulerRoom]:
        """Load rooms from database, with cross-department busy-slot awareness."""
        query = Room.query
        if self.department_id:
            # Include department-specific and general rooms
            query = query.filter((Room.department_id == self.department_id) | (Room.department_id.is_(None)))

        rooms = query.all()

        # ── GLOBAL ROOM BUSY-SLOT DETECTION ──────────────────────────────
        # Load all existing timetable entries from OTHER departments to prevent
        # cross-department double-booking of shared rooms.  Mirrors the same
        # logic already used for teacher busy-slot detection in load_faculty().
        global_room_busy = defaultdict(lambda: defaultdict(set))  # room_id -> day -> set(timeslot_labels)

        if self.department_id:
            other_dept_entries = TimetableEntry.query.filter(TimetableEntry.department_id != self.department_id).all()
            for entry in other_dept_entries:
                global_room_busy[entry.room_id][entry.day].add(entry.timeslot)

        scheduler_rooms = []
        for room in rooms:
            sr = SchedulerRoom(
                id=room.id,
                name=room.name,
                capacity=room.capacity,
                room_type=room.room_type,
                department_id=room.department_id,
                program_id=room.program_id,
            )
            # Attach cross-dept busy slots so engines can pre-populate
            busy = global_room_busy.get(room.id)
            if busy:
                setattr(sr, "global_busy_slots", busy)
            scheduler_rooms.append(sr)

        return scheduler_rooms

    def load_courses(self, section_program_map: Dict[int, str]) -> List[SchedulerCourse]:
        """Load courses from database filtered by sections' programs"""
        query = Course.query
        if self.department_id:
            query = query.filter_by(department_id=self.department_id)

        courses = query.all()

        course_list = []

        for course in courses:
            hours = self._resolve_course_hours(course)

            course_list.append(
                SchedulerCourse(
                    id=course.id,
                    name=course.name,
                    code=course.code,
                    course_type=course.course_type or "Theory",
                    hours_per_week=hours,
                    program_code=course.program_code,
                    program_id=getattr(course, "program_id", None),
                    department_id=course.department_id,
                    semester=self._resolve_course_semester(course),
                )
            )

        return course_list

    def load_workloads(self, section_ids: List[int]) -> Dict[Tuple[int, int], int]:
        """
        Loads the explicit Teacher-Course-Section mappings.
        Only these courses will be scheduled.
        """
        allocations = WorkloadAllocation.query.filter(WorkloadAllocation.section_id.in_(section_ids)).all()
        return {(a.section_id, a.course_id): a.teacher_id for a in allocations}

    def load_sections(
        self, course_map: Dict[int, SchedulerCourse]
    ) -> Tuple[List[SchedulerSection], Dict[Tuple[int, int], int]]:
        """Load sections from database and their assigned workloads"""
        query = Section.query.options(joinedload(Section.batch).joinedload(Batch.program))

        if self.department_id:
            query = query.join(Section.batch).join(Batch.program).filter(Program.department_id == self.department_id)

        sections = self._deduplicate_sections(query.all())
        if not sections:
            return [], {}

        section_ids = [s.id for s in sections]
        workload_map = self.load_workloads(section_ids)

        section_list = []

        for section in sections:
            batch = section.batch
            if not batch:
                continue

            # Use current_semester from Batch model directly (manual control)
            active_sem = batch.current_semester or 1

            # ── 2. FILTER WORKLOAD TO ACTIVE CURRICULUM ──────────────────
            valid_course_ids = []
            for (sec_id, crs_id), _ in workload_map.items():
                if sec_id != section.id:
                    continue
                course = course_map.get(crs_id)
                if course and self._resolve_course_semester(course) == active_sem:
                    valid_course_ids.append(crs_id)

            course_ids = list(set(valid_course_ids))

            if not course_ids:
                # If no courses are assigned for the current semester, skip it
                continue

            program = batch.program if batch else None
            program_code = program.code if program else "UNK"
            program_id = program.id if program else None

            section_list.append(
                SchedulerSection(
                    id=section.id,
                    name=section.name,
                    student_count=section.student_count,
                    batch_id=section.batch_id,
                    program_code=program_code,
                    program_id=program_id,
                    department_id=program.department_id if program else None,
                    current_semester=active_sem,  # Use the calculated semester
                    batch_code=batch.code if batch else None,
                    course_ids=course_ids,
                )
            )

        return section_list, workload_map

    def load_timeslots(self) -> List[Timeslot]:
        """Generate timeslots from settings, excluding break times."""
        timeslots = []

        # Parse breaks to check for overlaps
        breaks_list = []
        for b in self.settings.breaks or []:
            try:
                b_start = b.get("start")
                b_end = b.get("end")
                if b_start and b_end:
                    breaks_list.append((b_start, b_end))
            except (AttributeError, TypeError):  # nosec B112 - Malformed break data should be skipped
                continue

        def is_break(start, end):
            for b_start, b_end in breaks_list:
                # Check for any overlap
                if (
                    (start >= b_start and start < b_end)
                    or (end > b_start and end <= b_end)
                    or (start <= b_start and end >= b_end)
                ):
                    return True
            return False

        if self.settings.time_slots:
            for slot in self.settings.time_slots:
                s_start = slot["start"]
                s_end = slot["end"]

                # Only include slots that are NOT breaks
                if is_break(s_start, s_end):
                    continue

                for day in self.settings.working_days:
                    timeslots.append(Timeslot(day=day, start_time=s_start, end_time=s_end, slot_id=f"{day}_{s_start}"))
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
                ("15:55", "16:45"),
            ]

            for day in default_days:
                for start, end in default_slots:
                    if is_break(start, end):
                        continue
                    timeslots.append(Timeslot(day=day, start_time=start, end_time=end, slot_id=f"{day}_{start}"))

        return timeslots

    def _deduplicate_sections(self, db_sections: List[Section]) -> List[Section]:
        """Ensure each section ID is unique in the list."""
        seen = set()
        deduped = []
        for s in db_sections:
            if s.id not in seen:
                deduped.append(s)
                seen.add(s.id)
        return deduped

    def load_problem(self) -> "SchedulingProblem":
        """Load complete scheduling problem"""
        from .models import SchedulingProblem  # Keep local import for runtime to avoid circularity

        # ── 1. PRE-LOAD ALL COURSES ───────────────────────────────────
        # We need course metadata early to filter sections by semester.
        all_courses = self.load_courses({})  # Load all department courses
        course_map = {c.id: c for c in all_courses}

        # ── 2. LOAD SECTIONS WITH SEMESTER FILTERING ──────────────────
        sections, workload_map = self.load_sections(course_map)

        # ── 3. FILTER COURSES TO ACTIVE ONES ─────────────────────────
        # Only keep courses that are actually used in the filtered sections.
        active_course_ids = set()
        for s in sections:
            active_course_ids.update(s.course_ids)

        active_courses = [c for c in all_courses if c.id in active_course_ids]

        # Get all active course IDs for faculty filtering
        faculty = self.load_faculty(course_ids=active_course_ids)

        rooms = self.load_rooms()
        timeslots = self.load_timeslots()

        # ── 4. CURRICULUM GAP DETECTION ──────────────────────────────
        unassigned_curriculum = []
        active_section_semesters = set()
        for s in sections:
            if s.program_id and s.current_semester:
                active_section_semesters.add((s.program_id, s.current_semester))

        for c in all_courses:
            if c.id not in active_course_ids:
                if (c.program_id, self._resolve_course_semester(c)) in active_section_semesters:
                    unassigned_curriculum.append(
                        {
                            "id": c.id,
                            "code": c.code,
                            "name": c.name,
                            "type": c.course_type,
                            "reason": "Missing from Workload Page",
                        }
                    )

        return SchedulingProblem(
            sections=sections,
            courses=active_courses,
            faculty=faculty,
            rooms=rooms,
            timeslots=timeslots,
            workload_map=workload_map,
            unassigned_curriculum=unassigned_curriculum,
        )
