from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
from .. import db
from ..models import WorkloadAllocation, Section, Course, Teacher, Program
from .auth import roles_required

workload_bp = Blueprint('workload', __name__)

@workload_bp.route('/sections/<int:section_id>', methods=['GET'])
@jwt_required()
def get_section_workload(section_id):
    """
    Get all courses for a section and their CURRENT teacher assignments.
    Also returns list of qualified teachers for each course.
    """
    section = db.session.get(Section, section_id)
    if not section:
        return jsonify({"error": "Section not found"}), 404

    # 1. Get courses that SHOULD be taught for this section
    # Based on Program ID and Semester
    program_id = section.batch.program_id if section.batch else None
    semester = section.batch.current_semester if section.batch else None
    
    courses = []
    if program_id and semester:
        courses = Course.query.filter_by(program_id=program_id, semester=semester).all()
    
    # 2. Get existing workload assignments
    assignments = WorkloadAllocation.query.filter_by(section_id=section_id).all()
    assigned_map = {a.course_id: a for a in assignments}

    result = []
    for course in courses:
        assignment = assigned_map.get(course.id)
        
        # Get qualified teachers for this course to show in dropdown
        qualified_teachers = [{
            "id": t.id,
            "name": t.name,
            "email": t.email
        } for t in course.qualified_teachers]

        result.append({
            "course_id": course.id,
            "course_code": course.code,
            "course_name": course.name,
            "course_type": course.course_type,
            "teacher_id": assignment.teacher_id if assignment else None,
            "teacher_name": assignment.teacher.name if assignment else None,
            "workload_id": assignment.id if assignment else None,
            "qualified_teachers": qualified_teachers
        })

    return jsonify({
        "section_id": section_id,
        "section_name": section.name,
        "batch_name": section.batch.name if section.batch else "Unknown",
        "courses": result
    }), 200

@workload_bp.route('/assign', methods=['POST'])
@roles_required('admin', 'dept_head')
def assign_workload():
    """Assign or update a teacher to a section-course pair"""
    data = request.get_json()
    if not data:
        return jsonify({"error": "Data required"}), 400
    
    required = ['section_id', 'course_id', 'teacher_id']
    for field in required:
        if not data.get(field):
            return jsonify({"error": f"Missing field: {field}"}), 422

    # Check if assignment already exists
    existing = WorkloadAllocation.query.filter_by(
        section_id=data['section_id'],
        course_id=data['course_id']
    ).first()

    if existing:
        existing.teacher_id = data['teacher_id']
        message = "Assignment updated"
    else:
        new_alloc = WorkloadAllocation(
            section_id=data['section_id'],
            course_id=data['course_id'],
            teacher_id=data['teacher_id']
        )
        db.session.add(new_alloc)
        message = "Teacher assigned successfully"

    db.session.commit()
    return jsonify({"message": message}), 200

@workload_bp.route('/unassign', methods=['POST'])
@roles_required('admin', 'dept_head')
def unassign_workload():
    """Remove a teacher assignment from a section-course pair"""
    data = request.get_json()
    if not data or not data.get('section_id') or not data.get('course_id'):
        return jsonify({"error": "section_id and course_id required"}), 422

    assignment = WorkloadAllocation.query.filter_by(
        section_id=data['section_id'],
        course_id=data['course_id']
    ).first()

    if assignment:
        db.session.delete(assignment)
        db.session.commit()
        return jsonify({"message": "Assignment removed"}), 200
    
    return jsonify({"message": "No assignment found to remove"}), 200
import pandas as pd
from io import BytesIO
from ..models import Batch

