// Pure, deterministic statistics used by calculation recipes. Full precision is
// kept; rounding happens only at display time (see format.ts).

export interface Point {
  x: number; // decimal year for trends
  y: number;
}

export function mean(values: number[]): number | null {
  if (!values.length) return null;
  let s = 0;
  for (const v of values) s += v;
  return s / values.length;
}

/** Ordinary least-squares slope and intercept. Returns null for fewer than 3 points. */
export function ols(points: Point[]): { slope: number; intercept: number; n: number; r2: number } | null {
  const n = points.length;
  if (n < 3) return null;
  const mx = points.reduce((a, p) => a + p.x, 0) / n;
  const my = points.reduce((a, p) => a + p.y, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (const p of points) {
    sxy += (p.x - mx) * (p.y - my);
    sxx += (p.x - mx) ** 2;
    syy += (p.y - my) ** 2;
  }
  if (sxx === 0) return null;
  const slope = sxy / sxx;
  return { slope, intercept: my - slope * mx, n, r2: syy === 0 ? 1 : (sxy * sxy) / (sxx * syy) };
}

export function rankAscending<T>(items: T[], key: (t: T) => number): T[] {
  return [...items].sort((a, b) => key(a) - key(b));
}
