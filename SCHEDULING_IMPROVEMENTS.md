# AIPCSS Scheduling Engine - Issues & Improvements Guide

> **Analysis Date:** 2025  
> **Scope:** Full analysis of 7 Excel data files + scheduling engine source code  
> **Goal:** Ensure the scheduler schedules ALL classes for ALL batches without leaving any incomplete schedules

---

## Table of Contents

1. [Data Overview](#1-data-overview)
2. [Excel Data Issues (Fix First!)](#2-excel-data-issues-fix-first)
3. [Code-Level Issues in Scheduling Engine](#3-code-level-issues-in-scheduling-engine)
4. [Implementation Priority Order](#4-implementation-priority-order)

---

## 1. Data Overview

### Entity Counts

| Entity | Count | Excel File |
|--------|-------|------------|
| Departments | 8 | `departments.xlsx` |
| Programs | 18 | `programs.xlsx` |
| Batches | 36 (2 per program) | `batches.xlsx` |
| Courses | 905 | `courses.xlsx` |
| Faculty | 110 (99 unique by email) | `faculty.xlsx` |
| Rooms | 130 | `room.xlsx` |
| Sections | 72 (2 per batch: A, B) | `sections.xlsx` |

### Data Flow: Excel → Database → Scheduler

```
Excel Files → Bulk Import API → SQLAlchemy DB → DataLoader → Scheduler Engine → Timetable
```

The **import order matters**: Departments → Programs → Batches → Faculty → Courses → Sections → Rooms

---

## 2. Excel Data Issues (Fix First!)

These issues in your Excel files directly cause courses to be missed or mismapped during scheduling. **Fix these before running the scheduler.**

---

### ISSUE D1: Program Name Mismatch Between `courses.xlsx` and `programs.xlsx` [CRITICAL]

**Impact:** Courses cannot be matched to their correct sections, causing entire batches to have missing courses.

The `Program` column in `courses.xlsx` uses different names than the `Code` column in `programs.xlsx` for 8 of 18 programs. The scheduler uses fuzzy matching, but this is unreliable.

| courses.xlsx `Program` | programs.xlsx `Code` (correct) |
|---|---|
| `B. Com` | `B.Com` |
| `B.Pharm` | `B.Pharma` |
| `B.SC. AGRI` | `B.Sc Agriculture` |
| `B.Tech MIE` | `B.Tech Mining` |
| `BA LL B` | `BA LLB` |
| `D. Pharm` | `D.Pharma` |
| `Diploma MIE` | `Diploma Mining` |
| `M.Sc. AGRI` | `M.Sc Agriculture` |

**Fix in `courses.xlsx`:** Replace all values in the `Program` column to exactly match `programs.xlsx` `Code` column values.

---

### ISSUE D2: Duplicate Course Codes in `courses.xlsx` [CRITICAL]

**Impact:** When faculty are linked to courses by code, the wrong course may get matched, or the import may skip one version.

| Duplicate Code | Semester 1 | Semester 2 | Problem |
|---|---|---|---|
| `11SEC201-BBA` | 2 | 4 | Same code, different courses |
| `13A.AGRON.600-M.Sc._AGRI` | 3 | 4 | Same code, different courses |
| `24D.Moocs-LLB` | 3 | 4, 5 | Same code, 3 different courses |
| `24FSEC.Moocs-BA_LL_B` | 5 | 7 | Same code, different courses |

**Fix:** Append semester suffix to make codes unique:
- `11SEC201-BBA-S2` and `11SEC201-BBA-S4`
- `13A.AGRON.600-M.Sc._AGRI-S3` and `13A.AGRON.600-M.Sc._AGRI-S4`
- etc.

**Also update `faculty.xlsx`** `course_codes` column to use the new unique codes.

---

### ISSUE D3: 11 Duplicate Faculty Entries in `faculty.xlsx` [CRITICAL]

**Impact:** Phantom faculty inflate the "available faculty" count, confusing the scheduler. Same faculty appearing multiple times may cause inconsistent qualifications.

These are entries with the **same email but different phone numbers**:

| Faculty Name | Emails | Phone Entries |
|---|---|---|
| Dr. Ajit Kumar Gupta | 1 | 2 different |
| Dr. Deepali Kumari | 1 | 2 different |
| Dr. Raunaque Ara | 1 | 3 different |
| Dr. Vineeta Kumari | 1 | 2 different |
| Mr. Rahul Kumar | 1 | 2 different |
| (+ 6 more) | | |

**Fix:** Keep only one row per faculty member (the one with the correct phone number). Delete duplicates.

---

### ISSUE D4: 8 Orphan Course Codes in `faculty.xlsx` [HIGH]

**Impact:** Faculty qualifications silently fail to link, meaning those faculty won't be assigned those courses.

These course codes in `faculty.xlsx` `course_codes` column don't exist in `courses.xlsx`:
- `40B.451`, `3C.351`, `3C.395`, `3CP.351`, `3CSEC102P`, `11SEC201`, `24D.Moocs`, `13A.AGRON.600`

**Fix:** Either add these missing courses to `courses.xlsx`, or remove the orphan codes from `faculty.xlsx`.

---

### ISSUE D5: Invalid Room Department Code [HIGH]

**Impact:** Room with invalid department code (`MIN`) won't be filtered correctly, causing room assignment issues.

In `room.xlsx`, one room references `MIN` instead of `MINE`.

**Fix:** Replace `MIN` with `MINE` in the `Department Code` column.

---

### ISSUE D6: Invalid Room Program Codes [HIGH]

**Impact:** Rooms that should be program-specific labs won't be matched correctly.

| room.xlsx `Program Code` | Should be |
|---|---|
| `BPHARM` | `B.Pharma` |
| `BSCAGRI` | `B.Sc Agriculture` |
| `LAWS` | Use specific program code |
| `MINING` | Use specific program code |

**Fix:** Update to match `programs.xlsx` `Code` values exactly.

---

### ISSUE D7: `WeeklyHours` Column Ignored During Import [CRITICAL]

**Impact:** All theory courses get 3 hours/week and all labs get 2 hours/week, regardless of actual requirements.

The `courses.xlsx` file has a `WeeklyHours` column (values: 2 for Lab, 3 for Theory), but:

1. **The `Course` database model has NO `weekly_hours` column** (`backend/app/models/course.py`)
2. **The import code (`bulk_import_courses`) does NOT read `WeeklyHours`** 
3. **The `DataLoader` hardcodes hours based on type** (`data_loader.py` line 186):
   ```python
   hours = 2 if course.course_type == "Lab" else 3
   ```

**Fix (3 steps):**

**Step 1:** Add `weekly_hours` column to Course model (`backend/app/models/course.py`):
```python
class Course(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    code = db.Column(db.String(50), nullable=False)
    semester = db.Column(db.Integer, nullable=True)
    semester_name = db.Column(db.String(50), nullable=True)
    course_type = db.Column(db.String(50), nullable=True)
    program_code = db.Column(db.String(50), nullable=True)
    department_code = db.Column(db.String(50), nullable=False)
    department_id = db.Column(db.Integer, db.ForeignKey('department.id'), nullable=False)
    weekly_hours = db.Column(db.Integer, nullable=True)  # <-- ADD THIS
```

**Step 2:** Update `bulk_import_courses` in `backend/app/routes/resources.py` (around line 1022) to read `WeeklyHours`:
```python
weekly_hours = row.get('WeeklyHours')
if pd.notna(weekly_hours):
    weekly_hours = int(weekly_hours)
else:
    weekly_hours = 2 if str(course_type).strip().lower() == 'lab' else 3

c = Course(
    name=str(name).strip(),
    code=str(code).strip(),
    semester=semester,
    semester_name=str(semester_name).strip() if pd.notna(semester_name) else None,
    course_type=str(course_type).strip() if pd.notna(course_type) else 'Theory',
    program_code=str(program_code).strip() if pd.notna(program_code) else None,
    department_code=str(dept_code).strip(),
    department_id=dept.id,
    weekly_hours=weekly_hours,  # <-- ADD THIS
)
```

**Step 3:** Update `DataLoader.load_courses()` in `backend/app/scheduler_new/data_loader.py` (line 186):
```python
# BEFORE (hardcoded):
hours = 2 if course.course_type == "Lab" else 3

# AFTER (use actual value from DB):
hours = course.weekly_hours if course.weekly_hours else (2 if course.course_type == "Lab" else 3)
```

---

### ISSUE D8: `sections.xlsx` Sheet Name [LOW]

**Impact:** If the import code reads from a hardcoded sheet name like `Sheet1`, it won't find the data.

The `sections.xlsx` uses sheet name `sections` (not `Sheet1`).

**Current status:** The import code uses `pd.read_excel()` without specifying a sheet name, which defaults to the first sheet, so this works. But worth documenting.

---

### ISSUE D9: Inconsistent Semester Values in `courses.xlsx` [MEDIUM]

**Impact:** Semester parsing may fail for non-standard values, causing courses to not match sections.

Values include: `1, 2, 3, ... 10` (numeric) and `Part I`, `Part II` (text).

**Fix:** Standardize all semester values to integers (1-10).

---

## 3. Code-Level Issues in Scheduling Engine

These issues are in the Python scheduling engine code and must be fixed at the code level.

---

### ISSUE C1: Faculty Fallback - ALL Faculty Become Eligible [CRITICAL]

**File:** `backend/app/scheduler_new/data_loader.py`, lines 191-193

**Impact:** If no qualified faculty are found for a course (e.g., due to orphan codes from Issue D4), EVERY faculty member becomes eligible. This causes nonsensical assignments (e.g., a Pharmacy teacher assigned to teach Mining Engineering).

```python
# CURRENT (DANGEROUS):
if not qualified_ids and all_faculty_ids:
    qualified_ids = all_faculty_ids  # ANYONE can teach!

# FIX: Instead, log a warning and skip the course, or raise an error:
if not qualified_ids:
    import logging
    logging.getLogger(__name__).warning(
        "Course '%s' (ID: %s) has no qualified faculty — SKIPPING",
        course.code, course.id
    )
    continue  # Skip this course
```

---

### ISSUE C2: Lab Room Fallback to Regular Classrooms [HIGH]

**File:** `backend/app/scheduler_new/constraint_engine.py`, lines 60-73 and 173-180

**Impact:** Lab courses get scheduled in regular classrooms without lab equipment, making the schedule practically useless.

```python
# In is_consistent() — line 62-71:
if course.course_type == "Lab":
    lab_rooms_available = any(
        r.is_suitable_for("Lab") and r.can_accommodate(section.student_count)
        for r in self.problem.rooms
    )
    if lab_rooms_available:
        return False, f"Room {room.name} not suitable for Lab (lab rooms exist)"
    # No lab rooms with capacity — allow fallback to regular rooms  ← REMOVE THIS

# In get_valid_rooms() — line 173-180:
# Fallback for labs: if no lab rooms available, use any room with capacity
if not valid and course.course_type == "Lab":  ← REMOVE THIS ENTIRE BLOCK
    for room in self.problem.rooms:
        ...
```

**Fix:** Remove both fallback blocks. If a lab can't be placed in a lab room, it should remain unscheduled and appear in the `failed_details` report so you can take action (add more lab rooms or reduce section sizes).

---

### ISSUE C3: Lab Hours Hardcoded to 2 [HIGH]

**File:** `backend/app/scheduler_new/models.py`, lines 129-133

**Impact:** All lab courses require exactly 2 consecutive slots regardless of actual need.

```python
# CURRENT:
def get_hours_needed(self) -> int:
    if self.is_lab():
        return 2  # Always 2 hours
    return self.hours_per_week

# FIX: Use actual hours from weekly_hours field:
def get_hours_needed(self) -> int:
    if self.is_lab():
        return max(1, self.hours_per_week or 2)
    return self.hours_per_week
```

---

### ISSUE C4: No Pre-Scheduling Feasibility Validation [CRITICAL]

**File:** `backend/app/scheduler_new/api.py`

**Impact:** The scheduler discovers impossibility AFTER running (sometimes for minutes), wasting time. It should fail fast with a clear explanation.

**Fix:** Add a validation function before calling `scheduler.solve()`:

```python
def _pre_schedule_feasibility_check(problem: 'SchedulingProblem') -> List[str]:
    """Check if scheduling is feasible BEFORE running the solver."""
    warnings = []
    
    # 1. Check every section has courses
    for section in problem.sections:
        if not section.course_ids:
            warnings.append(f"Section '{section.get_full_name()}' has 0 courses assigned")
    
    # 2. Check every course has qualified faculty
    for section in problem.sections:
        for course_id in section.course_ids:
            course = problem.course_map.get(course_id)
            if course and not course.qualified_faculty_ids:
                warnings.append(f"Course '{course.code}' has NO qualified faculty")
    
    # 3. Check total required hours vs available room-slots per section
    total_timeslots = len(problem.timeslots)
    for section in problem.sections:
        required = 0
        for course_id in section.course_ids:
            course = problem.course_map.get(course_id)
            if course:
                required += course.get_hours_needed()
        if required > total_timeslots:
            warnings.append(
                f"Section '{section.get_full_name()}' needs {required} hours "
                f"but only {total_timeslots} slots exist"
            )
    
    # 4. Check lab room capacity
    lab_courses = sum(1 for s in problem.sections for c in s.course_ids 
                      if problem.course_map.get(c) and problem.course_map.get(c).is_lab())
    lab_rooms = sum(1 for r in problem.rooms if "lab" in (r.room_type or "").lower())
    if lab_courses > lab_rooms * total_timeslots:
        warnings.append(f"Only {lab_rooms} lab rooms for {lab_courses} lab courses")
    
    # 5. Check faculty total capacity
    total_required = sum(
        problem.course_map.get(c, type('obj', (object,), {'get_hours_needed': lambda: 1})()).get_hours_needed()
        for s in problem.sections for c in s.course_ids
        if problem.course_map.get(c)
    )
    total_faculty_capacity = sum(f.max_hours_per_week for f in problem.faculty)
    if total_required > total_faculty_capacity:
        warnings.append(
            f"Total required {total_required} hours > faculty capacity {total_faculty_capacity} hours"
        )
    
    return warnings
```

Call this in `api.py` before building the scheduler:
```python
feasibility_warnings = _pre_schedule_feasibility_check(problem)
if feasibility_warnings:
    return jsonify({
        "status": "failure",
        "error": "Pre-scheduling validation failed",
        "validation_errors": feasibility_warnings,
        "schedule": [],
        "stats": {}
    }), 422
```

---

### ISSUE C5: No Post-Schedule Completeness Verification [CRITICAL]

**File:** `backend/app/scheduler_new/api.py`

**Impact:** The scheduler reports "success" even when some classes are silently dropped. There's no verification that every section-course pair received its full weekly hours.

**Fix:** Add verification after `scheduler.solve()`:

```python
def _verify_completeness(result: 'ScheduleResult', problem: 'SchedulingProblem') -> dict:
    """Verify that ALL section-course pairs got their required hours."""
    # Count scheduled hours per (section, course)
    scheduled_hours = defaultdict(int)
    for entry in result.schedule:
        course = problem.course_map.get(entry.course_id)
        hours = course.get_hours_needed() if course and course.is_lab() else 1
        scheduled_hours[(entry.section_id, entry.course_id)] += hours
    
    # Check against required hours
    missing = []
    for section in problem.sections:
        for course_id in section.course_ids:
            course = problem.course_map.get(course_id)
            if not course:
                continue
            required = course.get_hours_needed()
            allocated = scheduled_hours.get((section.id, course_id), 0)
            if allocated < required:
                missing.append({
                    "section": section.get_full_name(),
                    "course": course.code,
                    "course_name": course.name,
                    "required_hours": required,
                    "allocated_hours": allocated,
                    "missing_hours": required - allocated
                })
    
    return {
        "is_complete": len(missing) == 0,
        "total_section_courses": sum(len(s.course_ids) for s in problem.sections),
        "fully_scheduled": sum(len(s.course_ids) for s in problem.sections) - len(missing),
        "incomplete": len(missing),
        "missing_details": missing
    }
```

Use this to override the success status:
```python
completeness = _verify_completeness(result, problem)
if completeness["incomplete"] > 0:
    result.success = False
    result.error_message = f"{completeness['incomplete']} courses have incomplete scheduling"
    # Add to stats
    result.stats["completeness_report"] = completeness
```

---

### ISSUE C6: No Batch-Level Overlap Prevention [HIGH]

**File:** `backend/app/scheduler_new/constraint_engine.py`

**Impact:** Two sections of the same batch (e.g., BCA Sem 2 Section A and Section B) can be scheduled at the same timeslot with different faculty, making it impossible for shared facilities or events.

The current `section_schedule` only prevents same-section overlaps. It doesn't prevent:
- Section A and Section B of the same batch from having class at the same time
- Cross-batch same-department conflicts

**Fix:** Add batch-level tracking to `ConstraintEngine`:

```python
def __init__(self, problem: SchedulingProblem, debug: bool = False):
    # ... existing code ...
    # Add batch-level tracking
    self.batch_schedule: Dict[int, Dict[Tuple[str, str], Set[Tuple[int, int]]]] = defaultdict(lambda: defaultdict(set))

def is_consistent(self, entry: ScheduleEntry) -> Tuple[bool, Optional[str]]:
    # ... existing checks ...
    
    # NEW: Batch-level overlap prevention
    section = self.problem.section_map.get(entry.section_id)
    if section and section.batch_id:
        if self.batch_schedule[section.batch_id][slot_key]:
            return False, f"Another section of batch {section.batch_code} already scheduled at {entry.timeslot}"

def add_entry(self, entry: ScheduleEntry) -> None:
    # ... existing code ...
    section = self.problem.section_map.get(entry.section_id)
    if section and section.batch_id:
        self.batch_schedule[section.batch_id][slot_key].add(class_key)

def remove_entry(self, entry: ScheduleEntry) -> None:
    # ... existing code ...
    section = self.problem.section_map.get(entry.section_id)
    if section and section.batch_id:
        self.batch_schedule[section.batch_id][slot_key].discard(class_key)
```

> **Note:** Only enable this if you want same-batch sections to NEVER overlap. If you want them to sometimes overlap (different rooms), keep this as a **soft constraint** or make it configurable.

---

### ISSUE C7: Fuzzy Program Matching is Fragile [HIGH]

**File:** `backend/app/scheduler_new/data_loader.py`, lines 29-56 and 258-279

**Impact:** The fuzzy matching uses substring containment (0.8 threshold) and Jaccard similarity (0.3 threshold). This can incorrectly match unrelated programs or miss correct matches.

Example: "B.Tech MIE" in courses vs "B.Tech Mining" in programs:
- Tokens: `{"TECH", "MIE"}` vs `{"TECH", "MINING"}`
- Substring check: `"MIE" in "MINING"` → False
- Jaccard: `{"TECH"} / {"TECH", "MIE", "MINING"}` = 0.33 > 0.3 → **MATCH** (but wrong!)

This means courses for wrong programs may get assigned to sections.

**Fix (Preferred):** Fix the Excel data (Issue D1) so exact matching works. Then simplify the matching:

```python
# In load_sections(), replace fuzzy matching with exact matching:
if c.program_code and program_code:
    if c.program_code != program_code:
        continue  # Skip if not exact match
# Only use fuzzy as a last resort when one side is NULL:
elif not c.program_code or not program_code:
    # Use department-based matching as fallback
    if c.department_id != program.department_id:
        continue
```

---

### ISSUE C8: OR-Tools Falls Back Too Early [MEDIUM]

**File:** `backend/app/scheduler_new/api.py`, line 24

**Impact:** If there are more than 300 classes, the system skips OR-Tools (which guarantees optimality) and uses the Hybrid engine (which may leave classes unscheduled).

```python
AUTO_HYBRID_CLASS_THRESHOLD = 300
```

With 36 batches × 2 sections × ~8 courses each = ~576 classes, you'll always hit the Hybrid engine.

**Fix:** Increase the threshold or always try OR-Tools first:

```python
# Option 1: Increase threshold
AUTO_HYBRID_CLASS_THRESHOLD = 1000

# Option 2: Always try OR-Tools, fallback on timeout
if normalized_engine == "auto":
    if ORTOOLS_AVAILABLE:
        try:
            scheduler = OrtoolsSchedulerEngine(problem=problem, time_limit_seconds=time_limit, debug=debug_mode)
            result = scheduler.solve()
            if result.success or len(result.schedule) > 0:
                return result  # OR-Tools produced results
        except Exception:
            pass  # Fallback to Hybrid
    scheduler = HybridSchedulerEngine(problem=problem, debug=debug_mode)
```

---

### ISSUE C9: Hardcoded Faculty Limits [MEDIUM]

**File:** `backend/app/scheduler_new/models.py`, lines 44-45

```python
max_hours_per_day: int = 6
max_hours_per_week: int = 30
```

**Impact:** All faculty have the same limits regardless of their actual availability. Some faculty may be available for fewer hours (part-time) or more hours.

**Fix:** Make these configurable per-faculty, or read from the database if available:

```python
# In DataLoader.load_faculty():
faculty_list.append(Faculty(
    id=teacher.id,
    name=teacher.name,
    email=teacher.email,
    qualified_course_ids=qualified_ids,
    availability=availability,
    max_hours_per_day=getattr(teacher, 'max_hours_per_day', 6),  # From DB if available
    max_hours_per_week=getattr(teacher, 'max_hours_per_week', 30),
))
```

---

### ISSUE C10: Import Order Not Enforced [MEDIUM]

**File:** `backend/app/routes/resources.py`

**Impact:** If courses are imported before faculty, the `teacher_qualifications` M2M table can't link course IDs. If programs aren't imported first, batch import fails.

The import endpoints don't enforce the correct order. The `teachers/import` endpoint silently fails when it can't find a course code (line 963):
```python
course = Course.query.filter_by(code=course_code).first()
if course and course not in t.qualified_courses:  # Silent skip if course not found!
```

**Fix:** Add validation to the import endpoints:

```python
# In bulk_import_teachers(), add a pre-check:
unresolved_codes = []
for index, row in df.iterrows():
    course_codes_val = row.get('course_codes')
    if pd.notna(course_codes_val):
        for code in [c.strip() for c in str(course_codes_val).replace(';', ',').split(',') if c.strip()]:
            if not Course.query.filter_by(code=code).first():
                unresolved_codes.append(f"Row {index+2}: course code '{code}' not found")

if unresolved_codes:
    return jsonify({
        "message": f"Found {len(unresolved_codes)} unresolved course codes",
        "unresolved": unresolved_codes[:20],  # First 20
        "hint": "Import courses BEFORE teachers"
    }), 422
```

---

### ISSUE C11: No Lab Consecutive-Slot Guarantee in Hybrid Engine [MEDIUM]

**File:** `backend/app/scheduler_new/hybrid_engine.py`

**Impact:** Lab courses need consecutive timeslot blocks, but the Hybrid engine's `get_valid_starts()` pre-computes valid consecutive starts only once. If a lab needs 2 consecutive slots and the first available pair crosses a break (e.g., last slot before lunch and first after), it creates an invalid schedule.

**Current handling:** The `_compute_valid_starts()` method (line 202-224) correctly checks `current.end_time != nxt.start_time`, which handles break gaps. **This is already correct.** But verify your `ScheduleSettings` has no hidden gaps.

---

### ISSUE C12: `Batch.current_semester` Must Be Set Correctly [CRITICAL]

**File:** `backend/app/models/batch.py` and `backend/app/scheduler_new/data_loader.py` (line 253)

**Impact:** Course-to-section matching depends on `batch.current_semester` matching `course.semester`. If `current_semester` is not set or wrong, NO courses will be matched to that batch's sections.

```python
current_semester = section.batch.current_semester
# ...
if course_sem is not None and current_semester is not None:
    if course_sem != current_semester:
        continue  # SKIP — wrong semester
```

**Fix:** 
1. Ensure `Batch.current_semester` is set in the database for every batch
2. Add a migration or update endpoint to set this based on batch year and current date
3. Add validation in the pre-check (Issue C4):
```python
for section in problem.sections:
    if section.current_semester is None:
        warnings.append(
            f"Section '{section.get_full_name()}' has no semester set — "
            f"NO courses will be scheduled for this section"
        )
```

---

### ISSUE C13: Old Scheduling API Still Exists [LOW]

**File:** `backend/app/routes/scheduling.py`

**Impact:** There are TWO scheduling endpoints:
- `/api/scheduling/generate` (old, in `routes/scheduling.py`) — has its own hardcoded DAYS and TIMESLOTS
- `/api/scheduler/generate` (new, in `scheduler_new/api.py`) — the one being used

The old one may still be called accidentally, producing different results.

**Fix:** Deprecate or remove the old `routes/scheduling.py` endpoint.

---

## 4. Implementation Priority Order

### Phase 1: Excel Data Fixes (Do These FIRST)
| Priority | Issue | Effort |
|----------|-------|--------|
| **P0** | D1: Fix program name mismatches in courses.xlsx | 10 min |
| **P0** | D2: Fix duplicate course codes | 15 min |
| **P0** | D3: Deduplicate faculty entries | 10 min |
| **P0** | D12: Set `current_semester` on all batches | 5 min |
| **P1** | D7: Add `weekly_hours` to DB model + import | 30 min |
| **P1** | D4: Fix orphan course codes in faculty.xlsx | 10 min |
| **P1** | D5: Fix room department code MIN→MINE | 1 min |
| **P1** | D6: Fix room program codes | 5 min |
| **P2** | D9: Standardize semester values | 10 min |

### Phase 2: Code Fixes
| Priority | Issue | Effort |
|----------|-------|--------|
| **P0** | C1: Remove faculty fallback | 10 min |
| **P0** | C4: Add pre-scheduling feasibility check | 30 min |
| **P0** | C5: Add post-schedule completeness verification | 30 min |
| **P0** | C7: Fix fuzzy program matching (after D1 fix) | 20 min |
| **P1** | C3: Fix hardcoded lab hours | 10 min |
| **P1** | C2: Remove lab room fallback | 10 min |
| **P1** | C8: Increase OR-Tools threshold | 5 min |
| **P2** | C6: Add batch-level overlap prevention | 30 min |
| **P2** | C9: Configurable faculty limits | 20 min |
| **P2** | C10: Enforce import order | 15 min |

### Phase 3: Verification
After all fixes, run the scheduler and verify:
1. All sections have courses assigned (no zero-course sections)
2. No courses appear in `failed_details`
3. Faculty assignments are valid (no Pharmacy teacher on Mining courses)
4. Labs are in lab rooms only
5. Every batch has a complete weekly timetable

---

## Quick Diagnostic SQL Queries

Run these against your SQLite database to check current state:

```sql
-- 1. Sections with no courses (will be invisible to scheduler)
SELECT s.id, s.name, b.code as batch_code, b.current_semester
FROM section s
JOIN batch b ON s.batch_id = b.id
WHERE b.current_semester IS NULL;

-- 2. Courses with no qualified faculty
SELECT c.id, c.code, c.name, c.program_code
FROM course c
LEFT JOIN teacher_qualifications tq ON c.id = tq.course_id
WHERE tq.course_id IS NULL;

-- 3. Total classes to schedule vs total available slots
SELECT 
  (SELECT COUNT(*) FROM section) as sections,
  (SELECT COUNT(*) FROM course) as courses,
  (SELECT COUNT(*) FROM room) as rooms,
  (SELECT COUNT(*) FROM teacher) as faculty;

-- 4. Batches missing current_semester
SELECT id, code, current_semester FROM batch WHERE current_semester IS NULL;

-- 5. Program code mismatches between courses and programs
SELECT DISTINCT c.program_code, p.code as program_code_correct
FROM course c
JOIN program p ON c.department_id = p.department_id
WHERE c.program_code != p.code AND c.program_code IS NOT NULL;
```

---

## Summary

| Category | Critical | High | Medium | Low | Total |
|----------|----------|------|--------|-----|-------|
| Data Issues (D) | 3 | 3 | 1 | 1 | 8 |
| Code Issues (C) | 4 | 3 | 4 | 1 | 12 |
| **Total** | **7** | **6** | **5** | **2** | **20** |

**Root cause of incomplete schedules:** The combination of Issue D1 (program name mismatch) + Issue D12 (no semester set) + Issue C1 (faculty fallback) means courses silently don't match sections, and the system papers over the problem by assigning random faculty. Fix the data first, then the code will work correctly.
