# Database Schema

AIPCSS uses SQLAlchemy ORM with SQLite (development) or PostgreSQL (production). This document describes the database schema.

## Entity Relationship Diagram

```
Department ──1:N──> Program ──1:N──> Batch ──1:N──> Section
                                                         │
                                    Course ──N:M──────────┤
                                       │                 │
                                    Teacher ─────────────┤
                                       │                 │
                                    Room ────────────────┤
                                                         │
                                    Timetable <───────────┘
                                    (course, section, teacher, room, day, period)
```

## Tables

### users

Stores user accounts for authentication.

| Column      | Type         | Constraints          | Description            |
|-------------|--------------|----------------------|------------------------|
| id          | Integer      | PK, Auto-increment   | Unique identifier      |
| username    | String(80)   | Unique, Not Null     | Login username         |
| email       | String(120)  | Unique, Not Null     | Email address          |
| password    | String(256)  | Not Null             | Hashed password        |
| role        | String(20)   | Default: "user"      | User role              |
| created_at  | DateTime     | Default: now()       | Account creation time  |

### departments

| Column      | Type         | Constraints          | Description            |
|-------------|--------------|----------------------|------------------------|
| id          | Integer      | PK, Auto-increment   | Unique identifier      |
| name        | String(100)  | Not Null             | Department name        |
| code        | String(20)   | Unique, Not Null     | Department code (e.g., CSE) |
| head        | String(100)  |                      | Department head name   |
| created_at  | DateTime     | Default: now()       | Creation timestamp     |

### programs

| Column          | Type         | Constraints          | Description            |
|-----------------|--------------|----------------------|------------------------|
| id              | Integer      | PK, Auto-increment   | Unique identifier      |
| name            | String(100)  | Not Null             | Program name (e.g., B.Tech CSE) |
| code            | String(20)   | Unique, Not Null     | Program code           |
| duration        | Integer      | Default: 4           | Duration in years      |
| department_id   | Integer      | FK → departments.id  | Parent department      |
| created_at      | DateTime     | Default: now()       | Creation timestamp     |

### batches

| Column          | Type         | Constraints          | Description            |
|-----------------|--------------|----------------------|------------------------|
| id              | Integer      | PK, Auto-increment   | Unique identifier      |
| name            | String(50)   | Not Null             | Batch name (e.g., 2024) |
| year            | Integer      | Not Null             | Academic year          |
| program_id      | Integer      | FK → programs.id     | Parent program         |
| created_at      | DateTime     | Default: now()       | Creation timestamp     |

### sections

| Column          | Type         | Constraints          | Description            |
|-----------------|--------------|----------------------|------------------------|
| id              | Integer      | PK, Auto-increment   | Unique identifier      |
| name            | String(20)   | Not Null             | Section name (e.g., A, B) |
| strength        | Integer      | Default: 0           | Number of students     |
| batch_id        | Integer      | FK → batches.id      | Parent batch           |
| created_at      | DateTime     | Default: now()       | Creation timestamp     |

### courses

| Column          | Type          | Constraints          | Description            |
|-----------------|---------------|----------------------|------------------------|
| id              | Integer       | PK, Auto-increment   | Unique identifier      |
| code            | String(20)    | Unique, Not Null     | Course code (e.g., CS101) |
| name            | String(100)   | Not Null             | Course name            |
| credits         | Integer       | Default: 3           | Credit hours           |
| type            | String(20)    | Default: "theory"    | Course type            |
| department_id   | Integer       | FK → departments.id  | Offering department    |
| created_at      | DateTime      | Default: now()       | Creation timestamp     |

### teachers

| Column          | Type          | Constraints          | Description            |
|-----------------|---------------|----------------------|------------------------|
| id              | Integer       | PK, Auto-increment   | Unique identifier      |
| name            | String(100)   | Not Null             | Teacher name           |
| employee_id     | String(30)    | Unique               | Employee ID            |
| department_id   | Integer       | FK → departments.id  | Department             |
| max_hours       | Integer       | Default: 20          | Max teaching hours/week|
| available_days  | JSON          |                      | Available days         |
| available_slots | JSON          |                      | Available time slots   |
| created_at      | DateTime      | Default: now()       | Creation timestamp     |

### rooms

| Column          | Type          | Constraints          | Description            |
|-----------------|---------------|----------------------|------------------------|
| id              | Integer       | PK, Auto-increment   | Unique identifier      |
| name            | String(50)    | Not Null             | Room name/number       |
| building        | String(50)    |                      | Building name          |
| capacity        | Integer       | Default: 40          | Seating capacity       |
| room_type       | String(20)    | Default: "classroom" | Room type              |
| facilities      | JSON          |                      | Available facilities   |
| created_at      | DateTime      | Default: now()       | Creation timestamp     |

### timetables

| Column          | Type          | Constraints          | Description            |
|-----------------|---------------|----------------------|------------------------|
| id              | Integer       | PK, Auto-increment   | Unique identifier      |
| course_id       | Integer       | FK → courses.id      | Course                 |
| section_id      | Integer       | FK → sections.id     | Section                |
| teacher_id      | Integer       | FK → teachers.id     | Assigned teacher       |
| room_id         | Integer       | FK → rooms.id        | Assigned room          |
| day             | String(20)    | Not Null             | Day of week            |
| period          | Integer       | Not Null             | Period number          |
| batch_id        | Integer       | FK → batches.id      | Batch                  |
| semester        | String(20)    |                      | Semester identifier    |
| created_at      | DateTime      | Default: now()       | Creation timestamp     |

### schedule_settings

| Column          | Type          | Constraints          | Description            |
|-----------------|---------------|----------------------|------------------------|
| id              | Integer       | PK, Auto-increment   | Unique identifier      |
| key             | String(100)   | Unique, Not Null     | Setting key            |
| value           | String(500)   |                      | Setting value          |
| updated_at      | DateTime      | Default: now()       | Last updated           |

### workloads

| Column          | Type          | Constraints          | Description            |
|-----------------|---------------|----------------------|------------------------|
| id              | Integer       | PK, Auto-increment   | Unique identifier      |
| teacher_id      | Integer       | FK → teachers.id     | Teacher                |
| assigned_hours  | Integer       | Default: 0           | Current assigned hours |
| courses         | JSON          |                      | List of assigned courses|
| semester        | String(20)    |                      | Semester identifier    |
| updated_at      | DateTime      | Default: now()       | Last updated           |

## Indexes

The following indexes are recommended for performance:
- `teachers.department_id` — Frequent joins with departments
- `timetables.section_id` + `timetables.day` — Timetable queries
- `timetables.teacher_id` + `timetables.day` — Teacher schedule lookups
- `timetables.room_id` + `timetables.day` — Room availability checks
