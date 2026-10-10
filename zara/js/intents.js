/* Zara · intents.js — offline rule/intent engine + shared action executor
   Used (a) as the full brain when no Gemini key is set, (b) to execute
   structured actions that Gemini requests, (c) for instant local commands. */
(function () {
  const S = window.ZaraStore;
  const U = window.ZaraUtils;

  /* ───────────── Natural-language date parsing (small but useful) ───────────── */
  function parseDateFromText(text) {
    const t = text.toLowerCase();
    const today = U.parseISO(U.todayISO());
    const add = (n) => { const d = new Date(today); d.setDate(d.getDate() + n); return U.todayISO(d); };
    if (/\b(day after tomorrow)\b/.test(t)) return add(2);
    if (/\btomorrow\b|\btmrw\b/.test(t)) return add(1);
    if (/\btoday\b|\btonight\b|\bby (evening|noon|5 ?pm|eod)\b/.test(t)) return add(0);
    let m = t.match(/\bin (\d+) days?\b/); if (m) return add(Number(m[1]));
    m = t.match(/\bin (a|one|1) week\b/); if (m) return add(7);
    m = t.match(/\bnext (sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|wed|thu|fri|sat)\b/) ||
        t.match(/\b(?:on|by|this)?\s*(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/);
    if (m) {
      const idx = U.DAYS.findIndex((d) => d.toLowerCase().startsWith(m[1].slice(0, 3)));
      let diff = (idx - today.getDay() + 7) % 7; if (diff === 0) diff = 7;
      return add(diff);
    }
    m = t.match(/\b(\d{4})-(\d{2})-(\d{2})\b/); if (m) return m[0];
    m = t.match(/\b(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{2,4}))?\b/);
    if (m) {
      let y = m[3] ? Number(m[3]) : today.getFullYear(); if (y < 100) y += 2000;
      return `${y}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
    }
    const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    m = t.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/) ||
        t.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{1,2})(?:st|nd|rd|th)?\b/);
    if (m) {
      const dayNum = Number(isNaN(Number(m[1])) ? m[2] : m[1]);
      const monName = isNaN(Number(m[1])) ? m[1] : m[2];
      const mi = months.indexOf(monName.slice(0, 3));
      let y = today.getFullYear();
      const d = new Date(y, mi, dayNum); if (d < today) d.setFullYear(y + 1);
      return U.todayISO(d);
    }
    return null;
  }
  function parseTimeFromText(text) {
    const m = text.toLowerCase().match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/) || text.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
    if (!m) return '';
    let h = Number(m[1]); const min = m[2] ? Number(m[2]) : 0;
    if (m[3]) { if (m[3] === 'pm' && h < 12) h += 12; if (m[3] === 'am' && h === 12) h = 0; }
    return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
  }
  function detectPriority(text) {
    const t = text.toLowerCase();
    if (/\b(urgent|asap|important|high priority|critical|must)\b/.test(t)) return 'high';
    if (/\b(low priority|whenever|someday|optional|minor)\b/.test(t)) return 'low';
    return 'medium';
  }
  function cleanTaskTitle(raw) {
    let s = raw
      .replace(/^(hey |hi |ok |okay )?(zara[,!]?\s*)?/i, '')
      .replace(/^(please\s+)?(remind me to|remind me|add (a )?(new )?task(?: to)?|add (an )?assignment(?: to)?|create (a )?task(?: to)?|new task[:\s]*|todo[:\s]*|i need to|i have to|note that i (need|have) to)\s*/i, '')
      .replace(/\b(by|before|on|at|until|till)\s+(tomorrow|today|tonight|tmrw|day after tomorrow|next \w+|this \w+|\d{1,2}(:\d{2})?\s*(am|pm)|\d{1,2}[\/-]\d{1,2}([\/-]\d{2,4})?|\d{1,2}(st|nd|rd|th)?\s+\w+|(sun|mon|tues|wednes|thurs|fri|satur)day|eod|evening|noon)\b.*$/i, '')
      .replace(/\b(urgent|asap|high priority|low priority)\b/gi, '')
      .replace(/\s{2,}/g, ' ').trim().replace(/[.!]+$/, '');
    if (s) s = s[0].toUpperCase() + s.slice(1);
    return s;
  }

  /* ───────────── Action executor (shared with Gemini) ───────────── */
  const ACTIONS = {
    add_task(p) {
      if (!p.title) throw new Error('Task needs a title');
      const t = S.tasks.add({ title: String(p.title).slice(0, 140), priority: ['high', 'medium', 'low'].includes(p.priority) ? p.priority : 'medium', due: p.due || null, notes: p.notes || '', done: false, source: 'chat' });
      return { label: `Task added: ${t.title}`, item: t };
    },
    complete_task(p) {
      const t = findTask(p.title || p.query);
      if (!t) throw new Error(`I couldn't find a task matching "${p.title || p.query}"`);
      S.tasks.update(t.id, { done: true, completedAt: Date.now() });
      return { label: `Marked done: ${t.title}`, item: t };
    },
    delete_task(p) {
      const t = findTask(p.title || p.query);
      if (!t) throw new Error(`I couldn't find a task matching "${p.title || p.query}"`);
      S.tasks.remove(t.id);
      return { label: `Deleted task: ${t.title}`, item: t };
    },
    add_event(p) {
      if (!p.title || !p.date) throw new Error('Event needs a title and a date');
      const kind = p.eventType || p.kind || p.category;
      const e = S.events.add({ title: String(p.title).slice(0, 140), type: U.EVENT_TYPES[kind] ? kind : 'other', date: p.date, time: p.time || '', notes: p.notes || '' });
      return { label: `Event added: ${e.title} · ${U.fmtDate(e.date)}`, item: e };
    },
    add_memory(p) {
      if (!p.value) throw new Error('Memory needs a value');
      const m = S.memory.add({ category: p.category || 'personal', key: p.key || 'Note', value: String(p.value).slice(0, 300) });
      return { label: `Remembered: ${m.key} — ${m.value}`, item: m };
    },
    add_note(p) {
      if (!p.body && !p.title) throw new Error('Note is empty');
      const n = S.notes.add({ title: p.title || 'Quick note', body: p.body || '' });
      return { label: `Note saved: ${n.title}`, item: n };
    },
    open_shortcut(p) {
      const sc = findShortcut(p.name || p.query);
      if (!sc) throw new Error(`No shortcut named "${p.name || p.query}"`);
      window.open(sc.url, '_blank', 'noopener');
      return { label: `Opened ${sc.name}`, item: sc };
    },
  };
  function findTask(q) {
    if (!q) return null;
    const ql = String(q).toLowerCase();
    const list = S.tasks.list().filter((t) => !t.done).concat(S.tasks.list().filter((t) => t.done));
    return list.find((t) => t.title.toLowerCase() === ql) ||
      list.find((t) => t.title.toLowerCase().includes(ql)) ||
      list.find((t) => ql.split(/\s+/).filter((w) => w.length > 3).some((w) => t.title.toLowerCase().includes(w))) || null;
  }
  function findShortcut(q) {
    if (!q) return null;
    const ql = String(q).toLowerCase().replace(/\s+/g, '');
    return S.shortcuts.list().find((s) => s.name.toLowerCase().replace(/\s+/g, '') === ql) ||
      S.shortcuts.list().find((s) => s.name.toLowerCase().replace(/\s+/g, '').includes(ql) || ql.includes(s.name.toLowerCase().replace(/\s+/g, ''))) || null;
  }
  function runAction(action) {
    const fn = ACTIONS[action && action.type];
    if (!fn) throw new Error(`Unknown action ${action && action.type}`);
    return fn(action);
  }

  /* ───────────── Formatting helpers for answers ───────────── */
  const PRI = { high: '🔴', medium: '🟡', low: '🔵' };
  function taskLine(t) {
    const due = t.due ? ` · ${U.relDay(t.due)}` : '';
    const over = t.due && U.daysUntil(t.due) < 0 && !t.done ? ' ⚠️ overdue' : '';
    return `${PRI[t.priority] || '•'} ${t.title}${due}${over}`;
  }
  function classLine(c) {
    const carry = c.carry && c.carry.length ? ` — carry: ${c.carry.join(', ')}` : '';
    return `• ${U.fmtTime(c.start)}–${U.fmtTime(c.end)} **${c.subject}** @ ${c.location || 'TBA'}${carry}`;
  }
  function eventLine(e) {
    const em = (U.EVENT_TYPES[e.type] || U.EVENT_TYPES.other).emoji;
    const when = e.days === 0 ? 'today' : e.days === 1 ? 'tomorrow' : `in ${e.days} days`;
    return `${em} **${e.title}** — ${U.fmtDate(e.effDate)}${e.time ? ' ' + U.fmtTime(e.time) : ''} (${when})`;
  }
  function name() { return (S.getSettings().name || 'there').split(' ')[0]; }

  /* ───────────── Intent handlers (ordered by specificity) ───────────── */
  const INTENTS = [
    {
      id: 'greeting',
      test: (t) => /^(hi|hello|hey|yo|hola|namaste|good (morning|afternoon|evening|night))\b[\s!.,]*(zara)?[\s!.,]*$/i.test(t),
      run() {
        const pending = U.pendingTasks().length; const nx = U.nextClass();
        let s = `${U.greeting()}, ${name()}! 💛 `;
        s += pending ? `You have ${pending} pending task${pending > 1 ? 's' : ''}` : 'Your task list is clear';
        if (nx && nx.status === 'now') s += `, and you're in ${nx.cls.subject} right now.`;
        else if (nx && nx.status === 'today') s += `, and ${nx.cls.subject} is at ${U.fmtTime(nx.cls.start)}.`;
        else s += '.';
        return { text: s + ' What can I do for you?' };
      },
    },
    {
      id: 'thanks',
      test: (t) => /^(thanks|thank you|thx|ty|great|awesome|nice|cool|perfect)\b/i.test(t),
      run: () => ({ text: `Anytime, ${name()} 😊` }),
    },
    {
      id: 'add_task',
      test: (t) => /\b(remind me|add (a |an |new )?(task|assignment|todo)|create (a )?task|new task|i need to|i have to|todo:)/i.test(t),
      run(t) {
        const title = cleanTaskTitle(t);
        if (!title) return { text: 'What should I add? Try: "remind me to submit the lab sheet by tomorrow".' };
        const due = parseDateFromText(t);
        const res = runAction({ type: 'add_task', title, due, priority: detectPriority(t) });
        return { text: `Done ✅ I added **${title}**${due ? ` due ${U.relDay(due)}` : ''} (${detectPriority(t)} priority).`, actions: [res] };
      },
    },
    {
      id: 'complete_task',
      test: (t) => /\b(mark|set)\b.*\b(done|complete|completed|finished)\b|\b(i (have |just )?(finished|completed|submitted|did))\b|\bdone with\b|\bcomplete(d)? (the )?task\b/i.test(t),
      run(t) {
        const q = t.replace(/\b(mark|set|as|done|complete(d)?|finished|i|have|just|submitted|did|the|task|with|my)\b/gi, ' ').replace(/\s+/g, ' ').trim();
        const task = findTask(q);
        if (!task) return { text: `I couldn't find a pending task matching "${q}". Here's what's open:\n${U.pendingTasks().map(taskLine).join('\n') || '(nothing)'}` };
        const res = runAction({ type: 'complete_task', title: task.title });
        return { text: `Nice work 🎉 Marked **${task.title}** as done.`, actions: [res] };
      },
    },
    {
      id: 'delete_task',
      test: (t) => /\b(delete|remove|cancel)\b.*\b(task|reminder|assignment)\b|\b(delete|remove) (the )?task\b/i.test(t),
      run(t) {
        const q = t.replace(/\b(delete|remove|cancel|the|task|reminder|assignment|my|please)\b/gi, ' ').replace(/\s+/g, ' ').trim();
        const task = findTask(q);
        if (!task) return { text: `No task matches "${q}".` };
        const res = runAction({ type: 'delete_task', title: task.title });
        return { text: `Removed **${task.title}**.`, actions: [res] };
      },
    },
    {
      id: 'tasks_today',
      test: (t) => /\b(task|assignment|homework|submit|pending|due|todo|to-do|to do)s?\b.*\b(today|tonight)\b|\b(today|tonight)\b.*\b(task|assignment|homework|submit|pending|due)s?\b/i.test(t),
      run() {
        const today = U.todayISO();
        const list = U.pendingTasks().filter((x) => x.due && x.due <= today);
        if (!list.length) return { text: `Nothing is due today, ${name()} — nice. Here's what's coming up:\n${U.pendingTasks().slice(0, 4).map(taskLine).join('\n') || '(nothing pending)'}` };
        return { text: `Due today${list.some((x) => x.due < today) ? ' (incl. overdue)' : ''}:\n${list.map(taskLine).join('\n')}` };
      },
    },
    {
      id: 'tasks_pending',
      test: (t) => /\b(task|assignment|homework|todo|to-do|to do|pending|backlog|what('?s| is) (pending|left|open|due))\b/i.test(t) && !/\b(add|new|create|delete|remove)\b/i.test(t),
      run() {
        const list = U.pendingTasks();
        if (!list.length) return { text: 'Your task list is empty 🎉 Want me to add something?' };
        const high = list.filter((x) => x.priority === 'high').length;
        return { text: `You have ${list.length} pending task${list.length > 1 ? 's' : ''}${high ? ` (${high} high priority)` : ''}:\n${list.map(taskLine).join('\n')}` };
      },
    },
    {
      id: 'carry',
      test: (t) => /\b(what|anything|things|items?|stuff)\b.*\b(carry|bring|take|pack)\b|\b(carry|bring|pack)\b.*\b(class|lab|today|tomorrow)\b/i.test(t),
      run(t) {
        const dayOffset = /tomorrow/i.test(t) ? 1 : 0;
        const day = (new Date().getDay() + dayOffset) % 7;
        const list = U.classesOn(day);
        if (!list.length) return { text: `No classes ${dayOffset ? 'tomorrow' : 'today'}, so nothing to pack 🎒` };
        const items = [...new Set(list.flatMap((c) => c.carry || []))];
        return { text: `For ${dayOffset ? 'tomorrow' : 'today'} (${U.DAYS[day]}) pack: **${items.join(', ') || 'nothing special'}**.\n${list.map(classLine).join('\n')}` };
      },
    },
    {
      id: 'next_class',
      test: (t) => /\b(next|upcoming|now|current)\b.*\b(class|lecture|lab|period)\b|\b(class|lecture|lab)\b.*\bnext\b|\bwhere (do|should) i (go|be)\b/i.test(t),
      run() {
        const nx = U.nextClass();
        if (!nx) return { text: 'No classes on your timetable yet. Add some from the Classes tab.' };
        if (nx.status === 'now') return { text: `You're in **${nx.cls.subject}** right now (${U.fmtTime(nx.cls.start)}–${U.fmtTime(nx.cls.end)}, ${nx.cls.location}).` };
        if (nx.status === 'today') return { text: `Next up today: ${classLine(nx.cls).slice(2)}` };
        return { text: `No more classes today. Next is **${nx.cls.subject}** on ${U.DAYS[nx.day]} at ${U.fmtTime(nx.cls.start)} (${nx.cls.location}).` };
      },
    },
    {
      id: 'schedule',
      test: (t) => /\b(class|classes|lecture|lab|timetable|time table|schedule|period)s?\b/i.test(t) && !/\b(add|new|create)\b/i.test(t),
      run(t) {
        const tl = t.toLowerCase();
        let day = new Date().getDay(); let label = 'today';
        if (/tomorrow|tmrw/.test(tl)) { day = (day + 1) % 7; label = 'tomorrow'; }
        const dm = tl.match(/\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/);
        if (dm) { day = U.DAYS.findIndex((d) => d.toLowerCase() === dm[1]); label = `on ${U.DAYS[day]}`; }
        if (/\b(week|whole|all|full)\b/.test(tl)) {
          const all = [1, 2, 3, 4, 5, 6, 0].map((d) => { const l = U.classesOn(d); return l.length ? `**${U.DAYS[d]}**\n${l.map(classLine).join('\n')}` : null; }).filter(Boolean);
          return { text: all.length ? `Your week:\n${all.join('\n\n')}` : 'Your timetable is empty.' };
        }
        const list = U.classesOn(day);
        const afternoon = /afternoon|after lunch|post lunch/.test(tl) ? list.filter((c) => c.start >= '12:00') : null;
        const morning = /morning|before lunch/.test(tl) ? list.filter((c) => c.start < '12:00') : null;
        const sel = afternoon || morning || list;
        const part = afternoon ? ' in the afternoon' : morning ? ' in the morning' : '';
        if (!sel.length) return { text: `No classes ${label}${part} 🎉` };
        return { text: `Classes ${label}${part} (${U.DAYS[day]}):\n${sel.map(classLine).join('\n')}` };
      },
    },
    {
      id: 'add_event',
      test: (t) => /\b(add|create|set|schedule|note)\b.*\b(exam|viva|event|deadline|birthday|test)\b|\b(exam|viva|birthday|deadline)\b.*\b(is on|on the|is next)\b/i.test(t),
      run(t) {
        const date = parseDateFromText(t);
        if (!date) return { text: 'When is it? Say something like "add DBMS exam on 24 Oct" or "Priya\'s birthday is next Friday".' };
        const type = /\bexam|test\b/i.test(t) ? 'exam' : /\bviva\b/i.test(t) ? 'viva' : /\bbirthday|bday\b/i.test(t) ? 'birthday' : /\bdeadline|submission|due\b/i.test(t) ? 'deadline' : 'other';
        let title = t.replace(/^(hey |hi |ok )?(zara[,!]?\s*)?/i, '').replace(/^(please\s+)?(add|create|set|schedule|note)\s+(an?\s+|the\s+)?(event\s+)?/i, '')
          .replace(/\b(is|on|next|this|by|at|for)\s+(the\s+)?(tomorrow|today|next \w+|\d{1,2}(:\d{2})?\s*(am|pm)|\d{1,2}[\/-]\d{1,2}([\/-]\d{2,4})?|\d{1,2}(st|nd|rd|th)?\s+\w+|\w+\s+\d{1,2}(st|nd|rd|th)?|(sun|mon|tues|wednes|thurs|fri|satur)day).*$/i, '')
          .replace(/\s{2,}/g, ' ').trim().replace(/[.!]+$/, '');
        if (!title) title = `${U.EVENT_TYPES[type].label}`;
        title = title[0].toUpperCase() + title.slice(1);
        const res = runAction({ type: 'add_event', title, eventType: type, date, time: parseTimeFromText(t) });
        return { text: `Added ${U.EVENT_TYPES[type].emoji} **${title}** on ${U.fmtDate(date)} (${U.relDay(date)}).`, actions: [res] };
      },
    },
    {
      id: 'exams',
      test: (t) => /\b(exam|exams|viva|test|mid[- ]?term|midterm|semester|internal)s?\b/i.test(t),
      run(t) {
        const list = U.upcomingEvents().filter((e) => e.type === 'exam' || e.type === 'viva');
        if (!list.length) return { text: 'No exams or vivas scheduled 🎉 Add one from the Events tab or say "add DBMS exam on 24 Oct".' };
        const subj = t.toLowerCase().match(/\b(dbms|dsa|os|operating systems|maths?|discrete|react|java|python|c\+\+|physics|chemistry)\b/);
        const filtered = subj ? list.filter((e) => e.title.toLowerCase().includes(subj[1])) : list;
        const sel = filtered.length ? filtered : list;
        return { text: `${sel.length === 1 ? 'Your next exam' : 'Upcoming exams'}:\n${sel.map(eventLine).join('\n')}${sel[0].days <= 3 ? '\n\nThat\'s close — want me to add a revision task?' : ''}` };
      },
    },
    {
      id: 'birthdays',
      test: (t) => /\b(birthday|bday|birthdays)\b/i.test(t),
      run() {
        const list = U.upcomingEvents().filter((e) => e.type === 'birthday');
        return { text: list.length ? `Upcoming birthdays:\n${list.map(eventLine).join('\n')}` : 'No birthdays saved yet.' };
      },
    },
    {
      id: 'events',
      test: (t) => /\b(event|events|deadline|deadlines|countdown|coming up|upcoming|what('?s| is) (next|coming)|this week|reminders?)\b/i.test(t),
      run() {
        const list = U.upcomingEvents(8);
        return { text: list.length ? `Coming up:\n${list.map(eventLine).join('\n')}` : 'Nothing on the horizon. Enjoy the calm ☀️' };
      },
    },
    {
      id: 'hungry',
      test: (t) => /\b(hungry|food|eat|order|dinner|lunch|breakfast|snack|starving|swiggy|zomato|pizza|biryani)\b/i.test(t) && !/\b(favou?rite|fav|what do you know|remember)\b/i.test(t),
      run() {
        const fav = S.memory.list().find((m) => /food|dish|eat|cuisine/i.test(m.key + ' ' + m.category));
        const food = S.shortcuts.list().filter((s) => s.group === 'food' || /swiggy|zomato|food|eat/i.test(s.name));
        const h = new Date().getHours();
        const meal = h < 11 ? 'breakfast' : h < 16 ? 'lunch' : h < 19 ? 'a snack' : 'dinner';
        let s = `Time for ${meal}, ${name()} 🍽️ `;
        if (fav) s += `You love ${fav.value} — that sounds like a plan. `;
        if (food.length) s += `Tap to order: ${food.map((f) => `[${f.emoji} ${f.name}](${f.url})`).join(' · ')}`;
        return { text: s, shortcuts: food };
      },
    },
    {
      id: 'open',
      test: (t) => /^(open|launch|go to|start|take me to)\s+/i.test(t),
      run(t) {
        const q = t.replace(/^(open|launch|go to|start|take me to)\s+(the\s+)?/i, '').replace(/\b(portal|app|website|site)\b/gi, '').trim();
        const sc = findShortcut(q);
        if (!sc) return { text: `I don't have a shortcut for "${q}". Add it from the Shortcuts tab.` };
        const res = runAction({ type: 'open_shortcut', name: sc.name });
        return { text: `Opening ${sc.emoji} **${sc.name}** → ${sc.url}`, actions: [res] };
      },
    },
    {
      id: 'remember',
      test: (t) => /^(remember|note|save|keep in mind|fyi)\b|\b(remember that|my (favou?rite|fav)|i (like|love|prefer|hate|am|'m)\b)/i.test(t) && !/\b(what|do you)\b/i.test(t),
      run(t) {
        const value = t.replace(/^(hey |hi |ok )?(zara[,!]?\s*)?/i, '').replace(/^(please\s+)?(remember that|remember|note that|note|save that|save|keep in mind that|keep in mind|fyi)[,:\s]*/i, '').trim().replace(/[.!]+$/, '');
        if (!value) return { text: 'What should I remember?' };
        const fm = value.match(/^my (favou?rite|fav) ([\w ]+?) (is|are) (.+)$/i);
        const key = fm ? `Favourite ${fm[2]}` : /\b(like|love|prefer|enjoy)\b/i.test(value) ? 'Likes' : /\b(hate|dislike)\b/i.test(value) ? 'Dislikes' : 'Personal fact';
        const cat = /food|eat|dish|drink|coffee|tea|biryani|pizza/i.test(value) ? 'food' : /study|wake|sleep|routine|habit|morning|night/i.test(value) ? 'habit' : /college|course|semester|branch/i.test(value) ? 'college' : 'personal';
        const res = runAction({ type: 'add_memory', key, value: fm ? fm[4] : value, category: cat });
        return { text: `Got it, I'll remember that 🧠 (${key}: ${fm ? fm[4] : value})`, actions: [res] };
      },
    },
    {
      id: 'memory_query',
      test: (t) => /\b(what do you (know|remember)|tell me about me|about me|my (preferences|habits|profile)|what('?s| is) my (favou?rite|fav)|do you (know|remember) (me|my))\b/i.test(t),
      run(t) {
        const list = S.memory.list();
        if (!list.length) return { text: "I don't know much yet. Tell me things like \"remember my favourite food is biryani\"." };
        const fm = t.match(/favou?rite\s+(\w+)/i);
        if (fm) {
          const hit = list.find((m) => m.key.toLowerCase().includes(fm[1].toLowerCase()) || m.value.toLowerCase().includes(fm[1].toLowerCase()));
          if (hit) return { text: `Your ${hit.key.toLowerCase()}: **${hit.value}**` };
        }
        return { text: `Here's what I know about you, ${name()}:\n${list.map((m) => `• **${m.key}:** ${m.value}`).join('\n')}` };
      },
    },
    {
      id: 'notes',
      test: (t) => /\b(note|notes|document|docs)\b/i.test(t) && !/\b(add|save|new)\b/i.test(t),
      run(t) {
        const list = S.notes.list();
        if (!list.length) return { text: 'No notes yet. Create one from the Notes tab or say "note: ...".' };
        const q = t.toLowerCase().replace(/\b(show|my|the|note|notes|about|on|open|read|what|is|in)\b/g, ' ').trim();
        const hit = q && list.find((n) => (n.title + ' ' + n.body).toLowerCase().includes(q));
        if (hit) return { text: `**${hit.title}**\n${hit.body}` };
        return { text: `Your notes:\n${list.map((n) => `• ${n.title}`).join('\n')}\nAsk "show my <title> note" to read one.` };
      },
    },
    {
      id: 'time',
      test: (t) => /\b(what|current)\b.*\b(time|date|day)\b|^(time|date)\??$/i.test(t),
      run() { const d = new Date(); return { text: `It's ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} on ${d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}.` }; },
    },
    {
      id: 'summary',
      test: (t) => /\b(summary|summarize|brief|briefing|my day|plan my day|what should i do|overview|status|how('?s| is) my day)\b/i.test(t),
      run() { return { text: dailyBrief() }; },
    },
    {
      id: 'help',
      test: (t) => /\b(help|what can you do|commands|features|how do (i|you))\b/i.test(t),
      run: () => ({ text: helpText() }),
    },
  ];

  function dailyBrief() {
    const today = U.todayISO();
    const cls = U.todayClasses(); const tasks = U.pendingTasks(); const ev = U.upcomingEvents(3);
    const due = tasks.filter((x) => x.due && x.due <= today);
    const lines = [`${U.greeting()}, ${name()}! Here's your day:`];
    lines.push(cls.length ? `📅 **${cls.length} class${cls.length > 1 ? 'es' : ''}** — ${cls.map((c) => `${c.subject} ${U.fmtTime(c.start)}`).join(', ')}` : '📅 No classes today');
    lines.push(due.length ? `✅ **Due today:** ${due.map((x) => x.title).join('; ')}` : `✅ ${tasks.length} pending task${tasks.length === 1 ? '' : 's'}, nothing due today`);
    if (ev.length) lines.push(`🎯 **Next:** ${ev[0].title} — ${ev[0].days === 0 ? 'today!' : ev[0].days === 1 ? 'tomorrow' : `in ${ev[0].days} days`}`);
    const carry = [...new Set(cls.flatMap((c) => c.carry || []))];
    if (carry.length) lines.push(`🎒 Pack: ${carry.join(', ')}`);
    return lines.join('\n');
  }
  function helpText() {
    return `I'm Zara, your offline-first companion. Try:\n• "What's pending?" / "What's due today?"\n• "Do I have class this afternoon?" / "What should I carry tomorrow?"\n• "When is my DBMS exam?" / "What's coming up?"\n• "Remind me to submit the lab sheet by tomorrow"\n• "Mark DBMS lab sheet as done"\n• "I'm hungry" / "Open NxtWave"\n• "Remember my favourite food is biryani" / "What do you know about me?"\n• "Give me a summary of my day"\n\nAdd a Gemini API key in Settings and I can answer anything else too.`;
  }
  function fallback(text) {
    const hasKey = !!S.getSettings().geminiKey;
    const tips = ['"what\'s pending?"', '"do I have class today?"', '"when is my next exam?"', '"remind me to…"', '"I\'m hungry"', '"what do you know about me?"'];
    const pick = tips.sort(() => Math.random() - 0.5).slice(0, 3).join(', ');
    return { text: hasKey
      ? `I couldn't reach Gemini just now, so I'm answering locally. I can help with ${pick}.`
      : `I'm running in offline mode, so I can't answer that one yet. I can help with ${pick}. Add a free Gemini key in ⚙️ Settings to unlock full AI chat.` };
  }

  function handle(text) {
    const t = String(text || '').trim();
    if (!t) return { text: 'Say something and I\'ll help 😊' };
    for (const intent of INTENTS) {
      try {
        if (intent.test(t)) {
          const out = intent.run(t);
          return Object.assign({ intent: intent.id }, out);
        }
      } catch (e) {
        console.warn('[Zara intent]', intent.id, e);
        return { intent: intent.id, text: `Hmm, that didn't work: ${e.message}` };
      }
    }
    return Object.assign({ intent: 'fallback' }, fallback(t));
  }

  window.ZaraIntents = { handle, runAction, parseDateFromText, parseTimeFromText, dailyBrief, helpText, findTask, findShortcut };
})();
