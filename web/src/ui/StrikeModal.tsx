import { useGame } from '../game/store';
import { near, short } from '../game/format';

export function StrikeModal() {
  const strike = useGame((s) => s.strike);
  const me = useGame((s) => s.me);
  const dismiss = useGame((s) => s.dismissStrike);
  const setPage = useGame((s) => s.setPage);
  if (!strike) return null;
  const mine = strike.winner === me;
  return (
    <div className="modal-bg" role="dialog" aria-labelledby="strike-h">
      <div className="modal">
        <span className="label red">THE STRIKE</span>
        <h1 id="strike-h">{mine ? 'Your flag was the last one standing.' : `${short(strike.winner)} held the last flag.`}</h1>
        <p className="big gold">{near(strike.prize)} <span className="unit">NEAR</span></p>
        <p className="sub">Banner {strike.round} minted to {mine ? 'you' : short(strike.winner)} · {strike.blocks} blocks · bell rung by {strike.by === me ? 'you' : short(strike.by)}. Every tent goes home in full. Round {strike.round + 1} is open.</p>
        <div className="modal-actions">
          <button className="primary" onClick={() => { dismiss(); setPage('hall'); }}>SEE BANNER {strike.round}</button>
          <button className="ghost" onClick={dismiss}>Back to the hill</button>
        </div>
      </div>
    </div>
  );
}
