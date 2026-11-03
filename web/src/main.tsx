import { createRoot } from 'react-dom/client';
import './styles.css';
import App from './App';

// No StrictMode: drei's <Html> mounts a React root per tag, and StrictMode's double effects log unmount races in dev.
createRoot(document.getElementById('root')!).render(<App />);
