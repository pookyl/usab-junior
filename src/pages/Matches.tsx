import { useState } from 'react';
import { Search } from 'lucide-react';
import { matches, players } from '../data/mockData';
import { Link } from 'react-router-dom';

const rounds = ['All', 'Final', 'Semi-Final', 'Quarter-Final'];

export default function Matches() {
  const [search, setSearch] = useState('');
  const [round, setRound] = useState('All');

  const filtered = matches.filter((m) => {
    const p1 = players.find((p) => p.id === m.player1Id)!;
    const p2 = players.find((p) => p.id === m.player2Id)!;
    const matchSearch =
      m.tournament.toLowerCase().includes(search.toLowerCase()) ||
      p1.name.toLowerCase().includes(search.toLowerCase()) ||
      p2.name.toLowerCase().includes(search.toLowerCase());
    const matchRound = round === 'All' || m.round === round;
    return matchSearch && matchRound;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-800">Matches</h1>
        <p className="text-slate-500 mt-1">Browse all recorded match results</p>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search tournament or player..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {rounds.map((r) => (
            <button
              key={r}
              onClick={() => setRound(r)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                round === r
                  ? 'bg-emerald-600 text-white'
                  : 'bg-white border border-slate-200 text-slate-600 hover:border-emerald-400'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* Match cards */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-400">No matches found.</div>
      ) : (
        <div className="space-y-4">
          {filtered.map((match) => {
            const p1 = players.find((p) => p.id === match.player1Id)!;
            const p2 = players.find((p) => p.id === match.player2Id)!;
            const winner = players.find((p) => p.id === match.winnerId)!;

            return (
              <div
                key={match.id}
                className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 hover:shadow-md transition-shadow"
              >
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <span className="font-semibold text-slate-800">{match.tournament}</span>
                    <span className="mx-2 text-slate-300">·</span>
                    <span className="text-sm px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full">
                      {match.round}
                    </span>
                  </div>
                  <span className="text-sm text-slate-400">{match.date}</span>
                </div>

                <div className="flex items-center gap-4">
                  {/* Player 1 */}
                  <Link
                    to={`/players/${p1.id}`}
                    className={`flex items-center gap-3 flex-1 ${
                      match.winnerId === p1.id ? 'opacity-100' : 'opacity-50'
                    }`}
                  >
                    <img src={p1.avatar} alt={p1.name} className="w-12 h-12 rounded-xl bg-slate-100" />
                    <div>
                      <p className={`font-semibold text-slate-800 ${match.winnerId === p1.id ? '' : ''}`}>
                        {p1.name}
                      </p>
                      <p className="text-xs text-slate-400">{p1.nationality}</p>
                    </div>
                    {match.winnerId === p1.id && (
                      <span className="ml-auto text-xs font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                        Winner
                      </span>
                    )}
                  </Link>

                  {/* Score */}
                  <div className="text-center px-4 shrink-0">
                    <p className="text-xs text-slate-400 mb-1">Score</p>
                    <p className="font-mono font-bold text-slate-700 text-sm whitespace-nowrap">
                      {match.score}
                    </p>
                    <p className="text-xs text-slate-400 mt-1">{match.duration} min</p>
                  </div>

                  {/* Player 2 */}
                  <Link
                    to={`/players/${p2.id}`}
                    className={`flex items-center gap-3 flex-1 justify-end ${
                      match.winnerId === p2.id ? 'opacity-100' : 'opacity-50'
                    }`}
                  >
                    {match.winnerId === p2.id && (
                      <span className="mr-auto text-xs font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                        Winner
                      </span>
                    )}
                    <div className="text-right">
                      <p className="font-semibold text-slate-800">{p2.name}</p>
                      <p className="text-xs text-slate-400">{p2.nationality}</p>
                    </div>
                    <img src={p2.avatar} alt={p2.name} className="w-12 h-12 rounded-xl bg-slate-100" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
