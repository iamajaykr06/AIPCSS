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

from .models import (
    Faculty,
    Room,
    Course,
    Section,
    Timeslot,
    ScheduleEntry,
    SchedulingProblem,
    CourseType,
    ScheduleResult,
    AssignmentVariable,
    DomainValue,
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
    "Faculty",
    "Room",
    "Course",
    "Section",
    "Timeslot",
    "ScheduleEntry",
    "SchedulingProblem",
    "CourseType",
    "ScheduleResult",
    "AssignmentVariable",
    "DomainValue",
    "DataLoader",
    "ConstraintEngine",
    "GeneticSchedulerEngine",
    "OrtoolsSchedulerEngine",
    "scheduler_bp",
]
