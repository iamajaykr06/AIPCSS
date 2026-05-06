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

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
from datetime import datetime

from ..models import Teacher, Course, Section, Room, TimetableEntry, Department, ScheduleSettings
from ..models.timetable import entry_sections
from .. import db, socketio
from .auth import roles_required

scheduling_bp = Blueprint("scheduling", __name__)

DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
TIMESLOTS = ["09:00-10:00", "10:00-11:00", "11:00-12:00", "01:00-02:00", "02:00-03:00"]


def _delete_department_timetable_entries(department_id):
    """Delete timetable entries and their section links for one department."""
    entry_ids = [
        entry_id for (entry_id,) in db.session.query(TimetableEntry.id).filter_by(department_id=department_id).all()
    ]
    if entry_ids:
        db.session.execute(entry_sections.delete().where(entry_sections.c.entry_id.in_(entry_ids)))
    TimetableEntry.query.filter_by(department_id=department_id).delete()


def _build_timeslot_sequence(problem):
    """Build an ordered per-day slot sequence from the loaded scheduling problem."""
    day_order = {
        "Monday": 1,
        "Tuesday": 2,
        "Wednesday": 3,
        "Thursday": 4,
        "Friday": 5,
        "Saturday": 6,
        "Sunday": 7,
    }
    ordered = sorted(problem.timeslots, key=lambda slot: (day_order.get(slot.day, 99), slot.start_time))
    per_day = {}
    for slot in ordered:
        per_day.setdefault(slot.day, []).append(slot)
    return per_day


def _expand_schedule_slots(entry_data, course, per_day_slots):
    """Expand lab blocks into per-slot timetable rows for the UI/database."""
    duration = 2 if course and course.course_type == "Lab" else 1
    day_slots = per_day_slots.get(entry_data.timeslot.day, [])
    start_index = next(
        (
            index
            for index, slot in enumerate(day_slots)
            if slot.start_time == entry_data.timeslot.start_time and slot.end_time == entry_data.timeslot.end_time
        ),
        None,
    )
    if start_index is None:
        return [f"{entry_data.timeslot.start_time}-{entry_data.timeslot.end_time}"]

    expanded = []
    for offset in range(duration):
        slot_index = start_index + offset
        if slot_index >= len(day_slots):
            break
        slot = day_slots[slot_index]
        expanded.append(f"{slot.start_time}-{slot.end_time}")
    return expanded or [f"{entry_data.timeslot.start_time}-{entry_data.timeslot.end_time}"]


# ══════════════════════════════════════════════════════════════════════════════
# DASHBOARD STATS
# ══════════════════════════════════════════════════════════════════════════════


@scheduling_bp.route("/stats", methods=["GET"])
@jwt_required()
def get_scheduling_stats():
    """Get global scheduling statistics for the dashboard."""
    total_entries = TimetableEntry.query.count()

    # Conflict detection logic (simplified for stats)
    # We find all (day, slot, teacher) etc that appear more than once
    conflicts = 0

    # Teacher overlaps
    teacher_overlaps = (
        db.session.query(TimetableEntry.day, TimetableEntry.timeslot, TimetableEntry.teacher_id)
        .group_by(TimetableEntry.day, TimetableEntry.timeslot, TimetableEntry.teacher_id)
        .having(db.func.count() > 1)
        .all()
    )
    conflicts += len(teacher_overlaps)

    # Room overlaps
    room_overlaps = (
        db.session.query(TimetableEntry.day, TimetableEntry.timeslot, TimetableEntry.room_id)
        .group_by(TimetableEntry.day, TimetableEntry.timeslot, TimetableEntry.room_id)
        .having(db.func.count() > 1)
        .all()
    )
    conflicts += len(room_overlaps)

    # Section overlaps (Manual check via relationship since it's M2M now)
    # Finding entries that share the same slot and have overlapping sections
    # Simplified: count how many entries have sections in the same slot
    # (Actually, the most accurate is to count unique (day, slot, section))
    section_overlaps = (
        db.session.query(TimetableEntry.day, TimetableEntry.timeslot, entry_sections.c.section_id)
        .join(entry_sections)
        .group_by(TimetableEntry.day, TimetableEntry.timeslot, entry_sections.c.section_id)
        .having(db.func.count() > 1)
        .all()
    )
    conflicts += len(section_overlaps)

    # Course type distribution
    course_data = (
        db.session.query(Course.course_type, db.func.count(TimetableEntry.id))
        .join(TimetableEntry, Course.id == TimetableEntry.course_id)
        .group_by(Course.course_type)
        .all()
    )

    course_type_dist = [{"name": t, "value": c} for t, c in course_data]

    # Room capacity distribution
    rooms = Room.query.all()
    room_caps = {"Small (1-20)": 0, "Medium (21-50)": 0, "Large (51+)": 0}
    for r in rooms:
        if r.capacity <= 20:
            room_caps["Small (1-20)"] += 1
        elif r.capacity <= 50:
            room_caps["Medium (21-50)"] += 1
        else:
            room_caps["Large (51+)"] += 1

    room_dist = [{"name": k, "value": v} for k, v in room_caps.items()]

    return (
        jsonify(
            {
                "total_entries": total_entries,
                "conflicts": conflicts,
                "optimization": max(0, 100 - (conflicts * 5)) if total_entries > 0 else 100,
                "course_type_dist": course_type_dist,
                "room_dist": room_dist,
            }
        ),
        200,
    )


