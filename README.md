# AIPCSS - AI-Powered Smart Classroom Scheduling System

<p align="center">
  <img src="https://img.shields.io/badge/License-Apache%202.0-blue.svg" alt="License" />
  <img src="https://img.shields.io/badge/Python-3.10%2B-green.svg" alt="Python" />
  <img src="https://img.shields.io/badge/React-18.x-61DAFB.svg" alt="React" />
  <img src="https://img.shields.io/badge/TypeScript-5.x-3178C6.svg" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Flask-3.x-000000.svg" alt="Flask" />
  <img src="https://img.shields.io/badge/OR--Tools-9.x-FF6F00.svg" alt="OR-Tools" />
</p>

## Overview

**AIPCSS** (AI-Powered Smart Classroom Scheduling System) is a full-stack web application that automates and optimizes the generation of timetables for educational institutions. Built with Flask (Python) on the backend and React.js/TypeScript on the frontend, it leverages Google OR-Tools and custom genetic/hybrid scheduling algorithms to produce conflict-free, optimized class schedules.

## Features

- **Multi-Algorithm Scheduling** — Choose from OR-Tools CP-SAT solver, genetic algorithm, greedy algorithm, or a hybrid approach
- **Resource Management** — Full CRUD for departments, programs, batches, sections, courses, teachers, and rooms
- **Conflict Detection** — Automatically detects and resolves teacher, room, and batch scheduling conflicts
- **Workload Analysis** — Visualize teacher workload distribution and balance
- **PDF Export** — Export generated timetables as PDF documents
- **Authentication System** — Secure login/registration with JWT-based authentication
- **Dark/Light Theme** — User interface with theme toggle
- **Responsive Design** — Fully responsive UI built with Tailwind CSS
- **Bulk Import** — Import data via CSV/Excel for rapid setup

## Tech Stack

| Layer       | Technology                          |
|-------------|-------------------------------------|
| Frontend    | React 18, TypeScript, Vite, Tailwind CSS |
| Backend     | Flask 3, Python 3.10+               |
| Database    | SQLite (development), PostgreSQL (production) |
| Scheduling  | Google OR-Tools, Custom Genetic Algorithm |
| Auth        | JWT (JSON Web Tokens)               |
| Styling     | Tailwind CSS, shadcn/ui components  |

## Project Structure

```
AIPCSS/
├── backend/
│   ├── app/
│   │   ├── models/          # SQLAlchemy database models
│   │   ├── routes/          # API route handlers
│   │   ├── scheduler_new/   # Scheduling algorithms & engines
│   │   ├── config.py        # Application configuration
│   │   └── __init__.py      # Flask app factory
│   ├── run.py               # Application entry point
│   └── requirements.txt     # Python dependencies
├── frontend/
│   ├── src/
│   │   ├── components/      # Reusable UI components
│   │   ├── pages/           # Page-level components
│   │   ├── services/        # API service layer
│   │   ├── context/         # React context providers
│   │   ├── hooks/           # Custom React hooks
│   │   ├── types/           # TypeScript type definitions
│   │   └── lib/             # Utility functions
│   └── package.json
├── docs/                    # Detailed documentation
├── LICENSE                  # Apache License 2.0
├── NOTICE                   # Attribution notices
└── README.md
```

## Getting Started

### Prerequisites

- Python 3.10 or higher
- Node.js 18 or higher
- npm or yarn

### Backend Setup

```bash
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
python run.py
```

The backend server runs on `http://localhost:5000` by default.

### Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

The frontend development server runs on `http://localhost:5173` by default.

## API Overview

The backend exposes RESTful APIs for:

| Endpoint Group     | Base Path         | Description                  |
|--------------------|-------------------|------------------------------|
| Authentication     | `/api/auth`       | Login, registration, token   |
| Departments        | `/api/departments`| CRUD for departments          |
| Programs           | `/api/programs`   | CRUD for academic programs   |
| Batches            | `/api/batches`    | CRUD for student batches     |
| Sections           | `/api/sections`   | CRUD for sections            |
| Courses            | `/api/courses`    | CRUD for courses             |
| Teachers           | `/api/teachers`   | CRUD for teachers            |
| Rooms              | `/api/rooms`      | CRUD for classrooms          |
| Curriculum         | `/api/curriculum` | Course-section assignments   |
| Scheduling         | `/api/scheduling` | Timetable generation         |
| Workload           | `/api/workload`   | Teacher workload analytics   |
| Settings           | `/api/settings`   | App configuration            |
| PDF Export         | `/api/pdf-export` | Timetable PDF generation     |

For detailed API documentation, see [docs/api-reference.md](docs/api-reference.md).

## Scheduling Algorithms

AIPCSS implements four scheduling approaches:

1. **OR-Tools CP-SAT Solver** — Uses Google's constraint programming solver for optimal solutions
2. **Genetic Algorithm** — Evolutionary approach with selection, crossover, and mutation operators
3. **Greedy Algorithm** — Fast heuristic-based approach for quick schedule generation
4. **Hybrid Engine** — Combines genetic and greedy approaches for balanced results

For algorithm details, see [docs/scheduling-algorithm.md](docs/scheduling-algorithm.md).

## Contributing

We welcome contributions! Please read our [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on how to get started.

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). By participating, you agree to uphold this code.

## License

This project is licensed under the **Apache License 2.0**. See the [LICENSE](LICENSE) file for details.

## Team

- **Zaid Alam** — Developer
- **Ajay Kumar** — Developer & Maintainer
- **Aboni Mohan Sahu** — Developer
- **Rohit Kumar Yadav** — Developer

**Supervised by:** Dr. Kumar Amrendra, Department of CSE, Jharkhand Rai University

## Contact

For any inquiries, please reach out at [iamajaykr06](https://github.com/iamajaykr06) or open an [issue](https://github.com/iamajaykr06/AIPCSS/issues).
