import { useEffect, useState } from 'react';
import { useGame } from '../game/store';
import { near } from '../game/format';

export const Bolt = ({ size = 18 }: { size?: number }) => (
  <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z" />
  </svg>
);

/** Closes a dialog on Escape. */
export const useEscape = (onClose: () => void) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
};

/** The tab on top of the bid bar: what is prefunded, and whether bids skip the wallet popup. */
export function ChestTab({ onManage, onError }: { onManage: () => void; onError: (message: string) => void }) {
  const connected = useGame((s) => s.connected);
  const purse = useGame((s) => s.purse);
  const oneTap = useGame((s) => s.oneTap);
  const busy = useGame((s) => s.pending !== null);
  const minimum = useGame((s) => s.round.minDeposit);
  const withdrawPurse = useGame((s) => s.withdrawPurse);
  const setOneTap = useGame((s) => s.setOneTap);
  if (!connected) return null;

  const run = (result: string | null | Promise<string | null>) => {
    void Promise.resolve(result).then((err) => { if (err) onError(err); });
  };

  if (purse <= 0 && !oneTap) {
    return (
      <div className="chest-tab">
        <span className="chest-label">War chest</span>
        <span className="chest-hint">Bid with one tap, no wallet popup</span>
        <button type="button" className="chest-btn" onClick={onManage}>Set up</button>
      </div>
    );
  }

  const bids = minimum > 0 ? Math.floor(purse / minimum) : 0;
  return (
    <div className="chest-tab">
      <span className="chest-label">{oneTap ? 'War chest, one-tap on' : 'War chest'}</span>
      <b className="chest-amount">{near(purse)} NEAR</b>
      <span className="chest-hint">{bids} {bids === 1 ? 'bid' : 'bids'} left</span>
      <button type="button" className="chest-btn chest-wide" disabled={busy} onClick={onManage}>Add NEAR</button>
      <button type="button" className="chest-btn chest-wide" disabled={busy || purse <= 0} onClick={() => run(withdrawPurse())}>Take out</button>
      <button type="button" className={`chest-btn chest-wide ${oneTap ? 'chest-on' : ''}`} role="switch" aria-checked={oneTap} disabled={busy} onClick={() => run(setOneTap(!oneTap))}>
        <Bolt />One-tap {oneTap ? 'on' : 'off'}
      </button>
      <button type="button" className="chest-btn chest-narrow" disabled={busy} onClick={onManage}>Add or take out</button>
    </div>
  );
}

const PRESETS = [5, 10, 25];

/** First-time setup, and adding more later. */
export function ChestDialog({ onClose }: { onClose: () => void }) {
  const purse = useGame((s) => s.purse);
  const oneTap = useGame((s) => s.oneTap);
  const busy = useGame((s) => s.pending !== null);
  const minimum = useGame((s) => s.round.minDeposit);
  const fundPurse = useGame((s) => s.fundPurse);
  const withdrawPurse = useGame((s) => s.withdrawPurse);
  const setOneTap = useGame((s) => s.setOneTap);
  const [amount, setAmount] = useState(10);
  const [error, setError] = useState<string | null>(null);
  useEscape(onClose);

  // Only the first top-up also adds the key. After that the switch on the tab decides.
  const firstTime = purse <= 0 && !oneTap;

  const add = async () => {
    setError(null);
    const err = await fundPurse(amount);
    if (err) { setError(err); return; }
    if (firstTime) {
      const keyErr = await setOneTap(true);
      if (keyErr) { setError(`Your NEAR is in. One-tap is still off: ${keyErr}`); return; }
    }
    onClose();
  };

  const manage = async (result: string | null | Promise<string | null>) => {
    setError(null);
    const err = await result;
    if (err) setError(err); else onClose();
  };

  return (
    <div className="modal-bg" role="dialog" aria-modal="true" aria-labelledby="chest-h">
      <div className="modal over">
        <div className="over-head">
          <h1 id="chest-h" className="dialog-title">{purse > 0 ? 'Add to your war chest' : 'Fill your war chest'}</h1>
          <p className="over-why">Put NEAR aside for this game, then bid with one tap. No wallet popup while the clock runs.</p>
        </div>
        <fieldset className="chest-presets">
          <legend>How much to add</legend>
          {PRESETS.map((n) => {
            const bids = minimum > 0 ? Math.floor(n / minimum) : 0;
            return (
              <button key={n} type="button" aria-pressed={amount === n} onClick={() => setAmount(n)}>
                <b>{n}</b><small>about {bids} {bids === 1 ? 'bid' : 'bids'}</small>
              </button>
            );
          })}
        </fieldset>
        {firstTime && (
          <div className="chest-key">
            <b>What the one-tap key can do</b>
            <ul>
              <li>Place bids from this war chest at the current minimum</li>
              <li>Spend up to 0.25 NEAR from your wallet on gas, and nothing else</li>
              <li>It cannot take NEAR out. Your deposits still come back to you</li>
            </ul>
          </div>
        )}
        {error && <p className="dialog-error" role="alert">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="primary" disabled={busy} onClick={() => void add()}>{busy ? 'Waiting for your wallet...' : `Add ${amount} NEAR`}</button>
          <button type="button" className="link" onClick={onClose}>Not now</button>
        </div>
        {firstTime && <p className="dialog-foot">Your wallet asks twice: once to add the NEAR, once to add the key.</p>}
        {purse > 0 && (
          <div className="chest-manage">
            <button type="button" className="link" disabled={busy} onClick={() => void manage(withdrawPurse())}>Take out {near(purse)} NEAR</button>
            <button type="button" className="link" disabled={busy} onClick={() => void manage(setOneTap(!oneTap))}>Turn one-tap {oneTap ? 'off' : 'on'}</button>
          </div>
        )}
      </div>
    </div>
  );
}
