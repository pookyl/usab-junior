import { useEffect, useState } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { ArrowLeft, ExternalLink, Trophy, RefreshCw, Calendar } from 'lucide-react';
import type { AgeGroup, EventType, JuniorPlayer, JuniorPlayerDetail } from '../types/junior';
import { EVENT_LABELS } from '../types/junior';
import { staticRankings } from '../data/usaJuniorData';
import {
  fetchPlayerDetail,
  usabPlayerUrl,
  tswSearchUrl,
  tswTournamentUrl,
} from '../services/rankingsService';

const AGE_COLORS: Record<AgeGroup, string> = {
  U11: 'from-violet-800 to-violet-900',
  U13: 'from-blue-800 to-blue-900',
  U15: 'from-emerald-800 to-emerald-900',
  U17: 'from-amber-700 to-amber-900',
  U19: 'from-rose-800 to-rose-900',
};

const AGE_ACCENT: Record<AgeGroup, string> = {
  U11: 'text-violet-400',
  U13: 'text-blue-400',
  U15: 'text-emerald-400',
  U17: 'text-amber-400',
  U19: 'text-rose-400',
};

const AGE_BADGE: Record<AgeGroup, string> = {
  U11: 'bg-violet-500',
  U13: 'bg-blue-500',
  U15: 'bg-emerald-500',
  U17: 'bg-amber-500',
  U19: 'bg-rose-500',
};

function findPlayerInStatic(usabId: string): JuniorPlayer | undefined {
  for (const players of Object.values(staticRankings)) {
    if (!players) continue;
    const found = players.find((p) => p.usabId === usabId);
    if (found) return found;
  }
  return undefined;
}

