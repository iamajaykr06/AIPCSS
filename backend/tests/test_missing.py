from app.scheduler_new.data_loader import DataLoader
from flask import current_app

loader = DataLoader(department_id=1)   # Change to your department ID
problem = loader.load_problem()

print(f"\n--- Diagnostic: Department {loader.department_id} ---")
print(f"Sections found: {len(problem.sections)}")
print(f"Total faculty : {len(problem.faculty)}")
print(f"Total rooms   : {len(problem.rooms)}")

# Map for lookup
course_map = {c.id: c for c in problem.courses}

for s in problem.sections:
    print(f"\nSection: {s.name} | Program: {s.program_code!r} | Semester: {s.current_semester}")
    
    if not s.course_ids:
        print("  ⚠️  ZERO COURSES - No courses matched this program/semester.")
        continue

    for c_id in s.course_ids:
        course = course_map.get(c_id)
        if not course:
            print(f"  ❌ Course ID {c_id} NOT LOADED (not found in department?)")
            continue

        # Check teachers
        qual_f = [f.name for f in problem.faculty if course.id in f.qualified_course_ids]
        
        status = "✅ " + ", ".join(qual_f) if qual_f else "❌ NO TEACHER QUALIFIED!"
        print(f"  - {course.name[:30]:<30} | Status: {status}")
