import { useMemo, useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Trophy } from 'lucide-react';
import type {
  BracketMatch as BracketMatchData,
  BracketSection,
} from '../../types/junior';

// ── Display types ───────────────────────────────────────────────────────────

export interface DisplayPlayer {
  name: string;
  seed: string;
  playerId: number | null;
  won: boolean;
  bye: boolean;
  position?: number;
  partner?: string;
  partnerPlayerId?: number | null;
}

export interface DisplayMatch {
  player1: DisplayPlayer | null;
  player2: DisplayPlayer | null;
  score: string[];
  retired: boolean;
  walkover: boolean;
  bye: boolean;
  feedInPlayer?: DisplayPlayer | null;
  scheduledTime?: string;
}

export interface DisplayRound {
  name: string;
  matches: DisplayMatch[];
}

function appendSeed(name: string, seed?: string): string {
  const cleanName = name?.trim() ?? '';
  const cleanSeed = seed?.trim() ?? '';
  if (!cleanName || !cleanSeed) return cleanName;
  if (/\s\[[\d/]+\]\s*$/i.test(cleanName)) return cleanName;
  return `${cleanName} [${cleanSeed}]`;
}

// ── buildDisplayRounds ──────────────────────────────────────────────────────

export function buildDisplayRounds(section: BracketSection): { rounds: DisplayRound[]; hasFeedIn: boolean } {
  const sectionMatches = section.matches ?? [];
  const sectionEntries = section.entries ?? [];
  const sectionRounds = section.rounds ?? [];

  const matchesByLevel = new Map<number, BracketMatchData[]>();
  for (const m of sectionMatches) {
    if (!matchesByLevel.has(m.roundLevel)) matchesByLevel.set(m.roundLevel, []);
    matchesByLevel.get(m.roundLevel)!.push(m);
  }
  for (const ms of matchesByLevel.values()) ms.sort((a, b) => a.matchNum - b.matchNum);

  const levels = [...matchesByLevel.keys()].sort((a, b) => b - a);

  // TSW headers include "Winner" as a column name, but we generate the winner
  // column automatically from the finals result. Strip it to avoid duplication.
  const roundNames = sectionRounds.filter(r => r.toLowerCase() !== 'winner');
  if (levels.length === 0) return { rounds: [], hasFeedIn: false };

  let sortedEntries = [...sectionEntries].sort((a, b) => a.position - b.position);

  // Play-off sections (e.g., 3/4 playoff) use class="match" instead of
  // class="entry" for players, so the parser finds no entries. The highest-level
  // match spans actually represent the entering players — promote them to entries.
  if (sortedEntries.length === 0 && levels.length > 1) {
    const topLevel = levels[0];
    const topMatches = matchesByLevel.get(topLevel) || [];
    sortedEntries = topMatches.map((m, i) => ({
      position: i + 1,
      name: m.winner?.name || 'Bye',
      seed: m.winner?.seed || '',
      club: m.winner?.club || '',
      playerId: m.winner?.playerId || null,
      bye: !m.winner?.name,
      partner: m.winner?.partner || '',
      partnerPlayerId: m.winner?.partnerPlayerId || null,
    }));

    // The parser may associate scores/retired with the promoted level rather than
    // the actual match level. Transfer any result data to the remaining match.
    const promotedWithScore = topMatches.find(m => m.score.length > 0 || m.retired || m.walkover);
    if (promotedWithScore) {
      const nextLevel = levels[1];
      const nextMatches = matchesByLevel.get(nextLevel);
      if (nextMatches) {
        for (const nm of nextMatches) {
          if (nm.score.length === 0 && !nm.retired && !nm.walkover) {
            nm.score = promotedWithScore.score;
            nm.retired = promotedWithScore.retired;
            nm.walkover = promotedWithScore.walkover;
          }
        }
      }
    }

    matchesByLevel.delete(topLevel);
    levels.shift();
  }

  // When the top level has 1:1 pairing with all-unscored matches (e.g. two-column
  // Round 1 in consolation brackets), merge it into entries so the display starts
  // one round later — matching the TSW visual where these two columns are combined.
  // For feed-in levels (count > expected), only merge if subsequent levels still
  // have feed-in patterns (large brackets like 128-player). Skip the merge for
  // small brackets where this is the only feed-in level.
  if (levels.length > 1 && sortedEntries.length > 0) {
    const topLevel = levels[0];
    const topMatches = matchesByLevel.get(topLevel) || [];
    const allUnscored = topMatches.length > 0 && topMatches.every(m => m.score.length === 0 && !m.retired && !m.walkover);
    const expectedNormal = Math.ceil(sortedEntries.length / 2);
    const isFeedInLevel = topMatches.length > expectedNormal;

    let canMergeFeedIn = false;
    if (isFeedInLevel) {
      let prevCount = topMatches.length;
      for (let i = 1; i < levels.length; i++) {
        const lm = matchesByLevel.get(levels[i]) || [];
        const exp = Math.ceil(prevCount / 2);
        if (lm.length > exp) { canMergeFeedIn = true; break; }
        prevCount = lm.length;
      }
    }

    const allWinnersNull = topMatches.every(m => m.winner === null);
    const hasScheduledTimes = topMatches.some(m => m.scheduledTime);
    if (allUnscored && !hasScheduledTimes && topMatches.length === sortedEntries.length && (!isFeedInLevel || canMergeFeedIn || allWinnersNull)) {
      sortedEntries = topMatches.map((m, i) => ({
        position: sortedEntries[i]?.position ?? (i + 1),
        name: m.winner?.name || 'Bye',
        seed: m.winner?.seed || '',
        club: '',
        playerId: m.winner?.playerId || null,
        bye: !m.winner?.name,
        partner: m.winner?.partner || '',
        partnerPlayerId: m.winner?.partnerPlayerId || null,
      }));

      matchesByLevel.delete(topLevel);
      levels.shift();

      if (roundNames.length > levels.length) {
        roundNames.shift();
        let idx = 1;
        for (let i = 0; i < roundNames.length; i++) {
          if (/^Round \d+$/i.test(roundNames[i])) {
            roundNames[i] = `Round ${idx++}`;
          } else {
            break;
          }
        }
      }
    }
  }

  const entryLevel = levels[0] + 1;

  // Detect feed-in levels: levels with interleaved scored match results and
  // unscored feed-in entries (more matches than expected from halving).
  const actualByLevel = new Map<number, BracketMatchData[]>();
  const feedInLevels = new Set<number>();

  for (let li = 0; li < levels.length; li++) {
    const level = levels[li];
    const levelMatches = matchesByLevel.get(level) || [];
    actualByLevel.set(level, levelMatches);

    let expectedCount: number;
    if (li === 0) {
      expectedCount = Math.ceil(sortedEntries.length / 2);
    } else {
      const prevActual = actualByLevel.get(levels[li - 1]) || [];
      expectedCount = Math.ceil(prevActual.length / 2);
    }

    if (levelMatches.length > expectedCount) {
      feedInLevels.add(level);
    }
  }

  const rounds: DisplayRound[] = [];

  for (let li = 0; li < levels.length; li++) {
    const level = levels[li];
    const actualMatches = actualByLevel.get(level) || [];
    const nameOffset = levels.length - roundNames.length;
    const roundName = roundNames[li - nameOffset] || `Round ${li + 1}`;
    const displayMatches: DisplayMatch[] = [];
    const isFeedInLevel = feedInLevels.has(level);

    const makePlayer = (w: BracketMatchData['winner']): DisplayPlayer | null =>
      w ? { name: w.name, seed: w.seed, playerId: w.playerId, won: false, bye: false, partner: w.partner, partnerPlayerId: w.partnerPlayerId } : null;

    if (isFeedInLevel) {
      const isEntryLevel = level === entryLevel - 1;
      const continuationMatches = actualMatches.filter(m => m.matchNum % 2 === 1);
      const feedInEntries = actualMatches.filter(m => m.matchNum % 2 === 0);

      for (let i = 0; i < continuationMatches.length; i++) {
        const m = continuationMatches[i];
        let p1: DisplayMatch['player1'] = null;
        let p2: DisplayMatch['player2'] = null;

        if (isEntryLevel) {
          const e1 = sortedEntries[i * 2];
          const e2 = sortedEntries[i * 2 + 1];
          if (e1) p1 = { name: e1.name, seed: e1.seed, playerId: e1.playerId, won: false, bye: e1.bye, position: e1.position, partner: e1.partner, partnerPlayerId: e1.partnerPlayerId };
          if (e2) p2 = { name: e2.name, seed: e2.seed, playerId: e2.playerId, won: false, bye: e2.bye, position: e2.position, partner: e2.partner, partnerPlayerId: e2.partnerPlayerId };
        } else {
          const prevLevel = levels[li - 1];
          const prevMatches = actualByLevel.get(prevLevel) || [];
          const prev1 = prevMatches[i * 2];
          const prev2 = prevMatches[i * 2 + 1];
          if (prev1?.winner) p1 = makePlayer(prev1.winner);
          if (prev2?.winner) p2 = makePlayer(prev2.winner);
        }

        if (m.winner && p1) p1.won = m.winner.playerId === p1.playerId;
        if (m.winner && p2) p2.won = m.winner.playerId === p2.playerId;

        const feedIn = feedInEntries[i];
        displayMatches.push({
          player1: p1, player2: p2,
          score: m.score, retired: m.retired, walkover: m.walkover,
          bye: (p1?.bye || p2?.bye) ?? false,
          feedInPlayer: feedIn ? makePlayer(feedIn.winner) : null,
          scheduledTime: m.scheduledTime,
        });
      }
    } else {
      for (let i = 0; i < actualMatches.length; i++) {
        const m = actualMatches[i];
        let p1: DisplayMatch['player1'] = null;
        let p2: DisplayMatch['player2'] = null;

        if (level === entryLevel - 1) {
          if (actualMatches.length === sortedEntries.length) {
            const e1 = sortedEntries[i];
            if (e1) p1 = { name: e1.name, seed: e1.seed, playerId: e1.playerId, won: false, bye: e1.bye, position: e1.position, partner: e1.partner, partnerPlayerId: e1.partnerPlayerId };
            if (m.winner) p2 = { name: m.winner.name, seed: m.winner.seed, playerId: m.winner.playerId, won: false, bye: false, partner: m.winner.partner, partnerPlayerId: m.winner.partnerPlayerId };
          } else {
            const e1 = sortedEntries[i * 2];
            const e2 = sortedEntries[i * 2 + 1];
            if (e1) p1 = { name: e1.name, seed: e1.seed, playerId: e1.playerId, won: false, bye: e1.bye, position: e1.position, partner: e1.partner, partnerPlayerId: e1.partnerPlayerId };
            if (e2) p2 = { name: e2.name, seed: e2.seed, playerId: e2.playerId, won: false, bye: e2.bye, position: e2.position, partner: e2.partner, partnerPlayerId: e2.partnerPlayerId };
          }
        } else {
          const prevLevel = levels[li - 1];
          const prevMatches = actualByLevel.get(prevLevel) || [];
          const prev1 = prevMatches[i * 2];
          const prev2 = prevMatches[i * 2 + 1];
          if (prev1?.winner) p1 = makePlayer(prev1.winner);
          if (prev2?.winner) p2 = makePlayer(prev2.winner);
        }

        if (m.winner && p1) p1.won = m.winner.playerId === p1.playerId;
        if (m.winner && p2) p2.won = m.winner.playerId === p2.playerId;

        displayMatches.push({
          player1: p1, player2: p2,
          score: m.score, retired: m.retired, walkover: m.walkover,
          bye: (p1?.bye || p2?.bye) ?? false,
          scheduledTime: m.scheduledTime,
        });
      }
    }

    rounds.push({ name: roundName, matches: displayMatches });
  }

  for (const r of rounds) {
    if (/^Round \d+$/i.test(r.name)) {
      r.name = `Round of ${r.matches.length * 2}`;
    }
  }

  if (rounds.length > 0) {
    const finalRound = rounds[rounds.length - 1];
    const finalMatch = finalRound.matches[0];
    const winner = finalMatch?.player1?.won ? finalMatch.player1 : finalMatch?.player2?.won ? finalMatch.player2 : null;
    if (winner) {
      rounds.push({
        name: 'Winner',
        matches: [{
          player1: { ...winner, won: true },
          player2: null,
          score: [],
          retired: false,
          walkover: false,
          bye: false,
        }],
      });
    }
  }

  return { rounds, hasFeedIn: feedInLevels.size > 0 };
}

