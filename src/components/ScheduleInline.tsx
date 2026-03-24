import { useState, useEffect, useMemo } from 'react';
import { Check, Loader2, AlertCircle } from 'lucide-react';
import { fetchTournamentSchedule } from '../services/rankingsService';
import type { TournamentScheduleEntry } from '../types/junior';

type ComputedState = 'past' | 'current' | 'future';

function computeStates(entries: TournamentScheduleEntry[]): ComputedState[] {
  const now = Date.now();
  const states: ComputedState[] = entries.map((e) => {
    if (!e.datetime) return e.isPast ? 'past' : 'future';
    try {
      return new Date(e.datetime).getTime() <= now ? 'past' : 'future';
    } catch { return e.isPast ? 'past' : 'future'; }
  });

  let lastPast = -1;
  for (let i = states.length - 1; i >= 0; i--) {
    if (states[i] === 'past') { lastPast = i; break; }
  }
  if (lastPast >= 0 && lastPast < states.length - 1) {
    states[lastPast + 1] = 'current';
  } else if (lastPast === -1 && states.length > 0) {
    states[0] = 'current';
  }
  return states;
}

function extractTimezone(entries: TournamentScheduleEntry[]): string | null {
  for (const e of entries) {
    const m = e.displayDate.match(/\(GMT\s*([+-]\d{2}:\d{2})\)/);
    if (m) return `GMT ${m[1]}`;
  }
  return null;
}

function parseDate(entry: TournamentScheduleEntry): { date: string; time: string | null } {
  const raw = entry.displayDate;
  if (!raw) return { date: '', time: null };
  const cleaned = raw.replace(/\s*\(GMT\s*[+-]\d{2}:\d{2}\)/, '').trim();
  const timeMatch = cleaned.match(/^(.+?)\s+(\d{1,2}:\d{2}\s*(?:AM|PM))$/i);
  if (timeMatch) return { date: timeMatch[1].trim(), time: timeMatch[2].trim() };
  return { date: cleaned, time: null };
}

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  try {
    return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
  } catch { return null; }
}

function countdownLabel(days: number | null): string {
  if (days === null) return '';
  if (days < 0) return `${Math.abs(days)} days ago`;
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return `in ${days} days`;
}

const SHORT_LABELS: Record<string, string> = {
  'entry-open': 'Open',
  'entry-closed': 'Close',
  'withdrawal-deadline': 'Withdraw',
  'started': 'Start',
  'finished': 'End',
};

function HorizontalStepper({ entries, states, nextIdx }: { entries: TournamentScheduleEntry[]; states: ComputedState[]; nextIdx: number }) {
  return (
    <div className="flex items-center w-full">
      {entries.map((entry, i) => {
        const st = states[i];
        const isLast = i === entries.length - 1;

        return (
          <div key={i} className={`flex items-center ${isLast ? '' : 'flex-1'}`}>
            <div className="flex flex-col items-center">
              {st === 'past' ? (
                <div className="w-4 h-4 rounded-full bg-emerald-500 dark:bg-emerald-400 flex items-center justify-center">
                  <Check className="w-2.5 h-2.5 text-white dark:text-slate-900" />
                </div>
              ) : i === nextIdx ? (
                <div className="w-5 h-5 rounded-full bg-violet-500 dark:bg-violet-400 ring-2 ring-violet-200 dark:ring-violet-800 flex items-center justify-center">
                  <div className="w-1.5 h-1.5 rounded-full bg-white dark:bg-slate-900" />
                </div>
              ) : (
                <div className="w-4 h-4 rounded-full border-[1.5px] border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900" />
              )}
              <span className={`text-[8px] mt-1 whitespace-nowrap leading-none ${
                st === 'past'
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : i === nextIdx
                    ? 'text-violet-600 dark:text-violet-400 font-semibold'
                    : 'text-slate-400 dark:text-slate-500'
              }`}>
                {SHORT_LABELS[entry.type] || entry.label.split(' ')[0]}
              </span>
            </div>
            {!isLast && (
              <div className="flex-1 h-[1.5px] mx-0.5 -mt-3.5">
                <div className={`h-full rounded-full ${
                  st === 'past'
                    ? 'bg-emerald-400 dark:bg-emerald-500'
                    : 'bg-slate-200 dark:bg-slate-700'
                }`} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function ScheduleInline({ tswId }: { tswId: string }) {
  const [schedule, setSchedule] = useState<TournamentScheduleEntry[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchTournamentSchedule(tswId)
      .then((data) => { if (!cancelled) setSchedule(data); })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [tswId]);

  const states = useMemo(() => schedule ? computeStates(schedule) : [], [schedule]);
  const nextIdx = useMemo(() => states.indexOf('current'), [states]);
  const tz = useMemo(() => schedule ? extractTimezone(schedule) : null, [schedule]);

  if (!schedule && !error) {
    return (
      <div className="flex items-center gap-2 py-3 text-xs text-slate-400 dark:text-slate-500">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        Loading schedule…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 py-2 text-xs text-slate-400 dark:text-slate-500">
        <AlertCircle className="w-3.5 h-3.5" />
        Could not load schedule
      </div>
    );
  }

  if (!schedule || schedule.length === 0) return null;

  return (
    <div className="space-y-3">
      {/* Horizontal progress stepper */}
      <HorizontalStepper entries={schedule} states={states} nextIdx={nextIdx} />

      {/* Milestone rows */}
      <div className="space-y-0">
        {schedule.map((entry, i) => {
          const st = states[i];
          const { date, time } = parseDate(entry);
          const isCurrent = st === 'current';
          const days = isCurrent ? daysUntil(entry.datetime) : null;
          const countdown = countdownLabel(days);

          return (
            <div
              key={i}
              className={`flex items-center gap-2.5 py-1.5 ${
                isCurrent
                  ? 'bg-violet-50 dark:bg-violet-950/30 -mx-2 px-2 rounded-lg'
                  : ''
              }`}
            >
              <div className="w-4 flex items-center justify-center shrink-0">
                {st === 'past' ? (
                  <Check className="w-3 h-3 text-emerald-500 dark:text-emerald-400" />
                ) : isCurrent ? (
                  <div className="w-2 h-2 rounded-full bg-violet-500 dark:bg-violet-400 ring-2 ring-violet-300 dark:ring-violet-700" />
                ) : (
                  <div className="w-1.5 h-1.5 rounded-full bg-slate-300 dark:bg-slate-600" />
                )}
              </div>

              <span className={`text-xs flex-1 min-w-0 truncate ${
                st === 'past'
                  ? 'text-slate-400 dark:text-slate-500'
                  : isCurrent
                    ? 'text-violet-700 dark:text-violet-300 font-semibold'
                    : 'text-slate-600 dark:text-slate-300'
              }`}>
                {entry.label}
              </span>

              <span className={`text-[11px] tabular-nums whitespace-nowrap shrink-0 ${
                st === 'past'
                  ? 'text-slate-300 dark:text-slate-600'
                  : isCurrent
                    ? 'text-violet-600 dark:text-violet-400 font-medium'
                    : 'text-slate-400 dark:text-slate-500'
              }`}>
                {date}{time ? `, ${time}` : ''}
                {countdown && (
                  <span className={`ml-1 ${
                    days !== null && days >= 0 && days <= 3
                      ? 'text-amber-600 dark:text-amber-400'
                      : ''
                  }`}>
                    ({countdown})
                  </span>
                )}
              </span>
            </div>
          );
        })}
        {tz && (
          <p className="text-[10px] text-slate-400 dark:text-slate-500 text-right pt-1">{tz}</p>
        )}
      </div>
    </div>
  );
}
