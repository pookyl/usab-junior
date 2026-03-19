import { useParams } from 'react-router-dom';
import SubPageLayout from '../../components/tournament/SubPageLayout';
import WinnersTab from '../../components/tournament/tabs/WinnersTab';

export default function TournamentWinnersPage() {
  const { tswId } = useParams<{ tswId: string }>();
  if (!tswId) return null;

  return (
    <SubPageLayout title="Winners">
      <WinnersTab tswId={tswId} active />
    </SubPageLayout>
  );
}
