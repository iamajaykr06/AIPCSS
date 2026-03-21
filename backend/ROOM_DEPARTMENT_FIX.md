# Department-Based Room Restrictions Fix

## Problem
The scheduling system was assigning BCA batch labs to Pharmacy labs because it only considered room type ("lab") without checking department compatibility.

## Solution
Added department-based room restrictions to prevent cross-department lab assignments.

## Changes Made

### 1. Database Schema Update
- Added `department_id` foreign key to `Room` model (nullable for general-purpose rooms)
- Created migration file: `migrations/versions/add_department_to_rooms.py`

### 2. Scheduling Logic Update
- Modified `scheduling.py` line 260-263 to filter rooms by department:
  ```python
  all_rooms = Room.query.filter(
      (Room.department_id == dept_id) | (Room.department_id.is_(None))
  ).all()
  ```
- Now only department-specific rooms + general-purpose rooms are available for scheduling

### 3. API Updates
- Updated room CRUD operations in `resources.py` to handle `department_id`
- Added department_id to room import functionality

### 4. Room Assignment Script
- Created `assign_room_departments.py` to automatically assign departments to existing rooms based on naming patterns

## How It Works

1. **Department-Specific Rooms**: Rooms assigned to a department can only be used by that department's courses
2. **General-Purpose Rooms**: Rooms with `department_id = None` can be used by any department
3. **Automatic Assignment**: The script assigns departments based on room name patterns:
   - "pharmacy", "pharm", "med" → Pharmacy department
   - "cs", "computer", "it", "bca" → CSEIT department  
   - "physics", "chem", "biology", "science" → Science department
   - "math", "stats" → Math department

## Implementation Steps

1. Run the database migration:
   ```bash
   cd backend
   flask db upgrade
   ```

2. Assign departments to existing rooms:
   ```bash
   python assign_room_departments.py
   ```

3. Verify room assignments in the database or through the API

## Result
- BCA labs will now only be scheduled in CSEIT department labs
- Pharmacy labs will only be scheduled in Pharmacy department labs
- No more cross-department lab assignments
- General-purpose rooms remain available to all departments
