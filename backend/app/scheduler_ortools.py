"""
OR-Tools based timetable scheduler using Constraint Satisfaction Problem (CSP) approach.
"""
from ortools.sat.python import cp_model
from typing import List, Dict, Set, Tuple, Optional
from collections import defaultdict

def schedule_timetable_ortools(
    sections: List,
    courses: List,
    teachers: List,
    rooms: List,
    days: List[str],
    timeslots: List[str],
    strict_mode: bool = False,
    progress_callback = None
) -> Tuple[List[Dict], List[Dict], List[str]]:
    """
    Use OR-Tools CP-SAT solver to generate optimal timetable.
    
    Returns: (entries, skipped, errors)
    """
    model = cp_model.CpModel()
    
    # Create variables: section_course_day_slot_teacher_room
    # x[s,c,d,t,te,r] = 1 if section s takes course c on day d at time t with teacher te in room r
    
    section_ids = [s.id for s in sections]
    course_ids = [c.id for c in courses]
    teacher_ids = [t.id for t in teachers]
    room_ids = [r.id for r in rooms]
    day_indices = range(len(days))
    slot_indices = range(len(timeslots))
    
    # Pre-compute valid assignments
    valid_assignments = []
    
    for section in sections:
        for course in courses:
            # Check if teacher is qualified for this course
            qualified_teachers = [t for t in teachers if course in t.qualified_courses]
            if not qualified_teachers and strict_mode:
                continue
            if not qualified_teachers:
                qualified_teachers = teachers  # fallback
            
            for teacher in qualified_teachers:
                for room in rooms:
                    # Check room capacity
                    if room.capacity < section.student_count:
                        continue
                    # Check room type for labs
                    if course.course_type == 'Lab' and 'lab' not in room.room_type.lower():
                        continue
                    
                    for d_idx, day in enumerate(days):
                        for t_idx, slot in enumerate(timeslots):
                            # Check teacher availability
                            if teacher.availability and slot not in teacher.availability.get(day, []):
                                continue
                            
                            valid_assignments.append({
                                'section_id': section.id,
                                'course_id': course.id,
                                'teacher_id': teacher.id,
                                'room_id': room.id,
                                'day_idx': d_idx,
                                'slot_idx': t_idx,
                                'day': day,
                                'slot': slot
                            })
    
    if not valid_assignments:
        return [], [], ["No valid assignments possible with current constraints"]
    
    # Create boolean variables for each valid assignment
    assignment_vars = {}
    for i, assignment in enumerate(valid_assignments):
        key = (assignment['section_id'], assignment['course_id'], assignment['day_idx'], 
               assignment['slot_idx'], assignment['teacher_id'], assignment['room_id'])
        assignment_vars[key] = model.NewBoolVar(f'x_{i}')
    
    # CONSTRAINT 1: Each section-course pair must be scheduled required hours
    section_courses_required = defaultdict(int)
    for course in courses:
        for section in sections:
            if course.program_code == section.batch.program.code:
                hours = 2 if course.course_type == 'Lab' else 3
                section_courses_required[(section.id, course.id)] = hours
    
    for (section_id, course_id), required_hours in section_courses_required.items():
        relevant_vars = [
            var for key, var in assignment_vars.items()
            if key[0] == section_id and key[1] == course_id
        ]
        if relevant_vars:
            model.Add(sum(relevant_vars) == required_hours)
    
    # CONSTRAINT 2: No teacher conflicts (same teacher, same day, same slot)
    for teacher_id in teacher_ids:
        for d_idx in day_indices:
            for t_idx in slot_indices:
                teacher_slot_vars = [
                    var for key, var in assignment_vars.items()
                    if key[4] == teacher_id and key[2] == d_idx and key[3] == t_idx
                ]
                if teacher_slot_vars:
                    model.Add(sum(teacher_slot_vars) <= 1)
    
    # CONSTRAINT 3: No room conflicts (same room, same day, same slot)
    for room_id in room_ids:
        for d_idx in day_indices:
            for t_idx in slot_indices:
                room_slot_vars = [
                    var for key, var in assignment_vars.items()
                    if key[5] == room_id and key[2] == d_idx and key[3] == t_idx
                ]
                if room_slot_vars:
                    model.Add(sum(room_slot_vars) <= 1)
    
    # CONSTRAINT 4: No section conflicts (same section, same day, same slot)
    for section_id in section_ids:
        for d_idx in day_indices:
            for t_idx in slot_indices:
                section_slot_vars = [
                    var for key, var in assignment_vars.items()
                    if key[0] == section_id and key[2] == d_idx and key[3] == t_idx
                ]
                if section_slot_vars:
                    model.Add(sum(section_slot_vars) <= 1)
    
    # CONSTRAINT 5: Consecutive slots for multi-hour courses
    # (simplified - full implementation would link consecutive slots)
    
    # OBJECTIVE: Minimize gaps and balance load
    # Secondary objective: Prefer compact schedules
    
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 10.0  # Reduced from 30s
    solver.parameters.num_search_workers = 4
    solver.parameters.cp_model_presolve = True
    
    # Use first solution instead of optimal (much faster)
    # solver.parameters.enumerate_all_solutions = False
    
    if progress_callback:
        progress_callback(50, "Solving constraints with OR-Tools...")
    
    status = solver.Solve(model)
    
    entries = []
    skipped = []
    errors = []
    
    if status == cp_model.OPTIMAL or status == cp_model.FEASIBLE:
        for key, var in assignment_vars.items():
            if solver.Value(var) == 1:
                section_id, course_id, day_idx, slot_idx, teacher_id, room_id = key
                entries.append({
                    'section_id': section_id,
                    'course_id': course_id,
                    'teacher_id': teacher_id,
                    'room_id': room_id,
                    'day': days[day_idx],
                    'timeslot': timeslots[slot_idx]
                })
    else:
        errors.append("Could not find feasible schedule with current constraints")
        # Identify which constraints are too tight
        if status == cp_model.INFEASIBLE:
            errors.append("Schedule is infeasible - consider relaxing constraints")
    
    return entries, skipped, errors
