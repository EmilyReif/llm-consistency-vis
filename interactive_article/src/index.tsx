import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';

(window as unknown as { __webpack_public_path__?: string }).__webpack_public_path__ =
  (process.env.PUBLIC_URL || '') + '/';

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
