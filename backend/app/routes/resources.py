from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required

from io import BytesIO
import pandas as pd
from ..models import Department, Program, Batch, Section, Teacher, Course, Room
from .. import db
from .auth import roles_required

resources_bp = Blueprint('resources', __name__)

# ── Pagination helper ──────────────────────────────────────────────────────────

def paginate(query):
    """Apply ?page=1&per_page=20 pagination from request args."""
    page = request.args.get('page', 1, type=int)
    per_page = min(request.args.get('per_page', 20, type=int), 1000)  # capped at 1000 instead of 100
    result = query.paginate(page=page, per_page=per_page, error_out=False)
    return result


def pagination_meta(result):
    return {
        "page": result.page,
        "per_page": result.per_page,
        "total": result.total,
        "pages": result.pages,
    }


# ══════════════════════════════════════════════════════════════════════════════
# DEPARTMENTS
# ══════════════════════════════════════════════════════════════════════════════

@resources_bp.route('/departments', methods=['GET'])
@jwt_required()
def get_departments():
    result = paginate(Department.query.order_by(Department.name))
    items = [{'id': d.id, 'name': d.name, 'code': d.code} for d in result.items]
    return jsonify({"data": items, "meta": pagination_meta(result)}), 200


@resources_bp.route('/departments/<int:dept_id>', methods=['GET'])
@jwt_required()
def get_department(dept_id):
    d = db.session.get(Department, dept_id)
    if not d:
        return jsonify({'error': 'Department not found'}), 404
    return jsonify({'id': d.id, 'name': d.name, 'code': d.code}), 200


@resources_bp.route('/departments', methods=['POST'])
@roles_required('admin', 'dept_head')
def add_department():
    data = request.get_json()
    if not data:
        return jsonify({'error': 'Request body must be JSON'}), 400

    errors = []
    if not data.get('name') or len(str(data['name']).strip()) < 2:
        errors.append("name must be at least 2 characters")
    if not data.get('code') or len(str(data['code']).strip()) < 1:
        errors.append("code is required")
    if errors:
        return jsonify({'error': 'Validation failed', 'details': errors}), 422

    if Department.query.filter_by(code=data['code'].strip().upper()).first():
        return jsonify({'error': f"Department with code '{data['code']}' already exists"}), 409

    dept = Department(name=data['name'].strip(), code=data['code'].strip().upper())
    db.session.add(dept)
    db.session.commit()
    return jsonify({'message': 'Department added', 'id': dept.id, 'name': dept.name, 'code': dept.code}), 201


@resources_bp.route('/departments/<int:dept_id>', methods=['PUT'])
@roles_required('admin', 'dept_head')
def update_department(dept_id):
    dept = db.session.get(Department, dept_id)
    if not dept:
        return jsonify({'error': 'Department not found'}), 404

    data = request.get_json() or {}
    if 'name' in data:
        dept.name = data['name'].strip()
    if 'code' in data:
        new_code = data['code'].strip().upper()
        existing = Department.query.filter_by(code=new_code).first()
        if existing and existing.id != dept_id:
            return jsonify({'error': 'Code already in use by another department'}), 409
        dept.code = new_code

    db.session.commit()
    return jsonify({'message': 'Department updated', 'id': dept.id, 'name': dept.name, 'code': dept.code}), 200


@resources_bp.route('/departments/<int:dept_id>', methods=['DELETE'])
@roles_required('admin')
def delete_department(dept_id):
    dept = db.session.get(Department, dept_id)
    if not dept:
        return jsonify({'error': 'Department not found'}), 404
    db.session.delete(dept)
    db.session.commit()
    return jsonify({'message': 'Department deleted'}), 200


# ══════════════════════════════════════════════════════════════════════════════
# PROGRAMS
# ══════════════════════════════════════════════════════════════════════════════

@resources_bp.route('/programs', methods=['GET'])
@jwt_required()
def get_programs():
    query = Program.query
    dept_id = request.args.get('department_id', type=int)
    if dept_id:
        query = query.filter_by(department_id=dept_id)
    result = paginate(query.order_by(Program.name))
    items = [{'id': p.id, 'name': p.name, 'code': p.code, 'department_id': p.department_id} for p in result.items]
    return jsonify({"data": items, "meta": pagination_meta(result)}), 200


