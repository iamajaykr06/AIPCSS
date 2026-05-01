"""
Copyright 2026 Zaid Alam, Ajay Kumar, Aboni Mohan Sahu, Rohit Kumar Yadav

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
"""

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
    
    # Relationships
    department = db.relationship('Department', backref='rooms')
    program = db.relationship('Program', backref='assigned_rooms')

    def __repr__(self):
        return f'<Room {self.name}>'
