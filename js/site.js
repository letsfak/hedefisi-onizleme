import { klima, kombi, cleanInput, whatsappText, formatNumber as tr, FACTORS, LIMITS, KLIMA_BASE_BTU_PER_M2 } from './calc.js';
import { filterGroups, statusText, ALL } from './refs.js';
import { homeMessage, workMessage, cleanText, cleanWhole, HOME_LIMITS, WORK_LIMITS } from './quote.js';

const WA_NUMBER = '905326067945';
const waLink = (text) => `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(text)}`;
const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const lower = (s) => s.toLocaleLowerCase('tr');
const two = (n) => tr(n, 2);
const idle = (fn, timeout = 3000) => ('requestIdleCallback' in window ? requestIdleCallback(fn, { timeout }) : setTimeout(fn, 1500));

/* ---------- reveal once on entering the viewport; never leaves content hidden ---------- */
function initReveal() {
  const targets = document.querySelectorAll('[data-reveal]');
  if (!targets.length) return;
  if (!('IntersectionObserver' in window)) {
    targets.forEach((el) => el.classList.add('is-in'));
    return;
  }
  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add('is-in');
      io.unobserve(entry.target);
    }
  }, { rootMargin: '0px 0px -10% 0px', threshold: 0.08 });
  targets.forEach((el) => io.observe(el));
  // A jump (an anchor link, the End key, a fast fling) can skip a block without it ever intersecting.
  // Anything already above the bottom of the screen is shown; the listener goes away once all are in.
  let pending = [...targets];
  let queued = false;
  const sweep = () => {
    queued = false;
    const limit = innerHeight * 0.95;
    pending = pending.filter((el) => {
      if (el.classList.contains('is-in')) return false;
      if (el.hidden) return true; // a filtered-out group keeps its entrance for when it is shown
      if (el.getBoundingClientRect().top >= limit) return true;
      el.classList.add('is-in');
      io.unobserve(el);
      return false;
    });
    if (!pending.length) window.removeEventListener('scroll', onScroll);
  };
  const onScroll = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(sweep);
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('load', () => setTimeout(sweep, 2500));
}

/* ---------- hero dial: the season decides the mode; CSS draws the set point (--temp) ---------- */
function initDial() {
  const month = Number(document.documentElement.dataset.month) || new Date().getMonth() + 1;
  const cooling = document.documentElement.dataset.season === 'cool';
  const mode = document.querySelector('[data-dial-mode]');
  if (mode) mode.textContent = `${MONTHS[month - 1]}, ${cooling ? 'soğutma' : 'ısıtma'}`;
  if (document.documentElement.dataset.hero !== 'live') return;
  import('./hero-air.js')
    .then((m) => m.startHeroAir())
    .catch(() => { delete document.documentElement.dataset.hero; });
}

/* ---------- capacity calculator; its last result is offered to the home quote ---------- */
const calcState = { touched: false, input: null, klima: null, kombi: null };

function readForm(form) {
  const data = new FormData(form);
  return cleanInput({
    oda: data.get('oda'),
    daire: data.get('daire'),
    cephe: data.get('cephe'),
    kat: data.get('kat'),
    yalitim: data.get('yalitim'),
  });
}

function setText(selector, text) {
  const el = document.querySelector(`[data-out="${selector}"]`);
  if (el && el.textContent !== text) el.textContent = text;
}

function bump(el) {
  if (!el || reduceMotion) return;
  el.classList.remove('is-bump');
  void el.offsetWidth; // restart the animation
  el.classList.add('is-bump');
}

