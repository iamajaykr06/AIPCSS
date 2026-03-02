from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required

from ..models import Workload, Teacher, Course, Section, Room, TimetableEntry, Department
from .. import db, socketio
from .auth import roles_required

scheduling_bp = Blueprint('scheduling', __name__)

DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
TIMESLOTS = ['09:00-10:00', '10:00-11:00', '11:00-12:00', '01:00-02:00', '02:00-03:00']


# ══════════════════════════════════════════════════════════════════════════════
# DASHBOARD STATS
# ══════════════════════════════════════════════════════════════════════════════

@scheduling_bp.route('/stats', methods=['GET'])
@jwt_required()
def get_scheduling_stats():
    """Get global scheduling statistics for the dashboard."""
    total_entries = TimetableEntry.query.count()
    
    # Conflict detection logic (simplified for stats)
    # We find all (day, slot, teacher) etc that appear more than once
    conflicts = 0
    
    # Teacher overlaps
    teacher_overlaps = db.session.query(
        TimetableEntry.day, TimetableEntry.timeslot, TimetableEntry.teacher_id
    ).group_by(
        TimetableEntry.day, TimetableEntry.timeslot, TimetableEntry.teacher_id
    ).having(db.func.count() > 1).all()
    conflicts += len(teacher_overlaps)
    
    # Room overlaps
    room_overlaps = db.session.query(
        TimetableEntry.day, TimetableEntry.timeslot, TimetableEntry.room_id
    ).group_by(
        TimetableEntry.day, TimetableEntry.timeslot, TimetableEntry.room_id
    ).having(db.func.count() > 1).all()
    conflicts += len(room_overlaps)
    
    # Section overlaps (Manual check via relationship since it's M2M now)
    # Finding entries that share the same slot and have overlapping sections
    # Simplified: count how many entries have sections in the same slot
    # (Actually, the most accurate is to count unique (day, slot, section))
    from ..models.timetable import entry_sections
    section_overlaps = db.session.query(
        TimetableEntry.day, TimetableEntry.timeslot, entry_sections.c.section_id
    ).join(entry_sections).group_by(
        TimetableEntry.day, TimetableEntry.timeslot, entry_sections.c.section_id
    ).having(db.func.count() > 1).all()
    conflicts += len(section_overlaps)

    # Course type distribution
    course_data = db.session.query(
        Course.course_type, db.func.count(TimetableEntry.id)
    ).join(TimetableEntry, Course.id == TimetableEntry.course_id).group_by(Course.course_type).all()
    
    course_type_dist = [{'name': t, 'value': c} for t, c in course_data]

    # Room capacity distribution
    rooms = Room.query.all()
    room_caps = {
        'Small (1-20)': 0,
        'Medium (21-50)': 0,
        'Large (51+)': 0
    }
    for r in rooms:
        if r.capacity <= 20: room_caps['Small (1-20)'] += 1
        elif r.capacity <= 50: room_caps['Medium (21-50)'] += 1
        else: room_caps['Large (51+)'] += 1
    
    room_dist = [{'name': k, 'value': v} for k, v in room_caps.items()]

    return jsonify({
        'total_entries': total_entries,
        'conflicts': conflicts,
        'optimization': max(0, 100 - (conflicts * 5)) if total_entries > 0 else 100,
        'course_type_dist': course_type_dist,
        'room_dist': room_dist
    }), 200


# ══════════════════════════════════════════════════════════════════════════════
# WORKLOAD MANAGEMENT
# ══════════════════════════════════════════════════════════════════════════════