// ── Bracket sub-components ──────────────────────────────────────────────────

function BracketPlayerRow({
  player, tswId, fromPath, gameScores, otherScores, isTop, lost, statusLabel, timeLabel,
}: {
  player: DisplayMatch['player1'];
  tswId: string;
  fromPath: string;
  gameScores: number[];
  otherScores: number[];
  isTop: boolean;
  lost: boolean;
  statusLabel?: string;
  timeLabel?: string;
}) {
  if (!player) {
    return (
      <div className={`flex items-center justify-between gap-2 px-2 py-1 min-w-0 ${isTop ? '' : 'border-t border-slate-100 dark:border-slate-700/50'}`}>
        <span className="text-[11px] text-slate-400 dark:text-slate-500 italic truncate">TBD</span>
        {timeLabel && <span className="text-[9px] text-sky-600 dark:text-sky-400 whitespace-nowrap shrink-0">{timeLabel}</span>}
      </div>
    );
  }

  if (player.bye) {
    return (
      <div className={`flex items-center justify-between gap-2 px-2 py-1 min-w-0 ${isTop ? '' : 'border-t border-slate-100 dark:border-slate-700/50'}`}>
        <span className="text-[11px] text-slate-400 dark:text-slate-500 italic truncate">Bye</span>
        {timeLabel && <span className="text-[9px] text-sky-600 dark:text-sky-400 whitespace-nowrap shrink-0">{timeLabel}</span>}
      </div>
    );
  }

  const nameClass = player.won
    ? 'font-semibold text-slate-800 dark:text-slate-100'
    : lost
      ? 'text-slate-400 dark:text-slate-500'
      : 'text-slate-800 dark:text-slate-100';

  const renderName = (name: string, pid: number | null, seed?: string) => {
    const displayName = appendSeed(name, seed);
    return pid ? (
      <Link
        to={`/tournaments/${tswId}/player/${pid}`}
        state={{ fromPath }}
        className={`text-[11px] truncate hover:text-violet-600 dark:hover:text-violet-400 hover:underline ${nameClass}`}
      >
        {displayName}
      </Link>
    ) : (
      <span className={`text-[11px] truncate ${nameClass}`}>{displayName || 'TBD'}</span>
    );
  };

  return (
    <div className={`flex items-center justify-between gap-1 px-2 py-1 min-w-0 ${isTop ? '' : 'border-t border-slate-100 dark:border-slate-700/50'}`}>
      <div className="flex flex-col min-w-0 flex-1">
        <div className="flex items-center gap-1 min-w-0">
          {renderName(player.name, player.playerId, player.seed)}
        </div>
        {player.partner && (
          <div className="flex items-center gap-1 min-w-0">
            {renderName(player.partner, player.partnerPlayerId ?? null)}
          </div>
        )}
      </div>
      <div className="flex items-center gap-0.5 shrink-0 ml-1">
        {statusLabel && (
          <span className="text-amber-500 dark:text-amber-400 text-[9px] font-semibold shrink-0">{statusLabel}</span>
        )}
        {player.won && (
          <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0 mr-0.5" />
        )}
        {gameScores.map((s, i) => {
          const isWinningGame = s > otherScores[i];
          return (
            <span key={i} className={`font-mono text-[11px] w-5 text-right tabular-nums ${
              lost ? 'text-slate-400 dark:text-slate-500' :
              isWinningGame ? 'font-bold text-emerald-600 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'
            }`}>{s}</span>
          );
        })}
        {timeLabel && gameScores.length === 0 && (
          <span className="text-[9px] text-sky-600 dark:text-sky-400 whitespace-nowrap">{timeLabel}</span>
        )}
      </div>
    </div>
  );
}

