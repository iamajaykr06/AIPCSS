"""
Production-grade Timetable Scheduling Engine
Backtracking CSP solver with MRV, LCV, and Forward Checking
"""

from dataclasses import dataclass, field
from typing import List, Dict, Set, Optional, Tuple, Any, Callable
from enum import Enum
import logging
import random
import time
from collections import defaultdict


class CourseType(Enum):
    THEORY = "Theory"
    LAB = "Lab"


@dataclass(frozen=True)
class Timeslot:
    """Immutable timeslot representation"""
    day: str
    start_time: str
    end_time: str
    slot_id: str = field(compare=False)
    
    def __hash__(self):
        return hash((self.day, self.start_time, self.end_time))
    
    def __repr__(self) -> str:
        return f"{self.day} {self.start_time}-{self.end_time}"


@dataclass
class Faculty:
    """Faculty/Teacher model"""
    id: int
    name: str
    email: str
    qualified_course_ids: Set[int] = field(default_factory=set)
    availability: Dict[str, Set[str]] = field(default_factory=dict)  # day -> set of slot_ids
    max_hours_per_day: int = 6
    max_hours_per_week: int = 30
    
    def is_available(self, timeslot: Timeslot) -> bool:
        """Check if faculty is available for given timeslot"""
        # 1. Check Global Cross-Dept Busy Slots (from TimetableEntry)
        busy_slots = getattr(self, 'global_busy_slots', None)
        if busy_slots:
            day_busy = busy_slots.get(timeslot.day)
            # Match the label used in TimetableEntry (HH:MM-HH:MM)
            label = f"{timeslot.start_time}-{timeslot.end_time}"
            if day_busy and label in day_busy:
                return False
                
        # 2. Check local availability settings
        if not self.availability:
            return True
        day_slots = self.availability.get(timeslot.day, set())
        return timeslot.slot_id in day_slots or not day_slots
    
    def can_teach(self, course_id: int) -> bool:
        """Check if faculty is qualified to teach course"""
        return course_id in self.qualified_course_ids


@dataclass
class Room:
    """Room/Classroom model"""
    id: int
    name: str
    capacity: int
    room_type: str = "Classroom"
    department_id: Optional[int] = None
    program_id: Optional[int] = None
    
    def can_accommodate(self, section_size: int) -> bool:
        """Check if room can accommodate section"""
        return self.capacity >= section_size
    
    def is_suitable_for(self, course_type: str) -> bool:
        """Check if room is suitable for course type"""
        course_type_lower = course_type.lower() if course_type else ""
        room_type_lower = self.room_type.lower() if self.room_type else ""
        
        if course_type_lower == "lab":
            return "lab" in room_type_lower
        
        if course_type_lower in ["moot court", "moot"]:
            return "moot" in room_type_lower or "court" in room_type_lower
        
        return True
    
    def can_be_used_by_program(self, program_id: Optional[int], department_id: Optional[int]) -> bool:
        """
        Check if this room can be used by a given program.
        
        Rules:
        - If room has no program_id restriction, it's available to all
        - If room has program_id:
          * If program_id matches, room is available
          * If department_id matches room's department, allow same-dept sharing
          * Otherwise, room is not available
        """
        # If room has no program restriction, any program can use it
        if self.program_id is None:
            return True
        
        # If a specific program is requesting and it matches the room's program
        if program_id is not None and self.program_id == program_id:
            return True
        
        # Allow same-department sharing if department matches
        if self.department_id is not None and department_id is not None:
            if self.department_id == department_id:
                return True
        
        # If no specific program match and no department sharing, deny access
        return False


@dataclass
class Course:
    """Course model"""
    id: int
    name: str
    code: str
    course_type: str = "Theory"
    hours_per_week: int = 3
    program_code: Optional[str] = None
    program_id: Optional[int] = None
    department_id: Optional[int] = None
    qualified_faculty_ids: Set[int] = field(default_factory=set)

    def is_lab(self) -> bool:
        """Return True when this course must be scheduled as a lab block."""
        return (self.course_type or "").strip().lower() == "lab"
    
    def get_hours_needed(self) -> int:
        """Get hours required for a single scheduled occurrence."""
        if self.is_lab():
            # Labs are scheduled once per week as a single practical block.
            return max(1, self.hours_per_week)
        return self.hours_per_week


