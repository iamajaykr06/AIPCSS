"""
ConstraintEngine - Validates all scheduling constraints with O(1) lookups
"""

from typing import List, Set, Dict, Tuple, Optional
from collections import defaultdict
import logging

from .models import ScheduleEntry, Faculty, Room, Course, Section, Timeslot, SchedulingProblem


class ConstraintEngine:
    """
    Manages all hard constraints for timetable scheduling.
    Uses hash maps for O(1) conflict detection.
    """
    
    def __init__(self, problem: SchedulingProblem, debug: bool = False):
        self.problem = problem
        self.debug = debug
        self.logger = logging.getLogger(__name__)
        
        # Conflict tracking maps for O(1) lookups
        # Structure: resource_id -> (day, start_time) -> set of (section_id, course_id)
        self.faculty_schedule: Dict[int, Dict[Tuple[str, str], Set[Tuple[int, int]]]] = defaultdict(lambda: defaultdict(set))
        self.room_schedule: Dict[int, Dict[Tuple[str, str], Set[Tuple[int, int]]]] = defaultdict(lambda: defaultdict(set))
        self.section_schedule: Dict[int, Dict[Tuple[str, str], Set[Tuple[int, int]]]] = defaultdict(lambda: defaultdict(set))
        
        # Track usage counts for constraint analysis
        self.faculty_hours: Dict[int, int] = defaultdict(int)
        self.faculty_daily_hours: Dict[int, Dict[str, int]] = defaultdict(lambda: defaultdict(int))
        
        # Teacher-Course-Section consistency: (section_id, course_id) -> faculty_id
        # Ensures the same teacher teaches all instances of a course for a section
        self.section_course_faculty: Dict[Tuple[int, int], int] = {}
        
    def is_consistent(self, entry: ScheduleEntry) -> Tuple[bool, Optional[str]]:
        """
        Check if a proposed entry is consistent with all hard constraints.
        Returns (is_valid, error_message)
        """
        section = self.problem.section_map.get(entry.section_id)
        course = self.problem.course_map.get(entry.course_id)
        faculty = self.problem.faculty_map.get(entry.faculty_id)
        room = self.problem.room_map.get(entry.room_id)
        
        if not all([section, course, faculty, room]):
            return False, "Invalid reference IDs"
        
        slot_key = (entry.timeslot.day, entry.timeslot.start_time)
        
        # Constraint 1: Faculty availability
        if not faculty.is_available(entry.timeslot):
            return False, f"Faculty {faculty.name} not available at {entry.timeslot}"
        
        # Constraint 2: Faculty qualification (strict requirement)
        if not course.qualified_faculty_ids:
            return False, f"No qualified faculty configured for course {course.code}"
        if faculty.id not in course.qualified_faculty_ids:
            return False, f"Faculty {faculty.name} not qualified for course {course.code}"
        
        # Constraint 3: Room capacity
        if not room.can_accommodate(section.student_count):
            return False, f"Room {room.name} capacity ({room.capacity}) < section size ({section.student_count})"
        
        # Constraint 4: Room type suitability (strict - no fallback for labs)
        if not room.is_suitable_for(course.course_type):
            return False, f"Room {room.name} not suitable for {course.course_type}"
        
        # Constraint 5: No faculty overlap (same faculty, same time)
        if self.faculty_schedule[entry.faculty_id][slot_key]:
            return False, f"Faculty {faculty.name} already scheduled at {entry.timeslot}"
        
        # Constraint 6: No room overlap (same room, same time)
        if self.room_schedule[entry.room_id][slot_key]:
            return False, f"Room {room.name} already booked at {entry.timeslot}"
        
        # Constraint 7: No section overlap (same section, same time)
        if self.section_schedule[entry.section_id][slot_key]:
            return False, f"Section {section.name} already has class at {entry.timeslot}"
        
        # Constraint 8: Faculty max hours per day
        daily_hours = self.faculty_daily_hours[entry.faculty_id][entry.timeslot.day]
        if daily_hours >= faculty.max_hours_per_day:
            return False, f"Faculty {faculty.name} reached max hours for {entry.timeslot.day}"
        
        # Constraint 9: Faculty max hours per week
        if self.faculty_hours[entry.faculty_id] >= faculty.max_hours_per_week:
            return False, f"Faculty {faculty.name} reached max weekly hours"
        
        # Constraint 10: Teacher-Course-Section consistency
        # If a faculty is already assigned to this course for this section,
        # only that same faculty can teach it
        sc_key = (entry.section_id, entry.course_id)
        if sc_key in self.section_course_faculty:
            assigned_faculty_id = self.section_course_faculty[sc_key]
            if entry.faculty_id != assigned_faculty_id:
                assigned_faculty = self.problem.faculty_map.get(assigned_faculty_id)
                assigned_name = assigned_faculty.name if assigned_faculty else "Unknown"
                return False, f"Course {course.code} for section {section.name} must be taught by {assigned_name} (consistency constraint)"
        
        return True, None
    
    def add_entry(self, entry: ScheduleEntry) -> None:
        """Add an entry to constraint tracking (called after assignment)"""
        slot_key = (entry.timeslot.day, entry.timeslot.start_time)
        class_key = (entry.section_id, entry.course_id)
        
        self.faculty_schedule[entry.faculty_id][slot_key].add(class_key)
        self.room_schedule[entry.room_id][slot_key].add(class_key)
        self.section_schedule[entry.section_id][slot_key].add(class_key)
        
        self.faculty_hours[entry.faculty_id] += 1
        self.faculty_daily_hours[entry.faculty_id][entry.timeslot.day] += 1
        
        # Track teacher-course-section assignment for consistency
        sc_key = (entry.section_id, entry.course_id)
        self.section_course_faculty[sc_key] = entry.faculty_id
    
    def remove_entry(self, entry: ScheduleEntry) -> None:
        """Remove an entry from constraint tracking (called during backtracking)"""
        slot_key = (entry.timeslot.day, entry.timeslot.start_time)
        class_key = (entry.section_id, entry.course_id)
        
        self.faculty_schedule[entry.faculty_id][slot_key].discard(class_key)
        self.room_schedule[entry.room_id][slot_key].discard(class_key)
        self.section_schedule[entry.section_id][slot_key].discard(class_key)
        
        self.faculty_hours[entry.faculty_id] -= 1
        self.faculty_daily_hours[entry.faculty_id][entry.timeslot.day] -= 1
        
        # Check if this was the last entry for this section-course, remove consistency tracking
        sc_key = (entry.section_id, entry.course_id)
        # Count remaining entries for this section-course
        remaining_count = 0
        for slot_dict in self.faculty_schedule[entry.faculty_id].values():
            if sc_key in slot_dict:
                remaining_count += 1
        if remaining_count == 0:
            self.section_course_faculty.pop(sc_key, None)
    
    def get_valid_faculty(self, section_id: int, course_id: int, timeslot: Timeslot) -> List[int]:
        """Get list of faculty IDs who can teach this course at this time"""
        course = self.problem.course_map.get(course_id)
        if not course:
            return []
        
        # Check if a faculty is already assigned to this section-course
        sc_key = (section_id, course_id)
        assigned_faculty_id = self.section_course_faculty.get(sc_key)
        if assigned_faculty_id is not None:
            # Only return the already-assigned faculty if they're still valid
            assigned_faculty = self.problem.faculty_map.get(assigned_faculty_id)
            if assigned_faculty:
                slot_key = (timeslot.day, timeslot.start_time)
                # Check they don't have conflicts at this timeslot
                if not self.faculty_schedule[assigned_faculty_id][slot_key]:
                    # Check max hours
                    if (self.faculty_hours[assigned_faculty_id] < assigned_faculty.max_hours_per_week and
                        self.faculty_daily_hours[assigned_faculty_id][timeslot.day] < assigned_faculty.max_hours_per_day):
                        return [assigned_faculty_id]
            return []  # Assigned faculty not available, no valid faculty
        
        valid = []
        for faculty in self.problem.faculty:
            # Strict qualification: only explicitly mapped faculty may teach a course.
            if faculty.id not in course.qualified_faculty_ids:
                continue
            # Check availability
            if not faculty.is_available(timeslot):
                continue
            # Check no conflict at this timeslot
            slot_key = (timeslot.day, timeslot.start_time)
            if self.faculty_schedule[faculty.id][slot_key]:
                continue
            # Check max hours
            if self.faculty_hours[faculty.id] >= faculty.max_hours_per_week:
                continue
            if self.faculty_daily_hours[faculty.id][timeslot.day] >= faculty.max_hours_per_day:
                continue
            
            valid.append(faculty.id)
        
        return valid
    
    def get_valid_rooms(self, section_id: int, course_id: int, timeslot: Timeslot) -> List[int]:
        """Get list of room IDs suitable for this section/course at this time"""
        section = self.problem.section_map.get(section_id)
        course = self.problem.course_map.get(course_id)
        if not section or not course:
            return []
        
        slot_key = (timeslot.day, timeslot.start_time)
        valid = []
        
        for room in self.problem.rooms:
            # Check capacity
            if not room.can_accommodate(section.student_count):
                continue
            # Check room type
            if not room.is_suitable_for(course.course_type):
                continue
            # Check no conflict at this timeslot
            if self.room_schedule[room.id][slot_key]:
                continue
            
            valid.append(room.id)
        
        return valid
    
    def get_valid_timeslots(self, section_id: int, course_id: int) -> List[Timeslot]:
        """Get list of timeslots where this section has no conflict"""
        valid = []
        
        for timeslot in self.problem.timeslots:
            slot_key = (timeslot.day, timeslot.start_time)
            # Check section not already scheduled at this time
            if not self.section_schedule[section_id][slot_key]:
                valid.append(timeslot)
        
        return valid
    
    def count_violations(self) -> Dict[str, int]:
        """Count constraint violations in current state (for debugging)"""
        violations = {
            "faculty_overlap": 0,
            "room_overlap": 0,
            "section_overlap": 0,
            "faculty_overload": 0
        }
        
        # Check faculty overlaps
        for faculty_id, schedule in self.faculty_schedule.items():
            for slot_key, classes in schedule.items():
                if len(classes) > 1:
                    violations["faculty_overlap"] += len(classes) - 1
        
        # Check room overlaps
        for room_id, schedule in self.room_schedule.items():
            for slot_key, classes in schedule.items():
                if len(classes) > 1:
                    violations["room_overlap"] += len(classes) - 1
        
        # Check section overlaps
        for section_id, schedule in self.section_schedule.items():
            for slot_key, classes in schedule.items():
                if len(classes) > 1:
                    violations["section_overlap"] += len(classes) - 1
        
        # Check faculty overloads
        for faculty_id, hours in self.faculty_hours.items():
            faculty = self.problem.faculty_map.get(faculty_id)
            if faculty and hours > faculty.max_hours_per_week:
                violations["faculty_overload"] += 1
        
        return violations
