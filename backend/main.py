"""
Fantasy Premier League Salary Cap Draft App - Backend
"""
import os
import json
import secrets
import hashlib
import sqlite3
import asyncio
import logging
from datetime import datetime, timedelta, timezone
from contextlib import contextmanager
from typing import Optional

import jwt
from cryptography.hazmat.primitives import serialization
import httpx
from fastapi import FastAPI, Depends, HTTPException, status, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, EmailStr

# ── Config ──────────────────────────────────────────────────────────────
SECRET_KEY = os.getenv("SECRET_KEY", secrets.token_hex(32))
DB_PATH = os.getenv("DB_PATH", "fpl_league.db")
LOGO_PATH = os.getenv("LOGO_PATH", "league_logo.png")
APP_VERSION = "2.0.1"
GITHUB_URL = "https://github.com/dmcintosh24/matchday"
VAPID_PRIVATE_KEY_PATH = os.getenv("VAPID_PRIVATE_KEY_PATH", "vapid_private.pem")
VAPID_PUBLIC_KEY_PATH = os.getenv("VAPID_PUBLIC_KEY_PATH", "vapid_public.pem")
VAPID_CLAIMS_EMAIL = os.getenv("VAPID_EMAIL", "mailto:admin@matchday.app")
FPL_BOOTSTRAP_URL = "https://fantasy.premierleague.com/api/bootstrap-static/"
FPL_LIVE_URL = "https://fantasy.premierleague.com/api/event/{gw}/live/"
FPL_CACHE_FILE = "fpl_cache.json"
FPL_CACHE_TTL = 3600  # 1 hour

logger = logging.getLogger("matchday")

app = FastAPI(title="Matchday — Fantasy Football League Manager")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
security = HTTPBearer(auto_error=False)


# ── Public endpoints (no auth) ──────────────────────────────────────────
@app.get("/api/version")
def get_version():
    return {"version": APP_VERSION, "github": GITHUB_URL, "name": "Matchday"}


@app.get("/api/health")
def health_check():
    try:
        with get_db() as db:
            db.execute("SELECT 1")
        return {"status": "healthy", "version": APP_VERSION}
    except Exception as e:
        return {"status": "unhealthy", "error": str(e)}


@app.get("/api/setup/status")
def setup_status():
    """Check if initial setup has been completed (any users exist)."""
    with get_db() as db:
        count = db.execute("SELECT COUNT(*) as c FROM users").fetchone()["c"]
    return {"setup_complete": count > 0, "version": APP_VERSION}


@app.get("/api/config/logo")
async def get_logo():
    """Serve the uploaded league logo."""
    from fastapi.responses import FileResponse
    logo_path = os.path.join(os.path.dirname(DB_PATH) if "/" in DB_PATH else ".", LOGO_PATH)
    # Also check data directory
    data_logo = os.path.join("data", LOGO_PATH) if os.path.exists("data") else None
    for path in [logo_path, LOGO_PATH, data_logo]:
        if path and os.path.exists(path):
            return FileResponse(path, media_type="image/png")
    raise HTTPException(404, "No logo uploaded")


