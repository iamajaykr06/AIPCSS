# Installation Guide

This guide walks you through setting up the AIPCSS development environment from scratch.

## Prerequisites

Before you begin, ensure you have the following installed:

| Requirement   | Minimum Version | Recommended Version | Download                          |
|---------------|-----------------|---------------------|-----------------------------------|
| Python        | 3.10            | 3.11+               | [python.org](https://python.org)  |
| Node.js       | 18.0            | 20.x LTS            | [nodejs.org](https://nodejs.org)  |
| npm           | 9.0             | 10.x                | Included with Node.js             |
| Git           | 2.30            | Latest              | [git-scm.com](https://git-scm.com)|
| pip           | 23.0            | Latest              | Included with Python              |

## Clone the Repository

```bash
git clone https://github.com/iamajaykr06/AIPCSS.git
cd AIPCSS
```

## Backend Setup

### 1. Create and Activate Virtual Environment

```bash
cd backend
python -m venv venv

# On macOS/Linux:
source venv/bin/activate

# On Windows:
venv\Scripts\activate
```

### 2. Install Python Dependencies

```bash
pip install --upgrade pip
pip install -r requirements.txt
```

### 3. Configure Environment

Create a `.env` file in the `backend/` directory:

```env
FLASK_APP=app
FLASK_ENV=development
SECRET_KEY=your-secret-key-here
DATABASE_URL=sqlite:///aipcss.db
JWT_SECRET_KEY=your-jwt-secret-here
JWT_ACCESS_TOKEN_EXPIRES=86400
```

### 4. Initialize the Database

```bash
python -c "from app import create_app, db; app = create_app(); app.app_context().push(); db.create_all(); print('Database created successfully!')"
```

### 5. Run the Backend Server

```bash
python run.py
```

The backend API will be available at `http://localhost:5000`.

## Frontend Setup

### 1. Install Dependencies

```bash
cd frontend
npm install
```

### 2. Configure Environment

Create a `.env` file in the `frontend/` directory:

```env
VITE_API_BASE_URL=http://localhost:5000/api
```

### 3. Start the Development Server

```bash
npm run dev
```

The frontend will be available at `http://localhost:5173`.

## Production Setup

### Backend (using Gunicorn)

```bash
cd backend
pip install gunicorn
gunicorn -w 4 -b 0.0.0.0:5000 "app:create_app()"
```

### Frontend (Build for Production)

```bash
cd frontend
npm run build
# The output will be in the `dist/` directory
# Serve with nginx, Apache, or any static file server
```

## Docker Setup (Optional)

### Backend Dockerfile

```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 5000
CMD ["gunicorn", "-w", "4", "-b", "0.0.0.0:5000", "app:create_app()"]
```

### Frontend Dockerfile

```dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
```

## Verifying the Installation

1. Open `http://localhost:5173` in your browser
2. You should see the AIPCSS login page
3. Register a new account or login
4. Navigate to the dashboard to verify the backend connection

## Troubleshooting

| Issue                          | Solution                                                                 |
|--------------------------------|--------------------------------------------------------------------------|
| `ModuleNotFoundError`          | Ensure virtual environment is activated and dependencies are installed  |
| `ECONNREFUSED` on port 5000    | Check if backend server is running; verify port is not in use           |
| `npm install` fails            | Try deleting `node_modules` and `package-lock.json`, then re-install   |
| CORS errors                    | Ensure `VITE_API_BASE_URL` matches backend URL and CORS is configured  |
| Database errors                | Delete the `.db` file and re-initialize the database                    |
| Port already in use            | Kill the process using the port or change the port in configuration     |
