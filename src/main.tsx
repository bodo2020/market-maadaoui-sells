import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import './lib/fonts.css'

const startRoute = import.meta.env.VITE_APP_START_ROUTE?.trim();
if (startRoute && window.location.pathname === '/') {
  window.history.replaceState(null, '', startRoute);
}

createRoot(document.getElementById("root")!).render(<App />);
