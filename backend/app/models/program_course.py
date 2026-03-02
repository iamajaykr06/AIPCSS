from .. import db

class ProgramCourse(db.Model):
    __tablename__ = 'program_courses'
    
    id = db.Column(db.Integer, primary_key=True)
    program_id = db.Column(db.Integer, db.ForeignKey('programs.id'), nullable=False)
    course_id = db.Column(db.Integer, db.ForeignKey('course.id'), nullable=False)
    semester_number = db.Column(db.Integer, nullable=False)  # 1-8 (I-VIII)
    
    # Unique constraint: same course can't appear twice in same program semester
    __table_args__ = (
        db.UniqueConstraint('program_id', 'semester_number', 'course_id'),
        db.Index('idx_program_semester', 'program_id', 'semester_number'),
    )
    
    # Relationships
    program = db.relationship('Program', backref='program_courses')
    course = db.relationship('Course', backref='program_courses')
    
    def __repr__(self):
        return f'<ProgramCourse {self.program.code} - Sem {self.semester_number} - {self.course.code}>'

    def to_dict(self):
        return {
            'id': self.id,
            'program_id': self.program_id,
            'program_code': self.program.code if self.program else None,
            'course_id': self.course_id,
            'course_code': self.course.code if self.course else None,
            'course_name': self.course.name if self.course else None,
            'course_type': self.course.course_type if self.course else None,
            'semester_number': self.semester_number,
            'semester_display': f"Semester {self.semester_number}"
        }
