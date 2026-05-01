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
from .workload import WorkloadAllocation

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
    'WorkloadAllocation',
]
