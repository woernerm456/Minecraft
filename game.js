"use strict";

const canvas = document.getElementById("game");
let gl = canvas.getContext("webgl2", { antialias: true });
if (!gl) {
  gl = canvas.getContext("webgl", { antialias: true });
  if (gl && !gl.getExtension("OES_element_index_uint")) {
    document.getElementById("overlay").textContent = "WebGL not supported in this browser";
    throw new Error("OES_element_index_uint missing");
  }
}
if (!gl) {
  document.getElementById("overlay").textContent = "WebGL not supported in this browser";
  throw new Error("no webgl");
}

const VS = `
attribute vec3 aPos;
attribute vec2 aUV;
attribute float aShade;
uniform mat4 uProj;
uniform mat4 uView;
uniform vec3 uOffset;
varying vec2 vUV;
varying float vShade;
varying float vDist;
void main() {
  vec4 mv = uView * vec4(aPos + uOffset, 1.0);
  gl_Position = uProj * mv;
  vUV = aUV;
  vShade = aShade;
  vDist = -mv.z;
}`;

const FS = `
precision mediump float;
uniform sampler2D uTex;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
uniform float uUseColor;
uniform vec3 uColor;
varying vec2 vUV;
varying float vShade;
varying float vDist;
void main() {
  if (uUseColor > 0.5) {
    gl_FragColor = vec4(uColor, 1.0);
    return;
  }
  vec4 c = texture2D(uTex, vUV);
  c.rgb *= vShade;
  float f = clamp((vDist - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);
  gl_FragColor = vec4(mix(c.rgb, uFogColor, f), c.a);
}`;

function compile(type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(s));
  }
  return s;
}
const prog = gl.createProgram();
gl.attachShader(prog, compile(gl.VERTEX_SHADER, VS));
gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FS));
gl.linkProgram(prog);
if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
  throw new Error(gl.getProgramInfoLog(prog));
}
const aPos = gl.getAttribLocation(prog, "aPos");
const aUV = gl.getAttribLocation(prog, "aUV");
const aShade = gl.getAttribLocation(prog, "aShade");
const uProj = gl.getUniformLocation(prog, "uProj");
const uView = gl.getUniformLocation(prog, "uView");
const uOffset = gl.getUniformLocation(prog, "uOffset");
const uTex = gl.getUniformLocation(prog, "uTex");
const uFogColor = gl.getUniformLocation(prog, "uFogColor");
const uFogNear = gl.getUniformLocation(prog, "uFogNear");
const uFogFar = gl.getUniformLocation(prog, "uFogFar");
const uUseColor = gl.getUniformLocation(prog, "uUseColor");
const uColor = gl.getUniformLocation(prog, "uColor");

const W = 48, H = 32, D = 48;
const world = new Uint8Array(W * H * D);
const idx = (x, y, z) => x + W * (z + D * y);
function getBlock(x, y, z) {
  if (y < 0) return 3;
  if (y >= H || x < 0 || x >= W || z < 0 || z >= D) return 0;
  return world[idx(x, y, z)];
}
function setBlock(x, y, z, id) {
  if (x < 0 || x >= W || z < 0 || z >= D || y < 0 || y >= H) return;
  world[idx(x, y, z)] = id;
}

function hash2(x, z) {
  const n = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return n - Math.floor(n);
}
function smooth(t) { return t * t * (3 - 2 * t); }
function valueNoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z);
  const xf = x - xi, zf = z - zi;
  const a = hash2(xi, zi), b = hash2(xi + 1, zi);
  const c = hash2(xi, zi + 1), d = hash2(xi + 1, zi + 1);
  const u = smooth(xf), v = smooth(zf);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, z) {
  return valueNoise(x, z) * 0.6 + valueNoise(x * 2.1, z * 2.1) * 0.3 + valueNoise(x * 4.3, z * 4.3) * 0.1;
}

const heightMap = new Int16Array(W * D);
for (let z = 0; z < D; z++) {
  for (let x = 0; x < W; x++) {
    const n = fbm(x / 12, z / 12);
    let h = Math.floor(6 + n * 14);
    if (h < 2) h = 2;
    if (h > H - 8) h = H - 8;
    heightMap[x + W * z] = h;
    for (let y = 0; y <= h; y++) {
      let id;
      if (y === 0) id = 3;
      else if (y === h) id = h <= 8 ? 7 : 1;
      else if (y >= h - 3) id = h <= 8 ? 7 : 2;
      else id = 3;
      setBlock(x, y, z, id);
    }
  }
}

