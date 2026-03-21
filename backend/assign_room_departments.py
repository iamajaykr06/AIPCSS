#!/usr/bin/env python3
"""
Script to assign departments to existing rooms based on room naming patterns.
This ensures BCA batches don't get scheduled in Pharmacy labs.
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app import create_app, db
from app.models import Room, Department

def assign_room_departments():
    """Assign departments to rooms based on naming patterns"""
    app = create_app()
    
    with app.app_context():
        # Get all departments
        departments = {dept.code: dept for dept in Department.query.all()}
        print(f"Available departments: {list(departments.keys())}")
        
        # Get all rooms
        rooms = Room.query.all()
        print(f"Found {len(rooms)} rooms")
        
        updated_count = 0
        
        for room in rooms:
            old_dept_id = room.department_id
            
            # Assign department based on room name patterns
            room_name_lower = room.name.lower()
            
            if any(keyword in room_name_lower for keyword in ['pharmacy', 'pharm', 'med']):
                if 'PHARM' in departments:
                    room.department_id = departments['PHARM'].id
                    print(f"Assigned {room.name} to PHARMACY department")
                    
            elif any(keyword in room_name_lower for keyword in ['cs', 'computer', 'it', 'bca', 'programming']):
                if 'CSEIT' in departments:
                    room.department_id = departments['CSEIT'].id
                    print(f"Assigned {room.name} to CSEIT department")
                    
            elif any(keyword in room_name_lower for keyword in ['physics', 'chem', 'biology', 'science']):
                if 'SCI' in departments:
                    room.department_id = departments['SCI'].id
                    print(f"Assigned {room.name} to SCIENCE department")
                    
            elif any(keyword in room_name_lower for keyword in ['math', 'stats']):
                if 'MATH' in departments:
                    room.department_id = departments['MATH'].id
                    print(f"Assigned {room.name} to MATH department")
                    
            # Keep general purpose rooms as None (department_id is nullable)
            else:
                room.department_id = None
                print(f"Kept {room.name} as general purpose room")
            
            if old_dept_id != room.department_id:
                updated_count += 1
        
        # Commit changes
        db.session.commit()
        print(f"\nUpdated {updated_count} rooms with department assignments")
        
        # Show final assignments
        print("\nFinal room assignments:")
        for room in rooms:
            dept_name = "General Purpose"
            if room.department_id:
                dept = Department.query.get(room.department_id)
                if dept:
                    dept_name = dept.name
            print(f"  {room.name} ({room.room_type}) -> {dept_name}")

if __name__ == '__main__':
    assign_room_departments()
