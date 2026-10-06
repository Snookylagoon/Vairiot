import React from 'react';
import ReactDOM from 'react-dom/client';

import App from './App';
import { initMonitoring } from './lib/monitoring';
import './styles/globals.css';

initMonitoring();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
