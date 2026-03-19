import { Link, useNavigate } from 'react-router-dom';
import { Calendar } from 'lucide-react';
import { TeamRow, teamRowPropsFromRR } from './MatchCard';
import type { RoundRobinDrawResponse, RoundRobinPlayer } from '../../types/junior';

function RoundRobinPlayerName({ player, tswId }: { player: RoundRobinPlayer; tswId: string }) {
  if (player.playerId) {
    return (
      <Link
        to={`/tournaments/${tswId}/player/${player.playerId}`}
        className="hover:text-violet-600 dark:hover:text-violet-400 hover:underline"
      >
        {player.name}
      </Link>
    );
  }
  return <span>{player.name}</span>;
}

function RoundRobinMatchCard({ match, tswId }: { match: RoundRobinDrawResponse['matches'][number]; tswId: string }) {
  const t1Scores = match.scores.map(g => g[0]);
  const t2Scores = match.scores.map(g => g[1]);
  const ongoing = match.winner === null && !match.walkover;

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 hover:shadow-md transition-shadow">
      <div className="px-4 pt-3 pb-1">
        <p className="text-xs text-slate-400 dark:text-slate-500">{match.round}</p>
      </div>
      <div className="px-4 divide-y divide-slate-100 dark:divide-slate-800">
        <TeamRow
          {...teamRowPropsFromRR(match.team1)}
          tswId={tswId}
          won={match.winner === 1}
          ongoing={ongoing}
          scores={t1Scores}
          otherScores={t2Scores}
        />
        <TeamRow
          {...teamRowPropsFromRR(match.team2)}
          tswId={tswId}
          won={match.winner === 2}
          ongoing={ongoing}
          scores={t2Scores}
          otherScores={t1Scores}
        />
      </div>
      {match.dateTime && (
        <div className="px-4 py-2 flex items-center gap-3 text-[11px] text-slate-400 dark:text-slate-500 border-t border-slate-100 dark:border-slate-800">
          <span className="flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            {match.dateTime}
          </span>
        </div>
      )}
    </div>
  );
}

export default function RoundRobinView({ data, tswId }: { data: RoundRobinDrawResponse; tswId: string }) {
  const navigate = useNavigate();

  return (
    <div className="space-y-6">
      {data.groups.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {data.groups.map(g => (
            <button
              key={g.drawId || g.name}
              onClick={() => !g.active && navigate(`/tournaments/${tswId}/draw/${g.drawId}`)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                g.active
                  ? 'bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              {g.name}
            </button>
          ))}
        </div>
      )}

      {data.standings.length > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 uppercase tracking-wider">Standings</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  <th className="px-3 py-2 text-center w-10 sticky left-0 bg-white dark:bg-slate-900 z-10">#</th>
                  <th className="px-3 py-2 text-left sticky left-10 bg-white dark:bg-slate-900 z-10 min-w-[140px]">Player(s)</th>
                  <th className="px-2 py-2 text-center" title="Played">Pl</th>
                  <th className="px-2 py-2 text-center" title="Won">W</th>
                  <th className="px-2 py-2 text-center" title="Draw">D</th>
                  <th className="px-2 py-2 text-center" title="Lost">L</th>
                  <th className="px-2 py-2 text-center" title="Matches">M</th>
                  <th className="px-2 py-2 text-center" title="Games">Gm</th>
                  <th className="px-2 py-2 text-center" title="Points">Points</th>
                  <th className="px-2 py-2 text-center font-bold" title="Total Points">Pts</th>
                  <th className="px-2 py-2 text-center" title="History">History</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {data.standings.map((s) => (
                  <tr
                    key={s.position}
                    className={s.position === 1 ? 'bg-emerald-50/50 dark:bg-emerald-900/10' : ''}
                  >
                    <td className="px-3 py-2 text-center sticky left-0 bg-inherit z-10">
                      <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
                        s.position === 1
                          ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                      }`}>
                        {s.position}
                      </span>
                    </td>
                    <td className="px-3 py-2 sticky left-10 bg-inherit z-10">
                      <div className="space-y-0.5">
                        {s.players.map((p, i) => (
                          <div key={i} className="text-sm truncate text-slate-800 dark:text-slate-100">
                            <RoundRobinPlayerName player={p} tswId={tswId} />
                          </div>
                        ))}
                      </div>
                    </td>
                    <td className="px-2 py-2 text-center tabular-nums text-slate-600 dark:text-slate-300">{s.played}</td>
                    <td className="px-2 py-2 text-center tabular-nums font-medium text-emerald-600 dark:text-emerald-400">{s.won}</td>
                    <td className="px-2 py-2 text-center tabular-nums text-slate-500 dark:text-slate-400">{s.drawn}</td>
                    <td className="px-2 py-2 text-center tabular-nums text-red-500 dark:text-red-400">{s.lost}</td>
                    <td className="px-2 py-2 text-center tabular-nums text-slate-600 dark:text-slate-300">{s.matchRecord}</td>
                    <td className="px-2 py-2 text-center tabular-nums text-slate-600 dark:text-slate-300">{s.gameRecord}</td>
                    <td className="px-2 py-2 text-center tabular-nums text-slate-600 dark:text-slate-300">{s.pointRecord}</td>
                    <td className="px-2 py-2 text-center tabular-nums text-lg font-bold text-slate-800 dark:text-slate-100">{s.points}</td>
                    <td className="px-2 py-2">
                      <div className="flex items-center justify-center gap-1">
                        {s.history.map((h, i) => (
                          <span
                            key={i}
                            className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold ${
                              h === 'W'
                                ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400'
                                : h === 'L'
                                  ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                                  : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                          }`}
                          >
                            {h}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {data.matches.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 uppercase tracking-wider">Matches</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {data.matches.map((m) => (
              <RoundRobinMatchCard key={m.matchId} match={m} tswId={tswId} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
