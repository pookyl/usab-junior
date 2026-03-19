import type { ReactNode } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useTournamentMeta } from '../../hooks/useTournamentMeta';

interface SubPageLayoutProps {
  title: string;
  children: ReactNode;
}

export default function SubPageLayout({ title, children }: SubPageLayoutProps) {
  const { tswId } = useParams<{ tswId: string }>();
  const meta = useTournamentMeta(tswId);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-10 space-y-6">
      <Link
        to={`/tournaments/${tswId}`}
        state={{ name: meta.name, hostClub: meta.hostClub, startDate: meta.startDate, endDate: meta.endDate }}
        className="inline-flex items-center gap-1.5 text-sm text-violet-600 dark:text-violet-400 hover:underline"
      >
        <ArrowLeft className="w-4 h-4" />
        {meta.name || 'Tournament Home'}
      </Link>

      <h1 className="text-2xl md:text-3xl font-extrabold text-slate-800 dark:text-slate-100 tracking-tight">
        {title}
      </h1>

      {children}
    </div>
  );
}
