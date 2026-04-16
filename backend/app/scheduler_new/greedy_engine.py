"""
Greedy Timetable Scheduler - Fast heuristic approach
Uses constraint-based greedy assignment with backtracking
"""
import time
import random
from collections import defaultdict
from typing import List, Tuple, Optional, Callable, Set, Dict

from .models import ScheduleEntry, SchedulingProblem, ScheduleResult


class GreedySchedulerEngine:
    """Fast greedy scheduler for large timetabling problems"""
    
    def __init__(self, problem: SchedulingProblem, max_iterations: int = 10000, debug: bool = False):
        self.problem = problem
        self.max_iterations = max_iterations
        self.debug = debug
        
        # State tracking
        self.schedule: List[ScheduleEntry] = []
        self.used_slots: Set[Tuple[int, int, int]] = set()  # (timeslot_idx, room_id, faculty_id)
        self.section_hours: Dict[int, List[int]] = defaultdict(list)  # section_id -> [timeslot_indices]
        self.faculty_hours: Dict[int, int] = defaultdict(int)  # faculty_id -> total hours
        self.faculty_daily_hours: Dict[int, Dict[str, int]] = defaultdict(lambda: defaultdict(int))
        self.room_daily_hours: Dict[int, Dict[str, int]] = defaultdict(lambda: defaultdict(int))
        
        # Teacher-Course-Section consistency: (section_id, course_id) -> faculty_id
        # Ensures the same teacher teaches all instances of a course for a section
        self.section_course_faculty: Dict[Tuple[int, int], int] = {}
        
    def solve(self, progress_callback: Optional[Callable[[int, str], None]] = None) -> ScheduleResult:
        if progress_callback:
            progress_callback(10, "Initializing Greedy Scheduler...")
        
        # Sort timeslots by day then time
        day_order = {"Monday": 1, "Tuesday": 2, "Wednesday": 3, "Thursday": 4, "Friday": 5, "Saturday": 6, "Sunday": 7}
        timeslot_list = sorted(self.problem.timeslots, key=lambda x: (day_order.get(x.day, 99), x.start_time))
        
        # Pre-compute valid consecutive timeslot indices for each duration
        valid_starts = defaultdict(list)
        num_timeslots = len(timeslot_list)
        for h in range(1, 8):
            for i in range(num_timeslots):
                if i + h <= num_timeslots:
                    consecutive_slots = timeslot_list[i:i+h]
                    valid = True
                    for j in range(h-1):
                        if (consecutive_slots[j].day != consecutive_slots[j+1].day or 
                            consecutive_slots[j].end_time != consecutive_slots[j+1].start_time):
                            valid = False
                            break
                    if valid:
                        valid_starts[h].append(i)
        
        # Get classes to schedule
        classes = self.problem.get_section_courses()
        
        if progress_callback:
            progress_callback(20, f"Scheduling {len(classes)} classes...")
        
        # Build difficulty scores (most constrained first)
        class_difficulties = []
        for c_idx, (sec_id, crs_id, hrs) in enumerate(classes):
            course = self.problem.course_map[crs_id]
            section = self.problem.section_map[sec_id]
            
            # Get assigned faculty from workload map
            assigned_faculty_id = self.problem.workload_map.get((sec_id, crs_id))
            if assigned_faculty_id:
                possible_f = [f for f in self.problem.faculty if f.id == assigned_faculty_id]
            else:
                possible_f = list(self.problem.faculty)  # Fallback: any faculty
            possible_r = [r for r in self.problem.rooms 
                         if r.can_accommodate(section.student_count)]
            
            # Difficulty = 1 / (options) - fewer options = harder
            difficulty = 1.0 / (len(possible_f) * len(possible_r) * len(valid_starts.get(hrs, [1])) + 1)
            class_difficulties.append((difficulty, c_idx, sec_id, crs_id, hrs))
        
        # Sort by difficulty (hardest first)
        class_difficulties.sort(key=lambda x: -x[0])
        
        if progress_callback:
            progress_callback(30, "Assigning classes (greedy phase)...")
        
        # Greedy assignment
        failed_classes = []
        for i, (difficulty, c_idx, sec_id, crs_id, hrs) in enumerate(class_difficulties):
            if progress_callback and i % 50 == 0:
                progress_callback(30 + (60 * i // len(class_difficulties)), 
                                 f"Scheduled {i}/{len(classes)} classes...")
            
            course = self.problem.course_map[crs_id]
            section = self.problem.section_map[sec_id]
            section_dept_id = section.department_id
            
            # Get assigned faculty from workload map
            assigned_faculty_id_wl = self.problem.workload_map.get((sec_id, crs_id))
            if assigned_faculty_id_wl:
                possible_f = [f for f in self.problem.faculty if f.id == assigned_faculty_id_wl]
            else:
                possible_f = list(self.problem.faculty)  # Fallback: any faculty
            
            # Apply teacher-course-section consistency
            sc_key = (sec_id, crs_id)
            assigned_faculty_id = self.section_course_faculty.get(sc_key)
            if assigned_faculty_id is not None:
                # STRICT: Only use the already-assigned faculty
                possible_f = [f for f in possible_f if f.id == assigned_faculty_id]
            
            possible_r = [r for r in self.problem.rooms 
                         if r.can_accommodate(section.student_count)
                         and r.can_be_used_by_program(None, section_dept_id)]
            
            # Find valid assignment
            assigned = self._try_assign(
                c_idx, sec_id, crs_id, hrs, course, section,
                possible_f, possible_r, valid_starts.get(hrs, []),
                timeslot_list
            )
            
            if not assigned:
                # Track failure reason for debugging
                failure_reason = "unknown"
                if not possible_f:
                    failure_reason = "no_assigned_faculty"
                elif assigned_faculty_id and not any(f.id == assigned_faculty_id for f in possible_f):
                    failure_reason = "assigned_faculty_unavailable"
                elif not possible_r:
                    failure_reason = "no_suitable_room"
                elif not valid_starts.get(hrs, []):
                    failure_reason = "no_valid_timeslots"
                else:
                    failure_reason = "resource_conflicts"
                
                failed_classes.append((c_idx, course.name, section.name, failure_reason))
                if self.debug:
                    print(f"Failed to assign: {course.name} ({section.name}) - {failure_reason}")
        
        if progress_callback:
            progress_callback(95, "Finalizing schedule...")
        
        # Build result
        success_rate = (len(classes) - len(failed_classes)) / len(classes) if classes else 0
        
        if failed_classes:
            error_msg = f"Partial schedule: {len(failed_classes)}/{len(classes)} classes failed"
            if self.debug:
                for c_idx, name, sec, reason in failed_classes[:5]:
                    print(f"  - {name} ({sec}): {reason}")
        else:
            error_msg = None
        
        if progress_callback:
            progress_callback(100, f"Complete: {len(self.schedule)}/{len(classes)} scheduled")
        
        # Build failure summary by reason
        failure_summary = {}
        for c_idx, name, sec, reason in failed_classes:
            failure_summary[reason] = failure_summary.get(reason, 0) + 1
        
        return ScheduleResult(
            success=len(failed_classes) == 0,
            schedule=self.schedule,
            error_message=error_msg,
            stats={
                "solver": "Greedy Heuristic",
                "total_classes": len(classes),
                "scheduled": len(self.schedule),
                "failed": len(failed_classes),
                "success_rate": f"{success_rate*100:.1f}%",
                "failure_summary": failure_summary,
                "failed_classes_sample": [(name, sec, reason) for c_idx, name, sec, reason in failed_classes[:10]]
            }
        )
    
    def _try_assign(self, c_idx, sec_id, crs_id, hrs, course, section,
                    possible_f, possible_r, allowed_starts, timeslot_list) -> bool:
        """Try to find a valid assignment for a class"""
        
        # Try each timeslot
        for t_idx in allowed_starts:
            slots_needed = list(range(t_idx, t_idx + hrs))
            day = timeslot_list[t_idx].day
            
            # Check section availability (no conflicts)
            if any(s in self.section_hours[sec_id] for s in slots_needed):
                continue
            
            # Try each faculty
            for f in possible_f:
                # Check faculty availability and workload
                if self.faculty_hours[f.id] + hrs > f.max_hours_per_week:
                    continue
                if self.faculty_daily_hours[f.id][day] + hrs > f.max_hours_per_day:
                    continue
                
                # Check faculty time availability
                f_available = True
                for slot_idx in slots_needed:
                    if not f.is_available(timeslot_list[slot_idx]):
                        f_available = False
                        break
                if not f_available:
                    continue
                
                # Check faculty conflicts
                f_conflict = False
                for slot_idx in slots_needed:
                    if (slot_idx, None, f.id) in [(s, None, fid) for s, r, fid in self.used_slots if fid == f.id]:
                        f_conflict = True
                        break
                if f_conflict:
                    continue
                
                # Try each room
                for r in possible_r:
                    # Check if room is suitable for course type
                    if not r.is_suitable_for(course.course_type):
                        # Allow fallback to lecture rooms if needed
                        course_type_lower = course.course_type.lower() if course.course_type else ""
                        if course_type_lower not in ["lab", "moot court", "moot"]:
                            continue
                    
                    # Check room conflicts
                    r_conflict = False
                    for slot_idx in slots_needed:
                        if (slot_idx, r.id, None) in [(s, rid, None) for s, rid, _ in self.used_slots if rid == r.id]:
                            r_conflict = True
                            break
                    if r_conflict:
                        continue
                    
                    # VALID ASSIGNMENT FOUND!
                    # Record it
                    for slot_idx in slots_needed:
                        self.used_slots.add((slot_idx, r.id, f.id))
                        self.section_hours[sec_id].append(slot_idx)
                    
                    self.faculty_hours[f.id] += hrs
                    self.faculty_daily_hours[f.id][day] += hrs
                    self.room_daily_hours[r.id][day] += hrs
                    
                    self.schedule.append(ScheduleEntry(
                        section_id=sec_id,
                        course_id=crs_id,
                        faculty_id=f.id,
                        room_id=r.id,
                        timeslot=timeslot_list[t_idx]
                    ))
                    
                    # Track teacher-course-section assignment for consistency
                    self.section_course_faculty[(sec_id, crs_id)] = f.id
                    
                    return True
        
        return False