function BracketFeedInEntry({ player, tswId, fromPath }: { player: DisplayPlayer | null; tswId: string; fromPath: string }) {
  if (!player || !player.name) {
    return <div className="w-48 h-6" />;
  }

  const renderName = (name: string, pid: number | null | undefined, seed?: string) => {
    const displayName = appendSeed(name, seed);
    return pid ? (
      <Link
        to={`/tournaments/${tswId}/player/${pid}`}
        state={{ fromPath }}
        className="text-[11px] text-sky-600 dark:text-sky-400 truncate hover:underline"
      >
        {displayName}
      </Link>
    ) : (
      <span className="text-[11px] text-slate-600 dark:text-slate-400 truncate">{displayName}</span>
    );
  };

  return (
    <div className="w-48 flex flex-col px-2 py-0.5 min-w-0">
      <div className="flex items-center gap-1 min-w-0">
        {renderName(player.name, player.playerId, player.seed)}
      </div>
      {player.partner && (
        <div className="flex items-center min-w-0">
          {renderName(player.partner, player.partnerPlayerId ?? null)}
        </div>
      )}
    </div>
  );
}

export function formatScheduledTime(raw: string): { date: string; time: string } {
  const d = new Date(raw);
  if (isNaN(d.getTime())) return { date: raw, time: '' };
  const day = d.toLocaleDateString('en-US', { weekday: 'short' });
  const month = d.getMonth() + 1;
  const date = d.getDate();
  const hours = d.getHours();
  const minutes = d.getMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const h = hours % 12 || 12;
  const mm = minutes === 0 ? '' : `:${String(minutes).padStart(2, '0')}`;
  return { date: `${day} ${month}/${date}`, time: `${h}${mm} ${ampm}` };
}

