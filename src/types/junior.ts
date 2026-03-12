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
  recentResults: TswMatchResult[];
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
