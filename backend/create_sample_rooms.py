#!/usr/bin/env python3
"""
Create sample rooms with department assignments
"""

import os
import sys
sys.path.append(os.path.dirname(__file__))

from app import create_app, db
from app.models import Room, Department

def create_sample_rooms():
    """Create sample rooms with department assignments"""
    app = create_app()
    with app.app_context():
        # Get departments
        departments = {dept.code: dept for dept in Department.query.all()}
        print(f"Available departments: {list(departments.keys())}")
        
        # Create sample rooms
        sample_rooms = [
            # IT/CS Department rooms
            Room(name="CS Lab 101", capacity=30, room_type="Lab", department_id=departments.get('CSEIT').id),
            Room(name="Computer Lab 201", capacity=25, room_type="Lab", department_id=departments.get('CSEIT').id),
            Room(name="IT Classroom 301", capacity=50, room_type="Classroom", department_id=departments.get('CSEIT').id),
            
            # Pharmacy Department rooms
            Room(name="Pharmacy Lab 101", capacity=20, room_type="Lab", department_id=departments.get('PHAR').id),
            Room(name="Pharmacy Classroom 201", capacity=30, room_type="Classroom", department_id=departments.get('PHAR').id),
            
            # General purpose rooms
            Room(name="Main Auditorium", capacity=200, room_type="Auditorium", department_id=None),
            Room(name="Conference Hall A", capacity=100, room_type="Lecture Hall", department_id=None),
            Room(name="Study Room 101", capacity=20, room_type="Classroom", department_id=None),
        ]
        
        # Add rooms to database
        for room in sample_rooms:
            db.session.add(room)
        
        db.session.commit()
        print(f"Created {len(sample_rooms)} sample rooms with department assignments")

if __name__ == '__main__':
    create_sample_rooms()
