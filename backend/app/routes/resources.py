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

from io import BytesIO
import re
import pandas as pd
from ..models import Department, Program, Batch, Section, Teacher, Course, Room
from .. import db
from .auth import roles_required

resources_bp = Blueprint("resources", __name__)

# ── Pagination helper ──────────────────────────────────────────────────────────


def paginate(query):
    """Apply ?page=1&per_page=20 pagination from request args."""
    page = request.args.get("page", 1, type=int)
    per_page = min(request.args.get("per_page", 20, type=int), 1000)  # capped at 1000 instead of 100
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


@resources_bp.route("/departments", methods=["GET"])
@jwt_required()
def get_departments():
    result = paginate(Department.query.order_by(Department.name))
    items = [{"id": d.id, "name": d.name, "code": d.code} for d in result.items]
    return jsonify({"data": items, "meta": pagination_meta(result)}), 200


@resources_bp.route("/departments/<int:dept_id>", methods=["GET"])
@jwt_required()
def get_department(dept_id):
    d = db.session.get(Department, dept_id)
    if not d:
        return jsonify({"error": "Department not found"}), 404
    return jsonify({"id": d.id, "name": d.name, "code": d.code}), 200


@resources_bp.route("/departments", methods=["POST"])
@roles_required("admin", "dept_head")
def add_department():
    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body must be JSON"}), 400

    errors = []
    if not data.get("name") or len(str(data["name"]).strip()) < 2:
        errors.append("name must be at least 2 characters")
    if not data.get("code") or len(str(data["code"]).strip()) < 1:
        errors.append("code is required")
    if errors:
        return jsonify({"error": "Validation failed", "details": errors}), 422

    if Department.query.filter_by(code=data["code"].strip().upper()).first():
        return jsonify({"error": f"Department with code '{data['code']}' already exists"}), 409

    dept = Department(name=data["name"].strip(), code=data["code"].strip().upper())
    db.session.add(dept)
    db.session.commit()
    return jsonify({"message": "Department added", "id": dept.id, "name": dept.name, "code": dept.code}), 201


@resources_bp.route("/departments/<int:dept_id>", methods=["PUT"])
@roles_required("admin", "dept_head")
def update_department(dept_id):
    dept = db.session.get(Department, dept_id)
    if not dept:
        return jsonify({"error": "Department not found"}), 404

    data = request.get_json() or {}
    if "name" in data:
        dept.name = data["name"].strip()
    if "code" in data:
        new_code = data["code"].strip().upper()
        existing = Department.query.filter_by(code=new_code).first()
        if existing and existing.id != dept_id:
            return jsonify({"error": "Code already in use by another department"}), 409
        dept.code = new_code

    db.session.commit()
    return jsonify({"message": "Department updated", "id": dept.id, "name": dept.name, "code": dept.code}), 200


@resources_bp.route("/departments/<int:dept_id>", methods=["DELETE"])
@roles_required("admin")
def delete_department(dept_id):
    dept = db.session.get(Department, dept_id)
    if not dept:
        return jsonify({"error": "Department not found"}), 404
    db.session.delete(dept)
    db.session.commit()
    return jsonify({"message": "Department deleted"}), 200


# ══════════════════════════════════════════════════════════════════════════════
# PROGRAMS
# ══════════════════════════════════════════════════════════════════════════════


@resources_bp.route("/programs", methods=["GET"])
@jwt_required()
def get_programs():
    query = Program.query
    dept_id = request.args.get("department_id", type=int)
    if dept_id:
        query = query.filter_by(department_id=dept_id)
    result = paginate(query.order_by(Program.name))
    items = [{"id": p.id, "name": p.name, "code": p.code, "department_id": p.department_id} for p in result.items]
    return jsonify({"data": items, "meta": pagination_meta(result)}), 200


@resources_bp.route("/programs/<int:prog_id>", methods=["GET"])
@jwt_required()
def get_program(prog_id):
    p = db.session.get(Program, prog_id)
    if not p:
        return jsonify({"error": "Program not found"}), 404
    return jsonify({"id": p.id, "name": p.name, "code": p.code, "department_id": p.department_id}), 200


@resources_bp.route("/programs", methods=["POST"])
@roles_required("admin", "dept_head")
def add_program():
    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body must be JSON"}), 400

    errors = []
    if not data.get("name"):
        errors.append("name is required")
    if not data.get("code"):
        errors.append("code is required")
    if not data.get("department_id"):
        errors.append("department_id is required")
    if errors:
        return jsonify({"error": "Validation failed", "details": errors}), 422

    dept = db.session.get(Department, data["department_id"])
    if not dept:
        return jsonify({"error": "Department not found"}), 404
    if Program.query.filter_by(code=data["code"].strip()).first():
        return jsonify({"error": f"Program with code '{data['code']}' already exists"}), 409

    p = Program(name=data["name"].strip(), code=data["code"].strip(), department_id=data["department_id"])
    db.session.add(p)
    db.session.commit()
    return jsonify({"message": "Program added", "id": p.id}), 201


@resources_bp.route("/programs/<int:prog_id>", methods=["PUT"])
@roles_required("admin", "dept_head")
def update_program(prog_id):
    p = db.session.get(Program, prog_id)
    if not p:
        return jsonify({"error": "Program not found"}), 404

    data = request.get_json() or {}
    if "name" in data:
        p.name = data["name"].strip()
    if "code" in data:
        p.code = data["code"].strip()
    if "department_id" in data:
        if not db.session.get(Department, data["department_id"]):
            return jsonify({"error": "Department not found"}), 404
        p.department_id = data["department_id"]

    db.session.commit()
    return jsonify({"message": "Program updated", "id": p.id}), 200


@resources_bp.route("/programs/<int:prog_id>", methods=["DELETE"])
@roles_required("admin")
def delete_program(prog_id):
    p = db.session.get(Program, prog_id)
    if not p:
        return jsonify({"error": "Program not found"}), 404
    db.session.delete(p)
    db.session.commit()
    return jsonify({"message": "Program deleted"}), 200


# ══════════════════════════════════════════════════════════════════════════════
# BATCHES
# ══════════════════════════════════════════════════════════════════════════════


