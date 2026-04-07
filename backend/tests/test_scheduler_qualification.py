from app import db
from app.models import Batch, Course, Department, Program, Room, Section, Teacher
from app.scheduler_new.data_loader import DataLoader
from app.scheduler_new.hybrid_engine import HybridSchedulerEngine


def _seed_scheduler_data():
    dept = Department(name="IT", code="IT")
    db.session.add(dept)
    db.session.flush()

    program = Program(name="BCA", code="BCA", department_id=dept.id)
    db.session.add(program)
    db.session.flush()

    batch = Batch(
        name="BCA 2025",
        code="BCA25",
        academic_year="2025",
        program_id=program.id,
        current_semester=1,
    )
    db.session.add(batch)
    db.session.flush()

    section = Section(name="A", batch_id=batch.id, student_count=30)
    db.session.add(section)

    qualified_course = Course(
        name="Programming Fundamentals",
        code="IT101",
        semester=1,
        course_type="Theory",
        program_code=program.code,
        department_code=dept.code,
        department_id=dept.id,
    )
    unqualified_course = Course(
        name="Computer Networks",
        code="IT102",
        semester=1,
        course_type="Theory",
        program_code=program.code,
        department_code=dept.code,
        department_id=dept.id,
    )
    db.session.add_all([qualified_course, unqualified_course])
    db.session.flush()

    teacher = Teacher(name="Qualified Teacher", email="qualified@example.com")
    teacher.qualified_courses.append(qualified_course)
    db.session.add(teacher)

    room = Room(
        name="101",
        capacity=40,
        room_type="Classroom",
        department_id=dept.id,
    )
    db.session.add(room)
    db.session.commit()

    return dept, qualified_course, unqualified_course, teacher


def test_data_loader_keeps_unqualified_courses_empty(app):
    with app.app_context():
        dept, qualified_course, unqualified_course, teacher = _seed_scheduler_data()

        problem = DataLoader(department_id=dept.id).load_problem()
        course_map = {course.code: course for course in problem.courses}

        assert course_map[qualified_course.code].qualified_faculty_ids == {teacher.id}
        assert course_map[unqualified_course.code].qualified_faculty_ids == set()


def test_hybrid_reports_missing_qualified_faculty(app):
    with app.app_context():
        dept, _, unqualified_course, _ = _seed_scheduler_data()

        problem = DataLoader(department_id=dept.id).load_problem()
        result = HybridSchedulerEngine(problem).solve()

        reasons = {
            (item["section"], item["course"]): item["reason"]
            for item in result.stats.get("failed_details", [])
        }

        assert any(
            reason == f"No qualified faculty configured for course {unqualified_course.code}"
            for reason in reasons.values()
        )