let seed = 12345;
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
for (let i = 0; i < 40; i++) {
  const x = 2 + Math.floor(rnd() * (W - 4));
  const z = 2 + Math.floor(rnd() * (D - 4));
  const h = heightMap[x + W * z];
  if (h <= 8) continue;
  const th = 4 + Math.floor(rnd() * 2);
  for (let y = h + 1; y <= h + th; y++) setBlock(x, y, z, 4);
  for (let dy = th - 1; dy <= th + 1; dy++) {
    const r = dy === th + 1 ? 1 : 2;
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        if (Math.abs(dx) === r && Math.abs(dz) === r && rnd() < 0.5) continue;
        if (dx === 0 && dz === 0 && dy <= th) continue;
        if (getBlock(x + dx, h + dy, z + dz) === 0) setBlock(x + dx, h + dy, z + dz, 6);
      }
    }
  }
}

const TILE = 16, TILES = 10;
const atlasCanvas = document.createElement("canvas");
atlasCanvas.width = TILE * TILES;
atlasCanvas.height = TILE;
const actx = atlasCanvas.getContext("2d");
let aseed = 987654321;
const arnd = () => { aseed = (aseed * 48271) % 2147483647; return aseed / 2147483647; };
function fillTile(t, base, variance, extra) {
  const ox = t * TILE;
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const v = (arnd() - 0.5) * 2 * variance;
      actx.fillStyle = `rgb(${Math.max(0, Math.min(255, base[0] + v)) | 0},${Math.max(0, Math.min(255, base[1] + v)) | 0},${Math.max(0, Math.min(255, base[2] + v)) | 0})`;
      actx.fillRect(ox + x, y, 1, 1);
    }
  }
  if (extra) extra(ox);
}
fillTile(0, [96, 174, 62], 18);
fillTile(1, [134, 96, 60], 16, (ox) => {
  for (let x = 0; x < TILE; x++) {
    const d = 2 + Math.floor(arnd() * 3);
    for (let y = 0; y < d; y++) {
      const v = (arnd() - 0.5) * 30;
      actx.fillStyle = `rgb(${(96 + v) | 0},${(174 + v) | 0},${(62 + v) | 0})`;
      actx.fillRect(ox + x, y, 1, 1);
    }
  }
});
fillTile(2, [134, 96, 60], 16);
fillTile(3, [140, 140, 140], 12, (ox) => {
  actx.fillStyle = "rgb(110,110,110)";
  for (let i = 0; i < 5; i++) actx.fillRect(ox + Math.floor(arnd() * 14), Math.floor(arnd() * 16), 2, 1);
});
fillTile(4, [104, 80, 44], 10, (ox) => {
  actx.fillStyle = "rgb(80,60,32)";
  for (let x = 0; x < TILE; x += 4) actx.fillRect(ox + x, 0, 1, TILE);
});
fillTile(5, [178, 146, 90], 10, (ox) => {
  for (let r = 7; r > 0; r -= 2) {
    actx.strokeStyle = "rgb(120,92,50)";
    actx.strokeRect(ox + 8 - r + 0.5, 8 - r + 0.5, r * 2, r * 2);
  }
});
fillTile(6, [56, 118, 40], 22, (ox) => {
  actx.fillStyle = "rgb(30,70,22)";
  for (let i = 0; i < 12; i++) actx.fillRect(ox + Math.floor(arnd() * 16), Math.floor(arnd() * 16), 1, 1);
});
fillTile(7, [219, 208, 152], 10);
fillTile(8, [156, 74, 60], 10, (ox) => {
  actx.fillStyle = "rgb(200,190,180)";
  for (let y = 3; y < TILE; y += 4) actx.fillRect(ox, y, TILE, 1);
  for (let y = 0; y < TILE; y += 4) {
    const off = y % 8 === 0 ? 0 : 4;
    for (let x = off; x < TILE; x += 8) actx.fillRect(ox + x, y, 1, Math.min(4, TILE - y));
  }
});
fillTile(9, [176, 141, 87], 10, (ox) => {
  actx.fillStyle = "rgb(140,110,66)";
  for (let y = 3; y < TILE; y += 4) actx.fillRect(ox, y, TILE, 1);
  for (let y = 0; y < TILE; y += 4) actx.fillRect(ox + ((y * 5) % 16), y, 1, 4);
});

const tex = gl.createTexture();
gl.bindTexture(gl.TEXTURE_2D, tex);
gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlasCanvas);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

