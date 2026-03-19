from .. import db

class Course(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    code = db.Column(db.String(50), nullable=False)
    semester = db.Column(db.Integer, nullable=True)
    semester_name = db.Column(db.String(50), nullable=True) # "Semester I"
    course_type = db.Column(db.String(50), nullable=True) # Theory or Lab
    program_code = db.Column(db.String(50), nullable=True) # From Excel "Program"
    department_code = db.Column(db.String(50), nullable=False) # From Excel "DeptCode"
    department_id = db.Column(db.Integer, db.ForeignKey('department.id'), nullable=False)
    
    workloads = db.relationship('Workload', backref='course', lazy=True)

    def __repr__(self):
        return f'<Course {self.code or self.name}>'
