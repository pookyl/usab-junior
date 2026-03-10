interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
  icon?: React.ReactNode;
}

const DARK_MAP: Record<string, string> = {
  'bg-white': 'dark:bg-slate-900',
  'bg-blue-50': 'dark:bg-blue-950',
  'bg-pink-50': 'dark:bg-pink-950',
};

export default function StatCard({ label, value, sub, color = 'bg-white', icon }: StatCardProps) {
  const darkColor = DARK_MAP[color] ?? 'dark:bg-slate-900';
  return (
    <div className={`${color} ${darkColor} rounded-2xl p-4 md:p-5 shadow-sm border border-slate-100 dark:border-slate-800`}>
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-xs md:text-sm text-slate-500 dark:text-slate-400 font-medium">{label}</p>
          <p className="text-2xl md:text-3xl font-bold text-slate-800 dark:text-slate-100 mt-0.5 md:mt-1">{value}</p>
          {sub && <p className="text-[10px] md:text-xs text-slate-400 dark:text-slate-500 mt-0.5 md:mt-1 truncate">{sub}</p>}
        </div>
        {icon && (
          <div className="bg-slate-100 dark:bg-slate-800 p-1.5 md:p-2 rounded-xl text-slate-600 dark:text-slate-300 shrink-0">{icon}</div>
        )}
      </div>
    </div>
  );
}