function BracketMatchCard({ match, tswId, fromPath }: { match: DisplayMatch; tswId: string; fromPath: string }) {
  const p1Scores: number[] = [];
  const p2Scores: number[] = [];
  const p1IsWinner = match.player1?.won ?? false;
  for (const s of match.score) {
    const parts = s.split('-').map(Number);
    const winnerScore = Number.isFinite(parts[0]) ? parts[0] : 0;
    const loserScore = Number.isFinite(parts[1]) ? parts[1] : 0;
    p1Scores.push(p1IsWinner ? winnerScore : loserScore);
    p2Scores.push(p1IsWinner ? loserScore : winnerScore);
  }

  const p1Won = match.player1?.won ?? false;
  const p2Won = match.player2?.won ?? false;
  const p1Lost = !p1Won && p2Won;
  const p2Lost = !p2Won && p1Won;

  const statusText = match.retired ? 'Retired' : match.walkover ? 'Walkover' : '';
  const p1Status = p1Lost ? statusText : '';
  const p2Status = p2Lost ? statusText : '';

  const hasResult = match.score.length > 0 || p1Won || p2Won;

  const timeParts = match.scheduledTime && !hasResult ? formatScheduledTime(match.scheduledTime) : null;

  return (
    <div className="w-48 bg-white dark:bg-slate-900 rounded-md border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden text-left shrink-0">
      <BracketPlayerRow player={match.player1} tswId={tswId} fromPath={fromPath} gameScores={p1Scores} otherScores={p2Scores} isTop lost={p1Lost} statusLabel={p1Status || undefined} timeLabel={timeParts?.date} />
      <BracketPlayerRow player={match.player2} tswId={tswId} fromPath={fromPath} gameScores={p2Scores} otherScores={p1Scores} isTop={false} lost={p2Lost} statusLabel={p2Status || undefined} timeLabel={timeParts?.time} />
    </div>
  );
}