# ══════════════════════════════════════════════════════════════════════════════
# CONFLICT DETECTION
# ══════════════════════════════════════════════════════════════════════════════


def check_conflicts(day, timeslot, teacher_id=None, room_id=None, section_id=None, exclude_entry_id=None):
    """
    FIX: original code passed all three filters to one chained query, meaning it
    only found entries that matched ALL three at once — a real conflict only
    requires any one of them to match.

    Returns list of conflict descriptions, empty list means no conflicts.
    """
    conflicts = []
    base = TimetableEntry.query.filter_by(day=day, timeslot=timeslot)
    if exclude_entry_id:
        base = base.filter(TimetableEntry.id != exclude_entry_id)

    if teacher_id and base.filter_by(teacher_id=teacher_id).first():
        conflicts.append(f"Teacher (id={teacher_id}) is already scheduled in this slot")

    if room_id and base.filter_by(room_id=room_id).first():
        conflicts.append(f"Room (id={room_id}) is already occupied in this slot")

    if section_id and base.join(TimetableEntry.sections).filter(Section.id == section_id).first():
        conflicts.append(f"Section (id={section_id}) already has a class in this slot")

    return conflicts


def _validate_day_timeslot(day, timeslot):
    """Validate day/timeslot against configured scheduling grid."""
    if day not in DAYS:
        return f"Invalid day '{day}'. Allowed days: {', '.join(DAYS)}"
    if timeslot not in TIMESLOTS:
        return f"Invalid timeslot '{timeslot}'. Allowed timeslots: {', '.join(TIMESLOTS)}"
    return None


def _parse_academic_start_year(academic_year):
    """Parse start year from formats like '2023-2026'."""
    if not academic_year:
        return None
    parts = str(academic_year).split("-")
    if not parts:
        return None
    start = parts[0].strip()
    if start.isdigit():
        return int(start)
    return None


def _current_semester_from_batch(batch):
    """
    Calculate current semester from batch.academic_year and current date.
    One semester = 6 months.
    """
    start_year = _parse_academic_start_year(batch.academic_year)
    if not start_year:
        return batch.current_semester or 1

    now = datetime.utcnow()
    current_year_half = 0 if now.month <= 6 else 1
    start_half = 1  # Assume academic cycle starts in second half (Jul-Dec).
    elapsed_halves = ((now.year - start_year) * 2) + (current_year_half - start_half)
    semester = elapsed_halves + 1
    return max(1, min(8, semester))


# ══════════════════════════════════════════════════════════════════════════════
# TIMETABLE GENERATION
# ══════════════════════════════════════════════════════════════════════════════


