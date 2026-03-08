interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
  icon?: React.ReactNode;
}

export default function StatCard({ label, value, sub, color = 'bg-white', icon }: StatCardProps) {
  return (
    <div className={`${color} rounded-2xl p-4 md:p-5 shadow-sm border border-slate-100`}>
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-xs md:text-sm text-slate-500 font-medium">{label}</p>
          <p className="text-2xl md:text-3xl font-bold text-slate-800 mt-0.5 md:mt-1">{value}</p>
          {sub && <p className="text-[10px] md:text-xs text-slate-400 mt-0.5 md:mt-1 truncate">{sub}</p>}
        </div>
        {icon && (
          <div className="bg-slate-100 p-1.5 md:p-2 rounded-xl text-slate-600 shrink-0">{icon}</div>
        )}
      </div>
    </div>
  );
}
