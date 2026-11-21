'use strict';
/* FRACTURE — moteur de rendu WebGL minimal (aucune dépendance). */
const PI = Math.PI, TAU = PI * 2;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const rnd = (a, b) => a + Math.random() * (b - a);
const dist2 = (ax, az, bx, bz) => { const dx = ax - bx, dz = az - bz; return Math.sqrt(dx * dx + dz * dz); };
const angDiff = (a, b) => { let d = (b - a) % TAU; if (d > PI) d -= TAU; if (d < -PI) d += TAU; return d; };
function hex(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; }
function mix3(a, b, t) { return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; }
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

const PAL = {
  nuit: hex('#142234'), cyan: hex('#39D6CC'), orange: hex('#FF805B'), or: hex('#F5C66E'),
  violet: hex('#9778DB'), ivoire: hex('#F0EDE3'), white: [1, 1, 1], black: [0, 0, 0],
};

const M4 = {
  create() { const m = new Float32Array(16); m[0] = m[5] = m[10] = m[15] = 1; return m; },
  persp(o, fovy, asp, n, f) {
    const t = 1 / Math.tan(fovy / 2); o.fill(0);
    o[0] = t / asp; o[5] = t; o[10] = (f + n) / (n - f); o[11] = -1; o[14] = 2 * f * n / (n - f); return o;
  },
  lookAt(o, ex, ey, ez, cx, cy, cz) {
    let zx = ex - cx, zy = ey - cy, zz = ez - cz; let l = 1 / (Math.hypot(zx, zy, zz) || 1); zx *= l; zy *= l; zz *= l;
    let xx = zz, xy = 0, xz = -zx; l = Math.hypot(xx, xz) || 1; xx /= l; xz /= l;
    const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
    o[0] = xx; o[1] = yx; o[2] = zx; o[3] = 0; o[4] = xy; o[5] = yy; o[6] = zy; o[7] = 0; o[8] = xz; o[9] = yz; o[10] = zz; o[11] = 0;
    o[12] = -(xx * ex + xy * ey + xz * ez); o[13] = -(yx * ex + yy * ey + yz * ez); o[14] = -(zx * ex + zy * ey + zz * ez); o[15] = 1; return o;
  },
  mul(o, a, b) {
    const r = M4._t;
    for (let c = 0; c < 4; c++) for (let rI = 0; rI < 4; rI++) {
      r[c * 4 + rI] = a[rI] * b[c * 4] + a[4 + rI] * b[c * 4 + 1] + a[8 + rI] * b[c * 4 + 2] + a[12 + rI] * b[c * 4 + 3];
    }
    o.set(r); return o;
  },
  /* T * Ry(yaw) * Rx(pitch) * S */
  trs(o, x, y, z, yaw, pitch, sx, sy, sz) {
    const cy = Math.cos(yaw), syw = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    o[0] = cy * sx; o[1] = 0; o[2] = -syw * sx; o[3] = 0;
    o[4] = syw * sp * sy; o[5] = cp * sy; o[6] = cy * sp * sy; o[7] = 0;
    o[8] = syw * cp * sz; o[9] = -sp * sz; o[10] = cy * cp * sz; o[11] = 0;
    o[12] = x; o[13] = y; o[14] = z; o[15] = 1; return o;
  },
  _t: new Float32Array(16),
};

