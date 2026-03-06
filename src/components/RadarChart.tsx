import {
  Radar,
  RadarChart as RechartsRadar,
  PolarGrid,
  PolarAngleAxis,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import type { PlayerStats } from '../data/mockData';

interface Props {
  stats: PlayerStats;
  color?: string;
}

export default function RadarChart({ stats, color = '#10b981' }: Props) {
  const data = [
    { subject: 'Attack', value: stats.attack },
    { subject: 'Defense', value: stats.defense },
    { subject: 'Stamina', value: stats.stamina },
    { subject: 'Agility', value: stats.agility },
    { subject: 'Accuracy', value: stats.accuracy },
    { subject: 'Serve', value: stats.serve },
  ];

  return (
    <ResponsiveContainer width="100%" height={260}>
      <RechartsRadar data={data} cx="50%" cy="50%" outerRadius="75%">
        <PolarGrid stroke="#e2e8f0" />
        <PolarAngleAxis
          dataKey="subject"
          tick={{ fontSize: 12, fill: '#64748b', fontWeight: 500 }}
        />
        <Radar
          name="Stats"
          dataKey="value"
          stroke={color}
          fill={color}
          fillOpacity={0.25}
          strokeWidth={2}
        />
        <Tooltip
          formatter={(v: number) => [`${v}/100`, 'Score']}
          contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0' }}
        />
      </RechartsRadar>
    </ResponsiveContainer>
  );
}