@scheduling_bp.route("/generate", methods=["POST"])
@roles_required("admin", "dept_head")
def generate_timetable():
    """
    Automated timetable generation for a department.
    Uses a scored First-Fit strategy with backtracking on room assignment.
    Fixes:
      - Variable shadowing bug (inner day/slot vars overwrote the loop vars)
      - Conflict detection now checks each constraint independently
      - N+1 queries on view replaced with eager relations here
    """
    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body must be JSON"}), 400

    strict_mode = bool(data.get("strict_mode", False))
    use_ortools = bool(data.get("use_ortools", True))  # Default to OR-Tools

    dept_id = data.get("department_id")
    if not dept_id:
        return jsonify({"error": "department_id is required"}), 422

    dept = db.session.get(Department, dept_id)
    if not dept:
        return jsonify({"error": "Department not found"}), 404
    if use_ortools:
        return generate_with_ortools(dept, dept_id, strict_mode)
    else:
        return generate_with_greedy(dept, dept_id, strict_mode)


@scheduling_bp.route("/generate/all", methods=["POST"])
@roles_required("admin", "dept_head")
def generate_all_timetables():
    data = request.get_json() or {}
    strict_mode = bool(data.get("strict_mode", False))
    use_ortools = bool(data.get("use_ortools", True))

    departments = Department.query.all()
    results = []

    for dept in departments:
        if use_ortools:
            res_tuple = generate_with_ortools(dept, dept.id, strict_mode)
        else:
            res_tuple = generate_with_greedy(dept, dept.id, strict_mode)

        # res_tuple is (jsonify(...), status_code)
        res_json = res_tuple[0].get_json()
        results.append(res_json)

    return (
        jsonify(
            {
                "status": "success",
                "message": f"Generated timetables for {len(departments)} departments.",
                "results": results,
            }
        ),
        200,
    )


def generate_with_ortools(dept, dept_id, strict_mode):
    """Generate timetable using the new optimized Genetic Engine - DEPARTMENT GLOBAL WISE."""
    try:
        from ..scheduler_new.data_loader import DataLoader
        from ..scheduler_new.hybrid_engine import HybridSchedulerEngine

        socketio.emit(
            "generation_progress",
            {"percentage": 10, "current_section": f"Global Load - {dept.name}", "status": "Loading Data..."},
        )

        data_loader = DataLoader(department_id=dept_id)
        problem = data_loader.load_problem()

        classes = problem.get_section_courses()
        if not classes:
            return jsonify({"error": "No courses found for this department"}), 404

        socketio.emit(
            "generation_progress",
            {"percentage": 30, "current_section": f"Solving {len(classes)} classes...", "status": "Generating..."},
        )

        # Use fast hybrid scheduler (greedy + local search)
        scheduler = HybridSchedulerEngine(problem=problem, debug=False)

        result = scheduler.solve(progress_callback=None)

        if not result.schedule:
            print(f"ERROR: Hybrid scheduler failed. Success: {result.success}, Error: {result.error_message}")
            msg = result.error_message or "Scheduling failed - no valid assignments found."
            return jsonify({"status": "error", "errors": [msg], "message": f"Generation failed: {msg}"}), 422

        # Alert on partial success
        if not result.success:
            failed_count = result.stats.get("failed_workloads", len(result.stats.get("failed_details", [])))
            socketio.emit(
                "generation_progress",
                {
                    "percentage": 90,
                    "current_section": f"Partial Schedule: {failed_count} workloads could not be scheduled",
                    "status": "Partial Success",
                },
            )
        else:
            socketio.emit(
                "generation_progress",
                {"percentage": 90, "current_section": "Saving Complete Schedule", "status": "Finalizing..."},
            )

        # Delete old entries only after successful solve
        _delete_department_timetable_entries(dept_id)

        # Save all generated entries
        successful_entries = 0
        section_ids = {entry_data.section_id for entry_data in result.schedule}
        sections = (
            {section.id: section for section in Section.query.filter(Section.id.in_(section_ids)).all()}
            if section_ids
            else {}
        )
        course_ids = {entry_data.course_id for entry_data in result.schedule}
        courses = (
            {course.id: course for course in Course.query.filter(Course.id.in_(course_ids)).all()} if course_ids else {}
        )
        per_day_slots = _build_timeslot_sequence(problem)
        entries_to_save = []

        for entry_data in result.schedule:
            section = sections.get(entry_data.section_id)
            course = courses.get(entry_data.course_id)
            for slot_label in _expand_schedule_slots(entry_data, course, per_day_slots):
                entry = TimetableEntry(
                    day=entry_data.timeslot.day,
                    timeslot=slot_label,
                    course_id=entry_data.course_id,
                    teacher_id=entry_data.faculty_id,
                    room_id=entry_data.room_id,
                    department_id=dept_id,
                )
                if section:
                    entry.sections.append(section)
                entries_to_save.append(entry)
                successful_entries += 1

        db.session.add_all(entries_to_save)
        db.session.commit()

        socketio.emit("generation_progress", {"percentage": 100, "current_section": "Complete", "status": "Done"})

        return (
            jsonify(
                {
                    "status": "success" if result.success else "partial_success",
                    "entries_created": successful_entries,
                    "incomplete_workloads": result.stats.get("failed_details", []),
                    "errors": [],
                    "message": (
                        f"Successfully generated {successful_entries} timetable entries for {dept.name}"
                        if result.success
                        else f"Generated {successful_entries} entries for {dept.name} with some unscheduled workloads"
                    ),
                }
            ),
            200,
        )

    except Exception as e:
        db.session.rollback()
        return jsonify({"status": "error", "errors": [str(e)], "message": "Fatal error during generation"}), 500


