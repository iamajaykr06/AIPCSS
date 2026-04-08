from .. import db

class WorkloadAllocation(db.Model):
    """
    Explicit mapping of which teacher teaches which course for which section.
    This replaces fuzzy matching and qualification-based guessing.
    """
    __tablename__ = 'workload_allocations'
    __table_args__ = (
        db.UniqueConstraint('section_id', 'course_id', name='_section_course_uc'),
    )
    
    id = db.Column(db.Integer, primary_key=True)
    
    # 1. Scope (Where is this being taught?)
    section_id = db.Column(db.Integer, db.ForeignKey('sections.id'), nullable=False)
    
    # 2. Content (What is being taught?)
    course_id = db.Column(db.Integer, db.ForeignKey('course.id'), nullable=False)
    
    # 3. Resource (Who is teaching it?)
    teacher_id = db.Column(db.Integer, db.ForeignKey('teacher.id'), nullable=False)
    
    # Relationships for easy access
    section = db.relationship('Section', backref=db.backref('workloads', cascade='all, delete-orphan'))
    course = db.relationship('Course', backref='workloads')
    teacher = db.relationship('Teacher', backref='workloads')

    def __repr__(self):
        return f'<Workload {self.section_id}:{self.course_id}->{self.teacher_id}>'
