export type AgeGroup = 'U11' | 'U13' | 'U15' | 'U17' | 'U19';
export type EventType = 'BS' | 'GS' | 'BD' | 'GD' | 'XD';

export const AGE_GROUPS: AgeGroup[] = ['U11', 'U13', 'U15', 'U17', 'U19'];
export const EVENT_TYPES: EventType[] = ['BS', 'GS', 'BD', 'GD', 'XD'];

export const EVENT_LABELS: Record<EventType, string> = {
  BS: 'Boys Singles',
  GS: 'Girls Singles',
  BD: 'Boys Doubles',
  GD: 'Girls Doubles',
  XD: 'Mixed Doubles',
};

export interface JuniorPlayer {
  usabId: string;
  name: string;
  rank: number;
  rankingPoints: number;
  ageGroup: AgeGroup;
  eventType: EventType;
}

export interface TournamentEntry {
  tournamentName: string;
  location?: string;
  date?: string;
  points: number;
  place?: string;
  tournamentId?: string;
}

export interface JuniorPlayerDetail extends JuniorPlayer {
  gender: string | null;
  tournamentHistory: TournamentEntry[];
}

export type RankingsKey = `${AgeGroup}-${EventType}`;
export type RankingsMap = Partial<Record<RankingsKey, JuniorPlayer[]>>;

export interface PlayerEntry {
  ageGroup: AgeGroup;
  eventType: EventType;
  rank: number;
  rankingPoints: number;
}

export interface UniquePlayer {
  usabId: string;
  name: string;
  entries: PlayerEntry[];
}

export interface DirectoryPlayer {
  usabId: string;
  name: string;
  names: string[];
  firstName?: string;
  lastName?: string;
  location?: string;
  club?: string;
}

export interface TswMatchResult {
  tournament: string;
  tournamentUrl?: string;
  event: string;
  round: string;
  opponent: string;
  partner: string;
  category: 'singles' | 'doubles' | 'mixed';
  score: string;
  won: boolean;
  date: string;
  walkover?: boolean;
}

export interface WinLossRecord {
  wins: number;
  losses: number;
  total: number;
  winPct: number;
}

export interface CategoryStats {
  career: WinLossRecord;
  thisYear: WinLossRecord;
}

export type StatsCategory = 'total' | 'singles' | 'doubles' | 'mixed';

export interface TswTournamentEvent {
  name: string;
  category: 'singles' | 'doubles' | 'mixed';
  wins: number;
  losses: number;
}

export interface TswTournament {
  name: string;
  url: string;
  dates: string;
  location: string;
  events: TswTournamentEvent[];
  matches: TswMatchResult[];
}

export interface TswPlayerStats {
  tswProfileUrl: string | null;
  tswSearchUrl: string;
  total: CategoryStats;
  singles: CategoryStats;
  doubles: CategoryStats;
  mixed: CategoryStats;
  recentHistory: Array<{ won: boolean; date: string }>;
  tournamentsByYear: Record<string, TswTournament[]>;
}

export interface RankingTrendPoint {
  date: string;
  entries: PlayerEntry[];
}

export interface PlayerRankingTrend {
  usabId: string;
  name: string;
  trend: RankingTrendPoint[];
}

export interface H2HMatch {
  tournament: string;
  tournamentUrl: string;
  event: string;
  round: string;
  duration: string;
  team1Players: string[];
  team2Players: string[];
  team1Won: boolean;
  team2Won: boolean;
  scores: number[][];
  date: string;
  venue: string;
}

export interface H2HResult {
  team1wins: number;
  team2wins: number;
  careerWL: { team1: string; team2: string };
  yearWL: { team1: string; team2: string };
  matches: H2HMatch[];
}

// ── Tournament Schedule types ─────────────────────────────────────────────────

export type TournamentType = 'ORC' | 'OLC' | 'CRC' | 'National' | 'Selection' | 'JDT';
export type TournamentStatus = 'upcoming' | 'in-progress' | 'completed';
export type TournamentRegion = 'NW' | 'NE' | 'NorCal' | 'SoCal' | 'MW' | 'South' | 'National';

export const TOURNAMENT_REGIONS: TournamentRegion[] = ['NW', 'NE', 'NorCal', 'SoCal', 'MW', 'South', 'National'];
export const TOURNAMENT_TYPES: TournamentType[] = ['ORC', 'OLC', 'CRC', 'National', 'Selection'];

export interface ScheduledTournament {
  name: string;
  startDate: string | null;
  endDate: string | null;
  region: TournamentRegion | string;
  hostClub: string;
  type: TournamentType | string;
  tswId: string | null;
  tswUrl: string | null;
  usabUrl: string | null;
  prospectusUrl: string | null;
  status: TournamentStatus;
}

export interface TournamentSeasonData {
  tournaments: ScheduledTournament[];
}

export interface TournamentsResponse {
  season?: string;
  tournaments?: ScheduledTournament[];
  seasons?: Record<string, TournamentSeasonData>;
  availableSeasons: string[];
  spotlight?: ScheduledTournament | null;
}

export interface TournamentDraw {
  drawId: number;
  name: string;
  size: number | null;
  type: string | null;
  stage: string | null;
  consolation: string | null;
}

export interface TournamentDetail {
  tswId: string;
  name: string;
  dates: string;
  location: string;
  draws: TournamentDraw[];
  tswUrl: string;
}

// ── Tournament Medals types ───────────────────────────────────────────────────

export interface MedalPlayer {
  name: string;
  club: string;
  playerId?: number;
}