function BracketConnectors({ matchCount }: { matchCount: number }) {
  if (matchCount <= 0) return null;
  const pairs = matchCount / 2;
  return (
    <div className="flex shrink-0" style={{ width: 32 }}>
      <div className="flex flex-col" style={{ width: 16 }}>
        {Array.from({ length: pairs }, (_, i) => (
          <div key={i} className="flex-1 flex flex-col">
            <div className="flex-1" />
            <div className="flex-1 border-r-2 border-t-2 border-slate-300 dark:border-slate-600" />
            <div className="flex-1 border-r-2 border-b-2 border-slate-300 dark:border-slate-600" />
            <div className="flex-1" />
          </div>
        ))}
      </div>
      <div className="flex flex-col" style={{ width: 16 }}>
        {Array.from({ length: pairs }, (_, i) => (
          <div key={i} className="flex-1 flex flex-col justify-center">
            <div className="border-t-2 border-slate-300 dark:border-slate-600" />
          </div>
        ))}
      </div>
    </div>
  );
}

function BracketStraightConnectors({ matchCount }: { matchCount: number }) {
  if (matchCount <= 0) return null;
  return (
    <div className="flex shrink-0 flex-col" style={{ width: 32 }}>
      {Array.from({ length: matchCount }, (_, i) => (
        <div key={i} className="flex-1 flex flex-col justify-center">
          <div className="border-t-2 border-slate-300 dark:border-slate-600" />
        </div>
      ))}
    </div>
  );
}

