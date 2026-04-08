# AIPCSS v2 — Bugfix Guide

> **Comprehensive fix instructions for 70 identified issues**  
> Priority: 🔴 Critical (8) → 🟠 High (20) → 🟡 Medium (24) → 🔵 Low (18)  
> Each fix includes **file path, line numbers, before/after code, and explanation.**

---

## Table of Contents

- [Phase 1: Critical Fixes (Must Fix)](#phase-1-critical-fixes-must-fix)
  - [C1. Missing `@dataclass` decorators in scheduler_engine.py](#c1-missing-dataclass-decorators-in-scheduler_enginepy)
  - [C2. Timetable deleted BEFORE solver runs — data loss risk](#c2-timetable-deleted-before-solver-runs--data-loss-risk)
  - [C3. Theory course scheduling model mismatch in backtracking solver](#c3-theory-course-scheduling-model-mismatch-in-backtracking-solver)
  - [C4. ConstraintEngine ignores workload_map](#c4-constraintengine-ignores-workload_map)
  - [C5. _save_schedule_entries has no transaction safety](#c5-_save_schedule_entries-has-no-transaction-safety)
  - [C6. Hardcoded insecure secret keys](#c6-hardcoded-insecure-secret-keys)
  - [C7. Auth isLoading hardcoded to false (Frontend)](#c7-auth-isloading-hardcoded-to-false-frontend)
  - [C8. Concurrent 401 retry race condition (Frontend)](#c8-concurrent-401-retry-race-condition-frontend)
- [Phase 2: High Priority Fixes (Should Fix)](#phase-2-high-priority-fixes-should-fix)
- [Phase 3: Medium Fixes (Fix When Possible)](#phase-3-medium-fixes-fix-when-possible)
- [Phase 4: Low Priority Fixes (Nice to Have)](#phase-4-low-priority-fixes-nice-to-have)

---

## Phase 1: Critical Fixes (Must Fix)

---

### C1. Missing `@dataclass` decorators in `scheduler_engine.py`

**File:** `backend/app/scheduler_new/scheduler_engine.py`  
**Lines:** 17, 29, 40  
**Impact:** The backtracking CSP solver is fundamentally broken. Classes are plain Python classes, not dataclasses. `field()` doesn't work, `__hash__`/`__eq__` not auto-generated.

**BEFORE:**
```python
# Line ~17
dataclass
class AssignmentVariable:
    """Represents a class that needs to be scheduled"""
    section_id: int
    course_id: int
    hours_needed: int
    assigned: bool = False
    
    def __hash__(self):
        return hash((self.section_id, self.course_id, self.hours_needed))

# Line ~29
dataclass
class DomainValue:
    """A possible assignment: (faculty, room, timeslot)"""
    faculty_id: int
    room_id: int
    timeslot: Timeslot
    
    def __hash__(self):
        return hash((self.faculty_id, self.room_id, self.timeslot))

# Line ~40
dataclass
class ScheduleResult:
    """Result of scheduling attempt"""
    success: bool
    schedule: List[ScheduleEntry] = field(default_factory=list)
    error_message: Optional[str] = None
    conflicts: Dict[str, int] = field(default_factory=dict)
    stats: Dict[str, Any] = field(default_factory=dict)
```

**AFTER (Option A — Add `@`):**
```python
from dataclasses import dataclass, field

@dataclass
class AssignmentVariable:
    """Represents a class that needs to be scheduled"""
    section_id: int
    course_id: int
    hours_needed: int
    assigned: bool = False

@dataclass
class DomainValue:
    """A possible assignment: (faculty, room, timeslot)"""
    faculty_id: int
    room_id: int
    timeslot: Timeslot

@dataclass
class ScheduleResult:
    """Result of scheduling attempt"""
    success: bool
    schedule: List[ScheduleEntry] = field(default_factory=list)
    error_message: Optional[str] = None
    conflicts: Dict[str, int] = field(default_factory=dict)
    stats: Dict[str, Any] = field(default_factory=dict)
```

**AFTER (Option B — Better: Delete duplicates, import from models.py):**
```python
# DELETE the three class definitions entirely from scheduler_engine.py.
# At the top of the file, import them:

from .models import (
    ScheduleEntry, ScheduleResult, AssignmentVariable, DomainValue,
    Timeslot, SchedulingProblem
)
```

> **Why Option B is better:** `models.py` already has `ScheduleResult` with `to_dict()`, `AssignmentVariable` with `__hash__`, and `DomainValue` with `__hash__`. Keeping two copies guarantees they'll drift apart.

---

### C2. Timetable deleted BEFORE solver runs — data loss risk

**File:** `backend/app/routes/scheduling.py`  
**Lines:** ~247–253  
**Impact:** If the solver crashes or returns an error, the old timetable is permanently gone. No rollback possible.

**BEFORE:**
```python
# Lines ~247-253
_delete_department_timetable_entries(dept_id)
db.session.commit()  # ← COMMITTED HERE — old data gone

# ... solver runs ...
# If solver crashes → timetable lost forever
result = hybrid_scheduler.solve(progress_callback=...)
```

**AFTER:**
```python
# Move the delete INSIDE the try block, AFTER solver succeeds.
# Wrap everything in one transaction.

try:
    result = hybrid_scheduler.solve(progress_callback=...)

    if result.schedule:
        # Only delete AFTER we have a successful result
        _delete_department_timetable_entries(dept_id)
        # Don't commit yet — commit together with inserts
        _save_entries_to_db(result, dept_id)
        db.session.commit()  # Single atomic commit

    return jsonify({...}), 200

except Exception as e:
    db.session.rollback()  # Rollback delete + inserts
    logger.exception("Generation failed")
    return jsonify({"status": "failure", "error": str(e)}), 500
```

---

### C3. Theory course scheduling model mismatch in backtracking solver

**File:** `backend/app/scheduler_new/scheduler_engine.py`  
**Lines:** ~90–103 (`_get_variables` method)  
**Impact:** CSP backtracking tries to find 3 consecutive slots for a 3-hour theory course. All other engines split into individual 1-hour slots. Backtracking solves a much harder problem and will fail more often.

**BEFORE:**
```python
def _get_variables(self):
    variables = []
    for section in self.problem.sections:
        for course_id in section.course_ids:
            course = self.problem.course_map.get(course_id)
            if course:
                # Creates ONE variable with hours_needed = 3
                variables.append(AssignmentVariable(
                    section_id=section.id,
                    course_id=course_id,
                    hours_needed=course.get_hours_needed()  # e.g., 3
                ))
    return variables
```

**AFTER:**
```python
def _get_variables(self):
    variables = []
    for section in self.problem.sections:
        for course_id in section.course_ids:
            course = self.problem.course_map.get(course_id)
            if not course:
                continue

            if course.is_lab():
                # Labs: one block per week
                variables.append(AssignmentVariable(
                    section_id=section.id,
                    course_id=course_id,
                    hours_needed=course.get_hours_needed()
                ))
            else:
                # Theory/Tutorial: split into individual 1-hour slots
                # (matches OR-Tools, Hybrid, Greedy behavior)
                for _ in range(course.get_hours_needed()):
                    variables.append(AssignmentVariable(
                        section_id=section.id,
                        course_id=course_id,
                        hours_needed=1
                    ))
    return variables
```

---

### C4. ConstraintEngine ignores workload_map

**File:** `backend/app/scheduler_new/constraint_engine.py`  
**Lines:** 142–162 (`get_valid_faculty` method)  
**Impact:** Backtracking solver assigns any qualified teacher, ignoring explicit workload allocations. OR-Tools and Hybrid engines check `workload_map` first.

**BEFORE:**
```python
def get_valid_faculty(self, section_id: int, course_id: int, timeslot: Timeslot) -> List[int]:
    course = self.problem.course_map.get(course_id)
    if not course:
        return []
    
    # Check if a faculty is already assigned to this section-course
    sc_key = (section_id, course_id)
    assigned_faculty_id = self.section_course_faculty.get(sc_key)
    if assigned_faculty_id is not None:
        assigned_faculty = self.problem.faculty_map.get(assigned_faculty_id)
        if assigned_faculty:
            slot_key = (timeslot.day, timeslot.start_time)
            if not self.faculty_schedule[assigned_faculty_id][slot_key]:
                if (self.faculty_hours[assigned_faculty_id] < assigned_faculty.max_hours_per_week and
                    self.faculty_daily_hours[assigned_faculty_id][timeslot.day] < assigned_faculty.max_hours_per_day):
                    return [assigned_faculty_id]
        return []
    
    # Falls through to scanning all faculty with qualified_faculty_ids
    # NEVER checks problem.workload_map
```

**AFTER:**
```python
def get_valid_faculty(self, section_id: int, course_id: int, timeslot: Timeslot) -> List[int]:
    course = self.problem.course_map.get(course_id)
    if not course:
        return []
    
    # 1. Check in-memory assignment from this solve session
    sc_key = (section_id, course_id)
    assigned_faculty_id = self.section_course_faculty.get(sc_key)
    
    # 2. Check explicit workload_map from WorkloadAllocation table
    if assigned_faculty_id is None:
        assigned_faculty_id = self.problem.workload_map.get(sc_key)
    
    if assigned_faculty_id is not None:
        assigned_faculty = self.problem.faculty_map.get(assigned_faculty_id)
        if assigned_faculty:
            # Check availability (was missing before)
            if not assigned_faculty.is_available(timeslot):
                return []
            slot_key = (timeslot.day, timeslot.start_time)
            if not self.faculty_schedule[assigned_faculty_id][slot_key]:
                if (self.faculty_hours[assigned_faculty_id] < assigned_faculty.max_hours_per_week and
                    self.faculty_daily_hours[assigned_faculty_id][timeslot.day] < assigned_faculty.max_hours_per_day):
                    return [assigned_faculty_id]
        return []
    
    # 3. Fallback: scan all qualified faculty
    valid = []
    for faculty in self.problem.faculty:
        if faculty.id not in course.qualified_faculty_ids:
            continue
        if not faculty.is_available(timeslot):
            continue
        slot_key = (timeslot.day, timeslot.start_time)
        if self.faculty_schedule[faculty.id][slot_key]:
            continue
        if self.faculty_hours[faculty.id] >= faculty.max_hours_per_week:
            continue
        if self.faculty_daily_hours[faculty.id][timeslot.day] >= faculty.max_hours_per_day:
            continue
        valid.append(faculty.id)
    
    return valid
```

---

### C5. `_save_schedule_entries` has no transaction safety

**File:** `backend/app/scheduler_new/api.py`  
**Lines:** 193–280  
**Impact:** Partial failure during bulk insert leaves dirty DB session state.

**BEFORE:**
```python
def _save_schedule_entries(result, department_id, problem):
    # Delete old entries
    if department_id:
        TimetableEntry.query.filter_by(department_id=department_id).delete()
    else:
        TimetableEntry.query.delete()

    # ... build new entries ...

    db.session.add_all(timetable_entries)
    db.session.commit()  # If this fails, old data already deleted, new data not saved
```

**AFTER:**
```python
def _save_schedule_entries(result, department_id, problem):
    try:
        # Delete old entries
        if department_id:
            entry_ids = [
                (eid,) for eid in db.session.query(TimetableEntry.id)
                .filter_by(department_id=department_id).all()
            ]
        else:
            entry_ids = [(eid,) for eid in db.session.query(TimetableEntry.id).all()]

        if entry_ids:
            db.session.execute(
                entry_sections.delete().where(
                    entry_sections.c.entry_id.in_([e[0] for e in entry_ids])
                )
            )

        if department_id:
            TimetableEntry.query.filter_by(department_id=department_id).delete()
        else:
            TimetableEntry.query.delete()

        # ... build new entries (same as before) ...

        db.session.add_all(timetable_entries)
        db.session.commit()

    except Exception:
        db.session.rollback()
        raise
```

---

### C6. Hardcoded insecure secret keys

**File:** `backend/app/config.py`  
**Lines:** 8–9  
**Impact:** Session hijacking and JWT forgery in production.

**BEFORE:**
```python
class Config:
    SECRET_KEY = os.environ.get('SECRET_KEY', 'change-this-in-production-please-32b')
    JWT_SECRET_KEY = os.environ.get('JWT_SECRET_KEY', 'jwt-change-this-in-production-32b')
```

**AFTER:**
```python
class Config:
    SECRET_KEY = os.environ.get('SECRET_KEY')
    JWT_SECRET_KEY = os.environ.get('JWT_SECRET_KEY')

    @classmethod
    def validate(cls):
        """Call this at app startup to ensure secrets are configured."""
        if not cls.SECRET_KEY or 'change-this' in cls.SECRET_KEY:
            raise RuntimeError(
                "SECRET_KEY environment variable is not set. "
                "Generate one with: python -c \"import secrets; print(secrets.token_hex(32))\""
            )
        if not cls.JWT_SECRET_KEY or 'change-this' in cls.JWT_SECRET_KEY:
            raise RuntimeError(
                "JWT_SECRET_KEY environment variable is not set. "
                "Generate one with: python -c \"import secrets; print(secrets.token_hex(32))\""
            )
```

Then in `backend/app/__init__.py`, add after app creation:
```python
from .config import Config
Config.validate()
```

---

### C7. Auth isLoading hardcoded to false (Frontend)

**File:** `frontend/src/context/AuthContext.tsx`  
**Lines:** ~25–40  
**Impact:** Expired tokens pass the auth guard. User sees dashboard briefly before being kicked on first 401 API call.

**BEFORE:**
```typescript
export function AuthProvider({ children }) {
    const [user, setUser] = useState<User | null>(readStoredUser());
    const [isLoading, setIsLoading] = useState(false);  // ← Always false
    // ...
}
```

**AFTER:**
```typescript
export function AuthProvider({ children }) {
    const [user, setUser] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState(true);  // ← Start as true

    useEffect(() => {
        // Validate stored token on mount
        async function validateToken() {
            try {
                const stored = readStoredUser();
                if (!stored) {
                    setIsLoading(false);
                    return;
                }
                // Call server to verify token is still valid
                const response = await authService.getMe();
                setUser(response.data);
            } catch {
                // Token expired or invalid
                localStorage.removeItem('access_token');
                localStorage.removeItem('refresh_token');
                localStorage.removeItem('user');
                setUser(null);
            } finally {
                setIsLoading(false);
            }
        }
        validateToken();
    }, []);

    // ... rest of context
}
```

---

### C8. Concurrent 401 retry race condition (Frontend)

**File:** `frontend/src/lib/axios.ts`  
**Lines:** 20–57  
**Impact:** Multiple simultaneous 401s each fire their own refresh token call.

**BEFORE:**
```typescript
api.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config;
        if (error.response?.status === 401 && !originalRequest._retry) {
            originalRequest._retry = true;
            const newToken = await authService.refresh();
            // Multiple 401s → multiple refresh calls
        }
    }
);
```

**AFTER:**
```typescript
let refreshPromise: Promise<string> | null = null;

api.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config;

        if (error.response?.status === 401 && !originalRequest._retry) {
            originalRequest._retry = true;

            // If a refresh is already in-flight, wait for it
            if (refreshPromise) {
                try {
                    const token = await refreshPromise;
                    originalRequest.headers.Authorization = `Bearer ${token}`;
                    return api(originalRequest);
                } catch {
                    return Promise.reject(error);
                }
            }

            // Start new refresh
            refreshPromise = authService.refresh()
                .then((newToken) => {
                    return newToken;
                })
                .finally(() => {
                    refreshPromise = null;  // Clear after done
                });

            try {
                const token = await refreshPromise;
                originalRequest.headers.Authorization = `Bearer ${token}`;
                return api(originalRequest);
            } catch {
                refreshPromise = null;
                // Refresh failed — redirect to login
                localStorage.removeItem('access_token');
                localStorage.removeItem('refresh_token');
                window.location.href = '/login';
                return Promise.reject(error);
            }
        }

        return Promise.reject(error);
    }
);
```

---

## Phase 2: High Priority Fixes (Should Fix)

---

### H1. Unfinished global busy-slot logic in `load_faculty`

**File:** `backend/app/scheduler_new/data_loader.py`  
**Lines:** 164–180  
**Impact:** Teachers without explicit availability settings have their cross-department busy slots completely ignored.

**BEFORE:**
```python
busy_in_other_depts = global_busy_map.get(teacher.id)
if busy_in_other_depts:
    if availability is None:
        availability = {}
        # FIXME: never populated — busy slots ignored
```

**AFTER:**
```python
busy_in_other_depts = global_busy_map.get(teacher.id)
if busy_in_other_depts:
    if availability is None:
        # Build availability from ALL configured timeslots
        settings = ScheduleSettings.get_or_create_default()
        availability = {}
        if settings.time_slots and settings.working_days:
            for day in settings.working_days:
                slot_ids = set()
                for slot in settings.time_slots:
                    slot_ids.add(f"{day}_{slot['start']}")
                availability[day] = slot_ids

        # Subtract busy slots from availability
        for day, busy_labels in busy_in_other_depts.items():
            if day not in availability:
                availability[day] = set()
            # Convert label format "09:15-10:05" → slot_id "Monday_09:15"
            for label in busy_labels:
                start = label.split('-')[0] if '-' in label else label
                slot_id = f"{day}_{start}"
                availability[day].discard(slot_id)
```

---

### H2. Dead duplicate return statement

**File:** `backend/app/scheduler_new/data_loader.py`  
**Line:** 322  

**BEFORE:**
```python
        return section_list, workload_map

        return section_list, workload_map  # ← Line 322: unreachable
```

**AFTER:**
```python
        return section_list, workload_map
        # Delete line 322 entirely
```

---

### H3. N+1 query in auto-assign and rebalance

**File:** `backend/app/routes/workload.py`  
**Lines:** 193–213, 240  

**BEFORE:**
```python
for section in sections:
    for course in courses:
        qualified = course.qualified_teachers.all()
        if qualified:
            # N+1: queries DB on every iteration
            teacher = min(qualified, key=lambda t: WorkloadAllocation.query.filter_by(teacher_id=t.id).count())
```

**AFTER:**
```python
@workload_bp.route('/auto-assign-all', methods=['POST'])
@roles_required('admin')
def auto_assign_all_workload():
    sections = Section.query.all()
    success_count = 0

    # Pre-compute teacher workload counts ONCE
    teacher_load = defaultdict(int)
    for alloc in WorkloadAllocation.query.all():
        teacher_load[alloc.teacher_id] += 1

    for section in sections:
        if not section.batch:
            continue
        program_id = section.batch.program_id
        semester = section.batch.current_semester
        courses = Course.query.filter_by(program_id=program_id, semester=semester).all()

        for course in courses:
            existing = WorkloadAllocation.query.filter_by(
                section_id=section.id, course_id=course.id
            ).first()

            if not existing:
                qualified = course.qualified_teachers.all()
                if qualified:
                    # O(1) lookup instead of DB query
                    teacher = min(qualified, key=lambda t: teacher_load[t.id])
                    alloc = WorkloadAllocation(
                        section_id=section.id,
                        course_id=course.id,
                        teacher_id=teacher.id
                    )
                    db.session.add(alloc)
                    teacher_load[teacher.id] += 1  # Update in-memory counter
                    success_count += 1

    db.session.commit()
    return jsonify({"message": f"Successfully created {success_count} auto-assignments"}), 200
```

Apply the same pattern to `rebalance_all_workload`.

---

### H4. O(n) conflict checks in greedy engine

**File:** `backend/app/scheduler_new/greedy_engine.py`  
**Lines:** 24, 204–210, 222–228  

**BEFORE:**
```python
self.used_slots: Set[Tuple[int, int, int]] = set()  # (timeslot_idx, room_id, faculty_id)

# Conflict check — O(n) list comprehension:
if (slot_idx, None, f.id) in [(s, None, fid) for s, r, fid in self.used_slots if fid == f.id]:
    f_conflict = True

if (slot_idx, r.id, None) in [(s, rid, None) for s, rid, _ in self.used_slots if rid == r.id]:
    r_conflict = True
```

**AFTER:**
```python
# Replace single used_slots set with separate tracking dicts:
self.used_slots: Set[Tuple[int, int, int]] = set()
self.faculty_slot_set: Dict[int, Set[int]] = defaultdict(set)  # faculty_id -> set of slot indices
self.room_slot_set: Dict[int, Set[int]] = defaultdict(set)     # room_id -> set of slot indices

# When recording assignment:
for slot_idx in slots_needed:
    self.used_slots.add((slot_idx, r.id, f.id))
    self.section_hours[sec_id].append(slot_idx)
    self.faculty_slot_set[f.id].add(slot_idx)
    self.room_slot_set[r.id].add(slot_idx)

# Conflict check — O(1):
if any(slot_idx in self.faculty_slot_set[f.id] for slot_idx in slots_needed):
    f_conflict = True

if any(slot_idx in self.room_slot_set[r.id] for slot_idx in slots_needed):
    r_conflict = True
```

Also remove the unused `room_daily_hours` tracking (line 27, 238) since it's never read.

---

### H5. `get_valid_rooms` skips `can_be_used_by_program`

**File:** `backend/app/scheduler_new/constraint_engine.py`  
**Lines:** 186–209  

**BEFORE:**
```python
def get_valid_rooms(self, section_id: int, course_id: int, timeslot: Timeslot) -> List[int]:
    # ...
    for room in self.problem.rooms:
        if not room.can_accommodate(section.student_count):
            continue
        if not room.is_suitable_for(course.course_type):
            continue
        if self.room_schedule[room.id][slot_key]:
            continue
        valid.append(room.id)
    return valid
```

**AFTER:**
```python
def get_valid_rooms(self, section_id: int, course_id: int, timeslot: Timeslot) -> List[int]:
    section = self.problem.section_map.get(section_id)
    course = self.problem.course_map.get(course_id)
    if not section or not course:
        return []

    slot_key = (timeslot.day, timeslot.start_time)
    valid = []

    for room in self.problem.rooms:
        if not room.can_accommodate(section.student_count):
            continue
        if not room.is_suitable_for(course.course_type):
            continue
        # ADD: program/department room restriction check
        if not room.can_be_used_by_program(section.program_id, section.department_id):
            continue
        if self.room_schedule[room.id][slot_key]:
            continue
        valid.append(room.id)

    return valid
```

---

### H6. `get_valid_faculty` skips `is_available` for assigned faculty

**File:** `backend/app/scheduler_new/constraint_engine.py`  
**Lines:** 148–162  
**Already fixed in C4 above** — the C4 fix includes the `is_available()` check.

---

### H7. Case-sensitive `"Lab"` check in genetic engine

**File:** `backend/app/scheduler_new/genetic_engine.py`  
**Line:** 56  

**BEFORE:**
```python
if course.course_type == "Lab":
```

**AFTER:**
```python
if course.is_lab():  # Uses the method that handles .strip().lower()
```

---

### H8. `/generate` endpoint passes no `progress_callback`

**File:** `backend/app/scheduler_new/api.py`  
**Line:** 343  

**BEFORE:**
```python
result = scheduler.solve()
```

**AFTER:**
```python
def progress_wrapper(pct, msg):
    emit_progress(department_id or 0, 10 + int(pct * 0.8), msg)

result = scheduler.solve(progress_callback=progress_wrapper)
```

---

### H9. No UniqueConstraint on WorkloadAllocation

**File:** `backend/app/models/workload.py`  
**Line:** 8  

**BEFORE:**
```python
class WorkloadAllocation(db.Model):
    __tablename__ = 'workload_allocations'
    
    id = db.Column(db.Integer, primary_key=True)
    section_id = db.Column(db.Integer, db.ForeignKey('sections.id'), nullable=False)
    course_id = db.Column(db.Integer, db.ForeignKey('course.id'), nullable=False)
    teacher_id = db.Column(db.Integer, db.ForeignKey('teacher.id'), nullable=False)
```

**AFTER:**
```python
class WorkloadAllocation(db.Model):
    __tablename__ = 'workload_allocations'
    __table_args__ = (
        db.UniqueConstraint('section_id', 'course_id', name='_section_course_uc'),
    )
    
    id = db.Column(db.Integer, primary_key=True)
    section_id = db.Column(db.Integer, db.ForeignKey('sections.id'), nullable=False)
    course_id = db.Column(db.Integer, db.ForeignKey('course.id'), nullable=False)
    teacher_id = db.Column(db.Integer, db.ForeignKey('teacher.id'), nullable=False)
    
    # Relationships with cascades
    section = db.relationship('Section', backref=db.backref('workloads', cascade='all, delete-orphan'))
    course = db.relationship('Course', backref=db.backref('workloads', cascade='all, delete-orphan'))
    teacher = db.relationship('Teacher', backref=db.backref('workloads', cascade='all, delete-orphan'))
```

---

### H10. `assign_workload` doesn't validate teacher qualification

**File:** `backend/app/routes/workload.py`  
**Lines:** 62–94  

**BEFORE:**
```python
@workload_bp.route('/assign', methods=['POST'])
@roles_required('admin', 'dept_head')
def assign_workload():
    data = request.get_json()
    # ... field checks ...
    
    if existing:
        existing.teacher_id = data['teacher_id']
    else:
        new_alloc = WorkloadAllocation(...)
        db.session.add(new_alloc)
    
    db.session.commit()
```

**AFTER:**
```python
@workload_bp.route('/assign', methods=['POST'])
@roles_required('admin', 'dept_head')
def assign_workload():
    data = request.get_json()
    if not data:
        return jsonify({"error": "Data required"}), 400
    
    required = ['section_id', 'course_id', 'teacher_id']
    for field_name in required:
        if not data.get(field_name):
            return jsonify({"error": f"Missing field: {field_name}"}), 422

    # Validate teacher exists
    teacher = db.session.get(Teacher, data['teacher_id'])
    if not teacher:
        return jsonify({"error": f"Teacher {data['teacher_id']} not found"}), 404

    # Validate course exists and teacher is qualified (optional but recommended)
    course = db.session.get(Course, data['course_id'])
    if course:
        qualified_ids = [t.id for t in course.qualified_teachers.all()]
        if qualified_ids and data['teacher_id'] not in qualified_ids:
            return jsonify({
                "error": f"Teacher {teacher.name} is not qualified for course {course.code}",
                "warning": "Cross-department assignment — proceed only if intentional"
            }), 422

    existing = WorkloadAllocation.query.filter_by(
        section_id=data['section_id'],
        course_id=data['course_id']
    ).first()

    if existing:
        existing.teacher_id = data['teacher_id']
        message = "Assignment updated"
    else:
        new_alloc = WorkloadAllocation(
            section_id=data['section_id'],
            course_id=data['course_id'],
            teacher_id=data['teacher_id']
        )
        db.session.add(new_alloc)
        message = "Teacher assigned successfully"

    db.session.commit()
    return jsonify({"message": message}), 200
```

---

### H11. `faculty_overload` and `section_overload` not treated as critical

**File:** `backend/app/scheduler_new/api.py`  
**Lines:** 320–322  

**BEFORE:**
```python
critical_warnings = [w for w in feasibility_warnings if w["type"] in ["section_no_courses", "no_lab_rooms"]]
```

**AFTER:**
```python
critical_warnings = [w for w in feasibility_warnings if w["type"] in [
    "section_no_courses",
    "no_lab_rooms",
    "faculty_overload",
    "section_overload",
]]
```

---

### H12. Lab room availability recomputed for every class in OR-Tools

**File:** `backend/app/scheduler_new/ortools_engine.py`  
**Lines:** 102–110  

**BEFORE:**
```python
for c_idx, (sec_id, crs_id, hrs) in enumerate(classes):
    # ... inside the loop:
    lab_rooms_available = any(
        r.is_suitable_for("Lab") and r.can_accommodate(section.student_count)
        for r in self.problem.rooms
    )
    moot_rooms_available = any(
        r.is_suitable_for("Moot Court") and r.can_accommodate(section.student_count)
        for r in self.problem.rooms
    )
```

**AFTER:**
```python
# Move BEFORE the class loop — compute once per student_count bucket
lab_capacity_map = {}  # student_count -> bool
moot_capacity_map = {}

for section in self.problem.sections:
    sc = section.student_count
    if sc not in lab_capacity_map:
        lab_capacity_map[sc] = any(
            r.is_suitable_for("Lab") and r.can_accommodate(sc)
            for r in self.problem.rooms
        )
        moot_capacity_map[sc] = any(
            r.is_suitable_for("Moot Court") and r.can_accommodate(sc)
            for r in self.problem.rooms
        )

for c_idx, (sec_id, crs_id, hrs) in enumerate(classes):
    section = self.problem.section_map[sec_id]
    sc = section.student_count
    lab_rooms_available = lab_capacity_map.get(sc, False)
    moot_rooms_available = moot_capacity_map.get(sc, False)
```

---

### H13. O(n) linear search in OR-Tools for faculty/room lookup

**File:** `backend/app/scheduler_new/ortools_engine.py`  
**Lines:** 209–211  

**BEFORE:**
```python
for t_idx, r_id, f_id in all_combinations:
    f = next(fac for fac in possible_f if fac.id == f_id)
    r = next(room for room in possible_r if room.id == r_id)
```

**AFTER:**
```python
# Build lookup dicts once before the combinations loop
possible_f_dict = {f.id: f for f in possible_f}
possible_r_dict = {r.id: r for r in possible_r}

for t_idx, r_id, f_id in all_combinations:
    f = possible_f_dict[f_id]
    r = possible_r_dict[r_id]
```

---

### H14. Missing cascade on WorkloadAllocation relationships

**Already fixed in H9 above** — the H9 fix adds `cascade='all, delete-orphan'` to `course` and `teacher`.

---

### H15. Duplicate type declarations in curriculum.service.ts

**File:** `frontend/src/services/curriculum.service.ts`  
**Lines:** 3–48  

**BEFORE:**
```typescript
// curriculum.service.ts defines its own Program, Course, Batch interfaces
interface Program { id: number; name: string; code: string; /* ... */ }
interface Course { id: number; name: string; code: string; credits: number; /* ... */ }
```

**AFTER:**
```typescript
// Delete ALL local interface definitions from curriculum.service.ts.
// Import from the canonical types file:
import type { Program, Course, Batch } from '@/types';

// If any fields are missing from types/index.ts, add them there:
// e.g., add credits field to Course interface
```

---

### H16. Hardcoded "582 current assignments" in WorkloadPage

**File:** `frontend/src/pages/WorkloadPage.tsx`  
**Line:** 194  

**BEFORE:**
```typescript
title="RESET & OPTIMIZE: This will clear all 582 current assignments..."
```

**AFTER:**
```typescript
title="RESET & OPTIMIZE: This will DELETE ALL current assignments (including those from Bulk Import!) and recreate them evenly across all faculty to solve teacher-overload issues. Is this what you want?"
```

---

### H17. Recursive `onClose` call in BulkImportModal

**File:** `frontend/src/components/common/BulkImportModal.tsx`  
**Line:** 66  

**BEFORE:**
```typescript
<Modal
    isOpen={isOpen}
    onClose={() => !importing && onClose()}  // ← calls itself
>
```

**AFTER:**
```typescript
const handleClose = useCallback(() => {
    if (!importing) onClose();
}, [importing, onClose]);

return (
    <Modal isOpen={isOpen} onClose={handleClose}>
        {/* ... */}
    </Modal>
);
```

---

### H18. Missing `batchForm.register('code')` in BatchesPage

**File:** `frontend/src/pages/BatchesPage.tsx`  
**Line:** ~400  

**BEFORE:**
```typescript
<input
    className="input"
    placeholder="e.g., 2024-28"
    // Missing {...batchForm.register('code')}
/>
```

**AFTER:**
```typescript
<input
    className="input"
    placeholder="e.g., 2024-28"
    {...batchForm.register('code')}
/>
```

---

### H19. No code-splitting — all pages eagerly loaded

**File:** `frontend/src/App.tsx`  
**Lines:** 10–22  

**BEFORE:**
```typescript
import DashboardPage from '@/pages/DashboardPage';
import DepartmentsPage from '@/pages/DepartmentsPage';
import ProgramsPage from '@/pages/ProgramsPage';
// ... all 12+ pages imported eagerly
```

**AFTER:**
```typescript
import { lazy, Suspense } from 'react';
import { PageLoader } from '@/components/ui/Loading';

const DashboardPage = lazy(() => import('@/pages/DashboardPage'));
const DepartmentsPage = lazy(() => import('@/pages/DepartmentsPage'));
const ProgramsPage = lazy(() => import('@/pages/ProgramsPage'));
const BatchesPage = lazy(() => import('@/pages/BatchesPage'));
const CoursesPage = lazy(() => import('@/pages/CoursesPage'));
const TeachersPage = lazy(() => import('@/pages/TeachersPage'));
const RoomsPage = lazy(() => import('@/pages/RoomsPage'));
const SectionsPage = lazy(() => import('@/pages/SectionsPage'));
const SettingsPage = lazy(() => import('@/pages/SettingsPage'));
const TimetablePage = lazy(() => import('@/pages/TimetablePage'));
const WorkloadPage = lazy(() => import('@/pages/WorkloadPage'));

// Wrap routes in Suspense:
<Routes>
    <Route path="/" element={<ProtectedRoute><Suspense fallback={<PageLoader />}><DashboardPage /></Suspense></ProtectedRoute>} />
    {/* ... other routes ... */}
</Routes>
```

---

### H20. Array index as `<tr key>` in DataTable

**File:** `frontend/src/components/common/DataTable.tsx`  
**Line:** 104  

**BEFORE:**
```typescript
{data.map((row, i) => (
    <tr key={i}>  // ← array index
```

**AFTER:**
```typescript
// Add rowKey prop with default:
interface DataTableProps<T extends object> {
    // ... existing props
    rowKey?: keyof T;
}

// In component:
const rowKey = props.rowKey || 'id';

{data.map((row) => (
    <tr key={String(row[rowKey])}>
```

---

## Phase 3: Medium Fixes (Fix When Possible)

---

### M1. `max_hours_per_day` fallback swallows zero values

**File:** `backend/app/scheduler_new/data_loader.py`  
**Lines:** 191–192  

**BEFORE:**
```python
max_hours_per_day=getattr(teacher, 'max_hours_per_day', 6) or 6,
max_hours_per_week=getattr(teacher, 'max_hours_per_week', 30) or 30,
```

**AFTER:**
```python
max_hours_per_day=getattr(teacher, 'max_hours_per_day', None) or 6,
max_hours_per_week=getattr(teacher, 'max_hours_per_week', None) or 30,
```

---

### M2. No input validation on `department_id` type

**File:** `backend/app/scheduler_new/api.py`  
**Line:** 299  

**BEFORE:**
```python
department_id = data.get('department_id')
```

**AFTER:**
```python
department_id = data.get('department_id')
if department_id is not None and not isinstance(department_id, int):
    return jsonify({"status": "failure", "error": "department_id must be an integer or null"}), 400
```

---

### M3. No clamping on `time_limit_seconds`

**File:** `backend/app/scheduler_new/api.py`  
**Line:** 301  

**BEFORE:**
```python
time_limit = data.get('time_limit_seconds', 60.0)
```

**AFTER:**
```python
time_limit = data.get('time_limit_seconds', 60.0)
try:
    time_limit = float(time_limit)
    time_limit = max(10, min(time_limit, 600))  # Clamp to 10s–10min
except (TypeError, ValueError):
    time_limit = 60.0
```

---

### M4. `print()` statements in production route handlers

**File:** `backend/app/routes/scheduling.py`  
**Lines:** 242, 290  

**BEFORE:**
```python
print(f"DEBUG: Generating timetable...")
print(f"ERROR: Hybrid scheduler failed...")
```

**AFTER:**
```python
logger.info("Generating timetable...")
logger.error("Hybrid scheduler failed...")
```

---

### M5. Deprecated `datetime.utcnow()`

**File:** `backend/app/routes/scheduling.py`  
**Line:** 207  

**BEFORE:**
```python
from datetime import datetime
now = datetime.utcnow()
```

**AFTER:**
```python
from datetime import datetime, timezone
now = datetime.now(timezone.utc)
```

---

### M6. `logging.basicConfig()` in genetic engine constructor

**File:** `backend/app/scheduler_new/genetic_engine.py`  
**Line:** 38  

**BEFORE:**
```python
if self.debug:
    logging.basicConfig(level=logging.DEBUG)
```

**AFTER:**
```python
if self.debug:
    self.logger.setLevel(logging.DEBUG)
```

---

### M7. Imports in middle of file

**File:** `backend/app/routes/workload.py`  
**Lines:** 115–117  

**BEFORE:**
```python
    return jsonify({"message": "No assignment found to remove"}), 200
import pandas as pd
from io import BytesIO
from ..models import Batch
```

**AFTER:** Move these imports to the top of the file with the other imports.

---

### M8. Lowercase `any` instead of `typing.Any`

**File:** `backend/app/scheduler_new/scheduler_engine.py`  
**Line:** 47  

**BEFORE:**
```python
Dict[str, any]
```

**AFTER:**
```python
Dict[str, Any]
```

---

### M9. Hardcoded DAYS/TIMESLOTS ignore ScheduleSettings

**File:** `backend/app/routes/scheduling.py`  
**Lines:** 12–13, 176–182  

**BEFORE:**
```python
DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
TIMESLOTS = ['09:00-10:00', '10:00-11:00', ...]
```

**AFTER:**
```python
def _get_configured_days_and_slots():
    settings = ScheduleSettings.get_or_create_default()
    days = settings.working_days if settings.working_days else ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
    slots = []
    if settings.time_slots:
        slots = [f"{s['start']}-{s['end']}" for s in settings.time_slots]
    else:
        slots = ['09:00-10:00', '10:00-11:00', '11:00-12:00', '12:00-13:00',
                 '13:00-14:00', '14:00-15:00', '15:00-16:00']
    return days, slots
```

---

### M10. Duplicated greedy/local-search logic in hybrid engine

**File:** `backend/app/scheduler_new/hybrid_engine.py`  
**Lines:** 265–351 vs 353–463  

Extract a shared method:

```python
def _try_schedule_class(self, state, class_info, valid_starts, timeslot_list):
    """Shared scheduling logic used by both greedy and local-search passes."""
    _, section_id, course_id, hours = class_info
    course = self.problem.course_map[course_id]
    section = self.problem.section_map[section_id]
    is_lab = self._is_lab_course(course)
    program_code = section.program_code or "__unknown_program__"
    sc_key = (section_id, course_id)

    possible_faculty = self._get_faculty_candidates(section, course)
    possible_rooms = self._get_room_candidates(section, course)

    locked_fid = state["section_course_faculty"].get(sc_key)
    if locked_fid is not None:
        possible_faculty = [f for f in possible_faculty if f.id == locked_fid]

    for start_idx in valid_starts.get(hours, []):
        # ... shared logic ...
        return True, ScheduleEntry(...)
    return False, None
```

---

### M11. Unused imports and dead code

**Files & lines:**
- `genetic_engine.py:6` — Remove `import copy`
- `greedy_engine.py:27` — Remove `self.room_daily_hours` tracking
- `config.py:31` — Remove `WTF_CSRF_ENABLED = False`
- `run.py:9` — Change `debug=True` to `debug=app.debug`
- `DashboardPage.tsx:12` — Remove unused `PieChart`, `Legend` imports
- `package.json` — Remove `@dnd-kit/sortable` and `date-fns`

---

### M12. Light mode border invisible

**File:** `frontend/src/index.css`  
**Line:** 62  

**BEFORE:**
```css
:root {
    --border: rgba(255, 255, 255, 0.3);
}
```

**AFTER:**
```css
:root {
    --border: rgba(0, 0, 0, 0.1);
}
```

---

### M13. Empty catch block in DashboardPage

**File:** `frontend/src/pages/DashboardPage.tsx`  
**Lines:** 95–97  

**BEFORE:**
```typescript
} catch {
    // empty
}
```

**AFTER:**
```typescript
} catch (error) {
    setError("Failed to load dashboard statistics. Please try again.");
    console.error("Dashboard stats error:", error);
}
```

---

### M14. CSV export doesn't escape commas

**File:** `frontend/src/pages/TimetablePage.tsx`  
**Lines:** 772–796  

**BEFORE:**
```typescript
const row = [section, course, faculty, room, day, slot].join(',');
```

**AFTER:**
```typescript
function csvEscape(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
        return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
}

const row = [section, course, faculty, room, day, slot].map(csvEscape).join(',');
```

---

### M15. Socket.IO connected on every TimetablePage mount

**File:** `frontend/src/pages/TimetablePage.tsx`  
**Lines:** 710–722  

**BEFORE:**
```typescript
useEffect(() => {
    const socket = io('/', { query: { XTransformPort: PORT } });
    // connected immediately on mount
}, []);
```

**AFTER:**
```typescript
// Move socket connection into handleGenerate function:
const handleGenerate = async () => {
    const socket = io('/', { query: { XTransformPort: PORT } });
    try {
        socket.on('generation_progress', (data) => { /* ... */ });
        await schedulingService.generateTimetable({ department_id, engine });
    } finally {
        socket.disconnect();
    }
};
```

---

### M16. Dead code: curriculum.service.ts and auth.service.ts methods

- Delete `frontend/src/services/curriculum.service.ts` entirely (never imported)
- Remove `listUsers`, `updateUserRole`, `deactivateUser` from `auth.service.ts`

---

## Phase 4: Low Priority Fixes (Nice to Have)

---

### L1. Missing page titles in AppLayout

**File:** `frontend/src/components/layout/AppLayout.tsx`  
**Lines:** 5–15  

**Add:**
```typescript
'/sections': 'Sections',
'/workload': 'Workload Allocation',
```

---

### L2. No 404 page

**File:** `frontend/src/App.tsx`  
**Line:** 55  

**BEFORE:**
```typescript
<Route path="*" element={<Navigate to="/" replace />} />
```

**AFTER:**
```typescript
<Route path="*" element={
    <div style={{ textAlign: 'center', padding: '5rem' }}>
        <h1 style={{ fontSize: '4rem' }}>404</h1>
        <p>Page not found</p>
        <a href="/" style={{ color: 'var(--primary)' }}>Go to Dashboard</a>
    </div>
} />
```

---

### L3. Double CORS configuration

**File:** `backend/app/__init__.py`  
**Lines:** 29–31  

Remove one of the two CORS configurations (SocketIO `cors_allowed_origins` OR Flask-CORS). Keep only one consistent mechanism.

---

### L4. Inconsistent HTTP status codes

**File:** `backend/app/scheduler_new/api.py`  

Standardize all validation failures to `422`:
- Line 40: Change `400` → `422` for missing resources
- Keep `422` for pre-scheduling validation (already correct at lines 329, 392, 454)

---

### L5. `get_scheduler_stats` loads entire DB

**File:** `backend/app/scheduler_new/api.py`  
**Line:** 525  

**BEFORE:**
```python
data_loader = DataLoader()
```

**AFTER:**
```python
@scheduler_bp.route('/scheduler-stats', methods=['GET'])
@jwt_required()
def get_scheduler_stats():
    data = request.args  # Accept query params
    department_id = data.get('department_id', type=int)
    data_loader = DataLoader(department_id=department_id)
    # ...
```

---

### L6. `tsconfig.app.json` — enable strict unused checks

**File:** `frontend/tsconfig.app.json`  
**Lines:** 16–17  

**BEFORE:**
```json
"noUnusedLocals": false,
"noUnusedParameters": false,
```

**AFTER:**
```json
"noUnusedLocals": true,
"noUnusedParameters": true,
```

> Do this AFTER cleaning up existing unused variables/imports.

---

### L7. Modal accessibility

**File:** `frontend/src/components/ui/Modal.tsx`  

- Add `aria-modal="true"` and `role="dialog"`
- Add `onKeyDown` for Escape key
- Add `document.body.style.overflow = 'hidden'` on open, restore on close
- Consider using `@radix-ui/react-dialog` (already in dependencies)

---

### L8. DataTable search debounce

**File:** `frontend/src/components/common/DataTable.tsx`  
**Line:** 49  

```typescript
// Add debounce to search input
const [debouncedSearch, setDebouncedSearch] = useState(search);

useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
}, [search]);

// Use debouncedSearch in filtering logic
```

---

### L9. `useTable` paginated memoization

**File:** `frontend/src/hooks/useTable.ts`  
**Line:** 38  

```typescript
const paginated = useMemo(() => sorted.slice(
    (pagination.page - 1) * pagination.perPage,
    pagination.page * pagination.perPage
), [sorted, pagination.page, pagination.perPage]);

const totalPages = useMemo(() => Math.ceil(sorted.length / pagination.perPage), [sorted, pagination.perPage]);
```

---

### L10. Native `confirm()` → Custom ConfirmModal

Replace all `window.confirm()` calls in `WorkloadPage.tsx` and `TimetablePage.tsx` with a reusable `ConfirmModal` component that matches the app's visual design.

---

### L11. Missing Sidebar nav items

**File:** `frontend/src/components/layout/Sidebar.tsx`  

Add entries for `/sections` (Sections) and `/workload` (Workload) if those are standalone routes users should navigate to.

---

### L12. Export raw contexts as file-internal

**Files:** `frontend/src/context/auth-context.ts`, `theme-context.ts`, `toast-context.ts`  

**BEFORE:**
```typescript
export const AuthContext = createContext(...)
```

**AFTER:**
```typescript
// Don't export the raw context — only export the hook
const AuthContext = createContext(...)
export { AuthContext } from './AuthContext'  // named export from the .tsx file
// Or simply: only use the useAuth() hook from useAuth.ts
```

---

## Quick Reference: Fix Priority Matrix

| Priority | Count | Time Estimate | Risk If Unfixed |
|----------|-------|---------------|-----------------|
| 🔴 Critical | 8 | ~4 hours | Data loss, broken solver, security |
| 🟠 High | 12 | ~6 hours | Wrong schedules, N+1 queries, missing validation |
| 🟡 Medium | 16 | ~8 hours | Performance, dead code, UX polish |
| 🔵 Low | 12 | ~4 hours | Code quality, accessibility, consistency |
| **Total** | **48 unique fixes** | **~22 hours** | |

> Note: Some issues in Phase 1 (H6, H14) are already resolved by other fixes (C4, H9). Total unique fixes: 48.

---

## Verification Checklist

After applying all fixes, verify with these tests:

- [ ] **C1**: Import `scheduler_engine.py` without errors; `AssignmentVariable(1,2,3)` works
- [ ] **C2**: Kill solver mid-run; verify old timetable is still in DB
- [ ] **C3**: Run backtracking solver on a section with 3-hour theory course; verify it schedules 3 separate 1-hour slots
- [ ] **C4**: Create a `WorkloadAllocation` with Teacher A; run CSP solver; verify Teacher A is assigned (not Teacher B)
- [ ] **C5**: Simulate DB error during `_save_schedule_entries`; verify rollback
- [ ] **C6**: Start app without `SECRET_KEY` env var; verify it raises RuntimeError
- [ ] **C7**: Login, close browser, reopen with expired token; verify redirect to login (no dashboard flash)
- [ ] **C8**: Open two tabs simultaneously after token expiry; verify only ONE refresh call is made
- [ ] **H1**: Create timetable for Dept A, then Dept B with same teacher; verify no cross-dept double-booking
- [ ] **H3**: Run `auto-assign-all` with 100+ sections; verify it completes in <5 seconds (not 60+)
- [ ] **H9**: Try bulk-importing duplicate `(section_id, course_id)` rows; verify DB constraint error
