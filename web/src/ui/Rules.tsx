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
  /** Copy goes on the right when the subject sits on the left. */
  right?: boolean;
}

const SHOTS: Shot[] = [
  {
    key: 'flag', title: 'Plant a flag', src: '/img/hill_day.jpg', focus: [0.6, 0.1], zoom: 1.5,
    line: 'Put a block on the tower. Your flag goes on top.',
    sub: (p) => `Each block has to be ${p.growthBps / 100}% bigger than the last one. The first one is ${near(p.minDepositStart)} NEAR.`,
    fact: (p) => `min ${near(p.minDepositStart)} · +${p.growthBps / 100}% a block`,
  },
  {
    key: 'sun', title: 'The sun', src: '/img/hill_day.jpg', focus: [0.28, 0.18], zoom: 1.5,
    line: 'While the sun is up, nobody can end it.',
    sub: (p) => `Every new flag drags the sun back to noon. You get ${p.graceMs / 1000} seconds of daylight to answer.`,
    fact: (p) => `${p.graceMs / 1000}s of daylight`,
  },
  {
    key: 'storm', title: 'The storm', src: '/img/hill_night.jpg', focus: [0.6, 0.12], zoom: 1.45, night: true,
    line: 'Sunset. Now any bell could be the last.',
    sub: (p) => `Anyone can ring. Each ring is a ${p.hazardBps / 100}% roll. There is no clock to snipe, so you raise a flag now or you hope.`,
    fact: (p) => `${p.hazardBps / 100}% a bell`,
  },
  {
    key: 'strike', title: 'The strike', src: '/img/hill_night.jpg', focus: [0.63, 0.36], zoom: 1.5, night: true, flash: true,
    line: 'Lightning hits. The flag on top takes the tower.',
    sub: () => 'All of it: every fee anyone paid, plus the staking yield every tent earned while the round ran.',
    fact: (p) => `ends by ${p.hardCapMs / 60000} min no matter what`,
  },
  {
    key: 'banner', title: 'The banner', src: '/img/hall.jpg', focus: [0.3, 0.42], zoom: 1.35, right: true,
    line: 'You get a banner. It keeps paying.',
    sub: (p) => `${p.royaltyFeeBps / 100}% of every block in the next round drops into the chest under it. Sell the banner and the chest goes with it.`,
    fact: (p) => `${p.royaltyFeeBps / 100}% of round N+1`,
  },
  {
    key: 'tent', title: 'Your tent', src: '/img/hill_day.jpg', focus: [0.25, 0.95], zoom: 1.5,
    line: 'Everyone else walks home whole.',
    sub: (p) => `${100 - (p.potFeeBps + p.royaltyFeeBps) / 100}% of every block you play is your tent. It's staked while you wait and comes back in full. Pack up early whenever you're not on top.`,
    fact: (p) => `${100 - (p.potFeeBps + p.royaltyFeeBps) / 100}% comes back`,
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
    <main className={`stage howto ${shot.night ? 'night' : ''} ${shot.right ? 'right' : ''}`}>
      {SHOTS.map((s, k) => (
        <img
          key={s.key}
          className={`shot ${k === i ? 'on' : ''}`}
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
            <button className="primary" onClick={() => setPage('hill')}>GO PLANT A FLAG</button>
          ) : (
            <button className="primary" onClick={() => setI(i + 1)}>NEXT · {SHOTS[i + 1].title}</button>
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
