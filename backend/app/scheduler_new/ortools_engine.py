"""
OR-Tools CP-SAT based Timetable Scheduler Engine
Designed for massive scaling across thousands of nodes and university campuses.
"""
import time
from collections import defaultdict
from typing import List, Tuple, Optional, Callable

from ortools.sat.python import cp_model
from .models import ScheduleEntry, SchedulingProblem, ScheduleResult


class OrtoolsSchedulerEngine:
    def __init__(self, problem: SchedulingProblem, time_limit_seconds: float = 300.0, debug: bool = False):
        self.problem = problem
        self.time_limit = time_limit_seconds
        self.debug = debug

    def solve(self, progress_callback: Optional[Callable[[int, str], None]] = None) -> ScheduleResult:
        if progress_callback:
            progress_callback(10, "Initializing CP-SAT Model...")

        model = cp_model.CpModel()
        
        # Ensure timeslots are correctly sorted by day then time, so consecutive sequences map properly on the same day.
        day_order = {"Monday": 1, "Tuesday": 2, "Wednesday": 3, "Thursday": 4, "Friday": 5, "Saturday": 6, "Sunday": 7}
        timeslot_list = sorted(self.problem.timeslots, key=lambda x: (day_order.get(x.day, 99), x.start_time))
        num_timeslots = len(timeslot_list)
        
        # Pre-compute valid consecutive timeslot indices
        valid_starts = defaultdict(list)
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

        classes = self.problem.get_section_courses() # [(section_id, course_id, hours_needed)]
        
        # Mapping: (class_idx, start_t_idx, room_id, faculty_id) -> BoolVar
        assign = {}
        
        # Auxiliary grouping dicts for constraints
        # What occupies a given slot:
        room_occupancy = defaultdict(list)
        faculty_occupancy = defaultdict(list)
        section_occupancy = defaultdict(list)
        
        # Track total hours for faculty max limits Check
        faculty_hours = defaultdict(list)
        faculty_daily_hours = defaultdict(lambda: defaultdict(list))
        
        class_vars = defaultdict(list)
        
        if progress_callback:
            progress_callback(20, "Generating Boolean Assignments (Pruning Search Space)...")

        for c_idx, (sec_id, crs_id, hrs) in enumerate(classes):
            course = self.problem.course_map[crs_id]
            section = self.problem.section_map[sec_id]
            
            allowed_starts = valid_starts.get(hrs, [])
            
            # Prune invalid faculty early using course mapping
            possible_f = [f for f in self.problem.faculty if not course.qualified_faculty_ids or f.id in course.qualified_faculty_ids]
            # Prune invalid rooms early
            possible_r = [r for r in self.problem.rooms if r.can_accommodate(section.student_count)]
            
            # Additional pre-check for labs
            lab_rooms_available = any(
                r.is_suitable_for("Lab") and r.can_accommodate(section.student_count)
                for r in self.problem.rooms
            )

            for t_idx in allowed_starts:
                # Check faculty time availability across all consecutive hours required
                for f in possible_f:
                    f_available = True
                    for offset in range(hrs):
                        if not f.is_available(timeslot_list[t_idx + offset]):
                            f_available = False
                            break
                    if not f_available:
                        continue
                        
                    for r in possible_r:
                        if not r.is_suitable_for(course.course_type):
                            if course.course_type == "Lab" and lab_rooms_available:
                                continue # We must pick a lab room unless none exist
                            if course.course_type != "Lab":
                                continue

                        # Create the binary decision variable corresponding to this assignment mapping
                        var_name = f"assign_c{c_idx}_t{t_idx}_r{r.id}_f{f.id}"
                        v = model.NewBoolVar(var_name)
                        assign[(c_idx, t_idx, r.id, f.id)] = v
                        class_vars[c_idx].append(v)
                        
                        # Add variable to occupancy trackers for every hour it consumes
                        for offset in range(hrs):
                            active_t_idx = t_idx + offset
                            room_occupancy[(active_t_idx, r.id)].append(v)
                            faculty_occupancy[(active_t_idx, f.id)].append(v)
                            section_occupancy[(active_t_idx, sec_id)].append(v)
                            
                        faculty_hours[f.id].append((v, hrs))
                        faculty_daily_hours[f.id][timeslot_list[t_idx].day].append((v, hrs))

        if progress_callback:
            progress_callback(40, "Building C++ Constraint DAG...")

        # 1. Provide an exact assignment for every class globally
        for c_idx in range(len(classes)):
            if not class_vars[c_idx]:
                sec_id, crs_id, hrs = classes[c_idx]
                course = self.problem.course_map[crs_id]
                section = self.problem.section_map[sec_id]
                
                possible_f_count = len([f for f in self.problem.faculty if not course.qualified_faculty_ids or f.id in course.qualified_faculty_ids])
                possible_r_count = len([r for r in self.problem.rooms if r.can_accommodate(section.student_count)])
                allowed_starts = len(valid_starts.get(hrs, []))
                
                reason = []
                if possible_f_count == 0:
                    reason.append(f"No faculty qualified for course '{course.name}' (Code: {course.code})")
                if possible_r_count == 0:
                    reason.append(f"No room large enough for section '{section.name}' (Size: {section.student_count})")
                if allowed_starts == 0:
                    reason.append(f"Timeslots cannot accommodate {hrs} consecutive hours")
                    
                msg = f"Model Infeasible: Course '{course.name}' (Section '{section.name}') has 0 valid permutations. "
                if reason:
                    msg += " | ".join(reason)
                else:
                    msg += "All qualified faculty are completely unavailable during compatible timeslots."

                return ScheduleResult(
                    success=False,
                    error_message=msg
                )
            model.AddExactlyOne(class_vars[c_idx])

        # 2. Hard Overlap constraints: Max 1 class per resource per timeslot
        for vars_list in room_occupancy.values():
            if len(vars_list) > 1:
                model.AddAtMostOne(vars_list)
                
        for vars_list in faculty_occupancy.values():
            if len(vars_list) > 1:
                model.AddAtMostOne(vars_list)
                
        for vars_list in section_occupancy.values():
            if len(vars_list) > 1:
                model.AddAtMostOne(vars_list)

        # 3. Workload Limits (Weekly and Daily)
        for f_id, vars_hrs in faculty_hours.items():
            faculty = self.problem.faculty_map[f_id]
            items = [v * h for v, h in vars_hrs]
            if items:
                model.Add(sum(items) <= faculty.max_hours_per_week)
                
        for f_id, day_dict in faculty_daily_hours.items():
            faculty = self.problem.faculty_map[f_id]
            for day, vars_hrs in day_dict.items():
                items = [v * h for v, h in vars_hrs]
                if items:
                    model.Add(sum(items) <= faculty.max_hours_per_day)

        if progress_callback:
            progress_callback(60, "Invoking CP-SAT Solver C++ Engine...")

        solver = cp_model.CpSolver()
        solver.parameters.max_time_in_seconds = self.time_limit
        solver.parameters.log_search_progress = self.debug

        start_solve = time.time()
        status = solver.Solve(model)
        solve_time = time.time() - start_solve

        if status in [cp_model.OPTIMAL, cp_model.FEASIBLE]:
            if progress_callback:
                progress_callback(90, "Extracting Schedule Model Matrix...")
                
            schedule = []
            for key, var in assign.items():
                if solver.Value(var) == 1:
                    c_idx, t_idx, r_id, f_id = key
                    sec_id, crs_id, hrs = classes[c_idx]
                    schedule.append(ScheduleEntry(
                        section_id=sec_id,
                        course_id=crs_id,
                        faculty_id=f_id,
                        room_id=r_id,
                        timeslot=timeslot_list[t_idx]
                    ))
                    
            if progress_callback:
                progress_callback(100, "Global optimal mapping achieved successfully.")
                
            return ScheduleResult(
                success=True,
                schedule=schedule,
                stats={
                    "solver": "Google OR-Tools CP-SAT",
                    "status": solver.StatusName(status),
                    "solve_time": f"{solve_time:.4f}s",
                    "booleans_generated": len(assign),
                    "branches": solver.NumBranches(),
                    "conflicts": solver.NumConflicts()
                }
            )
        else:
            if progress_callback:
                progress_callback(100, "Failed to resolve constraint topology. Graph is heavily infeasible.")
            return ScheduleResult(
                success=False,
                error_message=f"No feasible layout bounds found (Status: {solver.StatusName(status)})",
                stats={
                    "solve_time": f"{solve_time:.4f}s",
                    "status": solver.StatusName(status)
                }
            )
