import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { CalendarDays } from 'lucide-react';
import SubPageLayout from '../../components/tournament/SubPageLayout';
import EventsTab from '../../components/tournament/tabs/EventsTab';

export default function TournamentEventsPage() {
  const { tswId } = useParams<{ tswId: string }>();
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  if (!tswId) return null;

  return (
    <SubPageLayout title="Events" icon={CalendarDays} onRefresh={() => setRefreshTrigger(n => n + 1)}>
      <EventsTab key={tswId} tswId={tswId} active refreshTrigger={refreshTrigger} />
    </SubPageLayout>
  );
}