@resources_bp.route('/programs/<int:prog_id>', methods=['GET'])
@jwt_required()
def get_program(prog_id):
    p = db.session.get(Program, prog_id)
    if not p:
        return jsonify({'error': 'Program not found'}), 404
    return jsonify({'id': p.id, 'name': p.name, 'code': p.code, 'department_id': p.department_id}), 200


@resources_bp.route('/programs', methods=['POST'])
@roles_required('admin', 'dept_head')
def add_program():
    data = request.get_json()
    if not data:
        return jsonify({'error': 'Request body must be JSON'}), 400

    errors = []
    if not data.get('name'):
        errors.append("name is required")
    if not data.get('code'):
        errors.append("code is required")
    if not data.get('department_id'):
        errors.append("department_id is required")
    if errors:
        return jsonify({'error': 'Validation failed', 'details': errors}), 422

    dept = db.session.get(Department, data['department_id'])
    if not dept:
        return jsonify({'error': 'Department not found'}), 404
    if Program.query.filter_by(code=data['code'].strip()).first():
        return jsonify({'error': f"Program with code '{data['code']}' already exists"}), 409

    p = Program(name=data['name'].strip(), code=data['code'].strip(), department_id=data['department_id'])
    db.session.add(p)
    db.session.commit()
    return jsonify({'message': 'Program added', 'id': p.id}), 201


@resources_bp.route('/programs/<int:prog_id>', methods=['PUT'])
@roles_required('admin', 'dept_head')
def update_program(prog_id):
    p = db.session.get(Program, prog_id)
    if not p:
        return jsonify({'error': 'Program not found'}), 404

    data = request.get_json() or {}
    if 'name' in data:
        p.name = data['name'].strip()
    if 'code' in data:
        p.code = data['code'].strip()
    if 'department_id' in data:
        if not db.session.get(Department, data['department_id']):
            return jsonify({'error': 'Department not found'}), 404
        p.department_id = data['department_id']

    db.session.commit()
    return jsonify({'message': 'Program updated', 'id': p.id}), 200


@resources_bp.route('/programs/<int:prog_id>', methods=['DELETE'])
@roles_required('admin')
def delete_program(prog_id):
    p = db.session.get(Program, prog_id)
    if not p:
        return jsonify({'error': 'Program not found'}), 404
    db.session.delete(p)
    db.session.commit()
    return jsonify({'message': 'Program deleted'}), 200


# ══════════════════════════════════════════════════════════════════════════════
# BATCHES
# ══════════════════════════════════════════════════════════════════════════════

@resources_bp.route('/batches', methods=['GET'])
@jwt_required()
def get_batches():
    query = Batch.query
    prog_id = request.args.get('program_id', type=int)
    if prog_id:
        query = query.filter_by(program_id=prog_id)
    result = paginate(query.order_by(Batch.name))
    items = [
        {
            'id': b.id,
            'name': b.name,
            'code': b.code,
            'academic_year': b.academic_year,
            'program_id': b.program_id,
            'program_code': b.program.code if b.program else None,
            'section_count': len(b.sections),
        }
        for b in result.items
    ]
    return jsonify({"data": items, "meta": pagination_meta(result)}), 200


@resources_bp.route('/batches/<int:batch_id>', methods=['GET'])
@jwt_required()
def get_batch(batch_id):
    b = db.session.get(Batch, batch_id)
    if not b:
        return jsonify({'error': 'Batch not found'}), 404
    return jsonify({
        'id': b.id, 'name': b.name, 'code': b.code,
        'academic_year': b.academic_year, 'program_id': b.program_id,
        'program_code': b.program.code if b.program else None,
        'section_count': len(b.sections),
    }), 200


@resources_bp.route('/batches', methods=['POST'])
@roles_required('admin', 'dept_head')
def add_batch():
    data = request.get_json()
    if not data:
        return jsonify({'error': 'Request body must be JSON'}), 400

    errors = []
    if not data.get('name'):
        errors.append("name is required")
    if not data.get('academic_year'):
        errors.append("academic_year is required")
    if not data.get('program_id'):
        errors.append("program_id is required")
    if not data.get('code'):
        errors.append("code is required")
    if errors:
        return jsonify({'error': 'Validation failed', 'details': errors}), 422

    if Batch.query.filter_by(code=data['code'].strip()).first():
        return jsonify({'error': f"Batch code '{data['code']}' already exists"}), 409

    if not db.session.get(Program, data['program_id']):
        return jsonify({'error': 'Program not found'}), 404

    b = Batch(
        name=data['name'].strip(), 
        code=data['code'].strip(),
        academic_year=data['academic_year'].strip(), 
        program_id=data['program_id']
    )
    db.session.add(b)
    db.session.commit()
    return jsonify({'message': 'Batch added', 'id': b.id}), 201