function renderCalc(input) {
  const k = klima(input);
  const b = kombi(input);
  const cephe = FACTORS.cephe[input.cephe];
  const kat = FACTORS.kat[input.kat];
  const yal = FACTORS.yalitim[input.yalitim];

  const klimaSize = k.size ? tr(k.size) : '24.000+';
  const kombiSize = b.size ? String(b.size) : '35+';
  const prevK = document.querySelector('[data-out="klima-size"]')?.textContent;
  const prevB = document.querySelector('[data-out="kombi-size"]')?.textContent;

  setText('klima-size', klimaSize);
  setText('kombi-size', kombiSize);
  setText('klima-what', k.size ? 'klima, bu oda için' : 'tek cihazı aşar: multi split ya da VRV');
  setText('kombi-what', b.size ? `kombi, ${input.daire} m² daire` : 'kombiyi aşar: kazan ya da kaskad');
  setText('klima-formula',
    `${input.oda} m² × ${KLIMA_BASE_BTU_PER_M2} BTU × ${two(k.factors.cephe)} ${lower(cephe.label)} × ${two(k.factors.kat)} ${lower(kat.label)} × ${two(k.factors.yalitim)} ${lower(yal.label)} yalıtım = ${tr(k.btu)} BTU${k.size ? '' : ', tek cihazı aşıyor: multi split ya da VRV gerekir'}`);
  setText('kombi-formula',
    `${input.daire} m² × ${b.factors.watt} W × ${two(b.factors.kat)} ${lower(kat.label)} × ${two(b.factors.cephe)} ${lower(cephe.label)} = ${tr(b.loss, 1)} kW ısı kaybı${b.size ? '' : ', kombi boyunu aşıyor: kazan ya da kaskad sistem gerekir'}`);

  if (prevK !== klimaSize) bump(document.querySelector('.result__disc--cold'));
  if (prevB !== kombiSize) bump(document.querySelector('.result__disc--heat'));

  setText('summary', `Klima ${klimaSize} BTU, kombi ${kombiSize} kW.`);

  const link = document.getElementById('calc-wa');
  if (link) link.href = waLink(whatsappText(input));

  calcState.input = input;
  calcState.klima = k;
  calcState.kombi = b;
}

function initCalc() {
  const form = document.getElementById('calc');
  if (!form) return;
  const update = () => renderCalc(readForm(form));
  const touch = () => { calcState.touched = true; };

  form.addEventListener('input', () => { touch(); update(); });
  form.addEventListener('change', (event) => {
    const field = event.target;
    if (field.type === 'number') {
      const limits = LIMITS[field.name];
      const clean = readForm(form)[field.name];
      if (limits) field.value = String(clean);
    }
    touch();
    update();
  });
  form.addEventListener('submit', (event) => event.preventDefault());

  form.querySelectorAll('[data-step]').forEach((button) => {
    button.addEventListener('click', () => {
      const field = document.getElementById(button.dataset.for);
      const limits = LIMITS[field.name];
      const current = Math.round(Number(String(field.value).replace(',', '.'))) || limits.fallback;
      const next = Math.min(limits.max, Math.max(limits.min, current + Number(button.dataset.step)));
      field.value = String(next);
      touch();
      update();
    });
  });
  document.querySelector('[data-from-calc]')?.addEventListener('click', touch);
  update();
}

/* ---------- coefficient table: open without script, folded with it ---------- */
function initCoef() {
  const toggle = document.querySelector('.coef__toggle');
  const panel = document.getElementById('coef-panel');
  if (!toggle || !panel) return;
  const set = (open) => { toggle.setAttribute('aria-expanded', String(open)); panel.hidden = !open; };
  set(false);
  toggle.addEventListener('click', () => set(panel.hidden));
}

