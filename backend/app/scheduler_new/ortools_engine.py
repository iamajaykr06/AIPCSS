"""
OR-Tools CP-SAT based Timetable Scheduler Engine
Designed for massive scaling across thousands of nodes and university campuses.
"""
import time
import random
from collections import defaultdict
from typing import List, Tuple, Optional, Callable

from ortools.sat.python import cp_model
from .models import ScheduleEntry, SchedulingProblem, ScheduleResult

# Limit combinations per class to prevent model explosion
# Increased to 500 to better accommodate Teacher Consistency across multiple slots.
MAX_COMBINATIONS_PER_CLASS = 500


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

        # Build section and program maps for room sharing
        section_map = self.problem.section_map
        # Get program info for each section's batch
        program_dept_map = {}  # section_id -> department_id
        for section in self.problem.sections:
            program_dept_map[section.id] = section.department_id
        
        for c_idx, (sec_id, crs_id, hrs) in enumerate(classes):
            course = self.problem.course_map[crs_id]
            section = self.problem.section_map[sec_id]
            
            # Get section's department for room sharing
            section_dept_id = program_dept_map.get(sec_id)
            
            allowed_starts = valid_starts.get(hrs, [])
            
            # Determine assigned faculty if a workload exists
            assigned_faculty_id = self.problem.workload_map.get((sec_id, crs_id))
            
            # Prune invalid faculty early using course mapping or explicit workload
            if assigned_faculty_id:
                possible_f = [f for f in self.problem.faculty if f.id == assigned_faculty_id]
            else:
                possible_f = [f for f in self.problem.faculty if f.id in course.qualified_faculty_ids]
            # Prune invalid rooms early - consider capacity AND program/department sharing
            possible_r = [
                r for r in self.problem.rooms 
                if r.can_accommodate(section.student_count)
                and r.can_be_used_by_program(None, section_dept_id)  # Allow same-dept sharing
            ]
            
            # Check if any suitable specialized room exists (lab or moot court)
            lab_rooms_available = any(
                r.is_suitable_for("Lab") and r.can_accommodate(section.student_count)
                for r in self.problem.rooms
            )
            
            moot_rooms_available = any(
                r.is_suitable_for("Moot Court") and r.can_accommodate(section.student_count)
                for r in self.problem.rooms
            )
            
            # If this is a lab/moot course but no suitable room exists, 
            # fall back to lecture rooms to avoid INFEASIBLE
            course_type_lower = course.course_type.lower() if course.course_type else ""
            needs_specialized_room = course_type_lower in ["lab", "moot court", "moot"]
            specialized_room_available = (
                (course_type_lower == "lab" and lab_rooms_available) or
                ((course_type_lower == "moot court" or course_type_lower == "moot") and moot_rooms_available)
            )
            fallback_to_lecture = needs_specialized_room and not specialized_room_available
            
            if fallback_to_lecture and self.debug:
                print(f"WARNING: No suitable {course.course_type} room for {section.name} (size: {section.student_count}). "
                      f"Falling back to lecture rooms for course {course.name}.")

            # Phase 1: Collect ALL valid combinations first
            all_combinations = []
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
                            # If we need to fallback to lecture rooms (no lab fits), allow any room
                            if not fallback_to_lecture:
                                continue  # Normal case: must use lab for lab courses
                            # else: fall through and allow this room
                        
                        all_combinations.append((t_idx, r.id, f.id))

            # Phase 2: Sample if too many combinations to prevent model explosion
            # Sort for determinism and better initial search space
            # Preference: Earlier timeslots, smaller suitable rooms
            all_combinations.sort(key=lambda x: (x[0], self.problem.room_map[x[1]].capacity))

            # Use faculty-aware sampling to ensure every qualified teacher has a fair
            # share of combinations, preventing 'Teacher Consistency' from becoming infeasible
            # due to random sampling gaps.
            if len(all_combinations) > MAX_COMBINATIONS_PER_CLASS:
                if self.debug:
                    print(f"Class {c_idx} ({course.name[:30]}): {len(all_combinations)} combos, faculty-aware sampling to {MAX_COMBINATIONS_PER_CLASS}")
                
                # Group by faculty to ensure all teachers are represented
                by_faculty = defaultdict(list)
                for combo in all_combinations:
                    by_faculty[combo[2]].append(combo) # combo[2] is f_id
                
                selected = []
                faculties = list(by_faculty.keys())
                per_faculty = MAX_COMBINATIONS_PER_CLASS // len(faculties) if faculties else 0
                
                # Minimum samples per faculty to ensure they aren't squeezed out
                min_per_faculty = max(5, per_faculty) 
                
                for f_id in faculties:
                    f_combos = by_faculty[f_id]
                    if len(f_combos) <= min_per_faculty:
                        selected.extend(f_combos)
                    else:
                        # Group these faculty combos by timeslot to maintain time diversity too
                        f_by_slot = defaultdict(list)
                        for c in f_combos:
                            f_by_slot[c[0]].append(c)
                        
                        f_slots = list(f_by_slot.keys())
                        f_per_slot = max(1, min_per_faculty // len(f_slots))
                        
                        f_selected = []
                        for t_idx in f_slots:
                            f_selected.extend(random.sample(f_by_slot[t_idx], min(len(f_by_slot[t_idx]), f_per_slot)))
                        
                        # Top up to min_per_faculty if needed
                        if len(f_selected) < min_per_faculty:
                            rem = [c for c in f_combos if c not in f_selected]
                            f_selected.extend(random.sample(rem, min(len(rem), min_per_faculty - len(f_selected))))
                            
                        selected.extend(f_selected)
                
                # Final trim or top-up
                if len(selected) > MAX_COMBINATIONS_PER_CLASS:
                    all_combinations = random.sample(selected, MAX_COMBINATIONS_PER_CLASS)
                elif len(selected) < MAX_COMBINATIONS_PER_CLASS:
                    remaining = [c for c in all_combinations if c not in selected]
                    needed = MAX_COMBINATIONS_PER_CLASS - len(selected)
                    if remaining and needed > 0:
                        selected.extend(random.sample(remaining, min(needed, len(remaining))))
                    all_combinations = selected
                else:
                    all_combinations = selected
            
            # Phase 3: Create boolean variables for selected combinations
            for t_idx, r_id, f_id in all_combinations:
                f = next(fac for fac in possible_f if fac.id == f_id)
                r = next(room for room in possible_r if room.id == r_id)
                
                # Create the binary decision variable corresponding to this assignment mapping
                var_name = f"assign_c{c_idx}_t{t_idx}_r{r_id}_f{f_id}"
                v = model.NewBoolVar(var_name)
                assign[(c_idx, t_idx, r_id, f_id)] = v
                class_vars[c_idx].append(v)
                
                # Add variable to occupancy trackers for every hour it consumes
                for offset in range(hrs):
                    active_t_idx = t_idx + offset
                    room_occupancy[(active_t_idx, r_id)].append(v)
                    faculty_occupancy[(active_t_idx, f_id)].append(v)
                    section_occupancy[(active_t_idx, sec_id)].append(v)
                    
                faculty_hours[f_id].append((v, hrs))
                faculty_daily_hours[f_id][timeslot_list[t_idx].day].append((v, hrs))

        if progress_callback:
            progress_callback(40, "Building C++ Constraint DAG...")

        # ── Teacher-course-section consistency ─────────────────────────────────
        # For every (section, course) pair, exactly one faculty may teach it
        # across ALL slots scheduled during the week. This prevents the solver
        # from assigning slot 1 to Teacher A and slot 2 to Teacher B.
        #
        # Implementation:
        #   1. Group assignment vars by (sec_id, crs_id, f_id).
        #   2. For each (sec_id, crs_id), create one BoolVar per candidate
        #      faculty: `faculty_chosen[sec_id, crs_id, f_id]`.
        #   3. Force: if any slot var with faculty f is 1 → faculty_chosen[f]=1
        #      (via `assign_var <= faculty_chosen[f]`).
        #   4. Exactly one faculty_chosen across all candidates must be 1
        #      (AddExactlyOne). This cascades to zero out all other faculty vars.

        # Group vars: (sec_id, crs_id) -> {f_id: [BoolVar, ...]}
        from collections import defaultdict as _dd
        sc_faculty_vars: dict = {}
        for (c_idx, t_idx, r_id, f_id), var in assign.items():
            sec_id, crs_id, _ = classes[c_idx]
            key = (sec_id, crs_id)
            if key not in sc_faculty_vars:
                sc_faculty_vars[key] = {}
            sc_faculty_vars[key].setdefault(f_id, []).append(var)

        for (sec_id, crs_id), fac_groups in sc_faculty_vars.items():
            faculty_ids = list(fac_groups.keys())
            if len(faculty_ids) <= 1:
                # Only one teacher option — no constraint needed
                continue

            # Create a BoolVar for each candidate faculty
            chosen: dict = {}
            for f_id in faculty_ids:
                fv = model.NewBoolVar(f"fchosen_s{sec_id}_c{crs_id}_f{f_id}")
                chosen[f_id] = fv
                # Each slot-assignment var implies its faculty is chosen
                for slot_var in fac_groups[f_id]:
                    model.AddImplication(slot_var, fv)

            # Exactly one teacher may be chosen for this (section, course)
            model.AddExactlyOne(list(chosen.values()))

        # 1. Provide an exact assignment for every class globally
        for c_idx in range(len(classes)):
            if not class_vars[c_idx]:
                sec_id, crs_id, hrs = classes[c_idx]
                course = self.problem.course_map[crs_id]
                section = self.problem.section_map[sec_id]
                
                possible_f_count = len([f for f in self.problem.faculty if f.id in course.qualified_faculty_ids])
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
                    msg += "Qualified faculty and suitable rooms could not be aligned with the configured timeslots."

                print(f"ERROR: {msg}")

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
            
            print(f"ERROR: Solver status: {solver.StatusName(status)}")
            return ScheduleResult(
                success=False,
                error_message=f"No feasible layout bounds found (Status: {solver.StatusName(status)})",
                stats={
                    "solve_time": f"{solve_time:.4f}s",
                    "status": solver.StatusName(status)
                }
            )
