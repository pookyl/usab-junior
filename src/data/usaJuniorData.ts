import type { UniquePlayer } from '../types/junior';
import cachedData from '../../data/rankings-cache.json';

export const RANKINGS_DATE: string = cachedData.date;

export const cachedAllPlayers: UniquePlayer[] = cachedData.allPlayers as UniquePlayer[];
