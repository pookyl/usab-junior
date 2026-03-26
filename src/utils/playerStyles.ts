import type { AgeGroup } from '../types/junior';

export const AGE_GRADIENT: Record<AgeGroup, string> = {
  U11: 'from-violet-500 to-violet-700',
  U13: 'from-blue-500 to-blue-700',
  U15: 'from-emerald-500 to-emerald-700',
  U17: 'from-amber-500 to-amber-600',
  U19: 'from-rose-500 to-rose-700',
};

export const AGE_BORDER: Record<AgeGroup, string> = {
  U11: 'border-violet-200 hover:border-violet-400 dark:border-violet-800 dark:hover:border-violet-600',
  U13: 'border-blue-200 hover:border-blue-400 dark:border-blue-800 dark:hover:border-blue-600',
  U15: 'border-emerald-200 hover:border-emerald-400 dark:border-emerald-800 dark:hover:border-emerald-600',
  U17: 'border-amber-200 hover:border-amber-400 dark:border-amber-800 dark:hover:border-amber-600',
  U19: 'border-rose-200 hover:border-rose-400 dark:border-rose-800 dark:hover:border-rose-600',
};

export const AGE_BORDER_STATIC: Record<string, string> = {
  U11: 'border-violet-200 dark:border-violet-800',
  U13: 'border-blue-200 dark:border-blue-800',
  U15: 'border-emerald-200 dark:border-emerald-800',
  U17: 'border-amber-200 dark:border-amber-800',
  U19: 'border-rose-200 dark:border-rose-800',
};

export const AGE_TEXT: Record<AgeGroup, string> = {
  U11: 'text-violet-600',
  U13: 'text-blue-600',
  U15: 'text-emerald-600',
  U17: 'text-amber-600',
  U19: 'text-rose-600',
};

export const AGE_HEX: Record<AgeGroup, string> = {
  U11: '#8b5cf6',
  U13: '#3b82f6',
  U15: '#10b981',
  U17: '#f59e0b',
  U19: '#ef4444',
};

export const AGE_PILL_BG: Record<string, string> = {
  U11: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
  U13: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  U15: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  U17: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  U19: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
};

export const AGE_PILL_ACTIVE: Record<string, string> = {
  U11: 'bg-violet-600 text-white dark:bg-violet-500',
  U13: 'bg-blue-600 text-white dark:bg-blue-500',
  U15: 'bg-emerald-600 text-white dark:bg-emerald-500',
  U17: 'bg-amber-600 text-white dark:bg-amber-500',
  U19: 'bg-rose-600 text-white dark:bg-rose-500',
};

export const AGE_PILL_HEX: Record<AgeGroup, string> = {
  U11: '#7c3aed',
  U13: '#3b82f6',
  U15: '#059669',
  U17: '#d97706',
  U19: '#e11d48',
};
