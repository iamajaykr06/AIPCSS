from app import db
from app.models import Batch, Course, Department, Program, Section
from app.scheduler_new.data_loader import DataLoader


def _seed_section(app):
    with app.app_context():
        dept = Department(name="Computer Science", code="CSE")
        db.session.add(dept)
        db.session.flush()

        program = Program(name="BCA", code="BCA", department_id=dept.id)
        db.session.add(program)
        db.session.flush()

        batch = Batch(
            name="BCA 2025",
            code="BCA25",
            academic_year="2025",
            current_semester=2,
            program_id=program.id,
        )
        db.session.add(batch)
        db.session.flush()

        section = Section(name="A", batch_id=batch.id, student_count=30)
        db.session.add(section)
        db.session.commit()
        return {
            "department_id": dept.id,
            "department_code": dept.code,
            "program_code": program.code,
            "section_id": section.id,
        }


def test_scheduler_uses_explicit_course_workloads(app):
    seeded = _seed_section(app)

    with app.app_context():
        theory_course = Course(
            name="Algorithms",
            code="CSE201",
            semester=2,
            course_type="Theory",
            program_code=seeded["program_code"],
            department_code=seeded["department_code"],
            department_id=seeded["department_id"],
            lecture_hours=2,
            tutorial_hours=1,
            practical_hours=0,
        )
        single_slot_lab = Course(
            name="Algorithms Lab",
            code="CSE201P",
            semester=2,
            course_type="Lab",
            program_code=seeded["program_code"],
            department_code=seeded["department_code"],
            department_id=seeded["department_id"],
            lecture_hours=0,
            tutorial_hours=0,
            practical_hours=1,
        )
        db.session.add_all([theory_course, single_slot_lab])
        db.session.commit()

        problem = DataLoader(department_id=seeded["department_id"]).load_problem()
        course_map = {course.code: course for course in problem.courses}
        class_units = problem.get_section_courses()

        assert course_map["CSE201"].hours_per_week == 3
        assert course_map["CSE201P"].hours_per_week == 1
        assert class_units.count((problem.sections[0].id, theory_course.id, 1)) == 3
        assert (problem.sections[0].id, single_slot_lab.id, 1) in class_units


def test_scheduler_keeps_legacy_default_workloads_when_fields_are_blank(app):
    seeded = _seed_section(app)

    with app.app_context():
        legacy_theory = Course(
            name="Legacy Theory",
            code="CSE101",
            semester=2,
            course_type="Theory",
            program_code=seeded["program_code"],
            department_code=seeded["department_code"],
            department_id=seeded["department_id"],
        )
        legacy_lab = Course(
            name="Legacy Lab",
            code="CSE101P",
            semester=2,
            course_type="Lab",
            program_code=seeded["program_code"],
            department_code=seeded["department_code"],
            department_id=seeded["department_id"],
        )
        db.session.add_all([legacy_theory, legacy_lab])
        db.session.commit()

        problem = DataLoader(department_id=seeded["department_id"]).load_problem()
        course_map = {course.code: course for course in problem.courses}
        class_units = problem.get_section_courses()

        assert course_map["CSE101"].hours_per_week == 3
        assert course_map["CSE101P"].hours_per_week == 2
        assert class_units.count((problem.sections[0].id, legacy_theory.id, 1)) == 3
        assert (problem.sections[0].id, legacy_lab.id, 2) in class_units