const FACE_TILES = {
  1: { top: 0, side: 1, bottom: 2 },
  2: { top: 2, side: 2, bottom: 2 },
  3: { top: 3, side: 3, bottom: 3 },
  4: { top: 5, side: 4, bottom: 5 },
  6: { top: 6, side: 6, bottom: 6 },
  7: { top: 7, side: 7, bottom: 7 },
  8: { top: 8, side: 8, bottom: 8 },
  9: { top: 9, side: 9, bottom: 9 },
};
const FACES = [
  { dir: [ 1, 0, 0], shade: 0.80, c: [[1,0,0],[1,1,0],[1,1,1],[1,0,1]] },
  { dir: [-1, 0, 0], shade: 0.80, c: [[0,0,1],[0,1,1],[0,1,0],[0,0,0]] },
  { dir: [ 0, 1, 0], shade: 1.00, c: [[0,1,1],[1,1,1],[1,1,0],[0,1,0]] },
  { dir: [ 0,-1, 0], shade: 0.55, c: [[0,0,0],[1,0,0],[1,0,1],[0,0,1]] },
  { dir: [ 0, 0, 1], shade: 0.65, c: [[1,0,1],[1,1,1],[0,1,1],[0,0,1]] },
  { dir: [ 0, 0,-1], shade: 0.65, c: [[0,0,0],[0,1,0],[1,1,0],[1,0,0]] },
];

let meshCount = 0;
const posBuf = gl.createBuffer();
const uvBuf = gl.createBuffer();
const shadeBuf = gl.createBuffer();
const idxBuf = gl.createBuffer();
function rebuildMesh() {
  const pos = [], uv = [], sh = [], ind = [];
  let vc = 0;
  for (let y = 0; y < H; y++) {
    for (let z = 0; z < D; z++) {
      for (let x = 0; x < W; x++) {
        const id = world[idx(x, y, z)];
        if (id === 0) continue;
        const ft = FACE_TILES[id];
        for (const f of FACES) {
          if (getBlock(x + f.dir[0], y + f.dir[1], z + f.dir[2]) !== 0) continue;
          const tile = f.dir[1] === 1 ? ft.top : f.dir[1] === -1 ? ft.bottom : ft.side;
          const u0 = tile / TILES, u1 = (tile + 1) / TILES;
          const uvs = [[u0, 0], [u0, 1], [u1, 1], [u1, 0]];
          for (let i = 0; i < 4; i++) {
            const c = f.c[i];
            pos.push(x + c[0], y + c[1], z + c[2]);
            uv.push(uvs[i][0], uvs[i][1]);
            sh.push(f.shade);
          }
          ind.push(vc, vc + 1, vc + 2, vc, vc + 2, vc + 3);
          vc += 4;
        }
      }
    }
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(pos), gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, uvBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(uv), gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, shadeBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(sh), gl.STATIC_DRAW);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(ind), gl.STATIC_DRAW);
  meshCount = ind.length;
}

const lineBuf = gl.createBuffer();
{
  const corners = [];
  for (let i = 0; i < 8; i++) corners.push([i & 1, (i >> 1) & 1, (i >> 2) & 1]);
  const lines = [];
  for (let i = 0; i < 8; i++) {
    for (let j = i + 1; j < 8; j++) {
      let diff = 0;
      for (let k = 0; k < 3; k++) if (corners[i][k] !== corners[j][k]) diff++;
      if (diff === 1) lines.push(...corners[i], ...corners[j]);
    }
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, lineBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(lines), gl.STATIC_DRAW);
}

const HOTBAR = [
  { id: 2, name: "Dirt", color: "#8a603c" },
  { id: 3, name: "Stone", color: "#8c8c8c" },
  { id: 1, name: "Grass", color: "#60ae3e" },
  { id: 4, name: "Wood", color: "#68502c" },
  { id: 6, name: "Leaves", color: "#387826" },
  { id: 7, name: "Sand", color: "#dbd098" },
  { id: 8, name: "Brick", color: "#9c4a3c" },
  { id: 9, name: "Planks", color: "#b08d57" },
];
let selected = 0;
const hotbarEl = document.getElementById("hotbar");
HOTBAR.forEach((b, i) => {
  const d = document.createElement("div");
  d.className = "slot";
  d.style.background = b.color;
  d.title = b.name;
  d.textContent = i + 1;
  hotbarEl.appendChild(d);
});
function updateHotbar() {
  [...hotbarEl.children].forEach((el, i) => el.classList.toggle("sel", i === selected));
}
updateHotbar();

const player = {
  x: W / 2 + 0.5,
  y: 0,
  z: D / 2 + 0.5,
  vy: 0,
  yaw: Math.PI * 0.25,
  pitch: -0.1,
  onGround: false,
};
player.y = heightMap[Math.floor(player.x) + W * Math.floor(player.z)] + 2;

