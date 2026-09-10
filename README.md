# JobJeeves (Resume ↔ Job Description Matcher)

## What it does

- **Upload PDF resume**
- **Extract text**
- **Compare vs job description** (default **Groq** via OpenAI-compatible API; optional OpenAI)
- **Return**: match score, missing keywords, strengths, short summary, improvement suggestions
- **Store results** in PostgreSQL (Docker) or SQLite (`dev.db` locally)

## Quickstart (Docker)

1) Create a local `.env` (same folder as `docker-compose.yml`) with:

- `GROQ_API_KEY=...`
- (optional) `LLM_PROVIDER=groq` (default)
- (optional) `GROQ_MODEL=llama-3.1-8b-instant`

Tip: see `env.sample` for all knobs.

2) Start everything:

```bash
docker compose up --build
```

3) Open:

- Frontend: `http://localhost:5173`
- Backend health: `http://localhost:8000/api/health`

## Local dev (no Docker, one-liner)

From repo root:

```bash
npm run dev
```

This command will:
- install frontend dependencies
- create `.venv` if missing
- install backend Python requirements
- create `.env` from `env.sample` if missing
- start backend on `127.0.0.1:8000` and frontend on `127.0.0.1:5173`

If you only want setup (without starting servers):

```bash
npm run setup
```

Optional split commands:

```bash
npm run dev:backend
npm run dev:frontend
```

## API

- `POST /api/analyze` (multipart/form-data)
  - `file`: PDF
  - `job_description`: string (optional; if omitted/empty, runs resume-only mode)
- `GET /api/health` — health check
- `GET /api/analyses/{id}` — fetch stored analysis by id

## Deployment options

| Target | Doc |
|--------|-----|
| Docker Compose (local full stack) | This README — Quickstart |
| **Vercel (frontend + `/api` serverless)** | `api/index.py` + root `requirements.txt` — same-origin `/api/*` |
| Vercel frontend + external API | [README-vercel.md](./README-vercel.md) — legacy split deploy |
| AWS ECS + Supabase | [README-ecs-supabase.md](./README-ecs-supabase.md) |

**Production:** https://jobjeeves-menhir-holdings.vercel.app — see [docs/HAPPY_PATH.md](./docs/HAPPY_PATH.md).

**Env (Vercel):** `GROQ_API_KEY` or `OPENAI_API_KEY`, optional `DATABASE_URL=sqlite:////tmp/jobjeeves.db`, `CORS_ORIGINS` if needed.

**Env naming:** `VITE_API_BASE_URL` is for local Vite dev (proxy to backend). Production Vercel builds use **`VITE_API_URL`** (see `frontend/src/api.ts`).

## Notes / Limitations

- **Scanned PDFs** (images) usually won’t extract text without OCR.



## License

All Rights Reserved © Menhir Holdings