@resources_bp.route('/batches/<int:batch_id>', methods=['PUT'])
@roles_required('admin', 'dept_head')
def update_batch(batch_id):
    b = db.session.get(Batch, batch_id)
    if not b:
        return jsonify({'error': 'Batch not found'}), 404

    data = request.get_json() or {}
    if 'name' in data:
        b.name = data['name'].strip()
    if 'code' in data:
        existing = Batch.query.filter_by(code=data['code'].strip()).first()
        if existing and existing.id != batch_id:
            return jsonify({'error': 'Batch code already in use'}), 409
        b.code = data['code'].strip()
    if 'academic_year' in data:
        b.academic_year = data['academic_year'].strip()
    if 'program_id' in data:
        if not db.session.get(Program, data['program_id']):
            return jsonify({'error': 'Program not found'}), 404
        b.program_id = data['program_id']

    db.session.commit()
    return jsonify({'message': 'Batch updated', 'id': b.id}), 200


@resources_bp.route('/batches/<int:batch_id>', methods=['DELETE'])
@roles_required('admin')
def delete_batch(batch_id):
    b = db.session.get(Batch, batch_id)
    if not b:
        return jsonify({'error': 'Batch not found'}), 404
    db.session.delete(b)
    db.session.commit()
    return jsonify({'message': 'Batch deleted'}), 200


# ══════════════════════════════════════════════════════════════════════════════
# SECTIONS
# ══════════════════════════════════════════════════════════════════════════════

@resources_bp.route('/sections', methods=['GET'])
@jwt_required()
def get_sections():
    query = Section.query
    batch_id = request.args.get('batch_id', type=int)
    if batch_id:
        query = query.filter_by(batch_id=batch_id)
    result = paginate(query.order_by(Section.name))
    items = [{'id': s.id, 'name': s.name, 'student_count': s.student_count, 'batch_id': s.batch_id} for s in result.items]
    return jsonify({"data": items, "meta": pagination_meta(result)}), 200


@resources_bp.route('/sections/<int:section_id>', methods=['GET'])
@jwt_required()
def get_section(section_id):
    s = db.session.get(Section, section_id)
    if not s:
        return jsonify({'error': 'Section not found'}), 404
    return jsonify({'id': s.id, 'name': s.name, 'student_count': s.student_count, 'batch_id': s.batch_id}), 200


@resources_bp.route('/sections', methods=['POST'])
@roles_required('admin', 'dept_head')
def add_section():
    data = request.get_json()
    if not data:
        return jsonify({'error': 'Request body must be JSON'}), 400

    errors = []
    if not data.get('name'):
        errors.append("name is required")
    if not data.get('batch_id'):
        errors.append("batch_id is required")
    if errors:
        return jsonify({'error': 'Validation failed', 'details': errors}), 422

    if not db.session.get(Batch, data['batch_id']):
        return jsonify({'error': 'Batch not found'}), 404

    student_count = data.get('student_count', 40)
    if not isinstance(student_count, int) or student_count < 1:
        return jsonify({'error': 'student_count must be a positive integer'}), 422

    s = Section(name=data['name'].strip(), batch_id=data['batch_id'], student_count=student_count)
    db.session.add(s)
    db.session.commit()
    return jsonify({'message': 'Section added', 'id': s.id}), 201


@resources_bp.route('/sections/<int:section_id>', methods=['PUT'])
@roles_required('admin', 'dept_head')
def update_section(section_id):
    s = db.session.get(Section, section_id)
    if not s:
        return jsonify({'error': 'Section not found'}), 404

    data = request.get_json() or {}
    if 'name' in data:
        s.name = data['name'].strip()
    if 'student_count' in data:
        s.student_count = data['student_count']
    if 'batch_id' in data:
        if not db.session.get(Batch, data['batch_id']):
            return jsonify({'error': 'Batch not found'}), 404
        s.batch_id = data['batch_id']

    db.session.commit()
    return jsonify({'message': 'Section updated', 'id': s.id}), 200