@resources_bp.route("/batches", methods=["GET"])
@jwt_required()
def get_batches():
    query = Batch.query
    prog_id = request.args.get("program_id", type=int)
    if prog_id:
        query = query.filter_by(program_id=prog_id)
    result = paginate(query.order_by(Batch.name))
    items = [
        {
            "id": b.id,
            "name": b.name,
            "code": b.code,
            "academic_year": b.academic_year,
            "program_id": b.program_id,
            "program_code": b.program.code if b.program else None,
            "current_semester": b.current_semester,
            "section_count": len(b.sections),
        }
        for b in result.items
    ]
    return jsonify({"data": items, "meta": pagination_meta(result)}), 200


@resources_bp.route("/batches/<int:batch_id>", methods=["GET"])
@jwt_required()
def get_batch(batch_id):
    b = db.session.get(Batch, batch_id)
    if not b:
        return jsonify({"error": "Batch not found"}), 404
    return (
        jsonify(
            {
                "id": b.id,
                "name": b.name,
                "code": b.code,
                "academic_year": b.academic_year,
                "program_id": b.program_id,
                "program_code": b.program.code if b.program else None,
                "current_semester": b.current_semester,
                "section_count": len(b.sections),
            }
        ),
        200,
    )


@resources_bp.route("/batches", methods=["POST"])
@roles_required("admin", "dept_head")
def add_batch():
    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body must be JSON"}), 400

    errors = []
    if not data.get("name"):
        errors.append("name is required")
    if not data.get("academic_year"):
        errors.append("academic_year is required")
    if not data.get("program_id"):
        errors.append("program_id is required")
    if not data.get("code"):
        errors.append("code is required")
    if errors:
        return jsonify({"error": "Validation failed", "details": errors}), 422

    if Batch.query.filter_by(code=data["code"].strip()).first():
        return jsonify({"error": f"Batch code '{data['code']}' already exists"}), 409

    if not db.session.get(Program, data["program_id"]):
        return jsonify({"error": "Program not found"}), 404

    b = Batch(
        name=data["name"].strip(),
        code=data["code"].strip(),
        academic_year=data["academic_year"].strip(),
        program_id=data["program_id"],
        current_semester=data.get("current_semester", 1),
    )
    db.session.add(b)
    db.session.commit()
    return jsonify({"message": "Batch added", "id": b.id}), 201


@resources_bp.route("/batches/<int:batch_id>", methods=["PUT"])
@roles_required("admin", "dept_head")
def update_batch(batch_id):
    b = db.session.get(Batch, batch_id)
    if not b:
        return jsonify({"error": "Batch not found"}), 404

    data = request.get_json() or {}
    if "name" in data:
        b.name = data["name"].strip()
    if "code" in data:
        existing = Batch.query.filter_by(code=data["code"].strip()).first()
        if existing and existing.id != batch_id:
            return jsonify({"error": "Batch code already in use"}), 409
        b.code = data["code"].strip()
    if "academic_year" in data:
        b.academic_year = data["academic_year"].strip()
    if "program_id" in data:
        if not db.session.get(Program, data["program_id"]):
            return jsonify({"error": "Program not found"}), 404
        b.program_id = data["program_id"]
    if "current_semester" in data:
        b.current_semester = data["current_semester"]

    db.session.commit()
    return jsonify({"message": "Batch updated", "id": b.id}), 200


@resources_bp.route("/batches/<int:batch_id>", methods=["DELETE"])
@roles_required("admin")
def delete_batch(batch_id):
    b = db.session.get(Batch, batch_id)
    if not b:
        return jsonify({"error": "Batch not found"}), 404
    db.session.delete(b)
    db.session.commit()
    return jsonify({"message": "Batch deleted"}), 200


# ══════════════════════════════════════════════════════════════════════════════
# SECTIONS
# ══════════════════════════════════════════════════════════════════════════════


def _section_dict(s):
    return {
        "id": s.id,
        "name": s.name,
        "student_count": s.student_count,
        "batch_id": s.batch_id,
        "batch_name": s.batch.name if s.batch else None,
        "program_name": s.batch.program.name if s.batch and s.batch.program else None,
        "department_id": s.batch.program.department_id if s.batch and s.batch.program else None,
    }


@resources_bp.route("/sections", methods=["GET"])
@jwt_required()
def get_sections():
    query = Section.query
    batch_id = request.args.get("batch_id", type=int)
    if batch_id:
        query = query.filter_by(batch_id=batch_id)
    result = paginate(query.order_by(Section.name))
    items = [_section_dict(s) for s in result.items]
    return jsonify({"data": items, "meta": pagination_meta(result)}), 200


@resources_bp.route("/sections/<int:section_id>", methods=["GET"])
@jwt_required()
def get_section(section_id):
    s = db.session.get(Section, section_id)
    if not s:
        return jsonify({"error": "Section not found"}), 404
    return jsonify(_section_dict(s)), 200


@resources_bp.route("/sections", methods=["POST"])
@roles_required("admin", "dept_head")
def add_section():
    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body must be JSON"}), 400

    errors = []
    if not data.get("name"):
        errors.append("name is required")
    if not data.get("batch_id"):
        errors.append("batch_id is required")
    if errors:
        return jsonify({"error": "Validation failed", "details": errors}), 422

    if not db.session.get(Batch, data["batch_id"]):
        return jsonify({"error": "Batch not found"}), 404

    student_count = data.get("student_count", 40)
    if not isinstance(student_count, int) or student_count < 1:
        return jsonify({"error": "student_count must be a positive integer"}), 422

    s = Section(name=data["name"].strip(), batch_id=data["batch_id"], student_count=student_count)
    db.session.add(s)
    db.session.commit()
    return jsonify({"message": "Section added", "id": s.id}), 201


@resources_bp.route("/sections/<int:section_id>", methods=["PUT"])
@roles_required("admin", "dept_head")
def update_section(section_id):
    s = db.session.get(Section, section_id)
    if not s:
        return jsonify({"error": "Section not found"}), 404

    data = request.get_json() or {}
    if "name" in data:
        s.name = data["name"].strip()
    if "student_count" in data:
        s.student_count = data["student_count"]
    if "batch_id" in data:
        if not db.session.get(Batch, data["batch_id"]):
            return jsonify({"error": "Batch not found"}), 404
        s.batch_id = data["batch_id"]

    db.session.commit()
    return jsonify({"message": "Section updated", "id": s.id}), 200


