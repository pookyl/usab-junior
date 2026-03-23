# Design Documents

This directory contains design documentation for the USAB Junior Badminton application.

## Documents

### System

- [Architecture Overview](architecture.md) -- tech stack, data flow, provider tree, routing, caching, deployment

### Pages

- [Rankings Page](rankings-page.md) -- rankings table, stats, and analytics at `/players`
- [Player Directory Page](players-page.md) -- searchable player directory at `/directory`
- [Player Profile Page](player-profile-page.md) -- individual player profile at `/directory/:id` (includes schedule link)
- [Head-to-Head](head-to-head.md) -- H2H comparison tool and merge algorithm at `/head-to-head`

### Tournaments

- [Tournaments Overview](tournaments.md) -- tournament list, hub, focus mode, shared UI
  - [Draws Page](tournaments-draws.md) -- draw list, elimination bracket algorithm, round-robin view
  - [Matches Page](tournaments-matches.md) -- match schedule by day
  - [Players Page](tournaments-players.md) -- tournament player list
  - [Events Page](tournaments-events.md) -- event list and event detail
  - [Seeds, Winners, Medals](tournaments-seeds-winners-medals.md) -- seedings, results, medal tally
  - [Player Detail](tournaments-player-detail.md) -- player matches within a tournament
