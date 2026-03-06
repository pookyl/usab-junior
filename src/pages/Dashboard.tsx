import { Link } from 'react-router-dom';
import { Trophy, Users, Calendar, TrendingUp } from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import StatCard from '../components/StatCard';
import { players, matches, monthlyWins } from '../data/mockData';

export default function Dashboard() {
  const topPlayers = [...players].sort((a, b) => a.rank - b.rank).slice(0, 3);
  const recentMatches = matches.slice(0, 4);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-slate-800">Dashboard</h1>
        <p className="text-slate-500 mt-1">Badminton player performance overview</p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Players"
          value={players.length}
          sub="Tracked athletes"
          icon={<Users className="w-5 h-5" />}
        />
        <StatCard
          label="Matches Logged"
          value={matches.length}
          sub="This season"
          icon={<Calendar className="w-5 h-5" />}
        />
        <StatCard
          label="Top Ranked"
          value="#1"
          sub="Viktor Axelsen (MS)"
          icon={<Trophy className="w-5 h-5" />}
        />
        <StatCard
          label="Avg Win Rate"
          value="76%"
          sub="Across all players"
          icon={<TrendingUp className="w-5 h-5" />}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Monthly wins chart */}
        <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
          <h2 className="text-lg font-semibold text-slate-800 mb-4">Monthly Wins – Top Players</h2>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={monthlyWins}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#94a3b8' }} />
              <YAxis tick={{ fontSize: 12, fill: '#94a3b8' }} />
              <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0' }} />
              <Legend />
              <Bar dataKey="p1" name="Axelsen" fill="#10b981" radius={[4, 4, 0, 0]} />
              <Bar dataKey="p2" name="Naraoka" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              <Bar dataKey="p3" name="An Se-young" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              <Bar dataKey="p4" name="Marin" fill="#ec4899" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Top players */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-800">Top Players</h2>
            <Link to="/players" className="text-sm text-emerald-600 hover:underline font-medium">
              View all
            </Link>
          </div>
          <div className="space-y-4">
            {topPlayers.map((player, i) => {
              const winRate = Math.round((player.stats.wins / (player.stats.wins + player.stats.losses)) * 100);
              return (
                <Link
                  key={player.id}
                  to={`/players/${player.id}`}
                  className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 transition-colors"
                >
                  <span className={`text-lg font-bold w-7 text-center ${i === 0 ? 'text-amber-500' : i === 1 ? 'text-slate-400' : 'text-amber-700'}`}>
                    {i + 1}
                  </span>
                  <img
                    src={player.avatar}
                    alt={player.name}
                    className="w-10 h-10 rounded-full bg-slate-100"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-800 text-sm truncate">{player.name}</p>
                    <p className="text-xs text-slate-400">{player.nationality} · {player.category}</p>
                  </div>
                  <span className="text-sm font-medium text-emerald-600">{winRate}%</span>
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      {/* Recent matches */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-800">Recent Matches</h2>
          <Link to="/matches" className="text-sm text-emerald-600 hover:underline font-medium">
            View all
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-400 text-xs uppercase tracking-wider border-b border-slate-100">
                <th className="pb-3 font-medium">Tournament</th>
                <th className="pb-3 font-medium">Round</th>
                <th className="pb-3 font-medium">Players</th>
                <th className="pb-3 font-medium">Score</th>
                <th className="pb-3 font-medium">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {recentMatches.map((match) => {
                const p1 = players.find((p) => p.id === match.player1Id)!;
                const p2 = players.find((p) => p.id === match.player2Id)!;
                const winner = players.find((p) => p.id === match.winnerId)!;
                return (
                  <tr key={match.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3 font-medium text-slate-700">{match.tournament}</td>
                    <td className="py-3">
                      <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full text-xs">
                        {match.round}
                      </span>
                    </td>
                    <td className="py-3 text-slate-600">
                      <span className={match.winnerId === p1.id ? 'font-semibold text-emerald-700' : ''}>
                        {p1.name}
                      </span>
                      <span className="text-slate-300 mx-1">vs</span>
                      <span className={match.winnerId === p2.id ? 'font-semibold text-emerald-700' : ''}>
                        {p2.name}
                      </span>
                    </td>
                    <td className="py-3 font-mono text-slate-600">{match.score}</td>
                    <td className="py-3 text-slate-400">{match.date}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
