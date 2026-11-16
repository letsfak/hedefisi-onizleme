// The air field: one draw call of soft point sprites, raw WebGL (GLSL ES 1.0, so WebGL 1 and 2 both work).
// Nothing is simulated on the CPU: every particle's position is a closed-form function of its seed
// and two clocks, evaluated in the vertex shader, and each is drawn as a short streak along its own
// velocity. Cold air is thrown from a vent above the top edge, falls and pools on the floor; warm air
// rises from the floor in curling plumes. A per-particle threshold decides when each one switches,
// so the room changes over gradually instead of all at once.

const VERT = `
precision highp float;
attribute vec4 aSeed;
uniform float uTimeC;
uniform float uTimeW;
uniform float uWarm;
uniform float uSettle;
uniform float uAspect;
uniform float uPx;
uniform float uH;
uniform float uLanesC;
uniform float uLanesW;
varying vec3 vColor;
varying float vAlpha;
varying vec2 vDir;
varying float vHalf;
varying float vThick;

float hash(float n) { return fract(sin(n) * 43758.5453123); }
vec2 grad(vec2 p) {
  float a = fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453) * 6.2831853;
  return vec2(cos(a), sin(a));
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = dot(grad(i), f);
  float b = dot(grad(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0));
  float c = dot(grad(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0));
  float d = dot(grad(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
vec2 curl(vec2 p) {
  const float e = 0.08;
  float dy = noise(p + vec2(0.0, e)) - noise(p - vec2(0.0, e));
  float dx = noise(p + vec2(e, 0.0)) - noise(p - vec2(e, 0.0));
  return vec2(dy, -dx) / (2.0 * e);
}

// Cold air: leaves a vent above the top edge moving sideways, slows, falls and slides along the floor.
// Most particles ride one of a few lanes, so the stream reads as streamlines; the rest are haze.
vec2 coldAt(float t, float lane, float free, float j1, float j2) {
  float A = uAspect;
  float lj = lane / max(1.0, uLanesC - 1.0);
  float lh = hash(lane * 13.7 + 1.3);
  float lg = hash(lane * 7.1 + 4.2);
  float x0 = A * mix(0.4, 1.14, mix(lj, j1, free)) + (j2 - 0.5) * 0.014;
  float throwX = A * mix(0.3, 0.66, mix(lh, j2, free));
  float g = mix(2.2, 3.0, mix(lg, j1, free));
  float floorY = 0.012 + 0.07 * mix(lh, j1, free) + (j2 - 0.5) * 0.01;
  vec2 p = vec2(x0 - throwX * (1.0 - (1.0 - t) * (1.0 - t)), max(floorY, 1.05 - g * t * t));
  return p + curl(p * 2.0 + vec2(0.0, uTimeC * 0.05)) * 0.022;
}

// Warm air: rises from the floor in plumes, speeding up, widening and curling; calmer once settled.
vec2 warmAt(float t, float lane, float free, float j1, float j2) {
  float A = uAspect;
  float x0 = A * mix(-0.04, 1.04, mix((lane + 0.5) / uLanesW, j1, free));
  vec2 p = vec2(x0 + (j2 - 0.5) * 0.16 * t, -0.04 + 1.2 * pow(t, 1.35));
  float turb = mix(0.02, 0.14, t) * mix(1.0, 0.55, uSettle);
  return p + curl(p * vec2(2.4, 1.7) + vec2(lane * 0.37, -uTimeW * 0.22)) * turb;
}

void main() {
  float h1 = hash(aSeed.x * 91.3 + aSeed.z * 17.1);
  float h2 = hash(aSeed.y * 47.7 + aSeed.w * 29.3);
  float free = step(0.68, h1);
  float depth = aSeed.w;
  float laneC = floor(aSeed.z * uLanesC);
  float laneW = floor(fract(aSeed.z * 7.31 + 0.37) * uLanesW);

  // each particle switches from cold to warm at its own moment, lanes roughly together
  float th = mix(aSeed.y, hash(laneC * 3.3), 0.45);
  float pw = smoothstep(th - 0.14, th + 0.14, uWarm * 1.28 - 0.14);

  vec2 p = vec2(0.0);
  vec2 q = vec2(0.0);
  float alpha = 0.0;
  if (pw < 0.999) {
    float life = mix(10.0, 15.0, h1);
    float t = fract(uTimeC / life + aSeed.x);
    float t0 = max(0.0, t - 0.05 / life);
    float a = smoothstep(0.0, 0.05, t) * (1.0 - smoothstep(0.74, 1.0, t));
    a *= clamp((uTimeC - t * life) / 0.8, 0.0, 1.0);
    p += coldAt(t, laneC, free, h2, depth) * (1.0 - pw);
    q += coldAt(t0, laneC, free, h2, depth) * (1.0 - pw);
    alpha += a * (1.0 - pw);
  }
  if (pw > 0.001) {
    float life = mix(5.5, 8.5, h2);
    float t = fract(uTimeW / life + aSeed.x * 1.618);
    float t0 = max(0.0, t - 0.05 / life);
    float a = smoothstep(0.0, 0.12, t) * (1.0 - smoothstep(0.62, 1.0, t));
    a *= clamp((uTimeW - t * life) / 0.8, 0.0, 1.0);
    p += warmAt(t, laneW, free, h1, depth) * pw;
    q += warmAt(t0, laneW, free, h1, depth) * pw;
    alpha += a * pw;
  }

  gl_Position = vec4(p.x / uAspect * 2.0 - 1.0, p.y * 2.0 - 1.0, 0.0, 1.0);

  // a streak along the last ~50 ms of travel: long where the air is fast, a dot where it pools
  vec2 d = (p - q) * uH;
  float len = clamp(length(d), 0.0, 11.0);
  float thick = mix(1.1, 2.6, depth * depth);
  float size = len + thick + 1.0;
  gl_PointSize = size * uPx;
  vDir = len > 0.01 ? normalize(vec2(d.x, -d.y)) : vec2(1.0, 0.0);
  vHalf = len / size;
  vThick = thick / size;
  vColor = mix(vec3(0.361, 0.737, 0.957), vec3(1.0, 0.357, 0.133), pw);
  vAlpha = alpha * mix(0.32, 0.8, depth) * mix(1.0, 0.6, free) * (1.0 - 0.45 * uSettle * pw);
}`;

