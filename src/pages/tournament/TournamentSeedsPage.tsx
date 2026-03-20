import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Bookmark } from 'lucide-react';
import SubPageLayout from '../../components/tournament/SubPageLayout';
import SeedsTab from '../../components/tournament/tabs/SeedsTab';

export default function TournamentSeedsPage() {
  const { tswId } = useParams<{ tswId: string }>();
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  if (!tswId) return null;

  return (
    <SubPageLayout title="Seeds" icon={Bookmark} onRefresh={() => setRefreshTrigger((n) => n + 1)}>
      <SeedsTab tswId={tswId} active refreshTrigger={refreshTrigger} />
    </SubPageLayout>
  );
}
