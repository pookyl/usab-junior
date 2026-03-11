import { Link } from 'react-router-dom';
import { Trophy, Users, Swords, Calendar, Clock } from 'lucide-react';
import { usePlayers } from '../contexts/PlayersContext';

interface Feature {
  title: string;
  description: string;
  icon: typeof Trophy;
  to: string;
  iconBg: string;
  iconColor: string;
  comingSoon?: boolean;
}

const features: Feature[] = [
  {
    title: 'Rankings',
    description: 'Explore junior rankings by age group and event type, with analytics and charts',
    icon: Trophy,
    to: '/players',
    iconBg: 'bg-amber-100 dark:bg-amber-900/30',
    iconColor: 'text-amber-600 dark:text-amber-400',
  },
  {
    title: 'Player Directory',
    description: 'Browse and search all ranked junior players alphabetically',
    icon: Users,
    to: '/directory',
    iconBg: 'bg-emerald-100 dark:bg-emerald-900/30',
    iconColor: 'text-emerald-600 dark:text-emerald-400',
  },
  {
    title: 'Head to Head',
    description: 'Compare two players side by side across rankings and events',
    icon: Swords,
    to: '/head-to-head',
    iconBg: 'bg-violet-100 dark:bg-violet-900/30',
    iconColor: 'text-violet-600 dark:text-violet-400',
  },
  {
    title: 'Tournaments',
    description: 'Tournament schedules, draws, and results',
    icon: Calendar,
    to: '#',
    iconBg: 'bg-slate-100 dark:bg-slate-800',
    iconColor: 'text-slate-400 dark:text-slate-500',
    comingSoon: true,
  },
];

export default function Home() {
  const { players, loading } = usePlayers();

  const totalPlayers = players.length;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12 space-y-10 md:space-y-14">
      {/* Hero */}
      <div className="text-center space-y-4">
        <h1 className="text-4xl md:text-5xl font-extrabold text-slate-800 dark:text-slate-100 tracking-tight">
          USAB Junior
          <span className="text-violet-600 dark:text-violet-400"> Hub</span>
        </h1>
        <p className="text-lg md:text-xl text-slate-500 dark:text-slate-400 max-w-2xl mx-auto">
          Your hub for USAB junior player rankings, analytics, and head-to-head comparisons
        </p>
        {!loading && totalPlayers > 0 && (
          <p className="text-sm text-slate-400 dark:text-slate-500">
            Tracking{' '}
            <span className="font-semibold text-slate-600 dark:text-slate-300">
              {totalPlayers.toLocaleString()}
            </span>{' '}
            ranked junior players across 5 age groups and 5 event groups
          </p>
        )}
      </div>

      {/* Feature Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6">
        {features.map((feature) => {
          const Icon = feature.icon;
          const card = (
            <div
              className={`relative group bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 p-6 md:p-8 transition-all flex flex-col items-center text-center ${
                feature.comingSoon ? 'opacity-60' : 'hover:shadow-lg hover:-translate-y-0.5'
              }`}
            >
              <div className={`w-28 h-28 md:w-36 md:h-36 ${feature.iconBg} rounded-3xl flex items-center justify-center mb-5`}>
                <Icon className={`w-14 h-14 md:w-20 md:h-20 ${feature.iconColor}`} />
              </div>
              <h2 className="text-lg md:text-xl font-bold text-slate-800 dark:text-slate-100 mb-1.5 flex items-center gap-2">
                {feature.title}
                {feature.comingSoon && (
                  <span className="text-[10px] font-semibold uppercase tracking-wide bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    Coming Soon
                  </span>
                )}
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">{feature.description}</p>
            </div>
          );

          if (feature.comingSoon) {
            return <div key={feature.title}>{card}</div>;
          }
          return (
            <Link key={feature.title} to={feature.to} className="block">
              {card}
            </Link>
          );
        })}
      </div>

      {/* Footer */}
      <footer className="pt-6 border-t border-slate-200 dark:border-slate-700 text-center text-xs text-slate-400 dark:text-slate-500 space-y-1">
        <p>USAB Junior Badminton Hub &middot; v0.1.0</p>
        <p>
          A hobby project &mdash; not affiliated with USA Badminton. Data sourced from{' '}
          <a
            href="https://usabjrrankings.org"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-slate-600 dark:hover:text-slate-300"
          >
            usabjrrankings.org
          </a>{' '}
          and{' '}
          <a
            href="https://www.tournamentsoftware.com"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-slate-600 dark:hover:text-slate-300"
          >
            tournamentsoftware.com
          </a>
          .
        </p>
        <p>&copy; {new Date().getFullYear()} All rights reserved.</p>
      </footer>
    </div>
  );
}
