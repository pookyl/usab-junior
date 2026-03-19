import { useParams } from 'react-router-dom';
import SubPageLayout from '../../components/tournament/SubPageLayout';
import DrawsTab from '../../components/tournament/tabs/DrawsTab';

export default function TournamentDrawsPage() {
  const { tswId } = useParams<{ tswId: string }>();
  if (!tswId) return null;

  return (
    <SubPageLayout title="Draws">
      <DrawsTab tswId={tswId} active />
    </SubPageLayout>
  );
}