@resources_bp.route('/sections/<int:section_id>', methods=['DELETE'])
@roles_required('admin')
def delete_section(section_id):
    s = db.session.get(Section, section_id)
    if not s:
        return jsonify({'error': 'Section not found'}), 404
    db.session.delete(s)
    db.session.commit()
    return jsonify({'message': 'Section deleted'}), 200


# ══════════════════════════════════════════════════════════════════════════════
# TEACHERS
# ══════════════════════════════════════════════════════════════════════════════

def _teacher_dict(t):
    return {
        'id': t.id,
        'name': t.name,
        'email': t.email,
        'availability': t.availability,
        'departments': [{'id': d.id, 'name': d.name} for d in t.departments],
        'qualified_courses': [{'id': c.id, 'name': c.name, 'code': c.code} for c in t.qualified_courses],
    }


@resources_bp.route('/teachers', methods=['GET'])
@jwt_required()
def get_teachers():
    query = Teacher.query
    dept_id = request.args.get('department_id', type=int)
    if dept_id:
        dept = db.session.get(Department, dept_id)
        if not dept:
            return jsonify({'error': 'Department not found'}), 404
        query = dept.teachers  # already a dynamic query
    result = paginate(query.order_by(Teacher.name))
    return jsonify({"data": [_teacher_dict(t) for t in result.items], "meta": pagination_meta(result)}), 200


@resources_bp.route('/teachers/<int:teacher_id>', methods=['GET'])
@jwt_required()
def get_teacher(teacher_id):
    t = db.session.get(Teacher, teacher_id)
    if not t:
        return jsonify({'error': 'Teacher not found'}), 404
    return jsonify(_teacher_dict(t)), 200


@resources_bp.route('/teachers', methods=['POST'])
@roles_required('admin', 'dept_head')
def add_teacher():
    data = request.get_json()
    if not data:
        return jsonify({'error': 'Request body must be JSON'}), 400

    errors = []
    if not data.get('name') or len(str(data['name']).strip()) < 2:
        errors.append("name must be at least 2 characters")
    if not data.get('email') or '@' not in data['email']:
        errors.append("valid email is required")
    if errors:
        return jsonify({'error': 'Validation failed', 'details': errors}), 422

    if Teacher.query.filter_by(email=data['email'].lower().strip()).first():
        return jsonify({'error': 'A teacher with this email already exists'}), 409

    teacher = Teacher(
        name=data['name'].strip(),
        email=data['email'].lower().strip(),
        availability=data.get('availability')
    )

    for d_id in data.get('department_ids', []):
        dept = db.session.get(Department, d_id)
        if dept:
            teacher.departments.append(dept)

    db.session.add(teacher)
    db.session.commit()
    return jsonify({'message': 'Teacher added', 'id': teacher.id, 'teacher': _teacher_dict(teacher)}), 201


@resources_bp.route('/teachers/<int:teacher_id>', methods=['PUT'])
@roles_required('admin', 'dept_head')
def update_teacher(teacher_id):
    teacher = db.session.get(Teacher, teacher_id)
    if not teacher:
        return jsonify({'error': 'Teacher not found'}), 404

    data = request.get_json() or {}
    if 'name' in data:
        teacher.name = data['name'].strip()
    if 'email' in data:
        new_email = data['email'].lower().strip()
        existing = Teacher.query.filter_by(email=new_email).first()
        if existing and existing.id != teacher_id:
            return jsonify({'error': 'Email already in use by another teacher'}), 409
        teacher.email = new_email
    if 'availability' in data:
        teacher.availability = data['availability']
    if 'department_ids' in data:
        teacher.departments = []
        for d_id in data['department_ids']:
            dept = db.session.get(Department, d_id)
            if dept:
                teacher.departments.append(dept)

    db.session.commit()
    return jsonify({'message': 'Teacher updated', 'teacher': _teacher_dict(teacher)}), 200


@resources_bp.route('/teachers/<int:teacher_id>', methods=['DELETE'])
@roles_required('admin')
def delete_teacher(teacher_id):
    teacher = db.session.get(Teacher, teacher_id)
    if not teacher:
        return jsonify({'error': 'Teacher not found'}), 404
    db.session.delete(teacher)
    db.session.commit()
    return jsonify({'message': 'Teacher deleted'}), 200


