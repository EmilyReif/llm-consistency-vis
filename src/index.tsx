
import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './app';
(window as any).__webpack_public_path__ = process.env.PUBLIC_URL + '/';

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
