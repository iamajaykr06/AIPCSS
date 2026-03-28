from .. import db

class Room(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(50), unique=True, nullable=False)
    capacity = db.Column(db.Integer, nullable=False)
    room_type = db.Column(db.String(20), default='Classroom')
    department_id = db.Column(db.Integer, db.ForeignKey('department.id'), nullable=True)  # Nullable for general purpose rooms
    # Program-specific labs (e.g., Pharmacy lab only for Pharmacy program).
    # Keep nullable so lecture/class rooms remain globally reusable.
    program_id = db.Column(db.Integer, db.ForeignKey('programs.id'), nullable=True)