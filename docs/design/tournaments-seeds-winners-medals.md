# Tournaments: Seeds, Winners, and Medals Pages

## Seeds Page

**Route:** `/tournaments/:tswId/seeds`
**Component:** `TournamentSeedsPage` -> `SeedsTab` (`src/components/tournament/tabs/SeedsTab.tsx`)

### Purpose

Displays seedings for all events in the tournament, showing which players are seeded and their seed numbers.

### Data Source

**Endpoint:** `GET /api/tournaments/:tswId/seeds`

### Types

```typescript
interface TournamentSeedingResponse {
  tswId: string;
  events: TournamentSeedingEvent[];
}

interface TournamentSeedingEvent {
  eventId: number;
  eventName: string;
  seeds: SeedEntry[];
}

interface SeedEntry {
  seed: string;                              // e.g., "1", "2", "Q"
  players: { name: string; playerId: number }[];
}
```

### UI Features

- Grouped by event (e.g., U15 Boys Singles)
- Each event shows a numbered list of seeded players
- Player names link to `/tournaments/:tswId/player/:playerId`

---

## Winners Page

**Route:** `/tournaments/:tswId/winners`
**Component:** `TournamentWinnersPage` -> `WinnersTab` (`src/components/tournament/tabs/WinnersTab.tsx`)

### Purpose

Displays final results/placements for all events -- gold, silver, bronze, and fourth place.

### Data Source

**Endpoint:** `GET /api/tournaments/:tswId/winners`

### Types

```typescript
interface TournamentWinnersResponse {
  tswId: string;
  tournamentName: string;
  events: TournamentWinnerEvent[];
}

interface TournamentWinnerEvent {
  eventName: string;
  results: WinnerResult[];
}

interface WinnerResult {
  place: string;                            // "1", "2", "3", "4"
  players: { name: string; playerId: number }[];
}
```

### UI Features

- Grouped by event
- Each event shows placement results (1st through 4th)
- Medal icons for top places
- Player names link to `/tournaments/:tswId/player/:playerId`

---

## Medals Page

**Route:** `/tournaments/:tswId/medals`
**Component:** `TournamentMedalsPage` -> `MedalsTab` (`src/components/tournament/tabs/MedalsTab.tsx`)

### Purpose

Provides a medal tally view: both a club-level summary (which clubs won the most medals) and per-draw medal breakdowns.

### Data Source

**Endpoint:** `GET /api/tournaments/:tswId/medals`

The server either loads from disk cache (`data/medals-{tswId}.json`) or computes from TSW data by fetching winners and player profiles to determine club affiliations.

### Types

```typescript
interface TournamentMedals {
  tswId: string;
  tournamentName: string;
  clubs: ClubMedalSummary[];
  medals: DrawMedals[];
}

interface ClubMedalSummary {
  club: string;
  gold: number;
  silver: number;
  bronze: number;
  total: number;
}

interface DrawMedals {
  drawName: string;
  ageGroup: string;
  eventType: string;
  gold: MedalPlayer[];
  silver: MedalPlayer[];
  bronze: MedalPlayer[][];     // multiple bronze medalists (semi-final losers)
  fourth: MedalPlayer[][];
}

interface MedalPlayer {
  name: string;
  club: string;
  playerId?: number;
}
```

### UI Features

- **Club summary table**: sortable by gold, silver, bronze, or total medals. Each row shows a club name and medal counts.
- **Per-draw medals**: expandable sections for each draw showing gold, silver, bronze (and fourth) medalists with club badges
- **Sort options**: `SortKey` for club table, `DetailSortKey` for draw sections
- **Expand modes**: toggle between collapsed (top clubs only) and expanded (all clubs) views
- Player names link to `/tournaments/:tswId/player/:playerId`