def generate_with_greedy(dept, dept_id, strict_mode):
    """Original greedy algorithm (fallback)."""
    # Pre-load all rooms once (avoid repeated queries per slot)
    all_rooms = Room.query.filter((Room.department_id == dept_id) | (Room.department_id.is_(None))).all()

    total_sections = sum(len(b.sections) for p in dept.programs for b in p.batches)
    processed_sections = 0
    successful_entries = 0
    skipped = []
    errors = []

    # In-memory conflict tracking to eliminate N+1 DB queries
    # Sets of (day, timeslot) occupied by each resource
    teacher_slots: dict[int, set] = {}  # teacher_id -> {(day, slot), ...}
    room_slots: dict[int, set] = {}  # room_id -> {(day, slot), ...}
    section_slots: dict[int, set] = {}  # section_id -> {(day, slot), ...}
    teacher_load: dict[int, int] = {}  # teacher_id -> count of entries assigned

    # Pre-populate with existing entries from other departments to prevent
    # cross-department double-booking of shared rooms and teachers
    existing_entries = TimetableEntry.query.all()
    for e in existing_entries:
        teacher_slots.setdefault(e.teacher_id, set()).add((e.day, e.timeslot))
        room_slots.setdefault(e.room_id, set()).add((e.day, e.timeslot))
        for s in e.sections:
            section_slots.setdefault(s.id, set()).add((e.day, e.timeslot))
        teacher_load[e.teacher_id] = teacher_load.get(e.teacher_id, 0) + 1

    def is_teacher_available(teacher, day, slot):
        if not teacher.availability:
            return True  # no restrictions = always available
        return slot in teacher.availability.get(day, [])

    def get_room_score(room, course, section):
        """
        Score a room for a given course and section.
        Returns 0 if the room cannot be used at all.
        """
        # Capacity hard constraint
        if room.capacity < section.student_count:
            return 0

        score = 0
        # Capacity fit scoring (penalise massive over-capacity)
        ratio = room.capacity / section.student_count
        if ratio == 1:
            score += 10
        elif ratio <= 1.3:
            score += 7
        elif ratio <= 2:
            score += 4
        else:
            score += 1

        # Room type matching
        is_lab_room = "lab" in room.room_type.lower()
        is_lab_course = course.course_type == "Lab"
        if is_lab_course and not is_lab_room:
            return 0  # Lab course MUST be in a lab — hard constraint
        if is_lab_course and is_lab_room:
            score += 20
        elif not is_lab_course and not is_lab_room:
            score += 10  # Theory in classroom — ideal
        else:
            score += 3  # Theory in a lab — acceptable but wasteful

        return score

    # Track which day/slot combinations each section has used (for gap optimisation)
    section_slot_map: dict[int, dict[str, list]] = {}
    # Track which days a section is taking a given course to prevent multiple different sessions per day
    section_course_days: dict[int, dict[int, set]] = {}

    def gap_penalty(section_id, day, slot):
        used = section_slot_map.get(section_id, {}).get(day, [])
        if not used:
            return 0
        current_idx = TIMESLOTS.index(slot)
        return sum(1 for i, s in enumerate(TIMESLOTS[:current_idx]) if s not in used)

    # ── Main scheduling loop ───────────────────────────────────────────────────
    # NEW: Generate timetable without workloads by automatically assigning courses

    # Get all courses for this department (fallback path)
    dept_courses = Course.query.filter_by(department_id=dept_id).all()
    if not dept_courses:
        return jsonify({"error": "No courses found for this department"}), 404

    # GLOBAL TEACHER POOL:
    # Teachers are university-level resources; qualification decides fit.
    all_teachers = Teacher.query.all()
    if not all_teachers:
        return jsonify({"error": "No teachers found in university"}), 404

    for program in dept.programs:
        for batch in program.batches:
            for section in batch.sections:
                processed_sections += 1
                progress = int((processed_sections / max(1, total_sections)) * 100)
                socketio.emit(
                    "generation_progress",
                    {
                        "percentage": progress,
                        "current_section": f"{program.name} - {section.name}",
                        "status": "Generating...",
                    },
                )

                section_slot_map[section.id] = {}
                section_course_days[section.id] = {}

                # Determine current semester from academic year and fetch curriculum
                current_sem = _current_semester_from_batch(batch)
                batch.current_semester = current_sem

                # Get courses for this program using course.program_code and semester
                program_sem_courses = [
                    c for c in dept_courses if c.program_code == program.code and c.semester == current_sem
                ]

                if not program_sem_courses:
                    # Fallback: all department courses with matching semester
                    program_sem_courses = [c for c in dept_courses if c.semester == current_sem] or dept_courses

                # Assign ALL semester courses for predictable, complete timetables.
                assigned_courses = list(program_sem_courses)

                for course in assigned_courses:
                    # Use all available teachers (load-balanced selection)
                    available_teachers = list(all_teachers)

                    if not available_teachers:
                        errors.append(f"No teachers available for course {course.name}")
                        continue

                    # Deterministic teacher selection: least currently allocated load first.
                    teacher = min(available_teachers, key=lambda t: teacher_load.get(t.id, 0))

                    # Deterministic weekly hours (avoid sparse random outputs)
                    if course.course_type == "Lab":
                        hours_needed = 2
                        session_duration = hours_needed  # Labs are consecutive
                    else:
                        hours_needed = 3
                        session_duration = 1  # Theory classes are 1 hour each

                    section_course_days[section.id].setdefault(course.id, set())
                    allocated_hours = 0

                    # Try to allocate the required hours
                    while allocated_hours < hours_needed:
                        needed = min(session_duration, hours_needed - allocated_hours)
                        candidates = []

                        for day in DAYS:
                            # Prevent multiple sessions of same course on same day
                            if day in section_course_days[section.id][course.id]:
                                continue

                            # Find consecutive slots for the needed duration
                            for i in range(len(TIMESLOTS) - needed + 1):
                                block_slots = TIMESLOTS[i:i + needed]

                                # Check teacher availability
                                if any(not is_teacher_available(teacher, day, s) for s in block_slots):
                                    continue

                                # Find suitable room using in-memory tracking
                                best_room = None
                                max_room_score = 0
                                for room in all_rooms:
                                    rscore = get_room_score(room, course, section)
                                    if rscore == 0:
                                        continue
                                    # Program-scoped labs: only assign to matching program.
                                    if (
                                        course.course_type == "Lab"
                                        and room.program_id
                                        and room.program_id != program.id
                                    ):
                                        continue

                                    r_occupied = room_slots.get(room.id, set())
                                    if all((day, s) not in r_occupied for s in block_slots):
                                        if rscore > max_room_score:
                                            max_room_score = rscore
                                            best_room = room

                                if not best_room:
                                    continue

                                # Check for teacher and section conflicts using in-memory sets
                                t_occupied = teacher_slots.get(teacher.id, set())
                                s_occupied = section_slots.get(section.id, set())
                                has_conflict = any(
                                    (day, s) in t_occupied or (day, s) in s_occupied for s in block_slots
                                )
                                if has_conflict:
                                    continue

                                # Score the block: prefer compact schedule and balanced day load.
                                day_load = len(section_slot_map.get(section.id, {}).get(day, []))
                                base_score = (
                                    max_room_score - gap_penalty(section.id, day, block_slots[0]) - (day_load * 2)
                                )
                                candidates.append(
                                    {"day": day, "slots": block_slots, "room": best_room, "score": base_score}
                                )

                        if not candidates:
                            # If we can't find a block of 'needed' size, try smaller (for non-lab courses)
                            if needed > 1 and course.course_type != "Lab":
                                session_duration = 1
                                continue
                            break

                        # Pick the best block
                        best_cand = max(candidates, key=lambda x: x["score"])
                        for s in best_cand["slots"]:
                            entry = TimetableEntry(
                                day=best_cand["day"],
                                timeslot=s,
                                course_id=course.id,
                                teacher_id=teacher.id,
                                room_id=best_cand["room"].id,
                                department_id=dept_id,
                            )
                            entry.sections.append(section)
                            db.session.add(entry)
                            section_slot_map[section.id].setdefault(best_cand["day"], []).append(s)
                            section_course_days[section.id][course.id].add(best_cand["day"])
                            # Update in-memory conflict tracking
                            teacher_slots.setdefault(teacher.id, set()).add((best_cand["day"], s))
                            room_slots.setdefault(best_cand["room"].id, set()).add((best_cand["day"], s))
                            section_slots.setdefault(section.id, set()).add((best_cand["day"], s))
                            teacher_load[teacher.id] = teacher_load.get(teacher.id, 0) + 1
                            allocated_hours += 1
                            successful_entries += 1

                    if allocated_hours < hours_needed:
                        skipped.append(
                            {
                                "course": course.name,
                                "section": section.name,
                                "teacher": teacher.name,
                                "allocated": allocated_hours,
                                "required": hours_needed,
                                "reason": "Could not satisfy time slot constraints",
                            }
                        )

    db.session.commit()

    status = "success" if not skipped and not errors else "partial_success"
    return (
        jsonify(
            {
                "status": status,
                "entries_created": successful_entries,
                "incomplete_workloads": skipped,
                "errors": errors,
                "message": f"Generated {successful_entries} timetable entries for department {dept.name}",
            }
        ),
        200,
    )


