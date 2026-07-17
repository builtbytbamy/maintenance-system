# MIVA Maintenance System - Deployment Guide

Follow these step-by-step instructions to deploy the MIVA Maintenance System to production using **Render** (as Koyeb is currently unavailable).

---

## Prerequisites
- A GitHub repository containing the codebase.
- Accounts on:
  - **Render** (for Go backend and PostgreSQL database)
  - **Vercel** or **Netlify** (for React frontend hosting)

---

## Step 1: Deploy the Database (Render PostgreSQL)
1. Log in to [Render](https://render.com) and click **New > PostgreSQL**.
2. Configure the database settings:
   - **Name**: `miva-maintenance-db`
   - **Database Name**: `miva_maintenance`
   - **User**: `miva_user`
   - **Region**: Choose the region closest to you.
3. Click **Create Database**.
4. Once created, copy the **Internal Database URL** (for backend connection) or **External Database URL** (if connecting from outside Render). It should look like:
   `postgres://miva_user:password@dpg-cool-water-a.oregon-postgres.render.com/miva_maintenance`

---

## Step 2: Deploy the Go Backend (Render Web Service)
1. In Render, click **New > Web Service**.
2. Connect your GitHub repository.
3. Configure the service settings:
   - **Name**: `miva-maintenance-backend`
   - **Environment**: `Go`
   - **Region**: Choose the same region as your database.
   - **Branch**: `main`
   - **Root Directory**: `backend`
   - **Build Command**: `go build -o server cmd/server/main.go`
   - **Start Command**: `./server`
4. Click **Advanced** to add **Environment Variables**:
   - `DATABASE_URL`: `<Your Render Internal Database URL>`
   - `PORT`: `8082`
   - `JWT_SECRET`: `<Generate a random secure string>`
   - `ALLOWED_ORIGINS`: `https://<your-frontend-domain>.vercel.app` (You can update this after deploying the frontend)
5. Click **Create Web Service**. Once deployed, copy the public Render URL (e.g., `https://miva-maintenance-backend.onrender.com`).

---

## Step 3: Deploy the React Frontend (Vercel)
1. Log in to [Vercel](https://vercel.com) and click **Add New > Project**.
2. Import your GitHub repository.
3. Configure the project settings:
   - **Framework Preset**: `Vite`
   - **Root Directory**: `frontend`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
4. Add the following **Environment Variable**:
   - `VITE_API_URL`: `https://miva-maintenance-backend.onrender.com/api` (Make sure to include `/api` at the end)
5. Click **Deploy**.

---

## Step 4: Finalize CORS Configuration
1. Go back to your Render backend service settings.
2. Update the `ALLOWED_ORIGINS` environment variable to match your production Vercel frontend URL (e.g., `https://<your-frontend-domain>.vercel.app`).
3. Save changes. Render will automatically redeploy the backend service.
