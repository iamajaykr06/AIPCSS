# API Reference

This document describes all RESTful API endpoints exposed by the AIPCSS backend.

## Base URL

```
Development: http://localhost:5000/api
Production:  https://your-domain.com/api
```

## Authentication

All protected endpoints require a JWT token in the `Authorization` header:

```
Authorization: Bearer <your-jwt-token>
```

### POST `/api/auth/register`

Register a new user account.

**Request Body:**
```json
{
  "username": "john_doe",
  "email": "john@example.com",
  "password": "securepassword123"
}
```

**Response (201):**
```json
{
  "message": "User registered successfully",
  "user": {
    "id": 1,
    "username": "john_doe",
    "email": "john@example.com"
  }
}
```

### POST `/api/auth/login`

Authenticate and receive a JWT token.

**Request Body:**
```json
{
  "username": "john_doe",
  "password": "securepassword123"
}
```

**Response (200):**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": 1,
    "username": "john_doe",
    "email": "john@example.com"
  }
}
```

## Resource Endpoints

All resource endpoints follow standard CRUD patterns:

| Method   | Endpoint              | Description          | Auth Required |
|----------|-----------------------|----------------------|---------------|
| GET      | `/api/departments`    | List all departments | Yes           |
| POST     | `/api/departments`    | Create department    | Yes           |
| GET      | `/api/departments/:id`| Get department       | Yes           |
| PUT      | `/api/departments/:id`| Update department    | Yes           |
| DELETE   | `/api/departments/:id`| Delete department    | Yes           |

The same CRUD pattern applies to: `programs`, `batches`, `sections`, `courses`, `teachers`, `rooms`.

## Scheduling

### POST `/api/scheduling/generate`

Generate a timetable using the specified algorithm.

**Request Body:**
```json
{
  "algorithm": "ortools",
  "semester": "2024-odd",
  "batch_ids": [1, 2, 3],
  "settings": {
    "working_days": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
    "periods_per_day": 8,
    "start_time": "09:00",
    "end_time": "17:00"
  }
}
```

**Algorithm Options:** `ortools`, `genetic`, `greedy`, `hybrid`

**Response (200):**
```json
{
  "message": "Timetable generated successfully",
  "algorithm": "ortools",
  "stats": {
    "total_slots": 150,
    "assigned_slots": 145,
    "conflicts": 0,
    "generation_time": "2.3s"
  },
  "timetable": [...]
}
```

### GET `/api/scheduling/timetable`

Retrieve the current timetable.

**Query Parameters:**
- `batch_id` — Filter by batch
- `section_id` — Filter by section
- `teacher_id` — Filter by teacher
- `day` — Filter by day of week

## Workload

### GET `/api/workload/analysis`

Get teacher workload analysis.

**Query Parameters:**
- `department_id` — Filter by department (optional)

**Response (200):**
```json
{
  "teachers": [
    {
      "id": 1,
      "name": "Dr. Smith",
      "department": "Computer Science",
      "assigned_hours": 18,
      "max_hours": 20,
      "courses": ["Data Structures", "Algorithms"],
      "utilization_percent": 90
    }
  ],
  "summary": {
    "total_teachers": 15,
    "avg_utilization": 78,
    "overloaded": 2,
    "underloaded": 3
  }
}
```

## PDF Export

### GET `/api/pdf-export/timetable`

Export the timetable as a PDF file.

**Query Parameters:**
- `batch_id` — Batch to export
- `section_id` — Section to export (optional)
- `format` — `a4` or `letter` (default: `a4`)

**Response:** PDF file download

## Settings

### GET `/api/settings`

Get current application settings.

### PUT `/api/settings`

Update application settings.

**Request Body:**
```json
{
  "institution_name": "Jharkhand Rai University",
  "working_days": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
  "periods_per_day": 8,
  "period_duration": 50,
  "break_after_periods": 4
}
```

## Error Responses

All errors follow this format:

```json
{
  "error": "Error description",
  "status_code": 400
}
```

| Status Code | Description              |
|-------------|--------------------------|
| 400         | Bad Request              |
| 401         | Unauthorized             |
| 403         | Forbidden                |
| 404         | Not Found                |
| 409         | Conflict                 |
| 422         | Validation Error         |
| 500         | Internal Server Error    |