@scheduling_bp.route('/workloads', methods=['GET'])
@jwt_required()
def get_workloads():
    """List all workloads, optionally filtered by section or teacher."""
    query = Workload.query
    section_id = request.args.get('section_id', type=int)
    teacher_id = request.args.get('teacher_id', type=int)
    if section_id:
        query = query.filter_by(section_id=section_id)
    if teacher_id:
        query = query.filter_by(teacher_id=teacher_id)

    workloads = query.all()
    result = []
    for w in workloads:
        teacher = db.session.get(Teacher, w.teacher_id)
        course = db.session.get(Course, w.course_id)
        section = db.session.get(Section, w.section_id)
        result.append({
            'id': w.id,
            'teacher': {'id': teacher.id, 'name': teacher.name} if teacher else None,
            'course': {'id': course.id, 'name': course.name, 'code': course.code} if course else None,
            'section': {'id': section.id, 'name': section.name} if section else None,
            'hours_per_week': w.hours_per_week,
            'session_duration': w.session_duration
        })
    return jsonify({'data': result}), 200


@scheduling_bp.route('/workloads', methods=['POST'])
@roles_required('admin', 'dept_head')
def create_workload():
    """
    Assigns a teacher to a course for a specific section.
    Validates that the teacher is qualified for the course.
    """
    data = request.get_json()
    if not data:
        return jsonify({'error': 'Request body must be JSON'}), 400

    errors = []
    if not data.get('teacher_id'):
        errors.append("teacher_id is required")
    if not data.get('course_id'):
        errors.append("course_id is required")
    if not data.get('section_id'):
        errors.append("section_id is required")
    if errors:
        return jsonify({'error': 'Validation failed', 'details': errors}), 422

    teacher = db.session.get(Teacher, data['teacher_id'])
    if not teacher:
        return jsonify({'error': 'Teacher not found'}), 404

    course = db.session.get(Course, data['course_id'])
    if not course:
        return jsonify({'error': 'Course not found'}), 404

    section = db.session.get(Section, data['section_id'])
    if not section:
        return jsonify({'error': 'Section not found'}), 404

    # Domain protection: teacher must be qualified
    if course not in teacher.qualified_courses:
        return jsonify({
            'error': f"Teacher '{teacher.name}' is not qualified to teach '{course.name}'. "
                     f"Assign the qualification first via POST /api/resources/teachers/{teacher.id}/qualifications"
        }), 400

    # Prevent duplicate workload assignment
    existing = Workload.query.filter_by(
        teacher_id=data['teacher_id'],
        course_id=data['course_id'],
        section_id=data['section_id']
    ).first()
    if existing:
        return jsonify({'error': 'This workload assignment already exists'}), 409

    hours = data.get('hours_per_week', 4)
    if not isinstance(hours, int) or hours < 1 or hours > 20:
        return jsonify({'error': 'hours_per_week must be an integer between 1 and 20'}), 422

    duration = data.get('session_duration', 1)
    if not isinstance(duration, int) or duration < 1 or duration > 4:
        return jsonify({'error': 'session_duration must be between 1 and 4'}), 422

    new_workload = Workload(
        teacher_id=data['teacher_id'],
        course_id=data['course_id'],
        section_id=data['section_id'],
        hours_per_week=hours,
        session_duration=duration
    )
    db.session.add(new_workload)
    db.session.commit()

    return jsonify({'message': 'Workload assigned successfully', 'id': new_workload.id}), 201


@scheduling_bp.route('/workloads/<int:workload_id>', methods=['DELETE'])
@roles_required('admin', 'dept_head')
def delete_workload(workload_id):
    w = db.session.get(Workload, workload_id)
    if not w:
        return jsonify({'error': 'Workload not found'}), 404
    db.session.delete(w)
    db.session.commit()
    return jsonify({'message': 'Workload deleted'}), 200


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


# ══════════════════════════════════════════════════════════════════════════════
# TIMETABLE GENERATION
# ══════════════════════════════════════════════════════════════════════════════

