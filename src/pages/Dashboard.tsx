import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Users, Award, Feather, Calendar } from 'lucide-react';
import { usePlayers } from '../contexts/PlayersContext';
import type { AgeGroup, PlayerEntry } from '../types/junior';
import { AGE_GROUPS } from '../types/junior';
import StatCard from '../components/StatCard';

type Gender = 'boy' | 'girl' | null;

const BOY_EVENTS = new Set(['BS', 'BD']);
const GIRL_EVENTS = new Set(['GS', 'GD']);

function inferGender(entries: PlayerEntry[]): Gender {
  for (const e of entries) {
    if (BOY_EVENTS.has(e.eventType)) return 'boy';
    if (GIRL_EVENTS.has(e.eventType)) return 'girl';
  }
  return null;
}

interface GroupStats {
  total: number;
  boys: number;
  girls: number;
}

const AGE_COLORS: Record<AgeGroup, { bg: string; gradient: string; light: string; text: string }> = {
  U11: { bg: 'bg-violet-600', gradient: 'from-violet-500 to-violet-700', light: 'bg-violet-50', text: 'text-violet-700' },
  U13: { bg: 'bg-blue-600', gradient: 'from-blue-500 to-blue-700', light: 'bg-blue-50', text: 'text-blue-700' },
  U15: { bg: 'bg-emerald-600', gradient: 'from-emerald-500 to-emerald-700', light: 'bg-emerald-50', text: 'text-emerald-700' },
  U17: { bg: 'bg-amber-500', gradient: 'from-amber-400 to-amber-600', light: 'bg-amber-50', text: 'text-amber-700' },
  U19: { bg: 'bg-rose-600', gradient: 'from-rose-500 to-rose-700', light: 'bg-rose-50', text: 'text-rose-700' },
};

function GenderBar({ boys, girls }: { boys: number; girls: number }) {
  const total = boys + girls;
  if (total === 0) return <div className="h-3 bg-slate-100 dark:bg-slate-800 rounded-full" />;
  const bPct = (boys / total) * 100;
  const gPct = (girls / total) * 100;
  return (
    <div className="h-3 rounded-full overflow-hidden flex bg-slate-100 dark:bg-slate-800">
      {bPct > 0 && (
        <div className="bg-blue-500 transition-all duration-500" style={{ width: `${bPct}%` }} />
      )}
      {gPct > 0 && (
        <div className="bg-pink-400 transition-all duration-500" style={{ width: `${gPct}%` }} />
      )}
    </div>
  );
}

