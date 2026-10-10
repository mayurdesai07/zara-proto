/* Zara · app.js — bootstrap: seed data, theme, routing, PWA wiring, live refresh */
(function () {
  const S = window.ZaraStore;
  const UI = window.ZaraUI;
  const { hydrate } = window.ZaraIcons;

  // 1. Seed defaults on first run
  window.ZaraDefaults.seedAll(false);

  // 2. Theme + icons
  UI.applyTheme();
  hydrate();
  UI.chatModeLabel();

  // 3. Route from hash
  const start = (location.hash || '#home').slice(1);
  UI.showView(start);
  UI.renderChat();
  window.addEventListener('hashchange', () => {
    const v = (location.hash || '#home').slice(1);
    if (v !== UI.state.view) UI.showView(v);
  });

  // 4. Re-render on cross-tab storage changes
  window.addEventListener('storage', (e) => {
    if (e.key && e.key.startsWith('zara_')) { UI.applyTheme(); UI.chatModeLabel(); UI.render(); if (e.key === S.KEYS.chat) UI.renderChat(); }
  });

  // 5. Keep time-sensitive views fresh (countdowns, "now" class highlight)
  setInterval(() => { if (!document.hidden && !UI.state.busy) UI.render(); }, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) UI.render(); });

  // 6. Online / offline indicator
  const pill = document.getElementById('offline-pill');
  const net = () => { pill.hidden = navigator.onLine; };
  window.addEventListener('online', () => { net(); UI.toast('Back online', 'ok'); });
  window.addEventListener('offline', () => { net(); UI.toast('You are offline — Zara keeps working locally'); });
  net();

  // 7. Service worker
  const swState = document.getElementById('sw-state');
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname))) {
    window.addEventListener('load', async () => {
      try {
        const reg = await navigator.serviceWorker.register('sw.js');
        swState.textContent = 'offline cache ready';
        reg.addEventListener('updatefound', () => {
          const nw = reg.installing;
          nw && nw.addEventListener('statechange', () => {
            if (nw.state === 'installed' && navigator.serviceWorker.controller) {
              UI.toast('Zara was updated', 'ok', { label: 'Reload', fn: () => location.reload() });
            }
          });
        });
      } catch (e) {
        swState.textContent = 'service worker unavailable';
        console.warn('[Zara] SW registration failed', e);
      }
    });
  } else {
    swState.textContent = location.protocol === 'file:' ? 'open via http(s) for offline cache' : 'service worker not supported';
  }

  // 8. Install prompt
  let deferredPrompt = null;
  const installBtn = document.getElementById('install-btn');
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; installBtn.hidden = false; });
  installBtn.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') UI.toast('Zara installed 🎉', 'ok');
    deferredPrompt = null; installBtn.hidden = true;
  });
  window.addEventListener('appinstalled', () => { installBtn.hidden = true; });

  // 9. Keyboard shortcut: "/" focuses chat
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && !/input|textarea|select/i.test(document.activeElement.tagName)) {
      e.preventDefault(); UI.showView('home'); document.getElementById('chat-input').focus();
    }
  });

  // 10. Share target / query handoff (?q=...)
  const q = new URLSearchParams(location.search).get('q');
  if (q) { UI.showView('home'); setTimeout(() => UI.sendChat(q), 300); history.replaceState(null, '', location.pathname + location.hash); }

  window.Zara = { store: S, ui: UI, ai: window.ZaraAI, intents: window.ZaraIntents, utils: window.ZaraUtils, version: '2.1.0' };
  console.log('%cZara ready', 'color:#ff7a59;font-weight:bold', window.Zara.version);
})();