/* ---------- Constructeur de géométrie (pos3, nrm3, rgb3, emissive1) ---------- */
class MB {
  constructor() { this.a = []; }
  v(x, y, z, nx, ny, nz, c, e) { this.a.push(x, y, z, nx, ny, nz, c[0], c[1], c[2], e); }
  tri(p0, p1, p2, c, e) {
    const ux = p1[0] - p0[0], uy = p1[1] - p0[1], uz = p1[2] - p0[2], vx = p2[0] - p0[0], vy = p2[1] - p0[1], vz = p2[2] - p0[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    this.v(p0[0], p0[1], p0[2], nx, ny, nz, c, e); this.v(p1[0], p1[1], p1[2], nx, ny, nz, c, e); this.v(p2[0], p2[1], p2[2], nx, ny, nz, c, e);
  }
  quad(p0, p1, p2, p3, c, e) { this.tri(p0, p1, p2, c, e); this.tri(p0, p2, p3, c, e); }
  /* boîte posée au sol : (x,z) centre, y bas */
  box(x, y, z, w, h, d, c, e = 0, yaw = 0, cTop) {
    const hw = w / 2, hd = d / 2, cs = Math.cos(yaw), sn = Math.sin(yaw);
    const P = (lx, ly, lz) => [x + lx * cs + lz * sn, y + ly, z - lx * sn + lz * cs];
    const a = P(-hw, 0, -hd), b = P(hw, 0, -hd), cc = P(hw, 0, hd), dd = P(-hw, 0, hd);
    const a2 = P(-hw, h, -hd), b2 = P(hw, h, -hd), c2 = P(hw, h, hd), d2 = P(-hw, h, hd);
    const ct = cTop || c;
    this.quad(a2, d2, c2, b2, ct, e); // haut
    this.quad(a, b, cc, dd, c, e);   // bas
    this.quad(dd, cc, c2, d2, c, e); // +z
    this.quad(b, a, a2, b2, c, e);   // -z
    this.quad(cc, b, b2, c2, c, e);  // +x
    this.quad(a, dd, d2, a2, c, e);  // -x
  }
  cyl(x, y, z, r, h, c, e = 0, seg = 8, r2 = r, caps = true) {
    for (let i = 0; i < seg; i++) {
      const a0 = i / seg * TAU, a1 = (i + 1) / seg * TAU;
      const p0 = [x + Math.cos(a0) * r, y, z + Math.sin(a0) * r], p1 = [x + Math.cos(a1) * r, y, z + Math.sin(a1) * r];
      const q0 = [x + Math.cos(a0) * r2, y + h, z + Math.sin(a0) * r2], q1 = [x + Math.cos(a1) * r2, y + h, z + Math.sin(a1) * r2];
      this.quad(p0, q0, q1, p1, c, e);
      if (caps) { if (r2 > 0.001) this.tri([x, y + h, z], q1, q0, c, e); this.tri([x, y, z], p0, p1, c, e); }
    }
  }
  sphere(x, y, z, r, c, e = 0, seg = 8, ring = 6, sy = 1) {
    for (let j = 0; j < ring; j++) {
      const t0 = j / ring * PI, t1 = (j + 1) / ring * PI;
      for (let i = 0; i < seg; i++) {
        const a0 = i / seg * TAU, a1 = (i + 1) / seg * TAU;
        const P = (t, a) => [x + Math.sin(t) * Math.cos(a) * r, y + Math.cos(t) * r * sy, z + Math.sin(t) * Math.sin(a) * r];
        const p00 = P(t0, a0), p01 = P(t0, a1), p10 = P(t1, a0), p11 = P(t1, a1);
        if (j > 0) this.tri(p00, p01, p11, c, e);
        if (j < ring - 1) this.tri(p00, p11, p10, c, e);
      }
    }
  }
  /* rocher : sphère déformée de façon déterministe */
  rock(x, y, z, r, c, rng, sy = 0.7) {
    const seg = 7, ring = 5, k = [];
    for (let j = 0; j <= ring; j++) { k[j] = []; for (let i = 0; i <= seg; i++) k[j][i] = 0.75 + rng() * 0.45; }
    for (let j = 0; j <= ring; j++) k[j][seg] = k[j][0];
    const P = (j, i) => { const t = j / ring * PI, a = i / seg * TAU, rr = r * k[j][i]; return [x + Math.sin(t) * Math.cos(a) * rr, y + Math.cos(t) * rr * sy, z + Math.sin(t) * Math.sin(a) * rr]; };
    for (let j = 0; j < ring; j++) for (let i = 0; i < seg; i++) {
      const cc = mix3(c, [c[0] * 0.8, c[1] * 0.8, c[2] * 0.85], rng());
      this.tri(P(j, i), P(j, i + 1), P(j + 1, i + 1), cc, 0); this.tri(P(j, i), P(j + 1, i + 1), P(j + 1, i), cc, 0);
    }
  }
  get count() { return this.a.length / 10; }
}

/* ---------- Renderer ---------- */
const VS = `attribute vec3 aP;attribute vec3 aN;attribute vec4 aC;
uniform mat4 uVP;uniform mat4 uM;varying vec3 vW;varying vec3 vN;varying vec4 vC;
void main(){vec4 w=uM*vec4(aP,1.0);vW=w.xyz;vN=mat3(uM)*aN;vC=aC;gl_Position=uVP*w;}`;
const FS = `#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec3 uSun;uniform vec3 uSunC;uniform vec3 uSky;uniform vec3 uGnd;uniform vec3 uFog;uniform vec3 uCam;
uniform float uFogD;uniform float uUnlit;uniform float uAlpha;uniform vec4 uTint;
uniform vec4 uPL[4];uniform vec3 uPLC[4];
varying vec3 vW;varying vec3 vN;varying vec4 vC;
void main(){
 vec3 base=vC.rgb*uTint.rgb;vec3 col;
 if(uUnlit>0.5){col=base;}else{
  vec3 N=normalize(vN);
  float h=N.y*0.5+0.5;vec3 li=mix(uGnd,uSky,h)+uSunC*max(dot(N,uSun),0.0);
  for(int i=0;i<4;i++){vec3 L=uPL[i].xyz-vW;float d=length(L)+0.001;float a=clamp(1.0-d/uPL[i].w,0.0,1.0);a*=a;
   li+=uPLC[i]*a*(max(dot(N,L/d),0.0)+0.3);}
  col=base*li+base*vC.a*uTint.a*1.6;
 }
 float d=length(vW-uCam)*uFogD;float f=1.0-exp(-d*d);
 col=mix(col,uFog,clamp(f,0.0,1.0));
 gl_FragColor=vec4(col,uAlpha);
}`;

const R = {
  gl: null, canvas: null, vp: M4.create(), view: M4.create(), proj: M4.create(), tmp: M4.create(),
  cam: { x: 0, y: 0, z: 0 }, queues: new Map(), addQ: [], alphaQ: [], pool: [], poolI: 0,
  env: null, lights: [],
  init(canvas) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    if (!gl) throw new Error('WebGL indisponible');
    this.gl = gl;
    const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; };
    const p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    gl.useProgram(p); this.p = p;
    const U = n => gl.getUniformLocation(p, n);
    this.u = { VP: U('uVP'), M: U('uM'), Sun: U('uSun'), SunC: U('uSunC'), Sky: U('uSky'), Gnd: U('uGnd'), Fog: U('uFog'), Cam: U('uCam'), FogD: U('uFogD'), Unlit: U('uUnlit'), Alpha: U('uAlpha'), Tint: U('uTint'), PL: U('uPL'), PLC: U('uPLC') };
    this.a = { P: gl.getAttribLocation(p, 'aP'), N: gl.getAttribLocation(p, 'aN'), C: gl.getAttribLocation(p, 'aC') };
    gl.enableVertexAttribArray(this.a.P); gl.enableVertexAttribArray(this.a.N); gl.enableVertexAttribArray(this.a.C);
    gl.enable(gl.DEPTH_TEST); gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK); gl.frontFace(gl.CCW);
    this.pl = new Float32Array(16); this.plc = new Float32Array(12);
    // maillages unitaires (centrés, côté 1)
    const u = new MB(); u.box(0, -0.5, 0, 1, 1, 1, PAL.white, 0); this.cube = this.mesh(u);
    const ue = new MB(); ue.box(0, -0.5, 0, 1, 1, 1, PAL.white, 1); this.cubeE = this.mesh(ue);
    const s = new MB(); s.sphere(0, 0, 0, 0.5, PAL.white, 0, 10, 7); this.sph = this.mesh(s);
    const se = new MB(); se.sphere(0, 0, 0, 0.5, PAL.white, 1, 10, 7); this.sphE = this.mesh(se);
    const c = new MB(); c.cyl(0, -0.5, 0, 0.5, 1, PAL.white, 0, 12); this.cylM = this.mesh(c);
    const ce = new MB(); ce.cyl(0, -0.5, 0, 0.5, 1, PAL.white, 1, 16, 0.5, false); this.cylE = this.mesh(ce);
    const ring = new MB(); for (let i = 0; i < 32; i++) { const a0 = i / 32 * TAU, a1 = (i + 1) / 32 * TAU, r0 = 0.46, r1 = 0.5;
      ring.quad([Math.cos(a0) * r0, 0, Math.sin(a0) * r0], [Math.cos(a1) * r0, 0, Math.sin(a1) * r0], [Math.cos(a1) * r1, 0, Math.sin(a1) * r1], [Math.cos(a0) * r1, 0, Math.sin(a0) * r1], PAL.white, 1);
      ring.quad([Math.cos(a0) * r1, 0, Math.sin(a0) * r1], [Math.cos(a1) * r1, 0, Math.sin(a1) * r1], [Math.cos(a1) * r0, 0, Math.sin(a1) * r0], [Math.cos(a0) * r0, 0, Math.sin(a0) * r0], PAL.white, 1); }
    this.ringM = this.mesh(ring);
    const disc = new MB(); for (let i = 0; i < 16; i++) { const a0 = i / 16 * TAU, a1 = (i + 1) / 16 * TAU; disc.tri([0, 0, 0], [Math.cos(a1) * 0.5, 0, Math.sin(a1) * 0.5], [Math.cos(a0) * 0.5, 0, Math.sin(a0) * 0.5], PAL.white, 0); }
    this.discM = this.mesh(disc);
  },
  mesh(mb) {
    const gl = this.gl, data = mb instanceof MB ? new Float32Array(mb.a) : mb;
    const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    return { b, n: data.length / 10 };
  },
  resize(scale) {
    const c = this.canvas, dpr = Math.min(window.devicePixelRatio || 1, 2) * scale;
    const w = Math.max(1, Math.round(c.clientWidth * dpr)), h = Math.max(1, Math.round(c.clientHeight * dpr));
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    this.gl.viewport(0, 0, w, h);
  },
  setCamera(ex, ey, ez, tx, ty, tz, fov, far) {
    const c = this.canvas; M4.persp(this.proj, fov, c.width / c.height, 0.12, far); M4.lookAt(this.view, ex, ey, ez, tx, ty, tz);
    M4.mul(this.vp, this.proj, this.view); this.cam.x = ex; this.cam.y = ey; this.cam.z = ez;
  },
  /* projette un point monde vers l'écran (pixels CSS). null si derrière. */
  project(x, y, z, out) {
    const m = this.vp, w = m[3] * x + m[7] * y + m[11] * z + m[15];
    if (w < 0.1) return null;
    const px = (m[0] * x + m[4] * y + m[8] * z + m[12]) / w, py = (m[1] * x + m[5] * y + m[9] * z + m[13]) / w;
    out.x = (px * 0.5 + 0.5) * this.canvas.clientWidth; out.y = (0.5 - py * 0.5) * this.canvas.clientHeight; out.w = w; return out;
  },
  bind(m) {
    const gl = this.gl; gl.bindBuffer(gl.ARRAY_BUFFER, m.b);
    gl.vertexAttribPointer(this.a.P, 3, gl.FLOAT, false, 40, 0);
    gl.vertexAttribPointer(this.a.N, 3, gl.FLOAT, false, 40, 12);
    gl.vertexAttribPointer(this.a.C, 4, gl.FLOAT, false, 40, 24);
  },
  slot() { let s = this.pool[this.poolI]; if (!s) { s = { m: new Float32Array(16), t: new Float32Array(4), a: 1, mesh: null }; this.pool[this.poolI] = s; } this.poolI++; return s; },
  /* file opaque */
  q(mesh, x, y, z, yaw, pitch, sx, sy, sz, c, e = 0, parent) {
    const s = this.slot(); M4.trs(s.m, x, y, z, yaw, pitch, sx, sy, sz); if (parent) M4.mul(s.m, parent, s.m);
    s.t[0] = c[0]; s.t[1] = c[1]; s.t[2] = c[2]; s.t[3] = e; s.mesh = mesh;
    let arr = this.queues.get(mesh); if (!arr) { arr = []; this.queues.set(mesh, arr); } arr.push(s); return s;
  },
  qAdd(mesh, x, y, z, yaw, pitch, sx, sy, sz, c, parent) {
    const s = this.slot(); M4.trs(s.m, x, y, z, yaw, pitch, sx, sy, sz); if (parent) M4.mul(s.m, parent, s.m);
    s.t[0] = c[0]; s.t[1] = c[1]; s.t[2] = c[2]; s.t[3] = 0; s.mesh = mesh; this.addQ.push(s); return s;
  },
  qAlpha(mesh, x, y, z, yaw, sx, sy, sz, c, a) {
    const s = this.slot(); M4.trs(s.m, x, y, z, yaw, 0, sx, sy, sz); s.t[0] = c[0]; s.t[1] = c[1]; s.t[2] = c[2]; s.t[3] = 0; s.a = a; s.mesh = mesh; this.alphaQ.push(s); return s;
  },
  frame(env, statics) {
    const gl = this.gl, u = this.u;
    gl.clearColor(env.fog[0], env.fog[1], env.fog[2], 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.uniformMatrix4fv(u.VP, false, this.vp);
    gl.uniform3fv(u.Sun, env.sun); gl.uniform3fv(u.SunC, env.sunC); gl.uniform3fv(u.Sky, env.sky); gl.uniform3fv(u.Gnd, env.gnd);
    gl.uniform3fv(u.Fog, env.fog); gl.uniform3f(u.Cam, this.cam.x, this.cam.y, this.cam.z);
    // lumières ponctuelles : les plus proches de la caméra
    const L = this.lights; L.sort((a, b) => ((a.x - this.cam.x) ** 2 + (a.z - this.cam.z) ** 2) - ((b.x - this.cam.x) ** 2 + (b.z - this.cam.z) ** 2));
    this.pl.fill(0); this.plc.fill(0);
    for (let i = 0; i < Math.min(env.maxLights, L.length); i++) { const l = L[i]; this.pl.set([l.x, l.y, l.z, l.r], i * 4); this.plc.set(l.c, i * 3); }
    for (let i = 0; i < 4; i++) if (this.pl[i * 4 + 3] === 0) this.pl[i * 4 + 3] = 1;
    gl.uniform4fv(u.PL, this.pl); gl.uniform3fv(u.PLC, this.plc);
    gl.uniform1f(u.Alpha, 1); gl.disable(gl.BLEND); gl.depthMask(true);
    // ciel
    if (env.sky_mesh) {
      gl.uniform1f(u.FogD, 0); gl.uniform1f(u.Unlit, 1); gl.uniform4f(u.Tint, 1, 1, 1, 0);
      M4.trs(this.tmp, this.cam.x, 0, this.cam.z, 0, 0, 1, 1, 1); gl.uniformMatrix4fv(u.M, false, this.tmp);
      gl.disable(gl.CULL_FACE); gl.depthMask(false); this.bind(env.sky_mesh); gl.drawArrays(gl.TRIANGLES, 0, env.sky_mesh.n); gl.depthMask(true); gl.enable(gl.CULL_FACE);
    }
    gl.uniform1f(u.FogD, env.fogD); gl.uniform1f(u.Unlit, 0);
    // statiques
    gl.uniformMatrix4fv(u.M, false, this.I || (this.I = M4.create()));
    for (const s of statics) { if (!s.mesh || s.hidden) continue; gl.uniform4f(u.Tint, s.tint ? s.tint[0] : 1, s.tint ? s.tint[1] : 1, s.tint ? s.tint[2] : 1, s.emi == null ? 1 : s.emi); this.bind(s.mesh); gl.drawArrays(gl.TRIANGLES, 0, s.mesh.n); }
    // dynamiques opaques
    for (const [mesh, arr] of this.queues) {
      if (!arr.length) continue; this.bind(mesh);
      for (const s of arr) { gl.uniformMatrix4fv(u.M, false, s.m); gl.uniform4fv(u.Tint, s.t); gl.drawArrays(gl.TRIANGLES, 0, mesh.n); }
      arr.length = 0;
    }
    // ombres / transparences
    gl.enable(gl.BLEND); gl.depthMask(false); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.uniform1f(u.Unlit, 1);
    for (const s of this.alphaQ) { this.bind(s.mesh); gl.uniform1f(u.Alpha, s.a); gl.uniformMatrix4fv(u.M, false, s.m); gl.uniform4fv(u.Tint, s.t); gl.drawArrays(gl.TRIANGLES, 0, s.mesh.n); }
    this.alphaQ.length = 0;
    // additif
    gl.blendFunc(gl.ONE, gl.ONE); gl.uniform1f(u.Alpha, 1); gl.disable(gl.CULL_FACE);
    for (const s of this.addQ) { this.bind(s.mesh); gl.uniformMatrix4fv(u.M, false, s.m); gl.uniform4fv(u.Tint, s.t); gl.drawArrays(gl.TRIANGLES, 0, s.mesh.n); }
    this.addQ.length = 0;
    gl.enable(gl.CULL_FACE); gl.disable(gl.BLEND); gl.depthMask(true);
    this.poolI = 0;
  },
};

