import { useState } from 'react';
import { useParams } from 'react-router-dom';
import SubPageLayout from '../../components/tournament/SubPageLayout';
import MedalsTab from '../../components/tournament/tabs/MedalsTab';

export default function TournamentMedalsPage() {
  const { tswId } = useParams<{ tswId: string }>();
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  if (!tswId) return null;

  return (
    <SubPageLayout title="Medals" onRefresh={() => setRefreshTrigger(n => n + 1)}>
      <MedalsTab tswId={tswId} active refreshTrigger={refreshTrigger} />
    </SubPageLayout>
  );
}
