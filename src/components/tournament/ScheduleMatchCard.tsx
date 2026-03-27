import { Link } from 'react-router-dom';
import { MapPin, Trophy, ShieldAlert } from 'lucide-react';
import type { ScheduleMatch, ScheduleNextMatch } from '../../types/junior';

export function PlayerLink({ name, playerId, tswId, fromPath }: {
  name: string; playerId: number | null; tswId: string; fromPath: string;
}) {
  if (playerId && tswId) {
    return (
      <Link
        to={`/tournaments/${tswId}/player/${playerId}`}
        state={{ fromPath }}
        className="hover:text-violet-600 dark:hover:text-violet-400 hover:underline"
      >
        {name}
      </Link>
    );
  }
  return <>{name}</>;
}

export function formatPathTime(time: string, dayDate: string): string {
  if (!time) return 'Time TBD';
  const m = time.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(.+)$/);
  if (!m) return time;
  const [, month, day, year, clock] = m;
  const timeDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  if (timeDate === dayDate) return clock;
  return `${month}/${day} ${clock}`;
}

export function PathRow({ nm, tswId, fromPath, dayDate }: {
  nm: ScheduleNextMatch; tswId: string; fromPath: string; dayDate: string;
}) {
  return (
    <div className="flex items-baseline gap-2 min-w-0">
      <span className="text-sm text-slate-700 dark:text-slate-200 shrink-0">{nm.round}</span>
      <span className="text-sm font-bold text-slate-800 dark:text-slate-100 shrink-0">
        {formatPathTime(nm.time, dayDate)}
      </span>
      {nm.opponent ? (
        <span className="text-sm text-slate-600 dark:text-slate-300 truncate">
          vs {nm.opponent.names.map((n, i) => (
            <span key={i}>
              {i > 0 && ' / '}
              <PlayerLink name={n} playerId={nm.opponent!.playerIds[i]} tswId={tswId} fromPath={fromPath} />
            </span>
          ))}
        </span>
      ) : (
        <span className="text-sm text-slate-600 dark:text-slate-300">vs TBD</span>
      )}
    </div>
  );
}

export interface PlayerCardColor {
  borderL: string;
  border: string;
  bg: string;
  headerBg: string;
  footerBg: string;
  footerBorder: string;
}

export interface PlayerBadge {
  name: string;
  dotClass: string;
  bgClass: string;
  textClass: string;
  cardColor?: PlayerCardColor;
}

