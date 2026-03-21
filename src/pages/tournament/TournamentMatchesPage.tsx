import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Swords } from 'lucide-react';
import SubPageLayout from '../../components/tournament/SubPageLayout';
import MatchesTab from '../../components/tournament/tabs/MatchesTab';

export default function TournamentMatchesPage() {
  const { tswId } = useParams<{ tswId: string }>();
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  if (!tswId) return null;

  return (
    <SubPageLayout title="Matches" icon={Swords} onRefresh={() => setRefreshTrigger(n => n + 1)}>
      <MatchesTab key={tswId} tswId={tswId} refreshTrigger={refreshTrigger} />
    </SubPageLayout>
  );
}
