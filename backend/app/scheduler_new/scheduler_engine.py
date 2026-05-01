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

"""
SchedulerEngine - Backtracking CSP solver with MRV, LCV, and Forward Checking
Optimized for performance with caching and selective constraint checking
"""

import time
import random
import logging
from typing import List, Tuple, Optional, Dict, Set, Callable
from dataclasses import dataclass, field
from collections import defaultdict

from .models import ScheduleEntry, SchedulingProblem, Timeslot
from .constraint_engine import ConstraintEngine


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


class SchedulerEngine:
    """
    CSP-based scheduler using backtracking with:
    - Minimum Remaining Values (MRV) heuristic
    - Least Constraining Value (LCV) heuristic  
    - Forward Checking for constraint propagation
    - Multi-level caching for performance
    """
    
    def __init__(self, problem: SchedulingProblem, debug: bool = False, 
                 max_retries: int = 3, time_limit_seconds: float = 60.0):
        self.problem = problem
        self.debug = debug
        self.max_retries = max_retries
        self.time_limit = time_limit_seconds
        
        self.logger = logging.getLogger(__name__)
        if debug:
            logging.basicConfig(level=logging.DEBUG)
        
        self.constraint_engine = ConstraintEngine(problem, debug)
        
        # Performance tracking
        self.nodes_explored = 0
        self.backtracks = 0
        self.start_time = 0.0
        
        # Multi-level caching
        self.static_domain_cache: Dict[Tuple[int, int, int], List[DomainValue]] = {}
        self.domain_cache: Dict[Tuple[int, int, int], List[DomainValue]] = {}
    
    def _get_variables(self) -> List[AssignmentVariable]:
        """Get all class instances that need scheduling"""
        instances = []
        for section in self.problem.sections:
            for course_id in section.course_ids:
                course = self.problem.course_map.get(course_id)
                if not course:
                    continue

                if course.is_lab():
                    # Labs: one block per week
                    instances.append(AssignmentVariable(
                        section_id=section.id,
                        course_id=course_id,
                        hours_needed=course.get_hours_needed()
                    ))
                else:
                    # Theory/Tutorial: split into individual 1-hour slots
                    # (matches OR-Tools, Hybrid, Greedy behavior)
                    for _ in range(course.get_hours_needed()):
                        instances.append(AssignmentVariable(
                            section_id=section.id,
                            course_id=course_id,
                            hours_needed=1
                        ))
        return instances
    
    def _compute_static_domain(self, var: AssignmentVariable) -> List[DomainValue]:
        """
        Compute static domain (faculty/rooms available in general, independent of assignments).
        This is expensive but computed once per variable per retry.
        """
        domain_values = []
        section = self.problem.section_map.get(var.section_id)
        course = self.problem.course_map.get(var.course_id)
        
        if not section or not course:
            return []
        
        # Get valid timeslots for this section
        for timeslot in self.problem.timeslots:
            # For multi-hour courses (labs or theory blocks), need consecutive slots
            if var.hours_needed > 1:
                consecutive = self._find_consecutive_slots(timeslot, var.hours_needed, set())
                if not consecutive:
                    continue
                anchor_slot = consecutive[0]
            else:
                anchor_slot = timeslot
            
            # Get valid faculty for this (section, course, timeslot)
            valid_faculty = self.constraint_engine.get_valid_faculty(
                var.section_id, var.course_id, anchor_slot
            )
            
            # Get valid rooms for this (section, course, timeslot)
            valid_rooms = self.constraint_engine.get_valid_rooms(
                var.section_id, var.course_id, anchor_slot
            )
            
            # Create all combinations
            for faculty_id in valid_faculty:
                for room_id in valid_rooms:
                    domain_values.append(DomainValue(
                        faculty_id=faculty_id,
                        room_id=room_id,
                        timeslot=anchor_slot
                    ))
        
        return domain_values
    
    def _compute_domain(self, var: AssignmentVariable, 
                        assigned_slots: Set[Timeslot]) -> List[DomainValue]:
        """
        Compute domain using multi-level caching:
        - Level 1: Static domain (computed once, valid across all assignments)
        - Level 2: Filter by assigned slots (cheap operation)
        """
        cache_key = (var.section_id, var.course_id, var.hours_needed)
        
        # Get or compute static domain
        if cache_key not in self.static_domain_cache:
            self.static_domain_cache[cache_key] = self._compute_static_domain(var)
        
        static = self.static_domain_cache[cache_key]
        
        # Filter by assigned slots (cheap filtering)
        return [d for d in static if d.timeslot not in assigned_slots]
    
    def _find_consecutive_slots(self, start_slot: Timeslot, 
                                 hours_needed: int, 
                                 assigned_slots: Set[Timeslot]) -> Optional[List[Timeslot]]:
        """Find consecutive timeslots for lab sessions"""
        # Group slots by day
        day_slots = [t for t in self.problem.timeslots 
                     if t.day == start_slot.day and t not in assigned_slots]
        day_slots.sort(key=lambda x: x.start_time)
        
        # Find consecutive sequence starting from start_slot
        try:
            start_idx = day_slots.index(start_slot)
            if start_idx + hours_needed > len(day_slots):
                return None
            
            consecutive = day_slots[start_idx:start_idx + hours_needed]
            # Verify they're consecutive
            for i in range(len(consecutive) - 1):
                if consecutive[i].end_time != consecutive[i+1].start_time:
                    return None
            
            return consecutive
        except ValueError:
            return None
    
    def _mrv_heuristic(self, variables: List[AssignmentVariable], 
                       assigned_slots: Set[Timeslot]) -> Optional[AssignmentVariable]:
        """Minimum Remaining Values heuristic:
        Select variable with smallest domain (most constrained)"""
        unassigned = [v for v in variables if not v.assigned]
        if not unassigned:
            return None
        
        min_domain_size = float('inf')
        selected = None
        
        for var in unassigned:
            domain = self._compute_domain(var, assigned_slots)
            domain_size = len(domain)
            
            if domain_size < min_domain_size:
                min_domain_size = domain_size
                selected = var
            
            # Early termination: if domain is 0, this path will fail
            if domain_size == 0:
                if self.debug:
                    self.logger.debug(f"Dead end: var ({var.section_id}, {var.course_id}) has empty domain")
                return None
        
        return selected
    
    def _lcv_heuristic(self, var: AssignmentVariable, 
                       domain: List[DomainValue]) -> List[DomainValue]:
        """Least Constraining Value heuristic:
        Order domain values by least impact on other variables"""
        def count_constraints(value: DomainValue) -> int:
            """Count how many other variables this value would constrain"""  
            constraints = 0
            
            slot_key = (value.timeslot.day, value.timeslot.start_time)
            
            # Faculty utilization penalty
            if self.constraint_engine.faculty_schedule[value.faculty_id][slot_key]:
                constraints += 10  # High penalty for conflict
            
            # Room utilization penalty
            if self.constraint_engine.room_schedule[value.room_id][slot_key]:
                constraints += 10
            
            # Section utilization penalty
            if self.constraint_engine.section_schedule[var.section_id][slot_key]:
                constraints += 10
            
            # Prefer less utilized faculty (load balancing)
            faculty = self.problem.faculty_map.get(value.faculty_id)
            if faculty:
                usage = self.constraint_engine.faculty_hours[value.faculty_id]
                constraints += usage
            
            return constraints
        
        # Sort by constraint count (ascending - least constraining first)
        return sorted(domain, key=count_constraints)
    
    def _shares_resource(self, var: AssignmentVariable, entry: ScheduleEntry) -> bool:
        """Check if variable uses same resources as entry"""  
        return var.section_id == entry.section_id
    
    def _forward_check(self, var: AssignmentVariable, 
                       value: DomainValue,
                       remaining_vars: List[AssignmentVariable],
                       assigned_slots: Set[Timeslot]) -> bool:
        """Forward Checking: Check if assignment leaves affected future variables with non-empty domains.
        OPTIMIZED: Only check variables that share resources with current assignment."""
        # Add this timeslot to assigned set
        new_assigned = assigned_slots | {value.timeslot}
        
        # Update constraint engine
        entry = ScheduleEntry(
            section_id=var.section_id,
            course_id=var.course_id,
            faculty_id=value.faculty_id,
            room_id=value.room_id,
            timeslot=value.timeslot
        )
        self.constraint_engine.add_entry(entry)
        
        # Only check variables that are affected (share section, faculty, or room)
        affected_vars = [
            v for v in remaining_vars 
            if v.assigned == False and self._shares_resource(v, entry)
        ]
        
        for future_var in affected_vars:
            domain = self._compute_domain(future_var, new_assigned)
            if not domain:
                # Dead end - restore and return False
                self.constraint_engine.remove_entry(entry)
                return False
        
        # Restore constraint engine state
        self.constraint_engine.remove_entry(entry)
        return True
    
    def _backtrack(self, variables: List[AssignmentVariable], 
                   schedule: List[ScheduleEntry],
                   assigned_slots: Set[Timeslot],
                   depth: int = 0) -> Optional[List[ScheduleEntry]]:
        """Recursive backtracking with MRV and LCV heuristics"""
        # Check time limit
        if time.time() - self.start_time > self.time_limit:
            if self.debug:
                self.logger.debug("Time limit reached")
            return None
        
        # Success: all variables assigned
        if all(v.assigned for v in variables):
            return schedule
        
        # Select next variable using MRV
        var = self._mrv_heuristic(variables, assigned_slots)
        if var is None:
            return None  # Dead end
        
        # Get and order domain using LCV
        domain = self._compute_domain(var, assigned_slots)
        if not domain:
            return None
        
        domain = self._lcv_heuristic(var, domain)
        
        # Try each value
        for value in domain:
            self.nodes_explored += 1
            
            # Check immediate consistency
            entry = ScheduleEntry(
                section_id=var.section_id,
                course_id=var.course_id,
                faculty_id=value.faculty_id,
                room_id=value.room_id,
                timeslot=value.timeslot
            )
            
            is_valid, error = self.constraint_engine.is_consistent(entry)
            if not is_valid:
                if self.debug and depth < 3:
                    self.logger.debug(f"Inconsistent: {error}")
                continue
            
            # Forward checking (optimized to check only affected variables)
            if not self._forward_check(var, value, variables, assigned_slots):
                if self.debug:
                    self.logger.debug(f"Forward check failed for ({var.section_id}, {var.course_id})")
                continue
            
            # Make assignment
            var.assigned = True
            schedule.append(entry)
            assigned_slots.add(value.timeslot)
            self.constraint_engine.add_entry(entry)
            
            if self.debug:
                self.logger.debug(f"Assigned depth {depth}: section={var.section_id}, "
                                f"course={var.course_id}, faculty={value.faculty_id}, "
                                f"room={value.room_id}, time={value.timeslot}")
            
            # Recurse
            result = self._backtrack(variables, schedule, assigned_slots, depth + 1)
            if result is not None:
                return result
            
            # Backtrack
            self.backtracks += 1
            var.assigned = False
            schedule.pop()
            assigned_slots.discard(value.timeslot)
            self.constraint_engine.remove_entry(entry)
        
        return None
    
    def solve(self, progress_callback: Optional[Callable[[int, str], None]] = None) -> ScheduleResult:
        """Main entry point: attempt to solve the scheduling problem"""  
        self.start_time = time.time()
        self.nodes_explored = 0
        self.backtracks = 0
        
        if progress_callback:
            progress_callback(0, "Initializing scheduler...")
        
        # Get all variables to schedule
        variables = self._get_variables()
        total_classes = len(variables)
        
        if total_classes == 0:
            return ScheduleResult(
                success=False,
                error_message="No classes to schedule"
            )
        
        if progress_callback:
            progress_callback(5, f"Scheduling {total_classes} class sessions...")
        
        # Attempt with multiple retry strategies
        for attempt in range(self.max_retries):
            if progress_callback:
                progress_callback(10 + attempt * 10, f"Attempt {attempt + 1}/{self.max_retries}...")
            
            # Shuffle variable order for retry attempts (helps escape local minima)
            if attempt > 0:
                random.shuffle(variables)
                self.static_domain_cache.clear()  # Clear static domain cache for new attempt
            
            # Run backtracking
            schedule = []
            assigned_slots = set()
            result = self._backtrack(variables, schedule, assigned_slots)
            
            if result is not None:
                elapsed = time.time() - self.start_time
                
                if progress_callback:
                    progress_callback(100, f"Schedule generated in {elapsed:.2f}s")
                
                return ScheduleResult(
                    success=True,
                    schedule=result,
                    stats={
                        "total_classes": total_classes,
                        "scheduled": len(result),
                        "nodes_explored": self.nodes_explored,
                        "backtracks": self.backtracks,
                        "time_seconds": elapsed,
                        "attempts": attempt + 1
                    }
                )
            
            if self.debug:
                self.logger.debug(f"Attempt {attempt + 1} failed, retrying...")
        
        # All attempts failed
        elapsed = time.time() - self.start_time
        violations = self.constraint_engine.count_violations()
        
        return ScheduleResult(
            success=False,
            error_message="Could not find valid schedule with current constraints",
            conflicts=violations,
            stats={
                "total_classes": total_classes,
                "nodes_explored": self.nodes_explored,
                "backtracks": self.backtracks,
                "time_seconds": elapsed,
                "attempts": self.max_retries
            }
        )