@resources_bp.route('/teachers/<int:teacher_id>/qualifications', methods=['POST'])
@roles_required('admin', 'dept_head')
def assign_expertise(teacher_id):
    data = request.get_json()
    if not data or not data.get('course_id'):
        return jsonify({'error': 'course_id is required'}), 422

    teacher = db.session.get(Teacher, teacher_id)
    if not teacher:
        return jsonify({'error': 'Teacher not found'}), 404
    course = db.session.get(Course, data['course_id'])
    if not course:
        return jsonify({'error': 'Course not found'}), 404

    if course not in teacher.qualified_courses:
        teacher.qualified_courses.append(course)
        db.session.commit()

    return jsonify({'message': f'{teacher.name} is now qualified for {course.name}'}), 200


@resources_bp.route('/teachers/<int:teacher_id>/qualifications/<int:course_id>', methods=['DELETE'])
@roles_required('admin', 'dept_head')
def remove_expertise(teacher_id, course_id):
    teacher = db.session.get(Teacher, teacher_id)
    if not teacher:
        return jsonify({'error': 'Teacher not found'}), 404
    course = db.session.get(Course, course_id)
    if not course:
        return jsonify({'error': 'Course not found'}), 404

    if course in teacher.qualified_courses:
        teacher.qualified_courses.remove(course)
        db.session.commit()

    return jsonify({'message': f'Qualification removed'}), 200


# ══════════════════════════════════════════════════════════════════════════════
# COURSES
# ══════════════════════════════════════════════════════════════════════════════

def _course_dict(c):
    return {
        'id': c.id,
        'name': c.name,
        'code': c.code,
        'semester': c.semester,
        'course_type': c.course_type,
        'department_id': c.department_id,
        'program_code': c.program_code,
        'department_code': c.department_code,
    }


@resources_bp.route('/courses', methods=['GET'])
@jwt_required()
def get_courses():
    query = Course.query
    dept_id = request.args.get('department_id', type=int)
    if dept_id:
        query = query.filter_by(department_id=dept_id)
    result = paginate(query.order_by(Course.name))
    return jsonify({"data": [_course_dict(c) for c in result.items], "meta": pagination_meta(result)}), 200


@resources_bp.route('/courses/<int:course_id>', methods=['GET'])
@jwt_required()
def get_course(course_id):
    c = db.session.get(Course, course_id)
    if not c:
        return jsonify({'error': 'Course not found'}), 404
    return jsonify(_course_dict(c)), 200


@resources_bp.route('/courses', methods=['POST'])
@roles_required('admin', 'dept_head')
def add_course():
    data = request.get_json()
    if not data:
        return jsonify({'error': 'Request body must be JSON'}), 400

    errors = []
    if not data.get('name'):
        errors.append("name is required")
    if not data.get('code'):
        errors.append("code is required")
    if not data.get('department_id'):
        errors.append("department_id is required")
    if data.get('course_type') and data['course_type'] not in ('Theory', 'Lab'):
        errors.append("course_type must be 'Theory' or 'Lab'")
    if errors:
        return jsonify({'error': 'Validation failed', 'details': errors}), 422

    if not db.session.get(Department, data['department_id']):
        return jsonify({'error': 'Department not found'}), 404
    if Course.query.filter_by(code=data['code'].strip()).first():
        return jsonify({'error': f"Course with code '{data['code']}' already exists"}), 409

    c = Course(
        name=data['name'].strip(),
        code=data['code'].strip(),
        semester=data.get('semester', 1),
        course_type=data.get('course_type', 'Theory'),
        department_id=data['department_id']
    )
    db.session.add(c)
    db.session.commit()
    return jsonify({'message': 'Course added', 'id': c.id, 'course': _course_dict(c)}), 201


@resources_bp.route('/courses/<int:course_id>', methods=['PUT'])
@roles_required('admin', 'dept_head')
def update_course(course_id):
    c = db.session.get(Course, course_id)
    if not c:
        return jsonify({'error': 'Course not found'}), 404

    data = request.get_json() or {}
    if 'name' in data:
        c.name = data['name'].strip()
    if 'code' in data:
        existing = Course.query.filter_by(code=data['code'].strip()).first()
        if existing and existing.id != course_id:
            return jsonify({'error': 'Course code already in use'}), 409
        c.code = data['code'].strip()
    if 'semester' in data:
        c.semester = data['semester']
    if 'course_type' in data:
        if data['course_type'] not in ('Theory', 'Lab'):
            return jsonify({'error': "course_type must be 'Theory' or 'Lab'"}), 422
        c.course_type = data['course_type']
    if 'department_id' in data:
        if not db.session.get(Department, data['department_id']):
            return jsonify({'error': 'Department not found'}), 404
        c.department_id = data['department_id']

    db.session.commit()
    return jsonify({'message': 'Course updated', 'course': _course_dict(c)}), 200