// ── Scroll position cache (survives unmount/remount) ────────────────────────

const _bracketScroll = new Map<string, { scrollLeft: number; scrollTop: number }>();

// ── Main BracketView component ──────────────────────────────────────────────

export default function BracketView({ section, tswId, showTitle }: { section: BracketSection; tswId: string; showTitle?: boolean }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { pathname } = useLocation();
  const cacheKey = `${tswId}:${section.name}`;

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let restoring = false;
    const saved = _bracketScroll.get(cacheKey);
    if (saved) {
      restoring = true;
      let attempts = 0;
      const tryRestore = () => {
        el.scrollLeft = saved.scrollLeft;
        el.scrollTop = saved.scrollTop;
        const closeEnough =
          Math.abs(el.scrollLeft - saved.scrollLeft) <= 1 &&
          Math.abs(el.scrollTop - saved.scrollTop) <= 1;
        if (!closeEnough && attempts++ < 15) {
          requestAnimationFrame(tryRestore);
        } else {
          restoring = false;
        }
      };
      requestAnimationFrame(tryRestore);
    }
    const onScroll = () => {
      if (restoring) return;
      _bracketScroll.set(cacheKey, {
        scrollLeft: el.scrollLeft,
        scrollTop: el.scrollTop,
      });
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [cacheKey]);

  const { rounds, hasFeedIn } = useMemo(() => buildDisplayRounds(section), [section]);

  const displayName = useMemo(() => {
    if (hasFeedIn && /consolation/i.test(section.name) && !/feed.in/i.test(section.name)) {
      return section.name.replace(/consolation/i, 'Feed-in Consolation');
    }
    return section.name;
  }, [section.name, hasFeedIn]);

  if (rounds.length === 0) return null;

  const lastRoundName = rounds[rounds.length - 1]?.name?.toLowerCase() ?? '';
  const hasWinnerColumn = lastRoundName === 'winner';

  return (
    <div>
      {showTitle && <h3 className="text-base font-semibold text-slate-700 dark:text-slate-200 mb-3">{displayName}</h3>}
      <div ref={scrollRef} className="overflow-x-auto overflow-y-auto max-h-[80vh] -mx-4 px-4 md:mx-0 md:px-0 pb-4">
        <div className="flex min-w-max items-stretch">
          {rounds.map((round, ri) => {
          const isWinner = ri === rounds.length - 1 && hasWinnerColumn;
          const isFirstRound = ri === 0;
          const nextRound = ri < rounds.length - 1 ? rounds[ri + 1] : null;
          const nextIsWinner = ri === rounds.length - 2 && hasWinnerColumn;
          const showConnector = ri < rounds.length - 1 && !isWinner && !nextIsWinner && round.matches.length > 1;
          const isStraightConnector = showConnector && nextRound && round.matches.length === nextRound.matches.length;
          return (
            <div key={ri} className="flex flex-col shrink-0">
              <div className={`sticky top-0 z-10 bg-white dark:bg-slate-950 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 pb-2 text-center whitespace-nowrap px-1 ${isFirstRound ? 'pl-7' : ''}`}>
                {round.name}
              </div>
              <div className="flex-1 flex items-stretch">
                <div className={`flex flex-col flex-1 ${isFirstRound ? 'gap-1 py-1' : ''}`}>
                  {round.matches.map((match, mi) => (
                    <div key={mi} className="flex-1 flex items-center">
                      {isFirstRound && (
                        <div className="flex flex-col shrink-0 mr-1.5 w-5">
                          <div className="py-1 text-[11px] text-slate-400 dark:text-slate-500 text-right tabular-nums leading-tight">
                            {match.player1?.position ?? ''}
                          </div>
                          <div className="py-1 text-[11px] text-slate-400 dark:text-slate-500 text-right tabular-nums leading-tight">
                            {match.player2?.position ?? ''}
                          </div>
                        </div>
                      )}
                      {isWinner ? (
                        <div className="w-48 ml-1 bg-gradient-to-r from-yellow-50 to-amber-50 dark:from-yellow-900/10 dark:to-amber-900/10 rounded-md border-2 border-yellow-300 dark:border-yellow-600 shadow-sm overflow-hidden text-left">
                          <div className="flex items-center gap-1.5 px-2.5 py-2 min-w-0">
                            <Trophy className="w-3.5 h-3.5 text-yellow-500 shrink-0" />
                            <div className="flex flex-col min-w-0">
                              {match.player1?.playerId ? (
                                <Link
                                  to={`/tournaments/${tswId}/player/${match.player1.playerId}`}
                                  state={{ fromPath: pathname }}
                                  className="text-xs font-bold text-slate-900 dark:text-white truncate hover:text-violet-600 dark:hover:text-violet-400 hover:underline"
                                >
                                  {appendSeed(match.player1?.name || '', match.player1?.seed)}
                                </Link>
                              ) : (
                                <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                                  {appendSeed(match.player1?.name || 'TBD', match.player1?.seed)}
                                </span>
                              )}
                              {match.player1?.partner && (
                                match.player1.partnerPlayerId ? (
                                  <Link
                                    to={`/tournaments/${tswId}/player/${match.player1.partnerPlayerId}`}
                                    state={{ fromPath: pathname }}
                                    className="text-xs font-bold text-slate-900 dark:text-white truncate hover:text-violet-600 dark:hover:text-violet-400 hover:underline"
                                  >
                                    {match.player1.partner}
                                  </Link>
                                ) : (
                                  <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                                    {match.player1.partner}
                                  </span>
                                )
                              )}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div>
                          {match.feedInPlayer && (
                            <div className="invisible pointer-events-none" aria-hidden="true">
                              <BracketFeedInEntry player={match.feedInPlayer} tswId={tswId} fromPath={pathname} />
                            </div>
                          )}
                          <BracketMatchCard match={match} tswId={tswId} fromPath={pathname} />
                          {match.feedInPlayer && (
                            <BracketFeedInEntry player={match.feedInPlayer} tswId={tswId} fromPath={pathname} />
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                {showConnector && (isStraightConnector
                  ? <BracketStraightConnectors matchCount={round.matches.length} />
                  : <BracketConnectors matchCount={round.matches.length} />
                )}
              </div>
            </div>
          );
        })}
        </div>
      </div>
    </div>
  );
}
