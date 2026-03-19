import { useParams } from 'react-router-dom';
import SubPageLayout from '../../components/tournament/SubPageLayout';
import PlayersTab from '../../components/tournament/tabs/PlayersTab';

export default function TournamentPlayersPage() {
  const { tswId } = useParams<{ tswId: string }>();
  if (!tswId) return null;

  return (
    <SubPageLayout title="Players">
      <PlayersTab tswId={tswId} active />
    </SubPageLayout>
  );
}