@resources_bp.route('/courses/<int:course_id>', methods=['DELETE'])
@roles_required('admin')
def delete_course(course_id):
    c = db.session.get(Course, course_id)
    if not c:
        return jsonify({'error': 'Course not found'}), 404
    db.session.delete(c)
    db.session.commit()
    return jsonify({'message': 'Course deleted'}), 200


# ══════════════════════════════════════════════════════════════════════════════
# ROOMS
# ══════════════════════════════════════════════════════════════════════════════

def _room_dict(r):
    return {
        'id': r.id, 
        'name': r.name, 
        'capacity': r.capacity, 
        'room_type': r.room_type,
        'department_id': r.department_id,
        'program_id': r.program_id
    }


@resources_bp.route('/rooms', methods=['GET'])
@jwt_required()
def get_rooms():
    query = Room.query
    room_type = request.args.get('room_type')
    if room_type:
        query = query.filter_by(room_type=room_type)
    result = paginate(query.order_by(Room.name))
    return jsonify({"data": [_room_dict(r) for r in result.items], "meta": pagination_meta(result)}), 200


@resources_bp.route('/rooms/<int:room_id>', methods=['GET'])
@jwt_required()
def get_room(room_id):
    r = db.session.get(Room, room_id)
    if not r:
        return jsonify({'error': 'Room not found'}), 404
    return jsonify(_room_dict(r)), 200


@resources_bp.route('/rooms', methods=['POST'])
@roles_required('admin')
def add_room():
    data = request.get_json()
    if not data:
        return jsonify({'error': 'Request body must be JSON'}), 400

    errors = []
    if not data.get('name'):
        errors.append("name is required")
    if not data.get('capacity') or not isinstance(data['capacity'], int) or data['capacity'] < 1:
        errors.append("capacity must be a positive integer")
    if errors:
        return jsonify({'error': 'Validation failed', 'details': errors}), 422

    room_type = data.get('room_type', 'Classroom')
    program_id = data.get('program_id')
    if room_type and str(room_type).lower() == 'lab' and not program_id:
        return jsonify({'error': 'Validation failed', 'details': ['program_id is required for lab rooms']}), 422
    if program_id and not db.session.get(Program, program_id):
        return jsonify({'error': 'Program not found'}), 404

    if Room.query.filter_by(name=data['name'].strip()).first():
        return jsonify({'error': f"Room '{data['name']}' already exists"}), 409

    r = Room(
        name=data['name'].strip(),
        capacity=data['capacity'],
        room_type=room_type,
        department_id=data.get('department_id'),
        program_id=program_id
    )
    db.session.add(r)
    db.session.commit()
    return jsonify({'message': 'Room added', 'id': r.id, 'room': _room_dict(r)}), 201


@resources_bp.route('/rooms/<int:room_id>', methods=['PUT'])
@roles_required('admin')
def update_room(room_id):
    r = db.session.get(Room, room_id)
    if not r:
        return jsonify({'error': 'Room not found'}), 404

    data = request.get_json() or {}
    if 'name' in data:
        existing = Room.query.filter_by(name=data['name'].strip()).first()
        if existing and existing.id != room_id:
            return jsonify({'error': 'Room name already in use'}), 409
        r.name = data['name'].strip()
    if 'capacity' in data:
        r.capacity = data['capacity']
    if 'room_type' in data:
        r.room_type = data['room_type']
    if 'department_id' in data:
        r.department_id = data['department_id']
    if 'program_id' in data:
        if data['program_id'] and not db.session.get(Program, data['program_id']):
            return jsonify({'error': 'Program not found'}), 404
        r.program_id = data['program_id']

    # Lab rooms must stay program-scoped.
    final_room_type = (data.get('room_type', r.room_type) or '').lower()
    final_program_id = data.get('program_id', r.program_id)
    if final_room_type == 'lab' and not final_program_id:
        return jsonify({'error': 'Validation failed', 'details': ['program_id is required for lab rooms']}), 422

    db.session.commit()
    return jsonify({'message': 'Room updated', 'room': _room_dict(r)}), 200


