interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
  icon?: React.ReactNode;
}

export default function StatCard({ label, value, sub, color = 'bg-white', icon }: StatCardProps) {
  return (
    <div className={`${color} rounded-2xl p-5 shadow-sm border border-slate-100`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-slate-500 font-medium">{label}</p>
          <p className="text-3xl font-bold text-slate-800 mt-1">{value}</p>
          {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
        </div>
        {icon && (
          <div className="bg-slate-100 p-2 rounded-xl text-slate-600">{icon}</div>
        )}
      </div>
    </div>
  );
}
