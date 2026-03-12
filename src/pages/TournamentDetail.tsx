import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ArrowLeft, Calendar, MapPin, ExternalLink, Loader2, Trophy, Users,
} from 'lucide-react';
import { fetchTournamentDetail } from '../services/rankingsService';
import type { TournamentDetail as TournamentDetailType, TournamentDraw } from '../types/junior';

const EVENT_TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  BS: { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-300' },
  GS: { bg: 'bg-pink-100 dark:bg-pink-900/30', text: 'text-pink-700 dark:text-pink-300' },
  BD: { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-300' },
  GD: { bg: 'bg-pink-100 dark:bg-pink-900/30', text: 'text-pink-700 dark:text-pink-300' },
  XD: { bg: 'bg-purple-100 dark:bg-purple-900/30', text: 'text-purple-700 dark:text-purple-300' },
};

function getEventColor(name: string) {
  const upper = name.toUpperCase();
  if (upper.startsWith('XD') || upper.includes('MIXED')) return EVENT_TYPE_COLORS.XD;
  if (upper.startsWith('GD') || upper.startsWith('GS')) return EVENT_TYPE_COLORS.GS;
  if (upper.startsWith('BD') || upper.startsWith('BS')) return EVENT_TYPE_COLORS.BS;
  return { bg: 'bg-slate-100 dark:bg-slate-800', text: 'text-slate-600 dark:text-slate-300' };
}

function getAgeGroup(name: string): string {
  const m = name.match(/U\d+/i);
  return m ? m[0].toUpperCase() : '';
}

function getEventType(name: string): string {
  const m = name.match(/^(BS|GS|BD|GD|XD)/i);
  return m ? m[1].toUpperCase() : name;
}

function groupDrawsByAge(draws: TournamentDraw[]): Map<string, TournamentDraw[]> {
  const groups = new Map<string, TournamentDraw[]>();
  for (const d of draws) {
    const age = getAgeGroup(d.name) || 'Other';
    if (!groups.has(age)) groups.set(age, []);
    groups.get(age)!.push(d);
  }
  return groups;
}

const AGE_ORDER = ['U11', 'U13', 'U15', 'U17', 'U19', 'Other'];

const AGE_COLORS: Record<string, string> = {
  U11: 'border-l-violet-500',
  U13: 'border-l-blue-500',
  U15: 'border-l-emerald-500',
  U17: 'border-l-amber-500',
  U19: 'border-l-rose-500',
};

export default function TournamentDetail() {
  const { tswId } = useParams<{ tswId: string }>();
  const [data, setData] = useState<TournamentDetailType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!tswId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchTournamentDetail(tswId)
      .then(d => { if (!cancelled) setData(d); })
      .catch(e => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [tswId]);

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="flex items-center justify-center gap-3 text-slate-400 dark:text-slate-500">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>Loading tournament details…</span>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-4">
        <Link to="/tournaments" className="inline-flex items-center gap-1.5 text-sm text-violet-600 dark:text-violet-400 hover:underline">
          <ArrowLeft className="w-4 h-4" />
          Back to Tournaments
        </Link>
        <div className="text-center text-red-500 dark:text-red-400 py-8">
          <p className="font-medium">Failed to load tournament</p>
          <p className="text-sm mt-1">{error || 'Unknown error'}</p>
        </div>
      </div>
    );
  }

  const groupedDraws = groupDrawsByAge(data.draws);
  const sortedAges = [...groupedDraws.keys()].sort(
    (a, b) => AGE_ORDER.indexOf(a) - AGE_ORDER.indexOf(b),
  );

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-10 space-y-6">
      {/* Back link */}
      <Link to="/tournaments" className="inline-flex items-center gap-1.5 text-sm text-violet-600 dark:text-violet-400 hover:underline">
        <ArrowLeft className="w-4 h-4" />
        Back to Tournaments
      </Link>

      {/* Hero */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-6 md:p-8">
        <h1 className="text-2xl md:text-3xl font-extrabold text-slate-800 dark:text-slate-100 tracking-tight mb-4">
          {data.name || 'Tournament'}
        </h1>

        <div className="flex flex-wrap gap-4 text-sm text-slate-500 dark:text-slate-400 mb-5">
          {data.dates && (
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 shrink-0" />
              <span>{data.dates}</span>
            </div>
          )}
          {data.location && (
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 shrink-0" />
              <span>{data.location}</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
            <Trophy className="w-4 h-4 text-violet-500" />
            <span className="font-medium">{data.draws.length} events</span>
          </div>
          <a
            href={data.tswUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400 hover:bg-violet-100 dark:hover:bg-violet-900/40 transition-colors"
          >
            <ExternalLink className="w-3 h-3" />
            View on TournamentSoftware
          </a>
        </div>
      </div>

      {/* Events by age group */}
      <div className="space-y-6">
        <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
          <Users className="w-5 h-5 text-violet-500" />
          Events
        </h2>

        {sortedAges.map(age => {
          const draws = groupedDraws.get(age)!;
          return (
            <div key={age}>
              <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2 px-1">
                {age}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {draws.map(draw => {
                  const color = getEventColor(draw.name);
                  const borderColor = AGE_COLORS[age] || 'border-l-slate-500';
                  const drawUrl = `https://www.tournamentsoftware.com/sport/draw.aspx?id=${tswId}&draw=${draw.drawId}`;
                  return (
                    <a
                      key={draw.drawId}
                      href={drawUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`block bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 border-l-4 ${borderColor} p-4 hover:shadow-md hover:-translate-y-0.5 transition-all group`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold mb-1.5 ${color.bg} ${color.text}`}>
                            {getEventType(draw.name)}
                          </span>
                          <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                            {draw.name}
                          </p>
                        </div>
                        <ExternalLink className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600 group-hover:text-violet-500 transition-colors shrink-0" />
                      </div>
                    </a>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
