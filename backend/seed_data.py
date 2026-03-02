from app import create_app, db
from app.models import Department, Program, Batch, Section, Course, Teacher, Room, Workload
from app.models.user import User
import random

app = create_app()

def seed():
    with app.app_context():
        # Reset database
        print("Resetting database...")
        db.drop_all()
        db.create_all()

        print("Seeding Users...")
        admin = User(username="admin", email="admin@example.com", role="admin")
        admin.set_password("password123")
        db.session.add(admin)
        db.session.commit()

        # Definitions
        dept_info = [
            ("Information Technology", "IT"),
            ("Computer Science", "CS"),
            ("Electrical Engineering", "EE"),
            ("Mechanical Engineering", "ME"),
            ("Civil Engineering", "CE"),
            ("Business Administration", "BA")
        ]
        
        program_names = [
            "B.Tech", "M.Tech", "BCA", "MCA", "MBA", "B.Sc"
        ]
        
        course_subjects = {
            "IT": ["Web Dev", "Database", "Networking", "AI", "Cyber Security", "Cloud Computing"],
            "CS": ["Algorithms", "Data Structures", "OS", "Theory of Comp", "Software Eng", "Compiler"],
            "EE": ["Circuits", "Control Systems", "Digital Signal", "Power Electronics", "Sensors", "Robotics"],
            "ME": ["Thermodynamics", "Materials", "Fluid Mechanics", "Design", "Dynamics", "Manufacturing"],
            "CE": ["Structural Analysis", "Geotech", "Surveying", "Environment", "Concrete Tech", "Hydraulics"],
            "BA": ["Marketing", "Finance", "HR", "Operations", "Analytics", "Strategy"]
        }

        room_types = ["Classroom", "Lab", "Seminar Hall"]
        days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
        slots = ["09:00-10:00", "10:00-11:00", "11:00-12:00", "12:00-13:00", "14:00-15:00", "15:00-16:00"]

        print("Seeding Rooms...")
        rooms = []
        for i in range(1, 41):
            rtype = "Lab" if i % 5 == 0 else random.choice(room_types)
            cap = random.choice([30, 40, 60, 80, 100])
            r = Room(name=f"Room {i:02}", room_type=rtype, capacity=cap)
            db.session.add(r)
            rooms.append(r)
        db.session.commit()

        for d_name, d_code in dept_info:
            print(f"Seeding Department: {d_name}")
            dept = Department(name=d_name, code=d_code)
            db.session.add(dept)
            db.session.commit()

            # Program
            p_name = f"{random.choice(program_names)} {d_code}"
            prog = Program(name=p_name, code=f"{d_code}-PROG", department_id=dept.id)
            db.session.add(prog)
            db.session.commit()

            # Batches (At least 2 per program)
            for year in ["2023", "2024"]:
                batch = Batch(name=f"Batch {year}", academic_year=f"{year}-{int(year)+1}", program_id=prog.id)
                db.session.add(batch)
                db.session.commit()
                
                # Sections (At least one batch per department has 2 sections)
                num_sections = 2 if year == "2023" else 1
                for s in range(num_sections):
                    sec = Section(name=f"Section {chr(65+s)}", batch_id=batch.id, student_count=random.randint(20, 50))
                    db.session.add(sec)

            # Courses (Random courses)
            dept_courses = []
            for i, subj in enumerate(course_subjects[d_code]):
                ctype = "Lab" if i % 3 == 0 else "Theory"
                c = Course(
                    name=subj, 
                    code=f"{d_code}{100+i}", 
                    credits=random.randint(2, 4), 
                    department_id=dept.id, 
                    course_type=ctype
                )
                db.session.add(c)
                dept_courses.append(c)
            db.session.commit()

            # Teachers (At least 10 per department)
            for i in range(1, 11):
                t_name = f"Prof. {d_code} User {i}"
                t_email = f"teacher{i}_{d_code.lower()}@university.edu"
                teacher = Teacher(name=t_name, email=t_email)
                teacher.departments.append(dept)
                
                # Each teacher qualified for 2-4 random dept courses
                qualified = random.sample(dept_courses, k=random.randint(2, max(2, len(dept_courses)//2)))
                for q in qualified:
                    teacher.qualified_courses.append(q)
                
                # Random availability (80% available for most slots)
                availability = {}
                for day in days:
                    available_slots = [s for s in slots if random.random() > 0.2]
                    if available_slots:
                        availability[day] = available_slots
                teacher.availability = availability
                
                db.session.add(teacher)
            db.session.commit()

            # Assign Workloads (CRITICAL: Scheduling depends on this)
            print(f"Creating Workloads for {d_name}...")
            # Get all sections for this department's programs
            all_dept_sections = Section.query.join(Batch).join(Program).filter(Program.department_id == dept.id).all()
            all_dept_teachers = Teacher.query.join(Teacher.departments).filter(Department.id == dept.id).all()

            for section in all_dept_sections:
                # Assign 3-5 random courses to this section
                assigned_courses = random.sample(dept_courses, k=min(len(dept_courses), random.randint(3, 5)))
                for course in assigned_courses:
                    # Find a teacher qualified for this course
                    qualified_teachers = [t for t in all_dept_teachers if course in t.qualified_courses]
                    if qualified_teachers:
                        teacher = random.choice(qualified_teachers)
                        workload = Workload(
                            teacher_id=teacher.id,
                            course_id=course.id,
                            section_id=section.id,
                            hours_per_week=2 if course.course_type == 'Lab' else 3,
                            session_duration=1
                        )
                        db.session.add(workload)

        db.session.commit()
        print("Seeding completed successfully!")

if __name__ == "__main__":
    seed()