/* ciel en dôme dégradé */
function buildSky() {
  const mb = new MB(), top = hex('#0f1d33'), mid = hex('#2a4867'), hor = hex('#e7a86f'), seg = 16, rings = [[1, top], [0.55, mid], [0.18, hex('#9b8a8f')], [0.02, hor], [-0.3, hex('#3b4f66')]];
  const R0 = 600;
  for (let j = 0; j < rings.length - 1; j++) {
    const [y0, c0] = rings[j], [y1, c1] = rings[j + 1];
    for (let i = 0; i < seg; i++) {
      const a0 = i / seg * TAU, a1 = (i + 1) / seg * TAU;
      const P = (yy, a) => { const r = Math.sqrt(Math.max(0, 1 - yy * yy)) || 0.001; return [Math.cos(a) * r * R0, yy * R0 * 0.6, Math.sin(a) * r * R0]; };
      const p00 = P(y0, a0), p01 = P(y0, a1), p10 = P(y1, a0), p11 = P(y1, a1);
      // couleurs par sommet
      mb.v(...p00, 0, 1, 0, c0, 0); mb.v(...p01, 0, 1, 0, c0, 0); mb.v(...p11, 0, 1, 0, c1, 0);
      mb.v(...p00, 0, 1, 0, c0, 0); mb.v(...p11, 0, 1, 0, c1, 0); mb.v(...p10, 0, 1, 0, c1, 0);
    }
  }
  return R.mesh(mb);
}