const keys = {};
window.addEventListener("keydown", (e) => {
  keys[e.code] = true;
  if (e.code.startsWith("Digit")) {
    const n = parseInt(e.code.slice(5), 10);
    if (n >= 1 && n <= HOTBAR.length) {
      selected = n - 1;
      updateHotbar();
    }
  }
  if (e.code === "Space") e.preventDefault();
});
window.addEventListener("keyup", (e) => { keys[e.code] = false; });

const overlay = document.getElementById("overlay");
function requestLock() { canvas.requestPointerLock(); }
canvas.addEventListener("click", requestLock);
overlay.addEventListener("click", requestLock);
document.addEventListener("pointerlockchange", () => {
  overlay.style.display = document.pointerLockElement === canvas ? "none" : "flex";
});
document.addEventListener("mousemove", (e) => {
  if (document.pointerLockElement !== canvas) return;
  player.yaw -= e.movementX * 0.0025;
  player.pitch -= e.movementY * 0.0025;
  player.pitch = Math.max(-1.55, Math.min(1.55, player.pitch));
});
canvas.addEventListener("contextmenu", (e) => e.preventDefault());
canvas.addEventListener("mousedown", (e) => {
  if (document.pointerLockElement !== canvas) return;
  if (e.button === 0) breakBlock();
  else if (e.button === 2) placeBlock();
});

function solidAt(px, py, pz) {
  const x0 = Math.floor(px - 0.3), x1 = Math.floor(px + 0.3);
  const y0 = Math.floor(py), y1 = Math.floor(py + 1.8);
  const z0 = Math.floor(pz - 0.3), z1 = Math.floor(pz + 0.3);
  for (let y = y0; y <= y1; y++) {
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        if (getBlock(x, y, z) !== 0) return true;
      }
    }
  }
  return false;
}

function raycast(maxDist) {
  const cp = Math.cos(player.pitch), sp = Math.sin(player.pitch);
  const dx = -Math.sin(player.yaw) * cp, dy = sp, dz = -Math.cos(player.yaw) * cp;
  const ox = player.x, oy = player.y + 1.62, oz = player.z;
  let x = Math.floor(ox), y = Math.floor(oy), z = Math.floor(oz);
  const stepX = dx > 0 ? 1 : -1, stepY = dy > 0 ? 1 : -1, stepZ = dz > 0 ? 1 : -1;
  const tdX = dx !== 0 ? Math.abs(1 / dx) : Infinity;
  const tdY = dy !== 0 ? Math.abs(1 / dy) : Infinity;
  const tdZ = dz !== 0 ? Math.abs(1 / dz) : Infinity;
  let tmX = dx !== 0 ? (dx > 0 ? x + 1 - ox : ox - x) * tdX : Infinity;
  let tmY = dy !== 0 ? (dy > 0 ? y + 1 - oy : oy - y) * tdY : Infinity;
  let tmZ = dz !== 0 ? (dz > 0 ? z + 1 - oz : oz - z) * tdZ : Infinity;
  let nx = 0, ny = 0, nz = 0, t = 0;
  for (let i = 0; i < 128; i++) {
    if (tmX < tmY && tmX < tmZ) {
      x += stepX; t = tmX; tmX += tdX; nx = -stepX; ny = 0; nz = 0;
    } else if (tmY < tmZ) {
      y += stepY; t = tmY; tmY += tdY; nx = 0; ny = -stepY; nz = 0;
    } else {
      z += stepZ; t = tmZ; tmZ += tdZ; nx = 0; ny = 0; nz = -stepZ;
    }
    if (t > maxDist) return null;
    if (getBlock(x, y, z) !== 0) return { x, y, z, nx, ny, nz };
  }
  return null;
}

function breakBlock() {
  const hit = raycast(6);
  if (!hit || hit.y === 0) return;
  setBlock(hit.x, hit.y, hit.z, 0);
  rebuildMesh();
}
function placeBlock() {
  const hit = raycast(6);
  if (!hit) return;
  const x = hit.x + hit.nx, y = hit.y + hit.ny, z = hit.z + hit.nz;
  if (x < 0 || x >= W || z < 0 || z >= D || y < 1 || y >= H) return;
  if (getBlock(x, y, z) !== 0) return;
  const p = player;
  if (p.x + 0.3 > x && p.x - 0.3 < x + 1 && p.y + 1.8 > y && p.y < y + 1 && p.z + 0.3 > z && p.z - 0.3 < z + 1) return;
  setBlock(x, y, z, HOTBAR[selected].id);
  rebuildMesh();
}