@workload_bp.route('/import', methods=['POST'])
@roles_required('admin')
def bulk_import_workload():
    file = request.files.get('file')
    if not file:
        return jsonify({"error": "No file uploaded"}), 400
    
    try:
        df = pd.read_excel(BytesIO(file.read()))
        success = 0
        errors = []
        
        for index, row in df.iterrows():
            try:
                batch_name = str(row.get('BatchName', '')).strip()
                section_name = str(row.get('SectionName', '')).strip()
                course_code = str(row.get('CourseCode', '')).strip()
                teacher_email = str(row.get('TeacherEmail', '')).strip()
                
                if not all([batch_name, section_name, course_code, teacher_email]):
                    raise Exception("Missing required columns: BatchName, SectionName, CourseCode, TeacherEmail")
                
                # Find Batch
                batch = Batch.query.filter_by(name=batch_name).first()
                if not batch:
                    raise Exception(f"Batch '{batch_name}' not found")
                
                # Find Section in that batch
                section = Section.query.filter_by(name=section_name, batch_id=batch.id).first()
                if not section:
                    raise Exception(f"Section '{section_name}' not found in batch '{batch_name}'")
                
                # Find Course
                course = Course.query.filter_by(code=course_code).first()
                if not course:
                    raise Exception(f"Course '{course_code}' not found")
                
                # Find Teacher
                teacher = Teacher.query.filter_by(email=teacher_email).first()
                if not teacher:
                    raise Exception(f"Teacher with email '{teacher_email}' not found")
                
                # Create or Update Assignment
                alloc = WorkloadAllocation.query.filter_by(section_id=section.id, course_id=course.id).first()
                if alloc:
                    alloc.teacher_id = teacher.id
                else:
                    alloc = WorkloadAllocation(section_id=section.id, course_id=course.id, teacher_id=teacher.id)
                    db.session.add(alloc)
                
                success += 1
            except Exception as e:
                errors.append(f"Row {index+2}: {str(e)}")
        
        db.session.commit()
        return jsonify({"message": f"Imported {success} assignments", "errors": errors}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": f"Failed to process file: {str(e)}"}), 500
@workload_bp.route('/auto-assign-all', methods=['POST'])
@roles_required('admin')
def auto_assign_all_workload():
    """ Automatically assigns the first qualified teacher to every unassigned course in every section. """
    sections = Section.query.all()
    success_count = 0
    
    for section in sections:
        if not section.batch:
            continue
            
        program_id = section.batch.program_id
        semester = section.batch.current_semester
        courses = Course.query.filter_by(program_id=program_id, semester=semester).all()
        
        for course in courses:
            # Check if already assigned
            existing = WorkloadAllocation.query.filter_by(
                section_id=section.id,
                course_id=course.id
            ).first()
            
            if not existing:
                # SMART LOAD BALANCING: Pick the qualified teacher with the lowest current workload
                # Get all qualified teachers
                qualified = course.qualified_teachers.all()
                if qualified:
                    # Sort by current workload count
                    teacher = min(qualified, key=lambda t: WorkloadAllocation.query.filter_by(teacher_id=t.id).count())
                    alloc = WorkloadAllocation(
                        section_id=section.id,
                        course_id=course.id,
                        teacher_id=teacher.id
                    )
                    db.session.add(alloc)
                    success_count += 1
    
    db.session.commit()
    return jsonify({"message": f"Successfully created {success_count} auto-assignments"}), 200
@workload_bp.route('/rebalance-all', methods=['POST'])
@roles_required('admin')
def rebalance_all_workload():
    """ Clears all workload allocations and re-assigns them using smart load balancing. """
    # 1. Clear all
    WorkloadAllocation.query.delete()
    
    # 2. Re-assign
    sections = Section.query.all()
    success_count = 0
    
    for section in sections:
        if not section.batch: continue
        program_id = section.batch.program_id
        semester = section.batch.current_semester
        
        # Get courses for this batch's program and semester
        courses = Course.query.filter_by(program_id=program_id, semester=semester).all()
        
        for course in courses:
            qualified = course.qualified_teachers.all()
            if qualified:
                # Pick teacher with lowest current count in this new session. 
                teacher = min(qualified, key=lambda t: WorkloadAllocation.query.filter_by(teacher_id=t.id).count())
                alloc = WorkloadAllocation(
                    section_id=section.id,
                    course_id=course.id,
                    teacher_id=teacher.id
                )
                db.session.add(alloc)
                success_count += 1
    
    db.session.commit()
    return jsonify({"message": f"Successfully rebalanced {success_count} assignments for all batches"}), 200
