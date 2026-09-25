'use client';
import { useState } from 'react';
import SeriesChart, { type ChartPoint } from './SeriesChart';

export default function PredictReveal(props: {
  question: string;
  options: { id: string; label: string }[];
  known: ChartPoint[];
  withheld: ChartPoint[];
  units: string;
  correct: string;
  explanation: string;
  calcLinks: { href: string; label: string }[];
  knownLabel: string;
  withheldLabel: string;
}) {
  const [choice, setChoice] = useState<string | null>(null);
  const [why, setWhy] = useState('');
  const [revealed, setRevealed] = useState(false);
  const shown: ChartPoint[] = revealed ? [...props.known, ...props.withheld.map((p) => ({ label: p.label, value: null, withheld: p.value }))] : props.known;
  return (
    <div className="space-y-4">
      <div className="card p-4">
        <SeriesChart points={shown} units={props.units} title={revealed ? `${props.knownLabel} (teal) and revealed ${props.withheldLabel} (orange)` : `${props.knownLabel} only; later values are hidden`} hideWithheld={!revealed} />
      </div>
      <fieldset className="card p-4" disabled={revealed}>
        <legend className="font-semibold px-1">{props.question}</legend>
        <div className="mt-2 space-y-2">
          {props.options.map((o) => (
            <label key={o.id} className="flex items-center gap-2">
              <input type="radio" name="pred" value={o.id} checked={choice === o.id} onChange={() => setChoice(o.id)} /> {o.label}
            </label>
          ))}
        </div>
        <label className="label mt-3" htmlFor="why">
          Which evidence in the chart supports your prediction?
        </label>
        <textarea id="why" className="input" rows={2} value={why} onChange={(e) => setWhy(e.target.value)} />
        <button type="button" className="btn btn-primary mt-3" disabled={!choice} onClick={() => setRevealed(true)}>
          Reveal the observed values
        </button>
      </fieldset>
      {revealed && (
        <div className="card p-4" role="status">
          <p className="font-semibold">
            {choice === props.correct ? 'Your prediction matches the observations.' : 'The observations differ from your prediction.'} Observed answer:{' '}
            {props.options.find((o) => o.id === props.correct)?.label}
          </p>
          <p className="mt-2">{props.explanation}</p>
          <p className="text-sm mt-2">
            Evidence:{' '}
            {props.calcLinks.map((l, i) => (
              <span key={l.href}>
                <a href={l.href}>{l.label}</a>
                {i < props.calcLinks.length - 1 ? ' · ' : ''}
              </span>
            ))}
          </p>
          <p className="text-sm muted mt-2">
            This is learning from past observations, not a forecast. Now reflect: did the revealed evidence change your reasoning? {why ? `You wrote: “${why}”.` : ''}
          </p>
        </div>
      )}
    </div>
  );
}
