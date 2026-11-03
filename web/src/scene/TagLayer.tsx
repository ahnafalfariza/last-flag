import { accountColor, useGame } from '../game/store';
import { near, short } from '../game/format';
import { flagTagY, TENT_Y, tentSpots } from './tags';

/** DOM name tags over the scene: who holds the flag, whose tent is whose. */
export function TagLayer() {
  const round = useGame((s) => s.round);
  const me = useGame((s) => s.me);
  const leaderStake = round.leader
    ? round.deposits.filter((d) => d.account === round.leader).reduce((a, d) => a + d.amount, 0)
    : 0;
  return (
    <div className="tags" aria-hidden="true">
      {round.leader && (
        <div data-tag data-x={0} data-y={flagTagY(round.deposits.length)} data-z={0} className={`tag3d ${round.leader === me ? 'tag3d-me' : ''}`} style={{ borderColor: accountColor(round.leader) }}>
          {round.leader === me ? 'you hold the flag' : `${short(round.leader)} holds the flag`} · {near(leaderStake)}
        </div>
      )}
      {tentSpots(round).map((t) => (
        <div key={t.account} data-tag data-x={t.x} data-y={TENT_Y + 1.95} data-z={t.z} className={`tag3d ${t.account === me ? 'tag3d-me' : ''}`}>
          {t.account === me ? 'you' : short(t.account)} · {near(t.principal)} inside
        </div>
      ))}
    </div>
  );
}