# ══════════════════════════════════════════════════════════════════════════════
# TIMETABLE VIEWER
# ══════════════════════════════════════════════════════════════════════════════


@scheduling_bp.route("/view/all", methods=["GET"])
@jwt_required()
def view_all_timetable():
    """Fetch timetable entries across all departments."""
    entries = TimetableEntry.query.all()
    if not entries:
        return jsonify({"data": [], "message": "No timetable generated yet for any department"}), 200

    course_ids = {e.course_id for e in entries}
    teacher_ids = {e.teacher_id for e in entries}
    room_ids = {e.room_id for e in entries}

    courses = {c.id: c for c in Course.query.filter(Course.id.in_(course_ids)).all()}
    teachers = {t.id: t for t in Teacher.query.filter(Teacher.id.in_(teacher_ids)).all()}
    rooms = {r.id: r for r in Room.query.filter(Room.id.in_(room_ids)).all()}

    result = []
    for e in entries:
        course = courses.get(e.course_id)
        teacher = teachers.get(e.teacher_id)
        room = rooms.get(e.room_id)
        result.append(
            {
                "id": e.id,
                "day": e.day,
                "timeslot": e.timeslot,
                "department_id": e.department_id,
                "sections": [{"id": s.id, "name": s.name} for s in e.sections],
                "course": {
                    "id": e.course_id,
                    "name": course.name if course else "Unknown",
                    "code": course.code if course else "",
                    "type": course.course_type if course else None,
                },
                "teacher": {
                    "id": e.teacher_id,
                    "name": teacher.name if teacher else "Unknown",
                    "abbreviation": teacher.abbreviation if teacher else "",
                },
                "room": {
                    "id": e.room_id,
                    "name": room.name if room else "Unknown",
                    "capacity": room.capacity if room else None,
                },
            }
        )

    settings = ScheduleSettings.get_or_create_default()
    breaks_data = settings.breaks or []

    return (
        jsonify(
            {
                "data": result,
                "breaks": breaks_data,
                "time_slots": settings.time_slots,
                "working_days": settings.working_days,
                "department": "All Departments",
                "total": len(result),
            }
        ),
        200,
    )


