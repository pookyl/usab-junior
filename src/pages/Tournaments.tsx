import { useState, useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  Calendar, MapPin, ChevronDown, ExternalLink, FileText,
  Clock, CheckCircle2, Loader2, Filter, Medal, SquareArrowOutUpRight,
} from 'lucide-react';
import { fetchTournaments } from '../services/rankingsService';
import type { ScheduledTournament, TournamentsResponse } from '../types/junior';

// ── Color maps ───────────────────────────────────────────────────────────────

const REGION_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  NW:       { bg: 'bg-sky-100 dark:bg-sky-900/30',     text: 'text-sky-700 dark:text-sky-300',       dot: 'bg-sky-500' },
  NE:       { bg: 'bg-indigo-100 dark:bg-indigo-900/30', text: 'text-indigo-700 dark:text-indigo-300', dot: 'bg-indigo-500' },
  NorCal:   { bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-300', dot: 'bg-emerald-500' },
  SoCal:    { bg: 'bg-orange-100 dark:bg-orange-900/30', text: 'text-orange-700 dark:text-orange-300', dot: 'bg-orange-500' },
  MW:       { bg: 'bg-violet-100 dark:bg-violet-900/30', text: 'text-violet-700 dark:text-violet-300', dot: 'bg-violet-500' },
  South:    { bg: 'bg-rose-100 dark:bg-rose-900/30',     text: 'text-rose-700 dark:text-rose-300',     dot: 'bg-rose-500' },
  National: { bg: 'bg-amber-100 dark:bg-amber-900/30',   text: 'text-amber-700 dark:text-amber-300',   dot: 'bg-amber-500' },
  Midwest:  { bg: 'bg-violet-100 dark:bg-violet-900/30', text: 'text-violet-700 dark:text-violet-300', dot: 'bg-violet-500' },
};

const TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  ORC:       { bg: 'bg-blue-100 dark:bg-blue-900/30',   text: 'text-blue-700 dark:text-blue-300' },
  OLC:       { bg: 'bg-slate-100 dark:bg-slate-700/50',  text: 'text-slate-600 dark:text-slate-300' },
  CRC:       { bg: 'bg-teal-100 dark:bg-teal-900/30',    text: 'text-teal-700 dark:text-teal-300' },
  National:  { bg: 'bg-amber-100 dark:bg-amber-900/30',  text: 'text-amber-700 dark:text-amber-300' },
  Selection: { bg: 'bg-purple-100 dark:bg-purple-900/30', text: 'text-purple-700 dark:text-purple-300' },
  JDT:       { bg: 'bg-gray-100 dark:bg-gray-800/50',    text: 'text-gray-600 dark:text-gray-400' },
};

const STATUS_CONFIG = {
  completed:     { icon: CheckCircle2, label: 'Completed',   bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-300' },
  'in-progress': { icon: Loader2,      label: 'In Progress', bg: 'bg-amber-100 dark:bg-amber-900/30',     text: 'text-amber-700 dark:text-amber-300' },
  upcoming:      { icon: Clock,        label: 'Upcoming',    bg: 'bg-blue-100 dark:bg-blue-900/30',       text: 'text-blue-700 dark:text-blue-300' },
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDateRange(start: string | null, end: string | null): string {
  if (!start) return 'TBA';
  const s = new Date(start + 'T00:00:00');
  const e = end ? new Date(end + 'T00:00:00') : s;
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  const startStr = s.toLocaleDateString('en-US', opts);
  if (start === end) return startStr;
  if (s.getMonth() === e.getMonth()) {
    return `${startStr}–${e.getDate()}`;
  }
  return `${startStr} – ${e.toLocaleDateString('en-US', opts)}`;
}

function formatYear(start: string | null): string {
  if (!start) return '';
  return start.slice(0, 4);
}

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + 'T00:00:00');
  const diff = target.getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function monthKey(dateStr: string | null): string {
  if (!dateStr) return 'TBA';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

// ── Components ───────────────────────────────────────────────────────────────

function RegionBadge({ region }: { region: string }) {
  const c = REGION_COLORS[region] || REGION_COLORS.National;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${c.bg} ${c.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {region}
    </span>
  );
}

function TypeBadge({ type }: { type: string }) {
  const c = TYPE_COLORS[type] || TYPE_COLORS.OLC;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${c.bg} ${c.text}`}>
      {type}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.upcoming;
  const Icon = config.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${config.bg} ${config.text}`}>
      <Icon className={`w-3 h-3 ${status === 'in-progress' ? 'animate-spin' : ''}`} />
      {config.label}
    </span>
  );
}

