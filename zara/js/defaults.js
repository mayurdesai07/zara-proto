/* Zara · defaults.js — seed data so the app is useful out of the box */
(function () {
  const S = window.ZaraStore;

  function iso(d) {
    const z = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
  }
  function daysFromNow(n) { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); }

  const DEFAULT_SETTINGS = {
    name: 'Mayur',
    tone: 'warm',
    theme: 'dark',
    accent: 'coral',
    geminiKey: '',
    model: 'gemini-1.5-flash',
  };

  function seedTasks() {
    return [
      { title: 'Submit DBMS lab sheet (ER diagram + normalization)', priority: 'high', due: daysFromNow(0), notes: 'Upload PDF to the ERP before 5 PM. Include SQL queries from Experiment 4.', done: false, source: 'seed' },
      { title: 'Finish NxtWave React module — hooks assignment', priority: 'medium', due: daysFromNow(2), notes: 'useEffect + custom hook exercise. Target 100% on the coding practice.', done: false, source: 'seed' },
      { title: 'Revise DSA: trees & graph traversal', priority: 'high', due: daysFromNow(3), notes: 'BFS/DFS, BST insert/delete, AVL rotations.', done: false, source: 'seed' },
      { title: 'Pay hostel mess fee', priority: 'low', due: daysFromNow(6), notes: '', done: false, source: 'seed' },
      { title: 'Collect OS lab record from Priya', priority: 'low', due: daysFromNow(-1), notes: '', done: true, source: 'seed' },
    ];
  }

  function seedSchedule() {
    // day: 1=Mon … 5=Fri, 6=Sat, 0=Sun
    return [
      { day: 1, start: '09:00', end: '10:00', subject: 'DSA Lecture', location: 'Room 204, CS Block', carry: ['Notebook', 'DSA textbook'] },
      { day: 1, start: '11:00', end: '13:00', subject: 'DBMS Lab', location: 'Lab 3, CS Block', carry: ['Lab record', 'ID card', 'Lab sheet printout'] },
      { day: 2, start: '10:00', end: '11:00', subject: 'Operating Systems', location: 'Room 201, CS Block', carry: ['Notebook'] },
      { day: 2, start: '14:00', end: '16:00', subject: 'OS Lab', location: 'Lab 1, CS Block', carry: ['Lab record', 'Pen drive'] },
      { day: 3, start: '09:00', end: '10:00', subject: 'DSA Lecture', location: 'Room 204, CS Block', carry: ['Notebook', 'DSA textbook'] },
      { day: 3, start: '11:00', end: '12:00', subject: 'Discrete Mathematics', location: 'Room 108, Main Block', carry: ['Calculator', 'Notebook'] },
      { day: 4, start: '09:00', end: '10:00', subject: 'DBMS Theory', location: 'Room 203, CS Block', carry: ['Notebook'] },
      { day: 4, start: '13:00', end: '14:00', subject: 'Soft Skills', location: 'Seminar Hall', carry: ['Formal dress'] },
      { day: 5, start: '10:00', end: '11:00', subject: 'Operating Systems', location: 'Room 201, CS Block', carry: ['Notebook'] },
      { day: 5, start: '15:00', end: '17:00', subject: 'NxtWave Live Session', location: 'Online · Google Meet', carry: ['Laptop', 'Charger', 'Earphones'] },
    ].map((c) => Object.assign({ packed: [] }, c));
  }

  function seedEvents() {
    return [
      { title: 'DBMS Mid-Term Exam', type: 'exam', date: daysFromNow(5), time: '10:00', notes: 'Units 1–3. Normalization, SQL joins, transactions.' },
      { title: 'DSA Viva', type: 'viva', date: daysFromNow(9), time: '14:00', notes: 'Be ready to explain your lab programs line by line.' },
      { title: 'NxtWave project submission', type: 'deadline', date: daysFromNow(14), time: '23:59', notes: 'Deploy React app and submit the link on the portal.' },
      { title: "Priya's birthday", type: 'birthday', date: daysFromNow(21), time: '', notes: 'Likes dark chocolate.' },
      { title: 'College Tech Fest', type: 'other', date: daysFromNow(30), time: '09:00', notes: 'Register for the hackathon.' },
    ];
  }

  function seedMemory() {
    return [
      { category: 'food', key: 'Favourite food', value: 'Biryani (Hyderabadi, extra raita)' },
      { category: 'habit', key: 'Study habit', value: 'Studies best late evening, 8 PM – midnight' },
      { category: 'habit', key: 'Morning routine', value: 'Wakes at 7:30, hates skipping breakfast' },
      { category: 'college', key: 'Course', value: 'B.Tech Computer Science, 2nd year' },
      { category: 'learning', key: 'Online course', value: 'NxtWave CCBP 4.0 — React track' },
      { category: 'preference', key: 'Tea or coffee', value: 'Filter coffee, no sugar' },
      { category: 'goal', key: 'Current goal', value: 'Land a frontend internship by next summer' },
    ];
  }

  function seedNotes() {
    return [
      { title: 'DBMS quick revision', body: '1NF: atomic values\n2NF: no partial dependency\n3NF: no transitive dependency\nBCNF: every determinant is a candidate key\n\nACID → Atomicity, Consistency, Isolation, Durability' },
      { title: 'React hooks cheat sheet', body: 'useState — local state\nuseEffect — side effects, cleanup return\nuseMemo — memoize value\nuseCallback — memoize fn\nuseRef — mutable box / DOM ref\nCustom hooks start with "use"' },
    ];
  }

  function seedShortcuts() {
    return [
      { name: 'WhatsApp', url: 'https://web.whatsapp.com', emoji: '💬', color: '#25D366', group: 'social' },
      { name: 'Swiggy', url: 'https://www.swiggy.com', emoji: '🍔', color: '#FC8019', group: 'food' },
      { name: 'Zomato', url: 'https://www.zomato.com', emoji: '🍕', color: '#E23744', group: 'food' },
      { name: 'NxtWave', url: 'https://learning.ccbp.in', emoji: '🚀', color: '#2563eb', group: 'learning' },
      { name: 'College ERP', url: 'https://erp.example.edu', emoji: '🏫', color: '#7c3aed', group: 'college' },
      { name: 'Google Classroom', url: 'https://classroom.google.com', emoji: '📚', color: '#0f9d58', group: 'learning' },
      { name: 'GitHub', url: 'https://github.com', emoji: '🐙', color: '#24292f', group: 'learning' },
      { name: 'Gmail', url: 'https://mail.google.com', emoji: '✉️', color: '#ea4335', group: 'social' },
    ];
  }

  function seedAll(force) {
    const meta = S.getMeta();
    if (meta.seeded && !force) return false;
    const settings = S.getSettings();
    S.setSettings(Object.assign({}, DEFAULT_SETTINGS, force ? { geminiKey: settings.geminiKey || '' } : settings));
    const stamp = (arr, prefix) => arr.map((o, i) => Object.assign({ id: `${prefix}_seed_${i}`, createdAt: Date.now() - (arr.length - i) * 60000 }, o));
    S.tasks.replace(stamp(seedTasks(), 'ta'));
    S.schedule.replace(stamp(seedSchedule(), 'sc'));
    S.events.replace(stamp(seedEvents(), 'ev'));
    S.memory.replace(stamp(seedMemory(), 'me'));
    S.notes.replace(stamp(seedNotes(), 'no'));
    S.shortcuts.replace(stamp(seedShortcuts(), 'sh'));
    S.chat.replace([]);
    S.setMeta({ seeded: true, seededAt: Date.now() });
    return true;
  }

  window.ZaraDefaults = { DEFAULT_SETTINGS, seedAll };
})();
