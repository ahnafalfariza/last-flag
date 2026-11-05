import { useEffect, useMemo, useState } from 'react';
import { useGame } from '../game/store';
import { duration, near, short } from '../game/format';
import { coverPoint, usePhone, useStageSize } from './stage';
import type { Banner } from '../game/types';

/** Pixel geometry of hall.jpg (1920x1440), measured from the render. */
const IMG = { w: 1920, h: 1440, src: '/img/hall.jpg' };
const SHIELD = { cx: 610, cy: 545 };
const UNDER_SHIELD = { cx: 595, cy: 905 };
const CHEST = { cx: 580, cy: 1255 };
/** The four banners already hanging on the rail in the render, cloth bounds. */
const RAIL = [
  { x0: 985, x1: 1195, y0: 520, y1: 1170, ink: '#F2D27A' },
  { x0: 1250, x1: 1425, y0: 575, y1: 1160, ink: '#F2D27A' },
  { x0: 1465, x1: 1620, y0: 600, y1: 1125, ink: '#5A3608' },
  { x0: 1650, x1: 1790, y0: 650, y1: 1150, ink: '#F2D27A' },
];

/** No round has ended yet: the hall waits for its first banner. */
function EmptyHall({ round }: { round: number }) {
  return (
    <main className="stage hall">
      <img className="bg on" src={IMG.src} alt="" />
      <section className="ledger" aria-labelledby="ledger-h">
        <div className="ledger-head">
          <h1 id="ledger-h">No banners yet</h1>
          <span className="sub">The winner of round {round} gets the first one.</span>
        </div>
      </section>
    </main>
  );
}

