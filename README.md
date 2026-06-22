# ExamFlow

A full-stack web-based exam/assessment platform.

## Stack

- **Frontend**: React 18 + Vite (TypeScript)
- **Backend**: Node.js 20 + Express 5
- **Database**: PostgreSQL 15
- **Auth**: JWT (teachers) + session tokens (students)

## Quick Start

### Prerequisites

- Node.js 20+
- PostgreSQL 15+
- npm

### Setup

```bash
# 1. Configure environment
cp .env.example .env
# Edit .env with your DATABASE_URL and secrets

# 2. Start server (auto-creates DB schema)
cd server
npm install
npm run dev           # runs on :4000

# 3. Start client (separate terminal)
cd client
npm install
npm run dev           # runs on :5173, proxies /api to :4000
```

### Access

- App: http://localhost:5173
- API health: http://localhost:4000/api/health
- Teacher password: value of `TEACHER_PASSWORD` in `.env` (default: `admin123`)

## Roles

| Role | Capabilities |
|------|-------------|
| Teacher | Create/edit/delete exams · Mark submissions · Manage access · Publish results |
| Student | Take timed exams · Auto-save answers · View marked results with feedback |

## Environment Variables

See `.env.example` for all required variables.