@scheduling_bp.route('/generate', methods=['POST'])
@roles_required('admin', 'dept_head')
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
        return jsonify({'error': 'Request body must be JSON'}), 400

    dept_id = data.get('department_id')
    if not dept_id:
        return jsonify({'error': 'department_id is required'}), 422

    dept = db.session.get(Department, dept_id)
    if not dept:
        return jsonify({'error': 'Department not found'}), 404

    # Clear existing schedule for this department
    TimetableEntry.query.filter_by(department_id=dept_id).delete()

    # Pre-load all rooms once (avoid repeated queries per slot)
    all_rooms = Room.query.all()

    total_sections = sum(len(b.sections) for p in dept.programs for b in p.batches)
    processed_sections = 0
    successful_entries = 0
    skipped = []
    errors = []

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
        is_lab_room = 'lab' in room.room_type.lower()
        is_lab_course = course.course_type == 'Lab'
        if is_lab_course and not is_lab_room:
            return 0   # Lab course MUST be in a lab — hard constraint
        if is_lab_course and is_lab_room:
            score += 20
        elif not is_lab_course and not is_lab_room:
            score += 10   # Theory in classroom — ideal
        else:
            score += 3    # Theory in a lab — acceptable but wasteful

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
    for program in dept.programs:
        for batch in program.batches:
            for section in batch.sections:
                processed_sections += 1
                progress = int((processed_sections / max(1, total_sections)) * 100)
                socketio.emit('generation_progress', {
                    'percentage': progress,
                    'current_section': section.name,
                    'status': 'Generating...'
                })

                section_slot_map[section.id] = {}
                section_course_days[section.id] = {}
                workloads = Workload.query.filter_by(section_id=section.id).all()

                for workload in workloads:
                    teacher = db.session.get(Teacher, workload.teacher_id)
                    course = db.session.get(Course, workload.course_id)
                    duration = workload.session_duration or 1

                    if not teacher or not course:
                        errors.append(f"Missing teacher or course for workload id={workload.id}")
                        continue
                        
                    # Strict Rule: Lab classes must ALWAYS be consecutive for their entire weekly duration
                    if course.course_type == 'Lab':
                        duration = workload.hours_per_week
                        
                    section_course_days[section.id].setdefault(course.id, set())

                    allocated_hours = 0
                    # Try to allocate in blocks of 'duration'
                    while allocated_hours < workload.hours_per_week:
                        needed = min(duration, workload.hours_per_week - allocated_hours)
                        candidates = [] # scored blocks

                        for day in DAYS:
                            # Strict constraint: If this course is already scheduled on this day (and it's not a single continuous block we are currently placing), skip the day. 
                            # We only want 1 session of a specific course per day.
                            if day in section_course_days[section.id][course.id]:
                                continue
                                
                            # Start slot can only go up to (len - needed)
                            for i in range(len(TIMESLOTS) - needed + 1):
                                block_slots = TIMESLOTS[i:i+needed]
                                
                                # Availability check for entire block
                                if any(not is_teacher_available(teacher, day, s) for s in block_slots):
                                    continue
                                
                                # Find a room free for the ENTIRE block
                                best_room = None
                                max_room_score = 0
                                for room in all_rooms:
                                    rscore = get_room_score(room, course, section)
                                    if rscore == 0: continue
                                    
                                    if all(not check_conflicts(day, s, room_id=room.id) for s in block_slots):
                                        if rscore > max_room_score:
                                            max_room_score = rscore
                                            best_room = room
                                
                                if not best_room: continue

                                # Section and Teacher check for entire block
                                if any(check_conflicts(day, s, teacher_id=teacher.id, section_id=section.id) for s in block_slots):
                                    continue

                                # Score the block
                                base_score = max_room_score - gap_penalty(section.id, day, block_slots[0])
                                candidates.append({'day': day, 'slots': block_slots, 'room': best_room, 'score': base_score})

                        if not candidates:
                            # If we can't find a block of 'needed' size, try smaller (1h)
                            # Exception: Do not try smaller slots if it's a Lab course - they MUST be consecutive
                            if needed > 1 and course.course_type != 'Lab':
                                duration = 1 # fallback to 1h slots for the rest of this workload
                                continue
                            break 

                        # Pick the best block
                        best_cand = max(candidates, key=lambda x: x['score'])
                        for s in best_cand['slots']:
                            entry = TimetableEntry(
                                day=best_cand['day'],
                                timeslot=s,
                                course_id=workload.course_id,
                                teacher_id=workload.teacher_id,
                                room_id=best_cand['room'].id,
                                department_id=dept_id
                            )
                            entry.sections.append(section)
                            db.session.add(entry)
                            section_slot_map[section.id].setdefault(best_cand['day'], []).append(s)
                            section_course_days[section.id][course.id].add(best_cand['day'])
                            allocated_hours += 1
                            successful_entries += 1
                    
                    if allocated_hours < workload.hours_per_week:
                        skipped.append({
                            'course': course.name,
                            'section': section.name,
                            'allocated': allocated_hours,
                            'required': workload.hours_per_week,
                            'reason': 'Could not satisfy block constraints'
                        })

    db.session.commit()

    status = 'success' if not skipped and not errors else 'partial_success'
    return jsonify({
        'status': status,
        'entries_created': successful_entries,
        'incomplete_workloads': skipped,
        'errors': errors,
        'message': f'Generated {successful_entries} timetable entries for department {dept.name}'
    }), 200


