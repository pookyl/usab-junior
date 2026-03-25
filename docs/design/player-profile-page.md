# Player Profile Page

**Route:** `/directory/:id`
**Component:** `PlayerProfile` (`src/pages/PlayerProfile.tsx`, 1373 lines)

## Purpose

The Player Profile page provides a comprehensive view of a single junior badminton player, combining data from USAB rankings and TournamentSoftware.com (TSW). It shows current rankings, historical ranking trends, career match statistics, and a full tournament-by-tournament match history.

## Data Flow

```mermaid
sequenceDiagram
    participant U as User
    participant PP as PlayerProfile.tsx
    participant PC as PlayersContext
    participant RS as rankingsService.ts
    participant API1 as /api/player/:id
    participant API2 as /api/player/:id/tsw-stats
    participant API3 as /api/player/:id/ranking-trend
    participant USAB as usabjrrankings.org
    participant TSW as tournamentsoftware.com

    U->>PP: navigate to /directory/:id
    PP->>PC: usePlayers()
    PC-->>PP: players + directoryPlayers (name lookup)

    par Parallel fetches
        PP->>RS: fetchPlayerDetail(usabId, ageGroup, eventType)
        RS->>API1: GET /api/player/:id
        API1->>USAB: scrape player detail HTML
        USAB-->>API1: HTML
        API1-->>RS: { gender, entries: TournamentEntry[] }

        PP->>RS: fetchPlayerTswStats(usabId, name)
        RS->>API2: GET /api/player/:id/tsw-stats
        API2->>TSW: scrape TSW profile
        TSW-->>API2: HTML
        API2-->>RS: TswPlayerStats

        PP->>RS: fetchPlayerRankingTrend(usabId)
        RS->>API3: GET /api/player/:id/ranking-trend
        API3-->>RS: PlayerRankingTrend (from disk snapshots)
    end

    PP->>PP: assemble sections
    PP-->>U: render profile
```

## Data Sources

### 1. Player Identity (from PlayersContext)

The player's name is resolved from either the `players` array (current rankings) or `directoryPlayers` (historical names). The `usabId` from the URL param is the lookup key.

### 2. USAB Player Detail

**Endpoint:** `GET /api/player/:id?age_group=&category=&date=`

The server scrapes `usabjrrankings.org/{usabId}/details` and returns:
- `gender: string | null` -- inferred from the USAB profile page
- `entries: TournamentEntry[]` -- tournament history with name, location, date, points, place, and optional `tournamentId`

### 3. TSW Player Stats

**Endpoint:** `GET /api/player/:id/tsw-stats?name=`

The server searches TSW for the player by name and scrapes their profile to return:
- `tswProfileUrl` / `tswSearchUrl` -- links to TSW
- Win/loss records by category (`total`, `singles`, `doubles`, `mixed`), each with `career` and `thisYear` breakdowns
- `recentHistory` -- array of recent match outcomes (for form/streak display)
- `tournamentsByYear` -- grouped `TswTournament[]` each containing `TswMatchResult[]` with full match details (opponent, partner, score, won/lost, walkover status, player IDs)

### 4. Ranking Trend

**Endpoint:** `GET /api/player/:id/ranking-trend`

Built server-side by scanning all `data/rankings-*.json` snapshots and collecting the player's `PlayerEntry[]` at each date. Returns `RankingTrendPoint[]` for charting.

## Types

```typescript
// Key types from src/types/junior.ts
interface TournamentEntry {
  tournamentName: string;
  location?: string;
  date?: string;
  points: number;
  place?: string;
  tournamentId?: string;
}

interface TswPlayerStats {
  tswProfileUrl: string | null;
  tswSearchUrl: string;
  total: CategoryStats;
  singles: CategoryStats;
  doubles: CategoryStats;
  mixed: CategoryStats;
  recentHistory: Array<{ won: boolean; date: string }>;
  tournamentsByYear: Record<string, TswTournament[]>;
}

interface PlayerRankingTrend {
  usabId: string;
  name: string;
  trend: RankingTrendPoint[];  // { date, entries: PlayerEntry[] }
}
```

## Page Sections

### Hero Card

Displays the player's name, gender icon, and USAB ID. Includes external links to the official USAB rankings page and TSW search.

### Ranking Cards

One card per `PlayerEntry` (age group + event combination), styled with age-group-specific gradient colors. Each card shows:
- Age group and event type (e.g., "U15 Boys Singles")
- Current rank and ranking points
- Link to USAB official detail page

### Ranking Trend Chart

