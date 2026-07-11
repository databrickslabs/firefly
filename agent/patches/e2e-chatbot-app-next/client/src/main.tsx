import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';

// Firefly proxy-embed shim (source-side; keeps the reverse proxy stock).
// When embedded, the iframe is served under a dynamic mount:
//   - Vercel-native route:  /api/agent-proxy/...
//   - Go proxy (optional):  /app-proxy/{toolId}/...
// Derive that mount prefix from the current path and (1) drive the router
// basename and (2) prefix absolute /api/ fetches so they route back through
// the proxy instead of hitting the frontend origin root.
declare global {
  interface Window {
    __FIREFLY_PROXY_BASENAME__?: string;
  }
}

const proxyPrefix =
  window.location.pathname.match(/^\/(?:app-proxy\/[^/]+|api\/agent-proxy)/)?.[0] ??
  '';
const routerBasename = proxyPrefix || '/';

if (proxyPrefix) {
  window.__FIREFLY_PROXY_BASENAME__ = proxyPrefix;
  const originalFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    if (typeof input === 'string' && input.startsWith('/api/')) {
      input = proxyPrefix + input;
    }
    return originalFetch(input, init);
  };
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Failed to find the root element with ID "root"');
}

ReactDOM.createRoot(rootElement).render(
  <BrowserRouter basename={routerBasename}>
    <App />
  </BrowserRouter>,
);