@resources_bp.route('/rooms/<int:room_id>', methods=['DELETE'])
@roles_required('admin')
def delete_room(room_id):
    r = db.session.get(Room, room_id)
    if not r:
        return jsonify({'error': 'Room not found'}), 404
    db.session.delete(r)
    db.session.commit()
    return jsonify({'message': 'Room deleted'}), 200


# ══════════════════════════════════════════════════════════════════════════════
# BULK IMPORT ROUTES
# ══════════════════════════════════════════════════════════════════════════════

def _bulk_import_logic(file, model_class, field_mapping, unique_field=None, lookup_configs=None):
    if not file:
        return {"error": "No file uploaded"}, 400
    
    try:
        df = pd.read_excel(BytesIO(file.read()))
        success = 0
        errors = []
        
        for index, row in df.iterrows():
            try:
                data = {}
                # Handle standard field mapping
                for model_field, excel_field in field_mapping.items():
                    val = row.get(excel_field)
                    if pd.isna(val):
                        val = None
                    data[model_field] = val
                
                # Handle lookup configs (e.g., ProgramCode -> program_id)
                if lookup_configs:
                    for model_field, (ref_model, ref_field, excel_field) in lookup_configs.items():
                        lookup_val = row.get(excel_field)
                        if pd.isna(lookup_val):
                            raise Exception(f"Missing required field '{excel_field}'")
                        
                        ref_obj = ref_model.query.filter(getattr(ref_model, ref_field) == str(lookup_val).strip()).first()
                        if not ref_obj:
                            raise Exception(f"{ref_model.__name__} was not found with {ref_field}='{lookup_val}'")
                        
                        data[model_field] = ref_obj.id
                
                # Check for uniqueness if required
                if unique_field and data.get(unique_field):
                    existing = model_class.query.filter_by(**{unique_field: data[unique_field]}).first()
                    if existing:
                        success += 1 # Count as skip/update? For now just skip
                        continue
                
                obj = model_class(**data)
                db.session.add(obj)
                success += 1
            except Exception as e:
                errors.append(f"Row {index+2}: {str(e)}")
        
        db.session.commit()
        return {"message": f"Successfully processed {success} items", "errors": errors}, 200
    except Exception as e:
        db.session.rollback()
        return {"error": f"Failed to process file: {str(e)}"}, 500

@resources_bp.route('/departments/import', methods=['POST'])
@roles_required('admin')
def import_departments():
    file = request.files.get('file')
    result, status = _bulk_import_logic(file, Department, {'name': 'Name', 'code': 'Code'}, 'code')
    return jsonify(result), status

@resources_bp.route('/programs/import', methods=['POST'])
@roles_required('admin')
def bulk_import_programs():
    file = request.files.get('file')
    res, status = _bulk_import_logic(
        file, 
        Program, 
        {'name': 'Name', 'code': 'Code'}, 
        'code',
        lookup_configs={'department_id': (Department, 'code', 'DeptCode')}
    )
    return jsonify(res), status

@resources_bp.route('/batches/import', methods=['POST'])
@roles_required('admin')
def bulk_import_batches():
    file = request.files.get('file')
    res, status = _bulk_import_logic(
        file, 
        Batch, 
        {'name': 'Name', 'code': 'Code', 'academic_year': 'Year'}, 
        'code',
        lookup_configs={'program_id': (Program, 'code', 'ProgramCode')}
    )
    return jsonify(res), status

@resources_bp.route('/sections/import', methods=['POST'])
@roles_required('admin')
def bulk_import_sections():
    file = request.files.get('file')
    res, status = _bulk_import_logic(
        file, 
        Section, 
        {'name': 'Name', 'student_count': 'Count'}, 
        None,
        lookup_configs={'batch_id': (Batch, 'code', 'BatchCode')}
    )
    return jsonify(res), status