/* ---------- services: one disc, its colour is the mode ---------- */
const SERVICES = {
  klima: {
    mode: 'cold', modeText: 'Yazın soğutur, kışın ısıtır', img: 'img/hizmet-klima.webp',
    alt: 'Duvar tipi klimanın iç ünitesi, yakından',
    text: 'Ev ve iş yeri için duvar tipi, multi split ve ticari klimalar. Daikin bayisi olarak satış, montaj ve bakım.',
    ask: 'Klima', path: 'ev', ne: 'Klima',
  },
  vrv: {
    mode: 'cold', modeText: 'Binanın tamamını soğutur ve ısıtır', img: 'img/hizmet-vrv.webp',
    alt: 'Bir binanın çatısında sıra sıra VRV dış üniteleri',
    text: 'Tek dış ünite grubunun bir binadaki çok sayıda iç üniteyi beslediği değişken debili sistem. Otel, ofis, mağaza ve site projeleri için.',
    ask: 'VRV sistemi', path: 'is', ne: '',
  },
  isipompasi: {
    mode: 'both', modeText: 'Havadan ısı alır; kışın ısıtır, yazın soğutur', img: 'img/hizmet-isipompasi.webp',
    alt: 'Isıtma tesisatında termometreli, yalıtımlı borular',
    text: 'Dış havadaki ısıyı içeri taşır. Kombiye ek ya da onun yerine kullanılır; yerden ısıtmayla iyi çalışır.',
    ask: 'Isı pompası', path: 'ev', ne: 'Isı pompası',
  },
  kombi: {
    mode: 'heat', modeText: 'Isıtır, sıcak su verir', img: 'img/hizmet-kombi.webp',
    alt: 'Modern bir mutfakta duvara asılı kombi',
    text: 'Kombi satışı ve montajı, eski kombinin değişimi, doğalgaz iç tesisatı ve yıllık bakım.',
    ask: 'Kombi ve doğalgaz', path: 'ev', ne: 'Kombi',
  },
  yerden: {
    mode: 'heat', modeText: 'Odayı tabandan ısıtır', img: 'img/hizmet-yerden.webp',
    alt: 'Yerden ısıtma kollektörü ve boruları',
    text: 'Şap altına döşenen borularla ısı tabandan yükselir. Kombiyle de ısı pompasıyla da çalışır.',
    ask: 'Yerden ısıtma', path: 'ev', ne: '',
  },
  tesisat: {
    mode: 'ink', modeText: 'Can ve hava güvenliği', img: 'img/hizmet-tesisat.webp',
    alt: 'Yeni bir binanın koridorunda havalandırma kanalları ve yangın alarmı',
    text: 'Yangın tesisatı, havalandırma kanalları, temiz ve pis su, havuz tesisatı ve komple mekanik taahhüt.',
    ask: 'Yangın ve havalandırma tesisatı', path: 'is', ne: '',
  },
};

function initServices() {
  const buttons = [...document.querySelectorAll('[data-svc]')];
  const disc = document.querySelector('.svc__disc');
  const img = document.querySelector('[data-svc-img]');
  const pic = img?.closest('.svc__pic');
  const modeEl = document.querySelector('[data-svc-mode]');
  const textEl = document.querySelector('[data-svc-text]');
  const linkEl = document.querySelector('[data-svc-link]');
  if (!buttons.length || !disc || !img || !pic || !modeEl || !textEl || !linkEl) return;

  let timer = 0;
  const select = (key) => {
    const s = SERVICES[key];
    if (!s) return;
    buttons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.svc === key)));
    disc.dataset.mode = s.mode;
    modeEl.textContent = s.modeText;
    textEl.textContent = s.text;
    linkEl.textContent = `${s.ask} için keşif iste`;
    linkEl.dataset.path = s.path;
    linkEl.dataset.ne = s.ne;
    clearTimeout(timer);
    pic.classList.add('is-swapping');
    timer = setTimeout(() => {
      img.src = s.img;
      img.alt = s.alt;
      const done = () => pic.classList.remove('is-swapping');
      if (img.complete) done();
      else {
        img.addEventListener('load', done, { once: true });
        img.addEventListener('error', done, { once: true });
      }
    }, reduceMotion ? 0 : 160);
  };
  buttons.forEach((b) => b.addEventListener('click', () => select(b.dataset.svc)));
  idle(() => Object.values(SERVICES).forEach((s) => { const i = new Image(); i.src = s.img; }), 4000);
}

/* ---------- reference projects: one chip shows one group; every group is visible without script ---------- */
function initProjects() {
  const chips = [...document.querySelectorAll('.refs [data-filter]')];
  const blocks = [...document.querySelectorAll('.rgroup[data-group]')];
  const status = document.querySelector('[data-refs-status]');
  if (!chips.length || !blocks.length) return;
  const groups = blocks.map((el) => ({
    key: el.dataset.group,
    label: el.querySelector('.rhead__title')?.textContent.trim() || el.dataset.group,
    count: Number(el.dataset.count),
  }));
  const select = (key) => {
    const state = filterGroups(groups, key);
    chips.forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.filter === state.active)));
    blocks.forEach((el) => { el.hidden = !state.visible.includes(el.dataset.group); });
    if (status) status.textContent = statusText(groups, state);
  };
  chips.forEach((c) => c.addEventListener('click', () => select(c.dataset.filter || ALL)));
}

