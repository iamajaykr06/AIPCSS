"""
Flask API integration for the scheduling engine
"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
import logging
import time
from typing import Optional

from .. import db, socketio
from ..models import TimetableEntry, Department, ScheduleSettings
from .data_loader import DataLoader
from .scheduler_engine import SchedulerEngine


scheduler_bp = Blueprint('scheduler_new', __name__)


def emit_progress(department_id: int, percentage: int, message: str):
    """Emit progress update via Socket.IO"""
    socketio.emit('generation_progress', {
        'percentage': percentage,
        'current_section': message,
        'status': 'Generating...'
    }, namespace='/', room=f'dept_{department_id}')


@scheduler_bp.route('/generate', methods=['POST'])
@jwt_required()
def generate():
    """
    POST /api/scheduler/generate
    
    CSP-based scheduler with Backtracking + Forward Checking + MRV + LCV.
    
    Request Body:
    {
        "department_id": int (optional),
        "debug": bool (optional, default false),
        "max_retries": int (optional, default 3),
        "time_limit_seconds": float (optional, default 300)
    }
    
    Response:
    {
        "status": "success" | "failure",
        "schedule": [
            {
                "section": "...",
                "course": "...",
                "faculty": "...",
                "room": "...",
                "timeslot": "..."
            }
        ]
    }
    """
    start_time = time.time()
    
    # Parse request
    data = request.get_json() or {}
    
    department_id = data.get('department_id')
    debug_mode = data.get('debug', False)
    max_retries = data.get('max_retries', 3)
    time_limit = data.get('time_limit_seconds', 300.0)
    
    # Setup logging
    if debug_mode:
        logging.basicConfig(level=logging.DEBUG)
    logger = logging.getLogger(__name__)
    
    try:
        # Load data
        data_loader = DataLoader(department_id=department_id)
        problem = data_loader.load_problem()
        
        # Validate problem
        if not problem.sections:
            return jsonify({
                "status": "failure",
                "schedule": [],
                "error": "No sections found to schedule"
            }), 400
        
        if not problem.courses:
            return jsonify({
                "status": "failure",
                "schedule": [],
                "error": "No courses found to schedule"
            }), 400
        
        if not problem.faculty:
            return jsonify({
                "status": "failure",
                "schedule": [],
                "error": "No faculty found"
            }), 400
        
        if not problem.rooms:
            return jsonify({
                "status": "failure",
                "schedule": [],
                "error": "No rooms found"
            }), 400
        
        if not problem.timeslots:
            return jsonify({
                "status": "failure",
                "schedule": [],
                "error": "No timeslots configured"
            }), 400
        
        # Initialize scheduler
        scheduler = SchedulerEngine(
            problem=problem,
            debug=debug_mode,
            max_retries=max_retries,
            time_limit_seconds=time_limit
        )
        
        # Solve with CSP backtracking
        result = scheduler.solve()
        
        if result.success:
            # Build response with exact format requested
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
                "status": "success",
                "schedule": schedule_output
            }), 200
        else:
            return jsonify({
                "status": "failure",
                "schedule": [],
                "error": result.error_message or "Could not find valid schedule"
            }), 422
            
    except Exception as e:
        logger.exception("Error in scheduler generate")
        return jsonify({
            "status": "failure",
            "schedule": [],
            "error": str(e)
        }), 500


@scheduler_bp.route('/generate-timetable', methods=['POST'])
@jwt_required()
def generate_timetable():
    """
    POST /generate-timetable
    
    Generate timetable using backtracking CSP solver with MRV, LCV, and Forward Checking.
    
    Request Body:
    {
        "department_id": int (optional),
        "debug": bool (optional, default false),
        "max_retries": int (optional, default 3),
        "time_limit_seconds": float (optional, default 300)
    }
    
    Response:
    {
        "status": "success" | "failure",
        "schedule": [...],
        "error": string | null,
        "conflicts": {...},
        "stats": {...}
    }
    """
    start_time = time.time()
    
    # Parse request
    data = request.get_json() or {}
    
    department_id = data.get('department_id')
    debug_mode = data.get('debug', False)
    max_retries = data.get('max_retries', 3)
    time_limit = data.get('time_limit_seconds', 300.0)
    
    # Validate department if provided
    if department_id:
        dept = db.session.get(Department, department_id)
        if not dept:
            return jsonify({
                "status": "failure",
                "error": f"Department {department_id} not found",
                "schedule": [],
                "conflicts": {},
                "stats": {}
            }), 404
    
    # Setup logging
    if debug_mode:
        logging.basicConfig(level=logging.DEBUG)
    
    try:
        # Load data
        emit_progress(department_id or 0, 5, "Loading data...")
        
        data_loader = DataLoader(department_id=department_id)
        problem = data_loader.load_problem()
        
        # Validate problem
        if not problem.sections:
            return jsonify({
                "status": "failure",
                "error": "No sections found to schedule",
                "schedule": [],
                "conflicts": {},
                "stats": {}
            }), 400
        
        if not problem.courses:
            return jsonify({
                "status": "failure",
                "error": "No courses found to schedule",
                "schedule": [],
                "conflicts": {},
                "stats": {}
            }), 400
        
        if not problem.faculty:
            return jsonify({
                "status": "failure",
                "error": "No faculty found",
                "schedule": [],
                "conflicts": {},
                "stats": {}
            }), 400
        
        if not problem.rooms:
            return jsonify({
                "status": "failure",
                "error": "No rooms found",
                "schedule": [],
                "conflicts": {},
                "stats": {}
            }), 400
        
        if not problem.timeslots:
            return jsonify({
                "status": "failure",
                "error": "No timeslots configured. Please set up schedule settings.",
                "schedule": [],
                "conflicts": {},
                "stats": {}
            }), 400
        
        # Initialize scheduler
        emit_progress(department_id or 0, 10, "Initializing scheduler...")
        
        scheduler = SchedulerEngine(
            problem=problem,
            debug=debug_mode,
            max_retries=max_retries,
            time_limit_seconds=time_limit
        )
        
        # Solve
        def progress_callback(pct, msg):
            emit_progress(department_id or 0, 10 + int(pct * 0.8), msg)
        
        result = scheduler.solve(progress_callback=progress_callback)
        
        # Save to database if successful
        if result.success:
            emit_progress(department_id or 0, 95, "Saving to database...")
            
            # Clear existing entries for this department
            if department_id:
                TimetableEntry.query.filter_by(department_id=department_id).delete()
            else:
                TimetableEntry.query.delete()
            
            # Create new entries
            for entry in result.schedule:
                timetable_entry = TimetableEntry(
                    day=entry.timeslot.day,
                    timeslot=f"{entry.timeslot.start_time}-{entry.timeslot.end_time}",
                    course_id=entry.course_id,
                    teacher_id=entry.faculty_id,
                    room_id=entry.room_id,
                    department_id=department_id
                )
                # Add section relationship
                from ..models import Section
                section = db.session.get(Section, entry.section_id)
                if section:
                    timetable_entry.sections.append(section)
                
                db.session.add(timetable_entry)
            
            db.session.commit()
            
            emit_progress(department_id or 0, 100, "Complete")
        
        # Build response
        response_data = result.to_dict()
        response_data['stats']['total_time_seconds'] = time.time() - start_time
        
        return jsonify(response_data), 200 if result.success else 422
        
    except Exception as e:
        logging.exception("Error in generate_timetable")
        return jsonify({
            "status": "failure",
            "error": str(e),
            "schedule": [],
            "conflicts": {},
            "stats": {"error_time": time.time() - start_time}
        }), 500


@scheduler_bp.route('/scheduler-stats', methods=['GET'])
@jwt_required()
def get_scheduler_stats():
    """
    Get statistics about the current scheduling configuration
    """
    data_loader = DataLoader()
    
    try:
        problem = data_loader.load_problem()
        
        # Calculate theoretical capacity
        total_timeslots = len(problem.timeslots)
        total_rooms = len(problem.rooms)
        total_faculty = len(problem.faculty)
        
        # Capacity per resource type
        room_capacity = total_timeslots * total_rooms
        faculty_capacity = sum(f.max_hours_per_week for f in problem.faculty)
        
        # Classes to schedule
        total_classes = sum(
            len(section.course_ids) for section in problem.sections
        )
        
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
        return jsonify({
            "status": "failure",
            "error": str(e)
        }), 500
