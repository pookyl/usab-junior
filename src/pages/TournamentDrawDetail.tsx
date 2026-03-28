import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useLocation, Link } from 'react-router-dom';
import { ArrowLeft, List } from 'lucide-react';
import { fetchTournamentDetail, fetchDrawBracket, type DrawResponse } from '../services/rankingsService';
import { TabLoading, TabError, TabEmpty, getEventColor, RefreshButton } from '../components/tournament/shared';
import BracketView from '../components/tournament/BracketView';
import RoundRobinView from '../components/tournament/RoundRobinView';
import type { EliminationDrawResponse, RoundRobinDrawResponse } from '../types/junior';
import { getTournamentDrawOrigin } from '../utils/tournamentReturnState';

export default function TournamentDrawDetail() {
  const { tswId, drawId } = useParams<{ tswId: string; drawId: string }>();
  const location = useLocation();
  const routeState = location.state as { drawName?: string; consolation?: string; fromPath?: string } | null;

  const [drawName, setDrawName] = useState<string | null>(routeState?.drawName ?? null);
  const [consolation, setConsolation] = useState<string | null | undefined>(routeState?.consolation ?? undefined);
  const [drawData, setDrawData] = useState<DrawResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const refreshFlag = useRef(false);
  const [fetchTrigger, setFetchTrigger] = useState(0);

  useEffect(() => {
    if (!tswId || !drawId) return;
    let cancelled = false;
    const isRefresh = refreshFlag.current;
    refreshFlag.current = false;
    setLoading(true);
    setError(null);
    if (!isRefresh) setDrawData(null);

    const numericDrawId = Number(drawId);
    const needsDetail = (!routeState?.drawName && !drawName) || consolation === undefined;

    const fetches: [Promise<unknown>, Promise<DrawResponse>] = [
      needsDetail ? fetchTournamentDetail(tswId, isRefresh) : Promise.resolve(null),
      fetchDrawBracket(tswId, numericDrawId, isRefresh),
    ];

    Promise.allSettled(fetches)
      .then(([detailResult, bracketResult]) => {
        if (cancelled) return;

        if (needsDetail && detailResult.status === 'fulfilled' && detailResult.value) {
          const detail = detailResult.value as { draws: { drawId: number; name: string; consolation: string | null }[] };
          const draw = detail.draws.find(d => d.drawId === numericDrawId);
          if (!drawName && !routeState?.drawName) setDrawName(draw?.name ?? `Draw ${drawId}`);
          if (consolation === undefined) setConsolation(draw?.consolation ?? null);
        } else if (needsDetail && !drawName && !routeState?.drawName) {
          setDrawName(`Draw ${drawId}`);
        }

        if (bracketResult.status === 'fulfilled') {
          setDrawData(bracketResult.value as DrawResponse);
        } else {
          setError((bracketResult.reason as Error)?.message ?? 'Failed to load bracket data');
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [tswId, drawId, routeState?.drawName, drawName, consolation, fetchTrigger]);

  const handleRefresh = useCallback(() => {
    refreshFlag.current = true;
    setFetchTrigger(n => n + 1);
  }, []);

  if (!tswId || !drawId) return null;

  const fromPath = routeState?.fromPath ?? getTournamentDrawOrigin(location.pathname);
  const isTournamentSubpage = Boolean(
    fromPath &&
      fromPath.startsWith(`/tournaments/${tswId}/`) &&
      !fromPath.includes('/draw/') &&
      !fromPath.includes('/player/'),
  );
  const backTarget = isTournamentSubpage ? fromPath! : `/tournaments/${tswId}/draws`;
  const color = drawName ? getEventColor(drawName) : null;
  const isRoundRobin = drawData?.drawType === 'round-robin';
  const headingLabel = isRoundRobin ? 'Round Robin' : 'Elimination Draw';

  return (
    <div className="max-w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-10 space-y-6">
      <div className="flex items-center justify-between">
        <Link
          to={backTarget}
          className="inline-flex items-center gap-1.5 text-sm text-violet-600 dark:text-violet-400 hover:underline"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </Link>
        <RefreshButton onClick={handleRefresh} loading={loading} tswId={tswId} />
      </div>

      {loading ? (
        <TabLoading label="draw" />
      ) : error ? (
        <TabError error={error} />
      ) : drawData ? (
        <>
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-6 md:p-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center gap-3">
                {color && (
                  <span className={`inline-block px-2.5 py-1 rounded text-sm font-bold ${color.bg} ${color.text}`}>
                    {drawName}
                  </span>
                )}
                <h1 className="text-xl md:text-2xl font-extrabold text-slate-800 dark:text-slate-100 tracking-tight">
                  {headingLabel}
                </h1>
              </div>
            </div>
          </div>

          {isRoundRobin ? (
            <RoundRobinView data={drawData as RoundRobinDrawResponse} tswId={tswId} />
          ) : (
            (() => {
              const elim = drawData as EliminationDrawResponse;
              const sections = elim.sections ?? [];
              return sections.length === 0 ? (
                <TabEmpty icon={List} message="No bracket data available for this draw." />
              ) : (
                sections.map((section, si) => (
                  <div key={si} className="space-y-3">
                    <BracketView section={section} tswId={tswId} showTitle={sections.length > 1} consolation={consolation} drawName={drawName} />
                  </div>
                ))
              );
            })()
          )}
        </>
      ) : null}
    </div>
  );
}
