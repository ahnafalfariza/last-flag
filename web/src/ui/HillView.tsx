import { useEffect, useRef, useState } from 'react';
import { campers, graceFraction, myStake, useGame } from '../game/store';
import { near, short } from '../game/format';
import { coverPoint, DAY, NIGHT, PHONE, PHONE_NIGHT, usePhone, useStageSize, type Landmarks } from './stage';
import { ActionTray } from './ActionTray';
import { Tracker } from './Tracker';

const Block = ({ size = 34 }: { size?: number }) => (
  <svg aria-hidden="true" width={size} height={size * 0.875} viewBox="0 0 80 70">
    <polygon points="0,30 40,50 40,70 0,50" fill="#B99558" /><polygon points="40,50 80,30 80,50 40,70" fill="#D9B36A" /><polygon points="40,10 80,30 40,50 0,30" fill="#F0D59A" />
  </svg>
);

interface Bolt { id: number; x1: number; y1: number; x2: number; y2: number; hit: boolean; mids: [number, number][] }

/** m:ss, for countdowns a player reads at a glance. */
const clock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

const SEEN_KEY = 'lastflag.explainer.seen';
const readSeen = () => { try { return localStorage.getItem(SEEN_KEY) === '1'; } catch { return false; } };
const writeSeen = () => { try { localStorage.setItem(SEEN_KEY, '1'); } catch { /* private mode: show it again next time */ } };

