import { useEffect, useRef, useState } from 'react';
import { accountColor, campers, graceFraction, myStake, useGame } from '../game/store';
import { mmss, near, short } from '../game/format';
import { coverPoint, DAY, NIGHT, PHONE, PHONE_NIGHT, usePhone, useStageSize, type Landmarks } from './stage';
import { ActionTray } from './ActionTray';

const Block = ({ size = 34 }: { size?: number }) => (
  <svg aria-hidden="true" width={size} height={size * 0.875} viewBox="0 0 80 70">
    <polygon points="0,30 40,50 40,70 0,50" fill="#B99558" /><polygon points="40,50 80,30 80,50 40,70" fill="#D9B36A" /><polygon points="40,10 80,30 40,50 0,30" fill="#F0D59A" />
  </svg>
);

interface Bolt { id: number; x1: number; y1: number; x2: number; y2: number; hit: boolean; mids: [number, number][] }

/** The hill as the judges saw it on the canvas: a render, a HUD over it, and the few things that move. */
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
  const keeperOn = useGame((s) => s.keeperOn);
  const phone = usePhone();

  const [stageEl, setStageEl] = useState<HTMLDivElement | null>(null);
  const size = useStageSize(stageEl);
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

  // Bolts: a jagged line for every bell. Misses land on the hillside, the strike hits the tower.
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
  const oldStakes = settled.map((r) => ({ id: r.id, amount: myStake(r, me) })).filter((x) => x.amount > 0);
  const camp = campers(round).sort((a, b) => (a.account === me ? -1 : b.account === me ? 1 : b.principal - a.principal));
  const shown = camp.slice(0, lm.tents.length);
  const extra = camp.length - shown.length;
  const leaderStake = round.leader ? round.deposits.filter((d) => d.account === round.leader).reduce((a, d) => a + d.amount, 0) : 0;
  const sinceFlag = round.lastDepositAt !== null ? now - round.lastDepositAt : 0;
  const flagP = at(lm.flag);
  const towerP = at(lm.tower);
  const latest = feed[0];

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

      {/* flag tag: who holds it */}
      {round.leader && size.w > 0 && (
        <div className={`tag anchor ${leading ? 'tag-me' : ''}`} style={{ left: flagP.x, top: Math.max(flagP.y, phone ? 150 : 118), borderColor: accountColor(round.leader) }}>
          {leading ? 'you hold the flag' : `${short(round.leader)} holds the flag`} · {near(leaderStake)} NEAR{phone ? '' : ` · ${Math.floor(sinceFlag / 60000)} min ago`}
        </div>
      )}
      {round.state === 'Open' && size.w > 0 && (
        <div className="tag anchor" style={{ left: flagP.x, top: Math.max(flagP.y, phone ? 150 : 118), borderColor: '#FFD54A' }}>the hill is empty · plant the first flag</div>
      )}

      {/* falling blocks */}
      {drops.map((id) => (
        <div key={id} className="drop" style={{ left: towerP.x, top: towerP.y }}><Block size={phone ? 26 : 40} /></div>
      ))}

      {/* tent tags */}
      {size.w > 0 && shown.map((c, i) => {
        const p = at(lm.tents[i]);
        const mine = c.account === me;
        return (
          <div key={c.account} className={`tag anchor ${mine ? 'tag-me' : ''}`} style={{ left: p.x, top: p.y }}>
            {mine ? 'you' : short(c.account)} · {near(c.principal)} {mine ? 'NEAR in the tent' : ''}
          </div>
        );
      })}
      {extra > 0 && size.w > 0 && (() => { const p = at(lm.tents[lm.tents.length - 1]); return <div className="tag anchor" style={{ left: phone ? p.x : p.x + 150, top: phone ? p.y + 28 : p.y }}>+{extra} more tent{extra === 1 ? '' : 's'} camped</div>; })()}

      {/* left column */}
      <div className="col-left">
        {round.state === 'Open' && (
          <div className="hud panel">
            <span className="label">THE HILL IS EMPTY</span>
            <span className="big">—</span>
            <span className="sub">the first flag starts the sun</span>
          </div>
        )}
        {round.state === 'Live' && round.graceUntil !== null && (
          <div className="hud panel">
            <span className="label">SUNSET IN</span>
            <span className="big">{mmss(round.graceUntil - now)}</span>
            <div className="sunbar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(f * 100)} aria-label="Daylight remaining"><div style={{ width: `${f * 100}%` }} /></div>
            <span className="sub">a new flag resets the sun to noon</span>
          </div>
        )}
        {armed && round.hardCapAt !== null && (
          <>
            <div className="hud panel storm" role="status">
              <span className="label red-soft">STORM OVER THE HILL</span>
              <span className="big red">{params.hazardBps / 100}% <span className="unit">/ bell</span></span>
              <span className="sub">lightning can hit the tower on any bell · no countdown to snipe</span>
            </div>
            <div className="hud panel log">
              <span className="label">THUNDER LOG</span>
              {thunder.slice(0, 4).map((t) => (
                <span key={t.id} className={`line ${t.struck ? 'hit' : ''}`}><b>{t.by === me ? 'you' : t.by.split('.')[0]}</b> roll {String(t.roll).padStart(4, '0')} · {t.struck ? 'STRIKE' : 'tower stands'}</span>
              ))}
              {thunder.length === 0 && <span className="line">no bells yet</span>}
              <span className="sub">a roll under {String(params.hazardBps).padStart(4, '0')} is the strike · {round.ticks} bells · dawn by {mmss(round.hardCapAt - now)}</span>
            </div>
          </>
        )}
        {(stake > 0 || oldStakes.length > 0) && (
          <div className="hud panel tent">
            <span className="label blue">YOUR TENT</span>
            <span className="mid blue">{near(stake)} <span className="unit">NEAR</span> <span className="sub">{leading ? 'yours while you hold the flag' : stake > 0 ? 'safe, comes home' : ''}</span></span>
            {stake > 0 && !leading && <button className="ghost" onClick={() => withdraw(round.id, me)}>PACK UP · {near(stake)} back now</button>}
            {oldStakes.map((o) => (
              <button key={o.id} className="ghost gold-b" onClick={() => withdraw(o.id, me)}>ROUND {o.id} SETTLED · TAKE {near(o.amount)} HOME</button>
            ))}
          </div>
        )}
      </div>

      {/* tower plaque */}
      <div className={`hud panel plaque ${armed ? 'armed' : ''}`}>
        <span className="label amber">THE TOWER · {round.deposits.length} BLOCK{round.deposits.length === 1 ? '' : 'S'}</span>
        <span className="big gold">{near(round.prize)} <span className="unit">NEAR</span></span>
        <span className="sub">{armed ? 'still growing from staking while the storm rolls' : 'goes home with the last flag standing'}</span>
        <span className="sub">{near(round.principalTotal, 1)} NEAR camped on the hill · next block ≥ {near(Math.ceil(round.minDeposit * 100) / 100)}</span>
      </div>

      {armed && (
        <div className="hud panel bell">
          <span className="label">OR RING THE BELL</span>
          <span className="sub">tick() is public. The ringer whose bell brings the strike gets {params.keeperReward} NEAR from the tower.{keeperOn ? ' The keeper rings once a block.' : ''}</span>
          <button className="ghost gold-b" onClick={() => tick(me)} disabled={!connected}>RING · call tick()</button>
        </div>
      )}

      {latest && <div key={latest.id} className={`ticker ${latest.kind}`}>{latest.text}</div>}

      <ActionTray />
    </div>
  );
}
