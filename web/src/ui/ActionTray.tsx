import { useEffect, useState } from 'react';
import { useGame } from '../game/store';
import { near } from '../game/format';

/** Bottom bar: how much to bid, one button, and what the bid really costs. */
export function ActionTray() {
  const round = useGame((s) => s.round);
  const params = useGame((s) => s.params);
  const me = useGame((s) => s.me);
  const connected = useGame((s) => s.connected);
  const connect = useGame((s) => s.connect);
  const deposit = useGame((s) => s.deposit);
  const live = useGame((s) => s.mode === 'live');
  const pending = useGame((s) => s.pending);
  const [pick, setPick] = useState<'min' | 'double' | 'custom'>('min');
  const [custom, setCustom] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const h = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(h);
  }, [toast]);

  // Shown and sent with two decimals, rounded up so the contract's minimum is always met.
  const min = Math.ceil(round.minDeposit * 100) / 100;
  // On chain the contract charges the minimum at the moment the bid lands, so there is nothing to pick.
  const amount = live || pick === 'min' ? min : pick === 'double' ? min * 2 : Number(custom) || min;
  const leading = round.leader === me;
  const fee = amount * (params.potFeeBps + params.royaltyFeeBps) / 10_000;

  const go = () => {
    if (!connected) { connect(); return; }
    void Promise.resolve(deposit(me, Math.round(amount * 100) / 100)).then((err) => { if (err) setToast(err); });
  };

  const label = !connected
    ? 'Connect wallet to bid'
    : pending === 'deposit'
      ? 'Waiting for your wallet...'
      : leading
      ? `Add ${near(amount)} NEAR and reset the timer`
      : round.state === 'Open'
        ? `Bid ${near(amount)} NEAR and start the round`
        : `Bid ${near(amount)} NEAR and take the lead`;

  return (
    <section className="bidbar" aria-label="Place a bid">
      {live ? (
        <div className="picker live-pick">
          <span className="legend">Your bid</span>
          <b>{near(min)} NEAR</b>
          <small>You pay the minimum when your bid lands. Up to 10% extra is attached in case someone bids first, and comes straight back.</small>
        </div>
      ) : (
      <fieldset className="picker">
        <legend>Your bid</legend>
        <button type="button" aria-pressed={pick === 'min'} onClick={() => setPick('min')}><b>{near(min)}</b><small>Lowest</small></button>
        <button type="button" aria-pressed={pick === 'double'} onClick={() => setPick('double')}><b>{near(min * 2)}</b><small>Double</small></button>
        <label className="custom">
          <span>Other amount</span>
          <input inputMode="decimal" placeholder={near(min)} value={custom} onFocus={() => setPick('custom')} onChange={(e) => { setCustom(e.target.value); setPick('custom'); }} />
        </label>
      </fieldset>
      )}

      <button type="button" className="primary" onClick={go} disabled={round.state === 'Settled' || pending !== null}>{label}</button>

      <dl className="split">
        <dt>Fee</dt><dd>{near(fee)} NEAR</dd>
        <dt>You get back</dt><dd className="blue">{near(amount - fee)} NEAR</dd>
        <dd className="note">win or lose, after the round</dd>
      </dl>
      {toast && <div className="toast" role="status">{toast}</div>}
    </section>
  );
}