@resources_bp.route("/sections/<int:section_id>", methods=["DELETE"])
@roles_required("admin")
def delete_section(section_id):
    s = db.session.get(Section, section_id)
    if not s:
        return jsonify({"error": "Section not found"}), 404
    db.session.delete(s)
    db.session.commit()
    return jsonify({"message": "Section deleted"}), 200


# ══════════════════════════════════════════════════════════════════════════════
# TEACHERS
# ══════════════════════════════════════════════════════════════════════════════


def _teacher_dict(t):
    return {
        "id": t.id,
        "name": t.name,
        "email": t.email,
        "phone": t.phone,
        "abbreviation": t.abbreviation,
        "availability": t.availability,
        "departments": [{"id": d.id, "name": d.name} for d in t.departments],
        "qualified_courses": [{"id": c.id, "name": c.name, "code": c.code} for c in t.qualified_courses],
    }


@resources_bp.route("/teachers", methods=["GET"])
@jwt_required()
def get_teachers():
    query = Teacher.query
    dept_id = request.args.get("department_id", type=int)
    if dept_id:
        dept = db.session.get(Department, dept_id)
        if not dept:
            return jsonify({"error": "Department not found"}), 404
        query = dept.teachers  # already a dynamic query
    result = paginate(query.order_by(Teacher.name))
    return jsonify({"data": [_teacher_dict(t) for t in result.items], "meta": pagination_meta(result)}), 200


@resources_bp.route("/teachers/<int:teacher_id>", methods=["GET"])
@jwt_required()
def get_teacher(teacher_id):
    t = db.session.get(Teacher, teacher_id)
    if not t:
        return jsonify({"error": "Teacher not found"}), 404
    return jsonify(_teacher_dict(t)), 200


@resources_bp.route("/teachers", methods=["POST"])
@roles_required("admin", "dept_head")
def add_teacher():
    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body must be JSON"}), 400

    errors = []
    if not data.get("name") or len(str(data["name"]).strip()) < 2:
        errors.append("name must be at least 2 characters")
    if not data.get("email") or "@" not in data["email"]:
        errors.append("valid email is required")
    if errors:
        return jsonify({"error": "Validation failed", "details": errors}), 422

    if Teacher.query.filter_by(email=data["email"].lower().strip()).first():
        return jsonify({"error": "A teacher with this email already exists"}), 409

    teacher = Teacher(
        name=data["name"].strip(),
        email=data["email"].lower().strip(),
        abbreviation=data.get("abbreviation", "").strip() or None,
        availability=data.get("availability"),
    )

    for d_id in data.get("department_ids", []):
        dept = db.session.get(Department, d_id)
        if dept:
            teacher.departments.append(dept)

    db.session.add(teacher)
    db.session.commit()
    return jsonify({"message": "Teacher added", "id": teacher.id, "teacher": _teacher_dict(teacher)}), 201


@resources_bp.route("/teachers/<int:teacher_id>", methods=["PUT"])
@roles_required("admin", "dept_head")
def update_teacher(teacher_id):
    teacher = db.session.get(Teacher, teacher_id)
    if not teacher:
        return jsonify({"error": "Teacher not found"}), 404

    data = request.get_json() or {}
    if "name" in data:
        teacher.name = data["name"].strip()
    if "email" in data:
        new_email = data["email"].lower().strip()
        existing = Teacher.query.filter_by(email=new_email).first()
        if existing and existing.id != teacher_id:
            return jsonify({"error": "Email already in use by another teacher"}), 409
        teacher.email = new_email
    if "availability" in data:
        teacher.availability = data["availability"]
    if "abbreviation" in data:
        teacher.abbreviation = data["abbreviation"].strip() or None
    if "department_ids" in data:
        teacher.departments = []
        for d_id in data["department_ids"]:
            dept = db.session.get(Department, d_id)
            if dept:
                teacher.departments.append(dept)

    db.session.commit()
    return jsonify({"message": "Teacher updated", "teacher": _teacher_dict(teacher)}), 200


@resources_bp.route("/teachers/<int:teacher_id>", methods=["DELETE"])
@roles_required("admin")
def delete_teacher(teacher_id):
    teacher = db.session.get(Teacher, teacher_id)
    if not teacher:
        return jsonify({"error": "Teacher not found"}), 404
    db.session.delete(teacher)
    db.session.commit()
    return jsonify({"message": "Teacher deleted"}), 200


@resources_bp.route("/teachers/<int:teacher_id>/qualifications", methods=["POST"])
@roles_required("admin", "dept_head")
def assign_expertise(teacher_id):
    data = request.get_json()
    if not data or not data.get("course_id"):
        return jsonify({"error": "course_id is required"}), 422

    teacher = db.session.get(Teacher, teacher_id)
    if not teacher:
        return jsonify({"error": "Teacher not found"}), 404
    course = db.session.get(Course, data["course_id"])
    if not course:
        return jsonify({"error": "Course not found"}), 404

    if course not in teacher.qualified_courses:
        teacher.qualified_courses.append(course)
        db.session.commit()

    return jsonify({"message": f"{teacher.name} is now qualified for {course.name}"}), 200


@resources_bp.route("/teachers/<int:teacher_id>/qualifications/<int:course_id>", methods=["DELETE"])
@roles_required("admin", "dept_head")
def remove_expertise(teacher_id, course_id):
    teacher = db.session.get(Teacher, teacher_id)
    if not teacher:
        return jsonify({"error": "Teacher not found"}), 404
    course = db.session.get(Course, course_id)
    if not course:
        return jsonify({"error": "Course not found"}), 404

    if course in teacher.qualified_courses:
        teacher.qualified_courses.remove(course)
        db.session.commit()

    return jsonify({"message": "Qualification removed"}), 200


# ══════════════════════════════════════════════════════════════════════════════
# COURSES
# ══════════════════════════════════════════════════════════════════════════════
def _normalize_optional_string(value):
    if value is None or pd.isna(value):
        return None
    cleaned = str(value).strip()
    return cleaned or None


def _parse_semester_value(value):
    if value is None or pd.isna(value):
        return None

    if isinstance(value, (int, float)) and not pd.isna(value):
        return int(value)

    digits = re.findall(r"\d+", str(value))
    if digits:
        return int(digits[0])

    roman_map = {"I": 1, "II": 2, "III": 3, "IV": 4, "V": 5, "VI": 6, "VII": 7, "VIII": 8}
    sem_upper = str(value).strip().upper().replace("SEMESTER", "").strip()
    return roman_map.get(sem_upper)