@resources_bp.route('/teachers/import', methods=['POST'])
@roles_required('admin')
def bulk_import_teachers():
    file = request.files.get('file')
    if not file:
        return jsonify({"error": "No file uploaded"}), 400
    
    try:
        df = pd.read_excel(BytesIO(file.read()))
        # Normalize column names to lowercase to be more flexible
        df.columns = [c.lower().strip() for c in df.columns]
        
        success = 0
        errors = []
        
        for index, row in df.iterrows():
            try:
                name = row.get('name')
                email = row.get('email')
                phone = row.get('phone')
                
                if pd.isna(name) or pd.isna(email):
                    continue
                
                t = Teacher.query.filter_by(email=str(email).strip()).first()
                if not t:
                    t = Teacher(name=str(name).strip(), email=str(email).strip(), phone=str(phone).strip() if pd.notna(phone) else None)
                    db.session.add(t)
                else:
                    if pd.notna(phone):
                        t.phone = str(phone).strip()
                
                # Resolve Departments by codes (e.g., "CS, ME, MATH" or "CS;ME;MATH")
                dept_codes_val = row.get('department_codes')
                if pd.notna(dept_codes_val):
                    # Support both comma and semicolon separators
                    codes = [c.strip() for c in str(dept_codes_val).replace(';', ',').split(',') if c.strip()]
                    for code in codes:
                        dept = Department.query.filter_by(code=code).first()
                        if dept and dept not in t.departments:
                            t.departments.append(dept)
                
                # Handle Course Qualifications (e.g., "CS101,MATH201,PHY303" or "CS101;MATH201;PHY303")
                course_codes_val = row.get('course_codes')
                if pd.notna(course_codes_val):
                    # Support both comma and semicolon separators
                    course_codes = [c.strip() for c in str(course_codes_val).replace(';', ',').split(',') if c.strip()]
                    for course_code in course_codes:
                        course = Course.query.filter_by(code=course_code).first()
                        if course and course not in t.qualified_courses:
                            t.qualified_courses.append(course)
                
                success += 1
            except Exception as e:
                errors.append(f"Row {index+2}: {str(e)}")
        
        db.session.commit()
        return jsonify({"message": f"Successfully processed {success} teachers", "errors": errors}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": f"Failed to process file: {str(e)}"}), 500

@resources_bp.route('/courses/import', methods=['POST'])
@roles_required('admin')
def bulk_import_courses():
    file = request.files.get('file')
    # Update mapping to including semester string and department code from excel file
    res, status = _bulk_import_logic(
        file, 
        Course, 
        {
            'name': 'Name', 
            'code': 'code', 
            'semester_name': 'Semester', 
            'course_type': 'Type', 
            'program_code': 'Program', 
            'department_code': 'DeptCode'
        }, 
        None, # allow duplicates during import
        lookup_configs={'department_id': (Department, 'code', 'DeptCode')}
    )
    return jsonify(res), status

@resources_bp.route('/rooms/import', methods=['POST'])
@roles_required('admin')
def import_rooms():
    file = request.files.get('file')
    if not file:
        return jsonify({"error": "No file uploaded"}), 400

    try:
        df = pd.read_excel(BytesIO(file.read()))
        df.columns = [c.strip() for c in df.columns]

        success = 0
        errors = []

        for index, row in df.iterrows():
            try:
                name = row.get('Name')
                capacity = row.get('Capacity')
                room_type = row.get('Type', 'Classroom')
                dept_code = row.get('Department Code')
                program_code = row.get('Program Code')

                if pd.isna(name) or pd.isna(capacity):
                    raise Exception("Missing Name or Capacity")

                existing = Room.query.filter_by(name=str(name).strip()).first()
                if existing:
                    success += 1
                    continue

                department_id = None
                if pd.notna(dept_code):
                    dept = Department.query.filter_by(code=str(dept_code).strip()).first()
                    if not dept:
                        raise Exception(f"Department was not found with code='{dept_code}'")
                    department_id = dept.id

                program_id = None
                if pd.notna(program_code):
                    program = Program.query.filter_by(code=str(program_code).strip()).first()
                    if not program:
                        raise Exception(f"Program was not found with code='{program_code}'")
                    program_id = program.id

                if str(room_type).strip().lower() == 'lab' and not program_id:
                    raise Exception("Program Code is required for lab rooms")

                room = Room(
                    name=str(name).strip(),
                    capacity=int(capacity),
                    room_type=str(room_type).strip(),
                    department_id=department_id,
                    program_id=program_id
                )
                db.session.add(room)
                success += 1
            except Exception as e:
                errors.append(f"Row {index+2}: {str(e)}")

        db.session.commit()
        return jsonify({"message": f"Successfully processed {success} rooms", "errors": errors}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": f"Failed to process file: {str(e)}"}), 500

