// Hero scene controller. The pinned hero is a thermostat: scrolling (or dragging the dial's marker)
// turns the set point, the dial and number follow at once (plain CSS custom properties), and after
// the first paint a WebGL air field joins in. If WebGL is missing the page drops back to the static dial.
import { createAir } from './air-gl.js';
import {
  progressFrom, dialFromProgress, settleFromProgress, warmFromDial, tempFromDial,
  dialFromAngle, damp, particleBudget, renderDpr,
} from './air-math.js';

const root = document.documentElement;
const SMOOTH = 6; // 1/s: how quickly the scene catches up with the scrollbar
const SNAP = 1e-4;
const QUIET_PAD = 14; // CSS px of calmer air around text the air passes over

function revertToStatic(dial) {
  delete root.dataset.hero;
  if (dial) ['--k', '--w', '--temp'].forEach((p) => dial.style.removeProperty(p));
}

function afterFirstPaint(fn) {
  const go = () => ('requestIdleCallback' in window ? requestIdleCallback(fn, { timeout: 1200 }) : setTimeout(fn, 300));
  if (document.readyState === 'complete') go();
  else window.addEventListener('load', go, { once: true });
}

// One padded rectangle around some elements, relative to the stage (null if none are laid out).
function boxAround(elements, base) {
  const rects = [...elements].map((el) => el.getBoundingClientRect()).filter((r) => r.width && r.height);
  if (!rects.length) return null;
  return {
    left: Math.min(...rects.map((r) => r.left)) - base.left - QUIET_PAD,
    right: Math.max(...rects.map((r) => r.right)) - base.left + QUIET_PAD,
    top: Math.min(...rects.map((r) => r.top)) - base.top - QUIET_PAD,
    bottom: Math.max(...rects.map((r) => r.bottom)) - base.top + QUIET_PAD,
  };
}

const centreOf = (el, base) => {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2 - base.left, y: r.top + r.height / 2 - base.top, r: r.width / 2 };
};

