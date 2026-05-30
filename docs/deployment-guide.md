# Deployment Guide

This guide covers deploying the AIPCSS application (frontend + backend) to various hosting platforms.

## Deployment Platforms Comparison

| Platform | Ease | Cost | Free Tier | Trial | Scalability | Best For |
|----------|------|------|-----------|-------|-------------|----------|
| **Render** | ⭐⭐⭐⭐ | Low | Yes | 12 months | Auto | Students / Demos |
| **Railway** | ⭐⭐⭐⭐⭐ | Very Low | Yes | Trial | Limited | Quick Deploy |
| **Docker Compose** | ⭐⭐⭐ | Self | Yes | N/A | Manual | Full Control |
| **AWS** | ⭐⭐ | Medium | Yes | 12 months | Auto | Enterprise |
| **Fly.io** | ⭐⭐⭐⭐ | Low | Yes | Trial | Auto | Institutions |
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
|----------|-----------------|----------|
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

1. Go to [render.com](https://render.com) → **New Web Service** → Connect repo
2. Configure:
   - **Root Directory**: `backend`
   - **Runtime**: Python 3
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `gunicorn -w 4 -b 0.0.0.0:$PORT run:app`
3. Add a **PostgreSQL** database from Render dashboard
4. Add environment variables:
   - `SECRET_KEY` (generate a random secret)
   - `JWT_SECRET_KEY` (generate a random secret)
   - `DATABASE_URL` (auto-populated by Render)
   - `FLASK_ENV=production`
5. Click **Deploy**

---

## Method 2: Railway (All-in-One)

1. Go to [railway.app](https://railway.app) → **New Project** → Deploy from GitHub
2. Railway will detect the repo structure
3. Add a **PostgreSQL** database service
4. Configure environment variables on the backend service
5. Railway provides internal networking automatically
6. Set **Start Command** to `gunicorn -w 4 -b 0.0.0.0:$PORT run:app`

---

## Method 3: Docker Compose (Local or VPS)

### Backend Dockerfile (`backend/Dockerfile`)

```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 5000
CMD ["gunicorn", "-w", "4", "-b", "0.0.0.0:5000", "run:app"]
```

### Frontend Dockerfile (`frontend/Dockerfile`)

```dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json .
RUN npm ci
COPY . .
ARG VITE_API_BASE_URL=http://localhost:5000
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
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
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U aipcss_user"]
      interval: 10s
      timeout: 5s
      retries: 5

  backend:
    build: ./backend
    environment:
      DATABASE_URL: postgresql://aipcss_user:change_me_in_production@db:5432/aipcss
      SECRET_KEY: your-secret-key-here
      JWT_SECRET_KEY: your-jwt-secret-here
      FLASK_ENV: production
    ports:
      - '5000:5000'
    depends_on:
      db:
        condition: service_healthy
    volumes:
      - ./backend:/app

  frontend:
    build:
      context: ./frontend
      args:
        VITE_API_BASE_URL: http://localhost:5000
    ports:
      - '80:80'
    depends_on:
      - backend

volumes:
  pgdata:
```

**Run locally:**
```bash
docker-compose up --build
```

Access the app at `http://localhost`

---

## Environment Setup

### Generate Secrets

```bash
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

Run this command twice to generate `SECRET_KEY` and `JWT_SECRET_KEY`.

### Database Connection String

**PostgreSQL:**
```
postgresql://username:password@host:port/database
```

**Example (Render managed database):**
```
postgresql://aipcss_user:your-password@dpg-xyz.render.internal:5432/aipcss
```

---

## Post-Deployment

1. **Database Migrations:** Run `flask db upgrade` in the backend service
2. **Test API:** Visit `https://your-backend-url/api/health` (if endpoint exists)
3. **Frontend Configuration:** Ensure `VITE_API_BASE_URL` points to your backend
4. **SSL/TLS:** Most platforms auto-enable HTTPS

---

## Troubleshooting

### Gunicorn Exit Status 1
- Ensure `DATABASE_URL` is set correctly
- Check logs for missing imports or initialization errors
- Verify `FLASK_ENV=production` is set
- Ensure `run:app` is accessible (the WSGI app object in `backend/run.py`)

### SocketIO Connection Issues
- Flask-SocketIO works with gunicorn when using the correct WSGI app
- Ensure `CORS_ORIGINS` environment variable allows frontend domain
- Check browser console for connection errors

### Database Connection Errors
- Verify `DATABASE_URL` format
- Test connection string locally before deploying
- Ensure database service is running and accessible

---

## Additional Resources

- [Render Documentation](https://render.com/docs)
- [Railway Documentation](https://docs.railway.app)
- [Flask Deployment Guide](https://flask.palletsprojects.com/en/latest/deploying/)
- [Gunicorn Documentation](https://docs.gunicorn.org)
