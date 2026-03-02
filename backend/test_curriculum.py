from app import create_app
from app.models import Batch, ProgramCourse, Course, Program

def test_curriculum_system():
    """Test the curriculum system with current data"""
    app = create_app()
    
    with app.app_context():
        print("🎓 Testing Curriculum System")
        print("=" * 50)
        
        # Get BCA CS program
        bca_program = Program.query.filter_by(code='CS-PROG').first()
        if not bca_program:
            print("❌ BCA CS program not found")
            return
        
        print(f"📚 Program: {bca_program.code} - {bca_program.name}")
        
        # Show all program courses
        program_courses = ProgramCourse.query.filter_by(program_id=bca_program.id).order_by(ProgramCourse.semester_number).all()
        
        if not program_courses:
            print("❌ No curriculum found for BCA CS program")
            print("💡 Please import your Excel data first using: python import_curriculum.py")
            return
        
        # Organize by semester
        curriculum = {}
        for pc in program_courses:
            semester_key = f"Semester {pc.semester_number}"
            if semester_key not in curriculum:
                curriculum[semester_key] = []
            curriculum[semester_key].append(pc.course)
        
        print("\n📖 Complete Curriculum:")
        for semester, courses in curriculum.items():
            print(f"\n{semester}:")
            for course in courses:
                print(f"  📚 {course.code}: {course.name} ({course.course_type})")
        
        # Show current batch information
        print("\n🎯 Current Batch Status:")
        bca_batches = Batch.query.filter_by(program_id=bca_program.id).all()
        
        for batch in bca_batches:
            current_courses = ProgramCourse.query.filter_by(
                program_id=batch.program_id,
                semester_number=batch.current_semester
            ).all()
            
            print(f"\n📅 {batch.name} - Current Semester: {batch.current_semester}")
            print(f"   Courses this semester:")
            for pc in current_courses:
                print(f"     📚 {pc.course.code}: {pc.course.name} ({pc.course.course_type})")

if __name__ == '__main__':
    test_curriculum_system()
