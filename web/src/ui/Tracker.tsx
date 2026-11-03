import type { RoundState } from '../game/types';

const STEPS = ['Bidding', 'Sudden death', 'Winner'] as const;

/** Where the round is: bidding, sudden death, winner. Teaches the loop without the rules page. */
export function Tracker({ state, tone = 'dark' }: { state: RoundState; tone?: 'dark' | 'light' }) {
  const at = state === 'Armed' ? 1 : state === 'Settled' ? 2 : 0;
  return (
    <ol className={`tracker ${tone}`} aria-label="Round progress">
      {STEPS.map((s, i) => (
        <li key={s} className={i < at ? 'done' : i === at ? `on ${i === 1 ? 'red' : ''}` : ''} aria-current={i === at ? 'step' : undefined}>
          {i > 0 && <span className="line" aria-hidden="true" />}
          <span className="dot">{i < at ? '✓' : i + 1}</span>
          {s}
        </li>
      ))}
    </ol>
  );
}
