from app import create_app, db
from app.models import Program, Course, ProgramCourse, Department
import pandas as pd

app = create_app()

def import_curriculum_from_excel(excel_file_path):
    """Import curriculum data from Excel file"""
    with app.app_context():
        # Read Excel file
        df = pd.read_excel(excel_file_path)
        
        print(f"📊 Found {len(df)} courses in Excel file")
        
        # Get or create Computer Science department
        dept = Department.query.filter_by(name='Department of Computer Science and Information Technology').first()
        if not dept:
            dept = Department(name='Department of Computer Science and Information Technology')
            db.session.add(dept)
            db.session.commit()
            print(f"✅ Created department: {dept.name}")
        
        # Process each row
        for index, row in df.iterrows():
            try:
                # Extract data
                course_code = str(row['code']).strip()
                course_name = str(row['Name']).strip()
                course_type = str(row['Type']).strip()
                semester_str = str(row['Semester']).strip()
                program_name = str(row['Program']).strip()
                
                # Parse semester number (I -> 1, II -> 2, etc.)
                semester_map = {
                    'I': 1, 'II': 2, 'III': 3, 'IV': 4,
                    'V': 5, 'VI': 6, 'VII': 7, 'VIII': 8,
                    'Semester I': 1, 'Semester II': 2, 'Semester III': 3, 'Semester IV': 4,
                    'Semester V': 5, 'Semester VI': 6, 'Semester VII': 7, 'Semester VIII': 8
                }
                semester_number = semester_map.get(semester_str, int(semester_str.split()[-1]) if 'Semester' in semester_str else 1)
                
                # Get or create program
                program = Program.query.filter_by(code=program_name).first()
                if not program:
                    program = Program(
                        code=program_name,
                        name=program_name,
                        department_id=dept.id
                    )
                    db.session.add(program)
                    db.session.flush()  # Get ID without committing
                
                # Get or create course
                course = Course.query.filter_by(code=course_code).first()
                if not course:
                    course = Course(
                        code=course_code,
                        name=course_name,
                        course_type=course_type,
                        department_id=dept.id,
                        credits=4  # Default credits
                    )
                    db.session.add(course)
                    db.session.flush()
                
                # Check if program-course mapping already exists
                existing = ProgramCourse.query.filter_by(
                    program_id=program.id,
                    course_id=course.id,
                    semester_number=semester_number
                ).first()
                
                if not existing:
                    # Create program-course mapping
                    prog_course = ProgramCourse(
                        program_id=program.id,
                        course_id=course.id,
                        semester_number=semester_number
                    )
                    db.session.add(prog_course)
                    print(f"✅ Added: {program_name} - Semester {semester_number} - {course_code} ({course_name})")
                else:
                    print(f"ℹ️ Already exists: {program_name} - Semester {semester_number} - {course_code}")
                    
            except Exception as e:
                print(f"❌ Error processing row {index}: {e}")
                continue
        
        # Commit all changes
        db.session.commit()
        print("✨ Curriculum import completed successfully!")

def update_batch_current_semesters():
    """Update current semester for existing batches"""
    with app.app_context():
        # Example: Update BCA 2023 to semester 6, BCA 2024 to semester 4
        batches = Batch.query.all()
        
        for batch in batches:
            if '2023' in batch.name and 'BCA' in batch.program.code:
                batch.current_semester = 6
                print(f"📚 Updated {batch.name} to Semester {batch.current_semester}")
            elif '2024' in batch.name and 'BCA' in batch.program.code:
                batch.current_semester = 4
                print(f"📚 Updated {batch.name} to Semester {batch.current_semester}")
        
        db.session.commit()
        print("✅ Batch semesters updated!")

if __name__ == '__main__':
    # Import curriculum (you'll need to provide the Excel file path)
    excel_path = input("Enter Excel file path: ").strip()
    if excel_path:
        import_curriculum_from_excel(excel_path)
    
    # Update batch semesters
    update_batch_current_semesters()
