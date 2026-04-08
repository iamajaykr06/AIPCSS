# AIPCSS — Scheduling Engine Fix Guide

> **AI-Powered Class Scheduling System** — Comprehensive issue tracker and step-by-step remediation guide for the scheduling engine.

**Last Updated:** 2025  
**Scope:** All 26 identified issues across data quality, constraint logic, and solver correctness  
**Estimated Total Fix Time:** ~7 hours

---

## Table of Contents

- [Executive Summary](#executive-summary)
- [Project Structure](#project-structure)
- [Issue Summary Table](#issue-summary-table)
- [Phase 1: Excel Data Fixes (~1 hour)](#phase-1-excel-data-fixes-1-hour)
  - [D1: Program Name Mismatch](#d1--program-name-mismatch-between-coursesxlsx-and-programsxlsx)
  - [D2: Duplicate Course Codes](#d2--duplicate-course-codes-in-coursesxlsx)
  - [D3: Duplicate Faculty Entries](#d3--duplicate-faculty-entries-in-facultyxlsx)
  - [D4: Orphan Course Codes in Faculty](#d4--orphan-course-codes-in-facultyxlsx)
  - [D5: Invalid Room Department Code](#d5--invalid-room-department-code)
  - [D6: Invalid Room Program Codes](#d6--invalid-room-program-codes)
  - [D7: WeeklyHours Column Ignored](#d7--weeklyhours-column-ignored-during-import)
  - [D8: sections.xlsx Sheet Name](#d8--sectionsxlsx-sheet-name)
  - [D9: Inconsistent Semester Values](#d9--inconsistent-semester-values)
- [Phase 2: Critical Code Fixes (~2 hours)](#phase-2-critical-code-fixes-2-hours)
  - [C1: Faculty Fallback Removed](#c1--faculty-fallback--all-faculty-become-eligible--fixed)
  - [C4: No Pre-Scheduling Feasibility Validation](#c4--no-pre-scheduling-feasibility-validation)
  - [C5: No Post-Schedule Completeness Verification](#c5--no-post-schedule-completeness-verification)
  - [C12: Batch.current_semester Must Be Set](#c12--batchcurrent_semester-must-be-set)
  - [E1: Strict Course-to-Faculty Binding](#e1--strict-course-to-faculty-binding-from-excel)
  - [E2: Read Actual L/T/P Hours](#e2--read-actual-ltp-hours-instead-of-hardcoded-values)
- [Phase 3: High Priority Code Fixes (~2 hours)](#phase-3-high-priority-code-fixes-2-hours)
  - [C2: Lab Room Fallback to Classrooms](#c2--lab-room-fallback-to-regular-classrooms)
  - [C3: Lab Hours Hardcoded to 2](#c3--lab-hours-hardcoded-to-2)
  - [C6: No Batch-Level Overlap Prevention](#c6--no-batch-level-overlap-prevention)
  - [E3: Batch-Isolation Priority Scheduling](#e3--batch-isolation-priority-scheduling)
- [Phase 4: Medium/Low Priority (~2 hours)](#phase-4-mediumlow-priority-2-hours)
  - [C7: Fuzzy Matching Fixed](#c7--fuzzy-program-matching-is-fragile--fixed)
  - [C8: OR-Tools Falls Back Too Early](#c8--or-tools-falls-back-too-early)
  - [C9: Hardcoded Faculty Limits](#c9--hardcoded-faculty-limits)
  - [C10: Import Order Not Enforced](#c10--import-order-not-enforced)
  - [C11: Lab Consecutive-Slot Guarantee](#c11--no-lab-consecutive-slot-guarantee--correct)
  - [C13: Old Scheduling API Still Exists](#c13--old-scheduling-api-still-exists)
  - [E4: Faculty Daily Load Balancing](#e4--faculty-daily-load-balancing)
  - [E5: Handle Non-Standard Course Types](#e5--handle-non-standard-course-types)
  - [E6: Always Use OR-Tools as Default](#e6--always-use-or-tools-as-default-engine)
  - [E7: Post-Schedule Completeness Report](#e7--post-schedule-completeness-report)
- [Diagnostic SQL Queries](#diagnostic-sql-queries)
- [Verification Checklist](#verification-checklist)
- [Quick Reference Card](#quick-reference-card)

---

## Executive Summary

The AIPCSS scheduling engine has **26 identified issues** spanning three categories:

| Category | Critical | High | Medium | Low | Total |
|----------|----------|------|--------|-----|-------|
| **Data Issues (Excel)** | 3 | 3 | 2 | 1 | 9 |
| **Code Issues (Engine)** | 3 | 3 | 4 | 2 | 12 |
| **Enhancement Issues** | 2 | 1 | 4 | 0 | 7 |
| **Totals** | **8** | **7** | **10** | **3** | **26** |

**Root Cause:** The most impactful problems stem from **inconsistent Excel data** (program name mismatches, missing semesters, duplicate entries) combined with **insufficient validation** before and after scheduling.

**Fix Order Matters:** Data issues must be fixed first because the scheduling engine depends on correct data to produce valid timetables. Fixing code issues on top of broken data will not resolve scheduling failures.

---

## Project Structure

```
backend/
  app/
    models/
      course.py                          # Course DB model (D7, E2)
      batch.py                           # Batch DB model (C12)
      section.py                         # Section DB model
      teacher.py                         # Teacher DB model (E1)
      room.py                            # Room DB model (D5, D6)
    scheduler_new/
      models.py                          # Scheduler dataclasses (C3, C9)
      data_loader.py                     # Loads DB data into scheduler (C1, C7, C12)
      constraint_engine.py               # Validates hard constraints (C2, C6)
      hybrid_engine.py                   # Greedy + local search engine (C11)
      ortools_engine.py                  # OR-Tools CP-SAT solver
      api.py                             # Flask API endpoints (C4, C5, C8, C13)
    routes/
      resources.py                       # Bulk import endpoints (C10, D7, E1)
      scheduling.py                      # Old scheduling endpoint (C13)
```

---

## Issue Summary Table

| ID | Severity | Category | Status | Title | File(s) |
|----|----------|----------|--------|-------|---------|
| D1 | 🔴 CRITICAL | Data | ❌ Open | Program Name Mismatch | courses.xlsx, programs.xlsx |
| D2 | 🔴 CRITICAL | Data | ❌ Open | Duplicate Course Codes | courses.xlsx |
| D3 | 🔴 CRITICAL | Data | ❌ Open | Duplicate Faculty Entries | faculty.xlsx |
| D4 | 🟠 HIGH | Data | ❌ Open | Orphan Course Codes in Faculty | faculty.xlsx |
| D5 | 🟠 HIGH | Data | ❌ Open | Invalid Room Department Code | room.xlsx |
| D6 | 🟠 HIGH | Data | ❌ Open | Invalid Room Program Codes | room.xlsx |
| D7 | 🔴 CRITICAL | Data | ❌ Open | WeeklyHours Column Ignored | courses.xlsx, resources.py |
| D8 | 🟢 LOW | Data | ✅ Works | sections.xlsx Sheet Name | sections.xlsx |
| D9 | 🟡 MEDIUM | Data | ❌ Open | Inconsistent Semester Values | courses.xlsx |
| C1 | 🔴 CRITICAL | Code | ✅ Fixed | Faculty Fallback Removed | data_loader.py |
| C2 | 🟠 HIGH | Code | ❌ Open | Lab Room Fallback to Classrooms | constraint_engine.py |
| C3 | 🟠 HIGH | Code | ❌ Open | Lab Hours Hardcoded to 2 | models.py |
| C4 | 🔴 CRITICAL | Code | ❌ Open | No Pre-Scheduling Feasibility Check | api.py |
| C5 | 🔴 CRITICAL | Code | ❌ Open | No Post-Schedule Completeness Check | api.py |
| C6 | 🟠 HIGH | Code | ❌ Open | No Batch-Level Overlap Prevention | constraint_engine.py |
| C7 | 🟠 HIGH | Code | ✅ Fixed | Fuzzy Matching Replaced by Exact | data_loader.py |
| C8 | 🟡 MEDIUM | Code | ❌ Open | OR-Tools Falls Back Too Early | api.py |
| C9 | 🟡 MEDIUM | Code | ❌ Open | Hardcoded Faculty Limits | models.py |
| C10 | 🟡 MEDIUM | Code | ❌ Open | Import Order Not Enforced | resources.py |
| C11 | 🟡 MEDIUM | Code | ✅ Correct | Lab Consecutive-Slot Guarantee | hybrid_engine.py |
| C12 | 🔴 CRITICAL | Code | ❌ Open | Batch.current_semester Must Be Set | batch.py, data_loader.py |
| C13 | 🟢 LOW | Code | ❌ Open | Old Scheduling API Still Exists | scheduling.py |
| E1 | 🔴 CRITICAL | Enhancement | ❌ Open | Strict Course-to-Faculty Binding | resources.py |
| E2 | 🔴 CRITICAL | Enhancement | ❌ Open | Read Actual L/T/P Hours | course.py, data_loader.py |
| E3 | 🟠 HIGH | Enhancement | ❌ Open | Batch-Isolation Priority Scheduling | hybrid_engine.py |
| E4 | 🟡 MEDIUM | Enhancement | ❌ Open | Faculty Daily Load Balancing | hybrid_engine.py |
| E5 | 🟡 MEDIUM | Enhancement | ❌ Open | Non-Standard Course Types | course.py, data_loader.py |
| E6 | 🟡 MEDIUM | Enhancement | ❌ Open | Always Use OR-Tools Default | api.py |
| E7 | 🟡 MEDIUM | Enhancement | ❌ Open | Post-Schedule Completeness Report | api.py |

---

## Phase 1: Excel Data Fixes (~1 hour)

> ⚠️ **WARNING:** All data fixes must be completed and re-imported before running the scheduler. Broken data will produce broken schedules regardless of code fixes.

**Import order matters:**
1. `departments.xlsx` (no dependencies)
2. `programs.xlsx` (depends on departments)
3. `batches.xlsx` (depends on programs)
4. `courses.xlsx` (depends on departments)
5. `rooms.xlsx` (depends on departments, programs)
6. `sections.xlsx` (depends on batches)
7. `faculty.xlsx` (depends on departments, courses)

---

### D1 — Program Name Mismatch Between courses.xlsx and programs.xlsx

| | |
|---|---|
| **Severity** | 🔴 CRITICAL |
| **Files** | `courses.xlsx` (`Program` column), `programs.xlsx` (`Code` column) |
| **Impact** | Courses cannot match sections → entire batches get zero courses scheduled |

**Problem:** The `Program` column in `courses.xlsx` uses different naming conventions than the `Code` column in `programs.xlsx`. Since `data_loader.py` now uses **exact string matching** (C7 fix), these mismatches cause all courses for affected programs to be silently dropped.

**8 Mismatches:**

| courses.xlsx (`Program`) | programs.xlsx (`Code`) | Fix Action |
|---|---|---|
| `B. Com` | `B.Com` | Change courses.xlsx → `B.Com` |
| `B.Pharm` | `B.Pharma` | Change courses.xlsx → `B.Pharma` |
| `B.SC. AGRI` | `B.Sc Agriculture` | Change courses.xlsx → `B.Sc Agriculture` |
| `B.Tech MIE` | `B.Tech Mining` | Change courses.xlsx → `B.Tech Mining` |
| `BA LL B` | `BA LLB` | Change courses.xlsx → `BA LLB` |
| `D. Pharm` | `D.Pharma` | Change courses.xlsx → `D.Pharma` |
| `Diploma MIE` | `Diploma Mining` | Change courses.xlsx → `Diploma Mining` |
| `M.Sc. AGRI` | `M.Sc Agriculture` | Change courses.xlsx → `M.Sc Agriculture` |

**Fix Instructions:**

1. Open `courses.xlsx`
2. Apply find-and-replace for each mismatch in the `Program` column
3. Save the file
4. Re-import: `POST /api/courses/import` (with the updated file)
5. Verify with diagnostic query below

```sql
-- Verify no mismatches remain
SELECT DISTINCT c.program_code, p.code
FROM course c
JOIN program p ON c.department_id = p.department_id
WHERE c.program_code != p.code
  AND c.program_code IS NOT NULL;
-- Expected: 0 rows
```

---

### D2 — Duplicate Course Codes in courses.xlsx

| | |
|---|---|
| **Severity** | 🔴 CRITICAL |
| **Files** | `courses.xlsx` (`code` column) |
| **Impact** | Later duplicates silently overwrite earlier ones during import; courses lost |

**Problem:** 4 course codes appear multiple times across different semesters. Since `code` is used as the unique identifier in some import paths, duplicate codes cause data loss.

**4 Duplicate Sets:**

| Course Code | Semesters Found | Fix Action |
|---|---|---|
| `11SEC201-BBA` | S2, S4 | Make unique: `11SEC201-BBA-S2`, `11SEC201-BBA-S4` |
| `13A.AGRON.600-M.Sc._AGRI` | S3, S4 | Make unique: `13A.AGRON.600-M.Sc._AGRI-S3`, `13A.AGRON.600-M.Sc._AGRI-S4` |
| `24D.Moocs-LLB` | S3, S4, S5 | Make unique: `24D.Moocs-LLB-S3`, `24D.Moocs-LLB-S4`, `24D.Moocs-LLB-S5` |
| `24FSEC.Moocs-BA_LL_B` | S5, S7 | Make unique: `24FSEC.Moocs-BA_LL_B-S5`, `24FSEC.Moocs-BA_LL_B-S7` |

**Fix Instructions:**

1. Open `courses.xlsx`
2. For each duplicate code, append `-{Semester}` suffix to make unique
3. Save the file
4. Clear existing course data (or use fresh DB)
5. Re-import: `POST /api/courses/import`

---

### D3 — Duplicate Faculty Entries in faculty.xlsx

| | |
|---|---|
| **Severity** | 🔴 CRITICAL |
| **Files** | `faculty.xlsx` |
| **Impact** | 11 phantom faculty inflate available count → scheduler over-assigns |

**Problem:** Same email address appears with different phone numbers. The import logic in `resources.py` line 939 deduplicates by email, keeping only the first occurrence. This means some phone numbers are silently dropped, and the duplicate rows waste processing time.

**Fix Instructions:**

1. Open `faculty.xlsx`
2. Sort by `email` column
3. For each duplicated email, merge phone numbers (keep most recent) and delete extra rows
4. Save the file
5. Re-import: `POST /api/teachers/import`

```sql
-- Find duplicate emails
SELECT email, COUNT(*) as cnt
FROM teacher
GROUP BY email
HAVING cnt > 1;
-- Expected: 0 rows after fix
```

---

### D4 — Orphan Course Codes in faculty.xlsx

| | |
|---|---|
| **Severity** | 🟠 HIGH |
| **Files** | `faculty.xlsx` (`course_codes` column) |
| **Impact** | Faculty qualifications silently fail → no qualified faculty for those courses |

**Problem:** 8 course codes referenced in faculty.xlsx don't exist in courses.xlsx. The import at `resources.py` line 963 does a `Course.query.filter_by(code=course_code).first()` lookup, so these silently return `None` and are skipped.

**8 Orphan Codes:**
`40B.451`, `3C.351`, `3C.395`, `3CP.351`, `3CSEC102P`, `11SEC201`, `24D.Moocs`, `13A.AGRON.600`

> Note: Some of these are parent codes that were later made unique by D2 fix (e.g., `24D.Moocs` → `24D.Moocs-LLB-S3`).

**Fix Instructions:**

1. Cross-reference the orphan codes with the corrected course codes (after D2 fix)
2. Update faculty.xlsx `course_codes` column to use the corrected unique codes
3. Re-import: `POST /api/teachers/import`

---

### D5 — Invalid Room Department Code

| | |
|---|---|
| **Severity** | 🟠 HIGH |
| **Files** | `room.xlsx` (`DeptCode` column) |
| **Impact** | Room import fails silently for Mining department rooms |

**Problem:** `room.xlsx` uses `MIN` as the department code, but `departments.xlsx` and `programs.xlsx` use `MINE`.

**Fix:** In `room.xlsx`, find-and-replace `MIN` → `MINE` in the `DeptCode` column.

---

### D6 — Invalid Room Program Codes

| | |
|---|---|
| **Severity** | 🟠 HIGH |
| **Files** | `room.xlsx` (`ProgramCode` column) |
| **Impact** | Lab rooms fail to link to their programs → labs unusable |

**Problem:** Room file uses abbreviated program codes that don't match `programs.xlsx`.

| room.xlsx ProgramCode | Correct Code |
|---|---|
| `BPHARM` | `B.Pharma` |
| `BSCAGRI` | `B.Sc Agriculture` |
| `BTCMIE` | `B.Tech Mining` |
| `DIPMIE` | `Diploma Mining` |
| (others) | Match to programs.xlsx `Code` column |

**Fix:** Update all `ProgramCode` values in `room.xlsx` to exactly match `programs.xlsx` `Code` values.

---

### D7 — WeeklyHours Column Ignored During Import

| | |
|---|---|
| **Severity** | 🔴 CRITICAL |
| **Files** | `courses.xlsx`, `backend/app/models/course.py`, `backend/app/routes/resources.py` |
| **Impact** | All course hours are guessed instead of using actual values → incorrect scheduling |

**Problem:** `courses.xlsx` has a `WeeklyHours` column (e.g., L=3, T=1, P=2), but:

1. The `Course` DB model (`course.py`) has **no `weekly_hours` field**
2. The `bulk_import_courses` function (`resources.py` line 977) **never reads this column**
3. `data_loader.py` lines 187-189 **hardcodes** hours as a fallback:

```python
# data_loader.py lines 186-189
hours = getattr(course, 'weekly_hours', None)
if hours is None:
    hours = 2 if (course.course_type or '').lower() == "lab" else 3
```

**Fix Instructions:**

**Step 1:** Add `weekly_hours` to the Course model:

```python
# backend/app/models/course.py — add after line 11
weekly_hours = db.Column(db.Integer, nullable=True)  # From Excel WeeklyHours
```

**Step 2:** Read it during import in `bulk_import_courses`:

```python
# backend/app/routes/resources.py — inside bulk_import_courses, after line 1014
weekly_hours = None
if pd.notna(row.get('WeeklyHours')):
    try:
        weekly_hours = int(row.get('WeeklyHours'))
    except (ValueError, TypeError):
        pass

# Then add weekly_hours=weekly_hours to the Course(...) constructor
```

**Step 3:** Run DB migration:

```bash
cd backend
flask db migrate -m "Add weekly_hours to course"
flask db upgrade
```

**Step 4:** Re-import courses.

> See also **E2** for a more comprehensive L/T/P column approach.

---

### D8 — sections.xlsx Sheet Name

| | |
|---|---|
| **Severity** | 🟢 LOW |
| **Files** | `sections.xlsx` |
| **Impact** | None currently (pandas reads all sheets by default) |

**Note:** The sheet name is `"sections"` not `"Sheet1"`. This works fine because `pd.read_excel()` reads the first sheet by default. Just be aware if future code specifies a sheet name.

---

### D9 — Inconsistent Semester Values

| | |
|---|---|
| **Severity** | 🟡 MEDIUM |
| **Files** | `courses.xlsx` (`Semester` column) |
| **Impact** | Some courses can't be matched to sections by semester |

**Problem:** Mix of numeric (`1`, `2`, `3`) and text (`"Part I"`, `"Part II"`) semester values.

**Current handling:** `data_loader.py` lines 58-82 (`_resolve_course_semester`) already handles both formats:

```python
# data_loader.py lines 58-82 — handles numeric, roman numerals, and text with digits
digits = re.findall(r'\d+', str(course.semester_name))
if digits:
    return int(digits[0])
roman_map = {'I': 1, 'II': 2, ...}
```

**Fix Instructions:**

1. Standardize all semester values in `courses.xlsx` to numeric (1–8)
2. `"Part I"` → `1`, `"Part II"` → `2`, etc.
3. Re-import courses

```sql
-- Find courses with unresolvable semesters
SELECT id, code, name, semester, semester_name
FROM course
WHERE semester IS NULL AND semester_name IS NULL;
-- Expected: 0 rows
```

---

## Phase 2: Critical Code Fixes (~2 hours)

> ⚠️ **Prerequisite:** Phase 1 data fixes must be completed first.

---

### C1 — Faculty Fallback → ALL Faculty Become Eligible ✅ FIXED

| | |
|---|---|
| **Severity** | 🔴 CRITICAL |
| **File** | `backend/app/scheduler_new/data_loader.py` |
| **Lines** | 191-195 |
| **Status** | ✅ **Already fixed in current version** |

**Original broken code (removed):**

```python
# REMOVED — was at lines 191-193
if not qualified_ids and all_faculty_ids:
    qualified_ids = all_faculty_ids
```

**Current fixed code:**

```python
# data_loader.py lines 191-195
# Get qualified faculty for this course
qualified_ids = course_faculty_map.get(course.id, set())

# NO FALLBACK: if no qualified faculty, course stays empty
# This ensures only properly qualified faculty are assigned
```

**Impact of original bug:** When no faculty had qualifications for a course, the system would assign **any** faculty member, leading to unqualified teachers being scheduled for courses they shouldn't teach.

**Remaining action:** Ensure `faculty.xlsx` has correct `course_codes` mappings (see D4) so that `qualified_ids` is populated correctly.

---

### C4 — No Pre-Scheduling Feasibility Validation

| | |
|---|---|
| **Severity** | 🔴 CRITICAL |
| **File** | `backend/app/scheduler_new/api.py` |
| **Lines** | 36-48 |
| **Impact** | Wastes time running solver on impossible inputs; no early diagnostics |

**Current code (insufficient):**

```python
# api.py lines 36-48
def _validate_problem(problem):
    """Return a response tuple if the scheduling input is incomplete."""
    if not problem.sections:
        return jsonify({"status": "failure", "schedule": [], "error": "No sections found to schedule"}), 400
    if not problem.courses:
        return jsonify({"status": "failure", "schedule": [], "error": "No courses found to schedule"}), 400
    if not problem.faculty:
        return jsonify({"status": "failure", "schedule": [], "error": "No faculty found"}), 400
    if not problem.rooms:
        return jsonify({"status": "failure", "schedule": [], "error": "No rooms found"}), 400
    if not problem.timeslots:
        return jsonify({"status": "failure", "schedule": [], "error": "No timeslots configured"}), 400
    return None
```

**Problem:** Only checks for empty collections. Does NOT check:
- Whether total required hours exceed available faculty hours
- Whether sections have any courses assigned (`course_ids` may be `[]`)
- Whether room capacity is sufficient
- Whether any faculty are qualified for any courses

**Fix Instructions:**

```python
# api.py — replace _validate_problem with enhanced version
def _validate_problem(problem):
    """Return a response tuple if the scheduling input is incomplete or infeasible."""
    if not problem.sections:
        return jsonify({"status": "failure", "schedule": [], "error": "No sections found to schedule"}), 400
    if not problem.courses:
        return jsonify({"status": "failure", "schedule": [], "error": "No courses found to schedule"}), 400
    if not problem.faculty:
        return jsonify({"status": "failure", "schedule": [], "error": "No faculty found"}), 400
    if not problem.rooms:
        return jsonify({"status": "failure", "schedule": [], "error": "No rooms found"}), 400
    if not problem.timeslots:
        return jsonify({"status": "failure", "schedule": [], "error": "No timeslots configured"}), 400

    # FEASIBILITY CHECKS
    total_classes = problem.get_section_courses()
    if not total_classes:
        return jsonify({
            "status": "failure", "schedule": [],
            "error": "No section-course assignments found. Check that Batch.current_semester is set and program codes match."
        }), 400

    # Check faculty capacity
    faculty_capacity = sum(f.max_hours_per_week for f in problem.faculty)
    required_hours = sum(hours for _, _, hours in total_classes)
    if faculty_capacity < required_hours:
        return jsonify({
            "status": "failure", "schedule": [],
            "error": f"Insufficient faculty capacity: {required_hours} hours needed, {faculty_capacity} available."
        }), 400

    # Check room capacity
    room_slot_capacity = len(problem.timeslots) * len(problem.rooms)
    if room_slot_capacity < len(total_classes):
        return jsonify({
            "status": "failure", "schedule": [],
            "error": f"Insufficient room capacity: {len(total_classes)} classes need slots, {room_slot_capacity} available."
        }), 400

    return None
```

---

### C5 — No Post-Schedule Completeness Verification

| | |
|---|---|
| **Severity** | 🔴 CRITICAL |
| **File** | `backend/app/scheduler_new/api.py` |
| **Lines** | 167-241 (`generate` endpoint) |
| **Impact** | Scheduler reports "success" even when classes are silently dropped |

**Problem:** After `scheduler.solve()` returns, the API trusts `result.success` without independently verifying that every section-course pair got its required hours. A solver bug or constraint relaxation could silently drop classes.

**Fix Instructions:**

Add a verification function after scheduling:

```python
# api.py — add after _validate_problem
def _verify_completeness(problem, result):
    """Independently verify that all required classes were scheduled."""
    required = {}  # (section_id, course_id) -> hours_needed
    for section in problem.sections:
        for course_id in section.course_ids:
            course = problem.course_map.get(course_id)
            if not course:
                continue
            key = (section.id, course_id)
            if course.is_lab():
                required[key] = required.get(key, 0) + 2
            else:
                required[key] = required.get(key, 0) + course.hours_per_week

    scheduled = {}
    for entry in result.schedule:
        course = problem.course_map.get(entry.course_id)
        hours = course.get_hours_needed() if course and course.is_lab() else 1
        key = (entry.section_id, entry.course_id)
        scheduled[key] = scheduled.get(key, 0) + hours

    missing = []
    for key, needed in required.items():
        got = scheduled.get(key, 0)
        if got < needed:
            section = problem.section_map.get(key[0])
            course = problem.course_map.get(key[1])
            missing.append({
                "section": section.get_full_name() if section else str(key[0]),
                "course": course.code if course else str(key[1]),
                "required": needed,
                "scheduled": got
            })

    return missing
```

Then in the `generate` endpoint, after `result = scheduler.solve()`:

```python
# After line 202 in generate()
result = scheduler.solve()

# Independent completeness check
missing = _verify_completeness(problem, result)
if missing:
    logger.warning(f"Completeness check found {len(missing)} unsatisfied section-course pairs")
    # Include in response stats
    result.stats["completeness_missing"] = missing
```

---

### C12 — Batch.current_semester Must Be Set

| | |
|---|---|
| **Severity** | 🔴 CRITICAL |
| **File** | `backend/app/models/batch.py` line 11, `backend/app/scheduler_new/data_loader.py` line 255 |
| **Impact** | If `NULL`, NO courses match sections — semester filter fails silently |

**Batch model:**

```python
# batch.py line 11
current_semester = db.Column(db.Integer, nullable=False, default=1)  # 1-8
```

**Data loader usage:**

```python
# data_loader.py lines 254-255
program_code = program.code
current_semester = section.batch.current_semester

# data_loader.py lines 269-275 — strict semester matching
course_sem = course_semesters.get(c.id)
if course_sem is not None and current_semester is not None:
    if course_sem != current_semester:
        continue
elif course_sem is None:
    # Skip courses without a resolvable semester
    continue
```

**Problem:** While the model defaults to `1`, batches imported via Excel may have `NULL` if the import logic doesn't set it. The `bulk_import_batches` function (`resources.py` line 852) does NOT import `current_semester`.

**Fix Instructions:**

1. **Set all NULL semesters in the database:**

```sql
-- Check for NULL semesters
SELECT id, code, name, academic_year, current_semester
FROM batch
WHERE current_semester IS NULL;

-- Fix: Set based on academic year calculation
UPDATE batch
SET current_semester = 1
WHERE current_semester IS NULL;
```

2. **Add `current_semester` to batch import:**

```python
# backend/app/routes/resources.py — modify bulk_import_batches
# Add current_semester to field mapping:
res, status = _bulk_import_logic(
    file,
    Batch,
    {'name': 'Name', 'code': 'Code', 'academic_year': 'AcademicYear', 'current_semester': 'CurrentSemester'},
    'code',
    lookup_configs={'program_id': (Program, 'code', 'ProgramCode')}
)
```

3. **Ensure `batches.xlsx` has a `CurrentSemester` column.**

---

### E1 — Strict Course-to-Faculty Binding from Excel

| | |
|---|---|
| **Severity** | 🔴 CRITICAL |
| **File** | `backend/app/routes/resources.py` lines 957-965 |
| **Impact** | Faculty qualifications not properly populated from Excel data |

**Current code:**

```python
# resources.py lines 957-965
course_codes_val = row.get('course_codes')
if pd.notna(course_codes_val):
    course_codes = [c.strip() for c in str(course_codes_val).replace(';', ',').split(',') if c.strip()]
    for course_code in course_codes:
        course = Course.query.filter_by(code=course_code).first()
        if course and course not in t.qualified_courses:
            t.qualified_courses.append(course)
```

**Problem:** This code works IF the course codes in faculty.xlsx match exactly. After fixing D2 (duplicate course codes) and D4 (orphan codes), the binding should work. However, there's no endpoint to **re-sync** bindings without re-importing all teachers.

**Fix Instructions:**

1. Add a dedicated re-sync endpoint:

```python
# resources.py — add new endpoint
@resources_bp.route('/teachers/import-course-bindings', methods=['POST'])
@roles_required('admin')
def import_teacher_course_bindings():
    """Re-sync faculty course qualifications from Excel without touching other data."""
    file = request.files.get('file')
    if not file:
        return jsonify({"error": "No file uploaded"}), 400

    try:
        df = pd.read_excel(BytesIO(file.read()))
        df.columns = [c.lower().strip() for c in df.columns]
        success = 0
        errors = []

        for index, row in df.iterrows():
            try:
                email = row.get('email')
                if pd.isna(email):
                    continue
                t = Teacher.query.filter_by(email=str(email).strip()).first()
                if not t:
                    errors.append(f"Row {index+2}: Teacher not found: {email}")
                    continue

                course_codes_val = row.get('course_codes')
                if pd.notna(course_codes_val):
                    course_codes = [c.strip() for c in str(course_codes_val).replace(';', ',').split(',') if c.strip()]
                    matched = 0
                    for course_code in course_codes:
                        course = Course.query.filter_by(code=course_code).first()
                        if course and course not in t.qualified_courses:
                            t.qualified_courses.append(course)
                            matched += 1
                    success += matched
            except Exception as e:
                errors.append(f"Row {index+2}: {str(e)}")

        db.session.commit()
        return jsonify({
            "message": f"Added {success} course bindings",
            "errors": errors
        }), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500
```

---

### E2 — Read Actual L/T/P Hours Instead of Hardcoded Values

| | |
|---|---|
| **Severity** | 🔴 CRITICAL |
| **File** | `backend/app/models/course.py`, `backend/app/scheduler_new/data_loader.py` |
| **Impact** | Same as D7 but from the L/T/P column perspective |

**Problem:** The courses.xlsx may have separate `L` (Lecture), `T` (Tutorial), `P` (Practical) columns. The current system only uses `WeeklyHours` (if it exists) or hardcodes 3/2.

**Fix Instructions:**

**Step 1:** Extend the Course model:

```python
# backend/app/models/course.py
lecture_hours = db.Column(db.Integer, nullable=True)    # L
tutorial_hours = db.Column(db.Integer, nullable=True)   # T
practical_hours = db.Column(db.Integer, nullable=True)  # P
weekly_hours = db.Column(db.Integer, nullable=True)     # Total
```

**Step 2:** Update the import to read these columns:

```python
# backend/app/routes/resources.py — inside bulk_import_courses
lecture_hours = int(row.get('L')) if pd.notna(row.get('L')) else None
tutorial_hours = int(row.get('T')) if pd.notna(row.get('T')) else None
practical_hours = int(row.get('P')) if pd.notna(row.get('P')) else None
weekly_hours = int(row.get('WeeklyHours')) if pd.notna(row.get('WeeklyHours')) else None

# Auto-compute weekly_hours from L+T+P if not given
if weekly_hours is None and any([lecture_hours, tutorial_hours, practical_hours]):
    weekly_hours = (lecture_hours or 0) + (tutorial_hours or 0) + (practical_hours or 0)
```

**Step 3:** Update `data_loader.py` to prefer these values:

```python
# data_loader.py — inside load_courses, replace lines 186-189
hours = getattr(course, 'weekly_hours', None)
if hours is None:
    # Compute from L/T/P
    l = getattr(course, 'lecture_hours', 0) or 0
    t = getattr(course, 'tutorial_hours', 0) or 0
    p = getattr(course, 'practical_hours', 0) or 0
    hours = l + t + p
if hours is None or hours == 0:
    hours = 2 if (course.course_type or '').lower() == "lab" else 3
```

---

## Phase 3: High Priority Code Fixes (~2 hours)

---

### C2 — Lab Room Fallback to Regular Classrooms

| | |
|---|---|
| **Severity** | 🟠 HIGH |
| **File** | `backend/app/scheduler_new/constraint_engine.py` lines 60-73 and 173-180 |
| **Impact** | Lab courses scheduled in regular classrooms → students have no lab equipment |

**Problem:** When no lab room has sufficient capacity, the constraint engine falls back to regular classrooms:

```python
# constraint_engine.py lines 60-73 — is_consistent method
# Constraint 4: Room type suitability (with fallback for labs)
if not room.is_suitable_for(course.course_type):
    # Fallback: allow labs in regular rooms if no lab rooms available with capacity
    if course.course_type == "Lab":
        lab_rooms_available = any(
            r.is_suitable_for("Lab") and r.can_accommodate(section.student_count)
            for r in self.problem.rooms
        )
        if lab_rooms_available:
            return False, f"Room {room.name} not suitable for Lab (lab rooms exist)"
        # No lab rooms with capacity - allow fallback to regular rooms ← PROBLEM
    else:
        return False, f"Room {room.name} not suitable for {course.course_type}"
```

```python
# constraint_engine.py lines 173-180 — get_valid_rooms method
# Fallback for labs: if no lab rooms available, use any room with capacity
if not valid and course.course_type == "Lab":
    for room in self.problem.rooms:
        if not room.can_accommodate(section.student_count):
            continue
        if self.room_schedule[room.id][slot_key]:
            continue
        valid.append(room.id)
```

**Fix Instructions:**

Replace the fallback with a warning instead of silently scheduling:

```python
# constraint_engine.py — replace lines 60-73
if not room.is_suitable_for(course.course_type):
    if course.course_type == "Lab":
        # HARD CONSTRAINT: labs MUST be in lab rooms
        return False, f"Room {room.name} is not a lab room — Lab courses require lab facilities"
    else:
        return False, f"Room {room.name} not suitable for {course.course_type}"

# constraint_engine.py — replace lines 173-180
# REMOVE the fallback entirely. If no lab rooms exist, the lab class becomes unschedulable
# and will appear in the failed_details report.
# Delete lines 173-180 entirely.
```

---

### C3 — Lab Hours Hardcoded to 2

| | |
|---|---|
| **Severity** | 🟠 HIGH |
| **File** | `backend/app/scheduler_new/models.py` lines 129-134 |
| **Impact** | All labs use exactly 2 consecutive slots, regardless of actual lab duration |

**Current code:**

```python
# models.py lines 129-134
def get_hours_needed(self) -> int:
    """Get hours required for a single scheduled occurrence."""
    if self.is_lab():
        # Business rule: each lab course appears once per week as one 2-slot block.
        return 2
    return self.hours_per_week
```

**Fix Instructions:**

Use the actual `hours_per_week` value (populated from `weekly_hours` after D7/E2 fix):

```python
# models.py — replace get_hours_needed
def get_hours_needed(self) -> int:
    """Get hours required for a single scheduled occurrence."""
    if self.is_lab():
        # Use configured hours; default to 2 if not set
        return self.hours_per_week if self.hours_per_week > 0 else 2
    return self.hours_per_week
```

> **Note:** After this fix, labs that require 3+ hours will need that many consecutive slots. Verify `_compute_valid_starts` in `hybrid_engine.py` can accommodate the requested block sizes.

---

### C6 — No Batch-Level Overlap Prevention

| | |
|---|---|
| **Severity** | 🟠 HIGH |
| **File** | `backend/app/scheduler_new/constraint_engine.py` line 84 |
| **Impact** | Section A and B of same batch can have classes at the same time → shared elective clash |

**Current code:**

```python
# constraint_engine.py line 84
# Constraint 7: No section overlap (same section, same time)
if self.section_schedule[entry.section_id][slot_key]:
    return False, f"Section {section.name} already has class at {entry.timeslot}"
```

**Problem:** Only checks individual section overlap. Two sections in the same batch (e.g., "Section A" and "Section B") can be scheduled at the same timeslot. If they share a faculty member or an elective course, this causes real conflicts.

**Fix Instructions:**

Add batch-level tracking:

```python
# constraint_engine.py — add to __init__ (after line 27)
self.batch_schedule: Dict[int, Dict[Tuple[str, str], Set[Tuple[int, int]]]] = defaultdict(lambda: defaultdict(set))

# In add_entry, add:
self.batch_schedule[section.batch_id][slot_key].add(class_key)

# In remove_entry, add:
self.batch_schedule[section.batch_id][slot_key].discard(class_key)

# In is_consistent, add after Constraint 7:
# Constraint 7b: No batch overlap (same batch, same time)
section = self.problem.section_map.get(entry.section_id)
if section and section.batch_id:
    if self.batch_schedule[section.batch_id][slot_key]:
        return False, f"Batch {section.batch_code} already has a class at {entry.timeslot}"
```

> **Note:** This is a HARD constraint that prevents any parallel sessions for the same batch. Only enable this if your institution doesn't allow parallel sections.

---

### E3 — Batch-Isolation Priority Scheduling

| | |
|---|---|
| **Severity** | 🟠 HIGH |
| **File** | `backend/app/scheduler_new/hybrid_engine.py` |
| **Impact** | Cross-batch faculty classes should be scheduled first to prevent one batch monopolizing shared faculty |

**Problem:** The current greedy algorithm orders by difficulty (fewest faculty/room options first). Cross-batch shared faculty are scheduled in the same pass as everyone else, which can lead to one batch consuming all available timeslots of a shared teacher.

**Fix Instructions:**

Modify `_build_class_order` to prioritize cross-batch classes:

```python
# hybrid_engine.py — modify _build_class_order
def _build_class_order(self, classes, valid_starts):
    """Order classes: cross-batch first, then by difficulty."""
    # Build a set of faculty that teach in multiple batches
    faculty_batch_map = defaultdict(set)
    for section in self.problem.sections:
        for course_id in section.course_ids:
            course = self.problem.course_map.get(course_id)
            if course:
                for fid in course.qualified_faculty_ids:
                    faculty_batch_map[fid].add(section.batch_id)

    cross_batch_faculty = {fid for fid, batches in faculty_batch_map.items() if len(batches) > 1}

    ranked = []
    for class_idx, (section_id, course_id, hours) in enumerate(classes):
        course = self.problem.course_map[course_id]
        section = self.problem.section_map[section_id]
        faculty_count = len(self._get_faculty_candidates(course))
        room_count = len(self._get_room_candidates(section, course))
        difficulty = 1.0 / (faculty_count * room_count + 1)

        # Boost priority for cross-batch faculty classes
        has_cross_batch = bool(course.qualified_faculty_ids & cross_batch_faculty)
        priority = 0 if has_cross_batch else 1  # 0 = schedule first

        ranked.append((priority, difficulty, class_idx, section_id, course_id, hours))

    ranked.sort(key=lambda item: (item[0], -item[1], item[2], item[3]))
    return ranked
```

---

## Phase 4: Medium/Low Priority (~2 hours)

---

### C7 — Fuzzy Program Matching is Fragile ✅ FIXED

| | |
|---|---|
| **Severity** | 🟠 HIGH |
| **File** | `backend/app/scheduler_new/data_loader.py` lines 29-56, 258-279 |
| **Status** | ✅ **Already fixed in current version** |

**Current code uses exact matching:**

```python
# data_loader.py lines 260-264
for c in dept_courses:
    # STRICT: Use exact program code matching
    if c.program_code and program_code:
        if c.program_code != program_code:
            continue
```

**Impact:** This fix means **D1 (program name mismatch) is now a hard blocker**. If `courses.xlsx` and `programs.xlsx` have mismatched codes, courses will NEVER match sections. Fix D1 first.

---

### C8 — OR-Tools Falls Back Too Early

| | |
|---|---|
| **Severity** | 🟡 MEDIUM |
| **File** | `backend/app/scheduler_new/api.py` line 24 |
| **Impact** | OR-Tools is never used for full university schedule (36 batches × ~8 courses = ~576 classes) |

**Current code:**

```python
# api.py line 24
AUTO_HYBRID_CLASS_THRESHOLD = 300
```

**Problem:** With ~576 classes, the threshold always routes to the Hybrid engine. OR-Tools CP-SAT is generally better for finding globally optimal solutions.

**Fix:** See E6 for the recommended approach (always try OR-Tools first, fallback on timeout).

---

### C9 — Hardcoded Faculty Limits

| | |
|---|---|
| **Severity** | 🟡 MEDIUM |
| **File** | `backend/app/scheduler_new/models.py` lines 43-44 |
| **Impact** | Cannot customize faculty workload limits per institution |

**Current code:**

```python
# models.py lines 43-44
max_hours_per_day: int = 6
max_hours_per_week: int = 30
```

**Fix Instructions:**

Make these configurable via the database or settings:

```python
# Option 1: Read from ScheduleSettings
def load_faculty(self, course_ids=None):
    # After loading settings:
    max_daily = getattr(self.settings, 'faculty_max_hours_per_day', 6)
    max_weekly = getattr(self.settings, 'faculty_max_hours_per_week', 30)

    faculty_list.append(Faculty(
        id=teacher.id,
        name=teacher.name,
        email=teacher.email,
        qualified_course_ids=qualified_ids,
        availability=availability,
        max_hours_per_day=max_daily,
        max_hours_per_week=max_weekly,
    ))
```

---

### C10 — Import Order Not Enforced

| | |
|---|---|
| **Severity** | 🟡 MEDIUM |
| **File** | `backend/app/routes/resources.py` |
| **Impact** | If courses are imported before departments, lookup fails silently |

**Problem:** The `_bulk_import_logic` function (line 781) catches exceptions per-row and reports them as errors. If the user imports `courses.xlsx` before `departments.xlsx`, every row fails with "Department not found with code='...'" but returns HTTP 200 with a long error list.

**Fix Instructions:**

Add order validation at the UI level or in a master import endpoint:

```python
# resources.py — add master import endpoint
@resources_bp.route('/import-all', methods=['POST'])
@roles_required('admin')
def import_all_data():
    """Import all Excel files in correct dependency order."""
    import_order = [
        ('departments', import_departments),
        ('programs', bulk_import_programs),
        ('batches', bulk_import_batches),
        ('courses', bulk_import_courses),
        ('rooms', None),  # No dedicated import function yet
        ('sections', bulk_import_sections),
        ('teachers', bulk_import_teachers),
    ]

    results = {}
    for name, import_func in import_order:
        file_key = name
        file = request.files.get(file_key)
        if not file:
            results[name] = {"status": "skipped", "message": "No file uploaded"}
            continue
        if import_func:
            try:
                result, status = import_func()
                results[name] = result
            except Exception as e:
                results[name] = {"status": "error", "error": str(e)}
        else:
            results[name] = {"status": "skipped", "message": "No import handler"}

    return jsonify({"results": results}), 200
```

---

### C11 — No Lab Consecutive-Slot Guarantee ✅ CORRECT

| | |
|---|---|
| **Severity** | 🟡 MEDIUM |
| **File** | `backend/app/scheduler_new/hybrid_engine.py` lines 202-224 |
| **Status** | ✅ **Already correct** |

**The `_compute_valid_starts` method correctly handles breaks:**

```python
# hybrid_engine.py lines 214-219
for offset in range(hours - 1):
    current = consecutive_slots[offset]
    nxt = consecutive_slots[offset + 1]
    if current.day != nxt.day or current.end_time != nxt.start_time:
        is_valid = False
        break
```

This ensures that lab blocks (2+ consecutive slots) never span across lunch breaks or day boundaries.

---

### C13 — Old Scheduling API Still Exists

| | |
|---|---|
| **Severity** | 🟢 LOW |
| **File** | `backend/app/routes/scheduling.py` |
| **Lines** | 219-253 (`/api/scheduling/generate`) |
| **Impact** | Two endpoints for the same operation; old one has different behavior and fallback logic |

**Endpoints:**
- **Old:** `POST /api/scheduling/generate` (in `scheduling.py`) — has fallback to all teachers (line 521)
- **New:** `POST /api/scheduler/generate` (in `api.py`) — uses the clean scheduler_new architecture

**Fix Instructions:**

Either:
1. **Deprecate the old endpoint** by adding a warning and redirecting:

```python
# scheduling.py — modify generate_timetable
@scheduling_bp.route('/generate', methods=['POST'])
@roles_required('admin', 'dept_head')
def generate_timetable():
    import warnings
    warnings.warn("Use /api/scheduler/generate instead", DeprecationWarning, stacklevel=2)
    # ... redirect to new endpoint
```

2. **Or remove it entirely** after confirming the frontend uses the new endpoint.

---

### E4 — Faculty Daily Load Balancing

| | |
|---|---|
| **Severity** | 🟡 MEDIUM |
| **File** | `backend/app/scheduler_new/hybrid_engine.py` |
| **Impact** | Faculty could get 4 classes Monday, 0 Friday — uneven workload |

**Fix Instructions:**

Add a soft penalty for uneven daily distribution:

```python
# hybrid_engine.py — in _greedy_assign, when scoring candidates
# After finding a valid (faculty, room, start_idx) combination,
# prefer days where the faculty has fewer hours:
day = timeslot_list[start_idx].day
current_day_load = state["faculty_daily_hours"][faculty.id][day]
avg_daily_load = state["faculty_hours"][faculty.id] / max(1, len(self.problem.timeslots) // len(timeslot_list))

# Penalize days above average
load_penalty = abs(current_day_load - avg_daily_load)
# Use load_penalty as a tiebreaker in candidate selection
```

---

### E5 — Handle Non-Standard Course Types

| | |
|---|---|
| **Severity** | 🟡 MEDIUM |
| **File** | `backend/app/models/course.py`, `backend/app/scheduler_new/data_loader.py` |
| **Impact** | Mentoring, Project, Mock Interview courses with 0 hours break scheduling |

**Fix Instructions:**

1. Add `course_category` column:

```python
# course.py
course_category = db.Column(db.String(50), nullable=True)  # Theory, Lab, Mentoring, Project
```

2. Filter out 0-hour courses in `data_loader.py`:

```python
# data_loader.py — inside load_courses, skip zero-hour courses
if hours == 0 or hours is None:
    continue  # Don't add to scheduler
```

3. Or handle them as special entries that don't consume timeslots.

---

### E6 — Always Use OR-Tools as Default Engine

| | |
|---|---|
| **Severity** | 🟡 MEDIUM |
| **File** | `backend/app/scheduler_new/api.py` lines 51-65 |
| **Impact** | Hybrid engine is always chosen for real-world inputs |

**Current code:**

```python
# api.py lines 62-63
if not ORTOOLS_AVAILABLE or total_classes > AUTO_HYBRID_CLASS_THRESHOLD:
    return HybridSchedulerEngine(problem=problem, debug=debug_mode), "hybrid", total_classes
```

**Fix Instructions:**

Try OR-Tools first, fallback on timeout:

```python
# api.py — replace _build_scheduler
def _build_scheduler(problem, requested_engine, time_limit, debug_mode):
    normalized_engine = str(requested_engine or "auto").strip().lower()

    if normalized_engine == "hybrid":
        return HybridSchedulerEngine(problem=problem, debug=debug_mode), "hybrid", len(problem.get_section_courses())

    if normalized_engine == "ortools" and ORTOOLS_AVAILABLE:
        return OrtoolsSchedulerEngine(problem=problem, time_limit_seconds=time_limit, debug=debug_mode), "ortools", len(problem.get_section_courses())

    if normalized_engine == "auto":
        # Always try OR-Tools first; it produces globally optimal solutions
        if ORTOOLS_AVAILABLE:
            return OrtoolsSchedulerEngine(problem=problem, time_limit_seconds=time_limit, debug=debug_mode), "ortools", len(problem.get_section_courses())
        return HybridSchedulerEngine(problem=problem, debug=debug_mode), "hybrid", len(problem.get_section_courses())

    return HybridSchedulerEngine(problem=problem, debug=debug_mode), "hybrid", len(problem.get_section_courses())
```

---

### E7 — Post-Schedule Completeness Report

| | |
|---|---|
| **Severity** | 🟡 MEDIUM |
| **File** | `backend/app/scheduler_new/api.py` |
| **Impact** | No per-course completeness tracking or repair phase |

**Fix Instructions:**

After the completeness check (C5), add a repair phase:

```python
# After main scheduling, attempt to schedule missing classes
if missing_classes:
    logger.info(f"Attempting repair for {len(missing_classes)} missing classes")
    repair_result = _attempt_repair(problem, missing_classes, result.schedule, constraint_engine)
    result.schedule.extend(repair_result.new_entries)
    result.stats["repaired"] = len(repair_result.new_entries)
```

---

## Diagnostic SQL Queries

Run these queries against your database to assess data quality before and after fixes.

```sql
-- ============================================================
-- 1. BATCHES WITH NULL CURRENT_SEMESTER (C12)
-- ============================================================
SELECT id, code, name, academic_year, current_semester
FROM batch
WHERE current_semester IS NULL;
-- Expected: 0 rows

-- ============================================================
-- 2. SECTIONS WITH NO MATCHING COURSES (D1, C12)
-- ============================================================
SELECT s.id, s.name, b.code, b.current_semester, p.code AS program_code
FROM section s
JOIN batch b ON s.batch_id = b.id
JOIN program p ON b.program_id = p.id
LEFT JOIN course c ON c.program_code = p.code
    AND c.semester = b.current_semester
WHERE c.id IS NULL
  AND b.current_semester IS NOT NULL;
-- Expected: 0 rows (after D1 and D7 fixes)

-- ============================================================
-- 3. COURSES WITH NO QUALIFIED FACULTY (D4, E1)
-- ============================================================
SELECT c.id, c.code, c.name, c.program_code
FROM course c
LEFT JOIN teacher_qualifications tq ON c.id = tq.course_id
WHERE tq.course_id IS NULL
ORDER BY c.program_code;
-- Expected: small list; investigate each

-- ============================================================
-- 4. PROGRAM CODE MISMATCHES (D1)
-- ============================================================
SELECT DISTINCT c.program_code, p.code AS correct_code
FROM course c
JOIN program p ON c.department_id = p.department_id
WHERE c.program_code != p.code
  AND c.program_code IS NOT NULL;
-- Expected: 0 rows after D1 fix

-- ============================================================
-- 5. DUPLICATE COURSE CODES (D2)
-- ============================================================
SELECT code, COUNT(*) as cnt
FROM course
GROUP BY code
HAVING cnt > 1;
-- Expected: 0 rows after D2 fix

-- ============================================================
-- 6. DUPLICATE FACULTY EMAILS (D3)
-- ============================================================
SELECT email, COUNT(*) as cnt, GROUP_CONCAT(name) as names
FROM teacher
GROUP BY email
HAVING cnt > 1;
-- Expected: 0 rows after D3 fix

-- ============================================================
-- 7. ROOMS WITH INVALID DEPARTMENT REFERENCE (D5)
-- ============================================================
SELECT r.id, r.name, r.department_id, d.code
FROM room r
LEFT JOIN department d ON r.department_id = d.id
WHERE r.department_id IS NOT NULL AND d.id IS NULL;
-- Expected: 0 rows

-- ============================================================
-- 8. LAB ROOMS WITHOUT PROGRAM ASSIGNMENT
-- ============================================================
SELECT r.id, r.name, r.capacity
FROM room r
WHERE r.room_type LIKE '%Lab%'
  AND r.program_id IS NULL;
-- Review: should lab rooms be program-scoped?

-- ============================================================
-- 9. ROOM CAPACITY VS SECTION SIZE GAP
-- ============================================================
SELECT r.name, r.capacity, r.room_type,
       (SELECT MAX(s.student_count) FROM section s) as max_section_size
FROM room r
WHERE r.capacity < (SELECT MAX(s.student_count) FROM section s)
ORDER BY r.capacity;
-- Shows rooms that can't fit the largest sections

-- ============================================================
-- 10. FACULTY WORKLOAD DISTRIBUTION
-- ============================================================
SELECT t.name, t.email,
       COUNT(tq.course_id) as qualified_courses,
       COUNT(DISTINCT td.department_id) as departments
FROM teacher t
LEFT JOIN teacher_qualifications tq ON t.id = tq.teacher_id
LEFT JOIN teacher_departments td ON t.id = td.teacher_id
GROUP BY t.id
ORDER BY qualified_courses DESC;
-- Shows faculty qualification spread
```

---

## Verification Checklist

Use this checklist after applying fixes. Each item should be verified before moving to the next phase.

### Phase 1: Data Verification

- [ ] **D1:** Run SQL query #4 — 0 mismatches between course and program codes
- [ ] **D2:** Run SQL query #5 — 0 duplicate course codes
- [ ] **D3:** Run SQL query #6 — 0 duplicate faculty emails
- [ ] **D4:** Run SQL query #3 — Review courses with no qualified faculty; all orphans resolved
- [ ] **D5:** Run SQL query #7 — 0 rooms with invalid department references
- [ ] **D6:** Verify all lab rooms have correct `program_id` set
- [ ] **D7:** Verify `weekly_hours` column exists in course table and is populated
- [ ] **D8:** Confirm sections import successfully
- [ ] **D9:** Run query to find courses with NULL semester — 0 results

### Phase 2: Critical Code Verification

- [ ] **C1:** Verify `data_loader.py` has NO `all_faculty_ids` fallback
- [ ] **C4:** Test with intentionally impossible data — should get clear error, not timeout
- [ ] **C5:** Generate schedule, then verify `completeness_missing` in response stats
- [ ] **C12:** Run SQL query #1 — 0 batches with NULL `current_semester`
- [ ] **E1:** Test `/teachers/import-course-bindings` endpoint
- [ ] **E2:** Verify `lecture_hours`, `tutorial_hours`, `practical_hours` columns exist

### Phase 3: High Priority Verification

- [ ] **C2:** Schedule a lab course — verify it's ONLY assigned to lab rooms
- [ ] **C3:** Check that labs with 3+ hour requirements get 3+ consecutive slots
- [ ] **C6:** Schedule two sections of same batch — verify no timeslot overlap
- [ ] **E3:** Review schedule order — cross-batch faculty classes appear first

### Phase 4: Full Integration Test

- [ ] **Full schedule generation** runs to completion with >95% success rate
- [ ] **No constraint violations** in the generated timetable
- [ ] **All sections** have their expected courses scheduled
- [ ] **Faculty workload** is balanced (no faculty >30 hours/week)
- [ ] **Lab courses** are only in lab rooms
- [ ] **Old API** deprecated or removed

### Final Smoke Test

```bash
# 1. Start the application
cd backend
flask run

# 2. Check scheduler stats
curl -H "Authorization: Bearer <token>" http://localhost:5000/api/scheduler/scheduler-stats

# 3. Generate schedule
curl -X POST -H "Authorization: Bearer <token>" \
     -H "Content-Type: application/json" \
     -d '{"department_id": 1, "engine": "ortools", "time_limit_seconds": 120}' \
     http://localhost:5000/api/scheduler/generate-timetable

# 4. Verify no conflicts
curl -H "Authorization: Bearer <token>" http://localhost:5000/api/scheduling/stats
```

---

## Quick Reference Card

### Common Commands

```bash
# Database migration
cd backend
flask db migrate -m "Description of change"
flask db upgrade

# Run scheduler (standalone)
cd backend
python run_scheduler.py

# Run test scheduler
cd backend
python run_test_schedule.py

# Check dataset limits
cd backend
python check_dataset_limits.py
```

### Key File Paths

| File | Purpose |
|------|---------|
| `backend/app/scheduler_new/models.py` | Scheduler dataclasses (Faculty, Room, Course, etc.) |
| `backend/app/scheduler_new/data_loader.py` | Loads DB data → scheduler models |
| `backend/app/scheduler_new/constraint_engine.py` | Hard constraint validation |
| `backend/app/scheduler_new/hybrid_engine.py` | Greedy + local search solver |
| `backend/app/scheduler_new/ortools_engine.py` | OR-Tools CP-SAT solver |
| `backend/app/scheduler_new/api.py` | Flask endpoints for scheduling |
| `backend/app/routes/resources.py` | Bulk import endpoints |
| `backend/app/routes/scheduling.py` | Old scheduling endpoint |
| `backend/app/models/course.py` | Course DB model |
| `backend/app/models/batch.py` | Batch DB model |

### API Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `POST` | `/api/departments/import` | Import departments |
| `POST` | `/api/programs/import` | Import programs |
| `POST` | `/api/batches/import` | Import batches |
| `POST` | `/api/courses/import` | Import courses |
| `POST` | `/api/sections/import` | Import sections |
| `POST` | `/api/teachers/import` | Import teachers |
| `POST` | `/api/teachers/import-course-bindings` | Re-sync faculty qualifications (new) |
| `POST` | `/api/scheduler/generate` | Generate schedule (new) |
| `POST` | `/api/scheduler/generate-timetable` | Generate + save to DB |
| `GET` | `/api/scheduler/scheduler-stats` | Pre-scheduling stats |
| `POST` | `/api/scheduling/generate` | Generate schedule (old, to deprecate) |
| `GET` | `/api/scheduling/stats` | Post-scheduling conflict stats |

### Import Order (MUST follow this sequence)

```
1. departments.xlsx     → POST /api/departments/import
2. programs.xlsx        → POST /api/programs/import
3. batches.xlsx         → POST /api/batches/import
4. courses.xlsx         → POST /api/courses/import
5. rooms.xlsx           → POST /api/rooms/import
6. sections.xlsx        → POST /api/sections/import
7. faculty.xlsx         → POST /api/teachers/import
```

### Severity Legend

| Badge | Meaning | Action Required |
|-------|---------|----------------|
| 🔴 CRITICAL | Scheduler produces wrong/empty results | Must fix before any scheduling |
| 🟠 HIGH | Significant classes lost or misassigned | Should fix in same release |
| 🟡 MEDIUM | Degraded quality but scheduler runs | Fix in next sprint |
| 🟢 LOW | Cosmetic or informational | Fix when convenient |

---

## Appendix: Issue Dependency Graph

```
D1 (Program Mismatch) ──────────┐
D2 (Duplicate Codes) ────────────┤
D3 (Duplicate Faculty) ──────────┤
D4 (Orphan Codes) ───────────────┼──→ Data must be clean first
D5 (Room Dept Code) ─────────────┤
D6 (Room Program Codes) ─────────┤
D7 (WeeklyHours) ────────────────┤
D9 (Semester Values) ────────────┘
          │
          ▼
C12 (Batch Semester) ────→ Must be set for sections to get courses
          │
          ▼
C4 (Feasibility Check) ──→ Validates data before solving
          │
          ▼
E1 (Faculty Binding) ────→ Ensures correct faculty-course mapping
E2 (L/T/P Hours) ────────→ Ensures correct hour counts
          │
          ▼
C2 (Lab Room Fallback) ──→ Fix constraint logic
C3 (Lab Hours) ───────────→ Use actual values
C6 (Batch Overlap) ───────→ Add batch-level constraint
          │
          ▼
C5 (Completeness) ────────→ Verify results
E3 (Priority Scheduling) ─→ Optimize ordering
E6 (OR-Tools Default) ────→ Better solver selection
```

---

*This document was generated as part of the AIPCSS scheduling engine audit. All line numbers reference the current codebase state at the time of analysis.*
