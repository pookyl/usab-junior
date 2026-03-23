# Tournaments: Players Page

**Route:** `/tournaments/:tswId/players`
**Component:** `TournamentPlayersPage` -> `PlayersTab` (`src/components/tournament/tabs/PlayersTab.tsx`)

## Purpose

Lists all players registered for a specific tournament. Provides search and links to each player's tournament-specific match record.

## Data Flow

```mermaid
sequenceDiagram
    participant U as User
    participant PT as PlayersTab
    participant RS as rankingsService.ts
    participant API as /api/tournaments/:tswId/players
    participant TSW as tournamentsoftware.com

    U->>PT: navigate to players tab
    PT->>RS: fetchTournamentPlayers(tswId)
    RS->>API: GET /api/tournaments/:tswId/players
    API->>TSW: tswFetch players page (or disk cache)
    TSW-->>API: HTML
    API->>API: parseTswTournamentPlayers(html)
    API-->>RS: TournamentPlayersResponse
    RS-->>PT: players list
    PT-->>U: render player list
```

## Types

```typescript
interface TournamentPlayersResponse {
  tswId: string;
  players: TournamentPlayer[];
}

interface TournamentPlayer {
  playerId: number;    // TSW player ID
  name: string;
  club: string;
}
```

## UI Features

- **Search**: filter players by name (case-insensitive substring)
- **Player list**: each row shows player name and club
- **Navigation**: clicking a player navigates to `/tournaments/:tswId/player/:playerId`
- **Watchlist integration**: players can be added to the tournament watchlist via `WatchlistContext`
