# Matchday Yanks — Release Notes

## v1.0.0 — July 2026 🎉

### Final Release Features
- **Enhanced Trade Cards** — Trade page now shows full player details for each side: position badge, full name, club name, salary, season points, and injury status. Each team's salary cap status is displayed below their players with a visual salary bar showing used/remaining budget and player count.
- **Trade Proposal Validation** — Trades are now validated before they can be proposed. The system simulates the swap and checks both teams for salary cap, position limits, and club limits. Illegal trades are blocked with a clear error message.
- **Trade Auto-Processing Fix** — Fixed timestamp comparison for expired review periods. Trades that fail during auto-processing are now marked as "Failed — Rule Violation" instead of staying stuck in review.
- **How to Play Page** — Admin-editable guide with 9 default sections covering everything from getting started to draft tips. Admin can add, edit, reorder, and delete sections from the page itself.

### Full Feature List (v1.0)
- Salary cap draft league with real FPL player data (500+ players)
- Snake/linear draft with wishlist, club filter, and club limit indicators
- Email/password auth with profile management (email, password, Venmo, PayPal)
- Team roster management with salary cap, position limits, and club limits
- Starting XI lineup setting with formation validation and carry-forward
- Lineup lock after GW deadline
- Free agency window (admin-configurable days/hours)
- Weekly scoring from FPL API with hourly auto-refresh
- League standings with weekly and cumulative points
- Dedicated Scoring page (week view with expandable rosters, season view with weekly highs)
- Payout system (entry fee, weekly high score prizes, season finish payouts)
- Trade system with league review, protest voting, and upfront validation
- Notification cards (injuries, trades, reviews)
- Admin announcements
- Admin-editable How to Play guide
- Schedule page with all PL fixtures by gameweek
- All Rosters page for league-wide visibility
- FotMob direct links with cached player/team IDs
- Multi-season support with archiving and player snapshots
- Mobile-responsive with hamburger menu
- Payment tracking (admin marks paid/unpaid)
- Rules & Scoring page with full breakdown

---

## v0.5.0 — July 2026

### New Features
- **Free Agency Window** — Admin can enable a weekly window for player pickups (e.g., Tuesday-Thursday 10am-10pm ET). Outside the window, the Add button is blocked with a message showing when it reopens. Configurable days and hours in Admin → Free Agency.
- **Lineup Lock** — Lineups automatically lock after each gameweek's official FPL deadline. The Set Lineup tab shows the deadline with a countdown and displays a locked message when it's passed. Backend enforces the lock even if the frontend is bypassed.
- **Multi-Season Support** — New Seasons tab in Admin panel:
  - *End Season*: snapshots all 500+ player records, archives scores/rosters/trades, marks season as read-only
  - *Start New Season*: creates a fresh season, resets payment tracking — teams and managers carry over for a new draft
  - Season history table showing all past and current seasons
  - Season name displayed in sidebar (e.g., "Fantasy Football League · 2025/26")
  - Season-specific standings endpoint for archived seasons
- **Admin Refresh All GWs** — One-click button in Admin → Draft Control to refresh scores for all completed gameweeks. No more terminal commands.
- **Free Agency Status on Players Page** — Green/red banner showing whether the free agency window is currently open.
- **GW Deadline on My Team** — Set Lineup tab shows deadline date/time with lock status indicator.
- **Free Agency & Lineup Rules** — Both explained on the Rules & Scoring page.

---

## v0.4.0 — July 2026

### UI/UX Fixes
- **Mobile Menu** — Sidebar now slides in/out with a hamburger button on mobile. Includes an overlay backdrop and auto-closes when you tap a nav link. No more hidden menu.
- **Full Player Names** — All pages now show first and last name instead of just the shortened web name.
- **Full Club Names** — All pages now show the full club name (e.g., "Manchester United" instead of "MUN").

