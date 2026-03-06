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
  tournamentHistory: TournamentEntry[];
}

export type RankingsKey = `${AgeGroup}-${EventType}`;
export type RankingsMap = Partial<Record<RankingsKey, JuniorPlayer[]>>;

export interface H2HMatch {
  tournament: string;
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