export interface DrawMedals {
  drawName: string;
  ageGroup: string;
  eventType: string;
  gold: MedalPlayer[];
  silver: MedalPlayer[];
  bronze: MedalPlayer[][];
  fourth: MedalPlayer[][];
}

export interface ClubMedalSummary {
  club: string;
  gold: number;
  silver: number;
  bronze: number;
  total: number;
}

export interface TournamentMedals {
  tswId: string;
  tournamentName: string;
  clubs: ClubMedalSummary[];
  medals: DrawMedals[];
}

// ── Tournament tab data types ────────────────────────────────────────────────

export interface TournamentEvent {
  eventId: number;
  name: string;
  draws: number;
  entries: number;
}

export interface TournamentEventsResponse {
  tswId: string;
  events: TournamentEvent[];
}

export interface TournamentEventEntryPlayer {
  name: string;
  playerId: number;
}

export interface TournamentEventDetailEntry {
  entryType: string;
  seed: string | null;
  players: TournamentEventEntryPlayer[];
}

export interface TournamentEventDetailDraw {
  drawId: number;
  name: string;
  size: number | null;
  type: string | null;
  qualification: string | null;
  consolation: string | null;
}

export interface TournamentEventDetailResponse {
  tswId: string;
  eventId: number;
  eventName: string;
  entriesCount: number | null;
  draws: TournamentEventDetailDraw[];
  entries: TournamentEventDetailEntry[];
}

export interface TournamentPlayer {
  playerId: number;
  name: string;
  club: string;
}

export interface TournamentPlayersResponse {
  tswId: string;
  players: TournamentPlayer[];
}

export interface TournamentPlayerWinLoss {
  wins: number;
  losses: number;
  total: number;
  winPct: number;
}

export interface TournamentPlayerDetailResponse {
  tswId: string;
  playerId: number;
  playerName: string;
  memberId?: string;
  club: string;
  events: string[];
  winLoss: TournamentPlayerWinLoss | null;
  matches: TournamentMatch[];
}

export interface SeedEntry {
  seed: string;
  players: { name: string; playerId: number }[];
}

export interface TournamentSeedingEvent {
  eventId: number;
  eventName: string;
  seeds: SeedEntry[];
}

export interface TournamentSeedingResponse {
  tswId: string;
  events: TournamentSeedingEvent[];
}

export interface WinnerResult {
  place: string;
  players: { name: string; playerId: number }[];
}

export interface TournamentWinnerEvent {
  eventName: string;
  results: WinnerResult[];
}

export interface TournamentWinnersResponse {
  tswId: string;
  tournamentName: string;
  events: TournamentWinnerEvent[];
}

export interface TournamentMatch {
  event: string;
  round: string;
  header: string;
  team1: string[];
  team2: string[];
  team1Ids?: (number | null)[];
  team2Ids?: (number | null)[];
  team1Won: boolean;
  team2Won: boolean;
  scores: number[][];
  bye?: boolean;
  walkover?: boolean;
  retired?: boolean;
  time: string;
  court: string;
  duration: string;
  location: string;
  status?: string;
}

export interface MatchDateTab {
  param: string;
  label: string;
}

export interface TournamentMatchDayResponse {
  tswId: string;
  date: string;
  matches: TournamentMatch[];
}

export interface DrawBracketTeam {
  names: string[];
  seed: string;
  won: boolean;
}

export interface DrawBracketMatch {
  round: string;
  team1: DrawBracketTeam;
  team2: DrawBracketTeam;
  scores: number[][];
  walkover?: boolean;
  retired?: boolean;
}

export interface DrawBracketResponse {
  drawName: string;
  matches: DrawBracketMatch[];
}

// ── Elimination bracket types ─────────────────────────────────────────────────

export interface BracketPlayer {
  name: string;
  seed: string;
  club: string;
  playerId: number | null;
  partner?: string;
  partnerPlayerId?: number | null;
}

export interface BracketEntry extends BracketPlayer {
  position: number;
  bye: boolean;
}

export interface BracketMatch {
  matchId: string;
  roundLevel: number;
  matchNum: number;
  winner: BracketPlayer | null;
  score: string[];
  retired: boolean;
  walkover: boolean;
  scheduledTime?: string;
}

export interface BracketSection {
  name: string;
  rounds: string[];
  entries: BracketEntry[];
  matches: BracketMatch[];
}

export interface EliminationDrawResponse {
  tswId: string;
  drawId: number;
  drawType: string;
  sections: BracketSection[];
}

// ── Round Robin draw types ────────────────────────────────────────────────────

export interface RoundRobinPlayer {
  name: string;
  playerId: number | null;
  club: string;
}

export interface RoundRobinStanding {
  position: number;
  players: RoundRobinPlayer[];
  played: number;
  won: number;
  drawn: number;
  lost: number;
  matchRecord: string;
  gameRecord: string;
  pointRecord: string;
  points: number;
  history: ('W' | 'L' | 'D')[];
}

export interface RoundRobinMatch {
  matchId: string;
  round: string;
  team1: RoundRobinPlayer[];
  team2: RoundRobinPlayer[];
  winner: 1 | 2 | null;
  scores: number[][];
  dateTime: string;
  retired: boolean;
  walkover: boolean;
}

export interface RoundRobinGroup {
  name: string;
  drawId: number;
  active: boolean;
}

export interface RoundRobinDrawResponse {
  tswId: string;
  drawId: number;
  drawType: 'round-robin';
  groupName: string;
  groups: RoundRobinGroup[];
  standings: RoundRobinStanding[];
  matches: RoundRobinMatch[];
}
