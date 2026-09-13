# FUSE Events — Backend API

Express + MongoDB API for the FUSE events platform.

## Setup

```bash
cp .env.example .env
npm install
npm run seed    # seeds admin, agent, sample events
npm run dev     # http://localhost:5001
```

## Default credentials (after seed)

- **Admin:** admin@fuse.events / admin123
- **Gate agent:** agent@fuse.events / agent123

## API

Base URL: `/api/v1`

- `GET /health` — health check
- `POST /auth/login`, `/auth/register`, `GET /auth/me`
- `GET /events`, `/events/:slug`, `/characters`, `/content/home`
- `POST /bookings`, `POST /bookings/:id/confirm`
- `POST /tickets/scan` (gate agent)
- `/admin/*` — admin CRUD (auth required)
- `/analytics/*` — dashboards & CSV export

## Env vars

See `.env.example`. Note: macOS uses port 5000 for AirPlay — default is **5001**.
