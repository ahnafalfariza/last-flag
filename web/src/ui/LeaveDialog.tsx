import { near } from '../game/format';
import { useEscape } from './Chest';

/** Packing up mid-round gives up the camp share, so show both outcomes before it happens. */
export function LeaveDialog({ stake, share, onStay, onLeave }: { stake: number; share: number; onStay: () => void; onLeave: () => void }) {
  useEscape(onStay);
  return (
    <div className="modal-bg" role="dialog" aria-modal="true" aria-labelledby="leave-h">
      <div className="modal over">
        <div className="over-head">
          <h1 id="leave-h" className="dialog-title">Leave before it ends?</h1>
          <p className="over-why">You can take your deposit now. Your camp share only goes to players still here when the round ends.</p>
        </div>
        <div className="camp-compare">
          <div className="stay">
            <span>If you stay</span>
            <b>{near(stake + share)} NEAR</b>
            <small>{near(stake)} deposit + {near(share)} share, more if others leave</small>
          </div>
          <div className="leave">
            <span>If you leave now</span>
            <b>{near(stake)} NEAR</b>
            <small>Deposit only, in your wallet right away</small>
          </div>
        </div>
        <div className="modal-actions">
          <button type="button" className="primary" onClick={onStay}>Stay camped</button>
          <button type="button" className="dialog-secondary" onClick={onLeave}>Leave with {near(stake)} NEAR</button>
        </div>
      </div>
    </div>
  );
}