### New Features
- **Refresh Scores** — Button added to My Team, Scoring, and Players pages (previously only on Dashboard).
- **Team Salaries on Scoring Pages** — Week view shows salary under each team's points. Season view adds a Salary column to the standings table.
- **Roster Composition Bar** — Players page shows your current roster breakdown (e.g., GK 2/2, DEF 3/5, MID 4/5, FWD 1/3) under the salary cap bar. Position counts turn red when full.
- **Payment Tracking** — Admin can mark each manager as Paid/Unpaid from the Users tab. Green checkmark or red X shows payment status.
- **Payment Info on Rules Page** — Venmo (@cognative) and PayPal (@dylanmcintosh) handles displayed in the payout section. Editable from Admin config.
- **Auto DB Migration** — Missing columns and tables are automatically added on startup. No more manual SQL needed when updating.

---

## v0.3.0 — July 2026

### New Features
- **Notification Cards** — Dashboard shows real-time alerts for player injuries, trade proposals awaiting your response, and trades under league review you can protest. Click any notification to jump to the relevant page.
- **Scoring Page** — Dedicated page with two views:
  - *Week View*: select any gameweek and see all teams ranked by score, with expandable rosters showing every player's stats (minutes, goals, assists, CS, bonus). Click a team to expand.
  - *Season View*: full cumulative standings with every gameweek column. Weekly high scores are highlighted in accent color. Includes a weekly high score winners table.
- **Payout System** — Admin-configurable entry fee, weekly high score prize, and season finish payouts (1st/2nd/3rd percentage splits). Shown on:
  - Dashboard: prize pool summary card with total pot, weekly prize, and projected payouts
  - Scoring page season view: payout stats at top
  - Rules page: full breakdown with calculated dollar amounts based on number of managers
  - Admin panel: editable under new "Payouts" config group

### Improvements
- Dashboard notification cards are color-coded by type (injuries red, trades yellow, reviews blue)
- Weekly high score winner highlighted across the full season scoring table
- Payout projections update automatically as managers join

---

## v0.2.0 — July 2026

### New Features
- **Announcements** — Admin can post, edit, and delete announcements shown at the top of the Dashboard. Great for season updates, rule changes, and league news.
- **League Trade Review** — Trades now go through a 3-step process: proposal → acceptance → league review. All managers can see pending trades and file protests during the review period. If enough managers protest (configurable threshold), the trade is vetoed. Otherwise it auto-completes when the review window closes.
- **Trade UI Overhaul** — No more typing player IDs. Select a team to trade with and click to pick players from both rosters. Trades now show full player details (name, position, salary).
- **Lineup Carry-Forward** — If you forget to set a lineup for a gameweek, your most recent lineup automatically carries forward. A notice shows when this happens so you can save to lock it in.
- **Player Pagination** — Players page now shows 50 per page with full pagination controls. No more capped lists.
- **Salary Cap on Players Page** — Your budget used/remaining is shown at the top of the Players page so you know what you can afford while browsing.
- **Gameweek Score Filter** — Filter the Players page by gameweek to see how every player scored that week, with sortable columns for GW points, minutes, goals, assists, clean sheets, and bonus.
- **Trade Rules on Rules Page** — Full explanation of the trade process, review period, and protest threshold added to the Rules & Scoring page.

### Improvements
- All columns on the Players page are now sortable (click headers to toggle)
- Players show full first + last name instead of just web name
- Owner column shows which team has each player (or "Free Agent")
- Add button only appears for free agents
- Trade protest threshold and review period are admin-configurable

### Bug Fixes
- Fixed JWT `sub` claim type for PyJWT compatibility (no more auth failures)
- Fixed scoring engine to use carry-forward lineups when calculating weekly points

---

## v0.1.0 — Initial Release

- Salary cap draft league with FPL player data
- Email/password auth with password reset
- Snake/linear draft board
- Team management (add/drop players with salary cap enforcement)
- Trade proposals (accept/reject)
- Admin panel with customizable rules and scoring
- Match schedule with gameweek fixtures and scores
- Rules & Scoring page with payout placeholder
- Hourly auto-refresh of player scores with manual refresh button
- League standings with weekly and cumulative points
- Set starting XI lineup with formation validation
- GW Scores tab showing per-player point breakdowns
