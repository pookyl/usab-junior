import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { List } from 'lucide-react';
import { useTabData, TabLoading, TabError, TabEmpty, getEventColor } from '../shared';
import { fetchTournamentDetail } from '../../../services/rankingsService';

export default function DrawsTab({ tswId, active, refreshTrigger }: { tswId: string; active: boolean; refreshTrigger?: number }) {
  const navigate = useNavigate();
  const { data, loading, error, retry, refresh } = useTabData(tswId, active, fetchTournamentDetail, 'draws');
  useEffect(() => { if (refreshTrigger) refresh(); }, [refreshTrigger]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <TabLoading label="draws" />;
  if (error) return <TabError error={error} onRetry={retry} />;
  if (!data || data.draws.length === 0) return <TabEmpty icon={List} message="No draws available for this tournament." />;

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 dark:border-slate-700 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            <th className="px-4 py-3">Draw</th>
            <th className="px-4 py-3 text-right">Size</th>
            <th className="px-4 py-3">Type</th>
            <th className="px-4 py-3">Stage</th>
            <th className="px-4 py-3 hidden sm:table-cell">Consolation</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {data.draws.map(draw => {
            const color = getEventColor(draw.name);
            return (
              <tr
                key={draw.drawId}
                onClick={() => navigate(`/tournaments/${tswId}/draw/${draw.drawId}`, { state: { drawName: draw.name } })}
                className="hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer transition-colors"
              >
                <td className="px-4 py-3">
                  <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${color.bg} ${color.text}`}>
                    {draw.name}
                  </span>
                </td>
                <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-300 tabular-nums">
                  {draw.size ?? '–'}
                </td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                  {draw.type ?? '–'}
                </td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                  {draw.stage ?? '–'}
                </td>
                <td className="px-4 py-3 hidden sm:table-cell text-slate-400 dark:text-slate-500">
                  {draw.consolation || '–'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
