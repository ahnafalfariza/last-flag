import { useGame, type Page } from '../game/store';
import { duration, near, short } from '../game/format';

const Ico = ({ kind }: { kind: Page }) => {
  if (kind === 'hill')
    return (
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <path d="M2 28 L13 12 L19 19 L23 15 L30 28 Z" fill="#7ACB5A" stroke="#10141C" strokeWidth="2" strokeLinejoin="round" />
        <rect x="12" y="4" width="2" height="10" fill="#10141C" />
        <path d="M14 4 L21 6.5 L14 9 Z" fill="#E8453C" stroke="#10141C" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
    );
  if (kind === 'hall')
    return (
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <rect x="5" y="3" width="22" height="3" rx="1.5" fill="#C8A028" stroke="#10141C" strokeWidth="1.5" />
        <path d="M8 6 H24 V27 L16 22 L8 27 Z" fill="#C8362B" stroke="#10141C" strokeWidth="2" strokeLinejoin="round" />
        <circle cx="16" cy="14" r="4" fill="#FFD54A" stroke="#10141C" strokeWidth="1.5" />
      </svg>
    );
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <path d="M7 5 H23 a3 3 0 0 1 3 3 V27 H10 a3 3 0 0 1 -3 -3 Z" fill="#F0D59A" stroke="#10141C" strokeWidth="2" strokeLinejoin="round" />
      <path d="M11 11 H21 M11 15 H21 M11 19 H17" stroke="#8A621C" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
};

const NAV: { page: Page; label: string }[] = [
  { page: 'hill', label: 'The Hill' },
  { page: 'hall', label: 'Banners' },
  { page: 'rules', label: 'How to play' },
];

/** Game HUD top: pennant logo with the round shield, chunky nav, coin purse. No bar. */
export function Header() {
  const page = useGame((s) => s.page);
  const setPage = useGame((s) => s.setPage);
  const round = useGame((s) => s.round);
  const now = useGame((s) => s.now);
  const me = useGame((s) => s.me);
  const balance = useGame((s) => s.balance);
  const connected = useGame((s) => s.connected);
  const connect = useGame((s) => s.connect);
  const armed = round.state === 'Armed';
  const since = round.graceUntil !== null ? now - round.graceUntil : 0;
  const status = round.state === 'Open' ? 'no bids yet' : armed ? `sudden death ${duration(since)}` : 'bidding';

  return (
    <header className={`header ${armed ? 'night' : ''}`}>
      <button className="pennant" onClick={() => setPage('hill')} aria-label={`Last Flag, round ${round.id}, ${status}`}>
        <span className="pennant-cloth"><span className="wordmark">LAST FLAG</span></span>
        <span className={`shield ${armed ? 'storm' : ''}`}>
          <small>ROUND</small>
          <b>{round.id}</b>
        </span>
        <span className={`status ${armed ? 'storm' : ''}`}>{status}</span>
      </button>

      <nav className="chunky-nav" aria-label="Main">
        {NAV.map((n) => (
          <button key={n.page} className={page === n.page ? 'on' : ''} onClick={() => setPage(n.page)} aria-current={page === n.page ? 'page' : undefined}>
            <Ico kind={n.page} />
            <span>{n.label}</span>
          </button>
        ))}
      </nav>

      {connected ? (
        <button className="purse" title={me}>
          <span className="coin">N</span>
          <span className="purse-text"><b>{near(balance)}</b><small>{short(me)}</small></span>
        </button>
      ) : (
        <button className="purse purse-off" onClick={connect}>
          <span className="coin">N</span>
          <span className="purse-text"><b>CONNECT</b><small>wallet</small></span>
        </button>
      )}
    </header>
  );
}
