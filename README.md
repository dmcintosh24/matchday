# ⚽ Matchday

**Self-hosted Fantasy Premier League salary cap draft league.**

Matchday is a full-featured fantasy football platform for friend groups who follow the English Premier League. Run your own league with a salary cap draft, weekly scoring, trades with league review, and season-long standings — all powered by real FPL data.

## Features

- **Salary Cap Draft** — snake or linear draft with real FPL player prices
- **Real Player Data** — 500+ players with live stats, injuries, and prices from the official FPL API
- **Weekly Scoring** — automatic score refresh with per-player breakdowns
- **Trade System** — propose trades, league-wide review period, protest voting
- **Lineup Management** — set your starting XI each gameweek with carry-forward
- **Season Standings** — weekly and cumulative points, weekly high score prizes
- **Payout System** — configurable entry fee, weekly prizes, season finish payouts
- **Multi-Season** — archive completed seasons, start fresh each year
- **FotMob Links** — click any player to go directly to their FotMob profile
- **Wishlist** — star players for draft prep
- **Mobile Friendly** — hamburger menu, responsive tables, touch-friendly
- **Fully Customizable** — league name, logo, scoring rules, roster limits, trade rules — all from the admin panel
- **Self-Hosted** — your data, your server, no third-party dependencies

## Quick Start

### Prerequisites
- Docker & Docker Compose
- A domain (optional but recommended for HTTPS)

### 1. Clone & Configure

```bash
git clone https://github.com/dmcintosh24/matchday.git
cd matchday
cp .env.example .env
# Edit .env and set a secure SECRET_KEY:
echo "FPL_SECRET_KEY=$(python3 -c 'import secrets; print(secrets.token_hex(32))')" > .env
```

### 2. Build & Run

```bash
docker compose build
docker compose up -d
```

The app runs on port 8000. Visit `http://localhost:8000` to start the setup wizard.

### 3. First Run — Setup Wizard

On first visit, you'll see the setup wizard:
1. **Name your league** — choose a name and subtitle
2. **Upload a logo** (optional)
3. **Create admin account** — this becomes the league commissioner

After setup, share the URL with your managers so they can register.

### Production Deployment

For production with HTTPS, put a reverse proxy in front (Caddy, nginx, Traefik):

**Caddy example:**
```
yourdomain.com {
    reverse_proxy matchday-app:8000
}
```

**nginx example:**
```nginx
server {
    listen 80;
    server_name yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `FPL_SECRET_KEY` | (random) | JWT signing key. **Set this in production.** |
| `DB_PATH` | `fpl_league.db` | SQLite database file path |
| `LOGO_PATH` | `league_logo.png` | League logo file path |

## Architecture

```
backend/
  main.py              FastAPI app — all 65+ API endpoints
  server_wrapper.py    Production SPA serving
  requirements.txt     Python dependencies (FastAPI, PyJWT, httpx)

frontend/
  src/
    App.jsx            Router, layout, auth guards
    contexts/          AuthContext, LeagueContext
    api/               HTTP client, FotMob hook
    pages/             14 page components
  index.html           Entry point
  vite.config.js       Vite + dev proxy

Dockerfile             Multi-stage build (Node + Python)
docker-compose.yml     Production config
```

## Default League Rules

All configurable from the Admin panel.

| Setting | Default |
|---------|---------|
| Salary Cap | £100m |
| Squad Size | 15 (2 GK, 5 DEF, 5 MID, 3 FWD) |
| Max Per Club | 3 |
| Starting XI | 1 GK + min 3 DEF, 2 MID, 1 FWD |
| Draft Type | Snake |
| Trade Review | 24 hours |
| Protest Threshold | 50% of uninvolved managers |
| Lineup Lock | After GW deadline |
| Free Agency | Unrestricted (configurable window) |

## Scoring (FPL-based)

| Action | GK | DEF | MID | FWD |
|--------|-----|-----|-----|-----|
| Goal | 6 | 6 | 5 | 4 |
| Assist | 3 | 3 | 3 | 3 |
| Clean Sheet | 4 | 4 | 1 | — |
| 3 Saves | 1 | — | — | — |
| Penalty Save | 5 | — | — | — |
| Bonus (1st/2nd/3rd) | 3/2/1 | 3/2/1 | 3/2/1 | 3/2/1 |

## Data Sources

- **Player data:** [FPL API](https://fantasy.premierleague.com/api/bootstrap-static/) — free, no key required
- **Live scores:** FPL Event Live API — per-gameweek player points
- **Fixtures:** FPL Fixtures API — match schedules and results
- **Player profiles:** [FotMob API](https://www.fotmob.com) — linked via search, cached locally

## Development

```bash
# Backend
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
SECRET_KEY=dev-secret uvicorn main:app --reload --port 8000

# Frontend (separate terminal)
cd frontend
npm install
npm run dev    # Dev server on :5173, proxies /api to :8000
```

## License

[MIT](LICENSE) — use it, modify it, host your own league.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

---

Built with ⚽ by [Dylan McIntosh](https://github.com/dmcintosh24)
