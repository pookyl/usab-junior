import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { List } from 'lucide-react';
import SubPageLayout from '../../components/tournament/SubPageLayout';
import DrawsTab from '../../components/tournament/tabs/DrawsTab';

export default function TournamentDrawsPage() {
  const { tswId } = useParams<{ tswId: string }>();
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  if (!tswId) return null;

  return (
    <SubPageLayout title="Draws" icon={List} onRefresh={() => setRefreshTrigger(n => n + 1)}>
      <DrawsTab key={tswId} tswId={tswId} active refreshTrigger={refreshTrigger} />
    </SubPageLayout>
  );
}
