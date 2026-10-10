/* Zara · ai.js — Gemini brain with live context injection + structured actions
   Flow: handleUserQuery(text)
           ├─ key present  → callGeminiAI()  → parse <<ACTION>> blocks → run via ZaraIntents
           └─ key missing  → ZaraIntents.handle()  (local rule/intent engine) */
(function () {
  const S = window.ZaraStore;
  const U = window.ZaraUtils;
  const I = window.ZaraIntents;

  const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models/';
  const MODEL_FALLBACKS = ['gemini-1.5-flash', 'gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'];
  const HISTORY_TURNS = 12;

  const TONES = {
    warm: 'Warm, caring and encouraging — like a close friend who genuinely wants the user to do well. Light emoji use is fine.',
    playful: 'Playful, witty and upbeat. Tease gently, keep energy high, use emoji freely.',
    focused: 'Concise and focused. Short sentences, no fluff, minimal emoji. Lead with the answer.',
    formal: 'Polite and professional. No slang, no emoji, complete sentences.',
  };

  /* ───────────── Context builder ───────────── */
  function buildContext() {
    const settings = S.getSettings();
    const now = new Date();
    const today = U.todayISO();
    const tasks = S.tasks.list();
    const pending = tasks.filter((t) => !t.done).sort(U.sortTasks);
    const done = tasks.filter((t) => t.done).slice(-5);
    const todayCls = U.todayClasses();
    const tomorrowCls = U.classesOn((now.getDay() + 1) % 7);
    const week = [1, 2, 3, 4, 5, 6, 0].map((d) => ({ d, list: U.classesOn(d) })).filter((x) => x.list.length);
    const events = U.upcomingEvents(12);
    const memory = S.memory.list();
    const notes = S.notes.list().slice(0, 10);
    const shortcuts = S.shortcuts.list();
    const nx = U.nextClass();

    const taskStr = (t) => `- [${t.priority}] ${t.title}${t.due ? ` (due ${t.due}, ${U.relDay(t.due)}${U.daysUntil(t.due) < 0 ? ', OVERDUE' : ''})` : ''}${t.notes ? ` — ${t.notes}` : ''}`;
    const clsStr = (c) => `  - ${c.start}–${c.end} ${c.subject} @ ${c.location || 'TBA'}${c.carry && c.carry.length ? ` | carry: ${c.carry.join(', ')}` : ''}`;

    return [
      `You are Zara, ${settings.name || 'the user'}'s personal AI companion inside a private offline-first app. You are female, friendly and proactive.`,
      `Tone: ${TONES[settings.tone] || TONES.warm}`,
      `Always answer using the live data below. Never invent tasks, classes or events that are not listed. Keep replies under ~150 words unless asked for detail. Use plain text with light markdown (**bold**, bullet lines starting with "- ").`,
      '',
      `## Now`,
      `Date: ${now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} (${today})`,
      `Time: ${now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} (${U.nowHHMM()}, 24h)`,
      nx ? `Next class: ${nx.cls.subject} ${nx.status === 'now' ? '(IN PROGRESS)' : nx.status === 'today' ? `today at ${nx.cls.start}` : `on ${U.DAYS[nx.day]} at ${nx.cls.start}`}` : 'Next class: none scheduled',
      '',
      `## Pending tasks (${pending.length})`,
      pending.length ? pending.map(taskStr).join('\n') : '- none',
      done.length ? `\n## Recently completed\n${done.map((t) => `- ${t.title}`).join('\n')}` : '',
      '',
      `## Today's classes (${U.DAYS[now.getDay()]})`,
      todayCls.length ? todayCls.map(clsStr).join('\n') : '  - no classes',
      `## Tomorrow's classes (${U.DAYS[(now.getDay() + 1) % 7]})`,
      tomorrowCls.length ? tomorrowCls.map(clsStr).join('\n') : '  - no classes',
      `## Full weekly timetable`,
      week.length ? week.map((w) => `${U.DAYS[w.d]}:\n${w.list.map(clsStr).join('\n')}`).join('\n') : '  - empty',
      '',
      `## Upcoming events & exams`,
      events.length ? events.map((e) => `- ${e.title} [${e.type}] on ${e.effDate}${e.time ? ' ' + e.time : ''} — ${e.days === 0 ? 'TODAY' : e.days === 1 ? 'tomorrow' : `in ${e.days} days`}${e.notes ? ` — ${e.notes}` : ''}`).join('\n') : '- none',
      '',
      `## Personal memory about ${settings.name || 'the user'}`,
      memory.length ? memory.map((m) => `- ${m.key}: ${m.value} (${m.category})`).join('\n') : '- nothing saved yet',
      '',
      `## Notes & documents`,
      notes.length ? notes.map((n) => `- ${n.title}: ${String(n.body).slice(0, 300).replace(/\n/g, ' / ')}`).join('\n') : '- none',
      '',
      `## Quick-launch shortcuts the user has`,
      shortcuts.length ? shortcuts.map((s) => `- ${s.name} → ${s.url}`).join('\n') : '- none',
      '',
      `## Actions you can take`,
      `When the user asks you to add, complete, delete or remember something, DO IT by appending one or more action blocks at the very END of your reply, each on its own line, in exactly this format:`,
      `<<ACTION>>{"type":"add_task","title":"...","priority":"high|medium|low","due":"YYYY-MM-DD or null","notes":""}<<END>>`,
      `<<ACTION>>{"type":"complete_task","title":"<existing task title>"}<<END>>`,
      `<<ACTION>>{"type":"delete_task","title":"<existing task title>"}<<END>>`,
      `<<ACTION>>{"type":"add_event","title":"...","eventType":"exam|viva|deadline|birthday|other","date":"YYYY-MM-DD","time":"HH:MM or empty","notes":""}<<END>>`,
      `<<ACTION>>{"type":"add_memory","key":"short label","value":"...","category":"food|habit|college|preference|goal|personal"}<<END>>`,
      `<<ACTION>>{"type":"add_note","title":"...","body":"..."}<<END>>`,
      `<<ACTION>>{"type":"open_shortcut","name":"<shortcut name>"}<<END>>`,
      `Resolve relative dates ("tomorrow", "next Friday") into YYYY-MM-DD using today's date above. Only emit actions the user clearly asked for. Confirm what you did in your text. Never show the raw action JSON to the user in prose.`,
      `If the user says they are hungry, suggest their favourite food from memory and point them to the food shortcuts.`,
    ].filter((l) => l !== null).join('\n');
  }

  /* ───────────── Gemini call ───────────── */
  async function callGeminiAI(userText, opts) {
    opts = opts || {};
    const settings = S.getSettings();
    const key = (opts.key || settings.geminiKey || '').trim();
    if (!key) throw Object.assign(new Error('No API key'), { code: 'NO_KEY' });

    const preferred = opts.model || settings.model || MODEL_FALLBACKS[0];
    const chain = [preferred].concat(MODEL_FALLBACKS.filter((m) => m !== preferred));
    const history = opts.history === false ? [] : recentHistory();
    const body = {
      systemInstruction: { parts: [{ text: opts.system || buildContext() }] },
      contents: history.concat([{ role: 'user', parts: [{ text: userText }] }]),
      generationConfig: { temperature: 0.7, maxOutputTokens: 800 },
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
      ],
    };

    let lastErr = null;
    for (const model of chain) {
      const url = `${API_BASE}${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), opts.timeout || 30000);
      try {
        const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctrl.signal });
        clearTimeout(timer);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          const msg = (data.error && data.error.message) || `HTTP ${res.status}`;
          const err = Object.assign(new Error(msg), { status: res.status, model });
          // 404 = model retired/unknown → try next model; 400 w/ API key message, 401/403 = bad key → stop.
          if (res.status === 404 || /not found|not supported|deprecated/i.test(msg)) { lastErr = err; continue; }
          if (res.status === 400 && /api key/i.test(msg)) err.code = 'BAD_KEY';
          if (res.status === 401 || res.status === 403) err.code = 'BAD_KEY';
          if (res.status === 429) err.code = 'RATE_LIMIT';
          throw err;
        }
        const cand = data.candidates && data.candidates[0];
        const text = cand && cand.content && cand.content.parts ? cand.content.parts.map((p) => p.text || '').join('') : '';
        if (!text) {
          const reason = (cand && cand.finishReason) || (data.promptFeedback && data.promptFeedback.blockReason) || 'empty response';
          throw Object.assign(new Error(`Gemini returned no text (${reason})`), { code: 'EMPTY' });
        }
        if (model !== preferred) S.setMeta({ lastWorkingModel: model });
        return { text, model };
      } catch (e) {
        clearTimeout(timer);
        if (e.name === 'AbortError') { lastErr = Object.assign(new Error('Gemini timed out'), { code: 'TIMEOUT' }); break; }
        if (e.code || e.status) { if (e.status === 404) { lastErr = e; continue; } throw e; }
        lastErr = Object.assign(new Error('Network error reaching Gemini'), { code: 'NETWORK' });
        break;
      }
    }
    throw lastErr || new Error('Gemini request failed');
  }

  function recentHistory() {
    const msgs = S.chat.list().filter((m) => !m.system && m.text).slice(-HISTORY_TURNS);
    return msgs.map((m) => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.text }] }));
  }

  /* ───────────── Action parsing ───────────── */
  function extractActions(text) {
    const actions = []; let clean = text;
    const re = /<<ACTION>>([\s\S]*?)<<END>>/g; let m;
    while ((m = re.exec(text))) {
      try { actions.push(JSON.parse(m[1].trim())); } catch (e) { console.warn('[Zara] bad action JSON', m[1]); }
    }
    clean = clean.replace(re, '').replace(/```json[\s\S]*?```/g, '').trim();
    return { clean, actions };
  }

  /* ───────────── Public entry ───────────── */
  async function handleUserQuery(text) {
    const settings = S.getSettings();
    const hasKey = !!(settings.geminiKey || '').trim();
    if (!hasKey) {
      const r = I.handle(text);
      return { text: r.text, actions: r.actions || [], source: 'local', intent: r.intent };
    }
    try {
      const { text: raw, model } = await callGeminiAI(text);
      const { clean, actions } = extractActions(raw);
      const results = [];
      for (const a of actions) {
        try { results.push(I.runAction(a)); } catch (e) { results.push({ label: `Couldn't ${a.type}: ${e.message}`, error: true }); }
      }
      return { text: clean || (results.length ? 'Done.' : '…'), actions: results, source: 'gemini', model };
    } catch (e) {
      console.warn('[Zara] Gemini failed, using local engine:', e);
      const r = I.handle(text);
      const note = e.code === 'BAD_KEY' ? ' (Your Gemini key was rejected — check Settings.)'
        : e.code === 'RATE_LIMIT' ? ' (Gemini rate limit hit — try again in a minute.)'
        : e.code === 'NETWORK' || e.code === 'TIMEOUT' ? ' (Offline — answered locally.)' : '';
      return { text: r.text + (r.intent === 'fallback' ? '' : note), actions: r.actions || [], source: 'local-fallback', intent: r.intent, error: e.message };
    }
  }

  async function testKey(key, model) {
    const r = await callGeminiAI('Reply with exactly: Zara online', { key, model, history: false, system: 'You are a connectivity probe. Reply with exactly the text requested.', timeout: 15000 });
    return r;
  }

  /* ───────────── Speech-to-text (Web Speech API) ───────────── */
  function createRecognizer(handlers) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return null;
    const rec = new SR();
    rec.lang = navigator.language || 'en-IN';
    rec.interimResults = true; rec.continuous = false; rec.maxAlternatives = 1;
    rec.onresult = (ev) => {
      let interim = '', final = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const t = ev.results[i][0].transcript;
        if (ev.results[i].isFinal) final += t; else interim += t;
      }
      if (final && handlers.onFinal) handlers.onFinal(final.trim());
      else if (interim && handlers.onInterim) handlers.onInterim(interim.trim());
    };
    rec.onerror = (ev) => handlers.onError && handlers.onError(ev.error || 'speech error');
    rec.onend = () => handlers.onEnd && handlers.onEnd();
    return rec;
  }

  window.ZaraAI = { buildContext, callGeminiAI, handleUserQuery, extractActions, testKey, createRecognizer, MODEL_FALLBACKS };
})();