# ══════════════════════════════════════════════════════════════════════════════
# TIMETABLE VIEWER
# ══════════════════════════════════════════════════════════════════════════════

@scheduling_bp.route('/view/<int:dept_id>', methods=['GET'])
@jwt_required()
def view_timetable(dept_id):
    """
    FIX: original made 4 extra DB queries per timetable entry (N+1 problem).
    Now loads all needed records up front with a single query each.
    """
    dept = db.session.get(Department, dept_id)
    if not dept:
        return jsonify({'error': 'Department not found'}), 404

    entries = TimetableEntry.query.filter_by(department_id=dept_id).all()
    if not entries:
        return jsonify({'data': [], 'message': 'No timetable generated yet for this department'}), 200

    # Pre-load all referenced records to avoid N+1 queries
    course_ids = {e.course_id for e in entries}
    teacher_ids = {e.teacher_id for e in entries}
    room_ids = {e.room_id for e in entries}

    courses = {c.id: c for c in Course.query.filter(Course.id.in_(course_ids)).all()}
    teachers = {t.id: t for t in Teacher.query.filter(Teacher.id.in_(teacher_ids)).all()}
    rooms = {r.id: r for r in Room.query.filter(Room.id.in_(room_ids)).all()}

    result = []
    for e in entries:
        result.append({
            'id': e.id,
            'day': e.day,
            'timeslot': e.timeslot,
            'sections': [{'id': s.id, 'name': s.name} for s in e.sections],
            'course': {'id': e.course_id, 'name': courses.get(e.course_id, {}).name if e.course_id in courses else 'Unknown',
                       'type': courses.get(e.course_id, {}).course_type if e.course_id in courses else None},
            'teacher': {'id': e.teacher_id, 'name': teachers.get(e.teacher_id, {}).name if e.teacher_id in teachers else 'Unknown'},
            'room': {'id': e.room_id, 'name': rooms.get(e.room_id, {}).name if e.room_id in rooms else 'Unknown',
                     'capacity': rooms.get(e.room_id, {}).capacity if e.room_id in rooms else None},
        })

    # Optional: group by section for easier frontend rendering
    group_by = request.args.get('group_by')
    if group_by == 'section':
        grouped = {}
        for entry in result:
            for s in entry['sections']:
                key = s['name']
                grouped.setdefault(key, []).append(entry)
        return jsonify({'data': grouped, 'department': dept.name}), 200

    return jsonify({'data': result, 'department': dept.name, 'total': len(result)}), 200