function update(dt) {
  const speed = keys.ShiftLeft || keys.ShiftRight ? 7 : 4.5;
  const sy = Math.sin(player.yaw), cy = Math.cos(player.yaw);
  let mx = 0, mz = 0;
  if (keys.KeyW) mz = 1;
  if (keys.KeyS) mz = -1;
  if (keys.KeyA) mx = -1;
  if (keys.KeyD) mx = 1;
  const len = Math.hypot(mx, mz);
  if (len > 0) { mx /= len; mz /= len; }
  const fwdX = -sy, fwdZ = -cy, rgtX = cy, rgtZ = -sy;
  const vx = (fwdX * mz + rgtX * mx) * speed;
  const vz = (fwdZ * mz + rgtZ * mx) * speed;
  player.x += vx * dt;
  if (solidAt(player.x, player.y, player.z)) player.x -= vx * dt;
  player.z += vz * dt;
  if (solidAt(player.x, player.y, player.z)) player.z -= vz * dt;
  player.vy -= 28 * dt;
  if (player.vy < -50) player.vy = -50;
  if (keys.Space && player.onGround) {
    player.vy = 9;
    player.onGround = false;
  }
  player.y += player.vy * dt;
  if (solidAt(player.x, player.y, player.z)) {
    player.y -= player.vy * dt;
    if (player.vy < 0) player.onGround = true;
    player.vy = 0;
  } else {
    player.onGround = false;
  }
  if (player.y < -10) {
    player.x = W / 2 + 0.5;
    player.z = D / 2 + 0.5;
    player.y = heightMap[Math.floor(player.x) + W * Math.floor(player.z)] + 2;
    player.vy = 0;
  }
}

function mat4Perspective(fovy, aspect, near, far) {
  const f = 1 / Math.tan(fovy / 2);
  const nf = 1 / (near - far);
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * nf, -1,
    0, 0, 2 * far * near * nf, 0,
  ]);
}
function viewMatrix(yaw, pitch, eye) {
  const sy = Math.sin(yaw), cy = Math.cos(yaw);
  const sp = Math.sin(pitch), cp = Math.cos(pitch);
  const f = [-sy * cp, sp, -cy * cp];
  const r = [cy, 0, -sy];
  const u = [
    r[1] * f[2] - r[2] * f[1],
    r[2] * f[0] - r[0] * f[2],
    r[0] * f[1] - r[1] * f[0],
  ];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  return new Float32Array([
    r[0], u[0], -f[0], 0,
    r[1], u[1], -f[1], 0,
    r[2], u[2], -f[2], 0,
    -dot(r, eye), -dot(u, eye), dot(f, eye), 1,
  ]);
}

let proj = null;
function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  gl.viewport(0, 0, canvas.width, canvas.height);
  proj = mat4Perspective(75 * Math.PI / 180, canvas.width / canvas.height, 0.1, 300);
}
window.addEventListener("resize", resize);
resize();

function bindAttrib(buf, attrib, size) {
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.enableVertexAttribArray(attrib);
  gl.vertexAttribPointer(attrib, size, gl.FLOAT, false, 0, 0);
}

function render() {
  gl.clearColor(0.53, 0.76, 0.98, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.DEPTH_TEST);
  gl.disable(gl.CULL_FACE);
  gl.useProgram(prog);
  const eye = [player.x, player.y + 1.62, player.z];
  gl.uniformMatrix4fv(uProj, false, proj);
  gl.uniformMatrix4fv(uView, false, viewMatrix(player.yaw, player.pitch, eye));
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.uniform1i(uTex, 0);
  gl.uniform3f(uFogColor, 0.53, 0.76, 0.98);
  gl.uniform1f(uFogNear, 30);
  gl.uniform1f(uFogFar, 90);
  gl.uniform1f(uUseColor, 0);
  gl.uniform3f(uOffset, 0, 0, 0);
  bindAttrib(posBuf, aPos, 3);
  bindAttrib(uvBuf, aUV, 2);
  bindAttrib(shadeBuf, aShade, 1);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf);
  gl.drawElements(gl.TRIANGLES, meshCount, gl.UNSIGNED_INT, 0);
  const hit = raycast(6);
  if (hit) {
    gl.uniform1f(uUseColor, 1);
    gl.uniform3f(uColor, 0, 0, 0);
    gl.uniform3f(uOffset, hit.x, hit.y, hit.z);
    bindAttrib(lineBuf, aPos, 3);
    gl.drawArrays(gl.LINES, 0, 24);
  }
}

rebuildMesh();
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  update(dt);
  render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
