from .. import db

class Course(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    code = db.Column(db.String(50), nullable=False)
    semester = db.Column(db.Integer, nullable=True)
    semester_name = db.Column(db.String(50), nullable=True) # "Semester I"
    course_type = db.Column(db.String(50), nullable=True) # Theory or Lab
    department_id = db.Column(db.Integer, db.ForeignKey('department.id'), nullable=False)
    
    # Direct program link (to replace fuzzy matching on program_code)
    program_id = db.Column(db.Integer, db.ForeignKey('programs.id'), nullable=True)
    program = db.relationship('Program', backref='courses')
    lecture_hours = db.Column(db.Integer, nullable=False, default=0)
    tutorial_hours = db.Column(db.Integer, nullable=False, default=0)
    practical_hours = db.Column(db.Integer, nullable=False, default=0)

    @property
    def weekly_hours(self):
        return (
            int(self.lecture_hours or 0)
            + int(self.tutorial_hours or 0)
            + int(self.practical_hours or 0)
        )

    def __repr__(self):
        return f'<Course {self.code or self.name}>'
