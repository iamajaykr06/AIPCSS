from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required

from .. import db
from ..models.program import Program
from ..models.course import Course
from ..models.batch import Batch
from .auth import roles_required

curriculum_bp = Blueprint('curriculum', __name__)

# ── Program Management ───────────────────────────────────────────────────────

@curriculum_bp.route('/programs', methods=['GET'])
@jwt_required()
def get_programs():
    """Get all programs"""
    programs = Program.query.all()
    return jsonify({
        "programs": [{
            'id': p.id,
            'code': p.code,
            'name': p.name,
            'department': p.department.name if p.department else None
        } for p in programs]
    }), 200

@curriculum_bp.route('/programs', methods=['POST'])
@roles_required('admin')
def create_program():
    """Create a new program"""
    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body must be JSON"}), 400

    required_fields = ['code', 'name', 'department_id']
    for field in required_fields:
        if not data.get(field):
            return jsonify({"error": f"Missing required field: {field}"}), 422

    # Check for duplicate code
    if Program.query.filter_by(code=data['code']).first():
        return jsonify({"error": "Program code already exists"}), 409

    program = Program(
        code=data['code'],
        name=data['name'],
        department_id=data['department_id']
    )
    db.session.add(program)
    db.session.commit()

    return jsonify({
        "message": "Program created successfully",
        "program": {
            'id': program.id,
            'code': program.code,
            'name': program.name,
            'department_id': program.department_id
        }
    }), 201

@curriculum_bp.route('/programs/<int:program_id>', methods=['PUT'])
@roles_required('admin')
def update_program(program_id):
    """Update a program"""
    program = db.session.get(Program, program_id)
    if not program:
        return jsonify({"error": "Program not found"}), 404

    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body must be JSON"}), 400

    # Update fields
    if 'code' in data:
        # Check for duplicate code (excluding current program)
        existing = Program.query.filter_by(code=data['code']).filter(Program.id != program_id).first()
        if existing:
            return jsonify({"error": "Program code already exists"}), 409
        program.code = data['code']
    
    if 'name' in data:
        program.name = data['name']
    
    if 'department_id' in data:
        program.department_id = data['department_id']

    db.session.commit()

    return jsonify({
        "message": "Program updated successfully",
        "program": {
            'id': program.id,
            'code': program.code,
            'name': program.name,
            'department_id': program.department_id
        }
    }), 200

@curriculum_bp.route('/programs/<int:program_id>', methods=['DELETE'])
@roles_required('admin')
def delete_program(program_id):
    """Delete a program"""
    program = db.session.get(Program, program_id)
    if not program:
        return jsonify({"error": "Program not found"}), 404

    # Check if program has batches
    if len(program.batches) > 0:
        return jsonify({"error": "Cannot delete program with associated batches"}), 400

    db.session.delete(program)
    db.session.commit()

    return jsonify({"message": "Program deleted successfully"}), 200

# ── Course Management ─────────────────────────────────────────────────────────

@curriculum_bp.route('/courses', methods=['GET'])
@jwt_required()
def get_courses():
    """Get all courses"""
    courses = Course.query.all()
    return jsonify({
        "courses": [{
            'id': c.id,
            'code': c.code,
            'name': c.name,
            'course_type': c.course_type,
            'department': c.department.name if c.department else None
        } for c in courses]
    }), 200

@curriculum_bp.route('/courses', methods=['POST'])
@roles_required('admin')
def create_course():
    """Create a new course"""
    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body must be JSON"}), 400

    required_fields = ['code', 'name', 'course_type', 'department_id']
    for field in required_fields:
        if not data.get(field):
            return jsonify({"error": f"Missing required field: {field}"}), 422

    # Check for duplicate code
    if Course.query.filter_by(code=data['code']).first():
        return jsonify({"error": "Course code already exists"}), 409

    course = Course(
        code=data['code'],
        name=data['name'],
        course_type=data['course_type'],
        department_id=data['department_id']
    )
    db.session.add(course)
    db.session.commit()

    return jsonify({
        "message": "Course created successfully",
        "course": {
            'id': course.id,
            'code': course.code,
            'name': course.name,
            'course_type': course.course_type,
            'department_id': course.department_id
        }
    }), 201

@curriculum_bp.route('/courses/<int:course_id>', methods=['PUT'])
@roles_required('admin')
def update_course(course_id):
    """Update a course"""
    course = db.session.get(Course, course_id)
    if not course:
        return jsonify({"error": "Course not found"}), 404

    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body must be JSON"}), 400

    # Update fields
    if 'code' in data:
        # Check for duplicate code (excluding current course)
        existing = Course.query.filter_by(code=data['code']).filter(Course.id != course_id).first()
        if existing:
            return jsonify({"error": "Course code already exists"}), 409
        course.code = data['code']
    
    if 'name' in data:
        course.name = data['name']
    
    if 'course_type' in data:
        course.course_type = data['course_type']
    
    if 'department_id' in data:
        course.department_id = data['department_id']

    db.session.commit()

    return jsonify({
        "message": "Course updated successfully",
        "course": {
            'id': course.id,
            'code': course.code,
            'name': course.name,
            'course_type': course.course_type,
            'department_id': course.department_id
        }
    }), 200

@curriculum_bp.route('/courses/<int:course_id>', methods=['DELETE'])
@roles_required('admin')
def delete_course(course_id):
    """Delete a course"""
    course = db.session.get(Course, course_id)
    if not course:
        return jsonify({"error": "Course not found"}), 404

    db.session.delete(course)
    db.session.commit()

    return jsonify({"message": "Course deleted successfully"}), 200

