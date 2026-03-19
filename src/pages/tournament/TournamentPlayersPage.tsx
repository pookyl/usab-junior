import { useState } from 'react';
import { useParams } from 'react-router-dom';
import SubPageLayout from '../../components/tournament/SubPageLayout';
import PlayersTab from '../../components/tournament/tabs/PlayersTab';

export default function TournamentPlayersPage() {
  const { tswId } = useParams<{ tswId: string }>();
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  if (!tswId) return null;

  return (
    <SubPageLayout title="Players" onRefresh={() => setRefreshTrigger(n => n + 1)}>
      <PlayersTab tswId={tswId} active refreshTrigger={refreshTrigger} />
    </SubPageLayout>
  );
}
