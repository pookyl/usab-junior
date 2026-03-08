import type { RankingsMap, UniquePlayer } from '../types/junior';
import cachedData from './cached-players.json';

export const RANKINGS_DATE: string = cachedData.date;

export const staticRankings: RankingsMap = cachedData.rankings as RankingsMap;

export const cachedAllPlayers: UniquePlayer[] = cachedData.allPlayers as UniquePlayer[];