def _parse_program_semester(program_value):
    normalized_program = _normalize_optional_string(program_value)
    if not normalized_program:
        return None, None

    match = re.search(r"(\d+)\s*$", normalized_program)
    if not match:
        return normalized_program, None

    semester = int(match.group(1))
    program_code = normalized_program[: match.start()].strip()
    return program_code or normalized_program, semester


def _parse_non_negative_int(value, field_name):
    if value is None or pd.isna(value) or str(value).strip() == "":
        return 0

    try:
        parsed = int(float(value))
    except (TypeError, ValueError):
        raise ValueError(f"{field_name} must be a non-negative integer")

    if parsed < 0:
        raise ValueError(f"{field_name} must be a non-negative integer")

    return parsed


def _infer_course_type(course_type, lecture_hours, tutorial_hours, practical_hours):
    normalized_type = _normalize_optional_string(course_type)
    if normalized_type:
        # Case-insensitive match
        if normalized_type.lower() == "theory":
            return "Theory"
        elif normalized_type.lower() == "lab" or normalized_type.lower() == "practical":
            return "Lab"
    if practical_hours > 0 and lecture_hours == 0 and tutorial_hours == 0:
        return "Lab"
    return "Theory"


def _fuzzy_match_program_code(raw_code):
    """Try multiple matching strategies to find a program by code."""
    if not raw_code:
        return None
    code = str(raw_code).strip()

    # 1. Exact match
    prog = Program.query.filter_by(code=code).first()
    if prog:
        return prog

    # 2. Case-insensitive match
    prog = Program.query.filter(db.func.lower(Program.code) == code.lower()).first()
    if prog:
        return prog

    # 3. Normalized match: remove dots, extra spaces, compress
    normalized = re.sub(r"[.\s]+", "", code).lower()
    for p in Program.query.all():
        p_normalized = re.sub(r"[.\s]+", "", p.code).lower()
        if p_normalized == normalized:
            return p

    # 4. Substring / abbreviation match (e.g., "MIE" in "B.Tech Mining")
    for p in Program.query.all():
        p_words = re.sub(r"[.\s]+", " ", p.code.lower()).strip()
        c_words = re.sub(r"[.\s]+", " ", code.lower()).strip()
        # Check if key abbreviation tokens overlap
        p_tokens = set(p_words.split())
        c_tokens = set(c_words.split())
        if p_tokens & c_tokens:
            # Shared tokens found — accept if at least 2 tokens match or one is very specific
            shared = p_tokens & c_tokens
            specific_tokens = shared - {"b", "tech", "ba", "bb", "bc", "d", "m", "ll", "a", "b"}
            if len(specific_tokens) >= 1 and (len(shared) >= 2 or len(specific_tokens) >= 1):
                return p

    return None


def _resolve_course_department(dept_code=None, program_code=None):
    normalized_dept_code = _normalize_optional_string(dept_code)
    if normalized_dept_code:
        # 1. Exact match
        dept = Department.query.filter_by(code=normalized_dept_code).first()
        # 2. Case-insensitive match
        if not dept:
            dept = Department.query.filter(db.func.lower(Department.code) == normalized_dept_code.lower()).first()
        # 3. Trimmed uppercase match (database may store as uppercase)
        if not dept:
            dept = Department.query.filter_by(code=normalized_dept_code.upper()).first()
        if not dept:
            raise ValueError(f"Department not found with code='{normalized_dept_code}'")
        return dept

    normalized_program_code = _normalize_optional_string(program_code)
    if normalized_program_code:
        # Try fuzzy program matching first
        program = _fuzzy_match_program_code(normalized_program_code)
        if program and program.department_id:
            dept = db.session.get(Department, program.department_id)
            if dept:
                return dept
        # Legacy exact match
        program = Program.query.filter_by(code=normalized_program_code).first()
        if program and program.department_id:
            dept = db.session.get(Department, program.department_id)
            if not dept:
                raise ValueError(f"Department not found for program '{normalized_program_code}'")
            return dept

    raise ValueError("Missing required field: DeptCode or Program")


def _course_dict(c):
    return {
        "id": c.id,
        "name": c.name,
        "code": c.code,
        "semester": c.semester,
        "course_type": c.course_type,
        "department_id": c.department_id,
        "program_id": c.program_id,
        "program_name": c.program.name if c.program else None,
        "program_code": c.program.code if c.program else None,
        "lecture_hours": c.lecture_hours,
        "tutorial_hours": c.tutorial_hours,
        "practical_hours": c.practical_hours,
        "weekly_hours": c.weekly_hours,
    }


@resources_bp.route("/courses", methods=["GET"])
@jwt_required()
def get_courses():
    query = Course.query
    dept_id = request.args.get("department_id", type=int)
    if dept_id:
        query = query.filter_by(department_id=dept_id)
    result = paginate(query.order_by(Course.name))
    return jsonify({"data": [_course_dict(c) for c in result.items], "meta": pagination_meta(result)}), 200


@resources_bp.route("/courses/<int:course_id>", methods=["GET"])
@jwt_required()
def get_course(course_id):
    c = db.session.get(Course, course_id)
    if not c:
        return jsonify({"error": "Course not found"}), 404
    return jsonify(_course_dict(c)), 200


@resources_bp.route("/courses", methods=["POST"])
@roles_required("admin", "dept_head")
def add_course():
    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body must be JSON"}), 400

    errors = []
    if not data.get("name"):
        errors.append("name is required")
    if not data.get("code"):
        errors.append("code is required")
    if not data.get("department_id"):
        errors.append("department_id is required")
    if data.get("course_type") and data["course_type"] not in ("Theory", "Lab"):
        errors.append("course_type must be 'Theory' or 'Lab'")
    try:
        lecture_hours = _parse_non_negative_int(data.get("lecture_hours"), "lecture_hours")
        tutorial_hours = _parse_non_negative_int(data.get("tutorial_hours"), "tutorial_hours")
        practical_hours = _parse_non_negative_int(data.get("practical_hours"), "practical_hours")
    except ValueError as exc:
        errors.append(str(exc))
    if errors:
        return jsonify({"error": "Validation failed", "details": errors}), 422

    dept = db.session.get(Department, data["department_id"])
    if not dept:
        return jsonify({"error": "Department not found"}), 404
    if Course.query.filter_by(code=data["code"].strip()).first():
        return jsonify({"error": f"Course with code '{data['code']}' already exists"}), 409

    program = None
    if data.get("program_id"):
        program = db.session.get(Program, data["program_id"])
    elif data.get("program_code"):
        program = Program.query.filter_by(code=data["program_code"].strip()).first()

    c = Course(
        name=data["name"].strip(),
        code=data["code"].strip(),
        semester=data.get("semester", 1),
        course_type=data.get("course_type", "Theory"),
        department_id=data["department_id"],
        program_id=program.id if program else None,
        lecture_hours=lecture_hours,
        tutorial_hours=tutorial_hours,
        practical_hours=practical_hours,
    )
    db.session.add(c)
    db.session.commit()
    return jsonify({"message": "Course added", "id": c.id, "course": _course_dict(c)}), 201


