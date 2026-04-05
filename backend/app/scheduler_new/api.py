"""
Flask API integration for the scheduling engine
"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
import logging
import time
from typing import Optional

from .. import db, socketio
from ..models import TimetableEntry, Department, ScheduleSettings, Section
from ..models.timetable import entry_sections
from .data_loader import DataLoader
from .hybrid_engine import HybridSchedulerEngine
try:
    from .ortools_engine import OrtoolsSchedulerEngine
    ORTOOLS_AVAILABLE = True
except ModuleNotFoundError:
    OrtoolsSchedulerEngine = None
    ORTOOLS_AVAILABLE = False

scheduler_bp = Blueprint('scheduler_new', __name__)
AUTO_HYBRID_CLASS_THRESHOLD = 300


def emit_progress(department_id: int, percentage: int, message: str):
    """Emit progress update via Socket.IO"""
    socketio.emit('generation_progress', {
        'percentage': percentage,
        'current_section': message,
        'status': 'Generating...'
    }, namespace='/', room=f'dept_{department_id}')


def _validate_problem(problem):
    """Return a response tuple if the scheduling input is incomplete."""
    if not problem.sections:
        return jsonify({"status": "failure", "schedule": [], "error": "No sections found to schedule"}), 400
    if not problem.courses:
        return jsonify({"status": "failure", "schedule": [], "error": "No courses found to schedule"}), 400
    if not problem.faculty:
        return jsonify({"status": "failure", "schedule": [], "error": "No faculty found"}), 400
    if not problem.rooms:
        return jsonify({"status": "failure", "schedule": [], "error": "No rooms found"}), 400
    if not problem.timeslots:
        return jsonify({"status": "failure", "schedule": [], "error": "No timeslots configured"}), 400
    return None


def _build_scheduler(problem, requested_engine, time_limit, debug_mode):
    """Choose the engine automatically unless the caller explicitly overrides it."""
    normalized_engine = str(requested_engine or "auto").strip().lower()
    total_classes = len(problem.get_section_courses())

    if normalized_engine == "ortools" and ORTOOLS_AVAILABLE:
        return OrtoolsSchedulerEngine(problem=problem, time_limit_seconds=time_limit, debug=debug_mode), "ortools", total_classes

    if normalized_engine == "hybrid":
        return HybridSchedulerEngine(problem=problem, debug=debug_mode), "hybrid", total_classes

    if not ORTOOLS_AVAILABLE or total_classes > AUTO_HYBRID_CLASS_THRESHOLD:
        return HybridSchedulerEngine(problem=problem, debug=debug_mode), "hybrid", total_classes

    return OrtoolsSchedulerEngine(problem=problem, time_limit_seconds=time_limit, debug=debug_mode), "ortools", total_classes


def _save_schedule_entries(result, department_id, problem):
    """Persist generated entries with one section prefetch instead of per-row lookups."""
    if department_id:
        entry_ids = [
            entry_id for (entry_id,) in db.session.query(TimetableEntry.id)
            .filter_by(department_id=department_id)
            .all()
        ]
    else:
        entry_ids = [entry_id for (entry_id,) in db.session.query(TimetableEntry.id).all()]

    if entry_ids:
        db.session.execute(
            entry_sections.delete().where(entry_sections.c.entry_id.in_(entry_ids))
        )

    if department_id:
        TimetableEntry.query.filter_by(department_id=department_id).delete()
    else:
        TimetableEntry.query.delete()

    section_ids = {entry.section_id for entry in result.schedule}
    sections = {
        section.id: section
        for section in Section.query.filter(Section.id.in_(section_ids)).all()
    } if section_ids else {}
    course_ids = {entry.course_id for entry in result.schedule}
    courses = {
        course.id: course
        for course in problem.course_map.values()
        if course.id in course_ids
    } if result.schedule else {}
    day_order = {
        "Monday": 1,
        "Tuesday": 2,
        "Wednesday": 3,
        "Thursday": 4,
        "Friday": 5,
        "Saturday": 6,
        "Sunday": 7,
    }
    ordered_timeslots = sorted(
        problem.timeslots,
        key=lambda slot: (day_order.get(slot.day, 99), slot.start_time)
    )
    per_day_slots = {}
    for slot in ordered_timeslots:
        per_day_slots.setdefault(slot.day, []).append(slot)

    timetable_entries = []
    for entry in result.schedule:
        section = sections.get(entry.section_id)
        course = courses.get(entry.course_id)
        duration = 2 if course and course.course_type == "Lab" else 1
        day_slots = per_day_slots.get(entry.timeslot.day, [])
        start_index = next(
            (
                index for index, slot in enumerate(day_slots)
                if slot.start_time == entry.timeslot.start_time and slot.end_time == entry.timeslot.end_time
            ),
            None
        )
        slot_labels = []
        if start_index is not None:
            for offset in range(duration):
                slot_index = start_index + offset
                if slot_index >= len(day_slots):
                    break
                slot = day_slots[slot_index]
                slot_labels.append(f"{slot.start_time}-{slot.end_time}")
        if not slot_labels:
            slot_labels = [f"{entry.timeslot.start_time}-{entry.timeslot.end_time}"]

        for slot_label in slot_labels:
            timetable_entry = TimetableEntry(
                day=entry.timeslot.day,
                timeslot=slot_label,
                course_id=entry.course_id,
                teacher_id=entry.faculty_id,
                room_id=entry.room_id,
                department_id=department_id
            )
            if section:
                timetable_entry.sections.append(section)
            timetable_entries.append(timetable_entry)

    db.session.add_all(timetable_entries)
    db.session.commit()


def _result_status(result):
    """Map engine outcome into API-friendly success states."""
    if result.success:
        return "success"
    if result.schedule:
        return "partial_success"
    return "failure"


@scheduler_bp.route('/generate', methods=['POST'])
@jwt_required()
def generate():
    """POST /api/scheduler/generate - adaptive scheduler endpoint."""
    start_time = time.time()
    data = request.get_json() or {}

    department_id = data.get('department_id')
    debug_mode = data.get('debug', False)
    time_limit = data.get('time_limit_seconds', 60.0)
    requested_engine = data.get('engine', 'auto')

    if debug_mode:
        logging.basicConfig(level=logging.DEBUG)
    logger = logging.getLogger(__name__)

    try:
        data_loader = DataLoader(department_id=department_id)
        problem = data_loader.load_problem()
        invalid_problem = _validate_problem(problem)
        if invalid_problem:
            return invalid_problem

        scheduler, engine_name, total_classes = _build_scheduler(
            problem,
            requested_engine,
            time_limit,
            debug_mode
        )
        logger.info(
            "Scheduler generate using %s engine for %s classes",
            engine_name,
            total_classes
        )

        result = scheduler.solve()
        response_status = _result_status(result)

        if result.schedule:
            schedule_output = []
            for entry in result.schedule:
                section = problem.section_map.get(entry.section_id)
                course = problem.course_map.get(entry.course_id)
                faculty = problem.faculty_map.get(entry.faculty_id)
                room = problem.room_map.get(entry.room_id)

                schedule_output.append({
                    "section": section.get_full_name() if section else str(entry.section_id),
                    "course": course.code if course else str(entry.course_id),
                    "faculty": faculty.name if faculty else str(entry.faculty_id),
                    "room": room.name if room else str(entry.room_id),
                    "timeslot": str(entry.timeslot)
                })

            return jsonify({
                "status": response_status,
                "engine": engine_name,
                "schedule": schedule_output,
                "error": None if result.success else result.error_message,
                "stats": {
                    **result.stats,
                    "total_time_seconds": time.time() - start_time
                }
            }), 200
        else:
            return jsonify({
                "status": response_status,
                "engine": engine_name,
                "schedule": [],
                "error": result.error_message or "Could not find valid schedule",
                "stats": {
                    **result.stats,
                    "total_time_seconds": time.time() - start_time
                }
            }), 422

    except Exception as e:
        logger.exception("Error in scheduler generate")
        return jsonify({"status": "failure", "schedule": [], "error": str(e)}), 500


@scheduler_bp.route('/generate-timetable', methods=['POST'])
@jwt_required()
def generate_timetable():
    """POST /generate-timetable - Generate timetable using adaptive engine selection."""
    start_time = time.time()
    data = request.get_json() or {}

    department_id = data.get('department_id')
    debug_mode = data.get('debug', False)
    time_limit = data.get('time_limit_seconds', 60.0)
    requested_engine = data.get('engine', 'auto')

    if department_id:
        dept = db.session.get(Department, department_id)
        if not dept:
            return jsonify(
                {"status": "failure", "error": f"Department {department_id} not found", "schedule": [], "conflicts": {},
                 "stats": {}}), 404

    if debug_mode:
        logging.basicConfig(level=logging.DEBUG)

    logger = logging.getLogger(__name__)

    try:
        emit_progress(department_id or 0, 5, "Loading data...")

        data_loader = DataLoader(department_id=department_id)
        problem = data_loader.load_problem()
        invalid_problem = _validate_problem(problem)
        if invalid_problem:
            response, status = invalid_problem
            payload = response.get_json()
            return jsonify({
                "status": payload.get("status", "failure"),
                "error": payload.get("error"),
                "schedule": [],
                "conflicts": {},
                "stats": {}
            }), status

        scheduler, engine_name, total_classes = _build_scheduler(
            problem,
            requested_engine,
            time_limit,
            debug_mode
        )

        emit_progress(department_id or 0, 10, f"Initializing {engine_name} scheduler...")
        logger.info(f"Starting timetable generation for department {department_id}")
        logger.info(
            "Engine: %s, Classes: %s, Sections: %s, Courses: %s, Faculty: %s, Rooms: %s, Timeslots: %s",
            engine_name,
            total_classes,
            len(problem.sections),
            len(problem.courses),
            len(problem.faculty),
            len(problem.rooms),
            len(problem.timeslots)
        )

        def progress_callback(pct, msg):
            emit_progress(department_id or 0, 10 + int(pct * 0.8), msg)

        result = scheduler.solve(progress_callback=progress_callback)
        response_status = _result_status(result)

        if result.schedule:
            emit_progress(department_id or 0, 95, "Saving to database...")
            logger.info(f"Schedule generated successfully with {len(result.schedule)} entries")
            _save_schedule_entries(result, department_id, problem)
            completion_message = "Complete" if result.success else "Partial schedule saved"
            emit_progress(department_id or 0, 100, completion_message)
        else:
            logger.warning(f"Schedule generation failed: {result.error_message}")

        response_data = {
            "status": response_status,
            "schedule": [entry.to_dict() for entry in result.schedule] if result.schedule else [],
            "error": None if result.success else result.error_message,
            "conflicts": result.conflicts,
            "stats": {
                **result.stats,
                "total_time_seconds": time.time() - start_time
            },
            "engine": engine_name
        }

        return jsonify(response_data), 200 if result.schedule else 422

    except Exception as e:
        logger.exception("Error in generate_timetable")
        return jsonify({"status": "failure", "error": str(e), "schedule": [], "conflicts": {},
                        "stats": {"error_time": time.time() - start_time}}), 500


@scheduler_bp.route('/scheduler-stats', methods=['GET'])
@jwt_required()
def get_scheduler_stats():
    """Get statistics about the current scheduling configuration"""
    data_loader = DataLoader()

    try:
        problem = data_loader.load_problem()

        total_timeslots = len(problem.timeslots)
        total_rooms = len(problem.rooms)
        total_faculty = len(problem.faculty)

        room_capacity = total_timeslots * total_rooms
        faculty_capacity = sum(f.max_hours_per_week for f in problem.faculty)

        total_classes = sum(len(section.course_ids) for section in problem.sections)

        return jsonify({
            "status": "success",
            "stats": {
                "resources": {
                    "sections": len(problem.sections),
                    "courses": len(problem.courses),
                    "faculty": total_faculty,
                    "rooms": total_rooms,
                    "timeslots": total_timeslots
                },
                "capacity": {
                    "room_slots": room_capacity,
                    "faculty_hours": faculty_capacity,
                    "classes_to_schedule": total_classes
                },
                "feasibility": {
                    "rooms_sufficient": room_capacity >= total_classes,
                    "faculty_sufficient": faculty_capacity >= total_classes,
                    "recommendation": "Add more rooms" if room_capacity < total_classes else
                    "Add more faculty" if faculty_capacity < total_classes else "OK"
                }
            }
        }), 200

    except Exception as e:
        return jsonify({"status": "failure", "error": str(e)}), 500
