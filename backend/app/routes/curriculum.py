from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from functools import wraps

from .. import db
from ..models.user import User
from ..models.program import Program
from ..models.course import Course
from ..models.program_course import ProgramCourse
from ..models.batch import Batch

curriculum_bp = Blueprint('curriculum', __name__)

# ── Role guard decorator ───────────────────────────────────────────────────────

def roles_required(*roles):
    """Decorator: @roles_required('admin') or @roles_required('admin','dept_head')"""
    def decorator(fn):
        @wraps(fn)
        @jwt_required()
        def wrapper(*args, **kwargs):
            identity = get_jwt_identity()
            user = User.query.filter_by(email=identity).first()
            if not user or not user.is_active:
                return jsonify({"error": "User not found or inactive"}), 401
            if user.role not in roles:
                return jsonify({"error": f"Access denied. Required roles: {list(roles)}"}), 403
            return fn(*args, **kwargs)
        return wrapper
    return decorator

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

    # Check if program has courses
    if program.program_courses.count() > 0:
        return jsonify({"error": "Cannot delete program with associated courses"}), 400

    # Check if program has batches
    if program.batches.count() > 0:
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
            'credits': c.credits,
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
        credits=data.get('credits', 4),
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
            'credits': course.credits,
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
    
    if 'credits' in data:
        course.credits = data['credits']
    
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
            'credits': course.credits,
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

    # Check if course is in curriculum
    if course.program_courses.count() > 0:
        return jsonify({"error": "Cannot delete course that is in program curriculum"}), 400

    db.session.delete(course)
    db.session.commit()

    return jsonify({"message": "Course deleted successfully"}), 200

# ── Curriculum Management (Program-Course Mapping) ─────────────────────────────

@curriculum_bp.route('/curriculum', methods=['GET'])
@jwt_required()
def get_curriculum():
    """Get full curriculum for all programs"""
    program_id = request.args.get('program_id', type=int)
    
    query = ProgramCourse.query
    if program_id:
        query = query.filter_by(program_id=program_id)
    
    program_courses = query.order_by(ProgramCourse.program_id, ProgramCourse.semester_number).all()
    
    # Organize by program and semester
    curriculum = {}
    for pc in program_courses:
        program_key = f"{pc.program.code} - {pc.program.name}"
        if program_key not in curriculum:
            curriculum[program_key] = {}
        
        semester_key = f"Semester {pc.semester_number}"
        if semester_key not in curriculum[program_key]:
            curriculum[program_key][semester_key] = []
        
        curriculum[program_key][semester_key].append({
            'id': pc.id,
            'course_id': pc.course.id,
            'course_code': pc.course.code,
            'course_name': pc.course.name,
            'course_type': pc.course.course_type,
            'credits': pc.course.credits
        })
    
    return jsonify({"curriculum": curriculum}), 200

@curriculum_bp.route('/curriculum', methods=['POST'])
@roles_required('admin')
def add_curriculum_item():
    """Add a course to program curriculum"""
    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body must be JSON"}), 400

    required_fields = ['program_id', 'course_id', 'semester_number']
    for field in required_fields:
        if not data.get(field):
            return jsonify({"error": f"Missing required field: {field}"}), 422

    # Check for duplicate
    existing = ProgramCourse.query.filter_by(
        program_id=data['program_id'],
        course_id=data['course_id'],
        semester_number=data['semester_number']
    ).first()
    
    if existing:
        return jsonify({"error": "Course already exists in this program semester"}), 409

    program_course = ProgramCourse(
        program_id=data['program_id'],
        course_id=data['course_id'],
        semester_number=data['semester_number']
    )
    db.session.add(program_course)
    db.session.commit()

    return jsonify({
        "message": "Course added to curriculum successfully",
        "curriculum_item": program_course.to_dict()
    }), 201

@curriculum_bp.route('/curriculum/<int:curriculum_id>', methods=['PUT'])
@roles_required('admin')
def update_curriculum_item(curriculum_id):
    """Update curriculum item (change semester)"""
    program_course = db.session.get(ProgramCourse, curriculum_id)
    if not program_course:
        return jsonify({"error": "Curriculum item not found"}), 404

    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body must be JSON"}), 400

    # Update semester
    if 'semester_number' in data:
        # Check for duplicate in new semester
        existing = ProgramCourse.query.filter_by(
            program_id=program_course.program_id,
            course_id=program_course.course_id,
            semester_number=data['semester_number']
        ).filter(ProgramCourse.id != curriculum_id).first()
        
        if existing:
            return jsonify({"error": "Course already exists in target semester"}), 409
        
        program_course.semester_number = data['semester_number']

    db.session.commit()

    return jsonify({
        "message": "Curriculum item updated successfully",
        "curriculum_item": program_course.to_dict()
    }), 200

@curriculum_bp.route('/curriculum/<int:curriculum_id>', methods=['DELETE'])
@roles_required('admin')
def delete_curriculum_item(curriculum_id):
    """Remove a course from program curriculum"""
    program_course = db.session.get(ProgramCourse, curriculum_id)
    if not program_course:
        return jsonify({"error": "Curriculum item not found"}), 404

    db.session.delete(program_course)
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

    # Get courses for current semester
    program_courses = ProgramCourse.query.filter_by(
        program_id=batch.program_id,
        semester_number=batch.current_semester
    ).all()

    courses = [{
        'id': pc.course.id,
        'code': pc.course.code,
        'name': pc.course.name,
        'type': pc.course.course_type,
        'credits': pc.course.credits
    } for pc in program_courses]

    return jsonify({
        "batch": {
            'id': batch.id,
            'name': batch.name,
            'current_semester': batch.current_semester,
            'program': batch.program.code
        },
        "courses": courses
    }), 200