export function startHeroAir() {
  const hero = document.querySelector('.hero');
  const stage = hero?.querySelector('.hero__stage');
  const dial = stage?.querySelector('.dial');
  if (!hero || !stage || !dial || root.dataset.hero !== 'live') {
    revertToStatic(dial);
    return;
  }

  const season = root.dataset.season === 'cool' ? 'cool' : 'heat';
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const s = {
    top: 0, run: 1, k: 0, kTarget: 0, settle: 0, settleTarget: 0,
    kShown: -1, temp: NaN, visible: true, raf: 0, last: 0, scrollDirty: true, dragging: false, still: false,
  };
  const pauseButton = stage.querySelector('.hero__pause');
  let air = null;
  let canvas = null;

  const measure = () => {
    s.top = hero.getBoundingClientRect().top + window.scrollY;
    s.run = hero.offsetHeight - stage.offsetHeight;
  };

  const readScroll = () => {
    const p = progressFrom(window.scrollY, s.top, s.run);
    s.kTarget = dialFromProgress(p);
    s.settleTarget = settleFromProgress(p);
  };

  // set on the dial, not the stage: only its handful of nodes restyle on each frame
  const paintDom = () => {
    if (Math.abs(s.k - s.kShown) > 0.0005 || (s.k === s.kTarget && s.k !== s.kShown)) {
      dial.style.setProperty('--k', s.k.toFixed(4));
      dial.style.setProperty('--w', warmFromDial(s.k, season).toFixed(4));
      s.kShown = s.k;
    }
    const t = tempFromDial(s.k, season);
    if (t !== s.temp) {
      dial.style.setProperty('--temp', String(t));
      s.temp = t;
    }
  };

  const schedule = () => {
    if (!s.raf && s.visible && !document.hidden) s.raf = requestAnimationFrame(frame);
  };
  const pause = () => {
    if (s.raf) cancelAnimationFrame(s.raf);
    s.raf = 0;
    s.last = 0;
  };

  function frame(now) {
    s.raf = 0;
    const dt = s.last ? Math.min(0.05, (now - s.last) / 1000) : 1 / 60;
    s.last = now;
    if (s.scrollDirty && !s.dragging) readScroll();
    s.scrollDirty = false;
    s.k = s.dragging ? s.kTarget : damp(s.k, s.kTarget, SMOOTH, dt); // the knob stays under the finger
    s.settle = damp(s.settle, s.settleTarget, SMOOTH, dt);
    if (Math.abs(s.k - s.kTarget) < SNAP) s.k = s.kTarget;
    if (Math.abs(s.settle - s.settleTarget) < SNAP) s.settle = s.settleTarget;
    paintDom();
    // paused: the air holds still (no time passes) but still follows the dial when the user scrolls
    if (air) air.draw(s.still ? 0 : dt, { warm: warmFromDial(s.k, season), settle: s.settle });
    if ((air && !s.still) || s.k !== s.kTarget || s.settle !== s.settleTarget) schedule();
    else s.last = 0;
  }

  /* ---------- WebGL air, started after the static hero has painted ---------- */
  const sizeAir = () => air?.resize(stage.clientWidth, stage.clientHeight, renderDpr(window.devicePixelRatio, coarse));

  const shapeAir = () => {
    if (!air) return;
    const base = stage.getBoundingClientRect();
    air.setShapes({
      discs: [...dial.querySelectorAll('.dial__main, .dial__pair')].map((el) => centreOf(el, base)),
      quiet: boxAround(dial.querySelectorAll('.dial__read'), base),
      calm: boxAround(stage.querySelectorAll('.hero__text h1, .hero__lead, .hero__actions'), base),
    });
  };

  let gone = false; // set once the page has gone back to the static dial
  const makeAir = async () => {
    const made = await createAir(canvas, {
      count: particleBudget({ width: stage.clientWidth, height: stage.clientHeight, coarse }),
      coarse,
    });
    if (gone || !made) {
      made?.dispose();
      return false;
    }
    air = made;
    sizeAir();
    shapeAir();
    canvas.classList.add('is-on');
    schedule();
    return true;
  };

  const startAir = async () => {
    if (root.dataset.hero !== 'live' || gone) return;
    canvas = document.createElement('canvas');
    canvas.className = 'hero__air';
    canvas.setAttribute('aria-hidden', 'true');
    dial.after(canvas);
    if (!(await makeAir())) {
      if (!gone) goStatic();
      return;
    }
    canvas.addEventListener('webglcontextlost', (event) => {
      event.preventDefault();
      air = null;
      canvas.classList.remove('is-on');
    });
    canvas.addEventListener('webglcontextrestored', makeAir);
    if (pauseButton) {
      pauseButton.hidden = false;
      pauseButton.addEventListener('click', togglePause);
    }
    // the discs grow in on load; re-read their size once that finishes, and once the font is in
    const settled = dial.getAnimations?.({ subtree: true }).map((a) => a.finished.catch(() => {})) || [];
    Promise.all(settled).then(shapeAir);
    document.fonts?.ready.then(shapeAir);
  };

  /* ---------- a way to stop the ambient motion (WCAG 2.2.2), like the video's button ---------- */
  function togglePause() {
    s.still = !s.still;
    pauseButton.setAttribute('aria-pressed', String(s.still));
    pauseButton.textContent = s.still ? 'Hareketi başlat' : 'Hareketi durdur';
    schedule();
  }

  /* ---------- dragging the marker turns the dial (touch and mouse) ---------- */
  const dot = dial.querySelector('.dial__marker span');
  const disc = dial.querySelector('.dial__main');
  let knob = null;
  const readKnob = () => {
    const cs = getComputedStyle(stage);
    return {
      end: parseFloat(cs.getPropertyValue('--a1')) || 0,
      travel: parseFloat(cs.getPropertyValue('--travel')) || 0,
      dir: parseFloat(cs.getPropertyValue('--dir')) || 1,
    };
  };
  const onDrag = (event) => {
    if (!s.dragging || !knob) return;
    const r = disc.getBoundingClientRect();
    const angle = Math.atan2(event.clientX - (r.left + r.width / 2), r.top + r.height / 2 - event.clientY) * (180 / Math.PI);
    s.kTarget = dialFromAngle(angle, knob.end, knob.travel, knob.dir);
    schedule();
  };
  const onGrab = (event) => {
    if (event.button > 0) return;
    knob = readKnob();
    s.dragging = true;
    dot.setPointerCapture?.(event.pointerId);
    dot.classList.add('is-grabbed');
    event.preventDefault();
    onDrag(event);
  };
  // Last input wins: after a drag the dial keeps the set value (as a thermostat would) until the
  // page is scrolled again, which hands control back to the scrollbar.
  const onRelease = () => {
    s.dragging = false;
    dot.classList.remove('is-grabbed');
  };

  /* ---------- wiring ---------- */
  const onScroll = () => { s.scrollDirty = true; schedule(); };
  const onVisibility = () => (document.hidden ? pause() : schedule());
  const resize = new ResizeObserver(() => {
    measure();
    sizeAir();
    shapeAir();
    s.scrollDirty = true;
    schedule();
  });
  const seen = new IntersectionObserver(([entry]) => {
    s.visible = entry.isIntersecting;
    if (s.visible) schedule(); else pause();
  });

  const calmQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const onCalm = () => { if (calmQuery.matches) goStatic(); };

  function teardown() {
    pause();
    window.removeEventListener('scroll', onScroll);
    document.removeEventListener('visibilitychange', onVisibility);
    calmQuery.removeEventListener?.('change', onCalm);
    resize.disconnect();
    seen.disconnect();
    if (dot) {
      dot.removeEventListener('pointerdown', onGrab);
      dot.removeEventListener('pointermove', onDrag);
      ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((type) => dot.removeEventListener(type, onRelease));
    }
  }

  // Back to the static dial (WebGL refused, or reduced motion switched on mid-visit). Dropping the
  // pin removes scroll room, so keep whatever follows the hero where the reader was looking.
  function goStatic() {
    gone = true;
    const next = hero.nextElementSibling;
    const before = next ? next.getBoundingClientRect().top : 0;
    teardown();
    air?.dispose();
    air = null;
    canvas?.remove();
    canvas = null;
    if (pauseButton) pauseButton.hidden = true;
    revertToStatic(dial);
    if (next && window.scrollY > s.top) {
      const shift = next.getBoundingClientRect().top - before; // 0 if the browser's scroll anchoring already did it
      if (shift) window.scrollBy(0, shift);
    }
  }

  measure();
  readScroll();
  s.k = s.kTarget; // a reload halfway down the page starts in place, without replaying the turn
  s.settle = s.settleTarget;
  s.scrollDirty = false;
  paintDom();

  window.addEventListener('scroll', onScroll, { passive: true });
  document.addEventListener('visibilitychange', onVisibility);
  calmQuery.addEventListener?.('change', onCalm);
  resize.observe(stage);
  resize.observe(hero);
  seen.observe(hero);
  if (dot && disc) {
    dot.addEventListener('pointerdown', onGrab);
    dot.addEventListener('pointermove', onDrag);
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((type) => dot.addEventListener(type, onRelease));
  }
  afterFirstPaint(startAir);
}

