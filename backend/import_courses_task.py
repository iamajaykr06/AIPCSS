import sys
import os
import pandas as pd
import re
import traceback
# Add backend to sys.path
backend_path = r'c:\Users\Ajay Kumar\OneDrive\Desktop\AIPSCSS\backend'
if backend_path not in sys.path:
    sys.path.append(backend_path)

from app import create_app, db
from app.models import Department, Program, Course, ProgramCourse

app = create_app()

def import_courses(file_path):
    print(f"Reading {file_path}...")
    df = pd.read_excel(file_path)
    
    with app.app_context():
        # Clean slate
        print("Emptying curriculum tables...")
        ProgramCourse.query.delete()
        Course.query.delete()
        Program.query.delete()
        db.session.commit()

        # Build dynamic dept mapping
        dept_ids = {d.code.strip().upper(): d.id for d in Department.query.all()}
        print(f"Mapped Departments: {list(dept_ids.keys())}")
        
        success_count = 0
        program_ids = {} # cache for programs
        
        for index, row in df.iterrows():
            try:
                name = str(row['Name']).strip()
                code_xl = str(row['code']).strip() if pd.notna(row['code']) else None
                semester_xl = str(row['Semester']).strip()
                type_val = str(row['Type']).strip()
                program_xl = str(row['Program']).strip()
                dept_code_xl = str(row['DeptCode']).strip().upper()
                
                # Numeric Semester
                semester_map = {'I': 1, 'II': 2, 'III': 3, 'IV': 4, 'V': 5, 'VI': 6, 'VII': 7, 'VIII': 8}
                if semester_xl.upper() in semester_map:
                    semester_num = semester_map[semester_xl.upper()]
                else:
                    match = re.search(r'\d+', semester_xl)
                    semester_num = int(match.group()) if match else 1
                
                # Dept lookup
                d_id = dept_ids.get(dept_code_xl)
                if not d_id:
                    # try fuzzy mapping for CSEIT
                    if 'CSE' in dept_code_xl or 'IT' in dept_code_xl:
                        d_id = dept_ids.get('CSEIT')
                
                # Create Course
                course = Course(
                    name=name,
                    code=code_xl,
                    semester=semester_num,
                    semester_name=semester_xl,
                    course_type=type_val,
                    program_code=program_xl,
                    department_code=dept_code_xl,
                    department_id=d_id
                )
                db.session.add(course)
                db.session.flush() 
                
                # Program linkage
                if program_xl:
                    prog_code_upper = program_xl.upper()
                    if prog_code_upper not in program_ids:
                        prog = Program.query.filter_by(code=prog_code_upper).first()
                        if not prog:
                            prog = Program(name=f"{program_xl} Program", code=prog_code_upper, department_id=d_id)
                            db.session.add(prog)
                            db.session.flush()
                        program_ids[prog_code_upper] = prog.id
                    
                    pc = ProgramCourse(
                        program_id=program_ids[prog_code_upper],
                        course_id=course.id,
                        semester_number=semester_num
                    )
                    db.session.add(pc)
                
                success_count += 1
            except Exception as e:
                print(f"FAILED row {index + 2}: {e}")
                print(traceback.format_exc())
                db.session.rollback()
                sys.exit(1)
            
            if success_count % 100 == 0:
                db.session.commit()

        db.session.commit()
    print(f"\n✨ IMPORT COMPLETE: {success_count} entries processed.")

if __name__ == "__main__":
    import_courses(r'c:\Users\Ajay Kumar\OneDrive\Desktop\AIPSCSS\courses.xlsx')
