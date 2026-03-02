from app import create_app, db
from app.models import Batch

app = create_app()

def add_current_semester_column():
    """Add current_semester column to batches table"""
    with app.app_context():
        # Check if column already exists
        inspector = db.inspect(db.engine)
        columns = [col['name'] for col in inspector.get_columns('batches')]
        
        if 'current_semester' not in columns:
            # Add the column
            with db.engine.connect() as conn:
                conn.execute(db.text('ALTER TABLE batches ADD COLUMN current_semester INTEGER DEFAULT 1'))
                conn.commit()
            print('✅ Added current_semester column to batches table')
        else:
            print('ℹ️ current_semester column already exists')

def create_program_course_table():
    """Create program_courses table"""
    with app.app_context():
        # Check if table already exists
        inspector = db.inspect(db.engine)
        tables = inspector.get_table_names()
        
        if 'program_courses' not in tables:
            # Create the table
            ProgramCourse.__table__.create(db.engine)
            print('✅ Created program_courses table')
        else:
            print('ℹ️ program_courses table already exists')

if __name__ == '__main__':
    print("🔧 Updating database schema...")
    add_current_semester_column()
    
    # Import here to avoid circular imports
    from app.models.program_course import ProgramCourse
    create_program_course_table()
    
    print("✨ Database schema updated successfully!")
