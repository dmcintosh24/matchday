# Changelog

All notable changes to Matchday will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

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
