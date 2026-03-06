export interface Player {
  id: string;
  name: string;
  age: number;
  nationality: string;
  rank: number;
  category: 'MS' | 'WS' | 'MD' | 'WD' | 'XD';
  hand: 'Right' | 'Left';
  height: number;
  weight: number;
  club: string;
  avatar: string;
  stats: PlayerStats;
  recentForm: ('W' | 'L')[];
}

export interface PlayerStats {
  wins: number;
  losses: number;
  titles: number;
  smashSpeed: number;
  accuracy: number;
  stamina: number;
  agility: number;
  defense: number;
  attack: number;
  serve: number;
}

export interface Match {
  id: string;
  date: string;
  tournament: string;
  round: string;
  player1Id: string;
  player2Id: string;
  score: string;
  winnerId: string;
  duration: number;
}

export const players: Player[] = [
  {
    id: 'p1',
    name: 'Viktor Axelsen',
    age: 30,
    nationality: 'Denmark',
    rank: 1,
    category: 'MS',
    hand: 'Right',
    height: 194,
    weight: 88,
    club: 'Odense Badminton',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Viktor',
    recentForm: ['W', 'W', 'W', 'L', 'W'],
    stats: {
      wins: 312,
      losses: 87,
      titles: 53,
      smashSpeed: 95,
      accuracy: 88,
      stamina: 90,
      agility: 85,
      defense: 82,
      attack: 97,
      serve: 89,
    },
  },
  {
    id: 'p2',
    name: 'Kodai Naraoka',
    age: 21,
    nationality: 'Japan',
    rank: 2,
    category: 'MS',
    hand: 'Right',
    height: 175,
    weight: 72,
    club: 'NTT East',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Kodai',
    recentForm: ['W', 'L', 'W', 'W', 'W'],
    stats: {
      wins: 145,
      losses: 62,
      titles: 8,
      smashSpeed: 88,
      accuracy: 91,
      stamina: 87,
      agility: 93,
      defense: 90,
      attack: 85,
      serve: 88,
    },
  },
  {
    id: 'p3',
    name: 'An Se-young',
    age: 22,
    nationality: 'South Korea',
    rank: 1,
    category: 'WS',
    hand: 'Right',
    height: 167,
    weight: 58,
    club: 'Korea Sport',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=AnSeyoung',
    recentForm: ['W', 'W', 'W', 'W', 'L'],
    stats: {
      wins: 198,
      losses: 45,
      titles: 22,
      smashSpeed: 82,
      accuracy: 93,
      stamina: 91,
      agility: 95,
      defense: 88,
      attack: 89,
      serve: 91,
    },
  },
  {
    id: 'p4',
    name: 'Carolina Marin',
    age: 31,
    nationality: 'Spain',
    rank: 4,
    category: 'WS',
    hand: 'Left',
    height: 170,
    weight: 62,
    club: 'PSS Huelva',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Carolina',
    recentForm: ['L', 'W', 'W', 'L', 'W'],
    stats: {
      wins: 267,
      losses: 98,
      titles: 35,
      smashSpeed: 84,
      accuracy: 87,
      stamina: 89,
      agility: 92,
      defense: 85,
      attack: 91,
      serve: 86,
    },
  },
  {
    id: 'p5',
    name: 'Fajar Alfian',
    age: 27,
    nationality: 'Indonesia',
    rank: 3,
    category: 'MD',
    hand: 'Right',
    height: 178,
    weight: 75,
    club: 'PBSI',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Fajar',
    recentForm: ['W', 'W', 'L', 'W', 'W'],
    stats: {
      wins: 221,
      losses: 78,
      titles: 18,
      smashSpeed: 90,
      accuracy: 85,
      stamina: 88,
      agility: 87,
      defense: 84,
      attack: 92,
      serve: 83,
    },
  },
  {
    id: 'p6',
    name: 'Zheng Si Wei',
    age: 27,
    nationality: 'China',
    rank: 1,
    category: 'XD',
    hand: 'Right',
    height: 183,
    weight: 78,
    club: 'China National',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Zheng',
    recentForm: ['W', 'W', 'W', 'W', 'W'],
    stats: {
      wins: 289,
      losses: 66,
      titles: 41,
      smashSpeed: 91,
      accuracy: 90,
      stamina: 86,
      agility: 88,
      defense: 87,
      attack: 93,
      serve: 90,
    },
  },
];

export const matches: Match[] = [
  {
    id: 'm1',
    date: '2026-02-28',
    tournament: 'All England Open 2026',
    round: 'Final',
    player1Id: 'p1',
    player2Id: 'p2',
    score: '21-18, 21-15',
    winnerId: 'p1',
    duration: 47,
  },
  {
    id: 'm2',
    date: '2026-02-27',
    tournament: 'All England Open 2026',
    round: 'Semi-Final',
    player1Id: 'p2',
    player2Id: 'p5',
    score: '21-19, 18-21, 21-16',
    winnerId: 'p2',
    duration: 68,
  },
  {
    id: 'm3',
    date: '2026-02-26',
    tournament: 'All England Open 2026',
    round: 'Quarter-Final',
    player1Id: 'p3',
    player2Id: 'p4',
    score: '21-14, 21-18',
    winnerId: 'p3',
    duration: 42,
  },
  {
    id: 'm4',
    date: '2026-02-20',
    tournament: 'Swiss Open 2026',
    round: 'Final',
    player1Id: 'p4',
    player2Id: 'p3',
    score: '21-17, 18-21, 21-19',
    winnerId: 'p4',
    duration: 71,
  },
  {
    id: 'm5',
    date: '2026-02-15',
    tournament: 'German Open 2026',
    round: 'Final',
    player1Id: 'p1',
    player2Id: 'p5',
    score: '21-12, 21-18',
    winnerId: 'p1',
    duration: 39,
  },
  {
    id: 'm6',
    date: '2026-02-10',
    tournament: 'German Open 2026',
    round: 'Semi-Final',
    player1Id: 'p6',
    player2Id: 'p2',
    score: '21-16, 21-14',
    winnerId: 'p6',
    duration: 44,
  },
];

export const monthlyWins = [
  { month: 'Sep', p1: 8, p2: 5, p3: 9, p4: 6 },
  { month: 'Oct', p1: 10, p2: 7, p3: 8, p4: 7 },
  { month: 'Nov', p1: 9, p2: 8, p3: 10, p4: 5 },
  { month: 'Dec', p1: 7, p2: 6, p3: 7, p4: 8 },
  { month: 'Jan', p1: 11, p2: 9, p3: 9, p4: 6 },
  { month: 'Feb', p1: 8, p2: 7, p3: 11, p4: 7 },
];
