import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App.js';
import { applyTheme } from './theme.js';
import './styles.css';

applyTheme(document.documentElement);

const container = document.getElementById('root');
if (container === null) throw new Error('#root missing from index.html');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