# ── Curriculum Management (uses course.program_code and course.semester) ─────────────────────────────

@curriculum_bp.route('/curriculum', methods=['GET'])
@jwt_required()
def get_curriculum():
    """Get curriculum based on course.program_code and course.semester"""
    program_id = request.args.get('program_id', type=int)
    
    if program_id:
        program = db.session.get(Program, program_id)
        if not program:
            return jsonify({"error": "Program not found"}), 404
        # Get courses for this program code
        courses = Course.query.filter_by(program_code=program.code).order_by(Course.semester).all()
    else:
        # Get all courses with program codes
        courses = Course.query.filter(Course.program_code.isnot(None)).order_by(Course.program_code, Course.semester).all()
    
    # Organize by program and semester
    curriculum = {}
    for c in courses:
        program_key = c.program_code or "Unknown Program"
        if program_key not in curriculum:
            curriculum[program_key] = {}
        
        semester_key = f"Semester {c.semester}" if c.semester else "Unspecified"
        if semester_key not in curriculum[program_key]:
            curriculum[program_key][semester_key] = []
        
        curriculum[program_key][semester_key].append({
            'id': c.id,
            'course_id': c.id,
            'course_code': c.code,
            'course_name': c.name,
            'course_type': c.course_type
        })
    
    return jsonify({"curriculum": curriculum}), 200

@curriculum_bp.route('/curriculum', methods=['POST'])
@roles_required('admin')
def add_curriculum_item():
    """Update course program_code and semester"""
    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body must be JSON"}), 400

    required_fields = ['program_code', 'course_id', 'semester_number']
    for field in required_fields:
        if not data.get(field):
            return jsonify({"error": f"Missing required field: {field}"}), 422

    course = db.session.get(Course, data['course_id'])
    if not course:
        return jsonify({"error": "Course not found"}), 404

    course.program_code = data['program_code']
    course.semester = data['semester_number']
    db.session.commit()

    return jsonify({
        "message": "Course curriculum updated successfully",
        "course": {
            'id': course.id,
            'code': course.code,
            'name': course.name,
            'program_code': course.program_code,
            'semester': course.semester
        }
    }), 201

@curriculum_bp.route('/curriculum/<int:course_id>', methods=['PUT'])
@roles_required('admin')
def update_curriculum_item(course_id):
    """Update course program_code or semester"""
    course = db.session.get(Course, course_id)
    if not course:
        return jsonify({"error": "Course not found"}), 404

    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body must be JSON"}), 400

    if 'program_code' in data:
        course.program_code = data['program_code']
    if 'semester_number' in data:
        course.semester = data['semester_number']

    db.session.commit()

    return jsonify({
        "message": "Course curriculum updated successfully",
        "course": {
            'id': course.id,
            'code': course.code,
            'name': course.name,
            'program_code': course.program_code,
            'semester': course.semester
        }
    }), 200

@curriculum_bp.route('/curriculum/<int:course_id>', methods=['DELETE'])
@roles_required('admin')
def delete_curriculum_item(course_id):
    """Remove course from curriculum by clearing program_code"""
    course = db.session.get(Course, course_id)
    if not course:
        return jsonify({"error": "Course not found"}), 404

    course.program_code = None
    db.session.commit()

    return jsonify({"message": "Course removed from curriculum successfully"}), 200

# ── Batch Management ─────────────────────────────────────────────────────────

@curriculum_bp.route('/batches', methods=['GET'])
@jwt_required()
def get_batches():
    """Get all batches"""
    batches = Batch.query.all()
    return jsonify({
        "batches": [{
            'id': b.id,
            'name': b.name,
            'academic_year': b.academic_year,
            'current_semester': b.current_semester,
            'program': {
                'id': b.program.id,
                'code': b.program.code,
                'name': b.program.name
            } if b.program else None
        } for b in batches]
    }), 200

@curriculum_bp.route('/batches/<int:batch_id>/semester', methods=['PUT'])
@roles_required('admin')
def update_batch_semester(batch_id):
    """Update batch current semester"""
    batch = db.session.get(Batch, batch_id)
    if not batch:
        return jsonify({"error": "Batch not found"}), 404

    data = request.get_json()
    if not data or 'current_semester' not in data:
        return jsonify({"error": "Missing current_semester field"}), 422

    batch.current_semester = data['current_semester']
    db.session.commit()

    return jsonify({
        "message": "Batch semester updated successfully",
        "batch": {
            'id': batch.id,
            'name': batch.name,
            'current_semester': batch.current_semester
        }
    }), 200

@curriculum_bp.route('/batches/<int:batch_id>/current-courses', methods=['GET'])
@jwt_required()
def get_batch_current_courses(batch_id):
    """Get current courses for a batch"""
    batch = db.session.get(Batch, batch_id)
    if not batch:
        return jsonify({"error": "Batch not found"}), 404

    # Get courses matching batch's program code and current semester
    courses = Course.query.filter_by(
        program_code=batch.program.code,
        semester=batch.current_semester
    ).all()

    courses_data = [{
        'id': c.id,
        'code': c.code,
        'name': c.name,
        'type': c.course_type
    } for c in courses]

    return jsonify({
        "batch": {
            'id': batch.id,
            'name': batch.name,
            'current_semester': batch.current_semester,
            'program': batch.program.code
        },
        "courses": courses_data
    }), 200
