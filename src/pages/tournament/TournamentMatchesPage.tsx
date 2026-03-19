import { useParams } from 'react-router-dom';
import SubPageLayout from '../../components/tournament/SubPageLayout';
import MatchesTab from '../../components/tournament/tabs/MatchesTab';

export default function TournamentMatchesPage() {
  const { tswId } = useParams<{ tswId: string }>();
  if (!tswId) return null;

  return (
    <SubPageLayout title="Matches">
      <MatchesTab tswId={tswId} active />
    </SubPageLayout>
  );
}