@resources_bp.route("/courses/<int:course_id>", methods=["PUT"])
@roles_required("admin", "dept_head")
def update_course(course_id):
    c = db.session.get(Course, course_id)
    if not c:
        return jsonify({"error": "Course not found"}), 404

    data = request.get_json() or {}
    if "name" in data:
        c.name = data["name"].strip()
    if "code" in data:
        existing = Course.query.filter_by(code=data["code"].strip()).first()
        if existing and existing.id != course_id:
            return jsonify({"error": "Course code already in use"}), 409
        c.code = data["code"].strip()
    if "semester" in data:
        c.semester = data["semester"]
    if "course_type" in data:
        if data["course_type"] not in ("Theory", "Lab"):
            return jsonify({"error": "course_type must be 'Theory' or 'Lab'"}), 422
        c.course_type = data["course_type"]
    if "program_id" in data:
        c.program_id = data["program_id"]
    elif "program_code" in data:
        code = _normalize_optional_string(data["program_code"])
        if code:
            program = Program.query.filter_by(code=code).first()
            if program:
                c.program_id = program.id

    if "department_id" in data:
        dept = db.session.get(Department, data["department_id"])
        if not dept:
            return jsonify({"error": "Department not found"}), 404
        c.department_id = data["department_id"]

    try:
        if "lecture_hours" in data:
            c.lecture_hours = _parse_non_negative_int(data.get("lecture_hours"), "lecture_hours")
        if "tutorial_hours" in data:
            c.tutorial_hours = _parse_non_negative_int(data.get("tutorial_hours"), "tutorial_hours")
        if "practical_hours" in data:
            c.practical_hours = _parse_non_negative_int(data.get("practical_hours"), "practical_hours")
    except ValueError as exc:
        return jsonify({"error": "Validation failed", "details": [str(exc)]}), 422

    db.session.commit()
    return jsonify({"message": "Course updated", "course": _course_dict(c)}), 200


@resources_bp.route("/courses/<int:course_id>", methods=["DELETE"])
@roles_required("admin")
def delete_course(course_id):
    c = db.session.get(Course, course_id)
    if not c:
        return jsonify({"error": "Course not found"}), 404
    db.session.delete(c)
    db.session.commit()
    return jsonify({"message": "Course deleted"}), 200


# ══════════════════════════════════════════════════════════════════════════════
# ROOMS
# ══════════════════════════════════════════════════════════════════════════════


def _room_dict(r):
    return {
        "id": r.id,
        "name": r.name,
        "capacity": r.capacity,
        "room_type": r.room_type,
        "department_id": r.department_id,
        "program_id": r.program_id,
    }


@resources_bp.route("/rooms", methods=["GET"])
@jwt_required()
def get_rooms():
    query = Room.query
    room_type = request.args.get("room_type")
    if room_type:
        query = query.filter_by(room_type=room_type)
    result = paginate(query.order_by(Room.name))
    return jsonify({"data": [_room_dict(r) for r in result.items], "meta": pagination_meta(result)}), 200


@resources_bp.route("/rooms/<int:room_id>", methods=["GET"])
@jwt_required()
def get_room(room_id):
    r = db.session.get(Room, room_id)
    if not r:
        return jsonify({"error": "Room not found"}), 404
    return jsonify(_room_dict(r)), 200


@resources_bp.route("/rooms", methods=["POST"])
@roles_required("admin")
def add_room():
    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body must be JSON"}), 400

    errors = []
    if not data.get("name"):
        errors.append("name is required")
    if not data.get("capacity") or not isinstance(data["capacity"], int) or data["capacity"] < 1:
        errors.append("capacity must be a positive integer")
    if errors:
        return jsonify({"error": "Validation failed", "details": errors}), 422

    room_type = data.get("room_type", "Classroom")
    program_id = data.get("program_id")
    if room_type and str(room_type).lower() == "lab" and not program_id:
        return jsonify({"error": "Validation failed", "details": ["program_id is required for lab rooms"]}), 422
    if program_id and not db.session.get(Program, program_id):
        return jsonify({"error": "Program not found"}), 404

    if Room.query.filter_by(name=data["name"].strip()).first():
        return jsonify({"error": f"Room '{data['name']}' already exists"}), 409

    r = Room(
        name=data["name"].strip(),
        capacity=data["capacity"],
        room_type=room_type,
        department_id=data.get("department_id"),
        program_id=program_id,
    )
    db.session.add(r)
    db.session.commit()
    return jsonify({"message": "Room added", "id": r.id, "room": _room_dict(r)}), 201


@resources_bp.route("/rooms/<int:room_id>", methods=["PUT"])
@roles_required("admin")
def update_room(room_id):
    r = db.session.get(Room, room_id)
    if not r:
        return jsonify({"error": "Room not found"}), 404

    data = request.get_json() or {}
    if "name" in data:
        existing = Room.query.filter_by(name=data["name"].strip()).first()
        if existing and existing.id != room_id:
            return jsonify({"error": "Room name already in use"}), 409
        r.name = data["name"].strip()
    if "capacity" in data:
        r.capacity = data["capacity"]
    if "room_type" in data:
        r.room_type = data["room_type"]
    if "department_id" in data:
        r.department_id = data["department_id"]
    if "program_id" in data:
        if data["program_id"] and not db.session.get(Program, data["program_id"]):
            return jsonify({"error": "Program not found"}), 404
        r.program_id = data["program_id"]

    # Lab rooms must stay program-scoped.
    final_room_type = (data.get("room_type", r.room_type) or "").lower()
    final_program_id = data.get("program_id", r.program_id)
    if final_room_type == "lab" and not final_program_id:
        return jsonify({"error": "Validation failed", "details": ["program_id is required for lab rooms"]}), 422

    db.session.commit()
    return jsonify({"message": "Room updated", "room": _room_dict(r)}), 200


