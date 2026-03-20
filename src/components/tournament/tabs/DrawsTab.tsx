import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { List, ChevronRight } from 'lucide-react';
import { useTabData, TabLoading, TabError, TabEmpty } from '../shared';
import { fetchTournamentDetail } from '../../../services/rankingsService';

export default function DrawsTab({ tswId, active, refreshTrigger }: { tswId: string; active: boolean; refreshTrigger?: number }) {
  const navigate = useNavigate();
  const { data, loading, error, retry, refresh } = useTabData(tswId, active, fetchTournamentDetail, 'draws');
  useEffect(() => { if (refreshTrigger) refresh(); }, [refreshTrigger]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <TabLoading label="draws" />;
  if (error) return <TabError error={error} onRetry={retry} />;
  if (!data || data.draws.length === 0) return <TabEmpty icon={List} message="No draws available for this tournament." />;

  const getFeedInInfo = (stage: string | null, consolation: string | null): string | null => {
    const candidates = [stage, consolation].filter((v): v is string => Boolean(v));
    return candidates.find(v => /feed[\s-]?in/i.test(v)) ?? null;
  };

  return (
    <div className="space-y-2.5">
      {data.draws.map(draw => {
        const feedInInfo = getFeedInInfo(draw.stage, draw.consolation);
        const metaParts = [
          draw.type,
          feedInInfo,
          draw.size != null ? `Size ${draw.size}` : null,
        ].filter((part): part is string => Boolean(part));

        return (
          <button
            key={draw.drawId}
            type="button"
            onClick={() => navigate(`/tournaments/${tswId}/draw/${draw.drawId}`, { state: { drawName: draw.name } })}
            className="group w-full text-left bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 hover:border-violet-200 dark:hover:border-violet-700 hover:shadow-md active:bg-slate-50 dark:active:bg-slate-800 transition-all p-3.5 md:p-4"
          >
            <div className="flex items-center justify-between gap-2.5">
              <div className="min-w-0">
                <p className="font-semibold text-sm text-slate-800 dark:text-slate-100 group-hover:text-violet-700 dark:group-hover:text-violet-400 transition-colors truncate">
                  {draw.name}
                </p>
                <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500 truncate">
                  {metaParts.length > 0 ? metaParts.join(' · ') : '—'}
                </p>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-300 dark:text-slate-600 group-hover:text-violet-400 transition-colors shrink-0" />
            </div>
          </button>
        );
      })}
    </div>
  );
}
