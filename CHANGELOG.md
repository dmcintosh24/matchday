# Changelog

All notable changes to Matchday will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

## [2.0.1] - 2026-08-25

### Added
- **Payment Status Indicator** — managers can see who still owes league dues via an "UNPAID" badge on the Dashboard standings, My Team page, and Scoring page.
- **Played/Live/Not Started Status** — Scoring page player breakdown now shows whether each player's real-life match hasn't started, is live, or has finished (and whether they actually featured).
- **Club Name on Scoring Page** — player rows in the Scoring page breakdown now show their club alongside their name.

### Fixed
- **Scoring Page Default Gameweek** — now correctly defaults to the current gameweek (falling back through current → next → last finished) instead of sometimes landing on the wrong week.
- **Schedule Page Stuck on "Live"** — completed fixtures no longer show "Live - 90'" for hours after full-time; now reflects FPL's provisional finished status immediately at the final whistle.
- **Stale Roster Club Data** — a rostered player's club now stays in sync with real-life transfers (previously the club captured at draft/waiver time never updated, so the UI could show incorrect club counts, e.g. appearing to exceed the max-players-per-club limit when it hadn't).
- **Lineup Lock-In Now Blocked on Roster Rule Violations** — if a roster breaks a league rule (salary cap, position limits, max-per-club, etc.), managers can no longer save/lock a gameweek lineup until it's fixed; they now get a clear error explaining what to correct.

## [2.0.0] - 2026-08-13

### Added
- **Rolling Waivers** — inverse standings waiver system for free agency. Last place gets first pick at free agents. Managers submit claims during the window, processed in priority order when it closes.
- **Draft Queue** — pre-rank players before the draft with drag-to-reorder and arrow buttons. Auto-draft picks from your queue when it's your turn.
- **Auto-Draft** — toggle on to have the system pick for you automatically from your queue or best available.
- **Draft Timer** — configurable countdown per pick (default 5 minutes). Auto-picks when time expires.
- **Auto-Enable Auto-Draft** — after 3 missed picks (timer expires), auto-draft turns on automatically with a push notification.
- **Draft Scorecard** — "Draft Grades" tab appears after draft completes with A-F grades, stats, and best/worst picks for every team.
- **Draft Board Improvements** — round number display, roster composition bar (position counts + salary budget), full draft order sidebar, complete pick history, block unavailable/transferred players.
- **PWA (Progressive Web App)** — installable on home screen, offline caching, standalone display mode.
- **Push Notifications** — Web Push via VAPID keys for draft picks, trade proposals, lineup reminders, chat messages, and admin broadcasts.
- **Admin Notification Controls** — toggle each notification type on/off league-wide.
- **Admin Broadcast Push** — send custom push notifications to all managers from the admin panel.
- **League Chat** — real-time in-app messaging with push notifications, delete own messages, admin moderation.
- **Transaction History Page** — league-wide log of all adds, drops, drafts, trades, and waiver claims with team/action filters and pagination.
- **Team Logo Upload** — managers upload team logos, displayed on My Team, All Rosters, Scoring, and Dashboard.
- **Team Rename** — edit team name from My Team page.
- **Logo Lightbox** — click team logo to view full size.
- **Free Agent Filter** — filter Players page by All / Free Agents / Rostered.
- **Admin Remove Player** — search and remove any player from any team.
- **Admin Delete Past Seasons** — remove archived season data.
- **Delete Users** — remove users without losing historical data (anonymizes record).
- **Inactive Users Hidden** — disabled managers don't appear in draft, standings, scoring, or rosters.
- **Missing Teams Indicator** — All Rosters page shows managers who haven't created a team yet.
- **Waiver Priority Display** — endpoint showing current waiver order based on standings.
- **Admin Process Waivers** — manual button to process pending waiver claims.
- **Configurable Draft Timer** — set minutes per pick in Admin → League Settings.

### Changed
- App version bumped to 2.0.0
- Draft board completely redesigned with queue tab, timer bar, and scorecard tab
- Players page filters unavailable/transferred players by default
- Trade proposals now pre-validate both teams for salary cap, position limits, and club limits
- Trade auto-processor fixed with timestamp normalization
- Failed trades marked as "failed" instead of stuck in review
- FotMob search fixed to extract names from text|id format
- FotMob links use correct apigw.fotmob.com endpoint
- VAPID keys stored in persistent data directory
- Start New Season properly clears all roster/lineup/trade/score data
- API client only sends Content-Type header when body exists (Safari fix)
- Draft picks reset pick_started_at for timer tracking
- sqlite3.Row objects converted to dict before .get() calls

### Fixed
- Queue player names disappearing when position filter was active
- Unavailable/transferred players could be drafted
- Start New Season foreign key constraint error (deletion order)
- "loadUsers" undefined error when deleting users
- React hooks called after early return (error #310)
- useFotMob.js needed .jsx extension for Vite
- python-multipart missing for file uploads
- Empty SECRET_KEY after rsync with --delete flag

## [1.1.0] - 2026-07-18

### Added
- **Setup Wizard** — first-run experience: name your league, upload a logo, create admin account
- **Configurable League Name** — each installation has its own name and subtitle, stored in the database
- **Custom Logo Upload** — admin can upload a league logo displayed on sidebar, login, and mobile header
- **Version Display** — "Powered by Matchday v1.1.0" in sidebar footer with GitHub link
- **Health Check** — `/api/health` endpoint for monitoring
- **Version Endpoint** — `/api/version` returns app version and GitHub URL
- **Setup Status** — `/api/setup/status` for first-run detection

### Changed
- App rebranded from hardcoded "Matchday Yanks" to configurable "Matchday" platform
- Login and register pages use dynamic league name from config
- Personal defaults (Venmo/PayPal) cleared for open-source release
- Admin panel includes League Branding config group and logo upload

## [1.0.0] - 2026-07-16

### Added
- Salary cap draft league with real FPL player data (500+ players)
- Snake/linear draft with wishlist, club filter, and club limit enforcement
- Email/password authentication with JWT tokens
- Profile management (email, password, Venmo, PayPal)
- Team roster management with salary cap, position limits, and club limits
- Starting XI lineup setting with formation validation
- Lineup carry-forward (most recent lineup applies if none set)
- Lineup lock after gameweek deadline
- Free agency window (admin-configurable days/hours)
- Weekly scoring from FPL API with hourly auto-refresh
- Manual score refresh on Dashboard, My Team, Players, and Scoring pages
- League standings with weekly and cumulative points
- Dedicated Scoring page (week view with expandable rosters, season view)
- Weekly Wins Summary leaderboard
- Payout system (entry fee, weekly prizes, season finish payouts)
- Trade system with league review, protest voting, and upfront validation
- Trade cards with full player details and salary cap info
- Notification cards (draft picks, injuries, trades, reviews)
- Admin announcements (CRUD)
- Admin-editable How to Play guide
- Schedule page with all PL fixtures by gameweek
- All Rosters page for league-wide visibility
- FotMob direct player/team links with cached IDs
- Multi-season support with archiving and player snapshots
- Mobile-responsive with hamburger menu
- Payment tracking (admin marks paid/unpaid)
- Rules & Scoring page with full breakdown
- Club limit indicators on My Team, All Rosters, and Draft Board
- Player pagination (50 per page)
- Sortable columns on Players and Draft Board
- Roster composition bar on Players page
- Admin panel with configurable rules, user management, draft control, and season management
- Admin "Refresh All Gameweeks" button