A Recharts `LineChart` showing rank (inverted Y-axis, so #1 is at top) and points over time across all historical snapshots. Multiple lines if the player has entries in different age/event categories.

### TSW Career Statistics

Four-category breakdown (Total, Singles, Doubles, Mixed), each showing:
- Career W-L record with win percentage
- This-year W-L record
- Displayed as collapsible stat rows

### Tournament History

Expandable tournament cards grouped by year, sourced from `TswPlayerStats.tournamentsByYear`. Each tournament card shows:
- Tournament name (links to the app's tournament page if `tswId` is available)
- Dates and location
- Per-event W/L summary
- Expandable match list with `TournamentMatchCard` components showing opponent, score, and outcome

### Match Cards

Each `TournamentMatchCard` renders:
- Event name and round
- Player team vs opponent team (with links to `/tournaments/:tswId/player/:playerId` when IDs are available)
- Score with game-by-game display
- Walkover/retired badges when applicable

## Schedule Link

The Player Schedule feature shows upcoming matches with bracket-based predictions of future opponents.

### How It Works

1. **Detection:** When viewing a tournament player detail page (`/tournaments/:tswId/player/:playerId`), the server response includes `hasUpcomingMatches: boolean`. This is computed as:
   ```
   matches.some(m => !m.team1Won && !m.team2Won && !m.bye && !m.walkover && m.time)
   ```
   i.e., any match with no result, not a bye/walkover, and a scheduled time.

2. **Link:** If `hasUpcomingMatches` is true, `TournamentPlayerDetail.tsx` shows a Calendar icon linking to:
   ```
   /tournaments/:tswId/player/:playerId/schedule
   ```

3. **Schedule Page:** `PlayerSchedulePage` (`src/pages/tournament/PlayerSchedulePage.tsx`) calls `fetchPlayerSchedule(tswId, [playerId])` which returns:
   - Tournament metadata (name, dates)
   - `ScheduleDay[]` -- matches grouped by date, each with event, round, court, time, status, opponent, partner, result, and crucially `nextMatches[]` and `consolationMatches[]` showing upcoming opponents

4. **Server Logic:** The server builds the schedule by fetching the player's matches and, for elimination draws, walking the bracket to find `findPotentialNextMatches()` and `findConsolationPath()` -- predicting who the player might face next based on bracket position.

## QR Code Trading Card

A shareable player card with a scannable QR code linking to the player's profile. Designed as a "trading card" that junior players would be excited to share with friends.

### Entry Point

A **"QR Code" pill button** in the hero card CTA row (alongside Rankings and TSW Profile) opens the card modal.

### Card Modal (`QrCardModal`)

Full-screen overlay with a centered card and controls below it. Click-outside or Escape key to close, with `animate-scale-in` entrance animation.

**Card layout (top to bottom):**
1. Gradient background with decorative radial glow effects
2. Player initials avatar (rounded square, gradient matching theme)
3. Player name (bold, white)
4. Age group pills (reusing `AGE_GRADIENT` colors), or "Player" pill if unranked
5. QR code in white rounded container (`QRCodeCanvas` from `qrcode.react`)
6. "Scan to view profile" label
7. USAB ID in monospace

**Controls (outside card, not captured in share image):**
- **Theme selector** -- 6 gradient circle buttons below the card
- **Share button** -- captures the card as a PNG and opens the native share sheet via `navigator.share({ files })` (mobile only, hidden on desktop)
- **Copy Link button** -- copies the profile URL to clipboard with "Copied!" feedback

### Theme System

Six predefined color themes, each defining CSS Tailwind classes for the display card and hex color values for canvas export:

| Theme | Gradient | QR Color |
|-------|----------|----------|
| Galaxy | violet → indigo → blue | `#4338ca` |
| Sunset | orange → rose → pink | `#be123c` |
| Ocean | cyan → blue → indigo | `#1d4ed8` |
| Forest | emerald → green → teal | `#047857` |
| Flame | red → orange → amber | `#c2410c` |
| Storm | slate-600 → slate-700 → slate-900 | `#1e293b` |

No persistence -- defaults to Galaxy each time.

### Image Export Architecture

The on-screen card uses Tailwind CSS for beautiful rendering. For sharing, a separate **`drawShareCard` function** draws the card on an offscreen `<canvas>` using the Canvas 2D API:

```mermaid
flowchart LR
    Display["On-screen card\n(Tailwind CSS)"]
    Share["Share button click"]
    Draw["drawShareCard()\n(Canvas 2D API)"]
    QR["QRCodeCanvas\n(grabbed via ref)"]
    Blob["canvas.toBlob()"]
    Native["navigator.share()\n(native share sheet)"]

    Share --> Draw
    QR -->|"drawImage()"| Draw
    Draw --> Blob
    Blob --> Native
```

This dual approach was chosen because DOM-to-image libraries (`html-to-image`, `html2canvas`) cannot faithfully reproduce CSS gradients, blur effects, and text rendering. The canvas approach draws each element programmatically -- gradient fills, radial glows, rounded rects, text, and the QR code (copied from the on-screen `<canvas>` element) -- guaranteeing the exported PNG matches the design exactly at native device resolution (`devicePixelRatio`, minimum 3x).

### Sharing Flow

| Method | How | Platform |
|--------|-----|----------|
| **Scan QR** | Friend points phone camera at screen | In-person |
| **Share** | Canvas → PNG blob → `navigator.share({ files })` with card image | Mobile |
| **Copy Link** | `navigator.clipboard.writeText()` with profile URL | All browsers |

### Dependencies

- **`qrcode.react`** -- renders the QR code as a `<canvas>` element (also used for canvas export via `drawImage`)

No image-export library needed; the canvas drawing is self-contained.

## Cross-Linking

```mermaid
graph LR
    Rankings["/players<br/>Rankings Table"] -->|row click| Profile["/directory/:id<br/>PlayerProfile"]
    Directory["/directory<br/>AllPlayers"] -->|card click| Profile
    Profile -->|match card link| TournPlayer["/tournaments/:tswId/player/:playerId<br/>TournamentPlayerDetail"]
    TournPlayer -->|"Player Profile" link| Profile
    H2H["/head-to-head"] -->|player link| Profile
```

- Rankings table rows and directory cards link to this page.
- Tournament match cards within the profile link to `TournamentPlayerDetail`.
- `TournamentPlayerDetail` links back to this page via `memberId` when available.
- The `/players/:id` legacy route redirects to `/directory/:id`.
