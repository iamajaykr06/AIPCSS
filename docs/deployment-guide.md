# Deployment Guide

This guide covers five deployment methods for AIPCSS, from beginner-friendly to advanced.

## Quick Comparison

| Feature | Vercel + Render | Railway | Docker | AWS | Self-Hosted VPS |
|---------|-----------------|---------|--------|-----|-----------------|
| Difficulty | Easy | Easy | Medium | Hard | Hard |
| Free Tier | Yes | Trial | N/A | 12 months | N/A |
| Monthly Cost | $0 - $7 | $0 - $5 | $5 - $20 | $10 - $50 | $5 - $20 |
| Custom Domain | Yes | Yes | Yes | Yes | Yes |
| SSL | Auto | Auto | Manual | Auto | Manual |
| Auto Scaling | Yes | Limited | Manual | Yes | Manual |
| Database | Managed | Managed | Self-managed | Managed (RDS) | Self-managed |
| Best For | Students / Demos | Quick Deploy | Full Control | Enterprise | Institutions |

---

## Environment Variables

| Variable | Backend/Frontend | Description |
|----------|-----------------|-------------|
| `SECRET_KEY` | Backend | Flask secret key for sessions |
| `JWT_SECRET_KEY` | Backend | JWT token signing key |
| `DATABASE_URL` | Backend | Database connection string |
| `FLASK_ENV` | Backend | Environment mode (`production`) |
| `VITE_API_BASE_URL` | Frontend | Backend API URL |

---

## Method 1: Vercel (Frontend) + Render (Backend)

### Frontend on Vercel

1. Go to [vercel.com](https://vercel.com) and sign in with GitHub
2. Click **New Project** → Select the AIPCSS repository
3. Configure:
   - **Root Directory**: `frontend`
   - **Framework Preset**: Vite
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
4. Add environment variable: `VITE_API_BASE_URL` = your Render backend URL
5. Click **Deploy**

### Backend on Render

1. Create a `Procfile` in `backend/`:
   ```
   web: gunicorn -w 4 -b 0.0.0.0:$PORT app:create_app()
   ```
2. Go to [render.com](https://render.com) → **New Web Service** → Connect repo
3. Configure:
   - **Root Directory**: `backend`
   - **Runtime**: Python 3
4. Add a **PostgreSQL** database from Render dashboard
5. Add environment variables: `SECRET_KEY`, `JWT_SECRET_KEY`, `DATABASE_URL`, `FLASK_ENV=production`

---

## Method 2: Railway (All-in-One)

1. Go to [railway.app](https://railway.app) → **New Project** → Deploy from GitHub
2. Railway will detect the repo structure
3. Add a **PostgreSQL** database service
4. Configure environment variables on the backend service
5. Railway provides internal networking automatically

---

## Method 3: Docker

### Backend Dockerfile (`backend/Dockerfile`)

```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 5000
CMD ["gunicorn", "-w", "4", "-b", "0.0.0.0:5000", "app:create_app()"]
```

### Frontend Dockerfile (`frontend/Dockerfile`)

```dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json .
RUN npm ci
COPY . .
ARG VITE_API_BASE_URL
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

### docker-compose.yml (Project Root)

```yaml
version: '3.8'
services:
  db:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: aipcss
      POSTGRES_USER: aipcss_user
      POSTGRES_PASSWORD: change_me_in_production
    volumes:
      - pgdata:/var/lib/postgresql/data
    ports:
      - '5432:5432'

  backend:
    build: ./backend
    environment:
      DATABASE_URL: postgresql://aipcss_user:change_me_in_production@db:5432/aipcss
      SECRET_KEY: your-secret-key
      JWT_SECRET_KEY: your-jwt-secret
      FLASK_ENV: production
    ports:
      - '5000:5000'
    depends_on:
      - db

  frontend:
    build:
      context: ./frontend
      args:
        VITE_API_BASE_URL: http://localhost:5000/api
    ports:
      - '80:80'
    depends_on:
      - backend

volumes:
  pgdata:
```

### Deploy

```bash
docker compose up -d --build
```

---

## Method 4: AWS

- **Frontend**: Build locally → Upload to S3 → Distribute via CloudFront
- **Backend**: Deploy to Elastic Beanstalk with Gunicorn
- **Database**: Amazon RDS PostgreSQL

---

## Method 5: Self-Hosted VPS

1. Provision a VPS (2 CPU, 4 GB RAM minimum)
2. Install: Python 3.11, Node.js 20, PostgreSQL 15, Nginx
3. Build frontend: `cd frontend && npm run build`
4. Serve frontend from `/var/www/aipcss/` with Nginx
5. Run backend with Gunicorn + systemd service
6. Configure Nginx as reverse proxy (port 80/443 → port 5000)
7. Set up SSL with Let's Encrypt: `sudo certbot --nginx`

---

## Post-Deployment Checklist

- [ ] Change all default secret keys to strong random values
- [ ] Enable HTTPS and redirect HTTP to HTTPS
- [ ] Enable gzip/Brotli compression on web server
- [ ] Configure database backups (daily minimum)
- [ ] Set up uptime monitoring (UptimeRobot, etc.)
- [ ] Test scheduling algorithm in production
- [ ] Verify PDF export functionality
- [ ] Register the first admin account and set up test data
