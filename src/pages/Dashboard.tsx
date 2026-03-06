import { Link } from 'react-router-dom';
import { Trophy, Users, ExternalLink, Award, Star } from 'lucide-react';
import { staticRankings } from '../data/usaJuniorData';
import type { AgeGroup } from '../types/junior';
import { AGE_GROUPS } from '../types/junior';
import StatCard from '../components/StatCard';
import { usabPlayerUrl } from '../services/rankingsService';

const AGE_COLORS: Record<AgeGroup, { bg: string; text: string; border: string; ring: string }> = {
  U11: { bg: 'bg-violet-600', text: 'text-violet-700', border: 'border-violet-200', ring: 'bg-violet-50' },
  U13: { bg: 'bg-blue-600', text: 'text-blue-700', border: 'border-blue-200', ring: 'bg-blue-50' },
  U15: { bg: 'bg-emerald-600', text: 'text-emerald-700', border: 'border-emerald-200', ring: 'bg-emerald-50' },
  U17: { bg: 'bg-amber-500', text: 'text-amber-700', border: 'border-amber-200', ring: 'bg-amber-50' },
  U19: { bg: 'bg-rose-600', text: 'text-rose-700', border: 'border-rose-200', ring: 'bg-rose-50' },
};

function TopPlayerCard({ ageGroup }: { ageGroup: AgeGroup }) {
  const players = staticRankings[`${ageGroup}-BS`] ?? [];
  const top3 = players.slice(0, 3);
  const colors = AGE_COLORS[ageGroup];

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
      <div className={`px-5 py-3 ${colors.bg} flex items-center justify-between`}>
        <div className="flex items-center gap-2">
          <Trophy className="w-4 h-4 text-white" />
          <span className="font-bold text-white text-sm">{ageGroup} Boys Singles</span>
        </div>
        <Link
          to={`/players?age_group=${ageGroup}&category=BS`}
          className="text-xs text-white/80 hover:text-white transition-colors"
        >
          View all →
        </Link>
      </div>
      <div className="divide-y divide-slate-50">
        {top3.map((player, i) => (
          <div key={player.usabId} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 transition-colors">
            <span className={`text-base font-black w-6 text-center ${i === 0 ? 'text-amber-500' : i === 1 ? 'text-slate-400' : 'text-amber-700'}`}>
              {i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'}
            </span>
            <Link
              to={`/players/${player.usabId}?age_group=${player.ageGroup}&category=${player.eventType}`}
              className="flex-1 min-w-0"
            >
              <p className="font-semibold text-slate-800 text-sm truncate hover:text-emerald-700 transition-colors">
                {player.name}
              </p>
              <p className="text-xs text-slate-400">ID: {player.usabId}</p>
            </Link>
            <span className={`font-bold text-sm ${colors.text}`}>
              {player.rankingPoints.toLocaleString()}
            </span>
            <a
              href={usabPlayerUrl(player.usabId, player.ageGroup, player.eventType)}
              target="_blank"
              rel="noopener noreferrer"
              className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-slate-500 transition"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        ))}
        {top3.length === 0 && (
          <div className="px-5 py-6 text-center text-sm text-slate-400">
            Loading rankings…
          </div>
        )}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const totalPlayers = Object.values(staticRankings).reduce(
    (sum, players) => sum + (players?.length ?? 0),
    0,
  );

  const topU11BS = staticRankings['U11-BS']?.[0];
  const totalAgeGroups = AGE_GROUPS.length;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-violet-600 rounded-xl flex items-center justify-center">
              <Award className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-slate-800">USA Junior Badminton</h1>
          </div>
          <p className="text-slate-500 ml-13">
            Rankings &amp; player tracker · Powered by{' '}
            <a href="https://usabjrrankings.org" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
              usabjrrankings.org
            </a>
            {' '}&amp;{' '}
            <a href="https://www.tournamentsoftware.com" target="_blank" rel="noopener noreferrer" className="text-orange-600 hover:underline">
              tournamentsoftware.com
            </a>
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Ranked Players"
          value={totalPlayers.toLocaleString()}
          sub="Across all categories"
          icon={<Users className="w-5 h-5" />}
        />
        <StatCard
          label="Age Groups"
          value={totalAgeGroups}
          sub="U11 · U13 · U15 · U17 · U19"
          icon={<Star className="w-5 h-5" />}
        />
        <StatCard
          label="#1 U11 Boys"
          value={topU11BS?.name.split(' ')[0] ?? '—'}
          sub={`${topU11BS?.rankingPoints.toLocaleString() ?? '—'} pts`}
          icon={<Trophy className="w-5 h-5" />}
        />
        <StatCard
          label="Events"
          value="5"
          sub="BS · GS · BD · GD · XD"
          icon={<Award className="w-5 h-5" />}
        />
      </div>

      {/* Top players per age group */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-slate-800">Top Players by Age Group</h2>
          <Link to="/players" className="text-sm text-emerald-600 hover:underline font-medium">
            View full rankings →
          </Link>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
          {AGE_GROUPS.map((ag) => (
            <TopPlayerCard key={ag} ageGroup={ag} />
          ))}
        </div>
      </div>

      {/* Quick links */}
      <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl p-6 text-white">
        <h2 className="text-lg font-semibold mb-1">External Resources</h2>
        <p className="text-slate-400 text-sm mb-5">
          Live rankings and full match draws from official sources
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <a
            href="https://usabjrrankings.org"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 p-4 bg-white/5 hover:bg-white/10 rounded-xl transition-colors border border-white/10"
          >
            <Trophy className="w-8 h-8 text-violet-400 shrink-0" />
            <div>
              <p className="font-semibold">USAB Junior Rankings</p>
              <p className="text-sm text-slate-400">Official rankings for all age groups &amp; events</p>
            </div>
            <ExternalLink className="w-4 h-4 text-slate-500 ml-auto shrink-0" />
          </a>
          <a
            href="https://www.tournamentsoftware.com"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 p-4 bg-white/5 hover:bg-white/10 rounded-xl transition-colors border border-white/10"
          >
            <Award className="w-8 h-8 text-orange-400 shrink-0" />
            <div>
              <p className="font-semibold">Tournament Software</p>
              <p className="text-sm text-slate-400">Tournament draws, match results &amp; player stats</p>
            </div>
            <ExternalLink className="w-4 h-4 text-slate-500 ml-auto shrink-0" />
          </a>
        </div>
      </div>
    </div>
  );
}
