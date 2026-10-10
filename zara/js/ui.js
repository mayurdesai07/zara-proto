/* Zara · ui.js — view rendering, modals, chat, toasts */
(function () {
  const S = window.ZaraStore;
  const U = window.ZaraUtils;
  const I = window.ZaraIntents;
  const AI = window.ZaraAI;
  const { icon, hydrate } = window.ZaraIcons;
  const esc = U.esc;
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  const state = { view: 'home', taskFilter: 'pending', eventFilter: 'upcoming', day: new Date().getDay(), noteQuery: '', busy: false };

  /* ───────────── Toasts ───────────── */
  function toast(msg, kind, action) {
    const el = document.createElement('div');
    el.className = `toast ${kind || ''}`;
    el.innerHTML = `${icon(kind === 'err' ? 'alert' : kind === 'ok' ? 'check' : 'info')}<span>${esc(msg)}</span>${action ? `<button type="button">${esc(action.label)}</button>` : ''}`;
    if (action) $('button', el).addEventListener('click', () => { action.fn(); dismiss(); });
    $('#toasts').appendChild(el);
    let gone = false;
    const dismiss = () => { if (gone) return; gone = true; el.classList.add('out'); setTimeout(() => el.remove(), 260); };
    setTimeout(dismiss, action ? 6000 : 3200);
    return dismiss;
  }

  /* ───────────── Modal ───────────── */
  const modal = {
    el: $('#modal'), form: $('#modal-form'), title: $('#modal-title'), del: $('#modal-delete'),
    onSave: null, onDelete: null,
    open(opts) {
      this.title.textContent = opts.title;
      this.form.innerHTML = opts.html;
      hydrate(this.form);
      this.onSave = opts.onSave; this.onDelete = opts.onDelete || null;
      this.del.hidden = !opts.onDelete;
      $('#modal-save').textContent = opts.saveLabel || 'Save';
      this.el.hidden = false;
      if (opts.init) opts.init(this.form);
      const first = this.form.querySelector('input:not([type=hidden]), textarea, select');
      if (first) first.focus({ preventScroll: true });
    },
    close() { this.el.hidden = true; this.form.innerHTML = ''; this.onSave = this.onDelete = null; },
    values() {
      const fd = new FormData(this.form); const o = {};
      fd.forEach((v, k) => { o[k] = typeof v === 'string' ? v.trim() : v; });
      return o;
    },
  };
  modal.form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!modal.onSave) return;
    try { const ok = modal.onSave(modal.values(), modal.form); if (ok !== false) modal.close(); }
    catch (err) { toast(err.message, 'err'); }
  });
  $('#modal-close').addEventListener('click', () => modal.close());
  $('#modal-cancel').addEventListener('click', () => modal.close());
  modal.el.addEventListener('click', (e) => { if (e.target === modal.el) modal.close(); });
  modal.del.addEventListener('click', () => { if (modal.onDelete) { modal.onDelete(); modal.close(); } });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.el.hidden) modal.close(); });

  function confirmDialog(title, text, onYes, danger) {
    modal.open({
      title, saveLabel: danger ? 'Yes, do it' : 'Confirm',
      html: `<p class="hint" style="font-size:.95rem;color:var(--text-2)">${esc(text)}</p>`,
      onSave: () => { onYes(); },
    });
  }

  /* ───────────── Navigation ───────────── */
  const TITLES = {
    home: ['Home', () => `${U.greeting()}, ${(S.getSettings().name || 'there').split(' ')[0]} 👋`],
    tasks: ['Tasks', () => { const n = U.pendingTasks().length; return n ? `${n} pending` : 'All clear'; }],
    schedule: ['Classes', () => `${S.schedule.list().length} classes per week`],
    events: ['Events', () => { const e = U.upcomingEvents(1)[0]; return e ? `Next: ${e.title} ${e.days === 0 ? 'today' : `in ${e.days}d`}` : 'Nothing upcoming'; }],
    memory: ['Memory', () => `${S.memory.list().length} facts about you`],
    notes: ['Notes', () => `${S.notes.list().length} notes`],
    shortcuts: ['Shortcuts', () => 'Quick launch'],
    settings: ['Settings', () => 'Preferences, AI brain, data'],
  };
  function showView(name) {
    if (!TITLES[name]) name = 'home';
    state.view = name;
    $$('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${name}`));
    $$('.nav-btn, .more-item').forEach((b) => b.classList.toggle('active', b.dataset.view === name));
    const moreBtn = $('#more-btn'); if (moreBtn) moreBtn.classList.toggle('active', ['memory', 'notes', 'shortcuts', 'settings'].includes(name));
    $('#view-title').textContent = TITLES[name][0];
    $('#view-sub').textContent = TITLES[name][1]();
    if (location.hash !== `#${name}`) history.replaceState(null, '', `#${name}`);
    render(name);
    window.scrollTo({ top: 0 });
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-view]');
    if (b && !b.closest('.sc')) { e.preventDefault(); showView(b.dataset.view); toggleMore(false); return; }
    if (e.target.closest('#more-btn')) { toggleMore(); return; }
    if (!e.target.closest('#more-sheet')) toggleMore(false);
  });
  function toggleMore(force) {
    const sheet = $('#more-sheet'); const btn = $('#more-btn');
    const open = typeof force === 'boolean' ? force : sheet.hidden;
    sheet.hidden = !open; btn.setAttribute('aria-expanded', String(open));
  }

  /* ───────────── Render dispatcher ───────────── */
  function render(view) {
    view = view || state.view;
    ({ home: renderHome, tasks: renderTasks, schedule: renderSchedule, events: renderEvents, memory: renderMemory, notes: renderNotes, shortcuts: renderShortcuts, settings: renderSettings })[view]();
    const n = U.pendingTasks().filter((t) => t.due && U.daysUntil(t.due) <= 0).length;
    const badge = $('#badge-tasks'); badge.textContent = n; badge.hidden = !n;
    $('#view-sub').textContent = TITLES[state.view][1]();
    hydrate();
  }

  /* ───────────── HOME ───────────── */
  function renderHome() {
    const today = U.todayISO();
    $('#glance-date').textContent = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' });
    const pending = U.pendingTasks(); const cls = U.todayClasses(); const ev = U.upcomingEvents(1)[0];
    $('#stats').innerHTML = `
      <div class="stat"><b>${cls.length}</b><span>classes today</span></div>
      <div class="stat"><b>${pending.filter((t) => t.due && t.due <= today).length}</b><span>due today</span></div>
      <div class="stat"><b>${ev ? ev.days : '—'}</b><span>${ev ? `days to ${esc(ev.title.split(' ')[0])}` : 'no events'}</span></div>`;
    const now = U.nowHHMM();
    $('#home-classes').innerHTML = cls.length ? cls.map((c) => `
      <div class="mini ${c.start <= now && c.end > now ? 'now' : ''}">${icon('clock')}<span class="t"><b>${esc(c.subject)}</b> · ${esc(c.location || '')}</span><span class="m">${U.fmtTime(c.start)}</span></div>`).join('')
      : `<div class="empty">No classes today 🎉</div>`;
    $('#home-tasks').innerHTML = pending.length ? pending.slice(0, 4).map((t) => `
      <div class="mini"><span class="pri" style="background:var(--${t.priority})"></span><span class="t">${esc(t.title)}</span><span class="m">${t.due ? esc(U.relDay(t.due)) : ''}</span></div>`).join('')
      : `<div class="empty">Nothing pending ✨</div>`;
    const evs = U.upcomingEvents(4);
    $('#home-events').innerHTML = evs.length ? evs.map((e) => `
      <div class="mini"><span class="ev-icon">${U.EVENT_TYPES[e.type].emoji}</span><span class="t">${esc(e.title)}</span><span class="m">${e.days === 0 ? 'Today' : e.days === 1 ? 'Tomorrow' : `${e.days}d`}</span></div>`).join('')
      : `<div class="empty">No upcoming events</div>`;
    $('#home-shortcuts').innerHTML = S.shortcuts.list().slice(0, 8).map(scCard).join('') || `<div class="empty">No shortcuts</div>`;
    renderChips();
  }
  function scCard(s, editable) {
    return `<a class="sc" href="${esc(s.url)}" target="_blank" rel="noopener" draggable="${editable ? 'true' : 'false'}" data-id="${s.id}" style="--c:${esc(s.color || '#555')}">
      <span class="ico">${esc(s.emoji || '🔗')}</span><span>${esc(s.name)}</span>${editable ? `<small>${esc(s.url.replace(/^https?:\/\//, ''))}</small><button class="icon-btn sm edit" data-edit="${s.id}" aria-label="Edit">${icon('edit')}</button>` : ''}</a>`;
  }

  /* ───────────── CHAT ───────────── */
  const CHIPS = ["What's pending?", 'Do I have class today?', 'When is my next exam?', "I'm hungry", 'Summary of my day', 'What do you know about me?'];
  function renderChips() {
    $('#chips').innerHTML = CHIPS.map((c) => `<button type="button" class="chip">${esc(c)}</button>`).join('');
  }
  $('#chips').addEventListener('click', (e) => { const c = e.target.closest('.chip'); if (c) sendChat(c.textContent); });

  function md(text) {
    let h = esc(text);
    h = h.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    h = h.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>');
    h = h.replace(/^(?:[-•]\s)(.*)$/gm, '<li>$1</li>').replace(/(<li>[\s\S]*?<\/li>)(\n(?!<li>)|$)/g, '<ul>$1</ul>$2').replace(/<\/li>\n<li>/g, '</li><li>');
    return h;
  }
  function renderChat() {
    const log = $('#chat-log');
    const msgs = S.chat.list();
    if (!msgs.length) {
      const name = (S.getSettings().name || 'there').split(' ')[0];
      log.innerHTML = msgBubble({ role: 'zara', text: `Hi ${name}! I'm Zara 💛 I know your tasks, classes, exams and the things you've told me. Ask me anything — or tap a suggestion below.`, ts: Date.now() });
    } else log.innerHTML = msgs.slice(-80).map(msgBubble).join('');
    hydrate(log);
    log.scrollTop = log.scrollHeight;
  }
  function msgBubble(m) {
    const t = new Date(m.ts || Date.now()).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    const acts = (m.actions || []).map((a) => `<div class="action-tag">${icon(a.error ? 'alert' : 'check')}${esc(a.label)}</div>`).join('');
    const src = m.role === 'zara' && m.source ? ` · ${m.source === 'gemini' ? `Gemini${m.model ? ' · ' + esc(m.model) : ''}` : 'local'}` : '';
    return `<div class="msg ${m.role}">${m.role === 'zara' ? `<span class="mini-avatar"><svg viewBox="0 0 24 24"><path d="M12 2l1.8 5.6L19.5 9l-5.7 1.4L12 16l-1.8-5.6L4.5 9l5.7-1.4z"/></svg></span>` : ''}
      <div><div class="bubble">${md(m.text)}${acts}</div><div class="time">${t}${src}</div></div></div>`;
  }
  function chatModeLabel() {
    const key = !!(S.getSettings().geminiKey || '').trim();
    $('#chat-mode-label').textContent = key ? `Gemini brain · ${S.getSettings().model || 'gemini-1.5-flash'}` : 'Offline brain · add a Gemini key for full AI';
    const st = $('#ai-status'); st.classList.toggle('on', key); $('.ai-status-text', st).textContent = key ? 'Gemini connected' : 'Local brain';
  }
  async function sendChat(text) {
    text = String(text || '').trim();
    if (!text || state.busy) return;
    state.busy = true;
    const input = $('#chat-input'); input.value = '';
    S.chat.add({ role: 'user', text, ts: Date.now() });
    renderChat();
    const log = $('#chat-log');
    log.insertAdjacentHTML('beforeend', `<div class="msg zara typing" id="typing"><span class="mini-avatar"></span><div><div class="bubble"><i></i><i></i><i></i></div></div></div>`);
    log.scrollTop = log.scrollHeight;
    try {
      const r = await AI.handleUserQuery(text);
      S.chat.add({ role: 'zara', text: r.text, ts: Date.now(), actions: r.actions, source: r.source, model: r.model });
      if (r.actions && r.actions.length && r.actions.some((a) => !a.error)) toast(r.actions.filter((a) => !a.error)[0].label, 'ok');
    } catch (e) {
      S.chat.add({ role: 'zara', text: `Something went wrong: ${e.message}`, ts: Date.now() });
    } finally {
      state.busy = false;
      const ty = $('#typing'); if (ty) ty.remove();
      renderChat(); render('home');
      input.focus();
    }
  }
  $('#chat-form').addEventListener('submit', (e) => { e.preventDefault(); sendChat($('#chat-input').value); });
  $('#chat-clear').addEventListener('click', () => confirmDialog('Clear conversation?', 'This removes the chat history on this device. Your tasks, classes and memory are untouched.', () => { S.chat.replace([]); renderChat(); toast('Conversation cleared'); }));

  /* Voice input */
  let recognizer = null;
  const micBtn = $('#mic-btn');
  micBtn.addEventListener('click', () => {
    if (recognizer) { recognizer.stop(); return; }
    const input = $('#chat-input');
    recognizer = AI.createRecognizer({
      onInterim: (t) => { input.value = t; },
      onFinal: (t) => { input.value = t; sendChat(t); },
      onError: (err) => { toast(err === 'not-allowed' ? 'Microphone permission denied' : `Voice error: ${err}`, 'err'); },
      onEnd: () => { recognizer = null; micBtn.classList.remove('listening'); input.placeholder = 'Ask Zara anything…'; },
    });
    if (!recognizer) { toast('Voice input needs Chrome or Edge (Web Speech API)', 'err'); return; }
    try { recognizer.start(); micBtn.classList.add('listening'); input.placeholder = 'Listening…'; }
    catch (e) { recognizer = null; toast('Could not start microphone', 'err'); }
  });

  /* ───────────── TASKS ───────────── */
  function renderTasks() {
    const f = state.taskFilter; const today = U.todayISO();
    $$('#task-filter button').forEach((b) => b.classList.toggle('active', b.dataset.f === f));
    let list = S.tasks.list().sort(U.sortTasks);
    if (f === 'pending') list = list.filter((t) => !t.done);
    if (f === 'today') list = list.filter((t) => !t.done && t.due && t.due <= today);
    if (f === 'high') list = list.filter((t) => !t.done && t.priority === 'high');
    if (f === 'done') list = list.filter((t) => t.done);
    if (f === 'all') list = list.filter((t) => !t.done).concat(list.filter((t) => t.done));
    $('#task-list').innerHTML = list.length ? list.map((t) => {
      const d = t.due ? U.daysUntil(t.due) : null;
      const dueTag = t.done || d === null ? '' : d < 0 ? `<span class="tag overdue">Overdue</span>` : d === 0 ? `<span class="tag today">Today</span>` : '';
      return `<div class="item ${t.done ? 'done' : ''}" data-id="${t.id}">
        <button class="tick ${t.done ? 'on' : ''}" data-toggle="${t.id}" aria-label="Toggle done">${t.done ? icon('check') : ''}</button>
        <div class="body">
          <div class="title">${esc(t.title)}<span class="tag ${t.priority}">${t.priority}</span>${dueTag}</div>
          <div class="meta">${t.due ? `<span>${icon('calendar')}${esc(U.fmtDate(t.due))} · ${esc(U.relDay(t.due))}</span>` : '<span>No due date</span>'}${t.source === 'chat' ? '<span>via chat</span>' : ''}</div>
          ${t.notes ? `<div class="notes">${esc(t.notes)}</div>` : ''}
        </div>
        <div class="actions"><button class="icon-btn sm" data-edit="${t.id}" aria-label="Edit">${icon('edit')}</button></div>
      </div>`;
    }).join('') : `<div class="empty big"><strong>${f === 'done' ? 'Nothing completed yet' : 'No tasks here'}</strong>${f === 'pending' || f === 'all' ? 'Add one with the button above, or tell Zara "remind me to…"' : ''}</div>`;
  }
  $('#task-filter').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { state.taskFilter = b.dataset.f; renderTasks(); hydrate(); } });
  $('#task-add').addEventListener('click', () => taskModal());
  $('#task-list').addEventListener('click', (e) => {
    const tg = e.target.closest('[data-toggle]'); const ed = e.target.closest('[data-edit]');
    if (tg) { const t = S.tasks.get(tg.dataset.toggle); S.tasks.update(t.id, { done: !t.done, completedAt: !t.done ? Date.now() : null }); render(); if (!t.done) toast(`Done: ${t.title}`, 'ok', { label: 'Undo', fn: () => { S.tasks.update(t.id, { done: false }); render(); } }); }
    if (ed) taskModal(S.tasks.get(ed.dataset.edit));
  });
  function taskModal(t) {
    t = t || {};
    modal.open({
      title: t.id ? 'Edit task' : 'New task',
      html: `
        <label class="field"><span>Title</span><input class="input" name="title" required maxlength="140" value="${esc(t.title || '')}" placeholder="Submit DBMS lab sheet"></label>
        <div class="field-row">
          <label class="field"><span>Priority</span><select class="input" name="priority">${['high', 'medium', 'low'].map((p) => `<option value="${p}" ${(t.priority || 'medium') === p ? 'selected' : ''}>${p[0].toUpperCase() + p.slice(1)}</option>`).join('')}</select></label>
          <label class="field"><span>Due date</span><input class="input" type="date" name="due" value="${esc(t.due || '')}"></label>
        </div>
        <label class="field"><span>Notes</span><textarea class="input" name="notes" placeholder="Details, links, what to include…">${esc(t.notes || '')}</textarea></label>
        ${t.id ? `<label class="check"><input type="checkbox" name="done" ${t.done ? 'checked' : ''}> Mark as completed</label>` : ''}`,
      onSave: (v) => {
        if (!v.title) throw new Error('Title is required');
        const patch = { title: v.title, priority: v.priority, due: v.due || null, notes: v.notes, done: v.done === 'on' };
        if (t.id) S.tasks.update(t.id, patch); else S.tasks.add(Object.assign(patch, { source: 'manual' }));
        toast(t.id ? 'Task updated' : 'Task added', 'ok'); render();
      },
      onDelete: t.id ? () => { S.tasks.remove(t.id); toast('Task deleted'); render(); } : null,
    });
  }

  /* ───────────── SCHEDULE ───────────── */
  function renderSchedule() {
    const todayIdx = new Date().getDay();
    $('#day-tabs').innerHTML = [1, 2, 3, 4, 5, 6, 0].map((d) => `<button data-d="${d}" class="${d === state.day ? 'active' : ''} ${d === todayIdx ? 'today' : ''}">${U.DAYS_SHORT[d]}</button>`).join('');
    const list = U.classesOn(state.day); const now = U.nowHHMM(); const isToday = state.day === todayIdx;
    $('#class-list').innerHTML = list.length ? list.map((c) => {
      const live = isToday && c.start <= now && c.end > now;
      const carry = (c.carry || []).map((it, i) => `<button type="button" data-pack="${c.id}" data-i="${i}" class="${(c.packed || []).includes(it) ? 'packed' : ''}">${icon((c.packed || []).includes(it) ? 'check' : 'bag')}${esc(it)}</button>`).join('');
      return `<div class="item ${live ? 'now' : ''}">
        <div class="class-time"><b>${esc(U.fmtTime(c.start))}</b><span>→ ${esc(U.fmtTime(c.end))}</span></div>
        <div class="body">
          <div class="title">${esc(c.subject)}${live ? '<span class="tag today">Now</span>' : ''}</div>
          <div class="meta"><span>${icon('pin')}${esc(c.location || 'TBA')}</span></div>
          ${carry ? `<div class="carry">${carry}</div>` : ''}
        </div>
        <div class="actions"><button class="icon-btn sm" data-edit="${c.id}" aria-label="Edit">${icon('edit')}</button></div>
      </div>`;
    }).join('') : `<div class="empty big"><strong>No classes on ${U.DAYS[state.day]}</strong>Enjoy the free day, or add a class.</div>`;
  }
  $('#day-tabs').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { state.day = Number(b.dataset.d); renderSchedule(); hydrate(); } });
  $('#class-add').addEventListener('click', () => classModal());
  $('#class-list').addEventListener('click', (e) => {
    const ed = e.target.closest('[data-edit]'); const pk = e.target.closest('[data-pack]');
    if (ed) classModal(S.schedule.get(ed.dataset.edit));
    if (pk) {
      const c = S.schedule.get(pk.dataset.pack); const item = c.carry[Number(pk.dataset.i)];
      const packed = new Set(c.packed || []); packed.has(item) ? packed.delete(item) : packed.add(item);
      S.schedule.update(c.id, { packed: [...packed] }); renderSchedule(); hydrate();
    }
  });
  function classModal(c) {
    c = c || { day: state.day, carry: [] };
    let carry = [...(c.carry || [])];
    const renderCarry = (form) => { $('#carry-chips', form).innerHTML = carry.map((it, i) => `<span>${esc(it)}<button type="button" data-rm="${i}" aria-label="Remove">${icon('x')}</button></span>`).join('') || '<span class="hint">Nothing yet</span>'; };
    modal.open({
      title: c.id ? 'Edit class' : 'Add class',
      html: `
        <label class="field"><span>Subject</span><input class="input" name="subject" required maxlength="80" value="${esc(c.subject || '')}" placeholder="DSA Lecture"></label>
        <div class="field-row">
          <label class="field"><span>Day</span><select class="input" name="day">${[1, 2, 3, 4, 5, 6, 0].map((d) => `<option value="${d}" ${Number(c.day) === d ? 'selected' : ''}>${U.DAYS[d]}</option>`).join('')}</select></label>
          <label class="field"><span>Location</span><input class="input" name="location" maxlength="80" value="${esc(c.location || '')}" placeholder="Room 204"></label>
        </div>
        <div class="field-row">
          <label class="field"><span>Starts</span><input class="input" type="time" name="start" required value="${esc(c.start || '09:00')}"></label>
          <label class="field"><span>Ends</span><input class="input" type="time" name="end" required value="${esc(c.end || '10:00')}"></label>
        </div>
        <div class="field"><span>Items to carry</span>
          <div class="input-row"><input class="input" id="carry-input" placeholder="Lab record, ID card…" maxlength="40"><button type="button" class="btn btn-ghost" id="carry-add">${icon('plus')}</button></div>
          <div class="chips-edit" id="carry-chips" style="margin-top:8px"></div>
        </div>`,
      init: (form) => {
        renderCarry(form);
        const add = () => { const v = $('#carry-input', form).value.trim(); if (!v) return; v.split(',').map((s) => s.trim()).filter(Boolean).forEach((s) => { if (!carry.includes(s)) carry.push(s); }); $('#carry-input', form).value = ''; renderCarry(form); hydrate(form); };
        $('#carry-add', form).addEventListener('click', add);
        $('#carry-input', form).addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
        $('#carry-chips', form).addEventListener('click', (e) => { const b = e.target.closest('[data-rm]'); if (b) { carry.splice(Number(b.dataset.rm), 1); renderCarry(form); hydrate(form); } });
      },
      onSave: (v) => {
        if (!v.subject) throw new Error('Subject is required');
        if (v.end <= v.start) throw new Error('End time must be after start time');
        const patch = { subject: v.subject, day: Number(v.day), location: v.location, start: v.start, end: v.end, carry, packed: (c.packed || []).filter((p) => carry.includes(p)) };
        if (c.id) S.schedule.update(c.id, patch); else S.schedule.add(patch);
        state.day = Number(v.day); toast(c.id ? 'Class updated' : 'Class added', 'ok'); render();
      },
      onDelete: c.id ? () => { S.schedule.remove(c.id); toast('Class removed'); render(); } : null,
    });
  }

  /* ───────────── EVENTS ───────────── */
  function renderEvents() {
    const f = state.eventFilter;
    $$('#event-filter button').forEach((b) => b.classList.toggle('active', b.dataset.f === f));
    let list = f === 'past' ? U.pastEvents() : U.upcomingEvents();
    if (f === 'exam') list = list.filter((e) => e.type === 'exam' || e.type === 'viva');
    if (f === 'birthday') list = list.filter((e) => e.type === 'birthday');
    $('#event-list').innerHTML = list.length ? list.map((e) => {
      const T = U.EVENT_TYPES[e.type] || U.EVENT_TYPES.other;
      const cd = e.days < 0 ? `<b>${-e.days}</b><span>days ago</span>` : e.days === 0 ? `<b>Today</b><span>${e.time ? esc(U.fmtTime(e.time)) : '🎯'}</span>` : `<b>${e.days}</b><span>${e.days === 1 ? 'day' : 'days'} left</span>`;
      return `<div class="item">
        <div class="countdown ${e.days < 0 ? 'past' : e.days <= 3 ? 'soon' : ''}">${cd}</div>
        <div class="body">
          <div class="title"><span class="ev-icon">${T.emoji}</span>${esc(e.title)}<span class="tag type">${T.label}</span></div>
          <div class="meta"><span>${icon('calendar')}${esc(U.fmtDate(e.effDate, { weekday: 'long', day: 'numeric', month: 'long' }))}</span>${e.time ? `<span>${icon('clock')}${esc(U.fmtTime(e.time))}</span>` : ''}${e.type === 'birthday' ? '<span>repeats yearly</span>' : ''}</div>
          ${e.notes ? `<div class="notes">${esc(e.notes)}</div>` : ''}
        </div>
        <div class="actions"><button class="icon-btn sm" data-edit="${e.id}" aria-label="Edit">${icon('edit')}</button></div>
      </div>`;
    }).join('') : `<div class="empty big"><strong>${f === 'past' ? 'No past events' : 'Nothing scheduled'}</strong>Add exams, vivas, deadlines or birthdays and Zara will count down for you.</div>`;
  }
  $('#event-filter').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { state.eventFilter = b.dataset.f; renderEvents(); hydrate(); } });
  $('#event-add').addEventListener('click', () => eventModal());
  $('#event-list').addEventListener('click', (e) => { const ed = e.target.closest('[data-edit]'); if (ed) eventModal(S.events.get(ed.dataset.edit)); });
  function eventModal(ev) {
    ev = ev || {};
    modal.open({
      title: ev.id ? 'Edit event' : 'Add event',
      html: `
        <label class="field"><span>Title</span><input class="input" name="title" required maxlength="100" value="${esc(ev.title || '')}" placeholder="DBMS Mid-Term"></label>
        <div class="field-row">
          <label class="field"><span>Type</span><select class="input" name="type">${Object.entries(U.EVENT_TYPES).map(([k, v]) => `<option value="${k}" ${(ev.type || 'exam') === k ? 'selected' : ''}>${v.emoji} ${v.label}</option>`).join('')}</select></label>
          <label class="field"><span>Date</span><input class="input" type="date" name="date" required value="${esc(ev.date || U.todayISO())}"></label>
        </div>
        <label class="field"><span>Time (optional)</span><input class="input" type="time" name="time" value="${esc(ev.time || '')}"></label>
        <label class="field"><span>Notes</span><textarea class="input" name="notes" placeholder="Syllabus, venue, gift ideas…">${esc(ev.notes || '')}</textarea></label>`,
      onSave: (v) => {
        if (!v.title || !v.date) throw new Error('Title and date are required');
        const patch = { title: v.title, type: v.type, date: v.date, time: v.time, notes: v.notes };
        if (ev.id) S.events.update(ev.id, patch); else S.events.add(patch);
        toast(ev.id ? 'Event updated' : 'Event added', 'ok'); render();
      },
      onDelete: ev.id ? () => { S.events.remove(ev.id); toast('Event removed'); render(); } : null,
    });
  }

  /* ───────────── MEMORY ───────────── */
  const MEM_CATS = ['food', 'habit', 'college', 'preference', 'goal', 'personal', 'health', 'social'];
  function renderMemory() {
    const list = S.memory.list();
    $('#memory-list').innerHTML = list.length ? list.map((m) => `<div class="mem" data-edit="${m.id}" tabindex="0"><div class="k">${esc(m.key)}</div><div class="v">${esc(m.value)}</div><span class="c">${esc(m.category || 'personal')}</span></div>`).join('')
      : `<div class="empty big" style="grid-column:1/-1"><strong>Zara doesn't know you yet</strong>Add facts here or tell her in chat: "remember my favourite food is biryani".</div>`;
  }
  $('#memory-add').addEventListener('click', () => memoryModal());
  $('#memory-list').addEventListener('click', (e) => { const el = e.target.closest('[data-edit]'); if (el) memoryModal(S.memory.get(el.dataset.edit)); });
  $('#memory-list').addEventListener('keydown', (e) => { if (e.key === 'Enter') { const el = e.target.closest('[data-edit]'); if (el) memoryModal(S.memory.get(el.dataset.edit)); } });
  function memoryModal(m) {
    m = m || {};
    modal.open({
      title: m.id ? 'Edit memory' : 'Add a fact about you',
      html: `
        <div class="field-row">
          <label class="field"><span>Label</span><input class="input" name="key" required maxlength="50" value="${esc(m.key || '')}" placeholder="Favourite food"></label>
          <label class="field"><span>Category</span><select class="input" name="category">${MEM_CATS.map((c) => `<option value="${c}" ${(m.category || 'personal') === c ? 'selected' : ''}>${c[0].toUpperCase() + c.slice(1)}</option>`).join('')}</select></label>
        </div>
        <label class="field"><span>Value</span><textarea class="input" name="value" required maxlength="300" placeholder="Biryani, extra raita">${esc(m.value || '')}</textarea></label>`,
      onSave: (v) => {
        if (!v.key || !v.value) throw new Error('Label and value are required');
        if (m.id) S.memory.update(m.id, v); else S.memory.add(v);
        toast(m.id ? 'Memory updated' : 'Zara will remember that', 'ok'); render();
      },
      onDelete: m.id ? () => { S.memory.remove(m.id); toast('Forgotten'); render(); } : null,
    });
  }

  /* ───────────── NOTES ───────────── */
  function renderNotes() {
    const q = state.noteQuery.toLowerCase();
    const list = S.notes.list().filter((n) => !q || (n.title + ' ' + n.body).toLowerCase().includes(q)).sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt));
    $('#note-list').innerHTML = list.length ? list.map((n) => `<div class="note" data-edit="${n.id}" tabindex="0"><h4>${esc(n.title)}</h4><p>${esc(n.body)}</p><time>${new Date(n.updatedAt || n.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</time></div>`).join('')
      : `<div class="empty big" style="grid-column:1/-1"><strong>${q ? 'No matches' : 'No notes yet'}</strong>${q ? '' : 'Keep revision notes, links and snippets here. Zara reads them when answering.'}</div>`;
  }
  $('#note-search').addEventListener('input', (e) => { state.noteQuery = e.target.value; renderNotes(); });
  $('#note-add').addEventListener('click', () => noteModal());
  $('#note-list').addEventListener('click', (e) => { const el = e.target.closest('[data-edit]'); if (el) noteModal(S.notes.get(el.dataset.edit)); });
  function noteModal(n) {
    n = n || {};
    modal.open({
      title: n.id ? 'Edit note' : 'New note',
      html: `<label class="field"><span>Title</span><input class="input" name="title" required maxlength="80" value="${esc(n.title || '')}" placeholder="DBMS revision"></label>
             <label class="field"><span>Content</span><textarea class="input" name="body" style="min-height:200px" placeholder="Write anything…">${esc(n.body || '')}</textarea></label>`,
      onSave: (v) => {
        if (!v.title) throw new Error('Title is required');
        if (n.id) S.notes.update(n.id, v); else S.notes.add(v);
        toast(n.id ? 'Note updated' : 'Note saved', 'ok'); render();
      },
      onDelete: n.id ? () => { S.notes.remove(n.id); toast('Note deleted'); render(); } : null,
    });
  }

  /* ───────────── SHORTCUTS ───────────── */
  const EMOJIS = ['💬', '🍔', '🍕', '🚀', '🏫', '📚', '🐙', '✉️', '🎵', '🎬', '🛒', '🏦', '📷', '🧭', '🧠', '💻', '📝', '🎮', '🏃', '☕'];
  function renderShortcuts() {
    const list = S.shortcuts.list();
    $('#shortcut-list').innerHTML = list.length ? list.map((s) => scCard(s, true)).join('') : `<div class="empty big" style="grid-column:1/-1"><strong>No shortcuts</strong>Add your portals and apps for one-tap access.</div>`;
  }
  $('#shortcut-add').addEventListener('click', () => shortcutModal());
  $('#shortcut-list').addEventListener('click', (e) => { const ed = e.target.closest('[data-edit]'); if (ed) { e.preventDefault(); shortcutModal(S.shortcuts.get(ed.dataset.edit)); } });
  // drag reorder
  let dragId = null;
  $('#shortcut-list').addEventListener('dragstart', (e) => { const el = e.target.closest('.sc'); if (!el) return; dragId = el.dataset.id; el.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; });
  $('#shortcut-list').addEventListener('dragend', (e) => { const el = e.target.closest('.sc'); if (el) el.classList.remove('dragging'); });
  $('#shortcut-list').addEventListener('dragover', (e) => { e.preventDefault(); });
  $('#shortcut-list').addEventListener('drop', (e) => {
    e.preventDefault(); const target = e.target.closest('.sc'); if (!target || !dragId || target.dataset.id === dragId) return;
    const list = S.shortcuts.list(); const from = list.findIndex((s) => s.id === dragId); const to = list.findIndex((s) => s.id === target.dataset.id);
    const [moved] = list.splice(from, 1); list.splice(to, 0, moved); S.shortcuts.replace(list); dragId = null; render();
  });
  function shortcutModal(s) {
    s = s || {};
    let emoji = s.emoji || '🔗';
    modal.open({
      title: s.id ? 'Edit shortcut' : 'Add shortcut',
      html: `
        <label class="field"><span>Name</span><input class="input" name="name" required maxlength="30" value="${esc(s.name || '')}" placeholder="College ERP"></label>
        <label class="field"><span>URL</span><input class="input" name="url" type="text" inputmode="url" autocapitalize="off" required value="${esc(s.url || '')}" placeholder="https://"></label>
        <div class="field-row">
          <label class="field"><span>Colour</span><input class="input" type="color" name="color" value="${esc(s.color || '#7c3aed')}" style="padding:4px;height:44px"></label>
          <label class="field"><span>Group</span><select class="input" name="group">${['social', 'food', 'learning', 'college', 'tools', 'other'].map((g) => `<option value="${g}" ${(s.group || 'other') === g ? 'selected' : ''}>${g[0].toUpperCase() + g.slice(1)}</option>`).join('')}</select></label>
        </div>
        <div class="field"><span>Icon</span><div class="emoji-pick" id="emoji-pick">${EMOJIS.map((e) => `<button type="button" data-e="${e}" class="${e === emoji ? 'active' : ''}">${e}</button>`).join('')}</div>
          <input class="input" id="emoji-custom" placeholder="…or type any emoji" maxlength="4" style="margin-top:8px" value="${EMOJIS.includes(emoji) ? '' : esc(emoji)}"></div>`,
      init: (form) => {
        $('#emoji-pick', form).addEventListener('click', (e) => { const b = e.target.closest('[data-e]'); if (!b) return; emoji = b.dataset.e; $$('#emoji-pick button', form).forEach((x) => x.classList.toggle('active', x === b)); $('#emoji-custom', form).value = ''; });
        $('#emoji-custom', form).addEventListener('input', (e) => { if (e.target.value.trim()) { emoji = e.target.value.trim(); $$('#emoji-pick button', form).forEach((x) => x.classList.remove('active')); } });
      },
      onSave: (v) => {
        if (!v.name || !v.url) throw new Error('Name and URL are required');
        if (!/^https?:\/\//i.test(v.url)) v.url = 'https://' + v.url;
        const patch = { name: v.name, url: v.url, color: v.color, group: v.group, emoji };
        if (s.id) S.shortcuts.update(s.id, patch); else S.shortcuts.add(patch);
        toast(s.id ? 'Shortcut updated' : 'Shortcut added', 'ok'); render();
      },
      onDelete: s.id ? () => { S.shortcuts.remove(s.id); toast('Shortcut removed'); render(); } : null,
    });
  }

  /* ───────────── SETTINGS ───────────── */
  function applyTheme(settings) {
    settings = settings || S.getSettings();
    let theme = settings.theme || 'dark';
    if (theme === 'system') theme = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.accent = settings.accent || 'coral';
    $('#theme-toggle').innerHTML = icon(theme === 'dark' ? 'sun' : 'moon');
    const meta = $('meta[name=theme-color]'); if (meta) meta.content = theme === 'dark' ? '#161430' : '#f4f3fb';
  }
  window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => { if (S.getSettings().theme === 'system') applyTheme(); });
  $('#theme-toggle').addEventListener('click', () => {
    const cur = document.documentElement.dataset.theme;
    S.setSettings({ theme: cur === 'dark' ? 'light' : 'dark' }); applyTheme(); if (state.view === 'settings') renderSettings();
  });

  function renderSettings() {
    const s = S.getSettings();
    $('#set-name').value = s.name || ''; $('#set-tone').value = s.tone || 'warm';
    $('#set-key').value = s.geminiKey || ''; $('#set-model').value = s.model || 'gemini-1.5-flash';
    $$('#set-theme button').forEach((b) => b.classList.toggle('active', b.dataset.v === (s.theme || 'dark')));
    $$('#set-accent button').forEach((b) => b.classList.toggle('active', b.dataset.v === (s.accent || 'coral')));
    $('#key-status').textContent = s.geminiKey ? `Key saved locally (${s.geminiKey.slice(0, 6)}…${s.geminiKey.slice(-4)})${S.getMeta().lastWorkingModel ? ` · last working model: ${S.getMeta().lastWorkingModel}` : ''}` : 'No key set — Zara answers with the local engine.';
    $('#key-status').className = 'status';
  }
  $('#set-theme').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { S.setSettings({ theme: b.dataset.v }); applyTheme(); renderSettings(); } });
  $('#set-accent').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { S.setSettings({ accent: b.dataset.v }); applyTheme(); renderSettings(); } });
  $('#key-toggle').addEventListener('click', () => { const i = $('#set-key'); i.type = i.type === 'password' ? 'text' : 'password'; $('#key-toggle').innerHTML = icon(i.type === 'password' ? 'eye' : 'eye-off'); });
  $('#settings-save').addEventListener('click', () => {
    S.setSettings({ name: $('#set-name').value.trim() || 'Friend', tone: $('#set-tone').value, geminiKey: $('#set-key').value.trim(), model: $('#set-model').value });
    toast('Preferences saved', 'ok'); chatModeLabel(); renderSettings(); $('#view-sub').textContent = TITLES.settings[1]();
  });
  $('#key-test').addEventListener('click', async () => {
    const key = $('#set-key').value.trim(); const model = $('#set-model').value; const st = $('#key-status');
    if (!key) { st.textContent = 'Paste a key first.'; st.className = 'status err'; return; }
    st.textContent = 'Testing…'; st.className = 'status';
    try {
      const r = await AI.testKey(key, model);
      st.textContent = `✅ Connected via ${r.model}${r.model !== model ? ` (your selected model wasn't available, auto-switched)` : ''}: "${r.text.trim().slice(0, 60)}"`; st.className = 'status ok';
      if (r.model !== model) { $('#set-model').value = r.model; }
      S.setSettings({ geminiKey: key, model: $('#set-model').value }); chatModeLabel();
    } catch (e) { st.textContent = `❌ ${e.message}`; st.className = 'status err'; }
  });
  $('#key-clear').addEventListener('click', () => { S.setSettings({ geminiKey: '' }); $('#set-key').value = ''; chatModeLabel(); renderSettings(); toast('Gemini key removed'); });

  $('#data-export').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(S.exportAll(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `zara-backup-${U.todayISO()}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    $('#data-status').textContent = 'Backup downloaded.'; $('#data-status').className = 'status ok';
  });
  $('#data-import-file').addEventListener('change', (e) => {
    const f = e.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => { try { S.importAll(JSON.parse(r.result)); applyTheme(); chatModeLabel(); render(); renderChat(); toast('Backup imported', 'ok'); } catch (err) { toast(`Import failed: ${err.message}`, 'err'); } e.target.value = ''; };
    r.readAsText(f);
  });
  $('#data-reseed').addEventListener('click', () => confirmDialog('Restore sample data?', 'This replaces your tasks, classes, events, memory, notes and shortcuts with the built-in samples. Your name and Gemini key are kept.', () => { window.ZaraDefaults.seedAll(true); applyTheme(); render(); renderChat(); toast('Sample data restored', 'ok'); }, true));
  $('#data-reset').addEventListener('click', () => confirmDialog('Erase everything?', 'All Zara data on this device will be deleted, including your Gemini key. This cannot be undone.', () => { S.clearAll(); location.reload(); }, true));

  window.ZaraUI = { state, showView, render, renderChat, sendChat, toast, applyTheme, chatModeLabel, modal };
})();
