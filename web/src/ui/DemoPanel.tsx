import { useGame } from '../game/store';

/** Judge controls: bots, keeper, speed, skip grace. Not part of the game. */
export function DemoPanel() {
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