@scheduling_bp.route("/view/<int:dept_id>", methods=["GET"])
@jwt_required()
def view_timetable(dept_id):
    """
    FIX: original made 4 extra DB queries per timetable entry (N+1 problem).
    Now loads all needed records up front with a single query each.
    """
    dept = db.session.get(Department, dept_id)
    if not dept:
        return jsonify({"error": "Department not found"}), 404

    entries = TimetableEntry.query.filter_by(department_id=dept_id).all()
    if not entries:
        return jsonify({"data": [], "message": "No timetable generated yet for this department"}), 200

    # Pre-load all referenced records to avoid N+1 queries
    course_ids = {e.course_id for e in entries}
    teacher_ids = {e.teacher_id for e in entries}
    room_ids = {e.room_id for e in entries}

    courses = {c.id: c for c in Course.query.filter(Course.id.in_(course_ids)).all()}
    teachers = {t.id: t for t in Teacher.query.filter(Teacher.id.in_(teacher_ids)).all()}
    rooms = {r.id: r for r in Room.query.filter(Room.id.in_(room_ids)).all()}

    result = []
    for e in entries:
        course = courses.get(e.course_id)
        teacher = teachers.get(e.teacher_id)
        room = rooms.get(e.room_id)
        result.append(
            {
                "id": e.id,
                "day": e.day,
                "timeslot": e.timeslot,
                "sections": [{"id": s.id, "name": s.name} for s in e.sections],
                "course": {
                    "id": e.course_id,
                    "name": course.name if course else "Unknown",
                    "code": course.code if course else "",
                    "type": course.course_type if course else None,
                },
                "teacher": {
                    "id": e.teacher_id,
                    "name": teacher.name if teacher else "Unknown",
                    "abbreviation": teacher.abbreviation if teacher else "",
                },
                "room": {
                    "id": e.room_id,
                    "name": room.name if room else "Unknown",
                    "capacity": room.capacity if room else None,
                },
                "department_id": e.department_id,
            }
        )

    # Fetch schedule settings to include breaks
    settings = ScheduleSettings.get_or_create_default()
    breaks_data = settings.breaks or []
    group_by = request.args.get("group_by")
    if group_by == "section":
        grouped = {}
        for entry in result:
            for s in entry["sections"]:
                key = s["name"]
                grouped.setdefault(key, []).append(entry)
        return jsonify({"data": grouped, "department": dept.name}), 200

    return (
        jsonify(
            {
                "data": result,
                "breaks": breaks_data,
                "time_slots": settings.time_slots,
                "working_days": settings.working_days,
                "department": dept.name,
                "total": len(result),
            }
        ),
        200,
    )


