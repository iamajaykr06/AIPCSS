"""
Production-grade Timetable Scheduling Engine

A backtracking CSP solver with:
- Minimum Remaining Values (MRV) heuristic
- Least Constraining Value (LCV) heuristic
- Forward Checking constraint propagation
- O(1) conflict detection via hash maps

Components:
- models: Data classes for scheduling entities
- data_loader: Load data from SQLAlchemy database
- constraint_engine: Hard constraint validation
- scheduler_engine: Backtracking CSP solver
- api: Flask endpoints
"""

from .models import (
    Faculty, Room, Course, Section, Timeslot, 
    ScheduleEntry, SchedulingProblem, CourseType
)
from .data_loader import DataLoader
from .constraint_engine import ConstraintEngine
from .scheduler_engine import SchedulerEngine, ScheduleResult
from .api import scheduler_bp

__all__ = [
    'Faculty', 'Room', 'Course', 'Section', 'Timeslot',
    'ScheduleEntry', 'SchedulingProblem', 'CourseType',
    'DataLoader', 'ConstraintEngine', 'SchedulerEngine',
    'ScheduleResult', 'scheduler_bp'
]
