import { useGame } from '../game/store';
import { applyLevels, suspend, unlock, useSound } from './engine';
import { music } from './music';
import { sfx } from './sfx';

/** Play sounds for game events by watching the store. Returns a stop function. */
export const bindSound = () => {
  const onGesture = () => {
    if (!unlock()) return;
    music.sync();
  };
  const onClick = (e: MouseEvent) => {
    const b = e.target instanceof Element ? e.target.closest('button') : null;
    if (b && !b.disabled) sfx.click();
  };
  const onVisibility = () => {
    if (document.hidden) {
      suspend();
      music.stop();
    } else {
      onGesture();
    }
  };
  let strikeTimer: ReturnType<typeof setTimeout> | undefined;

  const stopGame = useGame.subscribe((s, p) => {
    music.setMood(s.round.state === 'Armed' ? 'storm' : 'day');

    if (s.page !== p.page) sfx.page();
    if (s.connected && !p.connected) sfx.connect();

    const r = s.round;
    if (r.id === p.round.id && r.deposits.length > p.round.deposits.length) {
      if (r.deposits[r.deposits.length - 1].account === s.me) sfx.bidMine();
      else sfx.bidOther();
    }
    if (r.state === 'Armed' && p.round.state !== 'Armed' && r.id === p.round.id) sfx.stormStart();

    const ev = s.thunder[0];
    if (ev && ev !== p.thunder[0]) {
      if (ev.struck) sfx.strike();
      else sfx.thunder();
    }
    if (s.strike && !p.strike) {
      const mine = s.strike.winner === s.me;
      clearTimeout(strikeTimer);
      strikeTimer = setTimeout(mine ? sfx.win : sfx.lose, 900);
    }

    // Prize, chest, refund or keeper reward landed in the wallet.
    if (s.balance > p.balance + 1e-9) sfx.coin();
  });

  const stopSound = useSound.subscribe(() => {
    applyLevels();
    music.sync();
  });

  document.addEventListener('pointerdown', onGesture);
  document.addEventListener('keydown', onGesture);
  document.addEventListener('click', onClick);
  document.addEventListener('visibilitychange', onVisibility);

  return () => {
    stopGame();
    stopSound();
    clearTimeout(strikeTimer);
    music.stop();
    document.removeEventListener('pointerdown', onGesture);
    document.removeEventListener('keydown', onGesture);
    document.removeEventListener('click', onClick);
    document.removeEventListener('visibilitychange', onVisibility);
  };
};
