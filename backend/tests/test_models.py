from app import db
from app.models import Department, Teacher, Course, Room

def test_department_model(app):
    with app.app_context():
        dept = Department(name="Science", code="SCI")
        assert dept.name == "Science"
        assert dept.code == "SCI"

def test_teacher_qualification_link(app):
    with app.app_context():
        t = Teacher(name="Dr. Smith", email="smith@test.com")
        c = Course(name="Bio", code="B1", credits=3)
        t.qualified_courses.append(c)
        assert c in t.qualified_courses
        assert t in c.qualified_teachers

def test_room_model(app):
    with app.app_context():
        dept = Department(name="IT", code="IT")
        db.session.add(dept)
        db.session.commit()
        
        room = Room(name="Lab 101", capacity=30, room_type="Lab", department_id=dept.id)
        assert room.name == "Lab 101"
        assert room.capacity == 30
        assert room.room_type == "Lab"
        assert room.department_id == dept.id
        
        # Test general purpose room (no department)
        general_room = Room(name="Hall A", capacity=100, room_type="Classroom")
        assert general_room.department_id is None
