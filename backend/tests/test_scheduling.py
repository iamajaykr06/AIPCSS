from app.models import TimetableEntry, Workload, Room, Department, Course
from app import db

def test_create_workload_success(client, sample_data):
    """Test successful workload assignment."""
    response = client.post('/api/scheduling/workloads', json={
        "teacher_id": 1, 
        "course_id": 1,
        "section_id": 1,
        "hours_per_week": 3
    })
    assert response.status_code == 201
    assert Workload.query.count() == 1

def test_create_workload_unqualified(client, sample_data):
    """Test workload assignment for unqualified teacher."""
    # Create an unqualified teacher contextually
    from app.models import Teacher
    with db.session.begin():
        bad_teacher = Teacher(name="Bad Teacher", email="bad@test.com")
        db.session.add(bad_teacher)
    
    response = client.post('/api/scheduling/workloads', json={
        "teacher_id": 2, 
        "course_id": 1,
        "section_id": 1
    })
    assert response.status_code == 400
    assert "not qualified" in response.get_json()['error']

def test_generate_timetable(client, sample_data):
    """Test the full generation algorithm."""
    # 1. Setup a valid workload first
    client.post('/api/scheduling/workloads', json={
        "teacher_id": 1,
        "course_id": 1,
        "section_id": 1,
        "hours_per_week": 2
    })
    
    # 2. Trigger generation
    response = client.post('/api/scheduling/generate', json={
        "department_id": 1
    })
    assert response.status_code == 200
    assert response.get_json()['entries'] == 2
    assert TimetableEntry.query.count() == 2

def test_department_room_filtering(client, sample_data):
    """Test that scheduling only uses department-specific rooms."""
    with db.session.begin():
        # Create a different department
        pharmacy_dept = Department(name="Pharmacy", code="PHARM")
        db.session.add(pharmacy_dept)
        db.session.commit()
        
        # Create a pharmacy lab (should NOT be used for IT department)
        pharmacy_lab = Room(name="Pharmacy Lab", capacity=20, room_type="Lab", department_id=pharmacy_dept.id)
        db.session.add(pharmacy_lab)
        
        # Create an IT lab (should be used for IT department)
        it_lab = Room(name="IT Lab", capacity=30, room_type="Lab", department_id=sample_data["dept"].id)
        db.session.add(it_lab)
        
        # Create a general purpose room (should be available to all)
        general_room = Room(name="General Hall", capacity=50, room_type="Classroom")
        db.session.add(general_room)
    
    # Create a lab course for IT department
    lab_course = Course(name="IT Lab", code="LAB1", credits=2, department_id=sample_data["dept"].id, course_type="Lab")
    with db.session.begin():
        db.session.add(lab_course)
        db.session.commit()
    
    # Create workload for lab course
    client.post('/api/scheduling/workloads', json={
        "teacher_id": 1,
        "course_id": lab_course.id,
        "section_id": 1,
        "hours_per_week": 2
    })
    
    # Generate timetable for IT department
    response = client.post('/api/scheduling/generate', json={
        "department_id": sample_data["dept"].id
    })
    assert response.status_code == 200
    
    # Verify that IT Lab or General Hall was used, but NOT Pharmacy Lab
    entries = TimetableEntry.query.all()
    room_ids_used = [entry.room_id for entry in entries]
    
    pharmacy_lab = Room.query.filter_by(name="Pharmacy Lab").first()
    it_lab = Room.query.filter_by(name="IT Lab").first()
    general_room = Room.query.filter_by(name="General Hall").first()
    
    # Pharmacy lab should NOT be in the used rooms
    assert pharmacy_lab.id not in room_ids_used
    
    # Either IT lab or general room should be used
    assert it_lab.id in room_ids_used or general_room.id in room_ids_used