/* ---------- maintenance: mark today and say what comes next ---------- */
function careMessage(month) {
  if (month === 5) return 'Bu ay klima bakımı ayı. Sıcaklar başlamadan filtre, gaz ve drenaj kontrolü.';
  if (month === 9) return 'Bu ay kombi bakımı ayı. Petekler ısınmadan önce yanma ve basınç kontrolü.';
  if (month >= 6 && month <= 8) return 'Sıradaki bakım Eylül’de: kombi. Klimanız Mayıs’ta bakım görmediyse sıcaklar bitmeden yaptırın.';
  if (month >= 1 && month <= 4) return 'Sıradaki bakım Mayıs’ta: klima. Kombiniz geçen Eylül bakım görmediyse şimdi de yapılır.';
  return 'Sıradaki bakım Mayıs’ta: klima. Kombinizin Eylül bakımı yapılmadıysa kış ortasından önce yaptırın.';
}

function initCare() {
  document.querySelectorAll('.year li').forEach((item, i) => item.style.setProperty('--m', String(i)));
  const month = Number(document.documentElement.dataset.month) || new Date().getMonth() + 1;
  const li = document.querySelector(`.year li[data-m="${month}"]`);
  if (li) {
    li.classList.add('is-now');
    li.setAttribute('aria-current', 'date');
  }
  const now = document.querySelector('[data-care-now]');
  if (now) now.textContent = `Bugün ${MONTHS[month - 1]}. ${careMessage(month)}`;
}

/* ---------- survey coupon: home photo quote and project form; builds a WhatsApp message, stores nothing ---------- */
const ORDINAL = ['1’i', '2’si', '3’ü', '4’ü'];
const CALC_DEVICE = { Klima: 'oda', Kombi: 'daire', 'Isı pompası': 'daire' };

function calcHint(ne) {
  if (!calcState.touched || !calcState.input) return null;
  const { input, klima: k, kombi: b } = calcState;
  if (ne === 'Klima') {
    return { m2: input.oda, hesap: k.size ? `yaklaşık ${tr(k.size)} BTU klima` : 'tek cihazı aşıyor, multi split ya da VRV' };
  }
  if (ne === 'Kombi') {
    return { m2: input.daire, hesap: b.size ? `yaklaşık ${b.size} kW kombi` : 'kombi boyunu aşıyor, kazan ya da kaskad' };
  }
  return { m2: input.daire, hesap: `yaklaşık ${tr(b.loss, 1)} kW ısı kaybı` };
}

function addRow(dl, label, value) {
  const row = document.createElement('div');
  const dt = document.createElement('dt');
  const dd = document.createElement('dd');
  dt.textContent = label;
  dd.textContent = value;
  row.append(dt, dd);
  dl.append(row);
}

