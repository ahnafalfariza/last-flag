import { myStake, useGame } from '../game/store';
import { near, short } from '../game/format';
import { Tracker } from './Tracker';

/** Round over: who won, what you get back, and the way into the next round. */
export function StrikeModal() {
  const strike = useGame((s) => s.strike);
  const me = useGame((s) => s.me);
  const settled = useGame((s) => s.settled);
  const banners = useGame((s) => s.banners);
  const params = useGame((s) => s.params);
  const dismiss = useGame((s) => s.dismissStrike);
  const setPage = useGame((s) => s.setPage);
  const withdraw = useGame((s) => s.withdraw);
  const claimTower = useGame((s) => s.claimTower);
  if (!strike) return null;

  const mine = strike.winner === me;
  const who = mine ? 'You' : short(strike.winner);
  const round = settled.find((r) => r.id === strike.round);
  const banner = banners.find((b) => b.id === strike.round);
  const back = round ? myStake(round, me) : 0;
  const how = banner?.endedBy === 'hard cap'
    ? 'Sudden death hit its time limit'
    : `Lightning hit on check ${banner?.ticks ?? round?.ticks ?? '?'}`;

  return (
    <div className="modal-bg" role="dialog" aria-modal="true" aria-labelledby="over-h">
      <div className="modal over">
        <Tracker state="Settled" tone="light" />
        <div className="over-head">
          <h1 id="over-h">Round {strike.round} is over</h1>
          <p className="over-win">{mine ? 'You won' : `${who} won`} {near(strike.prize)} NEAR</p>
          <p className="over-why">
            {how}, with {mine ? 'you' : who} in the lead after {strike.blocks} bids. {mine ? 'You' : who} also {mine ? 'get' : 'gets'} Banner {strike.round}, a trophy that collects {params.royaltyFeeBps / 100}% of every bid in round {strike.round + 1}.
          </p>
        </div>
        {(back > 0 || (mine && banner && !banner.claimed)) && (
          <div className="over-back">
            <div>
              <span>{mine && banner && !banner.claimed ? 'Prize and deposit ready' : 'Your deposit is ready'}</span>
              <b>{near(back + (mine && banner && !banner.claimed ? banner.prize : 0))} NEAR</b>
            </div>
            <button onClick={async () => { if (back > 0) await withdraw(strike.round, me); if (mine) await claimTower(strike.round); }}>Take it</button>
          </div>
        )}
        <div className="modal-actions">
          <button className="primary" onClick={dismiss}>Play round {strike.round + 1}</button>
          <button className="link" onClick={() => { dismiss(); setPage('hall'); }}>See banners</button>
        </div>
      </div>
    </div>
  );
}
