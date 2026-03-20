import { Link } from 'react-router-dom';
import { Calendar, MapPin } from 'lucide-react';
import type { TournamentMatch, RoundRobinPlayer } from '../../types/junior';

// ── TeamRow (shared between MatchCard and RoundRobinMatchCard) ──────────────

export function TeamRow({ names, playerIds, tswId, fromPath, won, ongoing, lost, boldName, scores, otherScores, showRetired, showWalkover }: {
  names: string[];
  playerIds?: (number | null)[];
  tswId?: string;
  fromPath?: string;
  won: boolean;
  ongoing?: boolean;
  lost?: boolean;
  boldName?: boolean;
  scores: number[];
  otherScores: number[];
  showRetired?: boolean;
  showWalkover?: boolean;
}) {
  const nameClass = (won || (boldName && !lost))
    ? 'font-semibold text-slate-800 dark:text-slate-100'
    : 'text-slate-800 dark:text-slate-100';
  const badgeClass = won
    ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400'
    : 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500';

  return (
    <div className="flex items-start gap-2 py-1.5">
      {ongoing ? (
        <span className="w-5 shrink-0" />
      ) : (
        <span className={`w-5 h-5 flex items-center justify-center rounded-full text-[10px] font-bold shrink-0 mt-0.5 ${badgeClass}`}>
          {won ? 'W' : 'L'}
        </span>
      )}
      <div className={`text-sm min-w-0 flex-1 ${nameClass}`}>
        {names.map((n, i) => {
          const pid = playerIds?.[i];
          if (pid && tswId) {
            return (
              <div key={i} className="truncate">
                <Link
                  to={`/tournaments/${tswId}/player/${pid}`}
                  state={fromPath ? { fromPath } : undefined}
                  className="hover:text-violet-600 dark:hover:text-violet-400 hover:underline"
                >
                  {n}
                </Link>
              </div>
            );
          }
          return <div key={i} className="truncate">{n}</div>;
        })}
      </div>
      <div className="flex items-center gap-1 shrink-0 font-mono text-sm pt-0.5">
        {showWalkover && (
          <span className="text-amber-500 dark:text-amber-400 text-xs font-semibold">Walkover</span>
        )}
        {showRetired && (
          <span className="text-amber-500 dark:text-amber-400 text-xs font-semibold mr-1">Retired</span>
        )}
        {won && (
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
        )}
        {scores.map((s, i) => {
          const isWinningGame = s > otherScores[i];
          const scoreClass = lost
            ? 'text-slate-800 dark:text-slate-100'
            : won
              ? (isWinningGame ? 'font-bold text-emerald-600 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400')
              : 'text-slate-800 dark:text-slate-100';
          return (
            <span key={i} className={`w-5 text-right tabular-nums ${scoreClass}`}>{s}</span>
          );
        })}
      </div>
    </div>
  );
}

// ── Adapter to convert RoundRobinPlayer[] to TeamRow props ──────────────────

export function teamRowPropsFromRR(players: RoundRobinPlayer[]) {
  return {
    names: players.map(p => p.name),
    playerIds: players.map(p => p.playerId),
  };
}

// ── MatchCard ───────────────────────────────────────────────────────────────

export default function MatchCard({
  match,
  date,
  tswId,
  fromPath,
  highlightPlayerId,
  highlightPlayerName,
}: {
  match: TournamentMatch;
  date?: string;
  tswId?: string;
  fromPath?: string;
  highlightPlayerId?: number;
  highlightPlayerName?: string;
}) {
  const t1Scores = match.scores.map(g => g[0]);
  const t2Scores = match.scores.map(g => g[1]);
  const ongoing = !match.team1Won && !match.team2Won && !match.walkover && !match.bye;
  const normalizedHighlightName = highlightPlayerName?.trim().toLowerCase();
  const teamHasHighlightedPlayer = (teamIds?: (number | null)[], teamNames?: string[]) => {
    if (highlightPlayerId && teamIds?.some(pid => pid === highlightPlayerId)) return true;
    if (normalizedHighlightName && teamNames?.some(name => name.trim().toLowerCase() === normalizedHighlightName)) return true;
    return false;
  };
  const team1HasHighlightedPlayer = teamHasHighlightedPlayer(match.team1Ids, match.team1);
  const team2HasHighlightedPlayer = teamHasHighlightedPlayer(match.team2Ids, match.team2);

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 hover:shadow-md transition-shadow">
      <div className="px-4 py-2 bg-slate-200/70 dark:bg-slate-800/60 rounded-t-xl">
        <p className="text-xs font-medium text-slate-600 dark:text-slate-300">
          {match.header || [match.round, match.event].filter(Boolean).join(' \u00b7 ')}
        </p>
      </div>

      <div className="px-4 divide-y divide-slate-100 dark:divide-slate-800">
        <TeamRow
          names={match.team1}
          playerIds={match.team1Ids}
          tswId={tswId}
          fromPath={fromPath}
          won={match.team1Won}
          ongoing={ongoing}
          lost={!match.team1Won && match.team2Won}
          boldName={team1HasHighlightedPlayer}
          scores={t1Scores}
          otherScores={t2Scores}
          showWalkover={match.walkover && !match.team1Won}
          showRetired={match.retired && !match.team1Won}
        />
        {match.bye ? (
          <div className="flex items-center gap-2 py-1.5">
            <span className="w-5 h-5 flex items-center justify-center rounded-full text-[10px] font-bold shrink-0 mt-0.5 bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500">
              L
            </span>
            <span className="text-sm text-slate-800 dark:text-slate-100">Bye</span>
          </div>
        ) : (
          <TeamRow
            names={match.team2}
            playerIds={match.team2Ids}
            tswId={tswId}
            fromPath={fromPath}
            won={match.team2Won}
            ongoing={ongoing}
            lost={!match.team2Won && match.team1Won}
            boldName={team2HasHighlightedPlayer}
            scores={t2Scores}
            otherScores={t1Scores}
            showWalkover={match.walkover && !match.team2Won}
            showRetired={match.retired && !match.team2Won}
          />
        )}
      </div>

      <div className="px-4 py-2 flex items-center gap-3 text-[11px] text-slate-400 dark:text-slate-500 border-t border-slate-100 dark:border-slate-800">
        {(date || match.time) && (
          <span className="flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            {[date, match.time].filter(Boolean).join(' ')}
          </span>
        )}
        {match.location && (
          <span className="flex items-center gap-1">
            <MapPin className="w-3 h-3" />
            {match.location}
          </span>
        )}
        {match.duration && (
          <span className="ml-auto">{match.duration}</span>
        )}
      </div>
    </div>
  );
}