function createStepper(form, kind) {
  const steps = [...form.querySelectorAll('[data-step]')];
  const dots = [...form.querySelectorAll('.quote__progress span')];
  const count = form.querySelector('[data-count]');
  const error = form.querySelector('.quote__error');
  const back = form.querySelector('[data-back]');
  const next = form.querySelector('[data-next]');
  const send = form.querySelector('[data-send]');
  const summary = form.querySelector('[data-summary]');
  const last = steps.length - 1;
  let at = 0;

  const field = (name) => form.elements.namedItem(name);
  const value = (name) => {
    const f = field(name);
    if (!f) return '';
    if (f instanceof RadioNodeList) return f.value;
    return f.value;
  };

  // home: the size step follows the chosen device and takes the calculator's numbers when they exist
  const sizeQ = form.querySelector('[data-size-q]');
  const sizeLabel = form.querySelector('[data-size-label]');
  const hint = form.querySelector('[data-calc-hint]');
  const syncSize = () => {
    if (kind !== 'ev') return;
    const ne = value('ne');
    const room = CALC_DEVICE[ne] !== 'daire';
    if (sizeQ) sizeQ.textContent = room ? 'Oda ne kadar büyük?' : 'Daire ne kadar büyük?';
    if (sizeLabel) sizeLabel.textContent = room ? 'Oda alanı, m²' : 'Dairenin tamamı, m²';
    const m2 = field('m2');
    const fromCalc = ne ? calcHint(ne) : null;
    if (fromCalc && m2 && (!m2.value || m2.dataset.auto === '1')) {
      m2.value = String(fromCalc.m2);
      m2.dataset.auto = '1';
    }
    if (hint) {
      hint.hidden = !fromCalc;
      hint.textContent = fromCalc ? `Hesaplayıcıdaki sonucunuz eklendi: ${fromCalc.hesap}.` : '';
    }
  };
  form.addEventListener('change', (e) => { if (e.target.name === 'ne') syncSize(); });
  field('m2')?.addEventListener('input', (e) => { e.target.dataset.auto = '0'; });

  const problem = (i) => {
    if (kind === 'ev') {
      if (i === 0 && !value('ne')) return { msg: 'Bir seçenek seçin.', name: 'ne' };
      if (i === 1 && cleanWhole(value('m2'), HOME_LIMITS.m2) === null) return { msg: 'Alanı metrekare olarak yazın, örneğin 20.', name: 'm2' };
    } else {
      if (i === 0 && !value('tur')) return { msg: 'Bina türünü seçin.', name: 'tur' };
      if (i === 1 && cleanWhole(value('m2'), WORK_LIMITS.m2) === null) return { msg: 'Kapalı alanı metrekare olarak yazın, örneğin 2500.', name: 'm2' };
      if (i === 1 && value('kat').trim() && cleanWhole(value('kat'), WORK_LIMITS.kat) === null) return { msg: 'Kat sayısını rakamla yazın ya da boş bırakın.', name: 'kat' };
      if (i === 2 && !value('zaman')) return { msg: 'Projenin aşamasını seçin.', name: 'zaman' };
    }
    return null;
  };

  const clearError = () => {
    error.hidden = true;
    error.textContent = '';
    form.querySelectorAll('[aria-invalid]').forEach((f) => { f.removeAttribute('aria-invalid'); f.removeAttribute('aria-describedby'); });
  };
  const showError = ({ msg, name }) => {
    error.id = `${form.id}-error`;
    error.textContent = msg;
    error.hidden = false;
    const f = field(name);
    const target = f instanceof RadioNodeList ? f[0] : f;
    if (target) {
      target.setAttribute('aria-invalid', 'true');
      target.setAttribute('aria-describedby', error.id);
      target.focus();
    }
  };

  const data = () => {
    if (kind === 'ev') {
      const ne = value('ne');
      const fromCalc = calcHint(ne);
      return {
        ne,
        m2: cleanWhole(value('m2'), HOME_LIMITS.m2),
        hesap: fromCalc && field('m2')?.dataset.auto === '1' ? fromCalc.hesap : '',
        ad: cleanText(value('ad'), 60),
        yer: cleanText(value('yer'), 60),
      };
    }
    return {
      tur: value('tur'),
      m2: cleanWhole(value('m2'), WORK_LIMITS.m2),
      kat: cleanWhole(value('kat'), WORK_LIMITS.kat),
      zaman: value('zaman'),
      ad: cleanText(value('ad'), 60),
      firma: cleanText(value('firma'), 80),
    };
  };

  const fillSummary = () => {
    if (!summary) return;
    summary.replaceChildren();
    const d = data();
    if (kind === 'ev') {
      addRow(summary, 'Ne için', d.ne);
      addRow(summary, CALC_DEVICE[d.ne] === 'daire' ? 'Daire' : 'Oda', `${d.m2.toLocaleString('tr-TR')} m²`);
      if (d.hesap) addRow(summary, 'Hesaplayıcı', d.hesap);
      addRow(summary, 'Fotoğraflar', 'WhatsApp’ta eklenecek');
    } else {
      addRow(summary, 'Bina', d.tur);
      addRow(summary, 'Kapalı alan', `${d.m2.toLocaleString('tr-TR')} m²`);
      if (d.kat) addRow(summary, 'Kat sayısı', String(d.kat));
      addRow(summary, 'Aşama', d.zaman);
      addRow(summary, 'Çizim, proje', 'WhatsApp’ta eklenecek');
    }
  };

  // after a step change the focus goes to the step's own control, or to its question when it has none
  const focusStep = () => {
    const step = steps[at];
    const target = step.querySelector('input:checked') || step.querySelector('input');
    if (target) { target.focus({ preventScroll: true }); return; }
    const legend = step.querySelector('legend');
    if (legend) { legend.tabIndex = -1; legend.focus({ preventScroll: true }); }
  };

  const render = (move = 0) => {
    steps.forEach((s, i) => {
      s.hidden = i !== at;
      s.classList.toggle('is-entering', i === at && move !== 0 && !reduceMotion);
    });
    dots.forEach((d, i) => {
      d.classList.toggle('is-done', i < at);
      d.classList.toggle('is-now', i === at);
    });
    if (count) count.textContent = `${steps.length} adımdan ${ORDINAL[at]}`;
    back.hidden = at === 0;
    next.hidden = at === last;
    send.hidden = at !== last;
    if (at === last) fillSummary();
    if (at === 1) syncSize();
  };

  const go = (dir) => {
    if (dir > 0) {
      const p = problem(at);
      if (p) { showError(p); return; }
    }
    clearError();
    at = Math.min(last, Math.max(0, at + dir));
    render(dir);
    focusStep();
  };

  back.addEventListener('click', () => go(-1));
  next.addEventListener('click', () => go(1));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (at < last) { go(1); return; }
    for (let i = 0; i < last; i += 1) {
      const p = problem(i);
      if (p) { at = i; render(-1); showError(p); return; }
    }
    const text = kind === 'ev' ? homeMessage(data()) : workMessage(data());
    window.location.href = waLink(text);
  });
  render();
}

