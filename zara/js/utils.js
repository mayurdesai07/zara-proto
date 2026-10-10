/* Zara · utils.js — dates, formatting, escaping, derived views over the data */
(function () {
  const S = window.ZaraStore;
  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const EVENT_TYPES = {
    exam: { label: 'Exam', emoji: '📝' },
    viva: { label: 'Viva', emoji: '🎤' },
    deadline: { label: 'Deadline', emoji: '⏰' },
    birthday: { label: 'Birthday', emoji: '🎂' },
    other: { label: 'Event', emoji: '📌' },
  };

  const z = (n) => String(n).padStart(2, '0');
  function todayISO(d) { d = d || new Date(); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`; }
  function parseISO(s) { if (!s) return null; const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
  function daysUntil(isoDate) {
    const t = parseISO(todayISO()); const d = parseISO(isoDate);
    if (!d) return null;
    return Math.round((d - t) / 86400000);
  }
  function fmtDate(isoDate, opts) {
    const d = parseISO(isoDate); if (!d) return '';
    return d.toLocaleDateString(undefined, opts || { weekday: 'short', day: 'numeric', month: 'short' });
  }
  function fmtTime(hhmm) {
    if (!hhmm) return '';
    const [h, m] = hhmm.split(':').map(Number);
    const ap = h >= 12 ? 'PM' : 'AM'; const hh = ((h + 11) % 12) + 1;
    return `${hh}:${z(m)} ${ap}`;
  }
  function relDay(isoDate) {
    const n = daysUntil(isoDate);
    if (n === null) return '';
    if (n === 0) return 'Today'; if (n === 1) return 'Tomorrow'; if (n === -1) return 'Yesterday';
    if (n < 0) return `${-n} days ago`;
    if (n < 7) return `in ${n} days`;
    return fmtDate(isoDate);
  }
  function nowHHMM() { const d = new Date(); return `${z(d.getHours())}:${z(d.getMinutes())}`; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function greeting() {
    const h = new Date().getHours();
    if (h < 5) return 'Still up';
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    if (h < 21) return 'Good evening';
    return 'Good night';
  }

  /* ───── Derived data ───── */
  function pendingTasks() {
    return S.tasks.list().filter((t) => !t.done).sort(sortTasks);
  }
  function sortTasks(a, b) {
    const pr = { high: 0, medium: 1, low: 2 };
    if ((a.due || '9999') !== (b.due || '9999')) return (a.due || '9999') < (b.due || '9999') ? -1 : 1;
    return (pr[a.priority] ?? 1) - (pr[b.priority] ?? 1);
  }
  function classesOn(day) {
    return S.schedule.list().filter((c) => Number(c.day) === Number(day)).sort((a, b) => a.start.localeCompare(b.start));
  }
  function todayClasses() { return classesOn(new Date().getDay()); }
  function nextClass() {
    const now = nowHHMM();
    const today = todayClasses();
    const current = today.find((c) => c.start <= now && c.end > now);
    if (current) return { cls: current, status: 'now' };
    const upcoming = today.find((c) => c.start > now);
    if (upcoming) return { cls: upcoming, status: 'today' };
    for (let i = 1; i <= 7; i++) {
      const d = (new Date().getDay() + i) % 7;
      const list = classesOn(d);
      if (list.length) return { cls: list[0], status: 'later', day: d, offset: i };
    }
    return null;
  }
  /** Birthdays recur yearly → normalise to next occurrence for countdown purposes. */
  function effectiveDate(ev) {
    if (ev.type !== 'birthday' || !ev.date) return ev.date;
    const d = parseISO(ev.date); const t = parseISO(todayISO());
    d.setFullYear(t.getFullYear());
    if (d < t) d.setFullYear(t.getFullYear() + 1);
    return todayISO(d);
  }
  function upcomingEvents(limit) {
    const list = S.events.list()
      .map((e) => Object.assign({}, e, { effDate: effectiveDate(e), days: daysUntil(effectiveDate(e)) }))
      .filter((e) => e.days !== null && e.days >= 0)
      .sort((a, b) => a.days - b.days || (a.time || '').localeCompare(b.time || ''));
    return limit ? list.slice(0, limit) : list;
  }
  function pastEvents() {
    return S.events.list()
      .map((e) => Object.assign({}, e, { effDate: effectiveDate(e), days: daysUntil(effectiveDate(e)) }))
      .filter((e) => e.days !== null && e.days < 0)
      .sort((a, b) => b.days - a.days);
  }

  window.ZaraUtils = {
    DAYS, DAYS_SHORT, EVENT_TYPES,
    todayISO, parseISO, daysUntil, fmtDate, fmtTime, relDay, nowHHMM, esc, greeting,
    pendingTasks, sortTasks, classesOn, todayClasses, nextClass, effectiveDate, upcomingEvents, pastEvents,
  };
})();
