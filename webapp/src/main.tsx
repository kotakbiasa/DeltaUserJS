import React from 'react';
import ReactDOM from 'react-dom/client';
import { AppRoot } from '@telegram-apps/telegram-ui';
import '@telegram-apps/telegram-ui/dist/styles.css';
import './index.css';
import App from './App';
import { applyTheme, initTelegramApp, tg } from './telegram';

// Terapkan tema sebelum render pertama, lalu sinalkan ready setelah React
// memiliki opportunity untuk melakukan paint pertama.
applyTheme();
const appearance = tg?.colorScheme === 'light' ? 'light' : 'dark';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppRoot appearance={appearance} platform={tg?.platform === 'ios' ? 'ios' : 'base'}>
      <App />
    </AppRoot>
  </React.StrictMode>
);

window.requestAnimationFrame(() => {
  initTelegramApp();
});
