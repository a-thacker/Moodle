# Command Center (self-hosted)

The self-hosted core of the Personal Command Center: a FastAPI backend over
PostgreSQL, running in Docker on an Ubuntu server (reached over Tailscale).
Postgres is the single source of truth; the backend is the **only** component
that touches it. The frontend and the future Ollama layer read and write
exclusively through the API.

This directory mirrors `~/command-center` on the server — develop here, sync
there.

## Layout

```
command-center/
├── docker-compose.yml      # postgres, backend, (ai profile) ollama + open-webui
├── .env.example            # copy to .env
├── backend/
│   ├── Dockerfile
│   ├── entrypoint.sh       # runs `alembic upgrade head`, then the server
│   ├── requirements.txt
│   ├── alembic.ini
│   ├── alembic/            # async migration env + versions/
│   └── app/
│       ├── main.py         # app factory (create_app), lifespan, CORS
│       ├── core/           # config (pydantic-settings), logging
│       ├── db/             # DeclarativeBase + mixins, async engine/session
│       ├── models/         # SQLAlchemy 2.x models (User)
│       ├── schemas/        # Pydantic v2 request/response models
│       ├── services/       # business logic (routes stay thin)
│       └── api/            # routers: health at root, features under /api/v1
├── frontend/               # React + Vite + TypeScript dashboard (Nocturne UI)
│   └── src/
│       ├── components/     # OwnerDashboard + cards, RoommateGrocery
│       ├── hooks/          # useClock, useGrocery (live API + sample fallback)
│       ├── api/            # typed FastAPI client (the data seam)
│       ├── data/sample.ts  # sample data until backend endpoints land
│       └── styles/         # nocturne.css (design tokens) + app.css
└── data/                   # bind-mounted volumes (gitignored)
    ├── postgres/
    └── ollama/
```

Separation of concerns is deliberate: routers do HTTP, services do logic,
models are the schema, schemas are the contract. No business logic in routes.

## Run

```bash
cp .env.example .env         # set a real POSTGRES_PASSWORD
docker compose up -d postgres backend      # data plane + API
docker compose logs -f backend             # watch migrations + startup

curl http://localhost:8000/health          # liveness
curl http://localhost:8000/health/db       # readiness (checks Postgres)
# API docs: http://localhost:8000/docs

docker compose --profile ai up -d          # later: adds Ollama + Open WebUI
```

## Frontend

React + Vite + TypeScript, styled with the Nocturne design system. The owner
dashboard (launcher rail, hero, grades/deadlines/grocery/sync-agent/what-changed
cards) and the roommate grocery-only view are ported from the design mockups.

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173  (proxies /api → :8000)
npm run build      # tsc -b && vite build → dist/
```

View the roommate layout at `http://localhost:5173/?view=roommate` (until
auth lands, the role is a query param). Cards read sample data from
`src/data/sample.ts`; the grocery list already calls the API via
`src/api/client.ts` and falls back to sample data when the backend routes
(Phase 3) aren't up yet.

## Migrations

The schema is managed by Alembic; the container applies `upgrade head` on
every start. To create a migration after changing models:

```bash
docker compose exec backend alembic revision --autogenerate -m "add tasks"
docker compose exec backend alembic upgrade head
```

Alembic reads the database URL and target metadata from the app's own
settings and models, so migrations never drift from runtime config.

## Roadmap

Backend-first. Phase 2 (current): config, DB, models, migrations, health,
then auth + the first CRUD resources. AI (Ollama, tool-calling) is Phase 4 —
not started. Full vision: `../docs/PROJECT_HANDOFF.md` and `../server_handoff.txt`.