export default function ScheduleMatchCard({ match, tswId, fromPath, dayDate, playerBadge }: {
  match: ScheduleMatch;
  tswId: string;
  fromPath: string;
  dayDate: string;
  playerBadge?: PlayerBadge;
}) {
  const isLive = match.status === 'in-progress';
  const isBye = match.status === 'bye' || match.status === 'walkover';
  const hasWinPath = match.nextMatches.length > 0;
  const hasLosePath = !!match.consolation;
  const potentialMatches = 1 + Math.max(match.nextMatches.length, match.consolationMatches.length);

  const cc = playerBadge?.cardColor;
  const cardClass = isLive
    ? 'border-l-sky-500 border-sky-200 dark:border-sky-800 bg-sky-50/50 dark:bg-sky-950/20 ring-1 ring-sky-200 dark:ring-sky-800/50'
    : cc
      ? `${cc.borderL} ${cc.border} ${cc.bg}`
      : 'border-l-amber-400 border-amber-200 dark:border-amber-900/50 bg-amber-50/50 dark:bg-amber-950/20';
  const headerClass = isLive
    ? 'bg-sky-100/60 dark:bg-sky-900/30'
    : cc
      ? cc.headerBg
      : 'bg-amber-100/60 dark:bg-amber-900/30';

  return (
    <div className={`rounded-xl overflow-hidden border-l-[3px] border transition-all duration-200 ease-out shadow-[0_2px_8px_-2px_rgba(0,0,0,0.12),0_4px_16px_-4px_rgba(0,0,0,0.08)] hover:shadow-[0_8px_24px_-4px_rgba(0,0,0,0.15),0_12px_32px_-8px_rgba(0,0,0,0.1)] hover:-translate-y-0.5 ${cardClass}`}>
      {/* Header: Event + Round + optional player badge */}
      <div className={`px-4 py-2.5 flex items-center justify-between gap-2 ${headerClass}`}>
        <div className="flex items-center gap-2 min-w-0">
          {playerBadge && (
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-sm font-extrabold tracking-wide shrink-0 ${playerBadge.bgClass} ${playerBadge.textClass}`}>
              <span className={`w-2 h-2 rounded-full ${playerBadge.dotClass}`} />
              {playerBadge.name}
            </span>
          )}
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 uppercase tracking-wide truncate">
            {match.event} &middot; {match.round}
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {isLive && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-sky-500 text-white animate-pulse">
              Now Playing
            </span>
          )}
          {isBye && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400">
              {match.status === 'walkover' ? 'W/O' : 'Bye'}
            </span>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="px-4 py-3 space-y-3">
        {/* Court */}
        {match.court && (
          <div className="flex items-center gap-1 text-xs text-slate-400 dark:text-slate-500">
            <MapPin className="w-3 h-3" />
            {match.court}
          </div>
        )}

        {/* Opponent */}
        <div className="flex items-start gap-2">
          <span className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 shrink-0 w-7">vs</span>
          {match.opponent.names.length > 0 ? (
            <div className="text-sm font-semibold text-slate-800 dark:text-slate-100 min-w-0">
              {match.opponent.names.map((name, i) => (
                <div key={i} className="truncate">
                  <PlayerLink name={name} playerId={match.opponent.playerIds[i]} tswId={tswId} fromPath={fromPath} />
                </div>
              ))}
            </div>
          ) : (
            <span className="text-sm font-medium text-slate-400 dark:text-slate-500 italic">TBD</span>
          )}
        </div>

        {/* Partner (doubles/mixed) */}
        {match.partner && (
          <div className="flex items-start gap-2">
            <span className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 shrink-0 w-7">with</span>
            <div className="text-sm text-slate-600 dark:text-slate-300 min-w-0">
              {match.partner.names.map((name, i) => (
                <div key={i} className="truncate">
                  <PlayerLink name={name} playerId={match.partner!.playerIds[i]} tswId={tswId} fromPath={fromPath} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Bracket paths */}
        {(hasWinPath || hasLosePath) && (
          <div className="pt-1 space-y-2 border-t border-dashed border-slate-200 dark:border-slate-700">
            {hasWinPath && (
              <div className="space-y-1">
                <div className="flex items-center gap-1.5">
                  <Trophy className="w-4 h-4 text-emerald-500 dark:text-emerald-400 shrink-0" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">If win</span>
                </div>
                <div className="pl-5 space-y-0.5">
                  {match.nextMatches.map((nm, idx) => (
                    <PathRow key={idx} nm={nm} tswId={tswId} fromPath={fromPath} dayDate={dayDate} />
                  ))}
                </div>
              </div>
            )}

            {hasLosePath && (
              <div className="space-y-1">
                <div className="flex items-center gap-1.5">
                  <ShieldAlert className="w-4 h-4 text-amber-500 dark:text-amber-400 shrink-0" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">If lose</span>
                  <span className="text-xs text-amber-500 dark:text-amber-400">&rarr; {match.consolation}</span>
                </div>
                {match.consolationMatches.length > 0 && (
                  <div className="pl-5 space-y-0.5">
                    {match.consolationMatches.map((cm, idx) => (
                      <PathRow key={idx} nm={cm} tswId={tswId} fromPath={fromPath} dayDate={dayDate} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {potentialMatches > 1 && (
        <div className={`px-4 py-1.5 border-t ${
          cc && !isLive
            ? `${cc.footerBg} ${cc.footerBorder}`
            : 'bg-amber-50/40 dark:bg-amber-900/10 border-amber-100 dark:border-amber-900/30'
        }`}>
          <p className="text-[11px] text-slate-400 dark:text-slate-500">
            Up to {potentialMatches} matches possible in this event
          </p>
        </div>
      )}
    </div>
  );
}
