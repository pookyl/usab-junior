import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Eye } from 'lucide-react';
import SubPageLayout from '../../components/tournament/SubPageLayout';
import WatchlistTab from '../../components/tournament/tabs/WatchlistTab';

export default function TournamentWatchlistPage() {
  const { tswId } = useParams<{ tswId: string }>();
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  if (!tswId) return null;

  return (
    <SubPageLayout title="Watchlist" icon={Eye} onRefresh={() => setRefreshTrigger(n => n + 1)}>
      <WatchlistTab key={tswId} tswId={tswId} refreshTrigger={refreshTrigger} />
    </SubPageLayout>
  );
}
