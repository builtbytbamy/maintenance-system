# MIVA Maintenance System

The MIVA Maintenance System is a full-stack web application designed for managing university maintenance complaints and service requests. It features role-based dashboards for Students/Staff, Maintenance Officers, and Administrators, with real-time updates via WebSockets and in-app notifications.

---

## Tech Stack
- **Backend**: Go (Golang) with `go-chi` router and PostgreSQL database.
- **Frontend**: React (Vite) with Vanilla CSS and `lucide-react` icons.
- **Real-time**: WebSockets for live status updates and notifications.

---

## Key Features
1. **Student/Staff Dashboard**:
   - Submit maintenance requests with titles, descriptions, categories, locations, priorities, and image attachments.
   - Track submitted requests and view their real-time status updates.
2. **Maintenance Officer Dashboard**:
   - View assigned maintenance jobs.
   - Update job status (`in_progress`, `completed`, `rejected`) with notes.
   - View past completed/rejected tasks.
3. **Administrator Dashboard**:
   - Register new Officers and Administrators.
   - Assign/reassign requests to officers.
   - View system audit logs.
   - Export filtered requests as CSV or PDF report.
4. **Global Features**:
   - Real-time in-app notifications.
   - Sleek Light/Dark theme toggle (defaulting to a premium deep blue light theme).
   - Standardized modals with overlay closing and backdrop blur.

---

## Getting Started

### 1. Database Setup
Ensure you have a PostgreSQL database running. You can start one using Docker:
```bash
docker run --name miva-postgres -e POSTGRES_USER=miva_user -e POSTGRES_PASSWORD=miva_password -e POSTGRES_DB=miva_maintenance -p 5435:5432 -d postgres
```

### 2. Backend Setup
1. Navigate to the `backend` directory:
   ```bash
   cd backend
   ```
2. Build the server:
   ```bash
   go build -o server cmd/server/main.go
   ```
3. Run the server:
   ```bash
   PORT=8082 ./server
   ```
   *The server will automatically run migrations and seed the default admin user (`admin@miva.edu.ng` / `password`) and categories.*

### 3. Frontend Setup
1. Navigate to the `frontend` directory:
   ```bash
   cd frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run the development server:
   ```bash
   npm run dev
   ```
4. Open [http://localhost:5173](http://localhost:5173) in your browser.
