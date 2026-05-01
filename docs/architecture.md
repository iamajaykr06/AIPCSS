# Architecture Overview

AIPCSS follows a modern **full-stack architecture** with a clear separation between frontend and backend, communicating via RESTful APIs.

## System Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Frontend                         │
│  React 18 + TypeScript + Vite + Tailwind CSS       │
│  ┌──────────┐ ┌──────────┐ ┌───────────────────┐   │
│  │  Pages   │ │Components│ │  Services (API)   │   │
│  └──────────┘ └──────────┘ └────────┬──────────┘   │
│                                      │              │
└──────────────────────────────────────┼──────────────┘
                                       │ HTTP/REST
┌──────────────────────────────────────┼──────────────┐
│                    Backend          │              │
│  Flask 3 + Python 3.10+             │              │
│  ┌──────────┐ ┌──────────┐ ┌────────┴──────────┐   │
│  │  Routes  │ │  Models  │ │ Scheduler Engines │   │
│  │ (API)    │ │ (SQLAlch)│ │ (OR-Tools/Genetic)│   │
│  └──────────┘ └────┬─────┘ └───────────────────┘   │
│                     │                              │
│  ┌──────────────────┴──────────┐                   │
│  │      SQLite / PostgreSQL    │                   │
│  └─────────────────────────────┘                   │
└─────────────────────────────────────────────────────┘
```

## Backend Architecture

### Flask Application Factory
The backend uses the **application factory pattern** (`app/__init__.py`) to create and configure the Flask app. This enables:
- Easy testing with different configurations
- Multiple app instances with different settings
- Clean separation of configuration from app creation

### Models Layer (`app/models/`)
SQLAlchemy ORM models define the database schema:
- **User** — Authentication and user management
- **Department** — Academic departments
- **Program** — Degree programs (B.Tech, MCA, etc.)
- **Batch** — Student batches by year
- **Section** — Divisions within a batch
- **Course** — Individual courses with metadata
- **Teacher** — Faculty with availability and preferences
- **Room** — Classrooms with capacity and facilities
- **Timetable** — Generated schedule entries
- **ScheduleSettings** — Configuration for schedule generation
- **Workload** — Teacher workload records

### Routes Layer (`app/routes/`)
RESTful API endpoints organized by resource:
- Authentication (login, register, token validation)
- Resource CRUD (departments, programs, batches, sections, courses, teachers, rooms)
- Curriculum management (course-section assignments)
- Scheduling (timetable generation triggers)
- Workload analytics
- Settings management
- PDF export

### Scheduler Engines (`app/scheduler_new/`)
The scheduling module implements a pluggable engine architecture:

| Engine           | File                  | Description                              |
|------------------|-----------------------|------------------------------------------|
| Data Loader      | `data_loader.py`      | Fetches data from DB into scheduler models|
| Constraint Engine| `constraint_engine.py`| Validates and manages scheduling constraints|
| OR-Tools Engine  | `ortools_engine.py`   | Google CP-SAT constraint solver           |
| Genetic Engine   | `genetic_engine.py`   | Evolutionary algorithm approach            |
| Greedy Engine    | `greedy_engine.py`    | Fast heuristic scheduling                 |
| Hybrid Engine    | `hybrid_engine.py`    | Combines genetic + greedy strategies      |
| Scheduler API    | `api.py`              | Unified interface for all engines         |
| Engine Selector  | `scheduler_engine.py` | Selects appropriate engine based on config|

## Frontend Architecture

### Component Structure
```
src/
├── pages/           # Route-level page components
│   ├── auth/        # Login & Register pages
│   ├── DashboardPage.tsx
│   ├── TeachersPage.tsx
│   ├── RoomsPage.tsx
│   └── ...
├── components/
│   ├── layout/      # AppLayout, Navbar, ProtectedRoute
│   ├── ui/          # Reusable UI (Modal, Loading, Select, etc.)
│   └── common/      # Shared components (DataTable, BulkImportModal)
├── services/        # API service layer (axios-based)
├── context/         # React contexts (Auth, Theme, Toast)
├── hooks/           # Custom React hooks
├── types/           # TypeScript type definitions
└── lib/             # Utilities (axios config, helpers)
```

### State Management
- **React Context** for global state (auth, theme, toast notifications)
- **Local state** (useState/useReducer) for component-level state
- **Server state** managed through API service calls with loading/error states

### Routing
React Router v6 with protected routes:
- `/login`, `/register` — Public auth pages
- `/dashboard` — Main dashboard (protected)
- `/teachers`, `/rooms`, `/courses`, etc. — Resource management pages (protected)
- `/timetable` — Schedule generation and viewing (protected)

## Data Flow

1. User interacts with React components
2. Components call service functions (e.g., `schedulingService.generate()`)
3. Services make HTTP requests via axios to Flask API endpoints
4. Flask routes process requests through business logic
5. Data is read/written via SQLAlchemy models to the database
6. Scheduler engines process data and return optimized timetables
7. Response is sent back as JSON to the frontend
8. React components update state and re-render the UI

## Authentication Flow

1. User submits credentials via login form
2. Backend validates against database and returns JWT token
3. Frontend stores token in localStorage
4. Axios interceptor attaches token to all subsequent requests
5. Protected routes check authentication state before rendering
6. Backend middleware validates JWT on protected endpoints
