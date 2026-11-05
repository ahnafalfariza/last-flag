import { useGame } from '../game/store';
import { CONTRACT_ID, EXPLORER, NETWORK } from '../chain/config';

/** Judge controls: bots, keeper, speed, skip grace. Not part of the game. */
export function DemoPanel() {
  const live = useGame((s) => s.mode === 'live');
  if (live) return <LiveBadge />;
  return <SimPanel />;
}

/** Live mode: nothing to control, just say where the game runs. */
function LiveBadge() {
  const pending = useGame((s) => s.pending);
  const url = EXPLORER && CONTRACT_ID ? `${EXPLORER}/address/${CONTRACT_ID}` : null;
  return (
    <div className="demo">
      <span className="label">LIVE · {NETWORK}</span>
      <div className="demo-row">
        {url ? <a href={url} target="_blank" rel="noreferrer">{CONTRACT_ID}</a> : <span>{CONTRACT_ID}</span>}
      </div>
      {pending && <div className="demo-row"><span>waiting for wallet: {pending}</span></div>}
    </div>
  );
}

function SimPanel() {
  const botsOn = useGame((s) => s.botsOn);
  const keeperOn = useGame((s) => s.keeperOn);
  const speed = useGame((s) => s.speed);
  const round = useGame((s) => s.round);
  const toggleBots = useGame((s) => s.toggleBots);
  const toggleKeeper = useGame((s) => s.toggleKeeper);
  const setSpeed = useGame((s) => s.setSpeed);
  const skipGrace = useGame((s) => s.skipGrace);
  return (
    <div className="demo">
      <span className="label">DEMO · local simulator</span>
      <div className="demo-row">
        <button aria-pressed={botsOn} onClick={toggleBots}>bots {botsOn ? 'on' : 'off'}</button>
        <button aria-pressed={keeperOn} onClick={toggleKeeper}>keeper {keeperOn ? 'on' : 'off'}</button>
      </div>
      <div className="demo-row">
        {[1, 5, 20].map((s) => (
          <button key={s} aria-pressed={speed === s} onClick={() => setSpeed(s)}>{s}x</button>
        ))}
        <button onClick={skipGrace} disabled={round.state !== 'Live'}>skip to sunset</button>
      </div>
    </div>
  );
}
