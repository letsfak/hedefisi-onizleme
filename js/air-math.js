// Pure maths for the hero "air" scene: no DOM, no WebGL, so it runs under node --test.
// The scene has one input, the dial position k (0 = start of the story, 1 = the target reached),
// and one extra phase after it, "settle", when the air calms down before the page continues.

// Heating season: the room starts cold and the set point climbs to 22°.
// Cooling season (May to September): the room starts hot and the set point drops to 24°.
// "warm" is how much of the air is heating air (0 = all cold, 1 = all warm).
export const STORY = Object.freeze({
  heat: Object.freeze({ from: 16, to: 22, warmFrom: 0, warmTo: 1 }),
  cool: Object.freeze({ from: 28, to: 24, warmFrom: 1, warmTo: 0 }),
});

// Share of the pinned scroll spent turning the dial; the remainder lets the air settle.
export const DIAL_SHARE = 0.72;

export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

export function smoothstep(edge0, edge1, v) {
  const t = clamp01((v - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

const storyOf = (season) => (season === 'cool' ? STORY.cool : STORY.heat);

/** Scroll position inside the pinned hero, 0 at its top, 1 when the pin releases. */
export function progressFrom(scrollY, top, run) {
  if (!(run > 0)) return 1;
  return clamp01((scrollY - top) / run);
}

export const dialFromProgress = (p) => smoothstep(0, DIAL_SHARE, p);
export const settleFromProgress = (p) => smoothstep(DIAL_SHARE, 1, p);

export function warmFromDial(k, season) {
  const s = storyOf(season);
  return s.warmFrom + (s.warmTo - s.warmFrom) * clamp01(k);
}

export function tempFromDial(k, season) {
  const s = storyOf(season);
  return Math.round(s.from + (s.to - s.from) * clamp01(k));
}

/**
 * Turns a pointer angle on the dial (degrees, clockwise from 12 o'clock) into a dial position.
 * The marker sits at `end` when k = 1 and `travel` degrees before it when k = 0;
 * `dir` is 1 when warming turns the knob clockwise, -1 when cooling turns it back.
 */
export function dialFromAngle(angle, end, travel, dir) {
  if (!(travel > 0)) return 1;
  let delta = angle - end;
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  return clamp01(1 + (delta * (dir < 0 ? -1 : 1)) / travel);
}

/** Frame-rate independent exponential smoothing toward a target. */
export function damp(current, target, lambda, dt) {
  return target + (current - target) * Math.exp(-lambda * dt);
}

export const PHONE_MAX_PARTICLES = 3000;
export const DESK_MAX_PARTICLES = 9000;
const MIN_PARTICLES = 1200;

/** Particle count for a stage of width × height CSS px. Touch devices are capped at 3k. */
export function particleBudget({ width, height, coarse }) {
  const area = Math.max(0, width) * Math.max(0, height);
  const wanted = Math.round(area / (coarse ? 90 : 150));
  const max = coarse ? PHONE_MAX_PARTICLES : DESK_MAX_PARTICLES;
  return Math.max(MIN_PARTICLES, Math.min(max, wanted));
}

/** Device pixel ratio actually rendered: 1.5 at most on touch devices, 2 elsewhere. */
export function renderDpr(dpr, coarse) {
  const d = Number(dpr) > 0 ? Number(dpr) : 1;
  return Math.min(d, coarse ? 1.5 : 2);
}
