from app import db
from app.models import Batch, ProgramCourse, Course

def get_current_courses_for_batch(batch_id):
    """Get all courses a batch should be taking in their current semester"""
    batch = Batch.query.get(batch_id)
    if not batch:
        return []
    
    # Get program courses for current semester
    program_courses = ProgramCourse.query.filter_by(
        program_id=batch.program_id,
        semester_number=batch.current_semester
    ).all()
    
    return [pc.course for pc in program_courses]

def get_batch_curriculum_overview(batch_id):
    """Get complete curriculum overview for a batch"""
    batch = Batch.query.get(batch_id)
    if not batch:
        return None
    
    # Get all program courses for this batch's program
    all_program_courses = ProgramCourse.query.filter_by(
        program_id=batch.program_id
    ).order_by(ProgramCourse.semester_number).all()
    
    # Organize by semester
    curriculum = {}
    for pc in all_program_courses:
        semester_key = f"Semester {pc.semester_number}"
        if semester_key not in curriculum:
            curriculum[semester_key] = []
        curriculum[semester_key].append({
            'code': pc.course.code,
            'name': pc.course.name,
            'type': pc.course.course_type,
            'credits': pc.course.credits
        })
    
    return {
        'batch_info': {
            'name': batch.name,
            'program': batch.program.code,
            'current_semester': batch.current_semester,
            'current_semester_display': f"Semester {batch.current_semester}"
        },
        'curriculum': curriculum,
        'current_courses': get_current_courses_for_batch(batch_id)
    }

def get_all_programs_with_curriculum():
    """Get all programs with their complete curriculum"""
    from app.models import Program
    
    programs = Program.query.all()
    result = []
    
    for program in programs:
        program_courses = ProgramCourse.query.filter_by(
            program_id=program.id
        ).order_by(ProgramCourse.semester_number).all()
        
        # Organize by semester
        curriculum = {}
        for pc in program_courses:
            semester_key = f"Semester {pc.semester_number}"
            if semester_key not in curriculum:
                curriculum[semester_key] = []
            curriculum[semester_key].append({
                'code': pc.course.code,
                'name': pc.course.name,
                'type': pc.course.course_type,
                'credits': pc.course.credits
            })
        
        result.append({
            'program_code': program.code,
            'program_name': program.name,
            'curriculum': curriculum
        })
    
    return result

# Example usage functions
def demo_usage():
    """Demonstrate how to use the curriculum system"""
    from app import create_app
    app = create_app()
    
    with app.app_context():
        # Get current courses for BCA 2023 batch
        bca_2023_batch = Batch.query.filter_by(name='Batch 2023-2026').first()
        if bca_2023_batch:
            current_courses = get_current_courses_for_batch(bca_2023_batch.id)
            print(f"Current courses for {bca_2023_batch.name} (Semester {bca_2023_batch.current_semester}):")
            for course in current_courses:
                print(f"  - {course.code}: {course.name} ({course.course_type})")
        
        # Get complete curriculum overview
        overview = get_batch_curriculum_overview(bca_2023_batch.id)
        if overview:
            print(f"\nComplete curriculum for {overview['batch_info']['program']}:")
            for semester, courses in overview['curriculum'].items():
                print(f"\n{semester}:")
                for course in courses:
                    print(f"  - {course['code']}: {course['name']} ({course['type']})")

if __name__ == '__main__':
    demo_usage()