@resources_bp.route("/rooms/<int:room_id>", methods=["DELETE"])
@roles_required("admin")
def delete_room(room_id):
    r = db.session.get(Room, room_id)
    if not r:
        return jsonify({"error": "Room not found"}), 404
    db.session.delete(r)
    db.session.commit()
    return jsonify({"message": "Room deleted"}), 200


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

                        ref_obj = ref_model.query.filter(
                            getattr(ref_model, ref_field) == str(lookup_val).strip()
                        ).first()
                        if not ref_obj:
                            raise Exception(f"{ref_model.__name__} was not found with {ref_field}='{lookup_val}'")

                        data[model_field] = ref_obj.id

                # Check for uniqueness if required
                if unique_field and data.get(unique_field):
                    existing = model_class.query.filter_by(**{unique_field: data[unique_field]}).first()
                    if existing:
                        success += 1  # Count as skip/update? For now just skip
                        continue

                obj = model_class(**data)
                db.session.add(obj)
                success += 1
            except Exception as e:
                db.session.rollback()
                errors.append(f"Row {index + 2}: {str(e)}")

        db.session.commit()
        return {"message": f"Successfully processed {success} items", "errors": errors}, 200
    except Exception as e:
        db.session.rollback()
        return {"error": f"Failed to process file: {str(e)}"}, 500


@resources_bp.route("/departments/import", methods=["POST"])
@roles_required("admin")
def import_departments():
    file = request.files.get("file")
    result, status = _bulk_import_logic(file, Department, {"name": "Name", "code": "Code"}, "code")
    return jsonify(result), status


@resources_bp.route("/programs/import", methods=["POST"])
@roles_required("admin")
def bulk_import_programs():
    file = request.files.get("file")
    res, status = _bulk_import_logic(
        file,
        Program,
        {"name": "Name", "code": "Code"},
        "code",
        lookup_configs={"department_id": (Department, "code", "DeptCode")},
    )
    return jsonify(res), status


