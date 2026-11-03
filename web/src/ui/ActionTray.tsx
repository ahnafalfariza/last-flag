import { useEffect, useState } from 'react';
import { useGame } from '../game/store';
import { near, short } from '../game/format';

const Block = ({ tone }: { tone: 'sand' | 'clay' | 'stone' }) => {
  const c = { sand: ['#B99558', '#D9B36A', '#F0D59A'], clay: ['#8E4A2A', '#B8643A', '#E08E62'], stone: ['#555C68', '#7A8290', '#A9B1BE'] }[tone];
  return (
    <svg aria-hidden="true" width="34" height="30" viewBox="0 0 80 70">
      <polygon points="0,30 40,50 40,70 0,50" fill={c[0]} /><polygon points="40,50 80,30 80,50 40,70" fill={c[1]} /><polygon points="40,10 80,30 40,50 0,30" fill={c[2]} />
    </svg>
  );
};

/** Bottom tray: block picker, PLANT YOUR FLAG, where the NEAR goes. */
export function ActionTray() {
  const round = useGame((s) => s.round);
  const params = useGame((s) => s.params);
  const me = useGame((s) => s.me);
  const connected = useGame((s) => s.connected);
  const connect = useGame((s) => s.connect);
  const deposit = useGame((s) => s.deposit);
  const banners = useGame((s) => s.banners);
  const [pick, setPick] = useState<'min' | 'double' | 'boulder' | 'custom'>('min');
  const [custom, setCustom] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const h = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(h);
  }, [toast]);

  // Shown and sent with two decimals, rounded up so the contract's minimum is always met.
  const min = Math.ceil(round.minDeposit * 100) / 100;
  const amount = pick === 'min' ? min : pick === 'double' ? min * 2 : pick === 'boulder' ? Math.max(min, 5) : Number(custom) || min;
  const armed = round.state === 'Armed';
  const leading = round.leader === me;
  const prev = banners.find((b) => b.id === round.id - 1);

  const go = () => {
    if (!connected) { connect(); return; }
    const err = deposit(me, Math.round(amount * 100) / 100);
    if (err) setToast(err);
  };

  const hint = !connected
    ? 'Connect a wallet to put a block on the tower.'
    : armed
      ? `One block brings the sun back to noon. If lightning strikes first, your ${near(amount)} comes straight home.`
      : leading
        ? 'Stack another block to grow the tower. The sun jumps back to noon.'
        : round.leader
          ? `Your block goes on top, your flag replaces ${short(round.leader)}'s, the sun jumps back to noon.`
          : 'Your block starts the tower. The sun starts at noon.';

  return (
    <section className={`tray ${armed ? 'storm' : ''}`} aria-labelledby="act-h">
      <fieldset className="picker">
        <legend id="act-h" className="sr-only">Pick a block</legend>
        <button type="button" aria-pressed={pick === 'min'} onClick={() => setPick('min')}><Block tone="sand" /><b>{near(min)}</b><small>MIN</small></button>
        <button type="button" aria-pressed={pick === 'double'} onClick={() => setPick('double')}><Block tone="clay" /><b>{near(min * 2)}</b><small>DOUBLE</small></button>
        <button type="button" aria-pressed={pick === 'boulder'} onClick={() => setPick('boulder')}><Block tone="stone" /><b>{near(Math.max(min, 5))}</b><small>BOULDER</small></button>
        <label className="custom">
          <span>or type it</span>
          <input inputMode="decimal" placeholder={near(min)} value={custom} onFocus={() => setPick('custom')} onChange={(e) => { setCustom(e.target.value); setPick('custom'); }} />
        </label>
      </fieldset>

      <div className="go">
        <button type="button" className={`primary ${armed ? 'calm' : ''}`} onClick={go} disabled={round.state === 'Settled'}>
          {!connected ? 'CONNECT WALLET' : armed ? 'RAISE YOUR FLAG · CALM THE STORM' : leading ? `STACK ANOTHER BLOCK · ${near(amount)} NEAR` : `PLANT YOUR FLAG · ${near(amount)} NEAR`}
        </button>
        <span className="sub">{hint}</span>
      </div>

      <dl className="split">
        <dt className="label">WHERE {near(amount)} GOES</dt>
        <dd className="blue">{near(amount * (1 - (params.potFeeBps + params.royaltyFeeBps) / 10000), 3)}</dd><dt>your tent, staked, comes home</dt>
        <dd className="gold">{near(amount * params.potFeeBps / 10000, 3)}</dd><dt>into the tower</dt>
        <dd>{near(amount * params.royaltyFeeBps / 10000, 3)}</dd><dt>{prev ? `to whoever holds Banner ${prev.id}` : 'into the tower (no banner yet)'}</dt>
      </dl>
      {toast && <div className="toast" role="status">{toast}</div>}
    </section>
  );
}
