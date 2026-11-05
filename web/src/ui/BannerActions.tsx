import { useState } from 'react';
import { useGame } from '../game/store';
import { short } from '../game/format';
import type { Banner } from '../game/types';
import { CONTRACT_ID, EXPLORER, MARKETPLACE_ID } from '../chain/config';

type Mode = 'idle' | 'give' | 'sell';

/**
 * What a banner's holder can do with it besides claiming: hand it to someone, list it with a
 * marketplace (NEP-178 approval, sold through NEP-199 payout), or take it off the market.
 * Selling or handing over moves the tower and the chest with it.
 */
export function BannerActions({ banner, mine }: { banner: Banner; mine: boolean }) {
  const connected = useGame((s) => s.connected);
  const live = useGame((s) => s.mode === 'live');
  const pending = useGame((s) => s.pending);
  const handOver = useGame((s) => s.handOver);
  const listBanner = useGame((s) => s.listBanner);
  const unlistBanner = useGame((s) => s.unlistBanner);
  const [mode, setMode] = useState<Mode>('idle');
  const [to, setTo] = useState('');
  const [market, setMarket] = useState(MARKETPLACE_ID);
  const [price, setPrice] = useState('');
  const [error, setError] = useState<string | null>(null);

  const listed = banner.listedWith ?? [];
  const busy = pending !== null;
  const explorer = live && EXPLORER && CONTRACT_ID ? `${EXPLORER}/nft-token/${CONTRACT_ID}/${banner.id}` : null;
  const run = (p: ReturnType<typeof handOver>) =>
    void Promise.resolve(p).then((err) => { setError(err); if (!err) setMode('idle'); });

  if (mode === 'give') {
    return (
      <form className="ledger-cell ledger-form" onSubmit={(e) => { e.preventDefault(); run(handOver(banner.id, to.trim())); }}>
        <span className="label">HAND OVER BANNER {banner.id}</span>
        <input aria-label="Account to receive the banner" placeholder="friend.testnet" value={to} onChange={(e) => setTo(e.target.value)} autoFocus />
        <span className="sub">The tower{banner.claimed ? '' : ' (unclaimed)'} and the chest go with it.</span>
        <div className="ledger-form-acts">
          <button className="chunk green" type="submit" disabled={!to.trim() || busy}>Give</button>
          <button className="link" type="button" onClick={() => { setMode('idle'); setError(null); }}>cancel</button>
        </div>
        {error && <span className="form-error" role="alert">{error}</span>}
      </form>
    );
  }

  if (mode === 'sell') {
    const n = Number(price);
    return (
      <form className="ledger-cell ledger-form" onSubmit={(e) => { e.preventDefault(); run(listBanner(banner.id, market.trim(), n)); }}>
        <span className="label">SELL BANNER {banner.id}</span>
        <input aria-label="Marketplace account" placeholder="market.testnet" value={market} onChange={(e) => setMarket(e.target.value)} autoFocus={!market} />
        <input aria-label="Price in NEAR" inputMode="decimal" placeholder="Price in NEAR" value={price} onChange={(e) => setPrice(e.target.value)} autoFocus={!!market} />
        <span className="sub">The marketplace may sell it once at this price. The buyer gets the tower and chest.</span>
        <div className="ledger-form-acts">
          <button className="chunk green" type="submit" disabled={!market.trim() || !(n > 0) || busy}>List</button>
          <button className="link" type="button" onClick={() => { setMode('idle'); setError(null); }}>cancel</button>
        </div>
        {error && <span className="form-error" role="alert">{error}</span>}
      </form>
    );
  }

  return (
    <div className="ledger-cell ledger-acts">
      {mine && listed.length > 0 ? (
        <>
          <span className="sub">Listed on <b>{listed.map(short).join(', ')}</b></span>
          <button className="chunk" onClick={() => run(unlistBanner(banner.id))} disabled={!connected || busy}>Cancel listing</button>
        </>
      ) : (
        <>
          <button className="chunk" onClick={() => setMode('give')} disabled={!mine || !connected}>Hand over</button>
          <button className="chunk" onClick={() => setMode('sell')} disabled={!mine || !connected}>Sell</button>
        </>
      )}
      {!mine && listed.length > 0 && <span className="sub">for sale on {listed.map(short).join(', ')}</span>}
      {explorer && <a className="link" href={explorer} target="_blank" rel="noreferrer">view on explorer</a>}
      {error && <span className="form-error" role="alert">{error}</span>}
    </div>
  );
}