# ── Database ────────────────────────────────────────────────────────────
@contextmanager
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db():
    with get_db() as db:
        db.executescript("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            is_admin INTEGER DEFAULT 0,
            is_active INTEGER DEFAULT 1,
            reset_token TEXT,
            reset_token_expires TEXT,
            created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS league_config (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            description TEXT
        );

        CREATE TABLE IF NOT EXISTS teams (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER UNIQUE NOT NULL,
            name TEXT NOT NULL,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (user_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS roster (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            team_id INTEGER NOT NULL,
            player_id INTEGER NOT NULL,
            position TEXT NOT NULL,
            salary REAL NOT NULL,
            acquired_via TEXT DEFAULT 'draft',
            acquired_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (team_id) REFERENCES teams(id),
            UNIQUE(team_id, player_id)
        );

        CREATE TABLE IF NOT EXISTS draft_state (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            status TEXT DEFAULT 'pending',
            current_pick INTEGER DEFAULT 0,
            draft_order TEXT,
            started_at TEXT,
            completed_at TEXT
        );

        CREATE TABLE IF NOT EXISTS draft_picks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            draft_id INTEGER NOT NULL,
            team_id INTEGER NOT NULL,
            player_id INTEGER NOT NULL,
            pick_number INTEGER NOT NULL,
            salary REAL NOT NULL,
            picked_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (draft_id) REFERENCES draft_state(id),
            FOREIGN KEY (team_id) REFERENCES teams(id)
        );

        CREATE TABLE IF NOT EXISTS trades (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            from_team_id INTEGER NOT NULL,
            to_team_id INTEGER NOT NULL,
            status TEXT DEFAULT 'pending',
            proposed_at TEXT DEFAULT (datetime('now')),
            accepted_at TEXT,
            review_expires_at TEXT,
            resolved_at TEXT,
            FOREIGN KEY (from_team_id) REFERENCES teams(id),
            FOREIGN KEY (to_team_id) REFERENCES teams(id)
        );

        CREATE TABLE IF NOT EXISTS trade_players (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            trade_id INTEGER NOT NULL,
            player_id INTEGER NOT NULL,
            from_team_id INTEGER NOT NULL,
            FOREIGN KEY (trade_id) REFERENCES trades(id),
            FOREIGN KEY (from_team_id) REFERENCES teams(id)
        );

        CREATE TABLE IF NOT EXISTS trade_protests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            trade_id INTEGER NOT NULL,
            team_id INTEGER NOT NULL,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (trade_id) REFERENCES trades(id),
            FOREIGN KEY (team_id) REFERENCES teams(id),
            UNIQUE(trade_id, team_id)
        );

        CREATE TABLE IF NOT EXISTS announcements (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            body TEXT NOT NULL,
            author_id INTEGER NOT NULL,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (author_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS wishlist (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            player_id INTEGER NOT NULL,
            priority INTEGER DEFAULT 0,
            added_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (user_id) REFERENCES users(id),
            UNIQUE(user_id, player_id)
        );

        CREATE TABLE IF NOT EXISTS fotmob_cache (
            fpl_player_id INTEGER PRIMARY KEY,
            fotmob_id INTEGER,
            fotmob_slug TEXT,
            fotmob_team_id INTEGER,
            fotmob_team_slug TEXT,
            updated_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS seasons (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            status TEXT DEFAULT 'active',
            created_at TEXT DEFAULT (datetime('now')),
            ended_at TEXT
        );

        CREATE TABLE IF NOT EXISTS player_snapshot (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            season_id INTEGER NOT NULL,
            fpl_player_id INTEGER NOT NULL,
            name TEXT,
            web_name TEXT,
            position TEXT,
            club_name TEXT,
            club_short TEXT,
            salary REAL,
            total_points INTEGER,
            FOREIGN KEY (season_id) REFERENCES seasons(id)
        );

        CREATE TABLE IF NOT EXISTS how_to_play (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            section_order INTEGER DEFAULT 0,
            title TEXT NOT NULL,
            body TEXT NOT NULL,
            updated_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS chat_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            message TEXT NOT NULL,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (user_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS push_subscriptions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            endpoint TEXT NOT NULL,
            p256dh TEXT NOT NULL,
            auth TEXT NOT NULL,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (user_id) REFERENCES users(id),
            UNIQUE(user_id, endpoint)
        );

        CREATE TABLE IF NOT EXISTS draft_queue (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            player_id INTEGER NOT NULL,
            priority INTEGER DEFAULT 0,
            FOREIGN KEY (user_id) REFERENCES users(id),
            UNIQUE(user_id, player_id)
        );

        CREATE TABLE IF NOT EXISTS waiver_claims (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            team_id INTEGER NOT NULL,
            player_id INTEGER NOT NULL,
            drop_player_id INTEGER,
            status TEXT DEFAULT 'pending',
            waiver_priority INTEGER DEFAULT 0,
            processed_at TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (user_id) REFERENCES users(id),
            FOREIGN KEY (team_id) REFERENCES teams(id)
        );

        CREATE TABLE IF NOT EXISTS transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            team_id INTEGER NOT NULL,
            player_id INTEGER NOT NULL,
            action TEXT NOT NULL,
            details TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (team_id) REFERENCES teams(id)
        );

        CREATE TABLE IF NOT EXISTS lineups (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            team_id INTEGER NOT NULL,
            gameweek INTEGER NOT NULL,
            player_id INTEGER NOT NULL,
            is_starter INTEGER DEFAULT 0,
            FOREIGN KEY (team_id) REFERENCES teams(id),
            UNIQUE(team_id, gameweek, player_id)
        );

        CREATE TABLE IF NOT EXISTS gameweek_player_scores (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            gameweek INTEGER NOT NULL,
            player_id INTEGER NOT NULL,
            points INTEGER DEFAULT 0,
            minutes INTEGER DEFAULT 0,
            goals INTEGER DEFAULT 0,
            assists INTEGER DEFAULT 0,
            clean_sheets INTEGER DEFAULT 0,
            bonus INTEGER DEFAULT 0,
            detail TEXT,
            updated_at TEXT DEFAULT (datetime('now')),
            UNIQUE(gameweek, player_id)
        );

        CREATE TABLE IF NOT EXISTS team_gameweek_scores (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            team_id INTEGER NOT NULL,
            gameweek INTEGER NOT NULL,
            weekly_points INTEGER DEFAULT 0,
            updated_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (team_id) REFERENCES teams(id),
            UNIQUE(team_id, gameweek)
        );
        """)

        # Default league config
        defaults = {
            "league_name": ("My League", "Your league's display name"),
            "league_subtitle": ("Fantasy Football League", "Subtitle shown below the league name"),
            "salary_cap": ("100.0", "Total salary cap in millions (£)"),
            "squad_size": ("15", "Total players per team"),
            "max_gk": ("2", "Max goalkeepers"),
            "max_def": ("5", "Max defenders"),
            "max_mid": ("5", "Max midfielders"),
            "max_fwd": ("3", "Max forwards"),
            "max_per_club": ("3", "Max players from one PL club"),
            "min_starting_def": ("3", "Min defenders in starting XI"),
            "min_starting_mid": ("2", "Min midfielders in starting XI"),
            "min_starting_fwd": ("1", "Min forwards in starting XI"),
            "pts_goal_gk": ("6", "Points per goal - GK"),
            "pts_goal_def": ("6", "Points per goal - DEF"),
            "pts_goal_mid": ("5", "Points per goal - MID"),
            "pts_goal_fwd": ("4", "Points per goal - FWD"),
            "pts_assist": ("3", "Points per assist"),
            "pts_clean_sheet_gk": ("4", "Clean sheet points - GK"),
            "pts_clean_sheet_def": ("4", "Clean sheet points - DEF"),
            "pts_clean_sheet_mid": ("1", "Clean sheet points - MID"),
            "pts_save_per_3": ("1", "Points per 3 saves - GK"),
            "pts_penalty_save": ("5", "Points for penalty save"),
            "pts_defensive_contrib": ("2", "Points for defensive contributions"),
            "def_contrib_threshold_def": ("10", "CBIT threshold for defenders"),
            "def_contrib_threshold_mid_fwd": ("12", "CBIRT threshold for mid/fwd"),
            "pts_bonus_1st": ("3", "Bonus points - 1st"),
            "pts_bonus_2nd": ("2", "Bonus points - 2nd"),
            "pts_bonus_3rd": ("1", "Bonus points - 3rd"),
            "season_name": ("2025/26", "Current season name"),
            "draft_type": ("snake", "Draft type: snake or linear"),
            "draft_timer_minutes": ("5", "Minutes per draft pick before auto-pick"),
            "trade_review_period_hours": ("24", "Hours for league review after trade accepted"),
            "trade_protest_threshold": ("50", "Percent of other managers needed to block a trade"),
            "payout_entry_fee": ("50", "Entry fee per manager ($)"),
            "payout_weekly_prize": ("5", "Weekly high score prize ($)"),
            "payout_1st_pct": ("50", "1st place payout (% of season pool)"),
            "payout_2nd_pct": ("30", "2nd place payout (% of season pool)"),
            "payout_3rd_pct": ("20", "3rd place payout (% of season pool)"),
            "payout_venmo": ("", "Venmo handle for payments"),
            "payout_paypal": ("", "PayPal handle for payments"),
            "free_agency_enabled": ("0", "Enable free agency window (0=off, 1=on)"),
            "waiver_type": ("rolling", "Waiver type: rolling (inverse standings), none (first come first serve)"),
            "free_agency_day_start": ("2", "Free agency window start day (0=Mon, 6=Sun)"),
            "free_agency_day_end": ("4", "Free agency window end day (0=Mon, 6=Sun)"),
            "free_agency_hour_start": ("10", "Free agency window start hour (24h ET)"),
            "free_agency_hour_end": ("22", "Free agency window end hour (24h ET)"),
            "lineup_lock_enabled": ("1", "Lock lineups after GW deadline (0=off, 1=on)"),
            "notify_draft_pick": ("1", "Push notification when it's your turn to draft"),
            "notify_trade_proposed": ("1", "Push notification when a trade is proposed to you"),
            "notify_lineup_reminder": ("1", "Push notification to set lineup before deadline"),
            "notify_chat_message": ("1", "Push notification for new chat messages"),
            "notify_broadcast": ("1", "Push notification for admin broadcasts"),
        }
        for key, (value, desc) in defaults.items():
            db.execute(
                "INSERT OR IGNORE INTO league_config (key, value, description) VALUES (?, ?, ?)",
                (key, value, desc),
            )

        # ── Auto-migrations for existing databases ──
        migrations = [
            ("trades", "accepted_at", "TEXT"),
            ("trades", "review_expires_at", "TEXT"),
            ("users", "has_paid", "INTEGER DEFAULT 0"),
            ("users", "venmo", "TEXT"),
            ("users", "paypal", "TEXT"),
            ("roster", "club_id", "INTEGER DEFAULT 0"),
            ("roster", "season_id", "INTEGER DEFAULT 1"),
            ("lineups", "season_id", "INTEGER DEFAULT 1"),
            ("team_gameweek_scores", "season_id", "INTEGER DEFAULT 1"),
            ("draft_state", "season_id", "INTEGER DEFAULT 1"),
            ("trades", "season_id", "INTEGER DEFAULT 1"),
            ("transactions", "season_id", "INTEGER DEFAULT 1"),
            ("wishlist", "season_id", "INTEGER DEFAULT 1"),
            ("gameweek_player_scores", "season_id", "INTEGER DEFAULT 1"),
            ("draft_state", "pick_started_at", "TEXT"),
            ("draft_state", "pick_timeout_minutes", "INTEGER DEFAULT 15"),
            ("users", "auto_draft", "INTEGER DEFAULT 0"),
            ("users", "missed_picks", "INTEGER DEFAULT 0"),
            ("team_gameweek_scores", "weekly_prize_paid", "INTEGER DEFAULT 0"),
        ]
        for table, col, col_type in migrations:
            try:
                db.execute(f"ALTER TABLE {table} ADD COLUMN {col} {col_type}")
            except Exception:
                pass  # Column already exists

        # Ensure at least one season exists
        season = db.execute("SELECT id FROM seasons LIMIT 1").fetchone()
        if not season:
            db.execute("INSERT INTO seasons (name, status) VALUES ('2025/26', 'active')")

        # Seed How to Play if empty
        htp_count = db.execute("SELECT COUNT(*) as c FROM how_to_play").fetchone()["c"]
        if htp_count == 0:
            defaults = [
                (1, "Welcome to Matchday Yanks", "Welcome to the Matchday Yanks Fantasy Football League! This is a salary cap draft league based on the English Premier League. Here's everything you need to know to get started."),
                (2, "Getting Started", "1. Create your account and set up your manager profile\n2. Add your Venmo or PayPal in your Profile for payouts\n3. Pay the entry fee to the commissioner\n4. Wait for the draft to be scheduled"),
                (3, "The Draft", "The league uses a snake draft format. The draft order is randomized by the commissioner. Each round, you select one player until all rosters are full (15 players per team).\n\nDuring the draft:\n- Stay within the salary cap (£100m)\n- Follow position limits: 2 GK, 5 DEF, 5 MID, 3 FWD\n- Max 3 players from any single Premier League club\n- Use your wishlist to prepare — star players on the Players page before draft day"),
                (4, "Setting Your Lineup", "Each gameweek you set a starting XI from your 15-player squad. Your starting lineup must include:\n- 1 Goalkeeper\n- At least 3 Defenders\n- At least 2 Midfielders\n- At least 1 Forward\n\nValid formations include 3-4-3, 3-5-2, 4-3-3, 4-4-2, 4-5-1, 5-3-2, and 5-4-1.\n\nOnly your 11 starters earn points. Bench players don't count.\n\nIf you forget to set a lineup, your most recent lineup carries forward automatically."),
                (5, "Scoring", "Points are based on real Premier League performances:\n- Goals: FWD 4pts, MID 5pts, DEF/GK 6pts\n- Assists: 3pts\n- Clean sheets: GK/DEF 4pts, MID 1pt\n- Saves: 1pt per 3 saves (GK only)\n- Penalty save: 5pts\n- Bonus points awarded to top 3 BPS performers per match\n\nCheck the Rules & Scoring page for the full breakdown."),
                (6, "Free Agency & Waivers", "After the draft, you can add free agent players and drop players from your roster. Depending on league settings, free agency may be restricted to a weekly window (check the Rules page for current settings).\n\nAll adds and drops must keep you within the salary cap and position limits."),
                (7, "Trades", "You can trade players with other managers. Here's how it works:\n1. Go to the Trades page and select a team to trade with\n2. Click to select players you're offering and requesting\n3. The other manager accepts or rejects\n4. If accepted, the trade enters a league review period\n5. Other managers can protest during the review window\n6. If enough protests are filed, the trade is vetoed\n7. Otherwise it processes automatically when the review period ends"),
                (8, "Weekly Prizes & Payouts", "The highest-scoring team each gameweek wins a weekly prize. At the end of the season, the remaining prize pool is split among the top finishers.\n\nCheck the Rules & Scoring page for current payout amounts and payment info."),
                (9, "Tips for New Managers", "- Check player injury status before setting your lineup\n- Use FotMob links (click any player name) for detailed real-world stats\n- Watch the salary cap — don't blow your budget on a few stars\n- Diversify across clubs — the 3-per-club rule forces smart roster building\n- Set your lineup early in the week so you don't forget\n- Check the Scoring page to see how your rivals are doing"),
            ]
            for order, title, body in defaults:
                db.execute("INSERT INTO how_to_play (section_order, title, body) VALUES (?, ?, ?)", (order, title, body))


def get_active_season_id(db) -> int:
    """Get the active season ID."""
    row = db.execute("SELECT id FROM seasons WHERE status='active' ORDER BY id DESC LIMIT 1").fetchone()
    return row["id"] if row else 1


def ensure_vapid_keys():
    """Generate VAPID keys if they don't exist."""
    data_dir = os.path.dirname(os.path.abspath(DB_PATH)) if os.path.dirname(DB_PATH) else "."
    priv_path = os.path.join(data_dir, "vapid_private.pem")
    pub_path = os.path.join(data_dir, "vapid_public.pem")
    
    if os.path.exists(priv_path) and os.path.exists(pub_path):
        return
    try:
        from py_vapid import Vapid
        vapid = Vapid()
        vapid.generate_keys()
        vapid.save_key(priv_path)
        vapid.save_public_key(pub_path)
        logger.info(f"Generated new VAPID keys in {data_dir}")
    except Exception as e:
        logger.error(f"Failed to generate VAPID keys: {e}")


def get_vapid_public_key() -> str:
    """Read the VAPID public key for client subscription."""
    import base64
    data_dir = os.path.dirname(os.path.abspath(DB_PATH)) if os.path.dirname(DB_PATH) else "."
    priv_path = os.path.join(data_dir, "vapid_private.pem")
    try:
        from py_vapid import Vapid
        vapid = Vapid.from_file(priv_path)
        raw = vapid.public_key.public_bytes(
            serialization.Encoding.X962,
            serialization.PublicFormat.UncompressedPoint
        )
        return base64.urlsafe_b64encode(raw).rstrip(b'=').decode()
    except Exception as e:
        logger.error(f"Failed to read VAPID public key: {e}")
        return ""


def send_push_notification(user_id: int, title: str, body: str, url: str = "/dashboard", notify_type: str = None):
    """Send a push notification to all subscriptions for a user."""
    try:
        # Check if this notification type is enabled
        if notify_type:
            with get_db() as db:
                enabled = get_config_val(db, f"notify_{notify_type}")
                if enabled == "0":
                    return

        from pywebpush import webpush
        data_dir = os.path.dirname(os.path.abspath(DB_PATH)) if os.path.dirname(DB_PATH) else "."
        priv_path = os.path.join(data_dir, "vapid_private.pem")
        
        with get_db() as db:
            subs = db.execute("SELECT * FROM push_subscriptions WHERE user_id=?", (user_id,)).fetchall()
        if not subs or not os.path.exists(priv_path):
            logger.warning(f"Push skipped for user {user_id}: {'no subs' if not subs else 'no VAPID key'}")
            return

        payload = json.dumps({"title": title, "body": body, "url": url})
        for sub in subs:
            try:
                webpush(
                    subscription_info={
                        "endpoint": sub["endpoint"],
                        "keys": {"p256dh": sub["p256dh"], "auth": sub["auth"]},
                    },
                    data=payload,
                    vapid_private_key=priv_path,
                    vapid_claims={"sub": VAPID_CLAIMS_EMAIL},
                )
                logger.info(f"Push sent to user {user_id}")
            except Exception as e:
                if "410" in str(e) or "404" in str(e):
                    with get_db() as db:
                        db.execute("DELETE FROM push_subscriptions WHERE id=?", (sub["id"],))
                logger.error(f"Push failed for user {user_id}: {e}")
    except Exception as e:
        logger.error(f"Push notification error: {e}")


# ── Auth helpers ────────────────────────────────────────────────────────
def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    h = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 100_000)
    return f"{salt}:{h.hex()}"


def verify_password(password: str, password_hash: str) -> bool:
    salt, h = password_hash.split(":")
    return hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 100_000).hex() == h


def create_token(user_id: int, is_admin: bool = False, hours: int = 24 * 30) -> str:
    return jwt.encode(
        {"sub": str(user_id), "admin": is_admin, "exp": datetime.now(timezone.utc) + timedelta(hours=hours)},
        SECRET_KEY,
        algorithm="HS256",
    )


def get_current_user(creds: HTTPAuthorizationCredentials = Depends(security)):
    if not creds:
        raise HTTPException(401, "Not authenticated")
    try:
        payload = jwt.decode(creds.credentials, SECRET_KEY, algorithms=["HS256"])
        payload["sub"] = int(payload["sub"])
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Invalid token")


def require_admin(user=Depends(get_current_user)):
    if not user.get("admin"):
        raise HTTPException(403, "Admin access required")
    return user


# ── FPL data cache ─────────────────────────────────────────────────────
async def get_fpl_data():
    """Fetch and cache FPL bootstrap data."""
    if os.path.exists(FPL_CACHE_FILE):
        mtime = os.path.getmtime(FPL_CACHE_FILE)
        if datetime.now().timestamp() - mtime < FPL_CACHE_TTL:
            with open(FPL_CACHE_FILE) as f:
                return json.load(f)
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(FPL_BOOTSTRAP_URL, timeout=30)
            resp.raise_for_status()
            data = resp.json()
            with open(FPL_CACHE_FILE, "w") as f:
                json.dump(data, f)
            return data
    except Exception:
        if os.path.exists(FPL_CACHE_FILE):
            with open(FPL_CACHE_FILE) as f:
                return json.load(f)
        raise HTTPException(503, "Cannot fetch FPL data and no cache available")


def parse_players(fpl_data: dict) -> list[dict]:
    """Transform FPL bootstrap data into our player format."""
    teams = {t["id"]: t for t in fpl_data.get("teams", [])}
    pos_map = {1: "GK", 2: "DEF", 3: "MID", 4: "FWD"}
    players = []
    for p in fpl_data.get("elements", []):
        team = teams.get(p["team"], {})
        players.append({
            "id": p["id"],
            "name": f"{p['first_name']} {p['second_name']}",
            "web_name": p["web_name"],
            "position": pos_map.get(p["element_type"], "?"),
            "club": team.get("short_name", "???"),
            "club_name": team.get("name", "Unknown"),
            "club_id": p["team"],
            "salary": p["now_cost"] / 10,  # FPL stores in tenths
            "total_points": p["total_points"],
            "form": p.get("form", "0.0"),
            "minutes": p.get("minutes", 0),
            "goals": p.get("goals_scored", 0),
            "assists": p.get("assists", 0),
            "clean_sheets": p.get("clean_sheets", 0),
            "status": p.get("status", "a"),  # a=available, d=doubtful, i=injured, s=suspended, u=unavailable
            "injury_news": p.get("news", ""),
            "photo": f"https://resources.premierleague.com/premierleague/photos/players/110x140/p{p.get('photo', '').replace('.jpg', '')}.png",
            "selected_by_percent": p.get("selected_by_percent", "0"),
        })
    return players


# ── Pydantic models ────────────────────────────────────────────────────
class RegisterRequest(BaseModel):
    email: str
    username: str
    password: str

class LoginRequest(BaseModel):
    email: str
    password: str

class PasswordResetRequest(BaseModel):
    email: str

class PasswordResetConfirm(BaseModel):
    token: str
    new_password: str

class TeamCreate(BaseModel):
    name: str

class DraftPick(BaseModel):
    player_id: int

class TradeProposal(BaseModel):
    to_team_id: int
    offering_player_ids: list[int]
    requesting_player_ids: list[int]

class DropPlayer(BaseModel):
    player_id: int

class AddPlayer(BaseModel):
    player_id: int

class WishlistUpdate(BaseModel):
    player_id: int
    priority: Optional[int] = 0

class ConfigUpdate(BaseModel):
    key: str
    value: str

class SetLineup(BaseModel):
    gameweek: int
    starters: list[int]

class SeasonStart(BaseModel):
    name: str = "2026/27"

class ChatMessage(BaseModel):
    message: str

class DraftQueueUpdate(BaseModel):
    player_ids: list[int]  # ordered list of player IDs

class WaiverClaim(BaseModel):
    player_id: int
    drop_player_id: int = None  # optional player to drop to make room  # list of player_ids (exactly 11)

class AnnouncementCreate(BaseModel):
    title: str
    body: str

class AnnouncementUpdate(BaseModel):
    title: Optional[str] = None
    body: Optional[str] = None

class ProfileUpdate(BaseModel):
    email: Optional[str] = None
    username: Optional[str] = None
    password: Optional[str] = None
    venmo: Optional[str] = None
    paypal: Optional[str] = None

class AdminUserPaymentInfo(BaseModel):
    venmo: Optional[str] = None
    paypal: Optional[str] = None


# ── Startup ─────────────────────────────────────────────────────────────
@app.on_event("startup")
async def startup():
    init_db()
    ensure_vapid_keys()
    global _scheduler_task
    _scheduler_task = asyncio.create_task(score_scheduler())
    asyncio.create_task(hourly_scheduler())
    asyncio.create_task(refresh_roster_club_ids())
    logger.info("Score auto-refresh scheduler started (hourly)")


async def refresh_roster_club_ids():
    """Sync roster.club_id with each player's current FPL club.

    club_id is captured once at acquisition time and never updated, so a
    mid-season transfer leaves the stored value stale even though the rest
    of the app (Players page, roster displays) shows the player's live
    club. This keeps them in sync and fills in any missing values.
    """
    try:
        fpl_data = await get_fpl_data()
        players = {p["id"]: p for p in parse_players(fpl_data)}
        with get_db() as db:
            rows = db.execute("SELECT id, player_id, club_id FROM roster").fetchall()
            updated = 0
            for r in rows:
                p = players.get(r["player_id"])
                if p and p["club_id"] != r["club_id"]:
                    db.execute("UPDATE roster SET club_id=? WHERE id=?", (p["club_id"], r["id"]))
                    updated += 1
            if updated:
                logger.info(f"Synced club_id for {updated} roster entries")
    except Exception as e:
        logger.error(f"Club ID refresh failed: {e}")


# ── Auth endpoints ──────────────────────────────────────────────────────
@app.post("/api/auth/register")
def register(req: RegisterRequest):
    with get_db() as db:
        if db.execute("SELECT id FROM users WHERE email=?", (req.email,)).fetchone():
            raise HTTPException(400, "Email already registered")
        if db.execute("SELECT id FROM users WHERE username=?", (req.username,)).fetchone():
            raise HTTPException(400, "Username taken")
        # First user is admin
        count = db.execute("SELECT COUNT(*) as c FROM users").fetchone()["c"]
        is_admin = 1 if count == 0 else 0
        db.execute(
            "INSERT INTO users (email, username, password_hash, is_admin) VALUES (?, ?, ?, ?)",
            (req.email, req.username, hash_password(req.password), is_admin),
        )
        user_id = db.execute("SELECT last_insert_rowid()").fetchone()[0]
    return {"token": create_token(user_id, bool(is_admin)), "is_admin": bool(is_admin), "username": req.username}


@app.post("/api/auth/login")
def login(req: LoginRequest):
    with get_db() as db:
        user = db.execute("SELECT * FROM users WHERE email=?", (req.email,)).fetchone()
        if not user or not verify_password(req.password, user["password_hash"]):
            raise HTTPException(401, "Invalid credentials")
        if not user["is_active"]:
            raise HTTPException(403, "Account disabled")
    return {
        "token": create_token(user["id"], bool(user["is_admin"])),
        "is_admin": bool(user["is_admin"]),
        "username": user["username"],
    }


@app.post("/api/auth/request-reset")
def request_password_reset(req: PasswordResetRequest):
    token = secrets.token_urlsafe(32)
    expires = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()
    with get_db() as db:
        result = db.execute(
            "UPDATE users SET reset_token=?, reset_token_expires=? WHERE email=?",
            (token, expires, req.email),
        )
        if result.rowcount == 0:
            # Don't reveal whether email exists
            return {"message": "If that email is registered, a reset link has been generated."}
    # In production: send email. For now, return token directly (for admin to share).
    return {"message": "Reset token generated.", "reset_token": token}


@app.post("/api/auth/reset-password")
def reset_password(req: PasswordResetConfirm):
    with get_db() as db:
        user = db.execute(
            "SELECT * FROM users WHERE reset_token=?", (req.token,)
        ).fetchone()
        if not user:
            raise HTTPException(400, "Invalid reset token")
        if datetime.fromisoformat(user["reset_token_expires"]) < datetime.now(timezone.utc):
            raise HTTPException(400, "Reset token expired")
        db.execute(
            "UPDATE users SET password_hash=?, reset_token=NULL, reset_token_expires=NULL WHERE id=?",
            (hash_password(req.new_password), user["id"]),
        )
    return {"message": "Password reset successful"}


@app.get("/api/auth/me")
def get_me(user=Depends(get_current_user)):
    with get_db() as db:
        u = db.execute("SELECT id, email, username, is_admin, venmo, paypal FROM users WHERE id=?", (user["sub"],)).fetchone()
        if not u:
            raise HTTPException(404, "User not found")
    return dict(u)


@app.put("/api/auth/profile")
def update_profile(req: ProfileUpdate, user=Depends(get_current_user)):
    with get_db() as db:
        u = db.execute("SELECT * FROM users WHERE id=?", (user["sub"],)).fetchone()
        if not u:
            raise HTTPException(404, "User not found")

        if req.email and req.email != u["email"]:
            existing = db.execute("SELECT id FROM users WHERE email=? AND id!=?", (req.email, user["sub"])).fetchone()
            if existing:
                raise HTTPException(400, "Email already in use")
            db.execute("UPDATE users SET email=? WHERE id=?", (req.email, user["sub"]))

        if req.username and req.username != u["username"]:
            existing = db.execute("SELECT id FROM users WHERE username=? AND id!=?", (req.username, user["sub"])).fetchone()
            if existing:
                raise HTTPException(400, "Username already taken")
            db.execute("UPDATE users SET username=? WHERE id=?", (req.username, user["sub"]))

        if req.password:
            db.execute("UPDATE users SET password_hash=? WHERE id=?", (hash_password(req.password), user["sub"]))

        if req.venmo is not None:
            db.execute("UPDATE users SET venmo=? WHERE id=?", (req.venmo, user["sub"]))

        if req.paypal is not None:
            db.execute("UPDATE users SET paypal=? WHERE id=?", (req.paypal, user["sub"]))

    return {"message": "Profile updated"}


# ── Player data endpoints ──────────────────────────────────────────────
@app.get("/api/players")
async def list_players(position: Optional[str] = None, club: Optional[str] = None, search: Optional[str] = None, gameweek: Optional[int] = None):
    fpl_data = await get_fpl_data()
    players = parse_players(fpl_data)
    if position:
        players = [p for p in players if p["position"] == position.upper()]
    if club:
        players = [p for p in players if p["club"].lower() == club.lower()]
    if search:
        s = search.lower()
        players = [p for p in players if s in p["name"].lower() or s in p["web_name"].lower()]

    # Add owner info
    with get_db() as db:
        roster_rows = db.execute("""
            SELECT r.player_id, t.name as team_name
            FROM roster r JOIN teams t ON t.id = r.team_id
        """).fetchall()
        owner_map = {r["player_id"]: r["team_name"] for r in roster_rows}

        # Add GW scores if requested
        gw_score_map = {}
        if gameweek:
            scores = db.execute(
                "SELECT player_id, points, minutes, goals, assists, clean_sheets, bonus FROM gameweek_player_scores WHERE gameweek=?",
                (gameweek,)
            ).fetchall()
            gw_score_map = {s["player_id"]: dict(s) for s in scores}

    for p in players:
        p["owner"] = owner_map.get(p["id"])
        if gameweek:
            gw = gw_score_map.get(p["id"], {})
            p["gw_points"] = gw.get("points", 0)
            p["gw_minutes"] = gw.get("minutes", 0)
            p["gw_goals"] = gw.get("goals", 0)
            p["gw_assists"] = gw.get("assists", 0)
            p["gw_clean_sheets"] = gw.get("clean_sheets", 0)
            p["gw_bonus"] = gw.get("bonus", 0)

    return {"players": players, "count": len(players)}


@app.get("/api/players/{player_id}")
async def get_player(player_id: int):
    fpl_data = await get_fpl_data()
    players = parse_players(fpl_data)
    for p in players:
        if p["id"] == player_id:
            return p
    raise HTTPException(404, "Player not found")


@app.get("/api/clubs")
async def list_clubs():
    fpl_data = await get_fpl_data()
    return {"clubs": fpl_data.get("teams", [])}


# ── Wishlist ───────────────────────────────────────────────────────────
@app.get("/api/wishlist")
async def get_wishlist(user=Depends(get_current_user)):
    with get_db() as db:
        rows = db.execute(
            "SELECT player_id, priority FROM wishlist WHERE user_id=? ORDER BY priority DESC, added_at",
            (user["sub"],)
        ).fetchall()
    fpl_data = await get_fpl_data()
    all_players = {p["id"]: p for p in parse_players(fpl_data)}
    result = []
    for r in rows:
        p = all_players.get(r["player_id"])
        if p:
            result.append({**p, "priority": r["priority"]})
    return {"wishlist": result, "player_ids": [r["player_id"] for r in rows]}


@app.post("/api/wishlist")
def add_to_wishlist(req: WishlistUpdate, user=Depends(get_current_user)):
    with get_db() as db:
        try:
            db.execute(
                "INSERT INTO wishlist (user_id, player_id, priority) VALUES (?, ?, ?)",
                (user["sub"], req.player_id, req.priority)
            )
        except Exception:
            raise HTTPException(400, "Player already on wishlist")
    return {"message": "Added to wishlist"}


@app.delete("/api/wishlist/{player_id}")
def remove_from_wishlist(player_id: int, user=Depends(get_current_user)):
    with get_db() as db:
        db.execute("DELETE FROM wishlist WHERE user_id=? AND player_id=?", (user["sub"], player_id))
    return {"message": "Removed from wishlist"}


@app.put("/api/wishlist/{player_id}/priority")
def update_wishlist_priority(player_id: int, req: WishlistUpdate, user=Depends(get_current_user)):
    with get_db() as db:
        db.execute(
            "UPDATE wishlist SET priority=? WHERE user_id=? AND player_id=?",
            (req.priority, user["sub"], player_id)
        )
    return {"message": "Priority updated"}


# ── FotMob Integration ──────────────────────────────────────────────────
FOTMOB_SEARCH_URL = "https://apigw.fotmob.com/searchapi/suggest?hits=50&lang=en&term={term}"


async def fotmob_search(term: str) -> list:
    """Search FotMob's suggest API for players."""
    try:
        url = FOTMOB_SEARCH_URL.format(term=term.replace(" ", "+"))
        async with httpx.AsyncClient() as client:
            resp = await client.get(url, timeout=10, headers={
                "User-Agent": "Mozilla/5.0",
                "Accept": "application/json",
            })
            resp.raise_for_status()
            data = resp.json()
            players = []
            for section in data if isinstance(data, list) else [data]:
                if isinstance(section, dict):
                    for suggest in section.get("squadMemberSuggest", []):
                        for option in suggest.get("options", []):
                            payload = option.get("payload", {})
                            text = option.get("text", "")
                            name = text.split("|")[0].strip() if "|" in text else text
                            if payload.get("id"):
                                payload["name"] = name
                                players.append(payload)
            return players
    except Exception as e:
        logger.error(f"FotMob search failed for '{term}': {e}")
        return []


async def fotmob_search_teams(term: str) -> list:
    """Search FotMob for teams."""
    try:
        url = FOTMOB_SEARCH_URL.format(term=term.replace(" ", "+"))
        async with httpx.AsyncClient() as client:
            resp = await client.get(url, timeout=10, headers={
                "User-Agent": "Mozilla/5.0",
                "Accept": "application/json",
            })
            resp.raise_for_status()
            data = resp.json()
            teams = []
            for section in data if isinstance(data, list) else [data]:
                if isinstance(section, dict):
                    for suggest in section.get("teamSuggest", []):
                        for option in suggest.get("options", []):
                            payload = option.get("payload", {})
                            text = option.get("text", "")
                            name = text.split("|")[0].strip() if "|" in text else text
                            if payload.get("id"):
                                payload["name"] = name
                                teams.append(payload)
            return teams
    except Exception as e:
        logger.error(f"FotMob team search failed for '{term}': {e}")
        return []


def slugify(name: str) -> str:
    """Convert a name to a URL slug."""
    import re
    s = name.lower().strip()
    s = re.sub(r'[^a-z0-9\s-]', '', s)
    s = re.sub(r'[\s]+', '-', s)
    return s


@app.get("/api/fotmob/player/{fpl_player_id}")
async def get_fotmob_player(fpl_player_id: int):
    """Get FotMob URL for a player. Returns cached result or searches FotMob."""
    # Check cache first
    with get_db() as db:
        cached = db.execute(
            "SELECT fotmob_id, fotmob_slug FROM fotmob_cache WHERE fpl_player_id=?",
            (fpl_player_id,)
        ).fetchone()
        if cached and cached["fotmob_id"]:
            return {
                "url": f"https://www.fotmob.com/players/{cached['fotmob_id']}/{cached['fotmob_slug']}",
                "fotmob_id": cached["fotmob_id"],
                "cached": True,
            }

    # Look up player name from FPL
    fpl_data = await get_fpl_data()
    all_players = {p["id"]: p for p in parse_players(fpl_data)}
    player = all_players.get(fpl_player_id)
    if not player:
        raise HTTPException(404, "Player not found")

    # Search FotMob
    results = await fotmob_search(player["name"])
    if not results:
        # Try with just last name
        results = await fotmob_search(player["web_name"])

    # Match by name similarity and team
    best = None
    player_club = player.get("club_name", "").lower()
    for r in results:
        r_name = r.get("name", "").lower()
        r_team = r.get("teamName", r.get("squad", "")).lower()
        # Check if names match reasonably
        if (player["web_name"].lower() in r_name or
            player["name"].lower() == r_name or
            r_name in player["name"].lower()):
            # Prefer team match
            if player_club and player_club in r_team or r_team in player_club:
                best = r
                break
            elif not best:
                best = r

    if best:
        fotmob_id = best.get("id")
        fotmob_slug = slugify(best.get("name", ""))
        # Cache it
        with get_db() as db:
            db.execute("""
                INSERT OR REPLACE INTO fotmob_cache (fpl_player_id, fotmob_id, fotmob_slug, updated_at)
                VALUES (?, ?, ?, datetime('now'))
            """, (fpl_player_id, fotmob_id, fotmob_slug))

        return {
            "url": f"https://www.fotmob.com/players/{fotmob_id}/{fotmob_slug}",
            "fotmob_id": fotmob_id,
            "cached": False,
        }

    return {"url": f"https://www.google.com/search?q=fotmob+{player['name'].replace(' ', '+')}", "fotmob_id": None, "cached": False}


@app.get("/api/fotmob/team/{club_name}")
async def get_fotmob_team(club_name: str):
    """Get FotMob URL for a team."""
    with get_db() as db:
        cached = db.execute(
            "SELECT fotmob_team_id, fotmob_team_slug FROM fotmob_cache WHERE fotmob_team_slug=? LIMIT 1",
            (club_name.lower(),)
        ).fetchone()
        if cached and cached["fotmob_team_id"]:
            return {"url": f"https://www.fotmob.com/teams/{cached['fotmob_team_id']}/{cached['fotmob_team_slug']}"}

    results = await fotmob_search_teams(club_name)
    for r in results:
        if club_name.lower() in r.get("name", "").lower() or r.get("name", "").lower() in club_name.lower():
            team_id = r.get("id")
            team_slug = slugify(r.get("name", ""))
            return {"url": f"https://www.fotmob.com/teams/{team_id}/{team_slug}"}

    return {"url": f"https://www.google.com/search?q=fotmob+{club_name.replace(' ', '+')}"}


@app.post("/api/fotmob/bulk-lookup")
async def bulk_fotmob_lookup(all_players_flag: bool = True):
    """Pre-cache FotMob IDs for all players (or just rostered ones)."""
    fpl_data = await get_fpl_data()
    all_fpl = {p["id"]: p for p in parse_players(fpl_data)}

    with get_db() as db:
        cached = db.execute("SELECT fpl_player_id FROM fotmob_cache WHERE fotmob_id IS NOT NULL").fetchall()
        cached_ids = {r["fpl_player_id"] for r in cached}

        if all_players_flag:
            to_lookup = [pid for pid in all_fpl.keys() if pid not in cached_ids]
        else:
            rostered = db.execute("SELECT DISTINCT player_id FROM roster").fetchall()
            to_lookup = [r["player_id"] for r in rostered if r["player_id"] not in cached_ids]

    found = 0
    total = len(to_lookup)
    for i, pid in enumerate(to_lookup):
        try:
            result = await get_fotmob_player(pid)
            if result.get("fotmob_id"):
                found += 1
            if (i + 1) % 50 == 0:
                logger.info(f"FotMob bulk lookup: {i + 1}/{total} processed, {found} found")
            await asyncio.sleep(0.3)  # Rate limit
        except Exception:
            pass

    logger.info(f"FotMob bulk lookup complete: {total} looked up, {found} found")
    return {"looked_up": total, "found": found}


# ── Fixtures & Schedule ─────────────────────────────────────────────────
FPL_FIXTURES_URL = "https://fantasy.premierleague.com/api/fixtures/"
FIXTURES_CACHE_FILE = "fixtures_cache.json"


async def get_fixtures():
    """Fetch and cache FPL fixtures data."""
    if os.path.exists(FIXTURES_CACHE_FILE):
        mtime = os.path.getmtime(FIXTURES_CACHE_FILE)
        if datetime.now().timestamp() - mtime < FPL_CACHE_TTL:
            with open(FIXTURES_CACHE_FILE) as f:
                return json.load(f)
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(FPL_FIXTURES_URL, timeout=30)
            resp.raise_for_status()
            data = resp.json()
            with open(FIXTURES_CACHE_FILE, "w") as f:
                json.dump(data, f)
            return data
    except Exception:
        if os.path.exists(FIXTURES_CACHE_FILE):
            with open(FIXTURES_CACHE_FILE) as f:
                return json.load(f)
        raise HTTPException(503, "Cannot fetch fixtures and no cache available")


@app.get("/api/schedule")
async def get_schedule():
    """Return gameweeks with fixtures, team names, and scores."""
    fpl_data = await get_fpl_data()
    fixtures = await get_fixtures()

    teams = {t["id"]: t for t in fpl_data.get("teams", [])}
    events = fpl_data.get("events", [])

    gameweeks = []
    for ev in events:
        gw_fixtures = []
        for f in fixtures:
            if f.get("event") == ev["id"]:
                home = teams.get(f["team_h"], {})
                away = teams.get(f["team_a"], {})
                gw_fixtures.append({
                    "id": f["id"],
                    "kickoff": f.get("kickoff_time"),
                    "finished": f.get("finished", False) or f.get("finished_provisional", False),
                    "started": f.get("started", False),
                    "home_team": home.get("name", "TBD"),
                    "home_short": home.get("short_name", "TBD"),
                    "home_score": f.get("team_h_score"),
                    "away_team": away.get("name", "TBD"),
                    "away_short": away.get("short_name", "TBD"),
                    "away_score": f.get("team_a_score"),
                    "minutes": f.get("minutes", 0),
                })
        gameweeks.append({
            "id": ev["id"],
            "name": ev.get("name", f"Gameweek {ev['id']}"),
            "deadline": ev.get("deadline_time"),
            "finished": ev.get("finished", False),
            "is_current": ev.get("is_current", False),
            "is_next": ev.get("is_next", False),
            "fixtures": gw_fixtures,
        })

    return {"gameweeks": gameweeks}


# ── League config ──────────────────────────────────────────────────────
@app.get("/api/config")
def get_config():
    with get_db() as db:
        rows = db.execute("SELECT key, value, description FROM league_config").fetchall()
    return {r["key"]: {"value": r["value"], "description": r["description"]} for r in rows}


@app.put("/api/config")
def update_config(updates: list[ConfigUpdate], _=Depends(require_admin)):
    with get_db() as db:
        for u in updates:
            db.execute("UPDATE league_config SET value=? WHERE key=?", (u.value, u.key))
    return {"message": "Config updated"}


# ── Team management ────────────────────────────────────────────────────
def get_config_val(db, key: str) -> str:
    row = db.execute("SELECT value FROM league_config WHERE key=?", (key,)).fetchone()
    return row["value"] if row else ""


def validate_roster(db, team_id: int, adding_player: dict = None, dropping_player_id: int = None):
    """Validate roster meets all rules. Returns error message or None."""
    roster = db.execute("SELECT * FROM roster WHERE team_id=?", (team_id,)).fetchall()
    roster_list = [dict(r) for r in roster]

    if dropping_player_id:
        roster_list = [r for r in roster_list if r["player_id"] != dropping_player_id]
    if adding_player:
        roster_list.append({
            "player_id": adding_player["id"],
            "position": adding_player["position"],
            "salary": adding_player["salary"],
            "club_id": adding_player.get("club_id", 0),
        })

    cap = float(get_config_val(db, "salary_cap"))
    total_salary = sum(r["salary"] for r in roster_list)
    if total_salary > cap:
        return f"Exceeds salary cap (£{total_salary:.1f}m / £{cap:.1f}m)"

    max_size = int(get_config_val(db, "squad_size"))
    if len(roster_list) > max_size:
        return f"Exceeds squad size limit ({len(roster_list)}/{max_size})"

    pos_counts = {"GK": 0, "DEF": 0, "MID": 0, "FWD": 0}
    for r in roster_list:
        pos_counts[r["position"]] = pos_counts.get(r["position"], 0) + 1

    limits = {
        "GK": int(get_config_val(db, "max_gk")),
        "DEF": int(get_config_val(db, "max_def")),
        "MID": int(get_config_val(db, "max_mid")),
        "FWD": int(get_config_val(db, "max_fwd")),
    }
    for pos, count in pos_counts.items():
        if count > limits.get(pos, 99):
            return f"Too many {pos}s ({count}/{limits[pos]})"

    max_club = int(get_config_val(db, "max_per_club"))
    club_counts = {}
    for r in roster_list:
        cid = r.get("club_id")
        if cid:
            club_counts[cid] = club_counts.get(cid, 0) + 1
    over_club = next((cid for cid, count in club_counts.items() if count > max_club), None)
    if over_club is not None:
        return f"Too many players from that club ({club_counts[over_club]}/{max_club})"

    return None


@app.post("/api/teams")
def create_team(req: TeamCreate, user=Depends(get_current_user)):
    with get_db() as db:
        existing = db.execute("SELECT id FROM teams WHERE user_id=?", (user["sub"],)).fetchone()
        if existing:
            raise HTTPException(400, "You already have a team")
        db.execute("INSERT INTO teams (user_id, name) VALUES (?, ?)", (user["sub"], req.name))
        team_id = db.execute("SELECT last_insert_rowid()").fetchone()[0]
    return {"id": team_id, "name": req.name}


@app.put("/api/teams/mine/name")
def rename_team(req: TeamCreate, user=Depends(get_current_user)):
    """Rename your team."""
    with get_db() as db:
        team = db.execute("SELECT id FROM teams WHERE user_id=?", (user["sub"],)).fetchone()
        if not team:
            raise HTTPException(404, "No team found")
        db.execute("UPDATE teams SET name=? WHERE id=?", (req.name, team["id"]))
    return {"message": f"Team renamed to {req.name}"}


@app.post("/api/teams/mine/logo")
async def upload_team_logo(file: UploadFile = File(...), user=Depends(get_current_user)):
    """Upload a team logo."""
    if not file.content_type.startswith("image/"):
        raise HTTPException(400, "File must be an image")
    contents = await file.read()
    if len(contents) > 5 * 1024 * 1024:
        raise HTTPException(400, "Image must be under 5MB")
    with get_db() as db:
        team = db.execute("SELECT id FROM teams WHERE user_id=?", (user["sub"],)).fetchone()
        if not team:
            raise HTTPException(404, "No team found")
    data_dir = os.path.dirname(os.path.abspath(DB_PATH)) if os.path.dirname(DB_PATH) else "."
    logo_dir = os.path.join(data_dir, "team_logos")
    os.makedirs(logo_dir, exist_ok=True)
    ext = file.filename.rsplit(".", 1)[-1] if "." in file.filename else "png"
    path = os.path.join(logo_dir, f"team_{team['id']}.{ext}")
    # Remove old logo with different extension
    for old in os.listdir(logo_dir):
        if old.startswith(f"team_{team['id']}."):
            os.remove(os.path.join(logo_dir, old))
    with open(path, "wb") as f:
        f.write(contents)
    return {"message": "Team logo uploaded"}


@app.get("/api/teams/{team_id}/logo")
async def get_team_logo(team_id: int):
    """Serve a team's logo."""
    from fastapi.responses import FileResponse
    data_dir = os.path.dirname(os.path.abspath(DB_PATH)) if os.path.dirname(DB_PATH) else "."
    logo_dir = os.path.join(data_dir, "team_logos")
    if os.path.exists(logo_dir):
        for fname in os.listdir(logo_dir):
            if fname.startswith(f"team_{team_id}."):
                return FileResponse(os.path.join(logo_dir, fname))
    raise HTTPException(404, "No team logo")


@app.get("/api/teams")
def list_teams(user=Depends(get_current_user)):
    with get_db() as db:
        teams = db.execute("""
            SELECT t.id, t.name, u.username,
                   COALESCE(SUM(r.salary), 0) as total_salary,
                   COUNT(r.id) as player_count
            FROM teams t
            JOIN users u ON t.user_id = u.id
            LEFT JOIN roster r ON r.team_id = t.id
            WHERE u.is_active = 1
            GROUP BY t.id
        """).fetchall()
    return {"teams": [dict(t) for t in teams]}


@app.get("/api/teams/mine")
async def get_my_team(user=Depends(get_current_user)):
    with get_db() as db:
        team = db.execute("""
            SELECT t.*, u.has_paid FROM teams t JOIN users u ON t.user_id = u.id
            WHERE t.user_id=?
        """, (user["sub"],)).fetchone()
        if not team:
            raise HTTPException(404, "No team found. Create one first.")
        roster = db.execute("SELECT * FROM roster WHERE team_id=?", (team["id"],)).fetchall()
        cap = float(get_config_val(db, "salary_cap"))

    fpl_data = await get_fpl_data()
    all_players = {p["id"]: p for p in parse_players(fpl_data)}
    enriched = []
    for r in roster:
        player_info = all_players.get(r["player_id"], {})
        enriched.append({**dict(r), **player_info})

    total_salary = sum(r["salary"] for r in roster)
    team_dict = dict(team)
    team_dict["paid"] = bool(team_dict.pop("has_paid", 0))
    return {
        "team": team_dict,
        "roster": enriched,
        "salary_cap": cap,
        "salary_used": total_salary,
        "salary_remaining": cap - total_salary,
    }


@app.post("/api/teams/mine/add")
async def add_player_to_team(req: AddPlayer, user=Depends(get_current_user)):
    fpl_data = await get_fpl_data()
    all_players = {p["id"]: p for p in parse_players(fpl_data)}
    player = all_players.get(req.player_id)
    if not player:
        raise HTTPException(404, "Player not found")

    with get_db() as db:
        # Check if draft has been completed
        draft = db.execute("SELECT status FROM draft_state ORDER BY id DESC LIMIT 1").fetchone()
        if not draft or draft["status"] != "completed":
            raise HTTPException(400, "Free agent pickups are locked until the draft is complete")

        # Check if rolling waivers are active
        waiver_type = get_config_val(db, "waiver_type") or "none"
        fa_enabled = get_config_val(db, "free_agency_enabled") == "1"
        if waiver_type == "rolling" and fa_enabled:
            raise HTTPException(400, "Rolling waivers are active — submit a waiver claim instead of adding directly")

        # Free agency window check
        if fa_enabled:
            from datetime import timezone as tz
            now = datetime.now(tz.utc)
            # Convert to ET (UTC-4 during EDT, UTC-5 during EST — approximate with UTC-4)
            import zoneinfo
            try:
                et = now.astimezone(zoneinfo.ZoneInfo("America/New_York"))
            except Exception:
                et = now.replace(tzinfo=None) - timedelta(hours=4)
            day = et.weekday()  # 0=Mon
            hour = et.hour
            day_start = int(get_config_val(db, "free_agency_day_start") or "2")
            day_end = int(get_config_val(db, "free_agency_day_end") or "4")
            hour_start = int(get_config_val(db, "free_agency_hour_start") or "10")
            hour_end = int(get_config_val(db, "free_agency_hour_end") or "22")

            day_names = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
            in_window = day_start <= day <= day_end
            if in_window and day == day_start and hour < hour_start:
                in_window = False
            if in_window and day == day_end and hour >= hour_end:
                in_window = False
            if not in_window:
                raise HTTPException(400,
                    f"Free agency is closed. Window: {day_names[day_start]}-{day_names[day_end]}, {hour_start}:00-{hour_end}:00 ET")

        season_id = get_active_season_id(db)
        team = db.execute("SELECT id FROM teams WHERE user_id=?", (user["sub"],)).fetchone()
        if not team:
            raise HTTPException(404, "No team found")

        # Check if already rostered by someone in this season
        taken = db.execute("SELECT t.name FROM roster r JOIN teams t ON t.id=r.team_id WHERE r.player_id=? AND r.season_id=?",
                           (req.player_id, season_id)).fetchone()
        if taken:
            raise HTTPException(400, f"Player already on {taken['name']}")

        error = validate_roster(db, team["id"], adding_player=player)
        if error:
            raise HTTPException(400, error)

        db.execute(
            "INSERT INTO roster (team_id, player_id, position, salary, club_id, season_id, acquired_via) VALUES (?, ?, ?, ?, ?, ?, 'add')",
            (team["id"], player["id"], player["position"], player["salary"], player.get("club_id", 0), season_id),
        )
        db.execute(
            "INSERT INTO transactions (team_id, player_id, action, details, season_id) VALUES (?, ?, 'add', ?, ?)",
            (team["id"], player["id"], json.dumps({"name": player["web_name"], "salary": player["salary"]}), season_id),
        )
    return {"message": f"Added {player['web_name']}"}


@app.post("/api/teams/mine/drop")
async def drop_player(req: DropPlayer, user=Depends(get_current_user)):
    with get_db() as db:
        team = db.execute("SELECT id FROM teams WHERE user_id=?", (user["sub"],)).fetchone()
        if not team:
            raise HTTPException(404, "No team found")
        slot = db.execute(
            "SELECT * FROM roster WHERE team_id=? AND player_id=?",
            (team["id"], req.player_id),
        ).fetchone()
        if not slot:
            raise HTTPException(404, "Player not on your roster")
        db.execute("DELETE FROM roster WHERE id=?", (slot["id"],))
        db.execute(
            "INSERT INTO transactions (team_id, player_id, action) VALUES (?, ?, 'drop')",
            (team["id"], req.player_id),
        )
    return {"message": "Player dropped"}


# ── Trades ──────────────────────────────────────────────────────────────
@app.get("/api/teams/{team_id}/roster")
async def get_team_roster(team_id: int, user=Depends(get_current_user)):
    """Get a specific team's roster (for trade UI)."""
    fpl_data = await get_fpl_data()
    all_players = {p["id"]: p for p in parse_players(fpl_data)}
    with get_db() as db:
        team = db.execute("SELECT id, name FROM teams WHERE id=?", (team_id,)).fetchone()
        if not team:
            raise HTTPException(404, "Team not found")
        roster = db.execute("SELECT * FROM roster WHERE team_id=?", (team_id,)).fetchall()
    enriched = []
    for r in roster:
        player = all_players.get(r["player_id"], {"id": r["player_id"], "web_name": f"#{r['player_id']}"})
        enriched.append({**dict(r), **player})
    return {"team": dict(team), "roster": enriched}


@app.get("/api/teams/all-rosters")
async def get_all_rosters(user=Depends(get_current_user)):
    """Get all teams with their full rosters."""
    fpl_data = await get_fpl_data()
    all_players = {p["id"]: p for p in parse_players(fpl_data)}
    with get_db() as db:
        teams = db.execute("""
            SELECT t.id, t.name, u.username,
                   COALESCE(SUM(r.salary), 0) as total_salary,
                   COUNT(r.id) as player_count
            FROM teams t
            JOIN users u ON t.user_id = u.id
            LEFT JOIN roster r ON r.team_id = t.id
            WHERE u.is_active = 1
            GROUP BY t.id
        """).fetchall()

        result = []
        for team in teams:
            roster = db.execute("SELECT * FROM roster WHERE team_id=?", (team["id"],)).fetchall()
            enriched = []
            for r in roster:
                player = all_players.get(r["player_id"], {"id": r["player_id"], "name": f"#{r['player_id']}", "web_name": f"#{r['player_id']}"})
                enriched.append({**dict(r), **player})
            enriched.sort(key=lambda p: ["GK", "DEF", "MID", "FWD"].index(p.get("position", "FWD")))
            result.append({
                "team": dict(team),
                "roster": enriched,
            })

        # Find active users without teams
        missing = db.execute("""
            SELECT u.id, u.username FROM users u
            WHERE u.is_active = 1
            AND u.id NOT IN (SELECT user_id FROM teams)
        """).fetchall()

    return {"teams": result, "missing_teams": [dict(m) for m in missing]}


def enrich_trade(db, trade, fpl_players):
    """Add player names, protest info, and team salary details to a trade dict."""
    trade_d = dict(trade)
    players = db.execute("SELECT * FROM trade_players WHERE trade_id=?", (trade["id"],)).fetchall()
    enriched_players = []
    for tp in players:
        p = fpl_players.get(tp["player_id"], {})
        enriched_players.append({
            **dict(tp),
            "name": p.get("name", f"#{tp['player_id']}"),
            "web_name": p.get("web_name", f"#{tp['player_id']}"),
            "position": p.get("position", "?"),
            "salary": p.get("salary", 0),
            "club_name": p.get("club_name", ""),
            "total_points": p.get("total_points", 0),
            "form": p.get("form", "0"),
            "status": p.get("status", "a"),
            "injury_news": p.get("injury_news", ""),
        })
    trade_d["players"] = enriched_players

    # Team salary cap info
    cap = float(get_config_val(db, "salary_cap") or "100")
    for side, tid in [("from_team", trade["from_team_id"]), ("to_team", trade["to_team_id"])]:
        salary_row = db.execute("SELECT COALESCE(SUM(salary), 0) as total FROM roster WHERE team_id=?", (tid,)).fetchone()
        player_count = db.execute("SELECT COUNT(*) as c FROM roster WHERE team_id=?", (tid,)).fetchone()["c"]
        total_salary = float(salary_row["total"])
        trade_d[f"{side}_salary_used"] = total_salary
        trade_d[f"{side}_salary_remaining"] = cap - total_salary
        trade_d[f"{side}_salary_cap"] = cap
        trade_d[f"{side}_player_count"] = player_count

    # Protest info
    protests = db.execute("SELECT team_id FROM trade_protests WHERE trade_id=?", (trade["id"],)).fetchall()
    trade_d["protest_count"] = len(protests)
    trade_d["protest_team_ids"] = [p["team_id"] for p in protests]

    # Total teams for threshold calc
    total_teams = db.execute("SELECT COUNT(*) as c FROM teams").fetchone()["c"]
    eligible_voters = max(total_teams - 2, 1)
    threshold_pct = int(get_config_val(db, "trade_protest_threshold") or "50")
    trade_d["protests_needed"] = max(1, int(eligible_voters * threshold_pct / 100 + 0.5))
    trade_d["eligible_voters"] = eligible_voters

    return trade_d


@app.post("/api/trades")
async def propose_trade(req: TradeProposal, user=Depends(get_current_user)):
    fpl_data = await get_fpl_data()
    all_players = {p["id"]: p for p in parse_players(fpl_data)}

    with get_db() as db:
        my_team = db.execute("SELECT id FROM teams WHERE user_id=?", (user["sub"],)).fetchone()
        if not my_team:
            raise HTTPException(404, "No team found")
        other_team = db.execute("SELECT id FROM teams WHERE id=?", (req.to_team_id,)).fetchone()
        if not other_team:
            raise HTTPException(404, "Target team not found")

        for pid in req.offering_player_ids:
            r = db.execute("SELECT id FROM roster WHERE team_id=? AND player_id=?", (my_team["id"], pid)).fetchone()
            if not r:
                raise HTTPException(400, f"You don't have player {pid}")
        for pid in req.requesting_player_ids:
            r = db.execute("SELECT id FROM roster WHERE team_id=? AND player_id=?", (req.to_team_id, pid)).fetchone()
            if not r:
                raise HTTPException(400, f"Target team doesn't have player {pid}")

        # Pre-validate: simulate the swap and check both rosters
        # Build simulated rosters after the trade
        my_roster = db.execute("SELECT player_id, position, salary, club_id FROM roster WHERE team_id=?", (my_team["id"],)).fetchall()
        their_roster = db.execute("SELECT player_id, position, salary, club_id FROM roster WHERE team_id=?", (req.to_team_id,)).fetchall()

        my_after = [dict(r) for r in my_roster if r["player_id"] not in req.offering_player_ids]
        their_after = [dict(r) for r in their_roster if r["player_id"] not in req.requesting_player_ids]

        # Add incoming players
        for pid in req.requesting_player_ids:
            p = all_players.get(pid, {})
            my_after.append({"player_id": pid, "position": p.get("position", "?"), "salary": p.get("salary", 0), "club_id": p.get("club_id", 0)})
        for pid in req.offering_player_ids:
            p = all_players.get(pid, {})
            their_after.append({"player_id": pid, "position": p.get("position", "?"), "salary": p.get("salary", 0), "club_id": p.get("club_id", 0)})

        # Check salary caps
        cap = float(get_config_val(db, "salary_cap"))
        my_salary = sum(r["salary"] for r in my_after)
        their_salary = sum(r["salary"] for r in their_after)
        if my_salary > cap:
            raise HTTPException(400, f"Trade would put your team over the salary cap (£{my_salary:.1f}m / £{cap:.1f}m)")
        if their_salary > cap:
            raise HTTPException(400, f"Trade would put their team over the salary cap (£{their_salary:.1f}m / £{cap:.1f}m)")

        # Check position limits
        limits = {
            "GK": int(get_config_val(db, "max_gk")),
            "DEF": int(get_config_val(db, "max_def")),
            "MID": int(get_config_val(db, "max_mid")),
            "FWD": int(get_config_val(db, "max_fwd")),
        }
        for label, roster_after in [("Your team", my_after), ("Their team", their_after)]:
            pos_counts = {}
            for r in roster_after:
                pos_counts[r["position"]] = pos_counts.get(r["position"], 0) + 1
            for pos, count in pos_counts.items():
                if count > limits.get(pos, 99):
                    raise HTTPException(400, f"Trade would give {label} too many {pos}s ({count}/{limits[pos]})")

        # Check max per club
        max_club = int(get_config_val(db, "max_per_club"))
        for label, roster_after in [("Your team", my_after), ("Their team", their_after)]:
            club_counts = {}
            for r in roster_after:
                cid = r.get("club_id", 0)
                club_counts[cid] = club_counts.get(cid, 0) + 1
            for cid, count in club_counts.items():
                if cid and count > max_club:
                    club_name = next((p.get("club_name", f"Club {cid}") for p in all_players.values() if p.get("club_id") == cid), f"Club {cid}")
                    raise HTTPException(400, f"Trade would give {label} too many players from {club_name} ({count}/{max_club})")

        db.execute(
            "INSERT INTO trades (from_team_id, to_team_id) VALUES (?, ?)",
            (my_team["id"], req.to_team_id),
        )
        trade_id = db.execute("SELECT last_insert_rowid()").fetchone()[0]
        for pid in req.offering_player_ids:
            db.execute("INSERT INTO trade_players (trade_id, player_id, from_team_id) VALUES (?, ?, ?)",
                       (trade_id, pid, my_team["id"]))
        for pid in req.requesting_player_ids:
            db.execute("INSERT INTO trade_players (trade_id, player_id, from_team_id) VALUES (?, ?, ?)",
                       (trade_id, pid, req.to_team_id))

        # Notify the target manager
        target_user = db.execute("SELECT user_id FROM teams WHERE id=?", (req.to_team_id,)).fetchone()
        my_team_name = db.execute("SELECT name FROM teams WHERE id=?", (my_team["id"],)).fetchone()

    if target_user:
        send_push_notification(
            target_user["user_id"],
            "Trade Proposal ⇄",
            f"{my_team_name['name'] if my_team_name else 'A manager'} wants to trade with you",
            "/trades",
            notify_type="trade_proposed"
        )

    return {"trade_id": trade_id, "status": "pending"}


@app.get("/api/trades")
async def list_trades(user=Depends(get_current_user)):
    fpl_data = await get_fpl_data()
    fpl_players = {p["id"]: p for p in parse_players(fpl_data)}
    with get_db() as db:
        team = db.execute("SELECT id FROM teams WHERE user_id=?", (user["sub"],)).fetchone()
        # Show all trades in review to everyone, plus own trades
        trades = db.execute("""
            SELECT t.*, ft.name as from_team_name, tt.name as to_team_name
            FROM trades t
            JOIN teams ft ON ft.id = t.from_team_id
            JOIN teams tt ON tt.id = t.to_team_id
            ORDER BY t.proposed_at DESC
        """).fetchall()
        result = [enrich_trade(db, t, fpl_players) for t in trades]
        my_team_id = team["id"] if team else None
    return {"trades": result, "my_team_id": my_team_id}


@app.post("/api/trades/{trade_id}/accept")
async def accept_trade(trade_id: int, user=Depends(get_current_user)):
    """Accepting a trade moves it to 'in_review' with a review deadline."""
    with get_db() as db:
        team = db.execute("SELECT id FROM teams WHERE user_id=?", (user["sub"],)).fetchone()
        trade = db.execute("SELECT * FROM trades WHERE id=? AND status='pending'", (trade_id,)).fetchone()
        if not trade:
            raise HTTPException(404, "Trade not found or already resolved")
        if trade["to_team_id"] != team["id"]:
            raise HTTPException(403, "Only the receiving team can accept")

        review_hours = int(get_config_val(db, "trade_review_period_hours") or "24")
        expires = (datetime.now(timezone.utc) + timedelta(hours=review_hours)).isoformat()

        db.execute(
            "UPDATE trades SET status='in_review', accepted_at=datetime('now'), review_expires_at=? WHERE id=?",
            (expires, trade_id),
        )
    return {"message": f"Trade accepted — now in {review_hours}h league review"}


@app.post("/api/trades/{trade_id}/protest")
def protest_trade(trade_id: int, user=Depends(get_current_user)):
    """Any manager not involved in the trade can protest."""
    with get_db() as db:
        team = db.execute("SELECT id FROM teams WHERE user_id=?", (user["sub"],)).fetchone()
        if not team:
            raise HTTPException(404, "No team found")
        trade = db.execute("SELECT * FROM trades WHERE id=? AND status='in_review'", (trade_id,)).fetchone()
        if not trade:
            raise HTTPException(404, "Trade not found or not in review")
        if team["id"] in (trade["from_team_id"], trade["to_team_id"]):
            raise HTTPException(400, "You can't protest your own trade")

        try:
            db.execute("INSERT INTO trade_protests (trade_id, team_id) VALUES (?, ?)", (trade_id, team["id"]))
        except Exception:
            raise HTTPException(400, "You've already protested this trade")

        # Check if threshold met
        protests = db.execute("SELECT COUNT(*) as c FROM trade_protests WHERE trade_id=?", (trade_id,)).fetchone()["c"]
        total_teams = db.execute("SELECT COUNT(*) as c FROM teams").fetchone()["c"]
        eligible = max(total_teams - 2, 1)
        threshold_pct = int(get_config_val(db, "trade_protest_threshold") or "50")
        needed = max(1, int(eligible * threshold_pct / 100 + 0.5))

        if protests >= needed:
            db.execute("UPDATE trades SET status='vetoed', resolved_at=datetime('now') WHERE id=?", (trade_id,))
            return {"message": "Trade vetoed by league vote", "vetoed": True}

    return {"message": "Protest recorded", "vetoed": False}


@app.post("/api/trades/{trade_id}/process")
async def process_trade(trade_id: int, _=Depends(require_admin)):
    """Admin: manually process a trade that's in review (skip waiting)."""
    return await _execute_trade(trade_id)


async def _execute_trade(trade_id: int):
    """Execute the player swap for an approved trade."""
    fpl_data = await get_fpl_data()
    all_players = {p["id"]: p for p in parse_players(fpl_data)}

    with get_db() as db:
        trade = db.execute("SELECT * FROM trades WHERE id=?", (trade_id,)).fetchone()
        if not trade or trade["status"] not in ("in_review", "pending"):
            raise HTTPException(404, "Trade not found or already resolved")

        trade_players_rows = db.execute("SELECT * FROM trade_players WHERE trade_id=?", (trade_id,)).fetchall()

        # Pre-validate by simulating the swap (same logic as propose_trade)
        from_roster = db.execute("SELECT player_id, position, salary, club_id FROM roster WHERE team_id=?",
                                 (trade["from_team_id"],)).fetchall()
        to_roster = db.execute("SELECT player_id, position, salary, club_id FROM roster WHERE team_id=?",
                               (trade["to_team_id"],)).fetchall()

        from_offering = [tp["player_id"] for tp in trade_players_rows if tp["from_team_id"] == trade["from_team_id"]]
        to_offering = [tp["player_id"] for tp in trade_players_rows if tp["from_team_id"] == trade["to_team_id"]]

        from_after = [dict(r) for r in from_roster if r["player_id"] not in from_offering]
        to_after = [dict(r) for r in to_roster if r["player_id"] not in to_offering]

        for pid in to_offering:
            p = all_players.get(pid, {})
            from_after.append({"player_id": pid, "position": p.get("position", "?"), "salary": p.get("salary", 0), "club_id": p.get("club_id", 0)})
        for pid in from_offering:
            p = all_players.get(pid, {})
            to_after.append({"player_id": pid, "position": p.get("position", "?"), "salary": p.get("salary", 0), "club_id": p.get("club_id", 0)})

        # Validate salary cap
        cap = float(get_config_val(db, "salary_cap"))
        for label, roster_after in [("From team", from_after), ("To team", to_after)]:
            total = sum(r["salary"] for r in roster_after)
            if total > cap:
                raise Exception(f"{label} would exceed salary cap (£{total:.1f}m / £{cap:.1f}m)")

        # Validate position limits
        limits = {"GK": int(get_config_val(db, "max_gk")), "DEF": int(get_config_val(db, "max_def")),
                  "MID": int(get_config_val(db, "max_mid")), "FWD": int(get_config_val(db, "max_fwd"))}
        max_club = int(get_config_val(db, "max_per_club"))
        for label, roster_after in [("From team", from_after), ("To team", to_after)]:
            pos_counts = {}
            club_counts = {}
            for r in roster_after:
                pos_counts[r["position"]] = pos_counts.get(r["position"], 0) + 1
                cid = r.get("club_id", 0)
                if cid: club_counts[cid] = club_counts.get(cid, 0) + 1
            for pos, count in pos_counts.items():
                if count > limits.get(pos, 99):
                    raise Exception(f"{label} would have too many {pos}s ({count}/{limits[pos]})")
            for cid, count in club_counts.items():
                if count > max_club:
                    raise Exception(f"{label} would exceed max players per club ({count}/{max_club})")

        # Validation passed — execute the swap
        for tp in trade_players_rows:
            from_id = tp["from_team_id"]
            to_id = trade["to_team_id"] if from_id == trade["from_team_id"] else trade["from_team_id"]
            db.execute("UPDATE roster SET team_id=?, acquired_via='trade' WHERE team_id=? AND player_id=?",
                       (to_id, from_id, tp["player_id"]))

        db.execute("UPDATE trades SET status='completed', resolved_at=datetime('now') WHERE id=?", (trade_id,))
    return {"message": "Trade completed"}


@app.post("/api/trades/{trade_id}/reject")
def reject_trade(trade_id: int, user=Depends(get_current_user)):
    with get_db() as db:
        team = db.execute("SELECT id FROM teams WHERE user_id=?", (user["sub"],)).fetchone()
        trade = db.execute("SELECT * FROM trades WHERE id=? AND status IN ('pending','in_review')", (trade_id,)).fetchone()
        if not trade:
            raise HTTPException(404, "Trade not found")
        if trade["to_team_id"] != team["id"] and trade["from_team_id"] != team["id"] and not user.get("admin"):
            raise HTTPException(403, "Cannot reject this trade")
        db.execute("UPDATE trades SET status='rejected', resolved_at=datetime('now') WHERE id=?", (trade_id,))
    return {"message": "Trade rejected"}


# Auto-process trades past review period
async def process_expired_reviews():
    """Check for trades past their review period and execute them."""
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    with get_db() as db:
        # Normalize timestamp comparison — handle both ISO and SQLite formats
        expired = db.execute("""
            SELECT id FROM trades
            WHERE status='in_review' AND review_expires_at IS NOT NULL
            AND REPLACE(REPLACE(review_expires_at, 'T', ' '), '+00:00', '') < ?
        """, (now,)).fetchall()
    for trade in expired:
        try:
            await _execute_trade(trade["id"])
            logger.info(f"Auto-processed trade {trade['id']} after review period")
        except Exception as e:
            logger.error(f"Failed to auto-process trade {trade['id']}: {e}")
            # Mark trade as failed so it doesn't stay stuck
            with get_db() as db:
                db.execute(
                    "UPDATE trades SET status='failed', resolved_at=datetime('now') WHERE id=?",
                    (trade["id"],)
                )


# ── Draft ───────────────────────────────────────────────────────────────
@app.get("/api/draft")
async def get_draft_state(user=Depends(get_current_user)):
    with get_db() as db:
        draft = db.execute("SELECT * FROM draft_state ORDER BY id DESC LIMIT 1").fetchone()
        if not draft:
            return {"status": "none"}
        picks = db.execute("""
            SELECT dp.*, t.name as team_name
            FROM draft_picks dp
            JOIN teams t ON t.id = dp.team_id
            WHERE dp.draft_id = ?
            ORDER BY dp.pick_number
        """, (draft["id"],)).fetchall()

    fpl_data = await get_fpl_data()
    all_players = {p["id"]: p for p in parse_players(fpl_data)}
    picked_ids = {p["player_id"] for p in picks}

    # Also include all players currently on any roster
    with get_db() as db:
        rostered = db.execute("SELECT DISTINCT player_id FROM roster").fetchall()
        rostered_ids = {r["player_id"] for r in rostered}
    unavailable_ids = picked_ids | rostered_ids

    enriched_picks = []
    for p in picks:
        player_info = all_players.get(p["player_id"], {})
        enriched_picks.append({**dict(p), "player": player_info})

    # Timer info
    draft_dict = dict(draft)
    pick_started = draft_dict.get("pick_started_at")
    timeout = draft_dict.get("pick_timeout_minutes") or 15
    time_remaining = None
    if pick_started and draft["status"] == "active":
        try:
            started = datetime.fromisoformat(pick_started.replace("Z", "+00:00")) if "T" in pick_started else datetime.strptime(pick_started, "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)
            elapsed = (datetime.now(timezone.utc) - started).total_seconds()
            time_remaining = max(0, timeout * 60 - elapsed)
        except Exception:
            time_remaining = timeout * 60

    # Get user's auto-draft status
    with get_db() as db:
        user_ad = db.execute("SELECT auto_draft FROM users WHERE id=?", (user["sub"],)).fetchone()

    return {
        **dict(draft),
        "draft_order": json.loads(draft["draft_order"]) if draft["draft_order"] else [],
        "picks": enriched_picks,
        "picked_player_ids": list(unavailable_ids),
        "time_remaining_seconds": time_remaining,
        "pick_timeout_minutes": timeout,
        "auto_draft": bool(user_ad["auto_draft"]) if user_ad else False,
    }


@app.post("/api/draft/start")
def start_draft(_=Depends(require_admin)):
    with get_db() as db:
        active = db.execute("SELECT id FROM draft_state WHERE status='active'").fetchone()
        if active:
            raise HTTPException(400, "Draft already in progress")
        teams = db.execute("SELECT t.id FROM teams t JOIN users u ON t.user_id = u.id WHERE u.is_active = 1 ORDER BY RANDOM()").fetchall()
        if len(teams) < 2:
            raise HTTPException(400, "Need at least 2 teams")
        order = [t["id"] for t in teams]
        db.execute(
            "INSERT INTO draft_state (status, draft_order, started_at, pick_started_at, pick_timeout_minutes) VALUES ('active', ?, datetime('now'), datetime('now'), ?)",
            (json.dumps(order), int(get_config_val(db, "draft_timer_minutes") or "5")),
        )
        # Reset missed picks and auto-draft for all users
        db.execute("UPDATE users SET missed_picks=0, auto_draft=0")
    return {"message": "Draft started", "order": order}


@app.post("/api/draft/pick")
async def make_draft_pick(req: DraftPick, user=Depends(get_current_user)):
    fpl_data = await get_fpl_data()
    all_players = {p["id"]: p for p in parse_players(fpl_data)}
    player = all_players.get(req.player_id)
    if not player:
        raise HTTPException(404, "Player not found")
    if player.get("status") == "u":
        raise HTTPException(400, f"{player['name']} is unavailable (transferred or not in the league)")

    with get_db() as db:
        draft = db.execute("SELECT * FROM draft_state WHERE status='active' ORDER BY id DESC LIMIT 1").fetchone()
        if not draft:
            raise HTTPException(400, "No active draft")

        team = db.execute("SELECT id FROM teams WHERE user_id=?", (user["sub"],)).fetchone()
        if not team:
            raise HTTPException(404, "No team found")

        order = json.loads(draft["draft_order"])
        pick_num = draft["current_pick"]
        draft_type = get_config_val(db, "draft_type")
        num_teams = len(order)
        squad_size = int(get_config_val(db, "squad_size"))

        # Snake draft logic
        round_num = pick_num // num_teams
        if draft_type == "snake" and round_num % 2 == 1:
            idx = num_teams - 1 - (pick_num % num_teams)
        else:
            idx = pick_num % num_teams

        if pick_num >= num_teams * squad_size:
            raise HTTPException(400, "Draft is complete")
        if order[idx] != team["id"]:
            raise HTTPException(400, "Not your turn to pick")

        # Check if player already picked
        already = db.execute("SELECT id FROM draft_picks WHERE draft_id=? AND player_id=?",
                             (draft["id"], req.player_id)).fetchone()
        if already:
            raise HTTPException(400, "Player already drafted")

        # Validate roster
        error = validate_roster(db, team["id"], adding_player=player)
        if error:
            raise HTTPException(400, error)

        db.execute(
            "INSERT INTO draft_picks (draft_id, team_id, player_id, pick_number, salary) VALUES (?, ?, ?, ?, ?)",
            (draft["id"], team["id"], req.player_id, pick_num, player["salary"]),
        )
        db.execute(
            "INSERT INTO roster (team_id, player_id, position, salary, club_id, acquired_via) VALUES (?, ?, ?, ?, ?, 'draft')",
            (team["id"], player["id"], player["position"], player["salary"], player.get("club_id", 0)),
        )

        new_pick = pick_num + 1
        if new_pick >= num_teams * squad_size:
            db.execute("UPDATE draft_state SET current_pick=?, pick_started_at=NULL, status='completed', completed_at=datetime('now') WHERE id=?",
                       (new_pick, draft["id"]))
        else:
            db.execute("UPDATE draft_state SET current_pick=?, pick_started_at=datetime('now') WHERE id=?", (new_pick, draft["id"]))

            # Notify next picker
            next_round = new_pick // num_teams
            draft_type = get_config_val(db, "draft_type") or "snake"
            if draft_type == "snake" and next_round % 2 == 1:
                next_idx = num_teams - 1 - (new_pick % num_teams)
            else:
                next_idx = new_pick % num_teams
            next_team_id = order[next_idx]
            next_user = db.execute("SELECT user_id FROM teams WHERE id=?", (next_team_id,)).fetchone()
            if next_user:
                send_push_notification(
                    next_user["user_id"],
                    "You're On the Clock! 🏈",
                    f"It's your turn to draft (Pick #{new_pick + 1})",
                    "/draft",
                    notify_type="draft_pick"
                )

        # Reset missed picks counter since they picked manually
        db.execute("UPDATE users SET missed_picks=0 WHERE id=?", (user["sub"],))

    return {"message": f"Drafted {player['web_name']}", "pick_number": pick_num}


# ── Draft Scorecard ─────────────────────────────────────────────────────
@app.get("/api/draft/scorecard")
async def get_draft_scorecard(user=Depends(get_current_user)):
    """Generate draft grades for all teams."""
    fpl_data = await get_fpl_data()
    all_players = {p["id"]: p for p in parse_players(fpl_data)}

    with get_db() as db:
        draft = db.execute("SELECT * FROM draft_state ORDER BY id DESC LIMIT 1").fetchone()
        if not draft:
            return {"scorecard": [], "status": "none"}

        picks = db.execute("""
            SELECT dp.pick_number, dp.team_id, dp.player_id, dp.salary, t.name as team_name
            FROM draft_picks dp JOIN teams t ON t.id = dp.team_id
            ORDER BY dp.pick_number
        """).fetchall()

    # Group by team
    team_picks = {}
    for p in picks:
        tid = p["team_id"]
        if tid not in team_picks:
            team_picks[tid] = {"name": p["team_name"], "picks": []}
        player = all_players.get(p["player_id"], {})
        team_picks[tid]["picks"].append({
            "pick_number": p["pick_number"] + 1,
            "player_name": player.get("name", f"#{p['player_id']}"),
            "position": player.get("position", "?"),
            "salary": p["salary"],
            "total_points": player.get("total_points", 0),
            "club_name": player.get("club_name", ""),
            "status": player.get("status", "a"),
        })

    # Grade each team
    scorecard = []
    for tid, t in team_picks.items():
        total_pts = sum(p["total_points"] for p in t["picks"])
        total_sal = sum(p["salary"] for p in t["picks"])
        avg = total_pts / len(t["picks"]) if t["picks"] else 0
        vpm = total_pts / total_sal if total_sal > 0 else 0
        zeros = sum(1 for p in t["picks"] if p["total_points"] == 0)

        pos_counts = {}
        for p in t["picks"]:
            pos_counts[p["position"]] = pos_counts.get(p["position"], 0) + 1

        # Calculate grade score
        score = 0
        score += min(total_pts / 1900 * 40, 40)
        score += min(vpm / 22 * 30, 30)
        bal = 1 if (pos_counts.get("GK", 0) >= 1 and pos_counts.get("DEF", 0) >= 3 and
                     pos_counts.get("MID", 0) >= 3 and pos_counts.get("FWD", 0) >= 2) else 0.7
        score += bal * 15
        score -= zeros * 5
        score += 10 if avg > 100 else (5 if avg > 80 else 0)
        score = max(0, min(100, score))

        if score >= 85: grade = "A"
        elif score >= 70: grade = "B+"
        elif score >= 60: grade = "B"
        elif score >= 50: grade = "C+"
        elif score >= 40: grade = "C"
        elif score >= 30: grade = "D"
        else: grade = "F"

        best = max(t["picks"], key=lambda p: p["total_points"])
        worst = min(t["picks"], key=lambda p: p["total_points"])
        best_value = max(t["picks"], key=lambda p: p["total_points"] / p["salary"] if p["salary"] > 0 else 0)

        scorecard.append({
            "team_id": tid,
            "team_name": t["name"],
            "grade": grade,
            "score": round(score),
            "total_points": total_pts,
            "total_salary": round(total_sal, 1),
            "avg_per_player": round(avg),
            "pts_per_million": round(vpm, 1),
            "position_counts": pos_counts,
            "zeros": zeros,
            "best_pick": best,
            "worst_pick": worst,
            "best_value": best_value,
            "picks": t["picks"],
        })

    scorecard.sort(key=lambda x: x["total_points"], reverse=True)
    return {"scorecard": scorecard, "status": dict(draft)["status"]}


# ── Draft Queue & Auto-Draft ────────────────────────────────────────────
@app.get("/api/draft/queue")
def get_draft_queue(user=Depends(get_current_user)):
    """Get current user's draft queue."""
    with get_db() as db:
        rows = db.execute(
            "SELECT player_id, priority FROM draft_queue WHERE user_id=? ORDER BY priority",
            (user["sub"],)
        ).fetchall()
    return {"queue": [{"player_id": r["player_id"], "priority": r["priority"]} for r in rows]}


@app.put("/api/draft/queue")
def update_draft_queue(req: DraftQueueUpdate, user=Depends(get_current_user)):
    """Set the user's draft queue (ordered list of player IDs)."""
    with get_db() as db:
        db.execute("DELETE FROM draft_queue WHERE user_id=?", (user["sub"],))
        for i, pid in enumerate(req.player_ids):
            db.execute(
                "INSERT INTO draft_queue (user_id, player_id, priority) VALUES (?, ?, ?)",
                (user["sub"], pid, i)
            )
    return {"message": f"Queue updated with {len(req.player_ids)} players"}


@app.post("/api/draft/queue/add")
def add_to_draft_queue(req: AddPlayer, user=Depends(get_current_user)):
    """Add a player to the end of the draft queue."""
    with get_db() as db:
        max_pri = db.execute(
            "SELECT COALESCE(MAX(priority), -1) as m FROM draft_queue WHERE user_id=?",
            (user["sub"],)
        ).fetchone()["m"]
        try:
            db.execute(
                "INSERT INTO draft_queue (user_id, player_id, priority) VALUES (?, ?, ?)",
                (user["sub"], req.player_id, max_pri + 1)
            )
        except Exception:
            raise HTTPException(400, "Player already in queue")
    return {"message": "Added to queue"}


@app.delete("/api/draft/queue/{player_id}")
def remove_from_draft_queue(player_id: int, user=Depends(get_current_user)):
    """Remove a player from the draft queue."""
    with get_db() as db:
        db.execute("DELETE FROM draft_queue WHERE user_id=? AND player_id=?",
                   (user["sub"], player_id))
    return {"message": "Removed from queue"}


@app.put("/api/draft/auto-draft")
def toggle_auto_draft(user=Depends(get_current_user)):
    """Toggle auto-draft on/off."""
    with get_db() as db:
        db.execute("UPDATE users SET auto_draft = 1 - COALESCE(auto_draft, 0) WHERE id=?", (user["sub"],))
        new_val = db.execute("SELECT auto_draft FROM users WHERE id=?", (user["sub"],)).fetchone()
    return {"auto_draft": bool(new_val["auto_draft"]), "message": f"Auto-draft {'enabled' if new_val['auto_draft'] else 'disabled'}"}


@app.get("/api/draft/auto-draft")
def get_auto_draft_status(user=Depends(get_current_user)):
    with get_db() as db:
        row = db.execute("SELECT auto_draft FROM users WHERE id=?", (user["sub"],)).fetchone()
    return {"auto_draft": bool(row["auto_draft"]) if row else False}


async def auto_pick_for_team(team_id: int, draft_id: int, pick_num: int, reason: str = "timer"):
    """Auto-pick for a team: use their queue first, then best available."""
    fpl_data = await get_fpl_data()
    all_players = {p["id"]: p for p in parse_players(fpl_data)}

    with get_db() as db:
        team = db.execute("SELECT * FROM teams WHERE id=?", (team_id,)).fetchone()
        if not team:
            return None

        # Get unavailable players
        picked = db.execute("SELECT player_id FROM draft_picks WHERE draft_id=?", (draft_id,)).fetchall()
        rostered = db.execute("SELECT DISTINCT player_id FROM roster").fetchall()
        unavailable = {r["player_id"] for r in picked} | {r["player_id"] for r in rostered}

        # Get roster state for validation
        roster = db.execute("SELECT player_id, position, salary, club_id FROM roster WHERE team_id=?", (team_id,)).fetchall()
        used_salary = sum(r["salary"] for r in roster)
        cap = float(get_config_val(db, "salary_cap"))
        remaining = cap - used_salary
        pos_counts = {"GK": 0, "DEF": 0, "MID": 0, "FWD": 0}
        club_counts = {}
        for r in roster:
            pos_counts[r["position"]] = pos_counts.get(r["position"], 0) + 1
            club_counts[r["club_id"]] = club_counts.get(r["club_id"], 0) + 1
        limits = {
            "GK": int(get_config_val(db, "max_gk")),
            "DEF": int(get_config_val(db, "max_def")),
            "MID": int(get_config_val(db, "max_mid")),
            "FWD": int(get_config_val(db, "max_fwd")),
        }
        max_club = int(get_config_val(db, "max_per_club"))

        def can_add(p):
            if p["id"] in unavailable:
                return False
            if p.get("status") == "u":
                return False
            if p["salary"] > remaining:
                return False
            if pos_counts.get(p["position"], 0) >= limits.get(p["position"], 99):
                return False
            if p.get("club_id") and club_counts.get(p["club_id"], 0) >= max_club:
                return False
            return True

        # Try queue first
        queue = db.execute(
            "SELECT player_id FROM draft_queue WHERE user_id=? ORDER BY priority",
            (team["user_id"],)
        ).fetchall()

        selected = None
        for q in queue:
            p = all_players.get(q["player_id"])
            if p and can_add(p):
                selected = p
                break

        # Fallback: best available by points, prioritizing needed positions
        if not selected:
            available = [p for p in all_players.values() if can_add(p)]
            # Sort by points descending
            available.sort(key=lambda p: p.get("total_points", 0), reverse=True)
            if available:
                selected = available[0]

        if not selected:
            logger.warning(f"Auto-pick failed for team {team_id}: no valid players")
            return None

        # Execute the pick
        squad_size = int(get_config_val(db, "squad_size") or "15")
        order = json.loads(db.execute("SELECT draft_order FROM draft_state WHERE id=?", (draft_id,)).fetchone()["draft_order"])
        num_teams = len(order)

        db.execute(
            "INSERT INTO draft_picks (draft_id, team_id, player_id, pick_number, salary) VALUES (?, ?, ?, ?, ?)",
            (draft_id, team_id, selected["id"], pick_num, selected["salary"]),
        )
        db.execute(
            "INSERT INTO roster (team_id, player_id, position, salary, club_id, acquired_via) VALUES (?, ?, ?, ?, ?, 'draft')",
            (team_id, selected["id"], selected["position"], selected["salary"], selected.get("club_id", 0)),
        )

        # Remove from queue if it was there
        db.execute("DELETE FROM draft_queue WHERE user_id=? AND player_id=?",
                   (team["user_id"], selected["id"]))

        new_pick = pick_num + 1
        if new_pick >= num_teams * squad_size:
            db.execute("UPDATE draft_state SET current_pick=?, pick_started_at=NULL, status='completed', completed_at=datetime('now') WHERE id=?",
                       (new_pick, draft_id))
        else:
            db.execute("UPDATE draft_state SET current_pick=?, pick_started_at=datetime('now') WHERE id=?",
                       (new_pick, draft_id))

            # Notify next picker
            draft_type = get_config_val(db, "draft_type") or "snake"
            next_round = new_pick // num_teams
            if draft_type == "snake" and next_round % 2 == 1:
                next_idx = num_teams - 1 - (new_pick % num_teams)
            else:
                next_idx = new_pick % num_teams
            next_team_id = order[next_idx]
            next_user = db.execute("SELECT user_id FROM teams WHERE id=?", (next_team_id,)).fetchone()
            if next_user:
                send_push_notification(
                    next_user["user_id"],
                    "You're On the Clock! 🏈",
                    f"It's your turn to draft (Pick #{new_pick + 1})",
                    "/draft",
                    notify_type="draft_pick"
                )

        # Track missed picks (only for timer-based auto-picks, not voluntary auto-draft)
        if reason == "timer":
            db.execute("UPDATE users SET missed_picks = COALESCE(missed_picks, 0) + 1 WHERE id=?", (team["user_id"],))
            missed = db.execute("SELECT missed_picks FROM users WHERE id=?", (team["user_id"],)).fetchone()
            if missed and missed["missed_picks"] >= 3:
                db.execute("UPDATE users SET auto_draft=1 WHERE id=?", (team["user_id"],))
                send_push_notification(
                    team["user_id"],
                    "Auto-Draft Enabled ⚠️",
                    "You missed 3 picks — auto-draft has been turned on for the rest of the draft.",
                    "/draft",
                    notify_type="draft_pick"
                )
                logger.info(f"Auto-draft enabled for {team['name']} after 3 missed picks")
        elif reason == "auto-draft":
            pass  # Don't count voluntary auto-draft as a miss

        # Notify the manager whose pick was auto-made
        send_push_notification(
            team["user_id"],
            f"Auto-Drafted: {selected['name']}",
            f"{selected['name']} ({selected['position']}, £{selected['salary']}m) was {'queued' if reason == 'queue' else 'auto'}-picked for you",
            "/draft",
            notify_type="draft_pick"
        )

        logger.info(f"Auto-picked {selected['name']} for {team['name']} (pick #{pick_num + 1}, reason: {reason})")
        return selected


async def check_draft_timer():
    """Check if the current drafter's time has expired, or if they have auto-draft on."""
    try:
        with get_db() as db:
            draft = db.execute("SELECT * FROM draft_state WHERE status='active' ORDER BY id DESC LIMIT 1").fetchone()
            if not draft:
                return

            order = json.loads(draft["draft_order"]) if draft["draft_order"] else []
            num_teams = len(order)
            if num_teams == 0:
                return

            current_pick = draft["current_pick"] or 0
            squad_size = int(get_config_val(db, "squad_size") or "15")
            if current_pick >= num_teams * squad_size:
                return

            draft_type = get_config_val(db, "draft_type") or "snake"
            round_num = current_pick // num_teams
            if draft_type == "snake" and round_num % 2 == 1:
                idx = num_teams - 1 - (current_pick % num_teams)
            else:
                idx = current_pick % num_teams
            current_team_id = order[idx]

            team = db.execute("SELECT * FROM teams WHERE id=?", (current_team_id,)).fetchone()
            if not team:
                return
            user = db.execute("SELECT auto_draft FROM users WHERE id=?", (team["user_id"],)).fetchone()

            # Check auto-draft
            if user and user["auto_draft"]:
                await auto_pick_for_team(current_team_id, draft["id"], current_pick, "auto-draft")
                return

            # Check timer
            draft_dict = dict(draft)
            timeout = draft_dict.get("pick_timeout_minutes") or 15
            pick_started = draft_dict.get("pick_started_at")
            if pick_started:
                started = datetime.fromisoformat(pick_started.replace("Z", "+00:00")) if "T" in pick_started else datetime.strptime(pick_started, "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)
                elapsed = (datetime.now(timezone.utc) - started).total_seconds() / 60
                if elapsed >= timeout:
                    await auto_pick_for_team(current_team_id, draft["id"], current_pick, "timer")
    except Exception as e:
        logger.error(f"Draft timer check error: {e}")


# ── How to Play ─────────────────────────────────────────────────────────
class HowToPlaySection(BaseModel):
    title: str
    body: str
    section_order: Optional[int] = 0


@app.get("/api/how-to-play")
def get_how_to_play():
    with get_db() as db:
        sections = db.execute("SELECT * FROM how_to_play ORDER BY section_order").fetchall()
    return {"sections": [dict(s) for s in sections]}


@app.post("/api/how-to-play")
def add_how_to_play_section(req: HowToPlaySection, _=Depends(require_admin)):
    with get_db() as db:
        db.execute(
            "INSERT INTO how_to_play (title, body, section_order) VALUES (?, ?, ?)",
            (req.title, req.body, req.section_order)
        )
        sid = db.execute("SELECT last_insert_rowid()").fetchone()[0]
    return {"id": sid, "message": "Section added"}


@app.put("/api/how-to-play/{section_id}")
def update_how_to_play_section(section_id: int, req: HowToPlaySection, _=Depends(require_admin)):
    with get_db() as db:
        db.execute(
            "UPDATE how_to_play SET title=?, body=?, section_order=?, updated_at=datetime('now') WHERE id=?",
            (req.title, req.body, req.section_order, section_id)
        )
    return {"message": "Section updated"}


@app.delete("/api/how-to-play/{section_id}")
def delete_how_to_play_section(section_id: int, _=Depends(require_admin)):
    with get_db() as db:
        db.execute("DELETE FROM how_to_play WHERE id=?", (section_id,))
    return {"message": "Section deleted"}


# ── League Chat ─────────────────────────────────────────────────────────
@app.get("/api/chat")
def get_chat_messages(before_id: int = None, limit: int = 50, user=Depends(get_current_user)):
    """Get chat messages, newest first. Use before_id for pagination."""
    with get_db() as db:
        if before_id:
            messages = db.execute("""
                SELECT m.id, m.message, m.created_at, u.username, u.id as user_id
                FROM chat_messages m JOIN users u ON m.user_id = u.id
                WHERE m.id < ?
                ORDER BY m.id DESC LIMIT ?
            """, (before_id, limit)).fetchall()
        else:
            messages = db.execute("""
                SELECT m.id, m.message, m.created_at, u.username, u.id as user_id
                FROM chat_messages m JOIN users u ON m.user_id = u.id
                ORDER BY m.id DESC LIMIT ?
            """, (limit,)).fetchall()
    return {"messages": [dict(m) for m in messages]}


@app.post("/api/chat")
def post_chat_message(req: ChatMessage, user=Depends(get_current_user)):
    if not req.message.strip():
        raise HTTPException(400, "Message cannot be empty")
    if len(req.message) > 2000:
        raise HTTPException(400, "Message too long (max 2000 chars)")
    with get_db() as db:
        db.execute("INSERT INTO chat_messages (user_id, message) VALUES (?, ?)",
                   (user["sub"], req.message.strip()))
        msg_id = db.execute("SELECT last_insert_rowid()").fetchone()[0]
        msg = db.execute("""
            SELECT m.id, m.message, m.created_at, u.username, u.id as user_id
            FROM chat_messages m JOIN users u ON m.user_id = u.id
            WHERE m.id = ?
        """, (msg_id,)).fetchone()

        # Notify all other subscribed users
        sender_name = msg["username"]
        other_users = db.execute("""
            SELECT DISTINCT ps.user_id FROM push_subscriptions ps
            JOIN users u ON u.id = ps.user_id
            WHERE ps.user_id != ? AND u.is_active = 1
        """, (user["sub"],)).fetchall()

    preview = req.message.strip()[:100]
    for u in other_users:
        send_push_notification(
            u["user_id"],
            f"💬 {sender_name}",
            preview,
            "/chat",
            notify_type="chat_message"
        )

    return dict(msg)


@app.delete("/api/chat/{message_id}")
def delete_chat_message(message_id: int, user=Depends(get_current_user)):
    """Delete a chat message (own message or admin)."""
    with get_db() as db:
        msg = db.execute("SELECT user_id FROM chat_messages WHERE id=?", (message_id,)).fetchone()
        if not msg:
            raise HTTPException(404, "Message not found")
        if msg["user_id"] != user["sub"] and not user.get("admin"):
            raise HTTPException(403, "Can only delete your own messages")
        db.execute("DELETE FROM chat_messages WHERE id=?", (message_id,))
    return {"message": "Deleted"}


# ── Push Notifications ──────────────────────────────────────────────────
@app.get("/api/push/vapid-key")
def get_vapid_key():
    """Get the VAPID public key for push subscription."""
    return {"public_key": get_vapid_public_key()}


@app.post("/api/push/subscribe")
def push_subscribe(subscription: dict, user=Depends(get_current_user)):
    """Subscribe to push notifications."""
    keys = subscription.get("keys", {})
    endpoint = subscription.get("endpoint")
    if not endpoint or not keys.get("p256dh") or not keys.get("auth"):
        raise HTTPException(400, "Invalid subscription")
    with get_db() as db:
        try:
            db.execute("""
                INSERT OR REPLACE INTO push_subscriptions (user_id, endpoint, p256dh, auth)
                VALUES (?, ?, ?, ?)
            """, (user["sub"], endpoint, keys["p256dh"], keys["auth"]))
        except Exception:
            pass
    return {"message": "Subscribed to push notifications"}


@app.post("/api/push/unsubscribe")
def push_unsubscribe(subscription: dict, user=Depends(get_current_user)):
    """Unsubscribe from push notifications."""
    endpoint = subscription.get("endpoint")
    if endpoint:
        with get_db() as db:
            db.execute("DELETE FROM push_subscriptions WHERE user_id=? AND endpoint=?",
                       (user["sub"], endpoint))
    return {"message": "Unsubscribed"}


@app.post("/api/push/test")
def test_push(user=Depends(get_current_user)):
    """Send a test push notification to yourself."""
    send_push_notification(user["sub"], "Matchday Test", "Push notifications are working! ⚽", "/dashboard")
    return {"message": "Test notification sent"}


class BroadcastPush(BaseModel):
    title: str
    message: str
    url: str = "/dashboard"


@app.post("/api/admin/push/broadcast")
def broadcast_push(req: BroadcastPush, _=Depends(require_admin)):
    """Admin: send a push notification to all subscribed managers."""
    with get_db() as db:
        users = db.execute("""
            SELECT DISTINCT user_id FROM push_subscriptions
        """).fetchall()
    sent = 0
    for u in users:
        send_push_notification(u["user_id"], req.title, req.message, req.url, notify_type="broadcast")
        sent += 1
    return {"message": f"Notification sent to {sent} managers"}


# ── Announcements ──────────────────────────────────────────────────────
@app.get("/api/announcements")
def get_announcements():
    with get_db() as db:
        rows = db.execute("""
            SELECT a.*, u.username as author_name
            FROM announcements a JOIN users u ON u.id = a.author_id
            ORDER BY a.created_at DESC LIMIT 20
        """).fetchall()
    return {"announcements": [dict(r) for r in rows]}


@app.post("/api/announcements")
def create_announcement(req: AnnouncementCreate, user=Depends(require_admin)):
    with get_db() as db:
        db.execute(
            "INSERT INTO announcements (title, body, author_id) VALUES (?, ?, ?)",
            (req.title, req.body, user["sub"]),
        )
        aid = db.execute("SELECT last_insert_rowid()").fetchone()[0]
    return {"id": aid, "message": "Announcement posted"}


@app.put("/api/announcements/{ann_id}")
def update_announcement(ann_id: int, req: AnnouncementUpdate, _=Depends(require_admin)):
    with get_db() as db:
        ann = db.execute("SELECT * FROM announcements WHERE id=?", (ann_id,)).fetchone()
        if not ann:
            raise HTTPException(404, "Announcement not found")
        title = req.title if req.title is not None else ann["title"]
        body = req.body if req.body is not None else ann["body"]
        db.execute(
            "UPDATE announcements SET title=?, body=?, updated_at=datetime('now') WHERE id=?",
            (title, body, ann_id),
        )
    return {"message": "Announcement updated"}


@app.delete("/api/announcements/{ann_id}")
def delete_announcement(ann_id: int, _=Depends(require_admin)):
    with get_db() as db:
        db.execute("DELETE FROM announcements WHERE id=?", (ann_id,))
    return {"message": "Announcement deleted"}


# ── Admin endpoints ────────────────────────────────────────────────────


# ── Notifications ──────────────────────────────────────────────────────
@app.get("/api/notifications")
async def get_notifications(user=Depends(get_current_user)):
    """Generate notifications for the current user based on roster and trades."""
    notifications = []

    with get_db() as db:
        team = db.execute("SELECT id, name FROM teams WHERE user_id=?", (user["sub"],)).fetchone()
        if not team:
            return {"notifications": []}

        # Injury/news alerts for rostered players
        roster = db.execute("SELECT player_id FROM roster WHERE team_id=?", (team["id"],)).fetchall()
        roster_ids = {r["player_id"] for r in roster}

        # Draft pick notifications
        draft = db.execute("SELECT * FROM draft_state WHERE status='active' ORDER BY id DESC LIMIT 1").fetchone()
        if draft:
            order = json.loads(draft["draft_order"]) if draft["draft_order"] else []
            num_teams = len(order)
            current_pick = draft["current_pick"] or 0
            draft_type = get_config_val(db, "draft_type") or "snake"
            squad_size = int(get_config_val(db, "squad_size") or "15")

            if current_pick < num_teams * squad_size and num_teams > 0:
                # Determine current picker
                round_num = current_pick // num_teams
                if draft_type == "snake" and round_num % 2 == 1:
                    idx = num_teams - 1 - (current_pick % num_teams)
                else:
                    idx = current_pick % num_teams
                current_team_id = order[idx]

                # Determine next picker
                next_pick = current_pick + 1
                next_team_id = None
                if next_pick < num_teams * squad_size:
                    next_round = next_pick // num_teams
                    if draft_type == "snake" and next_round % 2 == 1:
                        next_idx = num_teams - 1 - (next_pick % num_teams)
                    else:
                        next_idx = next_pick % num_teams
                    next_team_id = order[next_idx]

                if current_team_id == team["id"]:
                    notifications.insert(0, {
                        "type": "draft_your_pick",
                        "icon": "🏈",
                        "title": "You're On the Clock!",
                        "message": f"It's your turn to pick (Pick #{current_pick + 1}, Round {round_num + 1})",
                        "link": "/draft",
                        "time": None,
                    })
                elif next_team_id == team["id"]:
                    current_team_name = db.execute("SELECT name FROM teams WHERE id=?", (current_team_id,)).fetchone()
                    notifications.insert(0, {
                        "type": "draft_on_deck",
                        "icon": "⏳",
                        "title": "You're Up Next",
                        "message": f"Waiting on {current_team_name['name'] if current_team_name else 'unknown'} — you pick next",
                        "link": "/draft",
                        "time": None,
                    })

        # Pending trades for this team
        pending = db.execute("""
            SELECT t.*, ft.name as from_team_name, tt.name as to_team_name
            FROM trades t
            JOIN teams ft ON ft.id = t.from_team_id
            JOIN teams tt ON tt.id = t.to_team_id
            WHERE t.status='pending' AND t.to_team_id=?
        """, (team["id"],)).fetchall()
        for t in pending:
            notifications.append({
                "type": "trade_pending",
                "icon": "⇄",
                "title": "Trade Proposal",
                "message": f"{t['from_team_name']} wants to trade with you",
                "link": "/trades",
                "time": t["proposed_at"],
            })

        # Trades in review (for all managers to see)
        in_review = db.execute("""
            SELECT t.*, ft.name as from_team_name, tt.name as to_team_name
            FROM trades t
            JOIN teams ft ON ft.id = t.from_team_id
            JOIN teams tt ON tt.id = t.to_team_id
            WHERE t.status='in_review'
        """).fetchall()
        for t in in_review:
            if t["from_team_id"] != team["id"] and t["to_team_id"] != team["id"]:
                already_protested = db.execute(
                    "SELECT id FROM trade_protests WHERE trade_id=? AND team_id=?",
                    (t["id"], team["id"])
                ).fetchone()
                if not already_protested:
                    notifications.append({
                        "type": "trade_review",
                        "icon": "👀",
                        "title": "Trade Under Review",
                        "message": f"{t['from_team_name']} ⇄ {t['to_team_name']} — you can protest",
                        "link": "/trades",
                        "time": t["accepted_at"],
                    })

    # Player injury/news
    if roster_ids:
        fpl_data = await get_fpl_data()
        players = parse_players(fpl_data)
        for p in players:
            if p["id"] in roster_ids and p["status"] != "a" and p["injury_news"]:
                notifications.append({
                    "type": f"player_{p['status']}",
                    "icon": "🏥" if p["status"] == "i" else "⚠️" if p["status"] == "d" else "🔴",
                    "title": p["web_name"],
                    "message": p["injury_news"],
                    "link": "/team",
                    "time": None,
                })

    return {"notifications": notifications}


# ── League Scoring (all teams) ─────────────────────────────────────────
@app.get("/api/scoring/week/{gameweek}")
async def get_league_week_scores(gameweek: int, user=Depends(get_current_user)):
    """All teams' scores for a gameweek with player breakdowns."""
    fpl_data = await get_fpl_data()
    all_players = {p["id"]: p for p in parse_players(fpl_data)}

    # Map each club to its fixture status for this gameweek, so we can tell
    # whether a player's real-life match hasn't started, is live, or is over.
    fixtures = await get_fixtures()
    club_fixture_status = {}
    for f in fixtures:
        if f.get("event") != gameweek:
            continue
        status = "finished" if (f.get("finished") or f.get("finished_provisional")) else (
            "live" if f.get("started") else "not_started"
        )
        for club_id in (f.get("team_h"), f.get("team_a")):
            club_fixture_status[club_id] = status

    with get_db() as db:
        teams = db.execute("""
            SELECT t.id, t.name, u.username, u.has_paid, COALESCE(SUM(r.salary), 0) as total_salary
            FROM teams t JOIN users u ON t.user_id = u.id
            LEFT JOIN roster r ON r.team_id = t.id
            WHERE u.is_active = 1
            GROUP BY t.id
        """).fetchall()

        weekly_paid_rows = db.execute(
            "SELECT team_id, weekly_prize_paid FROM team_gameweek_scores WHERE gameweek=?", (gameweek,)
        ).fetchall()
        weekly_paid_map = {r["team_id"]: bool(r["weekly_prize_paid"]) for r in weekly_paid_rows}

        team_scores = []
        for team in teams:
            tid = team["id"]
            team_salary = float(team["total_salary"])

            # Get lineup with carry-forward
            lineup = db.execute(
                "SELECT player_id, is_starter FROM lineups WHERE team_id=? AND gameweek=?",
                (tid, gameweek)
            ).fetchall()
            if not lineup:
                prev = db.execute(
                    "SELECT DISTINCT gameweek FROM lineups WHERE team_id=? AND gameweek<? ORDER BY gameweek DESC LIMIT 1",
                    (tid, gameweek)
                ).fetchone()
                if prev:
                    lineup = db.execute(
                        "SELECT player_id, is_starter FROM lineups WHERE team_id=? AND gameweek=?",
                        (tid, prev["gameweek"])
                    ).fetchall()

            lineup_map = {l["player_id"]: l["is_starter"] for l in lineup}
            player_ids = [l["player_id"] for l in lineup]

            # Get scores
            gw_scores = {}
            if player_ids:
                placeholders = ",".join("?" * len(player_ids))
                rows = db.execute(
                    f"SELECT player_id, points, minutes, detail FROM gameweek_player_scores WHERE gameweek=? AND player_id IN ({placeholders})",
                    [gameweek] + player_ids
                ).fetchall()
                gw_scores = {r["player_id"]: dict(r) for r in rows}

            players_detail = []
            team_total = 0
            for pid in player_ids:
                p = all_players.get(pid, {"id": pid, "name": f"#{pid}", "web_name": f"#{pid}"})
                s = gw_scores.get(pid, {})
                is_starter = lineup_map.get(pid, 0)
                pts = s.get("points", 0) if is_starter else 0
                team_total += pts
                minutes = s.get("minutes", 0)
                fixture_status = club_fixture_status.get(p.get("club_id"), "not_started")
                if minutes > 0:
                    play_status = "played"
                elif fixture_status == "finished":
                    play_status = "did_not_play"
                elif fixture_status == "live":
                    play_status = "live"
                else:
                    play_status = "not_started"
                detail = json.loads(s.get("detail") or "{}")
                breakdown = point_breakdown(p.get("position", "?"), detail)
                players_detail.append({
                    "id": pid,
                    "name": p.get("name", f"#{pid}"),
                    "web_name": p.get("web_name", f"#{pid}"),
                    "position": p.get("position", "?"),
                    "club_name": p.get("club_name", ""),
                    "is_starter": bool(is_starter),
                    "gw_points": s.get("points", 0),
                    "counting_points": pts,
                    "minutes": minutes,
                    "play_status": play_status,
                    **breakdown,
                })
            players_detail.sort(key=lambda x: (-x["is_starter"], -x["gw_points"]))

            team_scores.append({
                "team_id": tid,
                "team_name": team["name"],
                "manager": team["username"],
                "paid": bool(team["has_paid"]),
                "weekly_prize_paid": weekly_paid_map.get(tid, False),
                "weekly_points": team_total,
                "total_salary": team_salary,
                "players": players_detail,
            })

        team_scores.sort(key=lambda x: x["weekly_points"], reverse=True)

    return {"gameweek": gameweek, "teams": team_scores}


@app.put("/api/admin/scoring/week/{gameweek}/team/{team_id}/toggle-weekly-paid")
def toggle_weekly_prize_paid(gameweek: int, team_id: int, _=Depends(require_admin)):
    """Admin: mark whether a team's weekly high-score prize has been paid out."""
    with get_db() as db:
        row = db.execute(
            "SELECT weekly_prize_paid FROM team_gameweek_scores WHERE team_id=? AND gameweek=?",
            (team_id, gameweek)
        ).fetchone()
        if row is None:
            db.execute(
                "INSERT INTO team_gameweek_scores (team_id, gameweek, weekly_points, weekly_prize_paid) VALUES (?, ?, 0, 1)",
                (team_id, gameweek)
            )
            new_val = True
        else:
            new_val = not bool(row["weekly_prize_paid"])
            db.execute(
                "UPDATE team_gameweek_scores SET weekly_prize_paid=? WHERE team_id=? AND gameweek=?",
                (int(new_val), team_id, gameweek)
            )
    return {"message": "Updated", "weekly_prize_paid": new_val}


@app.get("/api/scoring/season")
async def get_season_scoring(user=Depends(get_current_user)):
    """Full season scoring breakdown: weekly scores per team + weekly high scores."""
    fpl_data = await get_fpl_data()
    events = fpl_data.get("events", [])
    total_gws = len([e for e in events if e.get("finished") or e.get("is_current")])

    with get_db() as db:
        teams = db.execute("""
            SELECT t.id, t.name, u.username, COALESCE(SUM(r.salary), 0) as total_salary
            FROM teams t JOIN users u ON t.user_id = u.id
            LEFT JOIN roster r ON r.team_id = t.id
            WHERE u.is_active = 1
            GROUP BY t.id
        """).fetchall()

        season = []
        weekly_highs = {}  # gw -> {team_name, points}

        for team in teams:
            tid = team["id"]
            team_salary = float(team["total_salary"])
            weekly = db.execute(
                "SELECT gameweek, weekly_points FROM team_gameweek_scores WHERE team_id=? ORDER BY gameweek",
                (tid,)
            ).fetchall()
            weekly_dict = {w["gameweek"]: w["weekly_points"] for w in weekly}
            total = sum(w["weekly_points"] for w in weekly)

            # Track weekly highs
            for w in weekly:
                gw = w["gameweek"]
                if gw not in weekly_highs or w["weekly_points"] > weekly_highs[gw]["points"]:
                    weekly_highs[gw] = {"team_name": team["name"], "manager": team["username"], "points": w["weekly_points"]}

            season.append({
                "team_id": tid,
                "team_name": team["name"],
                "manager": team["username"],
                "total_points": total,
                "total_salary": team_salary,
                "weekly_scores": weekly_dict,
            })

        season.sort(key=lambda x: x["total_points"], reverse=True)

        # Payout projections
        num_managers = len(teams)
        entry_fee = float(get_config_val(db, "payout_entry_fee") or "0")
        weekly_prize = float(get_config_val(db, "payout_weekly_prize") or "0")
        pct_1st = float(get_config_val(db, "payout_1st_pct") or "0")
        pct_2nd = float(get_config_val(db, "payout_2nd_pct") or "0")
        pct_3rd = float(get_config_val(db, "payout_3rd_pct") or "0")

    total_pot = entry_fee * num_managers
    weekly_total = weekly_prize * total_gws
    season_pool = total_pot - weekly_total

    return {
        "season": season,
        "weekly_highs": weekly_highs,
        "total_gameweeks": total_gws,
        "payout": {
            "entry_fee": entry_fee,
            "num_managers": num_managers,
            "total_pot": total_pot,
            "weekly_prize": weekly_prize,
            "weekly_total": weekly_total,
            "season_pool": max(0, season_pool),
            "first": max(0, season_pool) * pct_1st / 100,
            "second": max(0, season_pool) * pct_2nd / 100,
            "third": max(0, season_pool) * pct_3rd / 100,
        },
    }


# ── Admin endpoints (continued) ───────────────────────────────────────
@app.post("/api/admin/upload-logo")
async def upload_logo(file: UploadFile = File(...), _=Depends(require_admin)):
    """Upload a league logo image."""
    if not file.content_type.startswith("image/"):
        raise HTTPException(400, "File must be an image")
    contents = await file.read()
    if len(contents) > 5 * 1024 * 1024:  # 5MB limit
        raise HTTPException(400, "Image must be under 5MB")
    logo_path = os.path.join(os.path.dirname(DB_PATH) if "/" in DB_PATH else ".", LOGO_PATH)
    with open(logo_path, "wb") as f:
        f.write(contents)
    return {"message": "Logo uploaded"}


@app.get("/api/admin/users")
def admin_list_users(_=Depends(require_admin)):
    with get_db() as db:
        users = db.execute("SELECT id, email, username, is_admin, is_active, has_paid, venmo, paypal, created_at FROM users").fetchall()
    return {"users": [dict(u) for u in users]}


@app.put("/api/admin/users/{user_id}/toggle-admin")
def toggle_admin(user_id: int, _=Depends(require_admin)):
    with get_db() as db:
        u = db.execute("SELECT is_admin FROM users WHERE id=?", (user_id,)).fetchone()
        if not u:
            raise HTTPException(404, "User not found")
        db.execute("UPDATE users SET is_admin=? WHERE id=?", (1 - u["is_admin"], user_id))
    return {"message": "Admin status toggled"}


@app.put("/api/admin/users/{user_id}/toggle-active")
def toggle_active(user_id: int, _=Depends(require_admin)):
    with get_db() as db:
        db.execute("UPDATE users SET is_active = 1 - is_active WHERE id=?", (user_id,))
    return {"message": "User status toggled"}


@app.put("/api/admin/users/{user_id}/toggle-paid")
def toggle_paid(user_id: int, _=Depends(require_admin)):
    with get_db() as db:
        db.execute("UPDATE users SET has_paid = 1 - COALESCE(has_paid, 0) WHERE id=?", (user_id,))
    return {"message": "Payment status toggled"}


@app.put("/api/admin/users/{user_id}/payment-info")
def update_user_payment_info(user_id: int, req: AdminUserPaymentInfo, _=Depends(require_admin)):
    with get_db() as db:
        target = db.execute("SELECT id FROM users WHERE id=?", (user_id,)).fetchone()
        if not target:
            raise HTTPException(404, "User not found")
        if req.venmo is not None:
            db.execute("UPDATE users SET venmo=? WHERE id=?", (req.venmo, user_id))
        if req.paypal is not None:
            db.execute("UPDATE users SET paypal=? WHERE id=?", (req.paypal, user_id))
    return {"message": "Payment info updated"}


@app.delete("/api/admin/users/{user_id}")
def delete_user(user_id: int, user=Depends(require_admin)):
    """Delete a user without losing historical data.
    Deactivates, anonymizes, and removes current season data.
    Past season scores in team_gameweek_scores are preserved."""
    with get_db() as db:
        target = db.execute("SELECT * FROM users WHERE id=?", (user_id,)).fetchone()
        if not target:
            raise HTTPException(404, "User not found")
        if target["is_admin"]:
            raise HTTPException(400, "Cannot delete an admin account")

        team = db.execute("SELECT id FROM teams WHERE user_id=?", (user_id,)).fetchone()
        if team:
            # Clear current active data but keep the team record for history
            db.execute("DELETE FROM roster WHERE team_id=?", (team["id"],))
            db.execute("DELETE FROM lineups WHERE team_id=?", (team["id"],))
            db.execute("DELETE FROM wishlist WHERE user_id=?", (user_id,))
            # Remove from active trades
            db.execute("DELETE FROM trade_protests WHERE team_id=?", (team["id"],))
            db.execute("DELETE FROM trade_players WHERE trade_id IN (SELECT id FROM trades WHERE (from_team_id=? OR to_team_id=?) AND status IN ('pending','in_review'))", (team["id"], team["id"]))
            db.execute("DELETE FROM trades WHERE (from_team_id=? OR to_team_id=?) AND status IN ('pending','in_review')", (team["id"], team["id"]))

        # Anonymize the user record (keep it for foreign key references)
        db.execute("""
            UPDATE users SET is_active=0, email=?, username=?, password_hash='deleted'
            WHERE id=?
        """, (f"deleted-{user_id}@removed", f"[Deleted User {user_id}]", user_id))

    return {"message": f"User deleted — historical data preserved"}


@app.post("/api/admin/draft/reset")
def reset_draft(_=Depends(require_admin)):
    with get_db() as db:
        season_id = get_active_season_id(db)
        db.execute("DELETE FROM draft_picks WHERE draft_id IN (SELECT id FROM draft_state WHERE season_id=?)", (season_id,))
        db.execute("DELETE FROM draft_state WHERE season_id=?", (season_id,))
        db.execute("DELETE FROM roster WHERE acquired_via='draft' AND season_id=?", (season_id,))
    return {"message": "Draft reset"}


@app.post("/api/admin/refresh-all-scores")
async def admin_refresh_all_scores(_=Depends(require_admin)):
    """Refresh scores for all completed gameweeks."""
    fpl_data = await get_fpl_data()
    events = fpl_data.get("events", [])
    refreshed = 0
    for ev in events:
        if ev.get("finished") or ev.get("is_current"):
            await refresh_gameweek_scores(ev["id"])
            refreshed += 1
    return {"message": f"Refreshed {refreshed} gameweeks"}


# ── Season Management ──────────────────────────────────────────────────
@app.get("/api/seasons")
def list_seasons(user=Depends(get_current_user)):
    with get_db() as db:
        seasons = db.execute("SELECT * FROM seasons ORDER BY id DESC").fetchall()
    return {"seasons": [dict(s) for s in seasons]}


@app.get("/api/seasons/active")
def get_active_season(user=Depends(get_current_user)):
    with get_db() as db:
        season = db.execute("SELECT * FROM seasons WHERE status='active' ORDER BY id DESC LIMIT 1").fetchone()
    return dict(season) if season else {"id": 1, "name": "2025/26", "status": "active"}


@app.post("/api/admin/seasons/end")
async def end_season(_=Depends(require_admin)):
    """End the active season: snapshot players, archive everything."""
    fpl_data = await get_fpl_data()
    players = parse_players(fpl_data)

    with get_db() as db:
        season = db.execute("SELECT * FROM seasons WHERE status='active' ORDER BY id DESC LIMIT 1").fetchone()
        if not season:
            raise HTTPException(400, "No active season")
        season_id = season["id"]

        # Snapshot all players
        for p in players:
            db.execute("""
                INSERT OR REPLACE INTO player_snapshot
                (season_id, fpl_player_id, name, web_name, position, club_name, club_short, salary, total_points)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (season_id, p["id"], p["name"], p["web_name"], p["position"],
                  p["club_name"], p["club"], p["salary"], p["total_points"]))

        # Mark season as archived
        db.execute("UPDATE seasons SET status='archived', ended_at=datetime('now') WHERE id=?", (season_id,))

    return {"message": f"Season '{season['name']}' archived with {len(players)} player snapshots"}


@app.post("/api/admin/seasons/start")
def start_new_season(req: SeasonStart, _=Depends(require_admin)):
    """Start a new season: create season, clear rosters/lineups/draft/trades."""
    name = req.name
    with get_db() as db:
        # Make sure no other season is active
        db.execute("UPDATE seasons SET status='archived', ended_at=datetime('now') WHERE status='active'")

        # Create new season
        db.execute("INSERT INTO seasons (name, status) VALUES (?, 'active')", (name,))
        new_id = db.execute("SELECT last_insert_rowid()").fetchone()[0]

        # Clear all active game data for fresh start (order matters for foreign keys)
        db.execute("DELETE FROM trade_protests")
        db.execute("DELETE FROM trade_players")
        db.execute("DELETE FROM trades")
        db.execute("DELETE FROM draft_picks")
        db.execute("DELETE FROM draft_state")
        db.execute("DELETE FROM lineups")
        db.execute("DELETE FROM roster")
        db.execute("DELETE FROM transactions")
        db.execute("DELETE FROM wishlist")
        db.execute("DELETE FROM gameweek_player_scores")
        db.execute("DELETE FROM team_gameweek_scores")

        # Reset user payment status
        db.execute("UPDATE users SET has_paid=0")

        # Update season name in config
        db.execute("UPDATE league_config SET value=? WHERE key='season_name'", (name,))

    return {"message": f"Season '{name}' started — all rosters cleared for fresh draft", "season_id": new_id}


@app.delete("/api/admin/seasons/{season_id}")
def delete_season(season_id: int, _=Depends(require_admin)):
    """Delete an archived season and its snapshot data."""
    with get_db() as db:
        season = db.execute("SELECT * FROM seasons WHERE id=?", (season_id,)).fetchone()
        if not season:
            raise HTTPException(404, "Season not found")
        if season["status"] == "active":
            raise HTTPException(400, "Cannot delete the active season")
        db.execute("DELETE FROM player_snapshot WHERE season_id=?", (season_id,))
        db.execute("DELETE FROM seasons WHERE id=?", (season_id,))
    return {"message": f"Season '{season['name']}' deleted"}


@app.post("/api/admin/remove-player")
async def admin_remove_player(req: DropPlayer, _=Depends(require_admin)):
    """Admin: remove a player from whichever team has them."""
    with get_db() as db:
        roster_entry = db.execute("""
            SELECT r.id, r.team_id, t.name as team_name
            FROM roster r JOIN teams t ON t.id = r.team_id
            WHERE r.player_id=?
        """, (req.player_id,)).fetchone()
        if not roster_entry:
            raise HTTPException(404, "Player is not on any roster")
        db.execute("DELETE FROM roster WHERE id=?", (roster_entry["id"],))
        # Only clear this player from the current/future gameweeks' lineups —
        # past gameweeks are already scored and locked, and must stay untouched
        # so historical weekly scores never change retroactively.
        current_gw = get_current_gameweek_sync() or 1
        db.execute("DELETE FROM lineups WHERE player_id=? AND gameweek>=?", (req.player_id, current_gw))
        db.execute(
            "INSERT INTO transactions (team_id, player_id, action, details) VALUES (?, ?, 'admin_remove', 'Removed by admin')",
            (roster_entry["team_id"], req.player_id),
        )
    fpl_data = await get_fpl_data()
    all_players = {p["id"]: p for p in parse_players(fpl_data)}
    player = all_players.get(req.player_id, {})
    return {"message": f"Removed {player.get('name', f'#{req.player_id}')} from {roster_entry['team_name']}"}


@app.get("/api/seasons/{season_id}/standings")
async def get_season_standings(season_id: int, user=Depends(get_current_user)):
    """Get standings for a specific (possibly archived) season."""
    with get_db() as db:
        season = db.execute("SELECT * FROM seasons WHERE id=?", (season_id,)).fetchone()
        if not season:
            raise HTTPException(404, "Season not found")

        teams = db.execute("""
            SELECT t.id, t.name, u.username
            FROM teams t JOIN users u ON t.user_id = u.id
            WHERE u.is_active = 1
        """).fetchall()

        standings = []
        for team in teams:
            weekly = db.execute(
                "SELECT gameweek, weekly_points FROM team_gameweek_scores WHERE team_id=? AND season_id=? ORDER BY gameweek",
                (team["id"], season_id)
            ).fetchall()
            weekly_dict = {w["gameweek"]: w["weekly_points"] for w in weekly}
            total = sum(w["weekly_points"] for w in weekly)
            standings.append({
                "team_id": team["id"],
                "team_name": team["name"],
                "manager": team["username"],
                "total_points": total,
                "weekly_scores": weekly_dict,
            })
        standings.sort(key=lambda x: x["total_points"], reverse=True)

    return {"season": dict(season), "standings": standings}


@app.get("/api/free-agency/status")
def get_free_agency_status(user=Depends(get_current_user)):
    """Check if free agency window is currently open."""
    with get_db() as db:
        enabled = get_config_val(db, "free_agency_enabled") == "1"
        waiver_type = get_config_val(db, "waiver_type") or "none"
        if not enabled:
            return {"enabled": False, "open": True, "waiver_type": waiver_type, "message": "Free agency restrictions are off"}

        day_start = int(get_config_val(db, "free_agency_day_start") or "2")
        day_end = int(get_config_val(db, "free_agency_day_end") or "4")
        hour_start = int(get_config_val(db, "free_agency_hour_start") or "10")
        hour_end = int(get_config_val(db, "free_agency_hour_end") or "22")

    import zoneinfo
    try:
        et = datetime.now(zoneinfo.ZoneInfo("America/New_York"))
    except Exception:
        et = datetime.now(timezone.utc) - timedelta(hours=4)
    day = et.weekday()
    hour = et.hour
    day_names = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

    in_window = day_start <= day <= day_end
    if in_window and day == day_start and hour < hour_start:
        in_window = False
    if in_window and day == day_end and hour >= hour_end:
        in_window = False

    return {
        "enabled": True,
        "open": in_window,
        "waiver_type": waiver_type,
        "window": f"{day_names[day_start]}-{day_names[day_end]}, {hour_start}:00-{hour_end}:00 ET",
        "message": "Free agency is open" if in_window else f"Free agency opens {day_names[day_start]} at {hour_start}:00 ET",
    }


# ── Waivers ─────────────────────────────────────────────────────────────
def get_waiver_priority(db) -> list:
    """Calculate waiver priority based on inverse standings (last place = priority 1)."""
    teams = db.execute("""
        SELECT t.id, t.name, COALESCE(SUM(tgs.weekly_points), 0) as total_points
        FROM teams t
        JOIN users u ON t.user_id = u.id
        LEFT JOIN team_gameweek_scores tgs ON tgs.team_id = t.id
        WHERE u.is_active = 1
        GROUP BY t.id
        ORDER BY total_points ASC
    """).fetchall()
    return [{"team_id": t["id"], "team_name": t["name"], "total_points": t["total_points"], "priority": i + 1} for i, t in enumerate(teams)]


@app.get("/api/waivers/priority")
def get_waiver_order(user=Depends(get_current_user)):
    """Get current waiver priority order (inverse standings)."""
    with get_db() as db:
        priority = get_waiver_priority(db)
    return {"priority": priority}


@app.post("/api/waivers/claim")
async def submit_waiver_claim(req: WaiverClaim, user=Depends(get_current_user)):
    """Submit a waiver claim for a player."""
    fpl_data = await get_fpl_data()
    all_players = {p["id"]: p for p in parse_players(fpl_data)}
    player = all_players.get(req.player_id)
    if not player:
        raise HTTPException(404, "Player not found")

    with get_db() as db:
        # Check draft completed
        draft = db.execute("SELECT status FROM draft_state ORDER BY id DESC LIMIT 1").fetchone()
        if not draft or draft["status"] != "completed":
            raise HTTPException(400, "Waivers are locked until the draft is complete")

        team = db.execute("SELECT id FROM teams WHERE user_id=?", (user["sub"],)).fetchone()
        if not team:
            raise HTTPException(404, "No team found")

        # Check player isn't already rostered
        taken = db.execute("SELECT t.name FROM roster r JOIN teams t ON t.id = r.team_id WHERE r.player_id=?",
                           (req.player_id,)).fetchone()
        if taken:
            raise HTTPException(400, f"Player already on {taken['name']}")

        # Check not already claimed by this user
        existing = db.execute("SELECT id FROM waiver_claims WHERE user_id=? AND player_id=? AND status='pending'",
                              (user["sub"], req.player_id)).fetchone()
        if existing:
            raise HTTPException(400, "You already have a pending claim for this player")

        # If drop player specified, validate they own them
        if req.drop_player_id:
            on_roster = db.execute("SELECT id FROM roster WHERE team_id=? AND player_id=?",
                                   (team["id"], req.drop_player_id)).fetchone()
            if not on_roster:
                raise HTTPException(400, "You don't have the player you're trying to drop")

        # Basic roster validation
        roster = db.execute("SELECT player_id, position, salary FROM roster WHERE team_id=?", (team["id"],)).fetchall()
        squad_size = int(get_config_val(db, "squad_size") or "15")
        needs_drop = len(roster) >= squad_size and not req.drop_player_id
        if needs_drop:
            raise HTTPException(400, "Roster is full — select a player to drop")

        db.execute(
            "INSERT INTO waiver_claims (user_id, team_id, player_id, drop_player_id) VALUES (?, ?, ?, ?)",
            (user["sub"], team["id"], req.player_id, req.drop_player_id)
        )
    return {"message": f"Waiver claim submitted for {player['name']}"}


@app.get("/api/waivers/claims")
def get_my_waiver_claims(user=Depends(get_current_user)):
    """Get current user's pending waiver claims."""
    with get_db() as db:
        team = db.execute("SELECT id FROM teams WHERE user_id=?", (user["sub"],)).fetchone()
        if not team:
            return {"claims": []}
        claims = db.execute("""
            SELECT * FROM waiver_claims WHERE team_id=? AND status='pending'
            ORDER BY created_at
        """, (team["id"],)).fetchall()
    return {"claims": [dict(c) for c in claims]}


@app.delete("/api/waivers/claims/{claim_id}")
def cancel_waiver_claim(claim_id: int, user=Depends(get_current_user)):
    """Cancel a pending waiver claim."""
    with get_db() as db:
        claim = db.execute("SELECT * FROM waiver_claims WHERE id=? AND user_id=? AND status='pending'",
                           (claim_id, user["sub"])).fetchone()
        if not claim:
            raise HTTPException(404, "Claim not found")
        db.execute("DELETE FROM waiver_claims WHERE id=?", (claim_id,))
    return {"message": "Claim cancelled"}


@app.post("/api/admin/waivers/process")
async def admin_process_waivers(_=Depends(require_admin)):
    """Admin: manually process all pending waiver claims."""
    results = await process_waiver_claims()
    return {"message": f"Processed {results['processed']} claims: {results['successful']} successful, {results['failed']} failed"}


async def process_waiver_claims():
    """Process all pending waiver claims in waiver priority order."""
    fpl_data = await get_fpl_data()
    all_players = {p["id"]: p for p in parse_players(fpl_data)}
    results = {"processed": 0, "successful": 0, "failed": 0}

    with get_db() as db:
        # Get waiver priority
        priority_list = get_waiver_priority(db)
        team_priority = {t["team_id"]: t["priority"] for t in priority_list}

        # Get all pending claims with priority
        claims = db.execute("SELECT * FROM waiver_claims WHERE status='pending' ORDER BY created_at").fetchall()
        if not claims:
            return results

        # Sort by waiver priority (lower number = higher priority)
        sorted_claims = sorted(claims, key=lambda c: team_priority.get(c["team_id"], 999))

        # Track players already claimed in this round
        claimed_players = set()

        for claim in sorted_claims:
            results["processed"] += 1
            player = all_players.get(claim["player_id"])

            # Skip if player already claimed by higher priority team
            if claim["player_id"] in claimed_players:
                db.execute("UPDATE waiver_claims SET status='outbid', processed_at=datetime('now') WHERE id=?", (claim["id"],))
                results["failed"] += 1
                continue

            # Skip if player was rostered since claim
            taken = db.execute("SELECT id FROM roster WHERE player_id=?", (claim["player_id"],)).fetchone()
            if taken:
                db.execute("UPDATE waiver_claims SET status='unavailable', processed_at=datetime('now') WHERE id=?", (claim["id"],))
                results["failed"] += 1
                continue

            if not player:
                db.execute("UPDATE waiver_claims SET status='failed', processed_at=datetime('now') WHERE id=?", (claim["id"],))
                results["failed"] += 1
                continue

            # Validate roster rules
            error = validate_roster(db, claim["team_id"], adding_player=player,
                                    dropping_player_id=claim["drop_player_id"])
            if error:
                db.execute("UPDATE waiver_claims SET status='failed', processed_at=datetime('now') WHERE id=?", (claim["id"],))
                results["failed"] += 1
                continue

            # Execute: drop player if specified
            if claim["drop_player_id"]:
                db.execute("DELETE FROM roster WHERE team_id=? AND player_id=?",
                           (claim["team_id"], claim["drop_player_id"]))
                db.execute(
                    "INSERT INTO transactions (team_id, player_id, action, details) VALUES (?, ?, 'drop', 'Dropped for waiver claim')",
                    (claim["team_id"], claim["drop_player_id"])
                )

            # Add player
            db.execute(
                "INSERT INTO roster (team_id, player_id, position, salary, club_id, acquired_via) VALUES (?, ?, ?, ?, ?, 'waiver')",
                (claim["team_id"], claim["player_id"], player["position"], player["salary"], player.get("club_id", 0))
            )
            db.execute(
                "INSERT INTO transactions (team_id, player_id, action, details) VALUES (?, ?, 'waiver', ?)",
                (claim["team_id"], claim["player_id"], json.dumps({"name": player["name"], "salary": player["salary"]}))
            )
            db.execute("UPDATE waiver_claims SET status='successful', processed_at=datetime('now') WHERE id=?", (claim["id"],))

            claimed_players.add(claim["player_id"])
            results["successful"] += 1

            # Notify the manager
            send_push_notification(
                claim["user_id"],
                f"Waiver Claim Won: {player['name']}",
                f"You picked up {player['name']} ({player['position']}, £{player['salary']}m) off waivers",
                "/team",
                notify_type="trade_proposed"
            )

    logger.info(f"Waivers processed: {results}")
    return results


@app.get("/api/transactions")
def get_transactions(user=Depends(get_current_user)):
    with get_db() as db:
        team = db.execute("SELECT id FROM teams WHERE user_id=?", (user["sub"],)).fetchone()
        if not team:
            return {"transactions": []}
        txns = db.execute(
            "SELECT * FROM transactions WHERE team_id=? ORDER BY created_at DESC LIMIT 50",
            (team["id"],),
        ).fetchall()
    return {"transactions": [dict(t) for t in txns]}


@app.get("/api/transactions/league")
async def get_league_transactions(team_id: int = None, action: str = None, limit: int = 100, offset: int = 0, user=Depends(get_current_user)):
    """Get all transactions across the league with player details."""
    fpl_data = await get_fpl_data()
    all_players = {p["id"]: p for p in parse_players(fpl_data)}

    with get_db() as db:
        query = """
            SELECT tx.*, t.name as team_name
            FROM transactions tx
            JOIN teams t ON t.id = tx.team_id
            WHERE 1=1
        """
        params = []
        if team_id:
            query += " AND tx.team_id=?"
            params.append(team_id)
        if action:
            query += " AND tx.action=?"
            params.append(action)
        query += " ORDER BY tx.created_at DESC LIMIT ? OFFSET ?"
        params.extend([limit, offset])

        txns = db.execute(query, params).fetchall()
        total = db.execute("SELECT COUNT(*) as c FROM transactions").fetchone()["c"]

    enriched = []
    for tx in txns:
        tx_dict = dict(tx)
        player = all_players.get(tx["player_id"], {})
        tx_dict["player_name"] = player.get("name", f"Player #{tx['player_id']}")
        tx_dict["player_position"] = player.get("position", "?")
        tx_dict["player_club"] = player.get("club_name", "")
        tx_dict["player_salary"] = player.get("salary", 0)
        enriched.append(tx_dict)

    return {"transactions": enriched, "total": total}


# ── FPL Live Gameweek Data ─────────────────────────────────────────────
async def fetch_gw_live(gw: int) -> dict:
    """Fetch live player scores for a specific gameweek."""
    url = FPL_LIVE_URL.format(gw=gw)
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(url, timeout=30)
            resp.raise_for_status()
            return resp.json()
    except Exception as e:
        logger.error(f"Failed to fetch GW {gw} live data: {e}")
        return {}


FPL_GOAL_PTS = {"GK": 6, "DEF": 6, "MID": 5, "FWD": 4}
FPL_CLEAN_SHEET_PTS = {"GK": 4, "DEF": 4, "MID": 1, "FWD": 0}
FPL_DC_THRESHOLD = {"DEF": 10, "MID": 12, "FWD": 12}


def point_breakdown(position: str, detail: dict) -> dict:
    """Break a player's FPL total_points down into what each stat actually
    earned, using the same official scoring rules FPL itself applies (goals,
    total_points, etc. are pulled straight from FPL, so this reproduces —
    not overrides — that total). Lets managers see where a score came from
    instead of just a final number.
    """
    minutes = detail.get("minutes", 0)
    goals = detail.get("goals_scored", 0)
    assists = detail.get("assists", 0)
    clean_sheet = detail.get("clean_sheets", 0)
    goals_conceded = detail.get("goals_conceded", 0)
    own_goals = detail.get("own_goals", 0)
    penalties_saved = detail.get("penalties_saved", 0)
    penalties_missed = detail.get("penalties_missed", 0)
    yellow_cards = detail.get("yellow_cards", 0)
    red_cards = detail.get("red_cards", 0)
    saves = detail.get("saves", 0)
    dc = detail.get("defensive_contribution", 0)

    return {
        "appearance": 2 if minutes >= 60 else (1 if minutes > 0 else 0),
        "goals": goals * FPL_GOAL_PTS.get(position, 4),
        "assists": assists * 3,
        "clean_sheet": FPL_CLEAN_SHEET_PTS.get(position, 0) if (clean_sheet and minutes >= 60) else 0,
        "saves": (saves // 3) if position == "GK" else 0,
        "penalty_save": penalties_saved * 5,
        "defensive_contribution": 2 if dc >= FPL_DC_THRESHOLD.get(position, 999) else 0,
        "goals_conceded": -(goals_conceded // 2) if position in ("GK", "DEF") else 0,
        "penalty_miss": penalties_missed * -2,
        "own_goal": own_goals * -2,
        "yellow_card": yellow_cards * -1,
        "red_card": red_cards * -3,
        "bonus": detail.get("bonus", 0),
    }


async def refresh_gameweek_scores(gw: int) -> dict:
    """Fetch live scores for a GW and update the database, then recalculate team scores."""
    live_data = await fetch_gw_live(gw)
    if not live_data:
        return {"updated": 0}

    elements = live_data.get("elements", [])
    updated = 0
    with get_db() as db:
        for el in elements:
            pid = el["id"]
            stats = el.get("stats", {})
            points = stats.get("total_points", 0)
            detail = json.dumps(stats)

            db.execute("""
                INSERT INTO gameweek_player_scores (gameweek, player_id, points, minutes, goals, assists, clean_sheets, bonus, detail, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
                ON CONFLICT(gameweek, player_id) DO UPDATE SET
                    points=excluded.points, minutes=excluded.minutes, goals=excluded.goals,
                    assists=excluded.assists, clean_sheets=excluded.clean_sheets, bonus=excluded.bonus,
                    detail=excluded.detail, updated_at=datetime('now')
            """, (
                gw, pid, points,
                stats.get("minutes", 0),
                stats.get("goals_scored", 0),
                stats.get("assists", 0),
                stats.get("clean_sheets", 0),
                stats.get("bonus", 0),
                detail,
            ))
            updated += 1

        # Recalculate team scores for this GW
        teams = db.execute("SELECT id FROM teams").fetchall()
        for team in teams:
            tid = team["id"]
            # Get starters for this GW (with carry-forward)
            starters = db.execute(
                "SELECT player_id FROM lineups WHERE team_id=? AND gameweek=? AND is_starter=1",
                (tid, gw)
            ).fetchall()
            if not starters:
                # Carry forward from most recent previous GW
                prev = db.execute(
                    "SELECT DISTINCT gameweek FROM lineups WHERE team_id=? AND gameweek<? ORDER BY gameweek DESC LIMIT 1",
                    (tid, gw)
                ).fetchone()
                if prev:
                    starters = db.execute(
                        "SELECT player_id FROM lineups WHERE team_id=? AND gameweek=? AND is_starter=1",
                        (tid, prev["gameweek"])
                    ).fetchall()
            starter_ids = [s["player_id"] for s in starters]

            if starter_ids:
                placeholders = ",".join("?" * len(starter_ids))
                row = db.execute(
                    f"SELECT COALESCE(SUM(points), 0) as total FROM gameweek_player_scores WHERE gameweek=? AND player_id IN ({placeholders})",
                    [gw] + starter_ids
                ).fetchone()
                weekly = row["total"]
            else:
                weekly = 0

            db.execute("""
                INSERT INTO team_gameweek_scores (team_id, gameweek, weekly_points, updated_at)
                VALUES (?, ?, ?, datetime('now'))
                ON CONFLICT(team_id, gameweek) DO UPDATE SET
                    weekly_points=excluded.weekly_points, updated_at=datetime('now')
            """, (tid, gw, weekly))

    return {"updated": updated, "gameweek": gw}


def resolve_current_gw(events: list) -> Optional[int]:
    """Determine the gameweek managers should currently be acting on.

    FPL's own `is_current` flag stays on a gameweek until the *next* one's
    deadline passes, not until its matches finish — so once GW1 is over but
    GW2 hasn't kicked off, FPL still reports GW1 as is_current and GW2 as
    is_next. Preferring a finished is_current over is_next left the app
    (score refresh, standings, lineup defaults) stuck on the just-finished
    week during that whole gap, so an unfinished is_current is checked
    first, then is_next, before falling back to whatever FPL marked.
    """
    for ev in events:
        if ev.get("is_current") and not ev.get("finished"):
            return ev["id"]
    for ev in events:
        if ev.get("is_next"):
            return ev["id"]
    for ev in events:
        if ev.get("is_current"):
            return ev["id"]
    finished_ids = [ev["id"] for ev in events if ev.get("finished")]
    return max(finished_ids) if finished_ids else None


def get_current_gameweek_sync() -> Optional[int]:
    """Synchronously determine the current/active gameweek from cached bootstrap data."""
    if not os.path.exists(FPL_CACHE_FILE):
        return None
    with open(FPL_CACHE_FILE) as f:
        data = json.load(f)
    return resolve_current_gw(data.get("events", []))


# ── Lineup endpoints ───────────────────────────────────────────────────
@app.post("/api/lineup")
async def set_lineup(req: SetLineup, user=Depends(get_current_user)):
    if len(req.starters) != 11:
        raise HTTPException(400, "Must select exactly 11 starters")
    if len(set(req.starters)) != 11:
        raise HTTPException(400, "Duplicate players in lineup")

    fpl_data = await get_fpl_data()
    all_players = {p["id"]: p for p in parse_players(fpl_data)}

    with get_db() as db:
        # Lineup lock check
        lock_enabled = get_config_val(db, "lineup_lock_enabled") == "1"
        if lock_enabled:
            events = fpl_data.get("events", [])
            for ev in events:
                if ev["id"] == req.gameweek:
                    deadline = ev.get("deadline_time")
                    if deadline:
                        from datetime import timezone as tz
                        dl = datetime.fromisoformat(deadline.replace("Z", "+00:00"))
                        if datetime.now(tz.utc) > dl:
                            raise HTTPException(400, f"GW{req.gameweek} deadline has passed. Lineups are locked.")
                    break

        team = db.execute("SELECT id FROM teams WHERE user_id=?", (int(user["sub"]),)).fetchone()
        if not team:
            raise HTTPException(404, "No team found")

        roster_error = validate_roster(db, team["id"])
        if roster_error:
            raise HTTPException(400, f"Your roster breaks a league rule and must be fixed before you can set a lineup: {roster_error}")

        roster = db.execute("SELECT player_id FROM roster WHERE team_id=?", (team["id"],)).fetchall()
        roster_ids = {r["player_id"] for r in roster}

        # Validate all starters are on roster
        for pid in req.starters:
            if pid not in roster_ids:
                raise HTTPException(400, f"Player {pid} is not on your roster")

        # Validate formation: 1 GK, min DEF/MID/FWD
        pos_counts = {"GK": 0, "DEF": 0, "MID": 0, "FWD": 0}
        for pid in req.starters:
            p = all_players.get(pid)
            if p:
                pos_counts[p["position"]] = pos_counts.get(p["position"], 0) + 1

        if pos_counts["GK"] != 1:
            raise HTTPException(400, "Must start exactly 1 GK")

        min_def = int(get_config_val(db, "min_starting_def"))
        min_mid = int(get_config_val(db, "min_starting_mid"))
        min_fwd = int(get_config_val(db, "min_starting_fwd"))

        if pos_counts["DEF"] < min_def:
            raise HTTPException(400, f"Need at least {min_def} defenders")
        if pos_counts["MID"] < min_mid:
            raise HTTPException(400, f"Need at least {min_mid} midfielders")
        if pos_counts["FWD"] < min_fwd:
            raise HTTPException(400, f"Need at least {min_fwd} forwards")

        # Clear and set lineup
        db.execute("DELETE FROM lineups WHERE team_id=? AND gameweek=?", (team["id"], req.gameweek))
        for pid in roster_ids:
            db.execute(
                "INSERT INTO lineups (team_id, gameweek, player_id, is_starter) VALUES (?, ?, ?, ?)",
                (team["id"], req.gameweek, pid, 1 if pid in req.starters else 0)
            )

    return {"message": f"Lineup set for GW{req.gameweek}", "starters": req.starters}


@app.get("/api/lineup/{gameweek}")
async def get_lineup(gameweek: int, user=Depends(get_current_user)):
    with get_db() as db:
        team = db.execute("SELECT id FROM teams WHERE user_id=?", (int(user["sub"]),)).fetchone()
        if not team:
            raise HTTPException(404, "No team found")
        rows = db.execute(
            "SELECT player_id, is_starter FROM lineups WHERE team_id=? AND gameweek=?",
            (team["id"], gameweek)
        ).fetchall()

        # Carry forward: if no lineup for this GW, use most recent previous
        carried_from = None
        if not rows:
            prev = db.execute(
                "SELECT DISTINCT gameweek FROM lineups WHERE team_id=? AND gameweek<? ORDER BY gameweek DESC LIMIT 1",
                (team["id"], gameweek)
            ).fetchone()
            if prev:
                carried_from = prev["gameweek"]
                rows = db.execute(
                    "SELECT player_id, is_starter FROM lineups WHERE team_id=? AND gameweek=?",
                    (team["id"], carried_from)
                ).fetchall()

        # Drop anyone since traded/dropped from the roster — a saved (or
        # carried-forward) lineup can't silently hold a slot with a player
        # who's no longer on the team, whether they left before or after
        # this lineup was last saved.
        current_roster_ids = {r["player_id"] for r in db.execute(
            "SELECT player_id FROM roster WHERE team_id=?", (team["id"],)
        ).fetchall()}
        rows = [r for r in rows if r["player_id"] in current_roster_ids]

    fpl_data = await get_fpl_data()
    all_players = {p["id"]: p for p in parse_players(fpl_data)}

    starters = []
    bench = []
    for r in rows:
        player = all_players.get(r["player_id"], {"id": r["player_id"], "web_name": f"#{r['player_id']}"})
        if r["is_starter"]:
            starters.append(player)
        else:
            bench.append(player)

    return {"gameweek": gameweek, "starters": starters, "bench": bench, "carried_from": carried_from}


# ── Scoring & Standings ────────────────────────────────────────────────
@app.post("/api/scores/refresh")
async def manual_refresh_scores(user=Depends(get_current_user)):
    """Manual refresh of current gameweek scores."""
    fpl_data = await get_fpl_data()
    events = fpl_data.get("events", [])
    current_gw = resolve_current_gw(events)
    if not current_gw:
        raise HTTPException(400, "Cannot determine current gameweek")

    # Also refresh whatever FPL itself still calls "current" — its is_current
    # flag lingers on the just-finished GW until the next one's deadline
    # passes, and bonus points can keep changing during that gap.
    fpl_current_gw = next((ev["id"] for ev in events if ev.get("is_current")), None)
    gws_to_refresh = {g for g in (current_gw, fpl_current_gw) if g}

    total_updated = 0
    for gw in gws_to_refresh:
        result = await refresh_gameweek_scores(gw)
        total_updated += result.get("updated", 0)
    label = "GW" + "/GW".join(str(g) for g in sorted(gws_to_refresh))
    return {"message": f"Scores refreshed for {label}", "updated": total_updated}


@app.post("/api/scores/refresh/{gameweek}")
async def refresh_specific_gw(gameweek: int, _=Depends(require_admin)):
    """Admin: refresh scores for a specific gameweek."""
    result = await refresh_gameweek_scores(gameweek)
    return {"message": f"Scores refreshed for GW{gameweek}", **result}


@app.get("/api/standings")
async def get_standings():
    """League standings: weekly and cumulative scores for all teams."""
    fpl_data = await get_fpl_data()
    events = fpl_data.get("events", [])

    # Find current GW
    current_gw = resolve_current_gw(events) or 1

    with get_db() as db:
        teams = db.execute("""
            SELECT t.id, t.name, u.username, u.has_paid
            FROM teams t JOIN users u ON t.user_id = u.id
            WHERE u.is_active = 1
        """).fetchall()

        standings = []
        for team in teams:
            weekly = db.execute(
                "SELECT gameweek, weekly_points FROM team_gameweek_scores WHERE team_id=? ORDER BY gameweek",
                (team["id"],)
            ).fetchall()

            weekly_dict = {w["gameweek"]: w["weekly_points"] for w in weekly}
            total_points = sum(w["weekly_points"] for w in weekly)

            # Current GW points
            current_week_pts = weekly_dict.get(current_gw, 0)

            standings.append({
                "team_id": team["id"],
                "team_name": team["name"],
                "manager": team["username"],
                "paid": bool(team["has_paid"]),
                "total_points": total_points,
                "current_gw_points": current_week_pts,
                "weekly_scores": weekly_dict,
            })

        # Sort by total points descending
        standings.sort(key=lambda x: x["total_points"], reverse=True)

    return {
        "standings": standings,
        "current_gameweek": current_gw,
    }


@app.get("/api/scores/{gameweek}/players")
async def get_gw_player_scores(gameweek: int, user=Depends(get_current_user)):
    """Get player-level scores for a gameweek, for the user's team."""
    with get_db() as db:
        team = db.execute("SELECT id FROM teams WHERE user_id=?", (int(user["sub"]),)).fetchone()
        if not team:
            raise HTTPException(404, "No team found")

        # Get lineup (with carry-forward)
        lineup = db.execute(
            "SELECT player_id, is_starter FROM lineups WHERE team_id=? AND gameweek=?",
            (team["id"], gameweek)
        ).fetchall()
        if not lineup:
            prev = db.execute(
                "SELECT DISTINCT gameweek FROM lineups WHERE team_id=? AND gameweek<? ORDER BY gameweek DESC LIMIT 1",
                (team["id"], gameweek)
            ).fetchone()
            if prev:
                lineup = db.execute(
                    "SELECT player_id, is_starter FROM lineups WHERE team_id=? AND gameweek=?",
                    (team["id"], prev["gameweek"])
                ).fetchall()

        # Get scores
        player_ids = [l["player_id"] for l in lineup]
        if not player_ids:
            return {"gameweek": gameweek, "players": [], "total": 0}

        placeholders = ",".join("?" * len(player_ids))
        scores = db.execute(
            f"SELECT * FROM gameweek_player_scores WHERE gameweek=? AND player_id IN ({placeholders})",
            [gameweek] + player_ids
        ).fetchall()
        score_map = {s["player_id"]: dict(s) for s in scores}

    fpl_data = await get_fpl_data()
    all_players = {p["id"]: p for p in parse_players(fpl_data)}

    lineup_map = {l["player_id"]: l["is_starter"] for l in lineup}
    players = []
    starter_total = 0
    for pid in player_ids:
        p = all_players.get(pid, {"id": pid, "name": f"#{pid}", "web_name": f"#{pid}"})
        s = score_map.get(pid, {})
        is_starter = lineup_map.get(pid, 0)
        pts = s.get("points", 0) if is_starter else 0
        starter_total += pts
        detail = json.loads(s.get("detail") or "{}")
        breakdown = point_breakdown(p.get("position", "?"), detail)
        players.append({
            **p,
            "gw_points": s.get("points", 0),
            "counting_points": pts,
            "is_starter": bool(is_starter),
            "gw_minutes": s.get("minutes", 0),
            "gw_appearance": breakdown["appearance"],
            "gw_goals": breakdown["goals"],
            "gw_assists": breakdown["assists"],
            "gw_clean_sheets": breakdown["clean_sheet"],
            "gw_bonus": breakdown["bonus"],
            "gw_defensive_contribution": breakdown["defensive_contribution"],
            "gw_goals_conceded": breakdown["goals_conceded"],
            "gw_saves": breakdown["saves"],
            "gw_penalty_save": breakdown["penalty_save"],
            "gw_penalty_miss": breakdown["penalty_miss"],
            "gw_own_goal": breakdown["own_goal"],
            "gw_yellow_card": breakdown["yellow_card"],
            "gw_red_card": breakdown["red_card"],
        })

    # Sort: starters first, then by points
    players.sort(key=lambda x: (-x["is_starter"], -x["gw_points"]))

    return {"gameweek": gameweek, "players": players, "total": starter_total}


# ── Background Score Refresh ───────────────────────────────────────────
async def auto_refresh_scores():
    """Background task: refresh scores and process expired trade reviews."""
    try:
        fpl_data = await get_fpl_data()
        events = fpl_data.get("events", [])
        current_gw = resolve_current_gw(events)
        fpl_current_gw = next((ev["id"] for ev in events if ev.get("is_current")), None)
        for gw in {g for g in (current_gw, fpl_current_gw) if g}:
            result = await refresh_gameweek_scores(gw)
            logger.info(f"Auto-refresh GW{gw}: updated {result.get('updated', 0)} players")
    except Exception as e:
        logger.error(f"Auto-refresh failed: {e}")

    # Process expired trade reviews
    try:
        await process_expired_reviews()
    except Exception as e:
        logger.error(f"Trade review processing failed: {e}")


_scheduler_task = None

async def score_scheduler():
    """Run score refresh every hour + lineup reminders + draft timer."""
    while True:
        await check_draft_timer()
        await asyncio.sleep(30)  # Check draft timer every 30 seconds
        # Run hourly tasks every 120 iterations (120 * 30s = 1 hour)


async def hourly_scheduler():
    """Run hourly tasks."""
    while True:
        await asyncio.sleep(3600)
        await auto_refresh_scores()
        await send_lineup_reminders()
        await refresh_roster_club_ids()


async def send_lineup_reminders():
    """Check for upcoming GW deadlines and remind managers who haven't set lineups."""
    try:
        fpl_data = await get_fpl_data()
        events = fpl_data.get("events", [])

        # Find the next upcoming gameweek
        next_gw = None
        for ev in events:
            if ev.get("is_next"):
                next_gw = ev
                break

        if not next_gw or not next_gw.get("deadline_time"):
            return

        deadline = datetime.fromisoformat(next_gw["deadline_time"].replace("Z", "+00:00"))
        now = datetime.now(timezone.utc)
        hours_until = (deadline - now).total_seconds() / 3600

        # Send reminder when deadline is 12-13 hours away (catches the hourly check once)
        if not (12 <= hours_until <= 13):
            return

        gw = next_gw["id"]
        with get_db() as db:
            teams = db.execute("""
                SELECT t.id, t.name, t.user_id FROM teams t
                JOIN users u ON t.user_id = u.id
                WHERE u.is_active = 1
            """).fetchall()

            for team in teams:
                lineup = db.execute(
                    "SELECT id FROM lineups WHERE team_id=? AND gameweek=?",
                    (team["id"], gw)
                ).fetchone()
                if not lineup:
                    send_push_notification(
                        team["user_id"],
                        f"Set Your Lineup — GW{gw}",
                        f"Deadline is in ~12 hours! Your lineup will carry forward if you don't update it.",
                        "/team",
                        notify_type="lineup_reminder"
                    )
                    logger.info(f"Sent lineup reminder to {team['name']} for GW{gw}")
    except Exception as e:
        logger.error(f"Lineup reminder error: {e}")
