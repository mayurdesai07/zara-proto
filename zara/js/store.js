/* Zara · store.js — typed localStorage collections with change events */
(function () {
  const KEYS = {
    settings: 'zara_settings',
    tasks: 'zara_tasks',
    schedule: 'zara_schedule',
    events: 'zara_events',
    memory: 'zara_memory',
    notes: 'zara_documents',
    shortcuts: 'zara_services',
    chat: 'zara_chat',
    meta: 'zara_meta',
  };

  const listeners = new Set();
  const memoryFallback = {};
  let storageOk = true;
  try {
    localStorage.setItem('__zara_probe', '1');
    localStorage.removeItem('__zara_probe');
  } catch (e) {
    storageOk = false;
  }

  function read(key, fallback) {
    try {
      const raw = storageOk ? localStorage.getItem(key) : memoryFallback[key];
      if (raw == null) return fallback;
      return JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  }
  function write(key, value) {
    const raw = JSON.stringify(value);
    try {
      if (storageOk) localStorage.setItem(key, raw);
      else memoryFallback[key] = raw;
    } catch (e) {
      memoryFallback[key] = raw;
    }
    emit(key);
  }
  function emit(key) {
    listeners.forEach((fn) => {
      try { fn(key); } catch (e) { console.error('[Zara store listener]', e); }
    });
  }

  function uid(prefix) {
    return `${prefix || 'id'}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  }

  /** Collection helper: list(), get(id), add(obj), update(id, patch), remove(id), replace(arr) */
  function collection(name) {
    const key = KEYS[name];
    return {
      key,
      list() { return read(key, []); },
      get(id) { return this.list().find((x) => x.id === id) || null; },
      add(obj) {
        const items = this.list();
        const item = Object.assign({ id: uid(name.slice(0, 2)), createdAt: Date.now() }, obj);
        items.push(item);
        write(key, items);
        return item;
      },
      update(id, patch) {
        const items = this.list();
        const i = items.findIndex((x) => x.id === id);
        if (i < 0) return null;
        items[i] = Object.assign({}, items[i], patch, { updatedAt: Date.now() });
        write(key, items);
        return items[i];
      },
      remove(id) {
        const items = this.list().filter((x) => x.id !== id);
        write(key, items);
      },
      replace(arr) { write(key, Array.isArray(arr) ? arr : []); },
    };
  }

  const Store = {
    KEYS,
    uid,
    storageOk,
    tasks: collection('tasks'),
    schedule: collection('schedule'),
    events: collection('events'),
    memory: collection('memory'),
    notes: collection('notes'),
    shortcuts: collection('shortcuts'),
    chat: collection('chat'),

    getSettings() { return read(KEYS.settings, {}); },
    setSettings(patch) {
      const next = Object.assign({}, this.getSettings(), patch);
      write(KEYS.settings, next);
      return next;
    },
    getMeta() { return read(KEYS.meta, {}); },
    setMeta(patch) { write(KEYS.meta, Object.assign({}, this.getMeta(), patch)); },

    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },

    exportAll() {
      const out = { app: 'zara', version: 2, exportedAt: new Date().toISOString(), data: {} };
      Object.entries(KEYS).forEach(([name, key]) => { out.data[name] = read(key, null); });
      return out;
    },
    importAll(payload) {
      if (!payload || typeof payload !== 'object' || !payload.data) throw new Error('Not a Zara backup file');
      Object.entries(KEYS).forEach(([name, key]) => {
        if (payload.data[name] != null) write(key, payload.data[name]);
      });
    },
    clearAll() {
      Object.values(KEYS).forEach((key) => {
        try { localStorage.removeItem(key); } catch (e) { /* ignore */ }
        delete memoryFallback[key];
      });
      emit('*');
    },
  };

  window.ZaraStore = Store;
})();
