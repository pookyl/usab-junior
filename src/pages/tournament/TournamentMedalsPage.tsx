import { useParams } from 'react-router-dom';
import SubPageLayout from '../../components/tournament/SubPageLayout';
import MedalsTab from '../../components/tournament/tabs/MedalsTab';

export default function TournamentMedalsPage() {
  const { tswId } = useParams<{ tswId: string }>();
  if (!tswId) return null;

  return (
    <SubPageLayout title="Medals">
      <MedalsTab tswId={tswId} active />
    </SubPageLayout>
  );
}
