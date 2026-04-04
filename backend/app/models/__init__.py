from .user import User
from .department import Department
from .teacher import Teacher, teacher_departments, teacher_qualifications
from .room import Room
from .course import Course
from .program import Program
from .batch import Batch
from .section import Section
from .timetable import TimetableEntry
from .schedule_settings import ScheduleSettings

__all__ = [
    'User',
    'Department',
    'Program',
    'Batch',
    'Section',
    'Teacher',
    'Course',
    'Room',
    'TimetableEntry',
    'ScheduleSettings',
]