export default function PlayerDetail() {
  const { id: usabId } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();

  const ageGroup = (searchParams.get('age_group') ?? 'U11') as AgeGroup;
  const eventType = (searchParams.get('category') ?? 'BS') as EventType;

  const staticPlayer = findPlayerInStatic(usabId ?? '');
  const [detail, setDetail] = useState<JuniorPlayerDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const player: JuniorPlayer | undefined = detail
    ? { ...detail, name: detail.name || staticPlayer?.name || '', rank: detail.rank || staticPlayer?.rank || 0, rankingPoints: detail.rankingPoints || staticPlayer?.rankingPoints || 0 }
    : staticPlayer;

  useEffect(() => {
    if (!usabId) return;
    setLoading(true);
    fetchPlayerDetail(usabId, ageGroup, eventType)
      .then((d) => {
        setDetail(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [usabId, ageGroup, eventType]);

  if (!usabId) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-16 text-center">
        <p className="text-slate-400 text-lg">Player not found.</p>
        <Link to="/players" className="text-emerald-600 hover:underline mt-2 inline-block">
          Back to rankings
        </Link>
      </div>
    );
  }

  const gradient = AGE_COLORS[ageGroup];
  const accent = AGE_ACCENT[ageGroup];
  const badge = AGE_BADGE[ageGroup];
  const displayName = player?.name || `USAB #${usabId}`;
  const displayRank = player?.rank ?? '—';
  const displayPoints = player?.rankingPoints ?? '—';

  const tournamentHistory = detail?.tournamentHistory ?? [];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Back */}
      <Link
        to="/players"
        className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-emerald-600 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Rankings
      </Link>

      {/* Hero card */}
      <div className={`bg-gradient-to-br ${gradient} rounded-2xl p-6 text-white`}>
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
          {/* Avatar placeholder using initials */}
          <div className={`w-20 h-20 rounded-2xl ${badge} bg-opacity-60 flex items-center justify-center text-2xl font-black text-white shrink-0`}>
            {displayName.split(' ').map((w) => w[0]).slice(0, 2).join('')}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap mb-2">
              <h1 className="text-2xl font-bold truncate">{displayName}</h1>
              <span className={`${badge} text-white text-xs font-bold px-3 py-1 rounded-full`}>
                {ageGroup} {eventType}
              </span>
              <span className="bg-white/10 text-white text-xs font-semibold px-3 py-1 rounded-full">
                {EVENT_LABELS[eventType]}
              </span>
            </div>
            <div className="flex flex-wrap gap-3 text-white/70 text-sm">
              <span>USAB ID: <span className="font-mono text-white font-semibold">{usabId}</span></span>
              <span>·</span>
              <span>🇺🇸 USA</span>
            </div>
          </div>

          <div className="flex gap-6 text-center shrink-0">
            <div>
              <p className={`text-3xl font-black ${accent}`}>
                {typeof displayRank === 'number' ? `#${displayRank}` : '—'}
              </p>
              <p className="text-xs text-white/50 mt-0.5">Rank</p>
            </div>
            <div>
              <p className="text-3xl font-black">
                {typeof displayPoints === 'number' ? displayPoints.toLocaleString() : '—'}
              </p>
              <p className="text-xs text-white/50 mt-0.5">Points</p>
            </div>
          </div>
        </div>

        {/* External links */}
        <div className="mt-5 flex flex-wrap gap-3">
          <a
            href={usabPlayerUrl(usabId, ageGroup, eventType)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-xl text-sm text-white transition-colors"
          >
            <Trophy className="w-4 h-4" />
            USAB Rankings Profile
            <ExternalLink className="w-3.5 h-3.5 opacity-70" />
          </a>
          <a
            href={tswSearchUrl(displayName)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-xl text-sm text-white transition-colors"
          >
            <Calendar className="w-4 h-4" />
            Match History on TournamentSoftware
            <ExternalLink className="w-3.5 h-3.5 opacity-70" />
          </a>
        </div>
      </div>

      {/* Tournament History */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">Tournament History</h2>
            <p className="text-sm text-slate-400">Ranking points earned per event</p>
          </div>
          <a
            href={usabPlayerUrl(usabId, ageGroup, eventType)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-sm text-blue-600 hover:underline"
          >
            View full history <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>

        {loading ? (
          <div className="py-12 text-center">
            <RefreshCw className="w-7 h-7 text-slate-300 animate-spin mx-auto mb-3" />
            <p className="text-slate-400 text-sm">Loading tournament history…</p>
          </div>
        ) : tournamentHistory.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-400 text-xs uppercase tracking-wider border-b border-slate-100">
                  <th className="pb-3 font-medium">Tournament</th>
                  <th className="pb-3 font-medium hidden md:table-cell">Place</th>
                  <th className="pb-3 font-medium text-right">Points</th>
                  <th className="pb-3 font-medium text-right">Draw</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {tournamentHistory.map((entry, i) => (
                  <tr key={i} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3">
                      <p className="font-medium text-slate-700 text-sm">{entry.tournamentName}</p>
                      {entry.location && (
                        <p className="text-xs text-slate-400 mt-0.5">{entry.location}</p>
                      )}
                    </td>
                    <td className="py-3 hidden md:table-cell">
                      {entry.place && (
                        <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full text-xs">
                          {entry.place}
                        </span>
                      )}
                    </td>
                    <td className="py-3 text-right">
                      <span className="font-bold text-emerald-600">{entry.points.toLocaleString()}</span>
                    </td>
                    <td className="py-3 text-right">
                      {entry.tournamentId ? (
                        <a
                          href={tswTournamentUrl(entry.tournamentId)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-orange-600 hover:underline flex items-center gap-0.5 justify-end"
                        >
                          Draw <ExternalLink className="w-3 h-3" />
                        </a>
                      ) : (
                        <a
                          href={`https://www.tournamentsoftware.com/find?type=tournament&q=${encodeURIComponent(entry.tournamentName)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-orange-600 hover:underline flex items-center gap-0.5 justify-end"
                        >
                          Search <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-10 text-center space-y-4">
            <Calendar className="w-10 h-10 text-slate-200 mx-auto" />
            <p className="text-slate-400 text-sm">
              Tournament history could not be loaded automatically.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <a
                href={usabPlayerUrl(usabId, ageGroup, eventType)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 bg-violet-600 text-white rounded-xl text-sm hover:bg-violet-700 transition-colors"
              >
                View on USAB Rankings <ExternalLink className="w-4 h-4" />
              </a>
              <a
                href={tswSearchUrl(displayName)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-xl text-sm hover:bg-orange-600 transition-colors"
              >
                Search on TournamentSoftware <ExternalLink className="w-4 h-4" />
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