function SeasonPicker({ seasons, selected, onChange }: {
  seasons: string[];
  selected: string;
  onChange: (s: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium text-slate-700 dark:text-slate-200 hover:border-violet-300 dark:hover:border-violet-600 transition-colors cursor-pointer"
      >
        <Calendar className="w-4 h-4 text-violet-500" />
        {selected}
        <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1.5 w-48 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl overflow-hidden z-50">
          {seasons.map(s => (
            <button
              key={s}
              onClick={() => { onChange(s); setOpen(false); }}
              className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                s === selected
                  ? 'bg-violet-600 text-white font-medium'
                  : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function FilterPills({ label, options, selected, onChange }: {
  label: string;
  options: string[];
  selected: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide">
      <span className="text-xs font-medium text-slate-400 dark:text-slate-500 shrink-0 hidden sm:inline">
        <Filter className="w-3 h-3 inline mr-1" />{label}:
      </span>
      {['All', ...options].map(opt => (
        <button
          key={opt}
          onClick={() => onChange(opt === 'All' ? '' : opt)}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
            (opt === 'All' && !selected) || opt === selected
              ? 'bg-violet-600 text-white'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
          }`}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

function TournamentCard({ tournament }: { tournament: ScheduledTournament }) {
  const days = tournament.status === 'upcoming' ? daysUntil(tournament.startDate) : null;
  const year = formatYear(tournament.startDate);

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-5 hover:shadow-lg hover:-translate-y-0.5 transition-all group">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <StatusBadge status={tournament.status} />
          <RegionBadge region={tournament.region} />
          <TypeBadge type={tournament.type} />
        </div>
        {days !== null && days > 0 && (
          <span className="text-xs text-slate-400 dark:text-slate-500 whitespace-nowrap shrink-0">
            {days === 1 ? 'Tomorrow' : `${days} days`}
          </span>
        )}
      </div>

      <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 mb-2 leading-snug">
        {tournament.tswId ? (
          <Link
            to={`/tournaments/${tournament.tswId}`}
            state={{ name: tournament.name, hostClub: tournament.hostClub, startDate: tournament.startDate, endDate: tournament.endDate }}
            className="inline-flex items-center gap-1 hover:text-violet-600 dark:hover:text-violet-400 transition-colors"
          >
            {tournament.name}
            <SquareArrowOutUpRight className="w-4 h-4 text-violet-400 dark:text-violet-500 group-hover:text-violet-600 dark:group-hover:text-violet-400 transition-colors shrink-0" />
          </Link>
        ) : (
          tournament.name
        )}
      </h3>

      <div className="flex flex-col gap-1.5 text-sm text-slate-500 dark:text-slate-400 mb-4">
        <div className="flex items-center gap-2">
          <Calendar className="w-3.5 h-3.5 shrink-0" />
          <span>{formatDateRange(tournament.startDate, tournament.endDate)}{year ? `, ${year}` : ''}</span>
        </div>
        <div className="flex items-center gap-2">
          <MapPin className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">{tournament.hostClub}</span>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {tournament.tswId && tournament.status === 'completed' && (
          <Link
            to={`/tournaments/${tournament.tswId}/medals`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors"
          >
            <Medal className="w-3 h-3" />
            Medals
          </Link>
        )}
        {tournament.prospectusUrl && (
          <a
            href={tournament.prospectusUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          >
            <FileText className="w-3 h-3" />
            Prospectus
          </a>
        )}
        {tournament.usabUrl && (
          <a
            href={tournament.usabUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          >
            <ExternalLink className="w-3 h-3" />
            USAB
          </a>
        )}
      </div>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function Tournaments() {
  const [data, setData] = useState<TournamentsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSeason, setSelectedSeason] = useState('');
  const [regionFilter, setRegionFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchTournaments()
      .then(d => { if (!cancelled) { setData(d); setSelectedSeason(d.availableSeasons[0] || ''); } })
      .catch(e => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const tournaments = useMemo(() => {
    if (!data) return [];
    let list: ScheduledTournament[] = [];
    if (data.tournaments) {
      list = data.tournaments;
    } else if (data.seasons && selectedSeason && data.seasons[selectedSeason]) {
      list = data.seasons[selectedSeason].tournaments;
    }
    if (regionFilter) list = list.filter(t => t.region === regionFilter);
    if (typeFilter) list = list.filter(t => t.type === typeFilter);
    return list;
  }, [data, selectedSeason, regionFilter, typeFilter]);

  const regions = useMemo(() => {
    if (!data?.seasons || !selectedSeason || !data.seasons[selectedSeason]) return [];
    const set = new Set(data.seasons[selectedSeason].tournaments.map(t => t.region));
    return [...set].sort();
  }, [data, selectedSeason]);

  const types = useMemo(() => {
    if (!data?.seasons || !selectedSeason || !data.seasons[selectedSeason]) return [];
    const set = new Set(data.seasons[selectedSeason].tournaments.map(t => t.type));
    return [...set].sort();
  }, [data, selectedSeason]);

  // Group tournaments by month
  const grouped = useMemo(() => {
    const groups: { month: string; items: ScheduledTournament[] }[] = [];
    const map = new Map<string, ScheduledTournament[]>();
    for (const t of tournaments) {
      const key = monthKey(t.startDate);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    }
    for (const [month, items] of map) {
      groups.push({ month, items });
    }
    return groups;
  }, [tournaments]);

  const stats = useMemo(() => {
    const completed = tournaments.filter(t => t.status === 'completed').length;
    const upcoming = tournaments.filter(t => t.status === 'upcoming').length;
    const inProgress = tournaments.filter(t => t.status === 'in-progress').length;
    return { total: tournaments.length, completed, upcoming, inProgress };
  }, [tournaments]);

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="flex items-center justify-center gap-3 text-slate-400 dark:text-slate-500">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>Loading tournaments…</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center text-red-500 dark:text-red-400">
          <p className="font-medium">Failed to load tournaments</p>
          <p className="text-sm mt-1">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-10 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-slate-800 dark:text-slate-100 tracking-tight">
            Tournament Schedule
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {stats.total} tournament{stats.total !== 1 ? 's' : ''}
            {stats.completed > 0 && <> &middot; {stats.completed} completed</>}
            {stats.inProgress > 0 && <> &middot; {stats.inProgress} in progress</>}
            {stats.upcoming > 0 && <> &middot; {stats.upcoming} upcoming</>}
          </p>
        </div>
        {data?.availableSeasons && data.availableSeasons.length > 0 && (
          <SeasonPicker
            seasons={data.availableSeasons}
            selected={selectedSeason}
            onChange={s => { setSelectedSeason(s); setRegionFilter(''); setTypeFilter(''); }}
          />
        )}
      </div>

      {/* Filters */}
      {regions.length > 1 && (
        <FilterPills label="Region" options={regions} selected={regionFilter} onChange={setRegionFilter} />
      )}
      {types.length > 1 && (
        <FilterPills label="Type" options={types} selected={typeFilter} onChange={setTypeFilter} />
      )}

      {/* Tournament list grouped by month */}
      {grouped.length === 0 ? (
        <div className="text-center py-16 text-slate-400 dark:text-slate-500">
          <Calendar className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p className="text-lg font-medium">No tournaments found</p>
          <p className="text-sm mt-1">Try adjusting your filters</p>
        </div>
      ) : (
        <div className="space-y-8">
          {grouped.map(({ month, items }) => (
            <section key={month}>
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-3 px-1">
                {month}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {items.map((t, i) => (
                  <TournamentCard key={`${t.name}-${i}`} tournament={t} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
