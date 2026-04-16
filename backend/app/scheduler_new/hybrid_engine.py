"""
Hybrid Timetable Scheduler - Multi-pass with local search optimization
Pass 1: Greedy assignment
Pass 2: Local search to resolve conflicts
"""

from collections import defaultdict
from typing import Callable, Dict, List, Optional, Tuple

from .models import ScheduleEntry, SchedulingProblem, ScheduleResult


class HybridSchedulerEngine:
    """Hybrid scheduler: greedy + local search optimization."""

    def __init__(self, problem: SchedulingProblem, max_iterations: int = 1000, debug: bool = False):
        self.problem = problem
        self.max_iterations = max_iterations
        self.debug = debug
        self._faculty_candidates: Dict[int, List] = {}
        self._room_candidates: Dict[Tuple[int, int], List] = {}
        self._timeslot_index: Dict[Tuple[str, str], int] = {}

    def _get_faculty_candidates(self, section, course):
        """Cache valid faculty per section-course pair (uses explicit workload assignment)."""
        cache_key = (section.id, course.id)
        if cache_key not in self._faculty_candidates:
            # Use explicit workload assignment
            assigned_id = self.problem.workload_map.get(cache_key)
            if assigned_id:
                candidates = [f for f in self.problem.faculty if f.id == assigned_id]
            else:
                # Fallback: any available faculty
                candidates = list(self.problem.faculty)
            self._faculty_candidates[cache_key] = candidates
        return self._faculty_candidates[cache_key]

    def _get_room_candidates(self, section, course):
        """Cache room candidates per section/course pair."""
        cache_key = (section.id, course.id)
        if cache_key in self._room_candidates:
            return self._room_candidates[cache_key]

        course_type_lower = course.course_type.lower() if course.course_type else ""
        section_dept_id = section.department_id

        # Pass 1: Strict matching (Lab -> Lab room)
        candidates = [
            room for room in self.problem.rooms
            if room.can_accommodate(section.student_count)
            and room.can_be_used_by_program(None, section_dept_id)
            and room.is_suitable_for(course.course_type)
        ]

        # C2: Pass 2: Fallback for Labs/Moot if no specialized rooms are available
        if not candidates and course_type_lower in ["lab", "moot court", "moot"]:
            if self.debug:
                print(f"DEBUG: No specialized rooms for {course.course_type}. Falling back to general rooms.")
            candidates = [
                room for room in self.problem.rooms
                if room.can_accommodate(section.student_count)
                and room.can_be_used_by_program(None, section_dept_id)
                # Allow fallback to regular classrooms for labs if no labs fit
            ]

        self._room_candidates[cache_key] = candidates
        return candidates

    def _new_schedule_state(self):
        """Keep occupancy in direct lookup sets so conflict checks stay O(1).

        Pre-populates room_slots from cross-department TimetableEntry records
        to prevent double-booking shared rooms across departments.
        """
        state = {
            "section_hours": defaultdict(set),
            "batch_hours": defaultdict(set),  # C6
            "faculty_hours": defaultdict(int),
            "faculty_daily_hours": defaultdict(lambda: defaultdict(int)),
            "faculty_slots": defaultdict(set),
            "room_slots": defaultdict(set),
            "section_course_days": defaultdict(set),
            "faculty_program_day_sessions": defaultdict(int),
            "section_course_faculty": {},
        }

        # ── Pre-populate room_slots from cross-department bookings ──────
        # Rooms carry `global_busy_slots` (set by DataLoader) that map
        # day -> set of timeslot labels already taken by other departments.
        # We convert these labels into timeslot indices so the engine's
        # O(1) conflict check works automatically.
        for room in self.problem.rooms:
            global_busy = getattr(room, 'global_busy_slots', None)
            if not global_busy:
                continue
            for day, busy_labels in global_busy.items():
                for label in busy_labels:
                    # label is "HH:MM-HH:MM" — extract start time as slot key
                    start = label.split('-')[0] if '-' in label else label
                    slot_idx = self._timeslot_index.get((day, start))
                    if slot_idx is not None:
                        state["room_slots"][room.id].add(slot_idx)

        return state

    @staticmethod
    def _occupy_assignment(state, section_id, batch_id, course_id, faculty_id, room_id, day, program_code, slots_needed, hours, is_lab):
        """Apply one accepted assignment block to all trackers."""
        for slot_idx in slots_needed:
            state["section_hours"][section_id].add(slot_idx)
            state["batch_hours"][batch_id].add(slot_idx) # C6
            state["faculty_slots"][faculty_id].add(slot_idx)
            state["room_slots"][room_id].add(slot_idx)

        state["faculty_hours"][faculty_id] += hours
        state["faculty_daily_hours"][faculty_id][day] += hours
        if not is_lab:
            state["section_course_days"][(section_id, course_id)].add(day)
            state["faculty_program_day_sessions"][(faculty_id, program_code, day)] += 1

    @staticmethod
    def _is_lab_course(course) -> bool:
        return (course.course_type or "").strip().lower() == "lab"

    def solve(self, progress_callback: Optional[Callable[[int, str], None]] = None) -> ScheduleResult:
        if progress_callback:
            progress_callback(10, "Initializing Hybrid Scheduler...")

        day_order = {
            "Monday": 1,
            "Tuesday": 2,
            "Wednesday": 3,
            "Thursday": 4,
            "Friday": 5,
            "Saturday": 6,
            "Sunday": 7,
        }
        timeslot_list = sorted(
            self.problem.timeslots,
            key=lambda timeslot: (day_order.get(timeslot.day, 99), timeslot.start_time),
        )
        self._timeslot_index = {
            (timeslot.day, timeslot.start_time): index
            for index, timeslot in enumerate(timeslot_list)
        }

        valid_starts = self._compute_valid_starts(timeslot_list)
        classes = self.problem.get_section_courses()

        if progress_callback:
            progress_callback(20, f"Pass 1: Greedy scheduling {len(classes)} classes...")

        schedule, unassigned = self._greedy_assign(classes, valid_starts, timeslot_list)

        if progress_callback:
            progress_callback(60, f"Pass 1 complete: {len(schedule)}/{len(classes)} scheduled")

        if unassigned and schedule:
            if progress_callback:
                progress_callback(70, f"Pass 2: Local search for {len(unassigned)} remaining classes...")

            schedule, unassigned = self._local_search_optimize(
                schedule, unassigned, classes, valid_starts, timeslot_list
            )

        if progress_callback:
            progress_callback(95, "Finalizing...")

        success_rate = len(schedule) / len(classes) if classes else 0
        error_msg = None if not unassigned else f"Partial schedule: {len(unassigned)}/{len(classes)} classes failed"

        if progress_callback:
            progress_callback(100, f"Complete: {len(schedule)}/{len(classes)} scheduled ({success_rate * 100:.0f}%)")

        failed_details = self._build_failed_details(schedule, unassigned)

        return ScheduleResult(
            success=len(unassigned) == 0,
            schedule=schedule,
            error_message=error_msg,
            stats={
                "solver": "Hybrid (Greedy + Local Search)",
                "total_classes": len(classes),
                "scheduled": len(schedule),
                "failed": len(unassigned),
                "failed_details": failed_details,
                "failed_workloads": len(failed_details),
                "success_rate": f"{success_rate * 100:.1f}%",
            },
        )

    def _get_failure_reason(self, section, course, weekly_section_capacity, section_demand):
        """Explain the most likely reason a course still could not be scheduled."""
        section_overload = max(0, section_demand - weekly_section_capacity)
        if section_overload:
            return (
                f"Section requires {section_demand} weekly hours but only "
                f"{weekly_section_capacity} teaching slots are configured "
                f"({section_overload} hours over capacity)"
            )

        if not self._get_faculty_candidates(section, course):
            return f"No faculty assigned for course {course.code}"

        if not self._get_room_candidates(section, course):
            return (
                f"No suitable room configured for {course.course_type} "
                f"with capacity >= {section.student_count}"
            )

        return "Could not satisfy remaining timeslot/resource constraints"

    def _build_failed_details(self, schedule, unassigned):
        """Convert unscheduled tuples into course-level user-facing metadata."""
        allocated_hours = defaultdict(int)
        missing_hours = defaultdict(int)
        section_required_hours = defaultdict(int)
        weekly_section_capacity = len(self.problem.timeslots)

        for section_id, course_id, hours in self.problem.get_section_courses():
            section_required_hours[section_id] += hours

        for entry in schedule:
            course = self.problem.course_map.get(entry.course_id)
            allocated_hours[(entry.section_id, entry.course_id)] += (
                course.get_hours_needed() if course and self._is_lab_course(course) else 1
            )

        for _, section_id, course_id, hours in unassigned:
            missing_hours[(section_id, course_id)] += hours

        details = []
        for section_id, course_id in sorted(
            missing_hours,
            key=lambda key: (
                self.problem.section_map.get(key[0]).get_full_name() if self.problem.section_map.get(key[0]) else str(key[0]),
                self.problem.course_map.get(key[1]).name if self.problem.course_map.get(key[1]) else str(key[1]),
            ),
        ):
            section = self.problem.section_map.get(section_id)
            course = self.problem.course_map.get(course_id)
            allocated = allocated_hours[(section_id, course_id)]
            missing = missing_hours[(section_id, course_id)]
            section_demand = section_required_hours.get(section_id, 0)
            reason = self._get_failure_reason(section, course, weekly_section_capacity, section_demand)
            details.append({
                "course": course.name if course else str(course_id),
                "section": section.get_full_name() if section else str(section_id),
                "teacher": "Unassigned",
                "allocated": allocated,
                "required": allocated + missing,
                "reason": reason,
            })
        return details

    def _compute_valid_starts(self, timeslot_list):
        """Pre-compute valid consecutive timeslot indices."""
        valid_starts = defaultdict(list)
        num_timeslots = len(timeslot_list)

        for hours in range(1, 8):
            for start_idx in range(num_timeslots):
                if start_idx + hours > num_timeslots:
                    continue

                consecutive_slots = timeslot_list[start_idx:start_idx + hours]
                is_valid = True
                for offset in range(hours - 1):
                    current = consecutive_slots[offset]
                    nxt = consecutive_slots[offset + 1]
                    if current.day != nxt.day or current.end_time != nxt.start_time:
                        is_valid = False
                        break

                if is_valid:
                    valid_starts[hours].append(start_idx)

        return valid_starts

    def _build_class_order(self, classes, valid_starts):
        """
        Order classes by difficulty and Batch-Isolation (E3).
        
        Difficulty: items with fewest valid resources first (MRV).
        Isolation: Group by batch_id to keep a batch's schedule together.
        """
        ranked = []
        for class_idx, (section_id, course_id, hours) in enumerate(classes):
            course = self.problem.course_map[course_id]
            section = self.problem.section_map[section_id]
            faculty_count = len(self._get_faculty_candidates(section, course))
            room_count = len(self._get_room_candidates(section, course))
            
            # MRV (Minimum Remaining Values) heuristic
            difficulty = 1.0 / (faculty_count * room_count + 0.1)
            
            # E3 Priority: Use batch_id as primary grouping key
            batch_id = section.batch_id
            
            ranked.append((difficulty, batch_id, section_id, course_id, hours, class_idx))

        # Sort by batch_id first (E3), then difficulty (MRV)
        ranked.sort(key=lambda item: (item[1], -item[0], item[2]))
        return [(item[0], item[5], item[2], item[3], item[4]) for item in ranked]

    def _greedy_assign(self, classes, valid_starts, timeslot_list):
        """First pass: greedy assignment with constrained-class ordering."""
        class_order = self._build_class_order(classes, valid_starts)
        schedule = []
        state = self._new_schedule_state()
        unassigned = []

        for _, class_idx, section_id, course_id, hours in class_order:
            course = self.problem.course_map[course_id]
            section = self.problem.section_map[section_id]
            is_lab = self._is_lab_course(course)
            program_code = section.program_code or "__unknown_program__"
            sc_key = (section_id, course_id)

            possible_faculty = self._get_faculty_candidates(section, course)
            possible_rooms = self._get_room_candidates(section, course)

            # --- Teacher-course-section consistency (greedy pass) ---
            # If a teacher has already been assigned to this (section, course)
            # pair on a previous slot, lock all future slots to the same teacher.
            locked_fid = state["section_course_faculty"].get(sc_key)
            if locked_fid is not None:
                possible_faculty = [f for f in possible_faculty if f.id == locked_fid]

            all_candidates = []
            for start_idx in valid_starts.get(hours, []):
                slots_needed = list(range(start_idx, start_idx + hours))
                day = timeslot_list[start_idx].day

                if any(slot_idx in state["section_hours"][section_id] for slot_idx in slots_needed):
                    continue
                if not is_lab and day in state["section_course_days"][(section_id, course_id)]:
                    continue

                for faculty in possible_faculty:
                    if state["faculty_hours"][faculty.id] + hours > faculty.max_hours_per_week:
                        continue
                    if state["faculty_daily_hours"][faculty.id][day] + hours > faculty.max_hours_per_day:
                        continue
                    if not is_lab and state["faculty_program_day_sessions"][(faculty.id, program_code, day)] >= 3:
                        continue
                    if any(slot_idx in state["faculty_slots"][faculty.id] for slot_idx in slots_needed):
                        continue
                    if not all(faculty.is_available(timeslot_list[slot_idx]) for slot_idx in slots_needed):
                        continue

                    for room in possible_rooms:
                        if any(slot_idx in state["room_slots"][room.id] for slot_idx in slots_needed):
                            continue
                        
                        # E4: Score candidate based on daily load balance and gap penalty
                        # Prefer days where the faculty has fewer hours
                        fac_day_load = state["faculty_daily_hours"][faculty.id][day]
                        balance_score = 10 - fac_day_load
                        
                        all_candidates.append({
                            'score': balance_score,
                            'start_idx': start_idx,
                            'faculty_id': faculty.id,
                            'room_id': room.id,
                            'day': day,
                            'slots_needed': slots_needed
                        })

            if all_candidates:
                # E4: Sort by score descending
                all_candidates.sort(key=lambda x: x['score'], reverse=True)
                best = all_candidates[0]
                
                self._occupy_assignment(
                    state,
                    section_id,
                    section.batch_id,
                    course_id,
                    best['faculty_id'],
                    best['room_id'],
                    best['day'],
                    program_code,
                    best['slots_needed'],
                    hours,
                    is_lab,
                )
                schedule.append(
                    ScheduleEntry(
                        section_id=section_id,
                        course_id=course_id,
                        faculty_id=best['faculty_id'],
                        room_id=best['room_id'],
                        timeslot=timeslot_list[best['start_idx']],
                    )
                )
                state["section_course_faculty"].setdefault(sc_key, best['faculty_id'])
                assigned = True

            if not assigned:
                unassigned.append((class_idx, section_id, course_id, hours))

        return schedule, unassigned

    def _local_search_optimize(self, schedule, unassigned, classes, valid_starts, timeslot_list):
        """Second pass: try to fit remaining classes into the free gaps."""
        state = self._new_schedule_state()
        class_hours = {(section_id, course_id): hours for section_id, course_id, hours in classes}

        for entry in schedule:
            hours = class_hours.get((entry.section_id, entry.course_id), 1)
            start_idx = self._timeslot_index.get((entry.timeslot.day, entry.timeslot.start_time))
            if start_idx is None:
                continue
            course = self.problem.course_map[entry.course_id]
            section = self.problem.section_map[entry.section_id]
            is_lab = self._is_lab_course(course)
            program_code = section.program_code or "__unknown_program__"

            slots_needed = list(range(start_idx, start_idx + hours))
            self._occupy_assignment(
                state,
                entry.section_id,
                section.batch_id,
                entry.course_id,
                entry.faculty_id,
                entry.room_id,
                entry.timeslot.day,
                program_code,
                slots_needed,
                hours,
                is_lab,
            )
            # Rebuild teacher-course-section lock from already-scheduled entries
            sc_key = (entry.section_id, entry.course_id)
            state["section_course_faculty"].setdefault(sc_key, entry.faculty_id)

        still_unassigned = []

        for class_idx, section_id, course_id, hours in unassigned:
            course = self.problem.course_map[course_id]
            section = self.problem.section_map[section_id]
            is_lab = self._is_lab_course(course)
            program_code = section.program_code or "__unknown_program__"
            sc_key = (section_id, course_id)

            possible_faculty = self._get_faculty_candidates(section, course)
            possible_rooms = self._get_room_candidates(section, course)

            # --- Teacher-course-section consistency (local-search pass) ---
            locked_fid = state["section_course_faculty"].get(sc_key)
            if locked_fid is not None:
                possible_faculty = [f for f in possible_faculty if f.id == locked_fid]

            assigned = False

            for start_idx in valid_starts.get(hours, []):
                slots_needed = list(range(start_idx, start_idx + hours))
                day = timeslot_list[start_idx].day

                if any(slot_idx in state["section_hours"][section_id] for slot_idx in slots_needed):
                    continue
                if not is_lab and day in state["section_course_days"][(section_id, course_id)]:
                    continue

                for faculty in possible_faculty:
                    if state["faculty_hours"][faculty.id] + hours > faculty.max_hours_per_week:
                        continue
                    if state["faculty_daily_hours"][faculty.id][day] + hours > faculty.max_hours_per_day:
                        continue
                    if not is_lab and state["faculty_program_day_sessions"][(faculty.id, program_code, day)] >= 3:
                        continue
                    if any(slot_idx in state["faculty_slots"][faculty.id] for slot_idx in slots_needed):
                        continue
                    if not all(faculty.is_available(timeslot_list[slot_idx]) for slot_idx in slots_needed):
                        continue

                    for room in possible_rooms:
                        if any(slot_idx in state["room_slots"][room.id] for slot_idx in slots_needed):
                            continue

                        self._occupy_assignment(
                            state,
                            section_id,
                            section.batch_id,
                            course_id,
                            faculty.id,
                            room.id,
                            day,
                            program_code,
                            slots_needed,
                            hours,
                            is_lab,
                        )
                        schedule.append(
                            ScheduleEntry(
                                section_id=section_id,
                                course_id=course_id,
                                faculty_id=faculty.id,
                                room_id=room.id,
                                timeslot=timeslot_list[start_idx],
                            )
                        )
                        state["section_course_faculty"].setdefault(sc_key, faculty.id)
                        assigned = True
                        break

                    if assigned:
                        break

                if assigned:
                    break

            if not assigned:
                still_unassigned.append((class_idx, section_id, course_id, hours))

        return schedule, still_unassigned
