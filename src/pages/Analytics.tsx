import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { players, monthlyWins } from '../data/mockData';
import RadarChart from '../components/RadarChart';

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4'];

export default function Analytics() {
  const categoryCount = players.reduce<Record<string, number>>((acc, p) => {
    acc[p.category] = (acc[p.category] || 0) + 1;
    return acc;
  }, {});

  const pieData = Object.entries(categoryCount).map(([name, value]) => ({ name, value }));

  const winRates = players.map((p) => ({
    name: p.name.split(' ')[0],
    winRate: Math.round((p.stats.wins / (p.stats.wins + p.stats.losses)) * 100),
    titles: p.stats.titles,
  }));

  const top2 = [...players].sort((a, b) => a.rank - b.rank).slice(0, 2);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-slate-800">Analytics</h1>
        <p className="text-slate-500 mt-1">In-depth performance insights across all players</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Monthly wins trend */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
          <h2 className="text-lg font-semibold text-slate-800 mb-1">Win Trend (6 Months)</h2>
          <p className="text-sm text-slate-400 mb-4">Monthly wins for top 4 players</p>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={monthlyWins}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#94a3b8' }} />
              <YAxis tick={{ fontSize: 12, fill: '#94a3b8' }} />
              <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0' }} />
              <Legend />
              <Line type="monotone" dataKey="p1" name="Axelsen" stroke="#10b981" strokeWidth={2} dot={{ r: 4 }} />
              <Line type="monotone" dataKey="p2" name="Naraoka" stroke="#3b82f6" strokeWidth={2} dot={{ r: 4 }} />
              <Line type="monotone" dataKey="p3" name="An Se-young" stroke="#f59e0b" strokeWidth={2} dot={{ r: 4 }} />
              <Line type="monotone" dataKey="p4" name="Marin" stroke="#ec4899" strokeWidth={2} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Category distribution */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
          <h2 className="text-lg font-semibold text-slate-800 mb-1">Category Distribution</h2>
          <p className="text-sm text-slate-400 mb-4">Players by discipline</p>
          <div className="flex items-center gap-6">
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={90}
                  paddingAngle={4}
                  dataKey="value"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  labelLine={false}
                >
                  {pieData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Win rate comparison */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
          <h2 className="text-lg font-semibold text-slate-800 mb-1">Win Rate & Titles</h2>
          <p className="text-sm text-slate-400 mb-4">All tracked players</p>
          <div className="space-y-3">
            {winRates.map((p, i) => (
              <div key={p.name} className="flex items-center gap-3">
                <span className="text-sm text-slate-600 w-24 truncate">{p.name}</span>
                <div className="flex-1 bg-slate-100 rounded-full h-3">
                  <div
                    className="h-3 rounded-full transition-all"
                    style={{
                      width: `${p.winRate}%`,
                      backgroundColor: COLORS[i % COLORS.length],
                    }}
                  />
                </div>
                <span className="text-sm font-semibold text-slate-700 w-12 text-right">
                  {p.winRate}%
                </span>
                <span className="text-xs text-slate-400 w-16 text-right">
                  {p.titles} titles
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Head to head radar */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
          <h2 className="text-lg font-semibold text-slate-800 mb-1">Skill Comparison</h2>
          <p className="text-sm text-slate-400 mb-4">
            {top2[0].name} vs {top2[1].name}
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-center text-sm font-semibold text-emerald-600 mb-2">
                {top2[0].name}
              </p>
              <RadarChart stats={top2[0].stats} color="#10b981" />
            </div>
            <div>
              <p className="text-center text-sm font-semibold text-blue-500 mb-2">
                {top2[1].name}
              </p>
              <RadarChart stats={top2[1].stats} color="#3b82f6" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
