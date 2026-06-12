# Chile Devs Map

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

An interactive map of Chilean developers on GitHub. Browse developers by city and region, explore public contribution stats, and search by language or location.

## Installation

### Prerequisites

- [Node.js](https://nodejs.org/) 20+
- [pnpm](https://pnpm.io/)
- [Docker](https://www.docker.com/) (for PostgreSQL)

### 1. Start the database

```bash
docker compose up -d
```

### 2. Backend

```bash
cd backend
cp .env.example .env
pnpm install
pnpm db:migrate
pnpm db:seed
pnpm start:dev
```

Edit `backend/.env` and set at least:

| Variable | Description |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string (defaults in `.env.example` match Docker Compose) |
| `REDIS_URL` | Redis connection string for enrichment cache (defaults in `.env.example` match Docker Compose) |
| `GITHUB_TOKEN` | GitHub personal access token — required to sync developer data |
| `GITHUB_OAUTH_CLIENT_ID` | GitHub OAuth App client ID — required for profile claiming |
| `GITHUB_OAUTH_CLIENT_SECRET` | GitHub OAuth App client secret — required for profile claiming |
| `GITHUB_OAUTH_CALLBACK_URL` | OAuth callback URL (default: `http://localhost:3000/api/auth/github/callback`) |
| `SESSION_SECRET` | Secret used to sign login session cookies |
| `FRONTEND_URL` | Frontend origin for OAuth redirects (default: `http://localhost:5173`) |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Google AI Studio key — required for natural-language search |
| `SYNC_TOKEN` | Secret for the manual sync endpoint — send as `Authorization: Bearer <token>` on `POST /api/sync` and `POST /api/sync/user` |

### GitHub OAuth setup (profile claiming)

Developers can sign in with GitHub to claim their profile and add a portfolio URL, role, and description.

1. Create a [GitHub OAuth App](https://github.com/settings/developers).
2. Set **Authorization callback URL** to `http://localhost:3000/api/auth/github/callback`.
3. Copy the client ID and client secret into `backend/.env`.
4. Set a random `SESSION_SECRET` (any long random string).

In production, set `GITHUB_OAUTH_CALLBACK_URL` and `FRONTEND_URL` to your deployed API and frontend URLs. If the frontend and API are on different origins, run the API with `NODE_ENV=production` so session cookies use `SameSite=None; Secure`.

The API runs at `http://localhost:3000`. On first start with a valid `GITHUB_TOKEN` and an empty database, a sync runs automatically. Syncs also run every 3 hours.

### 3. Frontend

```bash
cd frontend
cp .env.example .env   # optional — defaults work with the Vite dev proxy
pnpm install
pnpm dev
```

Open `http://localhost:5173`. API requests are proxied to the backend via `/api`.

## Contributing

Contributions are welcome. To get started:

1. Fork the repository and create a branch from `main`.
2. Make your changes and run linting in the affected package (`pnpm lint` in `backend/` or `frontend/`).
3. Open a pull request with a clear description of what changed and why.

For larger changes, open an issue first to discuss the approach. Bug reports and suggestions are appreciated too.

## Limitations

This project is a snapshot of publicly available GitHub data, not a complete directory of every Chilean developer.

- **Incomplete coverage** — Discovery relies on the free-form `location` field on GitHub profiles. Not all developers set a location, and spelling varies, so the list is not exhaustive.
- **Public data only** — Stats and languages are derived from **public repositories** only. Private repos are not included.
- **Top-language sampling** — Language breakdowns are computed from each developer's **top 30 repositories** (by stars) to stay within GitHub API rate limits and avoid `429` errors.
- **Natural-language search** — Search queries are parsed by an LLM, which can misinterpret intent or extract the wrong filters. Double-check results if a query seems off.
- **Limited locations** — The map does not include every Chilean city and region, only the main ones included in the seed data. If yours is missing, [open an issue](https://github.com/MiguelHigueraDev/chile-devs/issues/new) and ask to have it added.
- **"Programming" languages** — GitHub counts HTML and CSS as languages, so yes, someone might show up as a top HTML developer. We don't make the rules; we just report them.

## License

This project is licensed under the [MIT License](LICENSE).
