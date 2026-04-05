"""
Production-grade Timetable Scheduling Engine

Enhanced Genetic Algorithm scheduler with:
- Adaptive mutation rate
- Multiple crossover operators (single-point, two-point, uniform)
- Local search (hill climbing) for better convergence
- Early termination on stagnation
- Hybrid GA + local repair approach

Components:
- models: Data classes for scheduling entities
- data_loader: Load data from SQLAlchemy database
- constraint_engine: Hard constraint validation
- genetic_engine: Enhanced Genetic Algorithm solver
- api: Flask endpoints
"""

from .models import (
    Faculty, Room, Course, Section, Timeslot, 
    ScheduleEntry, SchedulingProblem, CourseType,
    ScheduleResult, AssignmentVariable, DomainValue
)
from .data_loader import DataLoader
from .constraint_engine import ConstraintEngine
from .genetic_engine import GeneticSchedulerEngine
from .ortools_engine import OrtoolsSchedulerEngine
from .api import scheduler_bp

__all__ = [
    'Faculty', 'Room', 'Course', 'Section', 'Timeslot',
    'ScheduleEntry', 'SchedulingProblem', 'CourseType',
    'ScheduleResult', 'AssignmentVariable', 'DomainValue',
    'DataLoader', 'ConstraintEngine', 'GeneticSchedulerEngine', 'OrtoolsSchedulerEngine', 'scheduler_bp'
]