/** The hill: the render, one status card, one action bar, and the few things that move. */
export function HillView() {
  const round = useGame((s) => s.round);
  const settled = useGame((s) => s.settled);
  const now = useGame((s) => s.now);
  const params = useGame((s) => s.params);
  const me = useGame((s) => s.me);
  const thunder = useGame((s) => s.thunder);
  const flash = useGame((s) => s.flash);
  const feed = useGame((s) => s.feed);
  const tick = useGame((s) => s.tick);
  const withdraw = useGame((s) => s.withdraw);
  const connected = useGame((s) => s.connected);
  const setPage = useGame((s) => s.setPage);
  const phone = usePhone();

  const [stageEl, setStageEl] = useState<HTMLDivElement | null>(null);
  const size = useStageSize(stageEl);
  const [seen, setSeen] = useState(readSeen);
  const [details, setDetails] = useState(false);
  const armed = round.state === 'Armed';
  const nightLm = phone ? PHONE_NIGHT : NIGHT;
  const lm: Landmarks = armed ? nightLm : phone ? PHONE : DAY;
  const at = (p: [number, number]) => coverPoint(lm, size, p);

  // Block drops: one per new deposit, falling onto the tower top.
  const [drops, setDrops] = useState<number[]>([]);
  const seenCount = useRef(round.deposits.length);
  useEffect(() => {
    if (round.deposits.length > seenCount.current) {
      const id = round.deposits[round.deposits.length - 1].id;
      setDrops((d) => [...d, id]);
      setTimeout(() => setDrops((d) => d.filter((x) => x !== id)), 900);
    }
    seenCount.current = round.deposits.length;
  }, [round.deposits]);

  // Bolts: a jagged line for every check. Misses land on the hillside, the one that ends the round hits the tower.
  const [bolts, setBolts] = useState<Bolt[]>([]);
  const lastThunder = useRef<number>(-1);
  const [shake, setShake] = useState(false);
  useEffect(() => {
    const t = thunder[0];
    if (!t || t.id === lastThunder.current || size.w === 0) return;
    lastThunder.current = t.id;
    const target = t.struck ? at(nightLm.tower) : { x: size.w * (0.05 + Math.random() * 0.5), y: size.h * (0.55 + Math.random() * 0.25) };
    const x1 = target.x + (Math.random() - 0.5) * size.w * 0.3;
    const mids: [number, number][] = Array.from({ length: 6 }, (_, i) => {
      const k = (i + 1) / 7;
      return [x1 + (target.x - x1) * k + (Math.random() - 0.5) * 60, target.y * k + (Math.random() - 0.5) * 20];
    });
    const bolt: Bolt = { id: t.id, x1, y1: -10, x2: target.x, y2: target.y, hit: t.struck, mids };
    setBolts((b) => [...b, bolt]);
    setTimeout(() => setBolts((b) => b.filter((x) => x.id !== bolt.id)), t.struck ? 900 : 220);
    if (t.struck) { setShake(true); setTimeout(() => setShake(false), 700); }
  }, [thunder, size]); // eslint-disable-line react-hooks/exhaustive-deps

  const f = graceFraction(round, now, params);
  const stake = myStake(round, me);
  const leading = round.leader === me;
  const leader = leading ? 'You' : short(round.leader);
  const oldStakes = settled.map((r) => ({ id: r.id, amount: myStake(r, me) })).filter((x) => x.amount > 0);
  const camp = campers(round).sort((a, b) => (a.account === me ? -1 : b.account === me ? 1 : b.principal - a.principal));
  const shown = camp.slice(0, lm.tents.length);
  const extra = camp.length - shown.length;
  const checks = armed && round.graceUntil !== null ? thunder.filter((t) => t.at >= round.graceUntil!).slice(0, 3) : [];
  const flagP = at(lm.flag);
  const latest = feed[0];
  const graceSecs = params.graceMs / 1000;
  const chance = params.hazardBps / 100;

  const dismiss = () => { writeSeen(); setSeen(true); };

  return (
    <div className={`stage ${armed ? 'night' : 'day'} ${shake ? 'shake' : ''}`} ref={setStageEl}>
      <img className={`bg ${armed ? '' : 'on'}`} src={phone ? PHONE.src : DAY.src} alt="" />
      <img className={`bg ${armed ? 'on' : ''}`} src={nightLm.src} alt="" />
      <div className="rain" style={{ opacity: armed ? 1 : 0 }} />
      <div className="flash" style={{ opacity: armed ? Math.min(0.9, flash * flash) : 0 }} />
      <svg className="bolts" width={size.w} height={size.h} aria-hidden="true">
        {bolts.map((b) => (
          <g key={b.id} className={b.hit ? 'hit' : ''}>
            <polyline points={[[b.x1, b.y1], ...b.mids, [b.x2, b.y2]].map((p) => p.join(',')).join(' ')} />
          </g>
        ))}
      </svg>

      {/* who leads, on the tower */}
      {round.leader && size.w > 0 && (
        <div className={`tag anchor lead ${leading ? 'tag-me' : ''}`} style={{ left: flagP.x, top: Math.max(flagP.y, phone ? 345 : 118) }}>
          {leading ? "You're leading" : `${leader} is leading`}
        </div>
      )}

      {drops.map((id) => (
        <div key={id} className="drop" style={{ left: at(lm.tower).x, top: at(lm.tower).y }}><Block size={phone ? 26 : 40} /></div>
      ))}

      {/* players, at the tents */}
      {size.w > 0 && shown.map((c, i) => {
        const p = at(lm.tents[i]);
        const mine = c.account === me;
        return <div key={c.account} className={`tag anchor ${mine ? 'tag-me' : ''}`} style={{ left: p.x, top: p.y }}>{mine ? 'You' : short(c.account)}</div>;
      })}
      {extra > 0 && size.w > 0 && (() => { const p = at(lm.tents[lm.tents.length - 1]); return <div className="tag anchor" style={{ left: phone ? p.x : p.x + 64, top: phone ? p.y + 28 : p.y }}>+{extra} player{extra === 1 ? '' : 's'}</div>; })()}

      {/* the one card that says what is happening */}
      <section className={`card status-card ${armed ? 'armed' : ''}`} aria-label="Round status">
        <Tracker state={round.state} />
        {round.state === 'Open' ? (
          <>
            <div className="who">
              <span className="sub-l">No bids yet</span>
              <span className="prize">Be the first</span>
            </div>
            <p className="note">The first bid is {near(round.minDeposit)} NEAR and starts a {clock(params.graceMs)} timer. Whoever leads when the round ends wins the prize.</p>
          </>
        ) : (
          <div className="who">
            <span className="sub-l">{armed ? <>If it ends now, <b>{leading ? 'you win' : `${leader} wins`}</b></> : <><b>{leader}</b> {leading ? "are in the lead and would win" : 'is in the lead and would win'}</>}</span>
            <span className="prize">{near(round.prize)} NEAR</span>
          </div>
        )}
        {round.state === 'Live' && round.graceUntil !== null && (
          <div className="timer">
            <div className="timer-row"><span>Bidding closes in</span><b>{clock(round.graceUntil - now)}</b></div>
            <div className="bar" role="progressbar" aria-label="Time left in bidding" aria-valuemin={0} aria-valuemax={graceSecs} aria-valuenow={Math.round(f * graceSecs)}><div style={{ width: `${f * 100}%` }} /></div>
            <p className="note">Any new bid resets this to {clock(params.graceMs)}. If it hits zero, sudden death starts.</p>
          </div>
        )}
        {armed && round.hardCapAt !== null && (
          <div className="danger" role="status">
            <b>Could end any second</b>
            <p>Every second there's a {chance}% chance the round ends. There's no countdown to wait out. A new bid puts you in the lead and restarts bidding.</p>
            <span>Ends for sure in {clock(round.hardCapAt - now)}</span>
          </div>
        )}
        {round.state !== 'Open' && (
          <button className="link" aria-expanded={details} onClick={() => setDetails(!details)}>{details ? 'Hide round details' : 'Round details'}</button>
        )}
        {details && round.state !== 'Open' && (
          <div className="details">
            <dl>
              <dt>Bids this round</dt><dd>{round.deposits.length}</dd>
              <dt>Players' deposits</dt><dd>{near(round.principalTotal, 1)} NEAR</dd>
              <dt>Next bid at least</dt><dd>{near(Math.ceil(round.minDeposit * 100) / 100)} NEAR</dd>
              {armed && <><dt>Checks so far</dt><dd>{round.ticks}</dd></>}
            </dl>
            {checks.length > 0 && (
              <ul className="checks">
                {checks.map((t, i) => <li key={t.id} className={t.struck ? 'hit' : ''}>Check {round.ticks - i}: {t.struck ? 'the round ends' : 'the round goes on'}</li>)}
              </ul>
            )}
            {armed && (
              <>
                <button className="ghost" onClick={() => tick(me)} disabled={!connected}>Run a check yourself</button>
                <p className="note">Anyone can run a check. If yours ends the round, you get {params.keeperReward} NEAR.</p>
              </>
            )}
          </div>
        )}
      </section>

      <div className="col-right">
        {!seen && !phone && (
          <aside className="explain" aria-labelledby="explain-h">
            <h2 id="explain-h">New here? A round in 3 steps</h2>
            <ol>
              <li>Bid to take the lead. Each bid has to be {params.growthBps / 100}% bigger than the one before.</li>
              <li>When nobody bids for {graceSecs === 60 ? 'a minute' : `${graceSecs} seconds`}, sudden death starts. The round can end any second.</li>
              <li>Whoever leads at the end wins the prize. Everyone gets {100 - (params.potFeeBps + params.royaltyFeeBps) / 100}% of their bids back.</li>
            </ol>
            <div className="explain-acts">
              <button onClick={dismiss}>Got it</button>
              <button className="link" onClick={() => { dismiss(); setPage('rules'); }}>Full rules</button>
            </div>
          </aside>
        )}
        {(stake > 0 || oldStakes.length > 0) && (
          <aside className="card deposit" aria-label="Your deposit">
            {stake > 0 && (
              <>
                <span className="sub-l">Your deposit</span>
                <span className="amt">{near(stake)} NEAR</span>
                <p className="note">{leading ? "You're in the lead, so it stays in until someone outbids you or the round ends." : "You're not leading, so you can take it back now or leave it until the round ends."}</p>
                {!leading && <button className="ghost" onClick={() => withdraw(round.id, me)}>Withdraw {near(stake)} NEAR</button>}
              </>
            )}
            {oldStakes.map((o) => (
              <button key={o.id} className="ghost gold-b" onClick={() => withdraw(o.id, me)}>Round {o.id} is over. Take back {near(o.amount)} NEAR</button>
            ))}
          </aside>
        )}
      </div>

      {latest && <div key={latest.id} className={`ticker ${latest.kind}`} role="status">{latest.text}</div>}

      <ActionTray />
    </div>
  );
}
