from .models import (
    Faculty, Room, Course, Section, Timeslot, 
    ScheduleEntry, SchedulingProblem, CourseType,
    ScheduleResult, AssignmentVariable, DomainValue
)
from .data_loader import DataLoader
from .constraint_engine import ConstraintEngine
from .genetic_engine import GeneticSchedulerEngine
from .api import scheduler_bp

try:
    from .ortools_engine import OrtoolsSchedulerEngine
except ModuleNotFoundError:
    OrtoolsSchedulerEngine = None

__all__ = [
    'Faculty', 'Room', 'Course', 'Section', 'Timeslot',
    'ScheduleEntry', 'SchedulingProblem', 'CourseType',
    'ScheduleResult', 'AssignmentVariable', 'DomainValue',
    'DataLoader', 'ConstraintEngine', 'GeneticSchedulerEngine', 'OrtoolsSchedulerEngine', 'scheduler_bp'
]
