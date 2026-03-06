import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Flag, Ruler, Weight, Hand } from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import RadarChart from '../components/RadarChart';
import { players, matches } from '../data/mockData';

export default function PlayerDetail() {
  const { id } = useParams<{ id: string }>();
  const player = players.find((p) => p.id === id);

  if (!player) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-16 text-center">
        <p className="text-slate-400 text-lg">Player not found.</p>
        <Link to="/players" className="text-emerald-600 hover:underline mt-2 inline-block">
          Back to players
        </Link>
      </div>
    );
  }

  const playerMatches = matches.filter(
    (m) => m.player1Id === player.id || m.player2Id === player.id
  );

  const winRate = Math.round(
    (player.stats.wins / (player.stats.wins + player.stats.losses)) * 100
  );

  const statBars = [
    { name: 'Attack', value: player.stats.attack },
    { name: 'Defense', value: player.stats.defense },
    { name: 'Stamina', value: player.stats.stamina },
    { name: 'Agility', value: player.stats.agility },
    { name: 'Accuracy', value: player.stats.accuracy },
    { name: 'Serve', value: player.stats.serve },
  ];

  const barColors = ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4'];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Back */}
      <Link
        to="/players"
        className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-emerald-600 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Players
      </Link>

      {/* Profile header */}
      <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl p-6 text-white">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
          <img
            src={player.avatar}
            alt={player.name}
            className="w-24 h-24 rounded-2xl bg-slate-700 border-2 border-slate-600"
          />
          <div className="flex-1">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold">{player.name}</h1>
              <span className="bg-emerald-500 text-white text-xs font-semibold px-3 py-1 rounded-full">
                {player.category}
              </span>
              <span className="bg-slate-700 text-slate-300 text-xs font-semibold px-3 py-1 rounded-full">
                Rank #{player.rank}
              </span>
            </div>
            <div className="flex flex-wrap gap-4 mt-3 text-slate-300 text-sm">
              <span className="flex items-center gap-1.5">
                <Flag className="w-4 h-4" /> {player.nationality}
              </span>
              <span className="flex items-center gap-1.5">
                <Ruler className="w-4 h-4" /> {player.height} cm
              </span>
              <span className="flex items-center gap-1.5">
                <Weight className="w-4 h-4" /> {player.weight} kg
              </span>
              <span className="flex items-center gap-1.5">
                <Hand className="w-4 h-4" /> {player.hand}-handed
              </span>
            </div>
          </div>
          <div className="flex gap-6 text-center">
            <div>
              <p className="text-3xl font-bold text-emerald-400">{winRate}%</p>
              <p className="text-xs text-slate-400 mt-0.5">Win Rate</p>
            </div>
            <div>
              <p className="text-3xl font-bold">{player.stats.titles}</p>
              <p className="text-xs text-slate-400 mt-0.5">Titles</p>
            </div>
            <div>
              <p className="text-3xl font-bold">{player.stats.wins}</p>
              <p className="text-xs text-slate-400 mt-0.5">Wins</p>
            </div>
          </div>
        </div>

        {/* Recent form */}
        <div className="mt-5 flex items-center gap-3">
          <span className="text-sm text-slate-400">Recent Form:</span>
          <div className="flex gap-1.5">
            {player.recentForm.map((r, i) => (
              <span
                key={i}
                className={`w-8 h-8 rounded-full text-sm font-bold flex items-center justify-center ${
                  r === 'W' ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'
                }`}
              >
                {r}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Radar chart */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
          <h2 className="text-lg font-semibold text-slate-800 mb-2">Skill Overview</h2>
          <p className="text-sm text-slate-400 mb-4">Performance radar across key attributes</p>
          <RadarChart stats={player.stats} />
        </div>

        {/* Bar chart */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
          <h2 className="text-lg font-semibold text-slate-800 mb-2">Attribute Scores</h2>
          <p className="text-sm text-slate-400 mb-4">Individual skill ratings out of 100</p>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={statBars} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
              <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 12, fill: '#94a3b8' }} />
              <YAxis dataKey="name" type="category" tick={{ fontSize: 12, fill: '#64748b' }} width={70} />
              <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0' }} />
              <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                {statBars.map((_, i) => (
                  <Cell key={i} fill={barColors[i % barColors.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Match history */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
        <h2 className="text-lg font-semibold text-slate-800 mb-4">Match History</h2>
        {playerMatches.length === 0 ? (
          <p className="text-slate-400 text-sm">No matches recorded.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-400 text-xs uppercase tracking-wider border-b border-slate-100">
                  <th className="pb-3 font-medium">Date</th>
                  <th className="pb-3 font-medium">Tournament</th>
                  <th className="pb-3 font-medium">Round</th>
                  <th className="pb-3 font-medium">Opponent</th>
                  <th className="pb-3 font-medium">Score</th>
                  <th className="pb-3 font-medium">Result</th>
                  <th className="pb-3 font-medium">Duration</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {playerMatches.map((match) => {
                  const opponentId =
                    match.player1Id === player.id ? match.player2Id : match.player1Id;
                  const opponent = players.find((p) => p.id === opponentId)!;
                  const won = match.winnerId === player.id;
                  return (
                    <tr key={match.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3 text-slate-400">{match.date}</td>
                      <td className="py-3 font-medium text-slate-700">{match.tournament}</td>
                      <td className="py-3">
                        <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full text-xs">
                          {match.round}
                        </span>
                      </td>
                      <td className="py-3 text-slate-600">{opponent.name}</td>
                      <td className="py-3 font-mono text-slate-600">{match.score}</td>
                      <td className="py-3">
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                            won
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-red-100 text-red-600'
                          }`}
                        >
                          {won ? 'Win' : 'Loss'}
                        </span>
                      </td>
                      <td className="py-3 text-slate-400">{match.duration} min</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
