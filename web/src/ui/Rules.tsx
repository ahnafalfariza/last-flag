import { useEffect, useState } from 'react';
import { useGame } from '../game/store';
import { near } from '../game/format';
import type { Params } from '../game/types';

interface Shot {
  key: string;
  title: string;
  src: string;
  /** Point of the render to push into, as fractions, and how far. */
  focus: [number, number];
  zoom: number;
  line: string;
  sub: (p: Params) => string;
  fact: (p: Params) => string;
  night?: boolean;
  flash?: boolean;
  /** Push the render below the header so the flag on the tower shows; sky fills the band above. */
  lift?: boolean;
  /** Copy goes on the right when the subject sits on the left. */
  right?: boolean;
}

const SHOTS: Shot[] = [
  {
    key: 'bid', title: 'Bid', src: '/img/hill_day.jpg', focus: [0.6, 0], zoom: 1.5, lift: true,
    line: 'Bid to take the lead.',
    sub: (p) => `Each bid has to be ${p.growthBps / 100}% bigger than the one before. The first bid is ${near(p.minDepositStart)} NEAR. Your flag on the tower shows you're in the lead.`,
    fact: (p) => `first bid ${near(p.minDepositStart)} NEAR, then +${p.growthBps / 100}%`,
  },
  {
    key: 'timer', title: 'The timer', src: '/img/hill_day.jpg', focus: [0.28, 0.18], zoom: 1.5,
    line: 'Every bid resets a one-minute timer.',
    sub: (p) => `While the timer runs, nobody can win. Anyone can outbid the leader, and each bid puts the timer back to ${p.graceMs / 1000} seconds.`,
    fact: (p) => `${p.graceMs / 1000}s after every bid`,
  },
  {
    key: 'sudden', title: 'Sudden death', src: '/img/hill_night.jpg', focus: [0.6, 0.12], zoom: 1.45, night: true,
    line: 'When the timer hits zero, the round can end any second.',
    sub: (p) => `Every second there's a ${p.hazardBps / 100}% chance it ends. There's no countdown to wait out, so either bid now and take the lead, or hope it ends while someone else is ahead of you.`,
    fact: (p) => `${p.hazardBps / 100}% chance every second`,
  },
  {
    key: 'win', title: 'The win', src: '/img/hill_night.jpg', focus: [0.63, 0.36], zoom: 1.5, night: true, flash: true,
    line: 'Lightning strikes. Whoever leads wins the prize.',
    sub: (p) => p.yieldPerSec > 0
      ? 'The prize is the fees from every bid, plus the yield everyone\'s deposits earn while the round runs.'
      : 'The prize is the fees from every bid in the round.',
    fact: (p) => `always ends within ${p.hardCapMs / 60000} min of the last bid`,
  },
  {
    key: 'banner', title: 'The banner', src: '/img/hall.jpg', focus: [0.3, 0.42], zoom: 1.35, right: true,
    line: 'The winner also gets a banner that keeps paying.',
    sub: (p) => `${p.royaltyFeeBps / 100}% of every bid in the next round goes to whoever holds the banner. You can sell it, and the earnings go with it.`,
    fact: (p) => `${p.royaltyFeeBps / 100}% of next round's bids`,
  },
  {
    key: 'deposit', title: 'Your deposit', src: '/img/hill_day.jpg', focus: [0.25, 0.95], zoom: 1.5,
    line: 'Everyone gets their money back.',
    sub: (p) => `${100 - (p.potFeeBps + p.royaltyFeeBps) / 100}% of every bid is your deposit. It${p.yieldPerSec > 0 ? ' earns yield for the prize while you wait and' : ''} comes back in full after the round. If you're not in the lead, you can withdraw any time.`,
    fact: (p) => `${100 - (p.potFeeBps + p.royaltyFeeBps) / 100}% of each bid comes back`,
  },
];

/** How to play, told with the game's own pictures. */
export function Rules() {
  const p = useGame((s) => s.params);
  const setPage = useGame((s) => s.setPage);
  const [i, setI] = useState(0);
  const shot = SHOTS[i];
  const last = i === SHOTS.length - 1;

  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') setI((x) => Math.min(SHOTS.length - 1, x + 1));
      if (e.key === 'ArrowLeft') setI((x) => Math.max(0, x - 1));
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, []);

  return (
    <main className={`stage howto ${shot.night ? 'night' : ''} ${shot.right ? 'right' : ''} ${shot.lift ? 'lift' : ''}`}>
      {SHOTS.map((s, k) => (
        <img
          key={s.key}
          className={`shot ${k === i ? 'on' : ''} ${s.lift ? 'lift' : ''}`}
          src={s.src}
          alt=""
          style={{ transformOrigin: `${s.focus[0] * 100}% ${s.focus[1] * 100}%`, ['--z' as string]: s.zoom }}
        />
      ))}
      {shot.night && <div className="rain" />}
      {shot.flash && <div key={`f${i}`} className="howto-flash" />}
      <div className="howto-shade" />

      <section className="howto-copy" key={shot.key} aria-live="polite">
        <span className="howto-step">{String(i + 1).padStart(2, '0')} <i>/ {String(SHOTS.length).padStart(2, '0')}</i> · {shot.title}</span>
        <h1>{shot.line}</h1>
        <p>{shot.sub(p)}</p>
        <span className="howto-fact">{shot.fact(p)}</span>
        <div className="howto-nav">
          <button className="ghost" onClick={() => setI(i - 1)} disabled={i === 0} aria-label="Previous">←</button>
          {last ? (
            <button className="primary" onClick={() => setPage('hill')}>Go to the hill</button>
          ) : (
            <button className="primary" onClick={() => setI(i + 1)}>Next: {SHOTS[i + 1].title}</button>
          )}
        </div>
      </section>

      <nav className="strip" aria-label="Steps">
        {SHOTS.map((s, k) => (
          <button key={s.key} className={k === i ? 'on' : k < i ? 'seen' : ''} onClick={() => setI(k)} aria-current={k === i}>
            <span className="thumb" style={{ backgroundImage: `url(${s.src})`, backgroundPosition: `${s.focus[0] * 100}% ${s.focus[1] * 100}%`, backgroundSize: `${s.zoom * 100}%` }} />
            <span className="cap">{s.title}</span>
          </button>
        ))}
      </nav>
    </main>
  );
}
