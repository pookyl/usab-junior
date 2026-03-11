import type { UniquePlayer } from '../types/junior';
import meta from '../../data/rankings-meta.json';

export const RANKINGS_DATE: string = meta.date;

export const cachedAllPlayers: UniquePlayer[] = [];
