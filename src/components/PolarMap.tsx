'use client';
// Two orthographic views centred on the poles (Web Mercator cannot show them).
// Points are only records/observations with source-supplied coordinates; no
// routes or tracks are drawn between them.
import { geoGraticule10, geoOrthographic, geoPath } from 'd3-geo';

export interface MapPoint {
  id: string;
  lat: number;
  lon: number;
  label: string;
  href?: string;
  kind: 'record' | 'observation';
}

function Globe({ pole, points, size }: { pole: 'north' | 'south'; points: MapPoint[]; size: number }) {
  const projection = geoOrthographic()
    .rotate([0, pole === 'north' ? -90 : 90])
    .scale(size / 2 - 6)
    .translate([size / 2, size / 2])
    .clipAngle(90);
  const path = geoPath(projection);
  const grat = path(geoGraticule10()) ?? '';
  const outline = path({ type: 'Sphere' }) ?? '';
  const visible = points.filter((p) => (pole === 'north' ? p.lat > 0 : p.lat < 0));
  return (
    <figure className="card p-3">
      <svg viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${pole === 'north' ? 'Arctic' : 'Antarctic'} polar view with ${visible.length} located items`} className="w-full h-auto">
        <path d={outline} fill="var(--surface-2)" stroke="var(--border)" />
        <path d={grat} fill="none" stroke="var(--border)" strokeWidth={0.6} />
        {[80, 70, 60].map((lat) => {
          const ring = path({ type: 'LineString', coordinates: Array.from({ length: 73 }, (_, i) => [i * 5 - 180, pole === 'north' ? lat : -lat]) });
          return ring ? <path key={lat} d={ring} fill="none" stroke="var(--muted)" strokeDasharray="2 3" strokeWidth={0.5} /> : null;
        })}
        {visible.map((p) => {
          const xy = projection([p.lon, p.lat]);
          if (!xy) return null;
          const dot = <circle cx={xy[0]} cy={xy[1]} r={p.kind === 'record' ? 5 : 2.2} fill={p.kind === 'record' ? 'var(--accent)' : '#d97706'} stroke="var(--surface)" strokeWidth={p.kind === 'record' ? 1.5 : 0.5} />;
          return p.href ? (
            <a key={p.id} href={p.href} aria-label={p.label}>
              <title>{p.label}</title>
              {dot}
            </a>
          ) : (
            <g key={p.id}>
              <title>{p.label}</title>
              {dot}
            </g>
          );
        })}
      </svg>
      <figcaption className="text-xs muted mt-2">
        {pole === 'north' ? 'Arctic (North Pole centre)' : 'Antarctic (South Pole centre)'}: dashed rings at 60°, 70° and 80°. Teal = catalog records with
        source coordinates; orange = individual ship observation positions (not a route).
      </figcaption>
    </figure>
  );
}

export default function PolarMap({ points }: { points: MapPoint[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Globe pole="north" points={points} size={360} />
      <Globe pole="south" points={points} size={360} />
    </div>
  );
}
