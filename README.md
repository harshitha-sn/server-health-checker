# Watchtower — Server Health Checker

A Flask-based monitoring dashboard that periodically checks HTTP endpoints, stores results in SQLite, and visualizes latency and uptime with Chart.js. The UI is styled as a small SaaS control plane with sidebar navigation, summary cards, dark mode, toast notifications, and a documented JSON API.

## Features

- Add and remove monitored URLs (HTTPS recommended).
- On-demand checks plus **auto-refresh every 30 seconds** in the browser.
- Per-target cards: HTTP status, response time, online/offline badge, last check time, last error.
- **Search/filter** across names and URLs.
- **SQLite history** for charts (response time line, stepped uptime line).
- **REST API** under `/api/*` for automation.
- **Docker** and **docker-compose** with a persistent volume for the database.
- **Jenkinsfile** with install, pytest, and Docker build stages (Linux shell).

## Project layout

| Path | Role |
|------|------|
| `app.py` | Flask app factory, routes, error handlers |
| `db.py` | SQLite schema, queries |
| `health_service.py` | Timed HTTP GET and status classification |
| `templates/index.html` | Single-page dashboard shell |
| `static/css/style.css` | Theme, layout, motion |
| `static/js/dashboard.js` | API calls, charts, auto-refresh, dark mode |
| `database/` | Default SQLite location when running locally (`healthchecker.db`) |

## Quick start (local)

```bash
python -m venv .venv
.venv\Scripts\activate          # Windows
# source .venv/bin/activate     # macOS / Linux
pip install -r requirements.txt
python app.py
```

Open [http://127.0.0.1:5000](http://127.0.0.1:5000). Add targets under **Targets**, then use **Check all** or wait for the UI refresh cycle.

### Environment variables

| Variable | Purpose |
|----------|---------|
| `PORT` | Dev server port (default `5000`) |
| `DATABASE_PATH` | Full path to SQLite file (Docker compose sets `/data/healthchecker.db`) |

## REST API

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | Liveness JSON for probes |
| `GET` | `/api/stats` | Aggregate counts (servers, online, checks) |
| `GET` | `/api/servers` | List servers with last check fields |
| `POST` | `/api/servers` | Body: `{"name":"...","url":"https://..."}` |
| `DELETE` | `/api/servers/<id>` | Remove a server and its history |
| `POST` | `/api/servers/<id>/check` | Run one check |
| `POST` | `/api/check-all` | Check every server |
| `GET` | `/api/servers/<id>/history?limit=60` | Time series for charts |

Responses are JSON objects shaped as `{ "ok": true, "data": ... }` or `{ "ok": false, "error": "..." }` with appropriate HTTP status codes.

## Docker

```bash
docker compose up --build
```

The app listens on port **5000**. Data is stored in the named volume `watchtower-data` mapped to `/data` inside the container.

## Production-style serve

```bash
gunicorn --bind 0.0.0.0:5000 --workers 2 --threads 4 app:app
```

## Jenkins

The included `Jenkinsfile` assumes a Linux agent with `python3`, `docker`, and shell (`sh`) available. On Windows-only agents, replace the `sh` blocks with `bat` equivalents or use the Docker agent label pattern from your organization.

## Tests

```bash
pytest -q
```

## License

Use and modify freely for learning and internal tooling.