// Inside the dial discs the air turns paper-white (frost on the cold disc, steam on the warm one),
// so it stays visible on both colours. Over the dial's reading it nearly disappears, keeping the
// number clean.
const FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec3 uDiscA;
uniform vec3 uDiscB;
uniform vec4 uQuiet;
uniform vec4 uCalm;
uniform float uCalmK;
varying vec3 vColor;
varying float vAlpha;
varying vec2 vDir;
varying float vHalf;
varying float vThick;

void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float along = dot(c, vDir);
  float across = dot(c, vec2(-vDir.y, vDir.x));
  float dist = length(vec2(along - clamp(along, -vHalf, vHalf), across));
  float a = vAlpha * (1.0 - smoothstep(vThick * 0.35, vThick, dist));
  a *= 0.45 + 0.55 * smoothstep(-vHalf, vHalf, along);
  if (a < 0.004) discard;
  vec2 f = gl_FragCoord.xy;
  float inside = max(step(distance(f, uDiscA.xy), uDiscA.z), step(distance(f, uDiscB.xy), uDiscB.z));
  vec3 col = mix(vColor, vec3(0.957, 0.961, 0.961), inside);
  vec2 q = step(uQuiet.xy, f) * step(f, uQuiet.zw);
  vec2 m = step(uCalm.xy, f) * step(f, uCalm.zw);
  a *= (1.0 - 0.9 * q.x * q.y) * (1.0 - uCalmK * m.x * m.y);
  gl_FragColor = vec4(col * a, a);
}`;

function mulberry32(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The start is split over several tasks so no single one blocks input for long: context, then shader
// compile + link (asynchronous where KHR_parallel_shader_compile exists), then buffers.
const nextTask = () => new Promise((resolve) => setTimeout(resolve, 0));
const LINK_POLL_MS = 16;
const LINK_POLL_MAX = 300; // ~5 s, then give up and keep the static dial

function startProgram(gl) {
  const program = gl.createProgram();
  [[gl.VERTEX_SHADER, VERT], [gl.FRAGMENT_SHADER, FRAG]].forEach(([type, source]) => {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    gl.attachShader(program, shader);
    gl.deleteShader(shader); // freed with the program
  });
  gl.linkProgram(program); // no status query here: asking now would wait for the GPU
  return program;
}

async function programReady(gl, program) {
  const ext = gl.getExtension('KHR_parallel_shader_compile');
  if (ext) {
    for (let i = 0; i < LINK_POLL_MAX; i++) {
      if (gl.isContextLost()) return false;
      if (gl.getProgramParameter(program, ext.COMPLETION_STATUS_KHR)) break;
      await new Promise((resolve) => setTimeout(resolve, LINK_POLL_MS));
    }
  } else await nextTask(); // give the driver a task's worth of time before the blocking query
  return !gl.isContextLost() && gl.getProgramParameter(program, gl.LINK_STATUS) === true;
}

const UNIFORMS = ['uTimeC', 'uTimeW', 'uWarm', 'uSettle', 'uAspect', 'uPx', 'uH', 'uLanesC', 'uLanesW', 'uDiscA', 'uDiscB', 'uQuiet', 'uCalm', 'uCalmK'];
const OFF = [-1e5, -1e5, 0];

/**
 * @returns {Promise<null | { resize, setShapes, draw, dispose }>} null when WebGL or the shaders are unavailable.
 */
export async function createAir(canvas, { count, coarse }) {
  const gl = canvas.getContext('webgl', {
    alpha: true, antialias: false, depth: false, stencil: false,
    premultipliedAlpha: true, preserveDrawingBuffer: false, powerPreference: 'low-power',
    failIfMajorPerformanceCaveat: true, // software GL on a weak device gets the static dial instead
  });
  if (!gl) return null;
  await nextTask();
  const program = startProgram(gl);
  if (!(await programReady(gl, program))) {
    if (!gl.isContextLost()) gl.deleteProgram(program);
    return null;
  }
  await nextTask();

  const random = mulberry32(22);
  const seeds = new Float32Array(count * 4);
  for (let i = 0; i < seeds.length; i++) seeds[i] = random();
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, seeds, gl.STATIC_DRAW);

  gl.useProgram(program);
  const loc = gl.getAttribLocation(program, 'aSeed');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 4, gl.FLOAT, false, 0, 0);
  const u = Object.fromEntries(UNIFORMS.map((name) => [name, gl.getUniformLocation(program, name)]));

  gl.disable(gl.DEPTH_TEST);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.clearColor(0, 0, 0, 0);
  gl.uniform1f(u.uCalmK, coarse ? 0.45 : 0.6); // phones: the headline block is half the screen
  gl.uniform1f(u.uLanesC, coarse ? 12 : 20);
  gl.uniform1f(u.uLanesW, coarse ? 9 : 14);
  gl.uniform3fv(u.uDiscA, OFF);
  gl.uniform3fv(u.uDiscB, OFF);
  gl.uniform4f(u.uQuiet, -1, -1, -1, -1);
  gl.uniform4f(u.uCalm, -1, -1, -1, -1);

  let width = 1;
  let height = 1;
  let px = 1;
  let timeC = 0;
  let timeW = 0;

  // CSS px (top-left origin, relative to the canvas) to device px (bottom-left origin).
  const toGl = (x, y) => [x * px, height - y * px];

  return {
    resize(cssWidth, cssHeight, dpr) {
      px = dpr;
      width = Math.max(1, Math.round(cssWidth * dpr));
      height = Math.max(1, Math.round(cssHeight * dpr));
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
      gl.viewport(0, 0, width, height);
      gl.uniform1f(u.uAspect, cssWidth / Math.max(1, cssHeight));
      gl.uniform1f(u.uPx, dpr);
      gl.uniform1f(u.uH, cssHeight);
    },
    // discs: circles where the air turns paper-white; quiet: nearly no air (the dial's reading);
    // calm: thinner air (the headline block). All in CSS px relative to the canvas.
    setShapes({ discs = [], quiet = null, calm = null }) {
      [u.uDiscA, u.uDiscB].forEach((slot, i) => {
        const d = discs[i];
        gl.uniform3fv(slot, d ? [...toGl(d.x, d.y), d.r * px] : OFF);
      });
      [[u.uQuiet, quiet], [u.uCalm, calm]].forEach(([slot, r]) => {
        if (!r) return gl.uniform4f(slot, -1, -1, -1, -1);
        const [x0, y1] = toGl(r.left, r.top);
        const [x1, y0] = toGl(r.right, r.bottom);
        return gl.uniform4f(slot, x0, y0, x1, y1);
      });
    },
    draw(dt, { warm, settle }) {
      timeC += dt;
      timeW += dt * (1 - 0.45 * settle);
      gl.uniform1f(u.uTimeC, timeC);
      gl.uniform1f(u.uTimeW, timeW);
      gl.uniform1f(u.uWarm, warm);
      gl.uniform1f(u.uSettle, settle);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.POINTS, 0, count);
    },
    dispose() {
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
    },
  };
}