@scheduling_bp.route("/view/<int:dept_id>", methods=["DELETE"])
@roles_required("admin", "dept_head")
def clear_timetable(dept_id):
    """Clear the generated timetable for a department so it can be regenerated."""
    dept = db.session.get(Department, dept_id)
    if not dept:
        return jsonify({"error": "Department not found"}), 404

    entry_ids = [entry_id for (entry_id,) in db.session.query(TimetableEntry.id).filter_by(department_id=dept_id).all()]
    deleted = len(entry_ids)
    _delete_department_timetable_entries(dept_id)
    db.session.commit()
    return jsonify({"message": f"Cleared {deleted} timetable entries for {dept.name}"}), 200


@scheduling_bp.route("/entries", methods=["POST"])
@roles_required("admin", "dept_head")
def create_timetable_entry():
    """Manually add a single timetable entry."""
    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body must be JSON"}), 400

    required = ["day", "timeslot", "section_id", "course_id", "teacher_id", "room_id", "department_id"]
    for field in required:
        if field not in data:
            return jsonify({"error": f"'{field}' is required"}), 422

    validation_error = _validate_day_timeslot(data["day"], data["timeslot"])
    if validation_error:
        return jsonify({"error": validation_error}), 422

    section = db.session.get(Section, data["section_id"])
    if not section:
        return jsonify({"error": "Section not found"}), 404
    course = db.session.get(Course, data["course_id"])
    if not course:
        return jsonify({"error": "Course not found"}), 404
    teacher = db.session.get(Teacher, data["teacher_id"])
    if not teacher:
        return jsonify({"error": "Teacher not found"}), 404
    department = db.session.get(Department, data["department_id"])
    if not department:
        return jsonify({"error": "Department not found"}), 404

    # Check for conflicts
    conflicts = check_conflicts(
        data["day"],
        data["timeslot"],
        teacher_id=data["teacher_id"],
        room_id=data["room_id"],
        section_id=data["section_id"],
    )
    if conflicts:
        return jsonify({"error": "Conflict detected", "details": conflicts}), 409

    # Check department-room compatibility
    room = db.session.get(Room, data["room_id"])
    if room and room.department_id and room.department_id != data["department_id"]:
        room_dept = db.session.get(Department, room.department_id)
        target_dept = db.session.get(Department, data["department_id"])
        return (
            jsonify(
                {
                    "error": "Room department mismatch",
                    "message": (
                        f"Room {room.name} belongs to {room_dept.name} department "
                        f"but scheduling for {target_dept.name} department"
                    ),
                }
            ),
            422,
        )

    entry = TimetableEntry(
        day=data["day"],
        timeslot=data["timeslot"],
        course_id=data["course_id"],
        teacher_id=data["teacher_id"],
        room_id=data["room_id"],
        department_id=data["department_id"],
    )
    entry.sections.append(section)
    db.session.add(entry)
    db.session.commit()

    return jsonify({"message": "Timetable entry created", "id": entry.id}), 201


