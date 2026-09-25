'use client';
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

export interface ChartPoint {
  label: string;
  value: number | null;
  withheld?: number | null;
}

export default function SeriesChart({ points, units, title, trend, hideWithheld = false }: { points: ChartPoint[]; units: string; title: string; trend?: { a: number; b: number } | null; hideWithheld?: boolean }) {
  return (
    <figure aria-label={title}>
      <div style={{ width: '100%', height: 320 }}>
        <ResponsiveContainer>
          <LineChart data={points} margin={{ top: 10, right: 16, bottom: 10, left: 0 }}>
            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
            <XAxis dataKey="label" tick={{ fill: 'var(--muted)', fontSize: 12 }} minTickGap={24} />
            <YAxis tick={{ fill: 'var(--muted)', fontSize: 12 }} domain={['auto', 'auto']} label={{ value: units, angle: -90, position: 'insideLeft', fill: 'var(--muted)', fontSize: 12 }} />
            <Tooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }} formatter={(v) => [`${v} ${units}`, 'value']} />
            <Line type="linear" dataKey="value" stroke="var(--accent)" strokeWidth={2} dot={{ r: 2 }} connectNulls={false} isAnimationActive={false} name="Observed" />
            {!hideWithheld && <Line type="linear" dataKey="withheld" stroke="#d97706" strokeWidth={2} dot={{ r: 2 }} connectNulls={false} isAnimationActive={false} name="Revealed" />}
            {trend ? <ReferenceLine segment={[{ x: points[0]?.label, y: trend.a }, { x: points[points.length - 1]?.label, y: trend.b }]} stroke="var(--muted)" strokeDasharray="6 4" /> : null}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="text-sm muted">{title}. A table of the same values follows the chart.</figcaption>
    </figure>
  );
}
