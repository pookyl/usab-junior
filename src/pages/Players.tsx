import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, ChevronRight } from 'lucide-react';
import { players } from '../data/mockData';

const categories = ['All', 'MS', 'WS', 'MD', 'WD', 'XD'];

export default function Players() {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');

  const filtered = players.filter((p) => {
    const matchSearch =
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.nationality.toLowerCase().includes(search.toLowerCase());
    const matchCat = category === 'All' || p.category === category;
    return matchSearch && matchCat;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-800">Players</h1>
        <p className="text-slate-500 mt-1">Browse and analyse athlete profiles</p>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by name or nationality..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                category === cat
                  ? 'bg-emerald-600 text-white'
                  : 'bg-white border border-slate-200 text-slate-600 hover:border-emerald-400'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Player grid */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-400">No players found.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((player) => {
            const winRate = Math.round(
              (player.stats.wins / (player.stats.wins + player.stats.losses)) * 100
            );
            return (
              <Link
                key={player.id}
                to={`/players/${player.id}`}
                className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 hover:shadow-md hover:border-emerald-200 transition-all group"
              >
                <div className="flex items-start gap-4">
                  <img
                    src={player.avatar}
                    alt={player.name}
                    className="w-16 h-16 rounded-2xl bg-slate-100"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                        {player.category}
                      </span>
                      <span className="text-xs text-slate-400">Rank #{player.rank}</span>
                    </div>
                    <h3 className="font-bold text-slate-800 mt-1 truncate">{player.name}</h3>
                    <p className="text-sm text-slate-400">{player.nationality}</p>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                  <div className="bg-slate-50 rounded-xl p-2">
                    <p className="text-lg font-bold text-slate-700">{player.stats.wins}</p>
                    <p className="text-xs text-slate-400">Wins</p>
                  </div>
                  <div className="bg-slate-50 rounded-xl p-2">
                    <p className="text-lg font-bold text-slate-700">{player.stats.losses}</p>
                    <p className="text-xs text-slate-400">Losses</p>
                  </div>
                  <div className="bg-emerald-50 rounded-xl p-2">
                    <p className="text-lg font-bold text-emerald-600">{winRate}%</p>
                    <p className="text-xs text-emerald-400">Win Rate</p>
                  </div>
                </div>

                {/* Recent form */}
                <div className="mt-3 flex items-center justify-between">
                  <div className="flex gap-1">
                    {player.recentForm.map((result, i) => (
                      <span
                        key={i}
                        className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center ${
                          result === 'W'
                            ? 'bg-emerald-500 text-white'
                            : 'bg-red-100 text-red-500'
                        }`}
                      >
                        {result}
                      </span>
                    ))}
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-emerald-500 transition-colors" />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