function AgeGroupCard({ ageGroup, stats }: { ageGroup: AgeGroup; stats: GroupStats }) {
  const colors = AGE_COLORS[ageGroup];

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 overflow-hidden hover:shadow-md transition-shadow">
      <Link
        to={`/directory?age_group=${ageGroup}`}
        className={`bg-gradient-to-r ${colors.gradient} px-4 md:px-5 py-2.5 md:py-3 flex items-center justify-between hover:brightness-110 transition-all`}
      >
        <span className="font-bold text-white text-base md:text-lg">{ageGroup}</span>
        <span className="bg-white/20 text-white text-xs md:text-sm font-semibold px-2.5 md:px-3 py-0.5 rounded-full">
          {stats.total} players
        </span>
      </Link>
      <div className="p-4 md:p-5 space-y-3">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium text-blue-600">{stats.boys} Boys</span>
          <span className="font-medium text-pink-500">{stats.girls} Girls</span>
        </div>
        <GenderBar boys={stats.boys} girls={stats.girls} />
        <div className="flex items-center justify-center gap-1.5 text-xs">
          <span className="text-slate-400 dark:text-slate-500 font-medium">Rankings:</span>
          {(['BS', 'GS', 'XD'] as const).map((et) => (
            <Link
              key={et}
              to={`/players?age_group=${ageGroup}&event_type=${et}`}
              className={`px-2 py-0.5 rounded-md font-semibold ${colors.text} ${colors.light} hover:opacity-80 transition-opacity`}
            >
              {et}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

function formatRankingsDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

export default function Dashboard() {
  const { players, loading, rankingsDate } = usePlayers();
  const hasData = players.length > 0;

  const { totalBoys, totalGirls, totalPlayers, groupStats } = useMemo(() => {
    let boys = 0;
    let girls = 0;
    const groups: Record<AgeGroup, GroupStats> = {
      U11: { total: 0, boys: 0, girls: 0 },
      U13: { total: 0, boys: 0, girls: 0 },
      U15: { total: 0, boys: 0, girls: 0 },
      U17: { total: 0, boys: 0, girls: 0 },
      U19: { total: 0, boys: 0, girls: 0 },
    };

    for (const player of players) {
      const gender = inferGender(player.entries);
      if (!gender) continue;

      if (gender === 'boy') boys++;
      else girls++;

      const ageGroupsForPlayer = new Set(player.entries.map((e) => e.ageGroup));
      for (const ag of ageGroupsForPlayer) {
        groups[ag].total++;
        if (gender === 'boy') groups[ag].boys++;
        else groups[ag].girls++;
      }
    }

    return { totalBoys: boys, totalGirls: girls, totalPlayers: boys + girls, groupStats: groups };
  }, [players]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 md:py-8 space-y-6 md:space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 md:gap-4">
        <div>
          <div className="flex items-center gap-2.5 md:gap-3 mb-1">
            <div className="w-9 h-9 md:w-10 md:h-10 bg-gradient-to-br from-blue-600 to-violet-600 rounded-xl flex items-center justify-center">
              <Award className="w-4 h-4 md:w-5 md:h-5 text-white" />
            </div>
            <h1 className="text-2xl md:text-3xl font-bold text-slate-800 dark:text-slate-100">USA Junior Badminton</h1>
          </div>
          <p className="text-sm md:text-base text-slate-500 dark:text-slate-400 ml-[46px] md:ml-[52px]">
            Player Overview · Data from{' '}
            <a href="https://usabjrrankings.org" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
              usabjrrankings.org
            </a>
          </p>
          <p className="text-slate-400 dark:text-slate-500 text-xs md:text-sm ml-[46px] md:ml-[52px] flex items-center gap-1.5 mt-0.5">
            <Calendar className="w-3.5 h-3.5" />
            Rankings as of {formatRankingsDate(rankingsDate)}
          </p>
        </div>
      </div>

      {/* Overview Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <StatCard
          label="Total Players"
          value={!hasData && loading ? '...' : totalPlayers.toLocaleString()}
          sub="Unique ranked players"
          icon={<Users className="w-5 h-5" />}
        />
        <StatCard
          label="Boys"
          value={!hasData && loading ? '...' : totalBoys.toLocaleString()}
          sub={totalPlayers > 0 ? `${((totalBoys / totalPlayers) * 100).toFixed(0)}% of total` : ''}
          icon={<span className="w-5 h-5 flex items-center justify-center text-lg">♂</span>}
          color="bg-blue-50"
        />
        <StatCard
          label="Girls"
          value={!hasData && loading ? '...' : totalGirls.toLocaleString()}
          sub={totalPlayers > 0 ? `${((totalGirls / totalPlayers) * 100).toFixed(0)}% of total` : ''}
          icon={<span className="w-5 h-5 flex items-center justify-center text-lg">♀</span>}
          color="bg-pink-50"
        />
        <StatCard
          label="Age Groups"
          value={AGE_GROUPS.length}
          sub="U11 · U13 · U15 · U17 · U19"
          icon={<Feather className="w-5 h-5" />}
        />
      </div>

      {/* Overall gender distribution bar */}
      {totalPlayers > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 p-4 md:p-6">
          <h2 className="text-base md:text-lg font-bold text-slate-800 dark:text-slate-100 mb-3 md:mb-4">Overall Gender Distribution</h2>
          <GenderBar boys={totalBoys} girls={totalGirls} />
          <div className="flex items-center gap-4 md:gap-6 mt-3 text-xs md:text-sm">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-blue-500 inline-block" />
              <span className="text-slate-600 dark:text-slate-300">Boys {totalBoys}</span>
              <span className="text-slate-400 dark:text-slate-500">({totalPlayers > 0 ? ((totalBoys / totalPlayers) * 100).toFixed(1) : 0}%)</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-pink-400 inline-block" />
              <span className="text-slate-600 dark:text-slate-300">Girls {totalGirls}</span>
              <span className="text-slate-400 dark:text-slate-500">({totalPlayers > 0 ? ((totalGirls / totalPlayers) * 100).toFixed(1) : 0}%)</span>
            </span>
          </div>
        </div>
      )}

      {/* Age Group Breakdown */}
      <div>
        <div className="flex items-center justify-between mb-3 md:mb-4">
          <h2 className="text-lg md:text-xl font-bold text-slate-800 dark:text-slate-100">Players by Age Group</h2>
          <Link to="/directory" className="text-sm text-emerald-600 hover:underline font-medium">
            View all →
          </Link>
        </div>
        {!hasData && loading ? (
          <div className="text-center py-12 text-slate-400 dark:text-slate-500">Loading player data...</div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3 md:gap-4">
            {AGE_GROUPS.map((ag) => (
              <AgeGroupCard key={ag} ageGroup={ag} stats={groupStats[ag]} />
            ))}
          </div>
        )}
      </div>

      {/* Summary table — card view on mobile, table on desktop */}
      {totalPlayers > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 overflow-hidden">
          <div className="px-4 md:px-6 py-3 md:py-4 border-b border-slate-100 dark:border-slate-800">
            <h2 className="text-base md:text-lg font-bold text-slate-800 dark:text-slate-100">Breakdown Summary</h2>
          </div>

          {/* Mobile: compact card layout */}
          <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-800">
            {AGE_GROUPS.map((ag) => {
              const s = groupStats[ag];
              const colors = AGE_COLORS[ag];
              return (
                <div key={ag} className="px-4 py-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className={`inline-flex items-center gap-2 font-semibold text-sm ${colors.text}`}>
                      <span className={`w-2 h-2 rounded-full ${colors.bg}`} />
                      {ag}
                    </span>
                    <span className="font-bold text-slate-700 dark:text-slate-200 text-sm">{s.total} players</span>
                  </div>
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="text-blue-600 font-medium">{s.boys} Boys</span>
                    <span className="text-pink-500 font-medium">{s.girls} Girls</span>
                  </div>
                  <GenderBar boys={s.boys} girls={s.girls} />
                </div>
              );
            })}
            <div className="px-4 py-3 bg-slate-50 dark:bg-slate-800/50">
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-slate-700 dark:text-slate-200 text-sm">Total</span>
                <span className="font-bold text-slate-700 dark:text-slate-200 text-sm">{totalPlayers} players</span>
              </div>
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="text-blue-600 font-medium">{totalBoys} Boys ({totalPlayers > 0 ? ((totalBoys / totalPlayers) * 100).toFixed(0) : 0}%)</span>
                <span className="text-pink-500 font-medium">{totalGirls} Girls ({totalPlayers > 0 ? ((totalGirls / totalPlayers) * 100).toFixed(0) : 0}%)</span>
              </div>
              <GenderBar boys={totalBoys} girls={totalGirls} />
            </div>
          </div>

          {/* Desktop: full table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 text-left">
                  <th className="px-6 py-3 font-semibold">Age Group</th>
                  <th className="px-6 py-3 font-semibold text-right">Total</th>
                  <th className="px-6 py-3 font-semibold text-right">Boys</th>
                  <th className="px-6 py-3 font-semibold text-right">Girls</th>
                  <th className="px-6 py-3 font-semibold text-right">Boy %</th>
                  <th className="px-6 py-3 font-semibold text-right">Girl %</th>
                  <th className="px-6 py-3 font-semibold">Distribution</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {AGE_GROUPS.map((ag) => {
                  const s = groupStats[ag];
                  const bPct = s.total > 0 ? ((s.boys / s.total) * 100).toFixed(0) : '—';
                  const gPct = s.total > 0 ? ((s.girls / s.total) * 100).toFixed(0) : '—';
                  const colors = AGE_COLORS[ag];
                  return (
                    <tr key={ag} className="hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                      <td className="px-6 py-3">
                        <span className={`inline-flex items-center gap-2 font-semibold ${colors.text}`}>
                          <span className={`w-2 h-2 rounded-full ${colors.bg}`} />
                          {ag}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-right font-bold text-slate-700 dark:text-slate-200">{s.total}</td>
                      <td className="px-6 py-3 text-right text-blue-600 font-medium">{s.boys}</td>
                      <td className="px-6 py-3 text-right text-pink-500 font-medium">{s.girls}</td>
                      <td className="px-6 py-3 text-right text-slate-500 dark:text-slate-400">{bPct}{bPct !== '—' && '%'}</td>
                      <td className="px-6 py-3 text-right text-slate-500 dark:text-slate-400">{gPct}{gPct !== '—' && '%'}</td>
                      <td className="px-6 py-3 w-40">
                        <GenderBar boys={s.boys} girls={s.girls} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50 dark:bg-slate-800/50 font-bold">
                  <td className="px-6 py-3 text-slate-700 dark:text-slate-200">Total</td>
                  <td className="px-6 py-3 text-right text-slate-700 dark:text-slate-200">{totalPlayers}</td>
                  <td className="px-6 py-3 text-right text-blue-600">{totalBoys}</td>
                  <td className="px-6 py-3 text-right text-pink-500">{totalGirls}</td>
                  <td className="px-6 py-3 text-right text-slate-500 dark:text-slate-400">
                    {totalPlayers > 0 ? ((totalBoys / totalPlayers) * 100).toFixed(0) : '—'}%
                  </td>
                  <td className="px-6 py-3 text-right text-slate-500 dark:text-slate-400">
                    {totalPlayers > 0 ? ((totalGirls / totalPlayers) * 100).toFixed(0) : '—'}%
                  </td>
                  <td className="px-6 py-3 w-40">
                    <GenderBar boys={totalBoys} girls={totalGirls} />
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="mt-4 pt-5 border-t border-slate-200 dark:border-slate-700 text-center text-xs text-slate-400 dark:text-slate-500 space-y-1">
        <p>USAB Junior Badminton Hub &middot; v0.1.0</p>
        <p>
          A hobby project &mdash; not affiliated with USA Badminton.
          Data sourced from{' '}
            <a href="https://usabjrrankings.org" target="_blank" rel="noopener noreferrer" className="underline hover:text-slate-600 dark:hover:text-slate-300">
            usabjrrankings.org
          </a>{' '}and{' '}
            <a href="https://www.tournamentsoftware.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-slate-600 dark:hover:text-slate-300">
            tournamentsoftware.com
          </a>.
        </p>
        <p>&copy; {new Date().getFullYear()} All rights reserved.</p>
      </footer>
    </div>
  );
}