@scheduling_bp.route("/entries/<int:entry_id>", methods=["DELETE"])
@roles_required("admin", "dept_head")
def delete_timetable_entry(entry_id):
    """Delete a single timetable entry."""
    entry = db.session.get(TimetableEntry, entry_id)
    if not entry:
        return jsonify({"error": "Entry not found"}), 404

    db.session.delete(entry)
    db.session.commit()
    return jsonify({"message": "Timetable entry deleted"}), 200


@scheduling_bp.route("/entries/<int:entry_id>", methods=["PATCH"])
@roles_required("admin", "dept_head")
def update_timetable_entry(entry_id):
    """Move or update a single timetable entry."""
    entry = db.session.get(TimetableEntry, entry_id)
    if not entry:
        return jsonify({"error": "Entry not found"}), 404

    data = request.get_json()
    if not data:
        return jsonify({"error": "No data provided"}), 400

    # If moving to new slot, check conflicts
    new_day = data.get("day", entry.day)
    new_slot = data.get("timeslot", entry.timeslot)
    new_room = data.get("room_id", entry.room_id)
    section_ids = [s.id for s in entry.sections]

    validation_error = _validate_day_timeslot(new_day, new_slot)
    if validation_error:
        return jsonify({"error": validation_error}), 422

    if any(k in data for k in ["day", "timeslot", "room_id"]):
        conflicts = check_conflicts(
            new_day, new_slot, teacher_id=entry.teacher_id, room_id=new_room, exclude_entry_id=entry.id
        )
        for section_id in section_ids:
            conflicts.extend(check_conflicts(new_day, new_slot, section_id=section_id, exclude_entry_id=entry.id))
        if conflicts:
            # Keep deterministic and readable error messages
            unique_conflicts = list(dict.fromkeys(conflicts))
            return jsonify({"error": "Conflict detected", "details": unique_conflicts}), 409

    if "day" in data:
        entry.day = data["day"]
    if "timeslot" in data:
        entry.timeslot = data["timeslot"]
    if "room_id" in data:
        entry.room_id = data["room_id"]
    if "teacher_id" in data:
        entry.teacher_id = data["teacher_id"]
    if "course_id" in data:
        entry.course_id = data["course_id"]
    if "section_id" in data:
        new_section = db.session.get(Section, data["section_id"])
        if new_section:
            entry.sections = [new_section]  # Reset to single section for simple UI movement

    db.session.commit()
    return jsonify({"message": "Entry updated"}), 200
