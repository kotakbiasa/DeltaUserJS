import React from 'react';
import ReactDOM from 'react-dom/client';
import { AppRoot } from '@telegram-apps/telegram-ui';
import '@telegram-apps/telegram-ui/dist/styles.css';
import './index.css';
import App from './App';
import { initTelegramApp, tg } from './telegram';

initTelegramApp();

const appearance = tg?.colorScheme === 'light' ? 'light' : 'dark';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppRoot appearance={appearance} platform={tg?.platform === 'ios' ? 'ios' : 'base'}>
      <App />
    </AppRoot>
  </React.StrictMode>
);