@dataclass
class Section:
    """Section/Class model"""
    id: int
    name: str
    student_count: int
    batch_id: int
    program_code: Optional[str] = None
    program_id: Optional[int] = None
    department_id: Optional[int] = None
    current_semester: Optional[int] = None
    batch_code: Optional[str] = None
    course_ids: List[int] = field(default_factory=list)  # Courses to schedule
    
    def get_full_name(self) -> str:
        """Get full section identifier"""
        base_name = f"{self.program_code or 'UNK'}-{self.name}"
        qualifiers = []
        if self.current_semester is not None:
            qualifiers.append(f"Sem {self.current_semester}")
        elif self.batch_code:
            qualifiers.append(self.batch_code)
        if qualifiers:
            return f"{base_name} ({', '.join(qualifiers)})"
        return base_name


@dataclass
class ScheduleEntry:
    """Single schedule assignment"""
    section_id: int
    course_id: int
    faculty_id: int
    room_id: int
    timeslot: Timeslot
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "section_id": self.section_id,
            "course_id": self.course_id,
            "faculty_id": self.faculty_id,
            "room_id": self.room_id,
            "timeslot": str(self.timeslot),
            "day": self.timeslot.day,
            "start_time": self.timeslot.start_time,
            "end_time": self.timeslot.end_time
        }


@dataclass
class AssignmentVariable:
    """Represents a class that needs to be scheduled"""
    section_id: int
    course_id: int
    hours_needed: int
    assigned: bool = False
    
    def __hash__(self):
        return hash((self.section_id, self.course_id, self.hours_needed))


@dataclass
class DomainValue:
    """A possible assignment: (faculty, room, timeslot)"""
    faculty_id: int
    room_id: int
    timeslot: Timeslot
    
    def __hash__(self):
        return hash((self.faculty_id, self.room_id, self.timeslot))


@dataclass
class ScheduleResult:
    """Result of scheduling attempt"""
    success: bool
    schedule: List[ScheduleEntry] = field(default_factory=list)
    error_message: Optional[str] = None
    conflicts: Dict[str, int] = field(default_factory=dict)
    stats: Dict[str, Any] = field(default_factory=dict)
    
    def to_dict(self) -> Dict:
        return {
            "status": "success" if self.success else "failure",
            "schedule": [e.to_dict() for e in self.schedule] if self.success else [],
            "error": self.error_message,
            "conflicts": self.conflicts,
            "stats": self.stats
        }


@dataclass
class SchedulingProblem:
    """Complete scheduling problem definition"""
    sections: List[Section]
    courses: List[Course]
    faculty: List[Faculty]
    rooms: List[Room]
    timeslots: List[Timeslot]
    
    # Explicit Workload Allocation: (section_id, course_id) -> teacher_id
    workload_map: Dict[Tuple[int, int], int] = field(default_factory=dict)

    # Lookup maps for O(1) access
    section_map: Dict[int, Section] = field(init=False)
    course_map: Dict[int, Course] = field(init=False)
    faculty_map: Dict[int, Faculty] = field(init=False)
    room_map: Dict[int, Room] = field(init=False)
    
    def __post_init__(self):
        self.section_map = {s.id: s for s in self.sections}
        self.course_map = {c.id: c for c in self.courses}
        self.faculty_map = {f.id: f for f in self.faculty}
        self.room_map = {r.id: r for r in self.rooms}

    def get_section_courses(self) -> List[Tuple[int, int, int]]:
        """
        Get all (section_id, course_id, hours_needed) combinations to schedule.
        Each course is scheduled once (as a single unit), with hours_needed indicating
        how many consecutive slots it requires.
        """
        instances = []
        for section in self.sections:
            for course_id in section.course_ids:
                course = self.course_map.get(course_id)
                if course:
                    if course.is_lab():
                        # Each lab course is scheduled once per week as one 2-slot block.
                        instances.append((section.id, course_id, course.get_hours_needed()))
                    else:
                        # Theory courses are scheduled as distinct 1-hour slots individually.
                        for _ in range(course.get_hours_needed()):
                            instances.append((section.id, course_id, 1))
        return instances
