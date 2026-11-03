import { lazy, Suspense, useEffect } from 'react';
import { startClock, useGame } from './game/store';
import { Header } from './ui/Header';
import { HillView } from './ui/HillView';
import { Hall } from './ui/Hall';
import { Rules } from './ui/Rules';
import { DemoPanel } from './ui/DemoPanel';
import { StrikeModal } from './ui/StrikeModal';

const Scene = lazy(() => import('./scene/Scene').then((m) => ({ default: m.Scene })));

// The low-poly Three.js hill is kept behind ?scene=3d; the shipped look is the rendered hill.
const use3d = new URLSearchParams(location.search).get('scene') === '3d';

export default function App() {
  const page = useGame((s) => s.page);
  useEffect(() => startClock(), []);
  return (
    <div className={`app page-${page}`}>
      {page === 'hill' && (use3d ? <Suspense fallback={null}><Scene /></Suspense> : <HillView />)}
      {page === 'hall' && <Hall />}
      {page === 'rules' && <Rules />}
      <Header />
      <DemoPanel />
      <StrikeModal />
    </div>
  );
}