@resources_bp.route("/batches/import", methods=["POST"])
@roles_required("admin")
def bulk_import_batches():
    file = request.files.get("file")
    if not file:
        return jsonify({"error": "No file uploaded"}), 400

    try:
        from datetime import datetime

        df = pd.read_excel(BytesIO(file.read()))
        success = 0
        errors = []

        for index, row in df.iterrows():
            try:
                name = row.get("Name")
                code = row.get("Code")
                academic_year = row.get("AcademicYear")
                program_code = row.get("ProgramCode")

                if pd.isna(name) or pd.isna(code) or pd.isna(program_code):
                    raise Exception("Missing required field: Name, Code, or ProgramCode")

                if Batch.query.filter_by(code=str(code).strip()).first():
                    success += 1
                    continue

                prog = Program.query.filter_by(code=str(program_code).strip()).first()
                if not prog:
                    raise Exception(f"Program not found with code='{program_code}'")

                # Use CurrentSemester from Excel if provided, otherwise default to 1
                current_semester = 1
                sem_val = row.get("CurrentSemester")
                if pd.notna(sem_val):
                    try:
                        current_semester = int(sem_val)
                    except (ValueError, TypeError):
                        pass

                batch = Batch(
                    name=str(name).strip(),
                    code=str(code).strip(),
                    academic_year=str(academic_year).strip() if pd.notna(academic_year) else None,
                    program_id=prog.id,
                    current_semester=current_semester,
                )
                db.session.add(batch)
                success += 1
            except Exception as e:
                errors.append(f"Row {index + 2}: {str(e)}")

        db.session.commit()
        return jsonify({"message": f"Successfully processed {success} batches", "errors": errors}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": f"Failed to process file: {str(e)}"}), 500


@resources_bp.route("/sections/import", methods=["POST"])
@roles_required("admin")
def bulk_import_sections():
    file = request.files.get("file")
    if not file:
        return jsonify({"error": "No file uploaded"}), 400

    try:
        df = pd.read_excel(BytesIO(file.read()))
        success = 0
        errors = []

        for index, row in df.iterrows():
            try:
                name = row.get("Name")
                student_count = row.get("Count")
                batch_code = row.get("BatchCode")

                if pd.isna(name) or pd.isna(batch_code):
                    raise Exception("Missing required field: Name or BatchCode")

                batch = Batch.query.filter_by(code=str(batch_code).strip()).first()
                if not batch:
                    raise Exception(f"Batch was not found with code='{batch_code}'")

                cleaned_name = str(name).strip()
                cleaned_count = int(student_count) if pd.notna(student_count) else 40

                existing = Section.query.filter_by(batch_id=batch.id, name=cleaned_name).first()
                if existing:
                    # Keep re-imports idempotent and refresh student count when it changed.
                    existing.student_count = cleaned_count
                    success += 1
                    continue

                db.session.add(
                    Section(
                        name=cleaned_name,
                        student_count=cleaned_count,
                        batch_id=batch.id,
                    )
                )
                success += 1
            except Exception as e:
                errors.append(f"Row {index + 2}: {str(e)}")

        db.session.commit()
        return jsonify({"message": f"Successfully processed {success} sections", "errors": errors}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": f"Failed to process file: {str(e)}"}), 500


@resources_bp.route("/teachers/import", methods=["POST"])
@roles_required("admin")
def bulk_import_teachers():
    file = request.files.get("file")
    if not file:
        return jsonify({"error": "No file uploaded"}), 400

    try:
        df = pd.read_excel(BytesIO(file.read()))
        # Normalize column names to lowercase to be more flexible
        df.columns = [c.lower().strip() for c in df.columns]

        # Pre-check: warn about unresolved course codes but do NOT block the import
        unresolved_codes = []
        for index, row in df.iterrows():
            course_codes_val = row.get("course_codes")
            if pd.notna(course_codes_val):
                course_codes = [c.strip() for c in str(course_codes_val).replace(";", ",").split(",") if c.strip()]
                for code in course_codes:
                    if not Course.query.filter_by(code=code).first():
                        unresolved_codes.append({"row": index + 2, "code": code})

        if unresolved_codes:
            print(f"[WARN] {len(unresolved_codes)} unresolved course codes found, skipping them during binding")

        success = 0
        skipped_codes = 0
        errors = []

        for index, row in df.iterrows():
            try:
                name = row.get("name")
                email = row.get("email")
                phone = row.get("phone")

                if pd.isna(name) or pd.isna(email):
                    continue

                t = Teacher.query.filter_by(email=str(email).strip()).first()
                if not t:
                    # Auto-generate abbreviation from name
                    clean_name = str(name).strip()
                    parts = clean_name.split()
                    abbr = None
                    if len(parts) >= 2:
                        # Take first char of first 2-3 name parts (skip titles like Prof./Dr.)
                        name_parts = [
                            p for p in parts if p.lower() not in ("prof.", "dr.", "mr.", "mrs.", "ms.", "prof")
                        ]
                        if name_parts:
                            abbr = "".join(p[0].upper() for p in name_parts[:3])
                    t = Teacher(
                        name=clean_name,
                        email=str(email).strip(),
                        phone=str(phone).strip() if pd.notna(phone) else None,
                        abbreviation=abbr,
                    )
                    db.session.add(t)
                else:
                    if pd.notna(phone):
                        t.phone = str(phone).strip()

                # Resolve Departments by codes (e.g., "CS, ME, MATH" or "CS;ME;MATH")
                dept_codes_val = row.get("department_codes")
                if pd.notna(dept_codes_val):
                    # Support both comma and semicolon separators
                    codes = [c.strip() for c in str(dept_codes_val).replace(";", ",").split(",") if c.strip()]
                    for code in codes:
                        dept = Department.query.filter_by(code=code).first()
                        if dept and dept not in t.departments:
                            t.departments.append(dept)

                # Handle Course Qualifications (e.g., "CS101,MATH201,PHY303" or "CS101;MATH201;PHY303")
                course_codes_val = row.get("course_codes")
                if pd.notna(course_codes_val):
                    # Support both comma and semicolon separators
                    course_codes = [c.strip() for c in str(course_codes_val).replace(";", ",").split(",") if c.strip()]
                    for course_code in course_codes:
                        course = Course.query.filter_by(code=course_code).first()
                        if course and course not in t.qualified_courses:
                            t.qualified_courses.append(course)
                        elif not course:
                            skipped_codes += 1

                success += 1
            except Exception as e:
                errors.append(f"Row {index + 2}: {str(e)}")

        db.session.commit()
        result = {"message": f"Successfully processed {success} teachers", "errors": errors}
        if skipped_codes > 0:
            result["skipped_course_codes"] = skipped_codes
            result["unresolved_sample"] = unresolved_codes[:10]
        return jsonify(result), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": f"Failed to process file: {str(e)}"}), 500


@resources_bp.route("/teachers/import-course-bindings", methods=["POST"])
@roles_required("admin")
def import_teacher_course_bindings():
    """Re-sync faculty course qualifications from Excel without touching other data."""
    file = request.files.get("file")
    if not file:
        return jsonify({"error": "No file uploaded"}), 400

    try:
        df = pd.read_excel(BytesIO(file.read()))
        df.columns = [c.lower().strip() for c in df.columns]
        success = 0
        errors = []

        for index, row in df.iterrows():
            try:
                email = row.get("email")
                if pd.isna(email):
                    continue
                t = Teacher.query.filter_by(email=str(email).strip()).first()
                if not t:
                    errors.append(f"Row {index + 2}: Teacher not found: {email}")
                    continue

                course_codes_val = row.get("course_codes")
                if pd.notna(course_codes_val):
                    course_codes = [c.strip() for c in str(course_codes_val).replace(";", ",").split(",") if c.strip()]
                    matched = 0
                    for course_code in course_codes:
                        course = Course.query.filter_by(code=course_code).first()
                        if course and course not in t.qualified_courses:
                            t.qualified_courses.append(course)
                            matched += 1
                    success += matched
            except Exception as e:
                errors.append(f"Row {index + 2}: {str(e)}")

        db.session.commit()
        return jsonify({"message": f"Added {success} course bindings", "errors": errors}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500


# ── Column name normalizer for course import ──────────────────────────────────
_COURSE_COL_ALIASES = {
    "name": "name",
    "course": "name",
    "coursename": "name",
    "course_name": "name",
    "code": "code",
    "coursecode": "code",
    "course_code": "code",
    "course code": "code",
    "semester": "semester",
    "sem": "semester",
    "sem_no": "semester",
    "type": "type",
    "course_type": "type",
    "coursetype": "type",
    "programcode": "programcode",
    "program_code": "programcode",
    "progcode": "programcode",
    "program": "program",
    "prog": "program",
    "deptcode": "deptcode",
    "dept_code": "deptcode",
    "departmentcode": "deptcode",
    "department_code": "deptcode",
    "dept": "deptcode",
    "department": "deptcode",
    "l": "l",
    "lecture": "l",
    "lecturehours": "l",
    "lecture_hours": "l",
    "t": "t",
    "tutorial": "t",
    "tutorialhours": "t",
    "tutorial_hours": "t",
    "p": "p",
    "practical": "p",
    "practicalhours": "p",
    "practical_hours": "p",
    "weeklyhours": "weeklyhours",
    "weekly_hours": "weeklyhours",
    "hoursperweek": "weeklyhours",
    "credits": "weeklyhours",
    "credit": "weeklyhours",
}


def _normalize_course_columns(df):
    """Normalize course import DataFrame columns to case-insensitive standard names."""
    mapping = {}
    for col in df.columns:
        key = str(col).strip().lower()
        if key in _COURSE_COL_ALIASES:
            mapping[col] = _COURSE_COL_ALIASES[key]
        else:
            mapping[col] = col  # keep original if no alias
    df = df.rename(columns=mapping)
    return df


@resources_bp.route("/courses/import", methods=["POST"])
@roles_required("admin")
def bulk_import_courses():
    file = request.files.get("file")
    if not file:
        return jsonify({"error": "No file uploaded"}), 400

    try:
        file_bytes = file.read()
        df = pd.read_excel(BytesIO(file_bytes))
        df.columns = [str(column).strip() for column in df.columns]
        if "course" not in [c.lower() for c in df.columns] and "code" not in [c.lower() for c in df.columns]:
            # Try reading with header=3 for non-standard formats
            df = pd.read_excel(BytesIO(file_bytes), header=3)
            df.columns = [str(column).strip() for column in df.columns]

        # Normalize all column names to case-insensitive standard names
        df = _normalize_course_columns(df)

        success = 0
        errors = []
        current_program = None

        for index, row in df.iterrows():
            try:
                name = _normalize_optional_string(row.get("name") or row.get("Course"))
                code = _normalize_optional_string(row.get("code") or row.get("Course Code"))

                if not name or not code:
                    raise Exception("Missing required field: course name or code")

                semester_name = row.get("semester")

                # Program resolution: prefer explicit ProgramCode, then Program column
                explicit_program_code = _normalize_optional_string(row.get("programcode"))
                program_cell = _normalize_optional_string(row.get("program"))

                # Only inherit from previous row if this row has NO program info at all
                semester_from_program = None
                program_code = None

                if explicit_program_code:
                    program_code = explicit_program_code
                elif program_cell:
                    # Check if Program cell has trailing semester number (e.g., "BCA 1")
                    program_code_from_program, semester_from_program = _parse_program_semester(program_cell)
                    program_code = program_code_from_program
                elif current_program:
                    program_code_parsed, semester_from_program = _parse_program_semester(current_program)
                    program_code = program_code_parsed

                if program_cell and not explicit_program_code:
                    current_program = program_cell

                semester = _parse_semester_value(semester_name) or semester_from_program

                # L/T/P hours — also check LectureHours/TutorialHours/PracticalHours variants
                lecture_hours = _parse_non_negative_int(row.get("l"), "L") or _parse_non_negative_int(
                    row.get("LectureHours"), "LectureHours"
                )
                tutorial_hours = _parse_non_negative_int(row.get("t"), "T") or _parse_non_negative_int(
                    row.get("TutorialHours"), "TutorialHours"
                )
                practical_hours = _parse_non_negative_int(row.get("p"), "P") or _parse_non_negative_int(
                    row.get("PracticalHours"), "PracticalHours"
                )

                # WeeklyHours from Excel
                weekly_hours = None
                if pd.notna(row.get("weeklyhours")):
                    try:
                        weekly_hours = int(row.get("weeklyhours"))
                    except (ValueError, TypeError):
                        pass
                # Fallback: derive weekly_hours from L+T+P if not set
                if weekly_hours is None:
                    ltp = lecture_hours + tutorial_hours + practical_hours
                    if ltp > 0:
                        weekly_hours = ltp

                course_type = _infer_course_type(
                    row.get("type"),
                    lecture_hours,
                    tutorial_hours,
                    practical_hours,
                )

                # Also infer from course code suffix (e.g., ends with 'P' = Lab)
                if course_type == "Theory" and code and code.endswith("P"):
                    course_type = "Lab"

                # Resolve department — prefer explicit DeptCode, then infer from program
                dept_code_val = _normalize_optional_string(row.get("deptcode"))
                if dept_code_val:
                    dept = _resolve_course_department(dept_code=dept_code_val)
                elif program_code:
                    dept = _resolve_course_department(program_code=program_code)
                else:
                    raise Exception("Missing required field: DeptCode or Program")

                existing = Course.query.filter_by(code=code).first()

                # Resolve program BEFORE creating/updating course
                program_obj = None
                if program_code:
                    program_obj = _fuzzy_match_program_code(program_code)

                if existing:
                    course = existing
                    course.name = name
                    course.code = code
                    course.semester = semester
                    course.semester_name = _normalize_optional_string(semester_name)
                    course.course_type = course_type
                    course.program_id = program_obj.id if program_obj else None
                    course.department_id = dept.id
                    course.lecture_hours = lecture_hours
                    course.tutorial_hours = tutorial_hours
                    course.practical_hours = practical_hours
                    course.weekly_hours = weekly_hours
                else:
                    # Create with ALL required fields to prevent NOT NULL violations
                    course = Course(
                        name=name,
                        code=code,
                        semester=semester,
                        semester_name=_normalize_optional_string(semester_name),
                        course_type=course_type,
                        department_id=dept.id,
                        program_id=program_obj.id if program_obj else None,
                        lecture_hours=lecture_hours,
                        tutorial_hours=tutorial_hours,
                        practical_hours=practical_hours,
                        weekly_hours=weekly_hours,
                    )
                    db.session.add(course)

                success += 1
            except Exception as e:
                db.session.rollback()
                errors.append(f"Row {index + 2}: {str(e)}")

        db.session.commit()
        result = {"message": f"Successfully processed {success} courses"}
        if errors:
            result["errors"] = errors
            result["error_count"] = len(errors)
        return jsonify(result), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": f"Failed to process file: {str(e)}"}), 500


@resources_bp.route("/rooms/import", methods=["POST"])
@roles_required("admin")
def import_rooms():
    file = request.files.get("file")
    if not file:
        return jsonify({"error": "No file uploaded"}), 400

    try:
        df = pd.read_excel(BytesIO(file.read()))
        df.columns = [c.strip() for c in df.columns]

        success = 0
        errors = []

        for index, row in df.iterrows():
            try:
                name = row.get("Name")
                capacity = row.get("Capacity")
                room_type = row.get("Type", "Classroom")
                dept_code = row.get("Department Code")
                program_code = row.get("Program Code")

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
                program = None
                if pd.notna(program_code):
                    program = Program.query.filter_by(code=str(program_code).strip()).first()
                    if not program:
                        raise Exception(f"Program was not found with code='{program_code}'")
                    program_id = program.id
                    # Auto-set department_id from program's department for department-level sharing
                    if program.department_id and not department_id:
                        department_id = program.department_id

                if str(room_type).strip().lower() == "lab" and not program_id:
                    raise Exception("Program Code is required for lab rooms")

                # Map room types to standardized values
                raw_type = str(room_type).strip().lower()
                if raw_type == "lecture":
                    mapped_type = "Classroom"
                elif raw_type == "moot_court":
                    mapped_type = "Moot Court"
                elif raw_type == "lab":
                    mapped_type = "Lab"
                else:
                    mapped_type = str(room_type).strip()

                room = Room(
                    name=str(name).strip(),
                    capacity=int(capacity),
                    room_type=mapped_type,
                    department_id=department_id,
                    program_id=program_id,
                )
                db.session.add(room)
                success += 1
            except Exception as e:
                errors.append(f"Row {index + 2}: {str(e)}")

        db.session.commit()
        return jsonify({"message": f"Successfully processed {success} rooms", "errors": errors}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": f"Failed to process file: {str(e)}"}), 500