function initQuote() {
  const forms = { ev: document.getElementById('quote-ev'), is: document.getElementById('quote-is') };
  const tabs = [...document.querySelectorAll('.switch__btn')];
  if (!forms.ev || !forms.is || !tabs.length) return { show() {} };
  createStepper(forms.ev, 'ev');
  createStepper(forms.is, 'is');
  const show = (kind, focus = false, ne = '') => {
    if (kind === 'ev' && ne) {
      const radio = [...forms.ev.querySelectorAll('input[name="ne"]')].find((r) => r.value === ne);
      if (radio && !radio.checked) {
        radio.checked = true;
        radio.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
    tabs.forEach((t) => {
      const on = t.dataset.kind === kind;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      if (on && focus) t.focus();
    });
    Object.entries(forms).forEach(([k, f]) => { f.hidden = k !== kind; });
  };
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => show(t.dataset.kind));
    t.addEventListener('keydown', (e) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
      e.preventDefault();
      const j = e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
      show(tabs[j].dataset.kind, true);
    });
  });
  return { show };
}

/* ---------- the two ways in point at the coupon and pick its tab ---------- */
function initPaths(quote) {
  document.querySelectorAll('a[data-path]').forEach((a) => {
    a.addEventListener('click', () => quote.show(a.dataset.path, false, a.dataset.ne));
  });
}

/* ---------- phone bar: shows after the first screen, steps aside at the coupon and the footer ---------- */
function initDock() {
  const dock = document.querySelector('[data-dock]');
  const start = document.querySelector('[data-dock-start]');
  if (!dock || !start || !('IntersectionObserver' in window)) { dock?.classList.add('is-on'); return; }
  const hideZones = [...document.querySelectorAll('[data-dock-hide], .foot')];
  let past = false;
  const inZone = new Set();
  const sync = () => dock.classList.toggle('is-on', past && inZone.size === 0);
  new IntersectionObserver(([e]) => {
    past = e.isIntersecting || e.boundingClientRect.top < 0;
    sync();
  }).observe(start);
  const zoneIo = new IntersectionObserver((entries) => {
    entries.forEach((e) => (e.isIntersecting ? inZone.add(e.target) : inZone.delete(e.target)));
    sync();
  }, { rootMargin: '0px 0px -20% 0px' });
  hideZones.forEach((z) => zoneIo.observe(z));
}

window.__hedefReady = true;
initReveal();
initDial();
initCalc();
initCoef();
initServices();
initProjects();
initCare();
initPaths(initQuote());
initDock();