/** Trophy hall: the featured banner is the big one, older rounds hang on the rail. */
export function Hall() {
  const banners = useGame((s) => s.banners);
  const me = useGame((s) => s.me);
  const round = useGame((s) => s.round);
  const claimTower = useGame((s) => s.claimTower);
  const emptyChest = useGame((s) => s.emptyChest);
  const connected = useGame((s) => s.connected);
  const phone = usePhone();
  const [el, setEl] = useState<HTMLElement | null>(null);
  const size = useStageSize(el);
  const pos: [number, number] = phone ? [0.3, 0.5] : [0.5, 0.5];
  const at = (x: number, y: number) => coverPoint(IMG, size, [x / IMG.w, y / IMG.h], pos);

  const latestId = banners.length ? banners[banners.length - 1].id : 0;
  const [featuredId, setFeaturedId] = useState(latestId);
  const [page, setPage] = useState(0);
  useEffect(() => { setFeaturedId(latestId); setPage(0); }, [latestId]);

  const featured = banners.find((b) => b.id === featuredId) ?? banners[banners.length - 1];
  const rail = useMemo(() => banners.filter((b) => b.id !== featured?.id).sort((a, b) => b.id - a.id), [banners, featured?.id]);
  if (!featured) return <EmptyHall round={round.id} />;
  const pages = Math.max(1, Math.ceil(rail.length / RAIL.length));
  const hung = rail.slice(page * RAIL.length, page * RAIL.length + RAIL.length);

  const mine = featured.owner === me;
  const chestLeft = featured.chest - featured.chestTaken;
  const streaming = featured.id === round.id - 1;
  const who = (b: Banner) => (b.owner === me ? 'you' : short(b.owner));
  const ready = size.w > 0;
  const shield = at(SHIELD.cx, SHIELD.cy);
  const under = at(UNDER_SHIELD.cx, UNDER_SHIELD.cy);
  const chest = at(CHEST.cx, CHEST.cy);

  return (
    <main className="stage hall" ref={setEl}>
      <img className="bg on" src={IMG.src} alt="" style={{ objectPosition: `${pos[0] * 100}% ${pos[1] * 100}%` }} />

      {ready && (
        <>
          <div key={`s${featured.id}`} className="emb shield-emb" style={{ left: shield.x, top: shield.y, fontSize: shield.s * 150 }}>
            <small style={{ fontSize: shield.s * 22 }}>ROUND</small>
            <b>{featured.id}</b>
            <small style={{ fontSize: shield.s * 13 }}>LAST FLAG STANDING</small>
          </div>
          <div key={`u${featured.id}`} className="emb under-emb" style={{ left: under.x, top: under.y }}>
            <b style={{ fontSize: Math.max(16, under.s * 44) }}>{featured.owner}</b>
            <span style={{ fontSize: Math.max(11, under.s * 20) }}>{featured.blocks} blocks · {near(featured.principal, 1)} NEAR camped · {duration(featured.durationMs)}</span>
          </div>
          <div className="brass" style={{ left: chest.x, top: chest.y, fontSize: Math.max(10, chest.s * 20) }}>
            CHEST · {near(chestLeft, 3)} NEAR{streaming ? ' · filling now' : ''}
          </div>

          {!phone && RAIL.map((r, i) => {
            const b = hung[i];
            if (!b) return null;
            const a = at(r.x0, r.y0);
            const z = at(r.x1, r.y1);
            const w = z.x - a.x;
            return (
              <button
                key={b.id}
                className="hang"
                style={{ left: a.x, top: a.y, width: w, height: z.y - a.y, color: r.ink }}
                onClick={() => setFeaturedId(b.id)}
                aria-label={`Banner ${b.id}, held by ${who(b)}`}
              >
                <span className="hang-n" style={{ fontSize: w * 0.42 }}>{b.id}</span>
                <span className="hang-who" style={{ fontSize: Math.max(11, w * 0.1) }}>{who(b)}</span>
                <span className="hang-prize" style={{ fontSize: Math.max(10, w * 0.085) }}>{near(b.prize)} NEAR</span>
              </button>
            );
          })}
        </>
      )}

      {!phone && pages > 1 && ready && (() => {
        const a = at(RAIL[0].x0, 1215);
        const z = at(RAIL[3].x1, 1215);
        return (
          <div className="rail-pager" style={{ left: a.x, width: z.x - a.x, top: a.y }}>
            <button onClick={() => setPage((p) => Math.min(pages - 1, p + 1))} disabled={page >= pages - 1}>◀ older</button>
            <span>rounds {hung[hung.length - 1]?.id}–{hung[0]?.id}</span>
            <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>newer ▶</button>
          </div>
        );
      })()}

      <section className="ledger" aria-labelledby="ledger-h">
        <div className="ledger-head">
          <h1 id="ledger-h">Banner {featured.id}</h1>
          <span className="sub">{featured.endedBy === 'strike' ? 'won by lightning' : 'won at the hard cap'} · held by <b>{who(featured)}</b></span>
          {featured.id !== latestId && <button className="link" onClick={() => setFeaturedId(latestId)}>back to Banner {latestId}</button>}
        </div>
        <div className="ledger-row">
          <div className="ledger-cell">
            <span className="label amber">THE TOWER</span>
            <span className="mid gold">{near(featured.prize)} <span className="unit">NEAR</span></span>
            {featured.claimed ? <span className="stamp">CLAIMED</span> : mine ? (
              <button className="chunk green" onClick={() => claimTower(featured.id)} disabled={!connected}>CLAIM</button>
            ) : <span className="sub">not claimed yet</span>}
          </div>
          <div className="ledger-cell">
            <span className="label">THE CHEST</span>
            <span className="mid">{near(chestLeft, 3)} <span className="unit">NEAR</span></span>
            {mine ? (
              <button className="chunk gold" onClick={() => emptyChest(featured.id)} disabled={!connected || chestLeft <= 0}>EMPTY</button>
            ) : <span className="sub">{streaming ? `1% of round ${round.id}, filling` : `from round ${featured.id + 1}`}</span>}
          </div>
          <div className="ledger-cell ledger-acts">
            <button className="chunk" disabled={!mine}>Hand over</button>
            <button className="chunk" disabled={!mine}>Sell</button>
          </div>
        </div>
      </section>

      {phone && (
        <nav className="rail-phone" aria-label="Older banners">
          {rail.map((b, i) => {
            const r = RAIL[i % RAIL.length];
            const w = r.x1 - r.x0;
            const h = r.y1 - r.y0;
            return (
              <button key={b.id} onClick={() => setFeaturedId(b.id)} style={{ color: r.ink }}>
                <span className="crop" style={{ backgroundImage: `url(${IMG.src})`, backgroundSize: `${(IMG.w / w) * 100}% ${(IMG.h / h) * 100}%`, backgroundPosition: `${(r.x0 / (IMG.w - w)) * 100}% ${(r.y0 / (IMG.h - h)) * 100}%` }} />
                <b>{b.id}</b>
                <small>{who(b)}</small>
              </button>
            );
          })}
        </nav>
      )}
    </main>
  );
}