@scheduling_bp.route('/view/<int:dept_id>', methods=['DELETE'])
@roles_required('admin', 'dept_head')
def clear_timetable(dept_id):
    """Clear the generated timetable for a department so it can be regenerated."""
    dept = db.session.get(Department, dept_id)
    if not dept:
        return jsonify({'error': 'Department not found'}), 404

    deleted = TimetableEntry.query.filter_by(department_id=dept_id).delete()
    db.session.commit()
    return jsonify({'message': f'Cleared {deleted} timetable entries for {dept.name}'}), 200


@scheduling_bp.route('/entries', methods=['POST'])
@roles_required('admin', 'dept_head')
def create_timetable_entry():
    """Manually add a single timetable entry."""
    data = request.get_json()
    if not data:
        return jsonify({'error': 'Request body must be JSON'}), 400

    required = ['day', 'timeslot', 'section_id', 'course_id', 'teacher_id', 'room_id', 'department_id']
    for field in required:
        if field not in data:
            return jsonify({'error': f"'{field}' is required"}), 422

    # Check for conflicts
    conflicts = check_conflicts(
        data['day'], data['timeslot'],
        teacher_id=data['teacher_id'],
        room_id=data['room_id'],
        section_id=data['section_id']
    )
    if conflicts:
        return jsonify({'error': 'Conflict detected', 'details': conflicts}), 409

    entry = TimetableEntry(
        day=data['day'],
        timeslot=data['timeslot'],
        course_id=data['course_id'],
        teacher_id=data['teacher_id'],
        room_id=data['room_id'],
        department_id=data['department_id']
    )
    section = db.session.get(Section, data['section_id'])
    if section:
        entry.sections.append(section)
    db.session.add(entry)
    db.session.commit()

    return jsonify({'message': 'Timetable entry created', 'id': entry.id}), 201


@scheduling_bp.route('/entries/<int:entry_id>', methods=['DELETE'])
@roles_required('admin', 'dept_head')
def delete_timetable_entry(entry_id):
    """Delete a single timetable entry."""
    entry = db.session.get(TimetableEntry, entry_id)
    if not entry:
        return jsonify({'error': 'Entry not found'}), 404

    db.session.delete(entry)
    db.session.commit()
    return jsonify({'message': 'Timetable entry deleted'}), 200


@scheduling_bp.route('/entries/<int:entry_id>', methods=['PATCH'])
@roles_required('admin', 'dept_head')
def update_timetable_entry(entry_id):
    """Move or update a single timetable entry."""
    entry = db.session.get(TimetableEntry, entry_id)
    if not entry:
        return jsonify({'error': 'Entry not found'}), 404

    data = request.get_json()
    if not data:
        return jsonify({'error': 'No data provided'}), 400

    # If moving to new slot, check conflicts
    new_day = data.get('day', entry.day)
    new_slot = data.get('timeslot', entry.timeslot)
    new_room = data.get('room_id', entry.room_id)

    if any(k in data for k in ['day', 'timeslot', 'room_id']):
        conflicts = check_conflicts(
            new_day, new_slot,
            teacher_id=entry.teacher_id,
            room_id=new_room,
            section_id=entry.section_id,
            exclude_entry_id=entry.id
        )
        if conflicts:
            return jsonify({'error': 'Conflict detected', 'details': conflicts}), 409

    if 'day' in data: entry.day = data['day']
    if 'timeslot' in data: entry.timeslot = data['timeslot']
    if 'room_id' in data: entry.room_id = data['room_id']
    if 'teacher_id' in data: entry.teacher_id = data['teacher_id']
    if 'course_id' in data: entry.course_id = data['course_id']
    if 'section_id' in data:
        new_section = db.session.get(Section, data['section_id'])
        if new_section:
            entry.sections = [new_section] # Reset to single section for simple UI movement

    db.session.commit()
    return jsonify({'message': 'Entry updated'}), 200
