from .. import db

# Association table for Mega-Lectures (Multiple sections in one entry)
entry_sections = db.Table('entry_sections',
    db.Column('entry_id', db.Integer, db.ForeignKey('timetable_entries.id'), primary_key=True),
    db.Column('section_id', db.Integer, db.ForeignKey('sections.id'), primary_key=True)
)

class TimetableEntry(db.Model):
    __tablename__ = 'timetable_entries'
    
    id = db.Column(db.Integer, primary_key=True)
    day = db.Column(db.String(10), nullable=False)
    timeslot = db.Column(db.String(20), nullable=False)
    
    # RELATIONS
    course_id = db.Column(db.Integer, db.ForeignKey('course.id'), nullable=False)
    teacher_id = db.Column(db.Integer, db.ForeignKey('teacher.id'), nullable=False)
    room_id = db.Column(db.Integer, db.ForeignKey('room.id'), nullable=False)
    department_id = db.Column(db.Integer, db.ForeignKey('department.id'), nullable=False)
    
    # Many-to-Many with Section
    sections = db.relationship('Section', secondary=entry_sections, 
                               backref=db.backref('timetable_entries', lazy='dynamic'))

    def __repr__(self):
        return f'<TimetableEntry {self.day} {self.timeslot}>'
