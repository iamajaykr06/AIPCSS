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
        if not self.availability:
            return True
        day_slots = self.availability.get(timeslot.day, set())
        return timeslot.slot_id in day_slots or not day_slots
    
    def can_teach(self, course_id: int) -> bool:
        """Check if faculty is qualified to teach course"""
        return not self.qualified_course_ids or course_id in self.qualified_course_ids


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
        if course_type == "Lab":
            return "lab" in self.room_type.lower()
        return True


@dataclass
class Course:
    """Course model"""
    id: int
    name: str
    code: str
    course_type: str = "Theory"
    hours_per_week: int = 3
    program_code: Optional[str] = None
    department_id: Optional[int] = None
    qualified_faculty_ids: Set[int] = field(default_factory=set)
    
    def get_hours_needed(self) -> int:
        """Get total hours needed per week"""
        return self.hours_per_week


@dataclass
class Section:
    """Section/Class model"""
    id: int
    name: str
    student_count: int
    batch_id: int
    program_code: Optional[str] = None
    department_id: Optional[int] = None
    course_ids: List[int] = field(default_factory=list)  # Courses to schedule
    
    def get_full_name(self) -> str:
        """Get full section identifier"""
        return f"{self.program_code or 'UNK'}-{self.name}"


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
class SchedulingProblem:
    """Complete scheduling problem definition"""
    sections: List[Section]
    courses: List[Course]
    faculty: List[Faculty]
    rooms: List[Room]
    timeslots: List[Timeslot]
    
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
                    hours = course.get_hours_needed()
                    # Schedule course as a single unit (not individual hours)
                    instances.append((section.id, course_id, hours))
        return instances
