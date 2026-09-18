/* Дневник подтягиваний. Всё хранится в localStorage, без сервера. */
(function () {
  'use strict';

  const STORE_KEY = 'pullup-diary-v1';
  const DRAFT_KEY = 'pullup-diary-draft-v1';

  // ---------- Утилиты ----------
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const pad = (n) => String(n).padStart(2, '0');
  const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const parseDate = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const fmtDate = (s) => { const d = parseDate(s); return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', weekday: 'short' }); };
  const fmtShort = (s) => { const d = parseDate(s); return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }); };
  const addDays = (s, n) => { const d = parseDate(s); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const mondayOf = (s) => { const d = parseDate(s); const wd = (d.getDay() + 6) % 7; return addDays(s, -wd); };
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtKg = (w) => (w ? `+${(+w).toString().replace('.', ',')} кг` : '');
  const plural = (n, one, few, many) => { const m10 = n % 10, m100 = n % 100; if (m10 === 1 && m100 !== 11) return one; if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few; return many; };

  // ---------- Хранилище ----------
  const defaultState = () => ({
    version: 1,
    settings: { daysPerWeek: 4, strengthMode: 'weighted', rowWeight: 12, bodyweight: null, theme: 'auto' },
    cursor: { week: 1, sinceTs: 0 },
    sessions: [],
    createdAt: todayStr()
  });

  let state = load();

  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return defaultState();
      const parsed = JSON.parse(raw);
      return normalize(parsed);
    } catch (e) {
      console.warn('Не удалось прочитать сохранение', e);
      return defaultState();
    }
  }
  function normalize(obj) {
    const base = defaultState();
    const out = Object.assign(base, obj || {});
    out.settings = Object.assign(base.settings, (obj && obj.settings) || {});
    out.cursor = Object.assign(base.cursor, (obj && obj.cursor) || {});
    delete out.cursor.day; // старый формат курсора
    if (!(out.cursor.week >= 1)) out.cursor.week = 1;
    if (!out.cursor.sinceTs) out.cursor.sinceTs = 0;
    out.sessions = Array.isArray(out.sessions) ? out.sessions.filter((s) => s && s.date && Array.isArray(s.exercises)) : [];
    out.sessions.forEach((s) => { if (!s.id) s.id = uid(); });
    return out;
  }
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
    catch (e) { toast('Не удалось сохранить: ' + e.message); }
  }

  // ---------- Программа ----------
  const EX = {
    pullup:   { name: 'Подтягивания, прямой хват', unit: 'reps', weighted: true },
    chin:     { name: 'Подтягивания, обратный хват', unit: 'reps', weighted: false },
    neutral:  { name: 'Подтягивания, нейтральный хват', unit: 'reps', weighted: false },
    negative: { name: 'Негативные подтягивания', unit: 'reps', weighted: false },
    row:      { name: 'Тяга гантели в наклоне', unit: 'reps', weighted: true },
    hang:     { name: 'Вис на перекладине', unit: 'sec', weighted: true },
    scap:     { name: 'Лопаточные подтягивания', unit: 'reps', weighted: false },
    maxtest:  { name: 'Тест максимума', unit: 'reps', weighted: false }
  };
  const DAY_TITLES = { volume: 'День 1 · Объём', strength: 'День 2 · Сила', variety: 'День 3 · Вариативность', light: 'Лёгкий день' };
  const DAY_SHORT = { volume: 'Объём', strength: 'Сила', variety: 'Вариативность', light: 'Лёгкий' };

  function mkSets(n, v, w) { return Array.from({ length: n }, () => ({ v, w: w || 0 })); }

  // Неделя w (с 1). Блок из 4 недель: 3 рабочие + разгрузочная.
  function weekInfo(w) {
    const block = Math.floor((w - 1) / 4);
    const pos = (w - 1) % 4;
    return { week: w, block, pos, deload: pos === 3, step: block * 3 + Math.min(pos, 2) };
  }

  function planForWeek(w, settings) {
    const s = settings || state.settings;
    const info = weekInfo(w);
    const { block, pos, deload, step } = info;
    const days = [];

    // День 1 — объём
    if (!deload) {
      const reps = 8 + pos; // 8, 9, 10
      const weight = block * 2.5; // после 6×10 переходим на тот же объём с добавочным весом
      days.push({
        key: 'volume', title: DAY_TITLES.volume, restSec: 120,
        summary: `6×${reps}${weight ? ' ' + fmtKg(weight) : ''}, отдых 2 мин, запас 2 повторения (RIR 2)`,
        exercises: [{ key: 'pullup', sets: mkSets(6, reps, weight), rest: 120, rir: 2, hint: `Не выходит ${reps} — делайте 6×${reps - 2}, но чисто.` }],
        tips: [
          `Каждый подход с запасом ~2 повторения. Если в подходе меньше ${reps - 2} — остановитесь на этом объёме и не добивайте до отказа.`,
          `Не вышло ${reps} во всех шести подходах — на следующей тренировке этого дня повторите 6×${reps - 2} чисто, потом снова пробуйте ${reps}.`,
          weight ? 'Вес в рюкзаке. Если с весом техника ломается — уберите вес и сделайте 6×10.' : 'Полная амплитуда: внизу локти прямые, вверху подбородок над перекладиной.'
        ]
      });
    } else {
      days.push({
        key: 'volume', title: DAY_TITLES.volume + ' · разгрузка и тест', restSec: 180,
        summary: 'Разминка, 1 подход на максимум чистых повторений, затем 3×5 легко',
        exercises: [
          { key: 'maxtest', sets: mkSets(1, null, 0), rest: 180, hint: 'Разминка 2 подхода по 3–4, отдых 3 мин, потом один подход до чистого отказа (без раскачки и рывков).' },
          { key: 'pullup', sets: mkSets(3, 5, 0), rest: 120, rir: 4, hint: 'Лёгкие подходы, далеко от отказа.' }
        ],
        tips: ['Разгрузочная неделя: объём ниже, тест показывает, куда вы пришли за блок.', 'Результат теста попадёт в график «Максимум».']
      });
    }

    // День 2 — сила
    const strengthWeighted = (s.strengthMode || 'weighted') === 'weighted';
    if (!deload) {
      if (strengthWeighted) {
        const weight = 5 + block * 2.5;
        days.push({
          key: 'strength', title: DAY_TITLES.strength, restSec: 180,
          summary: `5×5 ${fmtKg(weight)} (рюкзак), отдых 3 мин`,
          exercises: [{ key: 'pullup', sets: mkSets(5, 5, weight), rest: 180, rir: 2, hint: 'Если вес не идёт на 5 — сделайте 5×3–4 с этим весом или перейдите на негативы.' }],
          tips: [
            'Отдых между подходами 3 минуты, подходы чистые, без раскачки.',
            `Вес растёт раз в блок: следующий блок ${fmtKg(weight + 2.5)}. Если 25 повторений даются легко две тренировки подряд — можно добавить 1,25–2,5 кг раньше.`,
            'Нет рюкзака или с весом не выходит — переключите режим на негативы в разделе «Ещё».'
          ]
        });
      } else {
        const tempo = 4 + block; // 4–5 с, 5–6 с, 6–7 с
        days.push({
          key: 'strength', title: DAY_TITLES.strength + ' · негативы', restSec: 180,
          summary: `5×5 медленных негативов по ${tempo}–${tempo + 1} с, отдых 3 мин`,
          exercises: [{ key: 'negative', sets: mkSets(5, 5, 0), rest: 180, tempo, hint: `Подпрыгните или встаньте в верхнюю точку, опускайтесь ${tempo}–${tempo + 1} секунды, полностью контролируя движение.` }],
          tips: [
            'Опускание равномерное, без «провала» в конце. Внизу — пауза 1 с с прямыми руками.',
            `Когда 5×5 по ${tempo + 1} с идут ровно — следующий блок опускайте на секунду дольше, либо переходите на 5×5 с рюкзаком 5 кг.`
          ]
        });
      }
    } else {
      const weight = strengthWeighted ? 5 + block * 2.5 : 0;
      days.push({
        key: 'strength', title: DAY_TITLES.strength + ' · разгрузка', restSec: 180,
        summary: strengthWeighted ? `3×3 ${fmtKg(weight)}, легко` : '3×3 негативов по 4 с, легко',
        exercises: [strengthWeighted
          ? { key: 'pullup', sets: mkSets(3, 3, weight), rest: 180, rir: 3 }
          : { key: 'negative', sets: mkSets(3, 3, 0), rest: 180, tempo: 4 }],
        tips: ['Только поддержание навыка, до отказа далеко.']
      });
    }

    // День 3 — вариативность
    if (!deload) {
      const chinSets = pos % 2 === 0 ? 3 : 2;
      const reps = Math.min(12, 6 + pos + block);
      days.push({
        key: 'variety', title: DAY_TITLES.variety, restSec: 120,
        summary: `Обратный и нейтральный хват, 5 подходов по ${reps}; тяга гантели 3×10–12`,
        exercises: [
          { key: 'chin', sets: mkSets(chinSets, reps, 0), rest: 120, rir: 2 },
          { key: 'neutral', sets: mkSets(5 - chinSets, reps, 0), rest: 120, rir: 2, hint: 'Нет нейтральных ручек — повесьте полотенце или используйте широкий обратный хват.' },
          { key: 'row', sets: mkSets(3, 12, s.rowWeight || 0), rest: 90, hint: 'Диапазон 10–12 повторений на каждую руку. Сделали 3×12 — на следующей тренировке возьмите гантель на 1–2 кг тяжелее.' }
        ],
        tips: [
          'Хваты чередуются по неделям: сегодня ' + (chinSets === 3 ? '3 подхода обратным и 2 нейтральным' : '2 подхода обратным и 3 нейтральным') + '.',
          'Запас 2 повторения в каждом подходе. Не хватает — сделайте на 1–2 меньше, но все 5 подходов.'
        ]
      });
    } else {
      days.push({
        key: 'variety', title: DAY_TITLES.variety + ' · разгрузка', restSec: 120,
        summary: '2 подхода обратным + 1 нейтральным по 6, тяга 2×10',
        exercises: [
          { key: 'chin', sets: mkSets(2, 6, 0), rest: 120, rir: 4 },
          { key: 'neutral', sets: mkSets(1, 6, 0), rest: 120, rir: 4 },
          { key: 'row', sets: mkSets(2, 10, s.rowWeight || 0), rest: 90 }
        ],
        tips: ['Половина обычного объёма, техника и амплитуда.']
      });
    }

    // Лёгкий день
    if (!deload) {
      const cycle = Math.floor(step / 5), within = step % 5;
      const hangSec = 40 + 5 * within;
      const hangW = 5 * cycle;
      const scapReps = 8 + within;
      const pause = cycle > 0 ? cycle + 1 : 0;
      days.push({
        key: 'light', title: DAY_TITLES.light, restSec: 90,
        summary: `Висы 3×${hangSec} с${hangW ? ' ' + fmtKg(hangW) : ''}, лопаточные подтягивания 3×${scapReps}${pause ? ` с паузой ${pause} с` : ''}`,
        exercises: [
          { key: 'hang', sets: mkSets(3, hangSec, hangW), rest: 90, hint: 'Плечи активные (не «висите на связках»), хват полный, дыхание ровное.' },
          { key: 'scap', sets: mkSets(3, scapReps, 0), rest: 90, hint: (pause ? `Пауза ${pause} с в верхней точке. ` : '') + 'Руки прямые, работают только лопатки: опускаете их вниз и назад, тело слегка приподнимается.' }
        ],
        tips: [
          'Это восстановительный день: кисти, плечи, лопатки. Не гонитесь за отказом.',
          'Вис растёт на 5 с в неделю до 60 с, дальше добавляется вес и время начинается с 40 с.'
        ]
      });
    } else {
      days.push({
        key: 'light', title: DAY_TITLES.light + ' · разгрузка', restSec: 90,
        summary: 'Висы 3×30 с, лопаточные подтягивания 3×6',
        exercises: [
          { key: 'hang', sets: mkSets(3, 30, 0), rest: 90 },
          { key: 'scap', sets: mkSets(3, 6, 0), rest: 90 }
        ],
        tips: ['Лёгкая работа для суставов и хвата.']
      });
    }

    return { info, days };
  }

  // Неделя программы: набор тренировок, которые выполняются в любом порядке
  const REQUIRED_KEYS = () => (state.settings.daysPerWeek === 4 ? ['volume', 'strength', 'variety', 'light'] : ['volume', 'strength', 'variety']);
  const isWorkout = (s) => s.type !== 'rest';
  function dayByKey(week, key) { return planForWeek(week).days.find((d) => d.key === key); }
  // Тренировки, засчитанные в текущую неделю (после последнего старта недели)
  function weekSessions() {
    const c = state.cursor;
    return state.sessions.filter((s) => s.program && s.week === c.week && isWorkout(s) && (s.createdAt || 0) >= (c.sinceTs || 0));
  }
  function doneMap() { const m = new Map(); weekSessions().forEach((s) => { if (!m.has(s.type) || m.get(s.type).date < s.date) m.set(s.type, s); }); return m; }
  function weekComplete() { const d = doneMap(); return REQUIRED_KEYS().every((k) => d.has(k)); }
  function startWeek(week) { state.cursor = { week: Math.max(1, week), sinceTs: Date.now() }; planWeek = null; }

  // ---------- Статистика ----------
  const PULL_KEYS = ['pullup', 'chin', 'neutral', 'negative', 'maxtest'];
  const sortedSessions = () => state.sessions.slice().sort((a, b) => (a.date === b.date ? (a.createdAt || 0) - (b.createdAt || 0) : a.date < b.date ? -1 : 1));
  const sessionReps = (s) => s.exercises.filter((e) => PULL_KEYS.includes(e.key)).reduce((sum, e) => sum + e.sets.reduce((a, st) => a + (+st.v || 0), 0), 0);
  const bestSet = (s, key, bodyweightOnly) => s.exercises.filter((e) => e.key === key && (!bodyweightOnly || true)).reduce((m, e) => Math.max(m, ...e.sets.filter((st) => !bodyweightOnly || !(+st.w)).map((st) => +st.v || 0)), 0);
  function lastSessionOfType(key, beforeId) {
    const list = sortedSessions().filter((s) => s.type === key && s.id !== beforeId);
    return list[list.length - 1] || null;
  }
  function workoutsInLastDays(days, dateStr) {
    const from = addDays(dateStr || todayStr(), -(days - 1));
    return state.sessions.filter((s) => isWorkout(s) && s.date >= from && s.date <= (dateStr || todayStr()));
  }
  // Что было в каждый день: тренировка, отдых или ничего
  function dayKinds() {
    const m = new Map();
    state.sessions.forEach((s) => { if (isWorkout(s)) m.set(s.date, 'workout'); else if (!m.has(s.date)) m.set(s.date, 'rest'); });
    return m;
  }

  // Оценка выполнения: все ли подходы дошли до цели (или цели − 2)
  function evaluate(session) {
    let hit = 0, total = 0, low = 0;
    session.exercises.forEach((e) => {
      if (!PULL_KEYS.includes(e.key) || e.key === 'maxtest') return;
      e.sets.forEach((st) => {
        if (st.target == null) return;
        total++;
        const v = +st.v || 0;
        if (v >= st.target) hit++;
        else if (v < st.target - 2) low++;
      });
    });
    return { hit, total, low, ok: total > 0 && hit === total, fail: total > 0 && low >= 2 };
  }

  // ---------- Черновик тренировки ----------
  let draft = null;
  try { draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); } catch (e) { draft = null; }
  function saveDraft() { try { if (draft) localStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); else localStorage.removeItem(DRAFT_KEY); } catch (e) { /* пусто */ } }

  function newDraftFromDay(week, day, program) {
    return {
      id: uid(), editing: false, program: !!program, week, type: day.key, title: day.title,
      date: todayStr(), restSec: day.restSec, notes: '', feel: 3,
      exercises: day.exercises.map((e) => ({
        key: e.key, name: EX[e.key].name, unit: EX[e.key].unit, weighted: EX[e.key].weighted,
        rest: e.rest, rir: e.rir, tempo: e.tempo, hint: e.hint || '',
        sets: e.sets.map((st) => ({ v: st.v, w: st.w || 0, target: st.v }))
      }))
    };
  }
  function newRestDraft(date) {
    return { id: uid(), editing: false, program: false, week: state.cursor.week, type: 'rest', title: 'День отдыха', date: date || todayStr(), notes: '', feel: 3, exercises: [] };
  }
  function draftFromSession(s) {
    const d = JSON.parse(JSON.stringify(s));
    d.editing = true;
    d.exercises.forEach((e) => { e.name = EX[e.key] ? EX[e.key].name : e.name; e.unit = e.unit || (EX[e.key] || {}).unit || 'reps'; e.weighted = EX[e.key] ? EX[e.key].weighted : !!e.weighted; });
    return d;
  }

  // ---------- Рендер ----------
  let currentTab = 'today';
  let planWeek = null;
  const view = $('#view');

  function render() {
    if (!(state.cursor.week >= 1)) state.cursor.week = 1;
    $$('.tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === currentTab));
    const renderers = { today: renderToday, diary: renderDiary, progress: renderProgress, plan: renderPlan, settings: renderSettings };
    view.innerHTML = '';
    renderers[currentTab]();
    window.scrollTo({ top: 0 });
  }

  function card(html, cls) { const el = document.createElement('section'); el.className = 'card' + (cls ? ' ' + cls : ''); el.innerHTML = html; view.appendChild(el); return el; }

  // --- Сегодня ---
  function renderToday() {
    if (draft) { renderForm(); return; }
    const week = state.cursor.week;
    const info = weekInfo(week);
    const plan = planForWeek(week);
    const required = REQUIRED_KEYS();
    const done = doneMap();
    const today = todayStr();
    const kinds = dayKinds();
    const todayKind = kinds.get(today);
    const last7 = workoutsInLastDays(7);
    const workouts = sortedSessions().filter(isWorkout);
    const lastWorkout = workouts[workouts.length - 1];
    const doneRequired = required.filter((k) => done.has(k)).length;

    let warn = '';
    if (todayKind === 'workout') warn += `<div class="callout good"><span class="ico">✓</span><span>Сегодня уже записана тренировка. Ещё одна имеет смысл только если это лёгкий день.</span></div>`;
    else if (todayKind === 'rest') warn += `<div class="callout good"><span class="ico">☾</span><span>Сегодня отмечен день отдыха.</span></div>`;
    else if (last7.length >= 4) warn += `<div class="callout warn"><span class="ico">!</span><span>За последние 7 дней уже ${last7.length} тренировки. Программа рассчитана на 3–4 в неделю — сегодня лучше отдых.</span></div>`;
    else if (lastWorkout && lastWorkout.date === addDays(today, -1) && lastWorkout.type !== 'light') warn += `<div class="callout"><span class="ico">i</span><span>Вчера была тренировка «${esc(DAY_SHORT[lastWorkout.type] || lastWorkout.title)}». После тяжёлого дня лучше отдых или лёгкий день.</span></div>`;

    const items = plan.days.map((d) => {
      const isReq = required.includes(d.key);
      const ds = done.get(d.key);
      const prev = lastSessionOfType(d.key);
      let hint = '';
      if (prev && d.key !== 'light' && !ds) {
        const ev = evaluate(prev);
        if (ev.fail) hint = `<span class="day-hint warn">↺ В прошлый раз не вышло — сегодня на 2 повторения меньше, но чисто</span>`;
      }
      const status = ds ? `<span class="pill pill-good">✓ ${esc(fmtShort(ds.date))}</span>` : (isReq ? '' : '<span class="pill pill-muted">по желанию</span>');
      return `<button class="day-item${ds ? ' done' : ''}" type="button" data-key="${d.key}">
        <span><span class="day-title">${esc(d.title)}</span><br><span class="day-sub">${esc(d.summary)}</span>${hint}</span>
        <span class="day-status">${status}<span class="chev">›</span></span></button>`;
    }).join('');

    const complete = weekComplete();
    const el = card(`
      <div class="card-head">
        <div>
          <div class="small">Блок ${info.block + 1}${info.deload ? ' · разгрузка' : ' · рабочая ' + (info.pos + 1) + ' из 3'} · ${state.settings.daysPerWeek} дн/нед</div>
          <h1>Неделя ${week}</h1>
        </div>
        <span class="pill${complete ? ' pill-good' : ''}">${doneRequired} из ${required.length} сделано</span>
      </div>
      ${warn}
      ${calendarHtml(1)}
      <p class="small" style="margin:10px 0 8px">Выберите тренировку на сегодня. Порядок свободный, между тяжёлыми днями оставляйте день отдыха.</p>
      <div class="day-list">${items}</div>
      <div class="btn-row" style="margin-top:12px">
        <button class="btn btn-ghost" type="button" id="btn-rest">☾ День отдыха</button>
        ${complete
          ? `<button class="btn" type="button" id="btn-next">Начать неделю ${week + 1} →</button>`
          : `<button class="btn btn-ghost" type="button" id="btn-close">Завершить неделю</button>`}
      </div>
      ${complete ? '<div class="callout good" style="margin-top:10px"><span class="ico">✓</span><span>Все тренировки недели сделаны. Можно переходить дальше или добавить лёгкий день.</span></div>' : ''}
    `);
    bindCalendarTips(el);
    $$('.day-item', el).forEach((btn) => btn.addEventListener('click', () => {
      const d = dayByKey(week, btn.dataset.key);
      if (done.has(d.key) && !confirm('«' + d.title + '» на этой неделе уже записана. Записать ещё раз?')) return;
      draft = newDraftFromDay(week, d, true); saveDraft(); render();
    }));
    $('#btn-rest', el).addEventListener('click', () => {
      if (todayKind === 'rest') { toast('Отдых сегодня уже отмечен'); return; }
      if (todayKind === 'workout' && !confirm('Сегодня уже есть тренировка. Всё равно отметить отдых?')) return;
      draft = newRestDraft(today); saveDraft(); render();
    });
    if ($('#btn-next', el)) $('#btn-next', el).addEventListener('click', () => { startWeek(week + 1); save(); render(); toast('Неделя ' + (week + 1) + ' началась'); });
    if ($('#btn-close', el)) $('#btn-close', el).addEventListener('click', () => {
      const missing = required.filter((k) => !done.has(k)).map((k) => DAY_SHORT[k]);
      if (confirm(`Не сделано: ${missing.join(', ')}. Завершить неделю ${week} и перейти к неделе ${week + 1}?`)) { startWeek(week + 1); save(); render(); toast('Неделя ' + (week + 1) + ' началась'); }
    });

    if (lastWorkout) {
      card(`<h2>Последняя тренировка</h2><div class="small">${esc(fmtDate(lastWorkout.date))} · ${esc(lastWorkout.title)}</div>${sessionTableHtml(lastWorkout)}`);
    } else {
      card(`<h2>Как пользоваться</h2><ul class="tips"><li>Выберите любую тренировку недели, внесите фактические повторения по подходам и сохраните.</li><li>В день без тренировки нажмите «День отдыха» — в календаре он будет зелёным, а день без записи считается пропуском.</li><li>Когда все обязательные тренировки недели сделаны, появится кнопка перехода к следующей неделе.</li><li>Прогресс хранится на этом устройстве. Чтобы не потерять — делайте экспорт в разделе «Ещё».</li></ul>`);
    }
  }

  // Календарь: тренировки, отдых и пропуски разными цветами
  const WD = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
  const KIND_LABEL = { workout: 'тренировка', rest: 'отдых', missed: 'пропуск', future: '', before: 'до начала дневника' };
  function calendarHtml(weeks, withLegend) {
    const today = todayStr();
    const start = state.createdAt || today;
    const kinds = dayKinds();
    const titles = new Map(); state.sessions.forEach((s) => { titles.set(s.date, (titles.get(s.date) ? titles.get(s.date) + ', ' : '') + s.title); });
    const lastMon = mondayOf(today);
    const firstMon = addDays(lastMon, -7 * (weeks - 1));
    let html = `<div class="cal"><div class="cal-row cal-head"><span></span>${WD.map((d) => `<span>${d}</span>`).join('')}</div>`;
    let prevMonth = '';
    for (let w = 0; w < weeks; w++) {
      const mon = addDays(firstMon, w * 7);
      const month = parseDate(mon).toLocaleDateString('ru-RU', { month: 'short' }).replace('.', '');
      html += `<div class="cal-row"><span class="cal-month">${month !== prevMonth ? esc(month) : ''}</span>`;
      prevMonth = month;
      for (let i = 0; i < 7; i++) {
        const d = addDays(mon, i);
        let kind = d > today ? 'future' : d < start ? 'before' : (kinds.get(d) || 'missed');
        const tip = `${fmtShort(d)}: ${titles.get(d) || KIND_LABEL[kind]}`;
        html += `<span class="cal-day ${kind}${d === today ? ' today' : ''}" data-tip="${esc(tip)}" role="img" aria-label="${esc(tip)}">${+d.slice(8)}</span>`;
      }
      html += '</div>';
    }
    html += '</div>';
    if (withLegend) html += `<div class="legend"><span><span class="sw workout"></span>тренировка</span><span><span class="sw rest"></span>отдых</span><span><span class="sw missed"></span>пропуск</span><span><span class="sw future"></span>впереди</span></div>`;
    return html;
  }
  function bindCalendarTips(root) {
    const tip = $('#tooltip');
    $$('[data-tip]', root).forEach((h) => {
      const show = (ev) => { tip.textContent = h.dataset.tip; tip.hidden = false; const x = Math.min(window.innerWidth - tip.offsetWidth - 8, Math.max(8, ev.clientX - tip.offsetWidth / 2)); tip.style.left = x + 'px'; tip.style.top = (ev.clientY - 44) + 'px'; };
      h.addEventListener('pointerenter', show); h.addEventListener('pointerleave', () => { tip.hidden = true; });
      h.addEventListener('click', (ev) => { if (tip.hidden || tip.textContent !== h.dataset.tip) show(ev); else tip.hidden = true; });
    });
  }

  function exerciseTargetHtml(e) {
    const ex = EX[e.key];
    const n = e.sets.length;
    const first = e.sets[0];
    const val = first.v == null ? 'макс' : first.v + (ex.unit === 'sec' ? ' с' : '');
    const w = first.w ? ' ' + fmtKg(first.w) : '';
    const tempo = e.tempo ? `, ${e.tempo}–${e.tempo + 1} с на опускание` : '';
    const rir = e.rir != null ? `, RIR ${e.rir}` : '';
    return `<div class="exercise"><div class="exercise-head"><h3>${esc(ex.name)}</h3><span class="exercise-target">${n}×${val}${w}${tempo}${rir}, отдых ${fmtRest(e.rest)}</span></div>${e.hint ? `<div class="set-hint">${esc(e.hint)}</div>` : ''}</div>`;
  }
  function fmtRest(sec) { return sec >= 60 ? (sec % 60 ? `${Math.floor(sec / 60)} мин ${sec % 60} с` : `${sec / 60} мин`) : `${sec} с`; }

  // --- Форма тренировки ---
  function renderForm() {
    const d = draft;
    const el = card(`
      <div class="card-head">
        <div><div class="small">${d.editing ? 'Редактирование' : 'Неделя ' + d.week}</div><h1>${esc(d.title)}</h1></div>
        <button class="btn btn-ghost btn-sm" type="button" id="btn-cancel">Отмена</button>
      </div>
      <div class="field"><label for="f-date">Дата</label><input id="f-date" type="date" value="${esc(d.date)}"></div>
      <div id="f-ex"></div>
      <div class="field-row">
        <div class="field"><label for="f-feel">Самочувствие</label>
          <select id="f-feel">${[1, 2, 3, 4, 5].map((n) => `<option value="${n}"${d.feel == n ? ' selected' : ''}>${['', 'Очень тяжело', 'Тяжело', 'Нормально', 'Хорошо', 'Отлично'][n]}</option>`).join('')}</select></div>
        <div class="field${d.type === 'rest' ? ' hidden' : ''}"><label for="f-rest">Таймер отдыха, с</label><input id="f-rest" type="number" min="15" step="15" value="${d.restSec || 120}"></div>
      </div>
      ${d.type === 'rest' ? '<p class="small" style="margin-top:12px">День отдыха попадёт в календарь зелёным. Отмечайте и его: тогда видно, где был осознанный отдых, а где пропуск.</p>' : ''}
      <div class="field"><label for="f-notes">Заметки</label><textarea id="f-notes" placeholder="${d.type === 'rest' ? 'Как самочувствие, что болит' : 'Как прошло, что болит, что поменять'}">${esc(d.notes || '')}</textarea></div>
      <div class="btn-row" style="margin-top:14px">
        <button class="btn" type="button" id="btn-save">${d.type === 'rest' ? 'Сохранить' : 'Сохранить тренировку'}</button>
        ${d.type === 'rest' ? '' : '<button class="btn btn-ghost" type="button" id="btn-timer">Таймер отдыха</button>'}
      </div>
    `);
    const exWrap = $('#f-ex', el);
    renderFormExercises(exWrap);

    $('#f-date', el).addEventListener('change', (e) => { d.date = e.target.value || todayStr(); saveDraft(); });
    $('#f-feel', el).addEventListener('change', (e) => { d.feel = +e.target.value; saveDraft(); });
    $('#f-rest', el).addEventListener('change', (e) => { d.restSec = +e.target.value || 120; saveDraft(); });
    $('#f-notes', el).addEventListener('input', (e) => { d.notes = e.target.value; saveDraft(); });
    if ($('#btn-timer', el)) $('#btn-timer', el).addEventListener('click', () => startTimer(d.restSec || 120));
    $('#btn-cancel', el).addEventListener('click', () => { if (confirm('Отменить и не сохранять?')) { draft = null; saveDraft(); render(); } });
    $('#btn-save', el).addEventListener('click', saveSession);
  }

  function renderFormExercises(wrap) {
    const d = draft;
    wrap.innerHTML = d.exercises.map((e, ei) => {
      const unitLabel = e.unit === 'sec' ? 'с' : 'повт.';
      const targetTxt = e.sets[0] && e.sets[0].target != null ? `цель ${e.sets.length}×${e.sets[0].target}${e.unit === 'sec' ? ' с' : ''}${e.sets[0].w ? ' ' + fmtKg(e.sets[0].w) : ''}` : (e.key === 'maxtest' ? 'один подход на максимум' : '');
      const meta = [e.rir != null ? `RIR ${e.rir}` : '', e.tempo ? `${e.tempo}–${e.tempo + 1} с` : '', e.rest ? 'отдых ' + fmtRest(e.rest) : ''].filter(Boolean).join(' · ');
      return `<div class="exercise" data-ei="${ei}">
        <div class="exercise-head"><h3>${esc(e.name)}</h3><span class="exercise-target">${esc(targetTxt)}</span></div>
        ${meta ? `<div class="small">${esc(meta)}</div>` : ''}
        ${e.hint ? `<div class="set-hint">${esc(e.hint)}</div>` : ''}
        ${e.sets.map((st, si) => `<div class="set-row${e.weighted ? ' with-weight' : ''}">
          <label>Подход ${si + 1}</label>
          <input type="number" inputmode="numeric" min="0" step="1" placeholder="${unitLabel}" value="${st.v == null ? '' : st.v}" data-ei="${ei}" data-si="${si}" data-f="v" aria-label="${esc(e.name)}, подход ${si + 1}, ${unitLabel}">
          ${e.weighted ? `<input type="number" inputmode="decimal" min="0" step="0.5" placeholder="кг" value="${st.w || ''}" data-ei="${ei}" data-si="${si}" data-f="w" aria-label="вес, кг">` : ''}
          <button type="button" class="del" data-del="${ei}:${si}" aria-label="Удалить подход">×</button>
        </div>`).join('')}
        <button type="button" class="btn btn-ghost btn-sm set-add" data-add="${ei}">+ подход</button>
      </div>`;
    }).join('');

    $$('input[data-f]', wrap).forEach((inp) => {
      inp.addEventListener('input', (e) => {
        const { ei, si, f } = e.target.dataset;
        const val = e.target.value === '' ? null : +e.target.value;
        d.exercises[ei].sets[si][f] = f === 'w' ? (val || 0) : val;
        saveDraft();
      });
      inp.addEventListener('focus', (e) => e.target.select());
    });
    $$('[data-del]', wrap).forEach((b) => b.addEventListener('click', () => {
      const [ei, si] = b.dataset.del.split(':').map(Number);
      if (d.exercises[ei].sets.length <= 1) return;
      d.exercises[ei].sets.splice(si, 1); saveDraft(); renderFormExercises(wrap);
    }));
    $$('[data-add]', wrap).forEach((b) => b.addEventListener('click', () => {
      const ei = +b.dataset.add; const sets = d.exercises[ei].sets; const last = sets[sets.length - 1] || { v: null, w: 0, target: null };
      sets.push({ v: last.v, w: last.w, target: last.target }); saveDraft(); renderFormExercises(wrap);
    }));
  }

  function saveSession() {
    const d = draft;
    const filled = d.exercises.some((e) => e.sets.some((st) => st.v != null && st.v !== ''));
    if (!filled && d.type !== 'rest') { toast('Внесите хотя бы один подход'); return; }
    const session = {
      id: d.id, date: d.date || todayStr(), week: d.week, type: d.type, title: d.title, program: !!d.program,
      notes: d.notes || '', feel: d.feel || 3, createdAt: d.createdAt || Date.now(),
      exercises: d.exercises.map((e) => ({
        key: e.key, unit: e.unit, weighted: e.weighted, rir: e.rir, tempo: e.tempo,
        sets: e.sets.filter((st) => st.v != null && st.v !== '').map((st) => ({ v: +st.v, w: +st.w || 0, target: st.target == null ? null : st.target }))
      })).filter((e) => e.sets.length)
    };
    const idx = state.sessions.findIndex((s) => s.id === session.id);
    if (idx >= 0) state.sessions[idx] = session; else state.sessions.push(session);

    let msg = d.type === 'rest' ? 'Отдых отмечен' : 'Тренировка сохранена';
    if (!d.editing && d.program && d.week === state.cursor.week && weekComplete()) {
      msg += ' · неделя ' + state.cursor.week + ' выполнена полностью';
    }
    // Автоподстройка веса гантели: сделали 3×12 — предлагаем +2 кг
    const row = session.exercises.find((e) => e.key === 'row');
    if (row && row.sets.length >= 3 && row.sets.every((st) => st.v >= 12)) {
      const w = Math.max(...row.sets.map((st) => st.w));
      if (w && w >= (state.settings.rowWeight || 0)) { state.settings.rowWeight = w + 2; msg += ' · гантель в следующий раз ' + (w + 2) + ' кг'; }
    } else if (row) {
      const w = Math.max(...row.sets.map((st) => st.w));
      if (w) state.settings.rowWeight = w;
    }
    draft = null; saveDraft(); save(); stopTimer();
    currentTab = d.editing ? 'diary' : 'today';
    render(); toast(msg);
  }

  // --- Дневник ---
  function renderDiary() {
    const list = sortedSessions().reverse();
    const nWork = list.filter(isWorkout).length;
    const head = card(`<div class="card-head"><h1>Дневник</h1><span class="pill pill-muted">${nWork} ${plural(nWork, 'тренировка', 'тренировки', 'тренировок')}</span></div>
      <div class="btn-row"><button class="btn btn-ghost btn-sm" id="btn-add-rest" type="button">☾ Отметить отдых задним числом</button></div>`);
    $('#btn-add-rest', head).addEventListener('click', () => { draft = newRestDraft(addDays(todayStr(), -1)); saveDraft(); currentTab = 'today'; render(); });
    if (!list.length) { card('<div class="empty">Пока пусто. Первая тренировка появится здесь после сохранения.</div>'); return; }

    let html = '';
    let lastMonth = '';
    list.forEach((s) => {
      const month = parseDate(s.date).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
      if (month !== lastMonth) { html += `<div class="date-group">${esc(month)}</div>`; lastMonth = month; }
      const ev = evaluate(s);
      const badge = s.type === 'rest' ? '<span class="pill pill-good">отдых</span>' : s.type === 'light' ? '' : ev.total ? (ev.ok ? '<span class="pill pill-good">выполнено</span>' : ev.fail ? '<span class="pill pill-warn">с запасом</span>' : '<span class="pill pill-muted">частично</span>') : '';
      html += `<div class="session${s.type === 'rest' ? ' rest' : ''}" data-id="${s.id}">
        <div class="session-head"><div><div class="session-title">${esc(s.title)}</div><div class="session-meta">${esc(fmtDate(s.date))} · неделя ${s.week || '–'}${sessionReps(s) ? ' · ' + sessionReps(s) + ' повт.' : ''}</div></div>${badge}</div>
        <div class="session-body hidden">${sessionTableHtml(s)}${s.notes ? `<p class="small" style="margin-top:6px">${esc(s.notes)}</p>` : ''}
          <div class="btn-row" style="margin-top:8px"><button class="btn btn-ghost btn-sm" data-edit="${s.id}" type="button">Изменить</button><button class="btn btn-ghost btn-sm" data-delete="${s.id}" type="button">Удалить</button></div>
        </div></div>`;
    });
    const el = card(html);
    $$('.session-head', el).forEach((h) => h.addEventListener('click', () => h.nextElementSibling.classList.toggle('hidden')));
    $$('[data-edit]', el).forEach((b) => b.addEventListener('click', () => { const s = state.sessions.find((x) => x.id === b.dataset.edit); draft = draftFromSession(s); saveDraft(); currentTab = 'today'; render(); }));
    $$('[data-delete]', el).forEach((b) => b.addEventListener('click', () => { if (confirm('Удалить эту запись?')) { state.sessions = state.sessions.filter((x) => x.id !== b.dataset.delete); save(); render(); toast('Удалено'); } }));
  }

  function sessionTableHtml(s) {
    const feel = ['', 'очень тяжело', 'тяжело', 'нормально', 'хорошо', 'отлично'][s.feel || 0];
    if (!s.exercises.length) return `<div class="session-body"><div class="small">${s.type === 'rest' ? 'Отдых без тренировки.' : 'Без подходов.'}${feel ? ' Самочувствие: ' + feel + '.' : ''}</div></div>`;
    return `<div class="session-body"><table>${s.exercises.map((e) => {
      const ex = EX[e.key] || { name: e.key, unit: 'reps' };
      const sets = e.sets.map((st) => `${st.v}${ex.unit === 'sec' ? ' с' : ''}${st.w ? '<span class="muted">' + (e.key === 'row' ? '/' + st.w + ' кг' : fmtKg(st.w)) + '</span>' : ''}`).join(' · ');
      return `<tr><td>${esc(ex.name)}${e.tempo ? ` <span class="muted">${e.tempo} с</span>` : ''}</td><td>${sets}</td></tr>`;
    }).join('')}</table>${feel ? `<div class="small" style="margin-top:4px">Самочувствие: ${feel}</div>` : ''}</div>`;
  }

  // --- Прогресс ---
  function renderProgress() {
    const all = sortedSessions();
    const list = all.filter(isWorkout);
    const restDays = all.length - list.length;
    if (!all.length) { card('<h1>Прогресс</h1><div class="empty">Графики появятся после первых тренировок.</div>'); return; }

    const totalReps = list.reduce((a, s) => a + sessionReps(s), 0);
    const bestBW = Math.max(0, ...list.map((s) => Math.max(bestSet(s, 'pullup', true), bestSet(s, 'maxtest', true))));
    const maxTests = list.filter((s) => s.exercises.some((e) => e.key === 'maxtest')).map((s) => ({ date: s.date, v: bestSet(s, 'maxtest', true) }));
    const strength = list.filter((s) => s.type === 'strength').map((s) => ({ date: s.date, v: Math.max(0, ...s.exercises.filter((e) => e.key === 'pullup').flatMap((e) => e.sets.map((st) => +st.w || 0))) })).filter((p) => p.v > 0);
    const hangs = list.map((s) => ({ date: s.date, v: bestSet(s, 'hang', false) })).filter((p) => p.v > 0);

    // Недельный объём по календарным неделям
    const byWeek = new Map();
    list.forEach((s) => { const k = mondayOf(s.date); byWeek.set(k, (byWeek.get(k) || 0) + sessionReps(s)); });
    const weekKeys = [];
    if (list.length) { let k = mondayOf(list[0].date); const end = mondayOf(todayStr()); while (k <= end && weekKeys.length < 60) { weekKeys.push(k); k = addDays(k, 7); } }
    const weekly = weekKeys.map((k) => ({ date: k, v: byWeek.get(k) || 0 }));
    const thisWeek = weekly[weekly.length - 1] ? weekly[weekly.length - 1].v : 0;
    const prevWeek = weekly[weekly.length - 2] ? weekly[weekly.length - 2].v : null;
    const delta = prevWeek == null ? '' : `<div class="delta${thisWeek >= prevWeek ? ' up' : ''}">${thisWeek >= prevWeek ? '+' : ''}${thisWeek - prevWeek} к прошлой неделе</div>`;

    // Серия недель с ≥3 тренировками
    let streak = 0;
    const cnt = new Map(); list.forEach((s) => { const k = mondayOf(s.date); cnt.set(k, (cnt.get(k) || 0) + 1); });
    let k = mondayOf(todayStr()); if ((cnt.get(k) || 0) < 3) k = addDays(k, -7);
    while ((cnt.get(k) || 0) >= 3) { streak++; k = addDays(k, -7); }

    const tiles = document.createElement('div'); tiles.className = 'tiles';
    tiles.innerHTML = `
      <div class="tile"><div class="label">Тренировок</div><div class="value">${list.length}</div><div class="delta">отдых ${restDays} ${plural(restDays, 'день', 'дня', 'дней')} · неделя ${state.cursor.week}</div></div>
      <div class="tile"><div class="label">Подтягиваний всего</div><div class="value">${totalReps}</div><div class="delta">за эту неделю ${thisWeek}</div>${delta}</div>
      <div class="tile"><div class="label">Лучший подход</div><div class="value">${bestBW}</div><div class="delta">своим весом</div></div>
      <div class="tile"><div class="label">Недель подряд</div><div class="value">${streak}</div><div class="delta">с 3+ тренировками</div></div>`;
    view.appendChild(tiles);

    const startMon = mondayOf(state.createdAt || todayStr());
    const nWeeks = Math.min(16, Math.max(4, Math.round((parseDate(mondayOf(todayStr())) - parseDate(startMon)) / 604800000) + 1));
    const calCard = card(`<div class="card-head"><div><h2>Календарь</h2><div class="small">Тренировки, дни отдыха и пропуски за последние ${nWeeks} ${plural(nWeeks, 'неделю', 'недели', 'недель')}</div></div></div>${calendarHtml(nWeeks, true)}`);
    bindCalendarTips(calCard);

    if (!list.length) { card('<div class="empty">Графики появятся после первой тренировки.</div>'); return; }
    chartCard('Подтягиваний за неделю', 'Сумма повторений во всех хватах, по календарным неделям', weekly, 'bar', (p) => `${fmtShort(p.date)}: ${p.v} повт.`, 'повт.');

    const bwSets = list.filter((s) => s.type === 'volume' || s.type === 'variety').map((s) => ({ date: s.date, v: Math.max(bestSet(s, 'pullup', true), bestSet(s, 'chin', true), bestSet(s, 'neutral', true)) })).filter((p) => p.v > 0);
    if (bwSets.length || maxTests.length) chartCard('Лучший подход своим весом', 'Максимум повторений в одном подходе за тренировку. Точки теста максимума выделены оранжевым', bwSets, 'line', (p) => `${fmtShort(p.date)}: ${p.v} повт.`, 'повт.', maxTests);
    if (strength.length) chartCard('Силовой день: добавочный вес', 'Максимальный вес рюкзака за тренировку, кг', strength, 'line', (p) => `${fmtShort(p.date)}: +${p.v} кг`, 'кг');
    if (hangs.length) chartCard('Вис на перекладине', 'Самый долгий подход за тренировку, секунды', hangs, 'line', (p) => `${fmtShort(p.date)}: ${p.v} с`, 'с');
  }

  function chartCard(title, sub, data, kind, tipFn, unit, alt) {
    const el = card(`<div class="card-head"><div><h2>${esc(title)}</h2><div class="small">${esc(sub)}</div></div><button class="btn btn-ghost btn-sm" type="button" data-toggle>Таблица</button></div><div class="chart-wrap"></div>`);
    const wrap = $('.chart-wrap', el);
    const points = data.slice(-30);
    const altPts = (alt || []).filter((p) => !points.length || p.date >= points[0].date);
    if (!points.length && !altPts.length) { wrap.innerHTML = '<div class="empty">Нет данных</div>'; return; }
    const W = 640, H = 220, padL = 34, padR = 14, padT = 14, padB = 28;
    const allV = points.map((p) => p.v).concat(altPts.map((p) => p.v));
    const maxV = Math.max(1, ...allV);
    const nice = niceMax(maxV);
    const ticks = [0, nice / 2, nice];
    const y = (v) => padT + (H - padT - padB) * (1 - v / nice);
    const n = Math.max(points.length, 1);
    let svg = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}">`;
    ticks.forEach((t) => { svg += `<line class="${t === 0 ? 'baseline' : 'grid'}" x1="${padL}" x2="${W - padR}" y1="${y(t)}" y2="${y(t)}"/><text x="${padL - 6}" y="${y(t) + 4}" text-anchor="end">${fmtTick(t)}</text>`; });
    const innerW = W - padL - padR;
    if (kind === 'bar') {
      const slot = innerW / n; const bw = Math.min(24, slot * 0.6);
      points.forEach((p, i) => {
        const x = padL + slot * i + (slot - bw) / 2; const top = y(p.v); const h = Math.max(0, y(0) - top);
        const r = Math.min(4, h);
        svg += `<rect class="bar-bg hit" x="${padL + slot * i}" y="${padT}" width="${slot}" height="${H - padT - padB}" data-i="${i}"/>`;
        if (h > 0) svg += `<path class="bar" d="M${x},${y(0)} v${-(h - r)} a${r},${r} 0 0 1 ${r},${-r} h${bw - 2 * r} a${r},${r} 0 0 1 ${r},${r} v${h - r} z" pointer-events="none"/>`;
        if (i === points.length - 1 && p.v) svg += `<text class="end-label" x="${x + bw / 2}" y="${top - 5}" text-anchor="middle">${p.v}</text>`;
        if (n <= 12 || i % Math.ceil(n / 8) === 0) svg += `<text x="${x + bw / 2}" y="${H - 8}" text-anchor="middle">${esc(fmtShort(p.date))}</text>`;
      });
    } else {
      const xs = (i) => n === 1 ? padL + innerW / 2 : padL + innerW * (i / (n - 1));
      const dates = points.map((p) => p.date);
      const xOf = (date) => { // альтернативные точки кладём по дате между соседями
        if (!points.length) return padL + innerW / 2;
        let i = dates.findIndex((d) => d >= date);
        if (i < 0) return xs(n - 1) + 8; if (i === 0) return xs(0) - (dates[0] > date ? 8 : 0);
        return (xs(i - 1) + xs(i)) / 2 + (dates[i] === date ? (xs(i) - xs(i - 1)) / 2 : 0);
      };
      if (points.length > 1) {
        const path = points.map((p, i) => `${i ? 'L' : 'M'}${xs(i)},${y(p.v)}`).join(' ');
        svg += `<path class="area" d="${path} L${xs(n - 1)},${y(0)} L${xs(0)},${y(0)} z"/><path class="line" d="${path}"/>`;
      }
      points.forEach((p, i) => {
        svg += `<circle class="dot" cx="${xs(i)}" cy="${y(p.v)}" r="4"/><circle class="hit" cx="${xs(i)}" cy="${y(p.v)}" r="14" data-i="${i}"/>`;
        if (i === n - 1) svg += `<text class="end-label" x="${xs(i)}" y="${y(p.v) - 9}" text-anchor="middle">${p.v}</text>`;
        if (n <= 8 || i % Math.ceil(n / 6) === 0 || i === n - 1) svg += `<text x="${xs(i)}" y="${H - 8}" text-anchor="middle">${esc(fmtShort(p.date))}</text>`;
      });
      altPts.forEach((p, j) => {
        const x = xOf(p.date);
        svg += `<circle class="dot dot-alt" cx="${x}" cy="${y(p.v)}" r="5"/><circle class="hit" cx="${x}" cy="${y(p.v)}" r="14" data-alt="${j}"/><text class="end-label" x="${x}" y="${y(p.v) - 10}" text-anchor="middle">${p.v}</text>`;
      });
    }
    svg += '</svg>';
    if (altPts.length) svg += `<div class="legend"><span><span class="sw" style="background:var(--series-1)"></span>обычные подходы</span><span><span class="sw" style="background:var(--series-2)"></span>тест максимума</span></div>`;
    const table = `<table class="data-table hidden"><thead><tr><th>Дата</th><th>${esc(unit)}</th></tr></thead><tbody>${points.map((p) => `<tr><td>${esc(fmtShort(p.date))}</td><td>${p.v}</td></tr>`).join('')}${altPts.map((p) => `<tr><td>${esc(fmtShort(p.date))} (тест)</td><td>${p.v}</td></tr>`).join('')}</tbody></table>`;
    wrap.innerHTML = svg + table;

    const tip = $('#tooltip');
    $$('.hit', wrap).forEach((h) => {
      const show = (ev) => {
        const p = h.dataset.alt != null ? altPts[+h.dataset.alt] : points[+h.dataset.i];
        tip.textContent = tipFn(p) + (h.dataset.alt != null ? ' (тест)' : '');
        tip.hidden = false;
        const x = Math.min(window.innerWidth - tip.offsetWidth - 8, Math.max(8, ev.clientX - tip.offsetWidth / 2));
        tip.style.left = x + 'px'; tip.style.top = (ev.clientY - 44) + 'px';
      };
      h.addEventListener('pointerenter', show); h.addEventListener('pointermove', show);
      h.addEventListener('pointerleave', () => { tip.hidden = true; });
      h.addEventListener('click', show);
    });
    $('[data-toggle]', el).addEventListener('click', (e) => { const t = $('.data-table', wrap); const s = $('svg', wrap); t.classList.toggle('hidden'); s.classList.toggle('hidden'); e.target.textContent = t.classList.contains('hidden') ? 'Таблица' : 'График'; });
  }
  function niceMax(v) { const p = Math.pow(10, Math.floor(Math.log10(v))); const m = v / p; const f = m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10; return f * p; }
  function fmtTick(t) { return Number.isInteger(t) ? String(t) : t.toFixed(1).replace('.', ','); }

  // --- План ---
  function renderPlan() {
    if (planWeek == null) planWeek = state.cursor.week;
    const plan = planForWeek(planWeek);
    const info = plan.info;
    const head = card(`
      <div class="week-nav">
        <button class="btn btn-ghost btn-sm" type="button" id="pw-prev" ${planWeek <= 1 ? 'disabled' : ''}>‹ Неделя ${planWeek - 1}</button>
        <div style="text-align:center"><h1>Неделя ${planWeek}</h1><div class="small">блок ${info.block + 1}${info.deload ? ' · разгрузка' : ' · рабочая ' + (info.pos + 1) + ' из 3'}${planWeek === state.cursor.week ? ' · текущая' : ''}</div></div>
        <button class="btn btn-ghost btn-sm" type="button" id="pw-next">Неделя ${planWeek + 1} ›</button>
      </div>`);
    $('#pw-prev', head).addEventListener('click', () => { planWeek = Math.max(1, planWeek - 1); render(); });
    $('#pw-next', head).addEventListener('click', () => { planWeek += 1; render(); });

    plan.days.forEach((d) => {
      const optional = state.settings.daysPerWeek === 3 && d.key === 'light';
      card(`<div class="card-head"><h2>${esc(d.title)}</h2>${optional ? '<span class="pill pill-muted">по желанию</span>' : ''}</div>
        <p class="small">${esc(d.summary)}</p>
        ${d.exercises.map((e) => exerciseTargetHtml(e)).join('')}
        <ul class="tips">${d.tips.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>`);
    });

    // Обзор на 12 недель
    let rows = '';
    for (let w = 1; w <= 12; w++) {
      const p = planForWeek(w); const i = p.info;
      const g = (k) => p.days.find((d) => d.key === k).summary;
      rows += `<tr class="${w === state.cursor.week ? 'current' : ''}${i.deload ? ' deload' : ''}"><td>${w}</td><td>${esc(g('volume'))}</td><td>${esc(g('strength'))}</td><td>${esc(g('variety'))}</td><td>${esc(g('light'))}</td></tr>`;
    }
    card(`<h2>Обзор на 12 недель</h2><p class="small">Дальше план продолжается по тем же правилам: каждый блок из 4 недель прибавляет вес и повторения.</p>
      <div class="scroll-x"><table class="plan-table"><thead><tr><th>Нед.</th><th>Объём</th><th>Сила</th><th>Вариативность</th><th>Лёгкий</th></tr></thead><tbody>${rows}</tbody></table></div>`);

    card(`<h2>Правила прогрессии</h2><ul class="tips">
      <li><strong>Структура.</strong> Блок = 3 рабочие недели + 1 разгрузочная с тестом максимума. 3–4 тренировки в неделю, между тяжёлыми днями минимум день отдыха. Лёгкий день можно ставить в любой свободный день.</li>
      <li><strong>Объём (день 1).</strong> 6×8 → 6×9 → 6×10 с запасом 2 повторения. Следующий блок — тот же путь с рюкзаком +2,5 кг, потом +5 кг и так далее. Не вышло — на 2 повторения меньше, но чисто; на следующей неделе снова пробуете.</li>
      <li><strong>Сила (день 2).</strong> 5×5 с рюкзаком: 5 кг → 7,5 кг → 10 кг по блокам. Если 25 повторений идут легко две тренировки подряд — прибавляйте 1,25–2,5 кг раньше. Негативы: 4–5 с → 5–6 с → 6–7 с, потом переход на вес.</li>
      <li><strong>Вариативность (день 3).</strong> 5 подходов обратным и нейтральным хватом, повторения растут на 1 в неделю и на 1 за блок. Тяга гантели 3×10–12: сделали 3×12 — гантель тяжелее на 1–2 кг (приложение подставит новый вес само).</li>
      <li><strong>Лёгкий день.</strong> Вис +5 с в неделю до 60 с, затем +5 кг и снова от 40 с. Лопаточные подтягивания 8 → 12 повторений, затем с паузой вверху.</li>
      <li><strong>Разгрузка.</strong> Каждая 4-я неделя: объём вдвое меньше, веса те же, плюс один подход на максимум. Так суставы и связки успевают за мышцами.</li>
      <li><strong>Когда откатиться.</strong> Два провала подряд в одном дне, боль в локтях или плечах, плохой сон — повторите неделю (кнопка в разделе «Ещё») или сделайте внеплановую разгрузку.</li>
    </ul>`);
  }

  // --- Настройки / Ещё ---
  function renderSettings() {
    const s = state.settings;
    const el = card(`<h1>Программа</h1>
      <div class="field"><label>Тренировок в неделю</label><div class="seg" id="seg-days"><button type="button" data-v="3" class="${s.daysPerWeek === 3 ? 'active' : ''}">3</button><button type="button" data-v="4" class="${s.daysPerWeek === 4 ? 'active' : ''}">4</button></div>
        <small>При 3 днях лёгкий день не входит в цикл, но его можно делать дополнительно.</small></div>
      <div class="field"><label>Силовой день</label><div class="seg" id="seg-mode"><button type="button" data-v="weighted" class="${s.strengthMode === 'weighted' ? 'active' : ''}">С весом</button><button type="button" data-v="negatives" class="${s.strengthMode === 'negatives' ? 'active' : ''}">Негативы</button></div></div>
      <div class="field-row">
        <div class="field"><label for="s-row">Гантель для тяги, кг</label><input id="s-row" type="number" min="0" step="0.5" value="${s.rowWeight || ''}"></div>
        <div class="field"><label for="s-bw">Вес тела, кг</label><input id="s-bw" type="number" min="0" step="0.5" value="${s.bodyweight || ''}" placeholder="необязательно"></div>
      </div>
      <div class="field-row">
        <div class="field"><label for="s-week">Текущая неделя</label><input id="s-week" type="number" min="1" step="1" value="${state.cursor.week}"></div>
        <div class="field"><label>&nbsp;</label><button class="btn btn-ghost" type="button" id="btn-repeat">Начать неделю заново</button></div>
      </div>
      <small>Смена недели обнуляет отметки «сделано» на экране «Сегодня»; записи в дневнике остаются.</small>`);
    $$('#seg-days button', el).forEach((b) => b.addEventListener('click', () => { s.daysPerWeek = +b.dataset.v; save(); render(); }));
    $$('#seg-mode button', el).forEach((b) => b.addEventListener('click', () => { s.strengthMode = b.dataset.v; save(); render(); }));
    $('#s-row', el).addEventListener('change', (e) => { s.rowWeight = +e.target.value || 0; save(); });
    $('#s-bw', el).addEventListener('change', (e) => { s.bodyweight = +e.target.value || null; save(); });
    $('#s-week', el).addEventListener('change', (e) => { startWeek(parseInt(e.target.value, 10) || 1); save(); render(); });
    $('#btn-repeat', el).addEventListener('click', () => { if (confirm('Начать неделю ' + state.cursor.week + ' заново? Отметки «сделано» сбросятся.')) { startWeek(state.cursor.week); save(); render(); toast('Неделя ' + state.cursor.week + ' начата заново'); } });

    const ex = card(`<h1>Сохранение и перенос</h1>
      <p class="small">Данные хранятся только в этом браузере. Чтобы перенести на другой телефон или не потерять при очистке браузера — сохраните файл и импортируйте его там.</p>
      <div class="btn-row">
        ${window.PULLUP_NO_DOWNLOAD ? '' : '<button class="btn" type="button" id="btn-export">Скачать файл</button>'}
        ${navigator.share ? '<button class="btn btn-ghost" type="button" id="btn-share">Поделиться</button>' : ''}
        <button class="btn btn-ghost" type="button" id="btn-import">Импорт из файла</button>
      </div>
      <input type="file" id="file-import" accept="application/json,.json" class="hidden">
      <details style="margin-top:10px"><summary>Текстом (скопировать / вставить)</summary>
        <textarea class="export" id="ta-export" readonly>${esc(JSON.stringify(state))}</textarea>
        <div class="btn-row" style="margin-top:8px"><button class="btn btn-ghost btn-sm" type="button" id="btn-copy">Копировать</button></div>
        <div class="field"><label for="ta-import">Вставьте сохранение сюда</label><textarea class="export" id="ta-import" placeholder='{"version":1, ...}'></textarea></div>
        <div class="btn-row" style="margin-top:8px"><button class="btn btn-ghost btn-sm" type="button" id="btn-import-text">Импортировать из текста</button></div>
      </details>
      <details style="margin-top:10px"><summary>Импорт: заменить или объединить?</summary><p class="small">При импорте тренировки с новыми идентификаторами добавляются к существующим, совпадающие — обновляются. Настройки и текущая неделя берутся из файла. Ничего не теряется, дубликаты не создаются.</p></details>`);
    if ($('#btn-export', ex)) $('#btn-export', ex).addEventListener('click', exportFile);
    if ($('#btn-share', ex)) $('#btn-share', ex).addEventListener('click', shareFile);
    $('#btn-import', ex).addEventListener('click', () => $('#file-import', ex).click());
    $('#file-import', ex).addEventListener('change', (e) => { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => importText(r.result); r.readAsText(f); });
    $('#btn-copy', ex).addEventListener('click', async () => { try { await navigator.clipboard.writeText(JSON.stringify(state)); toast('Скопировано'); } catch (e) { $('#ta-export', ex).select(); toast('Выделено — скопируйте вручную'); } });
    $('#btn-import-text', ex).addEventListener('click', () => importText($('#ta-import', ex).value));

    const misc = card(`<h1>Приложение</h1>
      <dl class="kv"><dt>Тренировок записано</dt><dd>${state.sessions.length}</dd><dt>Дневник ведётся с</dt><dd>${esc(fmtShort(state.createdAt || todayStr()))}</dd><dt>Оффлайн-режим</dt><dd id="sw-status">${'serviceWorker' in navigator ? 'проверяем…' : 'недоступен в этом браузере'}</dd></dl>
      <p class="small" style="margin-top:10px">Чтобы пользоваться без интернета: откройте меню браузера и выберите «Добавить на главный экран» (Android, Chrome) или «На экран Домой» (iPhone, Safari). После первого открытия всё работает оффлайн.</p>
      <div class="btn-row" style="margin-top:8px"><button class="btn btn-ghost btn-sm" type="button" id="btn-install" hidden>Установить приложение</button><button class="btn btn-danger btn-sm" type="button" id="btn-reset">Удалить все данные</button></div>`);
    $('#btn-reset', misc).addEventListener('click', () => { if (confirm('Удалить все тренировки и настройки? Это нельзя отменить. Сначала лучше сделать экспорт.')) { if (confirm('Точно удалить?')) { state = defaultState(); draft = null; saveDraft(); save(); render(); toast('Данные удалены'); } } });
    updateSwStatus();
    if (deferredInstall) { const b = $('#btn-install', misc); b.hidden = false; b.addEventListener('click', async () => { deferredInstall.prompt(); await deferredInstall.userChoice; deferredInstall = null; b.hidden = true; }); }
  }

  function exportFilename() { return `pullups-${todayStr()}.json`; }
  function exportFile() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = exportFilename(); document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    toast('Файл сохранён');
  }
  async function shareFile() {
    try {
      const file = new File([JSON.stringify(state, null, 2)], exportFilename(), { type: 'application/json' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) await navigator.share({ files: [file], title: 'Дневник подтягиваний' });
      else await navigator.share({ title: 'Дневник подтягиваний', text: JSON.stringify(state) });
    } catch (e) { if (e.name !== 'AbortError') { if (window.PULLUP_NO_DOWNLOAD) toast('Не получилось поделиться — скопируйте текстом ниже'); else exportFile(); } }
  }
  function importText(text) {
    let obj;
    try { obj = JSON.parse(text); } catch (e) { toast('Это не похоже на файл сохранения'); return; }
    if (!obj || !Array.isArray(obj.sessions)) { toast('В файле нет тренировок'); return; }
    const incoming = normalize(obj);
    const byId = new Map(state.sessions.map((s) => [s.id, s]));
    let added = 0, updated = 0;
    incoming.sessions.forEach((s) => { if (byId.has(s.id)) updated++; else added++; byId.set(s.id, s); });
    state.sessions = Array.from(byId.values());
    state.settings = incoming.settings; state.cursor = incoming.cursor;
    if (incoming.createdAt && incoming.createdAt < (state.createdAt || '9')) state.createdAt = incoming.createdAt;
    save(); render(); toast(`Импорт: добавлено ${added}, обновлено ${updated}`);
  }

  // ---------- Таймер отдыха ----------
  let timerEnd = 0, timerTick = null, audioCtx = null;
  const timerEl = $('#timer');
  function startTimer(sec) {
    timerEnd = Date.now() + sec * 1000; timerEl.hidden = false; timerEl.classList.remove('done');
    if (timerTick) clearInterval(timerTick);
    timerTick = setInterval(tickTimer, 250); tickTimer();
    try { if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)(); audioCtx.resume(); } catch (e) { /* без звука */ }
  }
  function tickTimer() {
    const left = Math.max(0, Math.round((timerEnd - Date.now()) / 1000));
    $('#timer-time').textContent = `${Math.floor(left / 60)}:${pad(left % 60)}`;
    if (left <= 0) { clearInterval(timerTick); timerTick = null; timerEl.classList.add('done'); beep(); if (navigator.vibrate) navigator.vibrate([200, 100, 200]); setTimeout(() => { if (!timerTick) timerEl.hidden = true; }, 4000); }
  }
  function stopTimer() { if (timerTick) clearInterval(timerTick); timerTick = null; timerEl.hidden = true; }
  function beep() {
    if (!audioCtx) return;
    try {
      [0, 0.25, 0.5].forEach((t) => { const o = audioCtx.createOscillator(); const g = audioCtx.createGain(); o.connect(g); g.connect(audioCtx.destination); o.frequency.value = 880; g.gain.setValueAtTime(0.0001, audioCtx.currentTime + t); g.gain.exponentialRampToValueAtTime(0.3, audioCtx.currentTime + t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + t + 0.2); o.start(audioCtx.currentTime + t); o.stop(audioCtx.currentTime + t + 0.22); });
    } catch (e) { /* пусто */ }
  }
  $('#timer-stop').addEventListener('click', stopTimer);
  $('#timer-plus').addEventListener('click', () => { timerEnd += 15000; if (!timerTick) { timerEl.classList.remove('done'); timerTick = setInterval(tickTimer, 250); } tickTimer(); });
  $('#timer-minus').addEventListener('click', () => { timerEnd -= 15000; tickTimer(); });

  // ---------- Тосты, тема, вкладки ----------
  let toastT = null;
  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 2800); }

  function applyTheme() {
    const t = state.settings.theme || 'auto';
    if (t === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', t);
  }
  $('#btn-theme').addEventListener('click', () => {
    const order = ['auto', 'light', 'dark']; const cur = state.settings.theme || 'auto';
    state.settings.theme = order[(order.indexOf(cur) + 1) % 3]; save(); applyTheme();
    toast('Тема: ' + { auto: 'как в системе', light: 'светлая', dark: 'тёмная' }[state.settings.theme]);
  });
  $$('.tab').forEach((b) => b.addEventListener('click', () => { currentTab = b.dataset.tab; if (currentTab === 'plan') planWeek = null; render(); }));

  // ---------- Оффлайн / PWA ----------
  let deferredInstall = null;
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredInstall = e; if (currentTab === 'settings') render(); });
  function updateOnline() { $('#offline-badge').hidden = navigator.onLine; }
  window.addEventListener('online', updateOnline); window.addEventListener('offline', updateOnline); updateOnline();
  let swState = 'serviceWorker' in navigator ? 'проверяем…' : 'недоступен в этом браузере';
  function updateSwStatus() { const el = $('#sw-status'); if (el) el.textContent = swState; }
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    navigator.serviceWorker.register('sw.js').then((reg) => { swState = 'включён'; updateSwStatus(); reg.addEventListener('updatefound', () => { const nw = reg.installing; nw && nw.addEventListener('statechange', () => { if (nw.state === 'installed' && navigator.serviceWorker.controller) toast('Доступна новая версия — перезагрузите страницу'); }); }); })
      .catch(() => { swState = 'не удалось включить'; updateSwStatus(); });
  } else if (location.protocol === 'file:') { swState = 'файл открыт локально, всё уже оффлайн'; }

  applyTheme();
  render();
})();
