import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Trophy } from 'lucide-react';
import SubPageLayout from '../../components/tournament/SubPageLayout';
import WinnersTab from '../../components/tournament/tabs/WinnersTab';

export default function TournamentWinnersPage() {
  const { tswId } = useParams<{ tswId: string }>();
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  if (!tswId) return null;

  return (
    <SubPageLayout title="Winners" icon={Trophy} onRefresh={() => setRefreshTrigger(n => n + 1)}>
      <WinnersTab tswId={tswId} active refreshTrigger={refreshTrigger} />
    </SubPageLayout>
  );
}
