// AI Resource Hub — Baddies Generator live 3D preview (realistic body).
// Loads models/baddie_base.glb: a rigged CC0 MakeHuman adult female body with
// shape keys (hips, glutes, waist, thighs, bust, tone, each up/down). The
// sliders drive those morphs live, height scales the figure, the arms are posed
// with the rig to match the weapon hold, and the outfit is painted onto the body
// by body part (from the skin weights): camo, boots, gloves, vest, tattoos.
// Hair, hood, headgear, jewelry and the weapon are simple add-ons placed at the bones.
// Listens for the "baddies:change" event from js/baddies.js.

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { OutlineEffect } from "three/addons/effects/OutlineEffect.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { GroundedSkybox } from "three/addons/objects/GroundedSkybox.js";

const box = document.getElementById("bdPreview");
const canvasWrap = document.getElementById("bdPreviewCanvas");
const MODEL_URL = "models/baddie_full.glb?v=2";
const EYE_TEX = { brown: "brown", hazel: "brownlight", green: "green", grey: "grey", blue: "blue" };
const BASE_H = 1.60;            // the model's height in metres (5'3")
const IN = 0.0254;
if (box && canvasWrap) init();

function init() {
  // ------------------------------------------------------------ scene
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  canvasWrap.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(28, 1, 0.05, 50);
  camera.position.set(0.4, 1.0, 3.9);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0.82, 0);
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.minDistance = 1.0;
  controls.maxDistance = 5.5;
  controls.minPolarAngle = 0.25;
  controls.maxPolarAngle = Math.PI / 2 + 0.12;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 1.6;

  // studio lighting
  const hemi = new THREE.HemisphereLight(0xfff4ea, 0x2a2430, 1.0); scene.add(hemi);
  const key = new THREE.DirectionalLight(0xfff1e0, 2.6); key.position.set(2.2, 3.2, 2.8); scene.add(key);
  const rim = new THREE.DirectionalLight(0xffb98a, 1.8); rim.position.set(-2.6, 2.4, -2.8); scene.add(rim);
  const rim2 = new THREE.DirectionalLight(0x9fc2ff, 1.0); rim2.position.set(2.8, 1.8, -2.6); scene.add(rim2);
  const fill = new THREE.DirectionalLight(0xc8d6ff, 0.55); fill.position.set(-3, 1.2, 2.2); scene.add(fill);

  // 3D backdrop: a real-world-sized photo plane ~12 m behind her, always facing the camera, horizon at eye level.
  // With it on, the camera stays put when the height changes, so she visibly grows/shrinks against the scenery.
  // The plane covers the photo's own field of view (~75° wide) as seen from the camera, so things in the photo keep
  // their true angular size; each photo's horizon (fraction from the top) is lifted to the camera's eye level.
  const BG_D = 12, BG_FOV = Math.tan(THREE.MathUtils.degToRad(75 / 2)), BG_AR = 1024 / 1792;
  const BG_HORIZON = { brickellam: 0.63, brickell: 0.7, brickellpm: 0.67, ultra: 0.58, desert: 0.5, jungle: 0.59, miami: 0.61, snow: 0.6, christmas: 0.52, halloween: 0.64, newyear: 0.6, valentine: 0.62, july4: 0.68 };
  const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff, depthWrite: false, toneMapped: false, fog: false }));
  backdrop.renderOrder = -10; backdrop.visible = false; backdrop.frustumCulled = false;
  const bgTex = {}; let bgOn = false, bgWant = "";
  const ground = new THREE.Mesh(new THREE.CircleGeometry(0.6, 48), new THREE.MeshBasicMaterial({ map: radialTex(), transparent: true, depthWrite: false }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = 0.001; scene.add(ground); scene.add(backdrop);
  // Under a flat backdrop photo: a wide floor tiled from the photo's own bottom strip, drawn behind the photo,
  // so looking down from above never shows empty space below the picture.
  const floor = new THREE.Mesh(new THREE.CircleGeometry(40, 64), new THREE.MeshBasicMaterial({ color: 0xffffff, depthWrite: false, toneMapped: false, fog: false }));
  floor.rotation.x = -Math.PI / 2; floor.renderOrder = -20; floor.visible = false; scene.add(floor);
  // and above it a sky dome in the photo's own top colour (looking up from low never shows empty space either)
  const skyFill = new THREE.Mesh(new THREE.SphereGeometry(39, 32, 16), new THREE.MeshBasicMaterial({ color: 0x888888, side: THREE.BackSide, depthWrite: false, toneMapped: false, fog: false }));
  skyFill.renderOrder = -30; skyFill.visible = false; scene.add(skyFill);
  const floorTex = {};
  function floorFrom(id, img) {
    if (floorTex[id]) return floorTex[id];
    const c = document.createElement("canvas"), w = 512, hh = 512, g = c.getContext("2d"); c.width = w; c.height = hh;
    const sh = Math.round(img.height * 0.22);
    g.filter = "blur(3px)"; g.drawImage(img, 0, img.height - sh, img.width, sh, -8, -8, w + 16, hh + 16); g.filter = "none";
    // soften the tile edges into the average colour so the repeat doesn't read as a pattern
    const d = g.getImageData(0, 0, w, hh).data; let r = 0, gg = 0, b = 0; for (let i = 0; i < d.length; i += 4) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; } const n = d.length / 4;
    const avg = "rgb(" + Math.round(r / n) + "," + Math.round(gg / n) + "," + Math.round(b / n) + ")";
    const gr = g.createRadialGradient(w / 2, hh / 2, w * 0.2, w / 2, hh / 2, w * 0.72); gr.addColorStop(0, "rgba(0,0,0,0)"); gr.addColorStop(1, avg);
    g.globalAlpha = 0.85; g.fillStyle = gr; g.fillRect(0, 0, w, hh); g.globalAlpha = 1;
    const top = document.createElement("canvas"); top.width = 8; top.height = 2; const tg = top.getContext("2d"); tg.drawImage(img, 0, 0, img.width, Math.max(2, img.height * 0.04), 0, 0, 8, 2);
    const td = tg.getImageData(0, 0, 8, 2).data; let tr = 0, tgg = 0, tb = 0; for (let i = 0; i < td.length; i += 4) { tr += td[i]; tgg += td[i + 1]; tb += td[i + 2]; }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.MirroredRepeatWrapping; t.repeat.set(7, 7); t.anisotropy = 8;
    t.userData.sky = new THREE.Color(tr / 16 / 255, tgg / 16 / 255, tb / 16 / 255).convertSRGBToLinear();
    return (floorTex[id] = t);
  }
  // 360° scenes: an equirectangular panorama projected onto the ground (img/baddies/pano/<id>.webp, shot from 1.6 m),
  // so the scenery and the floor are there from every angle, above and below. Scenes without one keep the flat photo.
  const PANO_H = 1.6, PANO_R = 38, PANO_BASE = Math.PI / 2;
  const PANOS = { desert: "1124a", miami: "1124b", snow: "1124b", jungle: "1124b", christmas: "1124b", halloween: "1124b", newyear: "1124b", valentine: "1124b", july4: "1124a", brickellam: "1124a", brickell: "1124a", brickellpm: "1124a", ultra: "1124a", timessquare: "1124b", pyramids: "1124a", santamonica: "1124a", vegas: "1124a", niagara: "1124b", burj: "1124b", eiffel: "1124a", liberty: "1124b", vizcaya: "1124b", frenchmans: "1124a", bamboo: "1124a", chinasnow: "1124b", southbeach: "1125a", hawaii: "1125a", malibu: "1125a", everest: "1125a", overlook: "1125a", nyroof: "1125a", antdubai: "1125a", anttokyo: "1125a", antshanghai: "1125a", wing777: "1125a", mars: "1125a", moon: "1125a", sigbridge: "1127a" };   // scene id -> version, for the scenes that have a 360 panorama in img/baddies/pano/
  let sky = null, panoOn = false; const panoTex = {}, panoMiss = {};
  // 4K loads first; on desktops whose GPU takes 8192-px textures the 8K version follows and swaps in when ready
  const PANO_8K = !/Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) && renderer.capabilities.maxTextureSize >= 8192;
  const panoHi = {};
  function panoTexFrom(t) { t.mapping = THREE.EquirectangularReflectionMapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = renderer.capabilities.getMaxAnisotropy(); return t; }
  function loadPano(id, cb) {
    if (panoTex[id]) return cb(panoTex[id]); if (panoMiss[id] || !PANOS[id]) return cb(null);
    new THREE.TextureLoader().load(new URL("img/baddies/pano/" + id + ".webp?v=" + PANOS[id], document.baseURI).href, (t) => {
      panoTex[id] = panoTexFrom(t); cb(t);
      if (PANO_8K && !panoHi[id]) {
        panoHi[id] = 1;
        new THREE.TextureLoader().load(new URL("img/baddies/pano/" + id + "-8k.webp?v=" + PANOS[id], document.baseURI).href, (h) => {
          const lo = panoTex[id]; panoTex[id] = panoTexFrom(h);
          for (const sk of [skyG, skyU]) if (sk && sk.material.map === lo) { sk.material.map = h; sk.material.needsUpdate = true; }
          lo.dispose();
        }, undefined, () => {});
      }
    }, undefined, () => { panoMiss[id] = true; cb(null); });
  }
  // where each panorama's main subject sits (0..1 across the image): turned to stand behind her in the front view
  const PANO_HERO = { timessquare: 0.5, pyramids: 0.74, santamonica: 0.12, vegas: 0.55, niagara: 0.42, burj: 0.53, eiffel: 0.92, liberty: 0.57, vizcaya: 0.89, frenchmans: 0.45, bamboo: 0.5, chinasnow: 0.7, desert: 0.45, snow: 0.5, christmas: 0.46, halloween: 0.975, newyear: 0.55, valentine: 0.5, july4: 0.72, brickellpm: 0.3, miami: 0.53, ultra: 0.93, jungle: 0.5, southbeach: 0.5, hawaii: 0.78, malibu: 0.62, everest: 0.58, overlook: 0.38, nyroof: 0.215, antdubai: 0.35, anttokyo: 0.445, antshanghai: 0.95, wing777: 0.5, mars: 0.3, moon: 0.58, sigbridge: 0.25 };
  let panoId = "";
  // high-up scenes (summits, rooftops, antenna tips, a plane wing): the panorama stays a plain sphere so the drop below
  // reads as a drop (no ground flattened under her), and a small 3D platform carries her instead
  const PANO_UP = { everest: "snow", overlook: "rock", nyroof: "roof", antdubai: "mast", anttokyo: "mast", antshanghai: "mast", wing777: "wing", sigbridge: "arch" };
  let skyG = null, skyU = null; const props = {}, upEnv = {};
  // ---- Boeing 777 (real scale, metres): she stands at the right wingtip; nose toward -z, fuselage ~30 m inboard (-x)
  function canvasTexture(w, h, draw) {
    const c = document.createElement("canvas"); c.width = w; c.height = h; draw(c.getContext("2d"), w, h);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
  }
  function bumpTexture(w, h, draw) {   // grey height map: darker = recessed (panel seams), lighter = raised (rivets)
    const c = document.createElement("canvas"); c.width = w; c.height = h; const x = c.getContext("2d"); x.fillStyle = "#808080"; x.fillRect(0, 0, w, h); draw(x, w, h);
    const t = new THREE.CanvasTexture(c); t.anisotropy = 8; return t;
  }
  let glowTex = null;
  function glow(color, size) {
    if (!glowTex) glowTex = canvasTexture(128, 128, (x, W, H) => { const gr = x.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W / 2); gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.18, "rgba(255,255,255,0.75)"); gr.addColorStop(0.45, "rgba(255,255,255,0.18)"); gr.addColorStop(1, "rgba(255,255,255,0)"); x.fillStyle = gr; x.fillRect(0, 0, W, H); });
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false }));
    sp.scale.setScalar(size); return sp;
  }
  function make777(g, std) {
    const TIPX = 0.9, ROOTX = -27.1, DIH = Math.tan(6 * Math.PI / 180);
    const zLE = (t) => -16 + 15.4 * t + (t > 0.9 ? Math.pow((t - 0.9) / 0.1, 2) * 1.1 : 0);
    const zTE = (t) => (t < 0.33 ? -2 : -2 + (t - 0.33) / 0.67 * 3.3);
    const tr = (t) => 0.14 - 0.045 * t;
    const wy = (xs) => { const t = (xs - ROOTX) / (TIPX - ROOTX); return (xs - TIPX) * DIH * 0.8 - 0.9 * (1 - t * t); };   // dihedral plus the upward flex of a loaded wing in flight
    // wing skin: light Boeing grey, panel lines, slat / flap / aileron breaks, walkway-free outer wing
    const wingTex = canvasTexture(2048, 512, (x, W, H) => {
      x.fillStyle = "#c7cbd0"; x.fillRect(0, 0, W, H);
      const r = rnd(5); for (let i = 0; i < 9000; i++) { x.fillStyle = `rgba(${r() < 0.5 ? "255,255,255" : "0,0,0"},0.035)`; x.fillRect(r() * W, r() * H, 3, 2); }
      x.strokeStyle = "rgba(60,66,74,0.28)"; x.lineWidth = 1.1;
      for (let s = 0; s < W; s += 46) { x.beginPath(); x.moveTo(s, H * 0.17); x.lineTo(s, H * 0.72); x.stroke(); }      // spanwise panel joints
      for (const v of [0.17, 0.3, 0.45, 0.58, 0.72]) { x.beginPath(); x.moveTo(0, H * v); x.lineTo(W, H * v); x.stroke(); }
      x.strokeStyle = "rgba(40,44,50,0.5)"; x.lineWidth = 2;
      for (let s = 0; s < W; s += 205) { x.beginPath(); x.moveTo(s, 0); x.lineTo(s, H * 0.17); x.stroke(); }              // slat segments
      for (const s of [0, 380, 760, 1150, 1520]) { x.beginPath(); x.moveTo(s, H * 0.72); x.lineTo(s, H); x.stroke(); }     // flap / aileron breaks
      x.fillStyle = "rgba(30,34,40,0.18)"; x.fillRect(0, H * 0.72, W, H * 0.28);
      const le = x.createLinearGradient(0, 0, 0, H * 0.07); le.addColorStop(0, "#e9ecef"); le.addColorStop(0.6, "#d4d8dd"); le.addColorStop(1, "rgba(199,203,208,0)"); x.fillStyle = le; x.fillRect(0, 0, W, H * 0.07);
      x.fillStyle = "rgba(210,40,40,0.9)"; x.font = "bold 22px Arial"; for (let s = 120; s < W * 0.8; s += 420) x.fillText("NO STEP", s, H * 0.8);
    });
    const wingBump = bumpTexture(2048, 512, (x, W, H) => {
      x.strokeStyle = "#3a3a3a"; x.lineWidth = 2;
      for (let s = 0; s < W; s += 46) { x.beginPath(); x.moveTo(s, H * 0.17); x.lineTo(s, H * 0.72); x.stroke(); }
      for (const v of [0.17, 0.3, 0.45, 0.58, 0.72]) { x.beginPath(); x.moveTo(0, H * v); x.lineTo(W, H * v); x.stroke(); }
      x.lineWidth = 4; x.strokeStyle = "#202020";
      for (let s = 0; s < W; s += 205) { x.beginPath(); x.moveTo(s, 0); x.lineTo(s, H * 0.17); x.stroke(); }
      for (const s of [0, 380, 760, 1150, 1520]) { x.beginPath(); x.moveTo(s, H * 0.72); x.lineTo(s, H); x.stroke(); }
      x.fillStyle = "#a8a8a8"; for (const v of [0.17, 0.3, 0.45, 0.58, 0.72]) for (let s = 4; s < W; s += 9) x.fillRect(s, H * v + 3, 2, 2);   // rivet rows beside the seams
    });
    const wingRough = bumpTexture(1024, 256, (x, W, H) => { const r = rnd(9); for (let i = 0; i < 2600; i++) { const v = 100 + r() * 70 | 0; x.fillStyle = `rgb(${v},${v},${v})`; x.fillRect(r() * W, r() * H, 6 + r() * 30, 2 + r() * 6); } });   // weathering: uneven sheen
    const wingMat = std({ map: wingTex, bumpMap: wingBump, bumpScale: 1.6, roughnessMap: wingRough, color: 0xffffff, roughness: 0.75, metalness: 0.25, side: THREE.DoubleSide });
    // airfoil loft (NACA-style thickness with slight camber), cosine chord spacing, raked tip
    const NS = 44, NC = 26, pos = [], uv = [], idx = [];
    for (let i = 0; i <= NS; i++) {
      const t = 1 - (1 - i / NS) ** 1.25, xs = ROOTX + (TIPX - ROOTX) * t, le = zLE(t), te = zTE(t), c = te - le, th = tr(t) * c * (t > 0.95 ? Math.sqrt(Math.max(0.02, 1 - ((t - 0.95) / 0.05) ** 2)) : 1), yb = wy(xs);   // stations bunch toward the tip, which rounds off
      for (let j = 0; j < 2 * NC; j++) {
        const up = j < NC, k = up ? NC - 1 - j : j - NC, u = 0.5 * (1 - Math.cos(Math.PI * k / (NC - 1)));
        const yt = 5 * th * (0.2969 * Math.sqrt(u) - 0.126 * u - 0.3516 * u * u + 0.2843 * u ** 3 - 0.1036 * u ** 4), cam = 0.025 * c * 4 * u * (1 - u);
        pos.push(xs, yb + cam + (up ? yt : -yt) - 0.02, le + u * c); uv.push(t, 1 - u);
      }
    }
    const R = 2 * NC;
    for (let i = 0; i < NS; i++) for (let j = 0; j < R; j++) { const a = i * R + j, b = i * R + (j + 1) % R, c2 = a + R, d = b + R; idx.push(a, c2, b, b, c2, d); }
    const tc = (NS + 1) * R; let sx = 0, sy = 0, sz = 0; for (let j = 0; j < R; j++) { sx += pos[(NS * R + j) * 3]; sy += pos[(NS * R + j) * 3 + 1]; sz += pos[(NS * R + j) * 3 + 2]; }
    pos.push(sx / R, sy / R, sz / R); uv.push(1, 0.5); for (let j = 0; j < R; j++) idx.push(tc, NS * R + j, NS * R + (j + 1) % R);
    const wg = new THREE.BufferGeometry(); wg.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); wg.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2)); wg.setIndex(idx); wg.computeVertexNormals();
    const wing = new THREE.Mesh(wg, wingMat); g.add(wing);
    const canoeMat = std({ color: 0xc9cdd2, roughness: 0.4, metalness: 0.3 });
    for (const cx of [-22.5, -12.5, -7.5, -3.2]) {
      const ct = (cx - ROOTX) / (TIPX - ROOTX), cte = zTE(ct), cl = cx > -5 ? 3 : 4.6;
      const cn = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), canoeMat); cn.scale.set(cx > -5 ? 0.22 : 0.32, cx > -5 ? 0.26 : 0.38, cl); cn.position.set(cx, wy(cx) - 0.28, cte - cl * 0.35); g.add(cn);
    }
    const wickMat = std({ color: 0x5b6067, roughness: 0.5, metalness: 0.5 });
    for (const t of [0.74, 0.8, 0.86, 0.92, 0.975]) {   // static wicks: thin rods off the aileron / tip trailing edge
      const xs = ROOTX + (TIPX - ROOTX) * t, wk = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.005, 0.22, 6), wickMat);
      wk.rotation.x = Math.PI / 2 - 0.08; wk.position.set(xs, wy(xs) - 0.01, zTE(t) + 0.1); g.add(wk);
    }
    const navG = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 8), new THREE.MeshBasicMaterial({ color: 0x29ff6a })); navG.position.set(TIPX - 0.05, wy(TIPX) + 0.02, zLE(1) + 0.15); g.add(navG);
    const navGlow = glow(0x29ff6a, 0.32); navGlow.position.copy(navG.position); g.add(navGlow);
    const strobe = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffffff })); strobe.position.set(TIPX - 0.05, wy(TIPX) + 0.02, zTE(1) - 0.2); g.add(strobe);
    const strobeGlow = glow(0xffffff, 0.9); strobeGlow.position.copy(strobe.position); g.add(strobeGlow);
    const land = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8), new THREE.MeshBasicMaterial({ color: 0xfff6dd })); land.position.set(ROOTX + 1.2, wy(ROOTX + 1.2) - 0.05, zLE(0.05) - 0.05); g.add(land);   // wing-root landing light
    // GE90 engine: lathe nacelle, dark fan face with spinner, exhaust cone, pylon
    const nacMat = std({ color: 0xdfe3e7, roughness: 0.35, metalness: 0.45, side: THREE.DoubleSide }), darkMat = std({ color: 0x1a1d22, roughness: 0.5, metalness: 0.6 }), chrome = std({ color: 0xb9bec4, roughness: 0.18, metalness: 0.95 });
    const prof = [[1.62, 0], [1.78, 0.12], [1.86, 0.7], [1.84, 2.2], [1.66, 4.4], [1.42, 5.9], [1.18, 6.6], [1.12, 6.62]].map(([r, y]) => new THREE.Vector2(r, y));
    const eng = new THREE.Group();
    const nac = new THREE.Mesh(new THREE.LatheGeometry(prof, 64), nacMat); eng.add(nac);
    const inner = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 1.4, 48, 1, true), darkMat); inner.position.y = 0.7; eng.add(inner);
    const fan = new THREE.Mesh(new THREE.CircleGeometry(1.6, 48), darkMat); fan.rotation.x = Math.PI / 2; fan.position.y = 1.35; eng.add(fan);
    const bladeMat = std({ color: 0x5a6068, roughness: 0.35, metalness: 0.9, side: THREE.DoubleSide });
    for (let b = 0; b < 22; b++) { const bl = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.04, 1.42), bladeMat); bl.position.set(0, 1.0, 0); bl.rotation.y = b / 22 * Math.PI * 2; bl.translateZ(0.85); bl.rotateZ(0.6); eng.add(bl); }
    const lip = new THREE.Mesh(new THREE.TorusGeometry(1.7, 0.09, 12, 64), chrome); lip.rotation.x = Math.PI / 2; lip.position.y = 0.06; eng.add(lip);
    const swirl = canvasTexture(512, 256, (x, W, H) => { x.fillStyle = "#2b2f35"; x.fillRect(0, 0, W, H); x.strokeStyle = "#f2f2f2"; x.lineWidth = 16; x.beginPath(); for (let i = 0; i <= 60; i++) { const v = i / 60; const px = (v * W * 0.9) % W, py = H * (1 - v); i ? x.lineTo(px, py) : x.moveTo(px, py); } x.stroke(); });
    const spin = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.1, 48), std({ map: swirl, roughness: 0.3, metalness: 0.5 })); spin.rotation.x = Math.PI; spin.position.y = 0.75; eng.add(spin);
    const seam = new THREE.Mesh(new THREE.TorusGeometry(1.775, 0.012, 6, 96), std({ color: 0x3a3f45, roughness: 0.6 })); seam.rotation.x = Math.PI / 2; seam.position.y = 3.3; eng.add(seam);   // thrust-reverser cowl seam
    const seam2 = seam.clone(); seam2.scale.setScalar(1.86 / 1.775); seam2.position.y = 0.9; eng.add(seam2);
    const plug = new THREE.Mesh(new THREE.ConeGeometry(0.75, 2.2, 32), darkMat); plug.position.y = 7.6; eng.add(plug);
    eng.rotation.x = Math.PI / 2;                                    // lathe axis +y -> +z (intake faces the nose, -z)
    const ex = -17.6, et = (ex - ROOTX) / (TIPX - ROOTX); eng.position.set(ex, wy(ex) - 2.75, zLE(et) - 3.2); g.add(eng);
    const pylon = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 5.6, 20), nacMat); pylon.rotation.x = Math.PI / 2; pylon.scale.set(0.28, 0.75, 0.75); pylon.position.set(ex, wy(ex) - 0.78, zLE(et) - 0.1); g.add(pylon);
    // fuselage: lathe with ogive nose and tail cone, white with grey belly, window row and a blue cheatline on her side
    const FX = -29.8, FY = wy(ROOTX) + 1.55, NOSE = -42, L = 63.7;
    const fuseTex = canvasTexture(512, 4096, (x, W, H) => {
      x.fillStyle = "#f3f4f6"; x.fillRect(0, 0, W, H);
      const belly = x.createLinearGradient(0, 0, W, 0); belly.addColorStop(0, "#9aa2ab"); belly.addColorStop(0.12, "#c9ced4"); belly.addColorStop(0.2, "rgba(243,244,246,0)");
      belly.addColorStop(0.8, "rgba(243,244,246,0)"); belly.addColorStop(0.88, "#c9ced4"); belly.addColorStop(1, "#9aa2ab"); x.fillStyle = belly; x.fillRect(0, 0, W, H);
      x.fillStyle = "#1c4c9c"; x.fillRect(W * 0.262, H * 0.03, W * 0.012, H * 0.94); x.fillRect(W * 0.726, H * 0.03, W * 0.012, H * 0.94);
      for (const cx of [0.302, 0.698]) {
        for (let v = 0.105; v < 0.88; v += 0.0082) { if (Math.abs(v - 0.3) < 0.012 || Math.abs(v - 0.52) < 0.012) continue; x.fillStyle = "#c3c8ce"; x.beginPath(); x.ellipse(W * cx, H * v, 7, 10, 0, 0, Math.PI * 2); x.fill(); x.fillStyle = "#20252c"; x.beginPath(); x.ellipse(W * cx, H * v, 5, 8, 0, 0, Math.PI * 2); x.fill(); x.fillStyle = "rgba(150,180,220,0.35)"; x.beginPath(); x.ellipse(W * cx - 1.5, H * v - 2.5, 2, 3, 0, 0, Math.PI * 2); x.fill(); }
        x.strokeStyle = "#8e959d"; x.lineWidth = 2; for (const v of [0.085, 0.3, 0.52, 0.86]) x.strokeRect(W * cx - 9, H * v - 26, 18, 52);
      }
      x.fillStyle = "#151a20"; for (const sd of [1, -1]) for (let k = 0; k < 3; k++) { const cx = 0.5 - sd * (0.122 + k * 0.033), v = 0.058 + k * 0.004; x.beginPath(); x.moveTo(W * (cx - 0.0155), H * (v - 0.003)); x.lineTo(W * (cx + 0.0155), H * (v - 0.0038)); x.lineTo(W * (cx + 0.017), H * (v + 0.003)); x.lineTo(W * (cx - 0.014), H * (v + 0.0036)); x.closePath(); x.fill(); }   // cockpit windows
      x.strokeStyle = "#8e959d"; x.lineWidth = 2; for (const cx of [0.04, 0.96]) { x.strokeRect(W * cx - 14, H * 0.56, 28, H * 0.06); x.strokeRect(W * cx - 10, H * 0.24, 20, H * 0.025); }   // main / nose gear doors
      x.save(); x.translate(W * 0.31, H * 0.905); x.rotate(Math.PI / 2); x.scale(-1, 1); x.textAlign = "right"; x.fillStyle = "#2a2f36"; x.font = "bold 22px Arial"; x.fillText("N777AH", 0, 0); x.restore();
      x.save(); x.translate(W * 0.36, H * 0.2); x.rotate(Math.PI / 2); x.scale(-1, 1); x.textAlign = "right"; x.fillStyle = "#1c4c9c"; x.font = "bold 46px Arial"; x.fillText("AI RESOURCE HUB", 0, 0); x.restore();
      x.save(); x.translate(W * 0.64, H * 0.48); x.rotate(-Math.PI / 2); x.scale(-1, 1); x.textAlign = "right"; x.fillStyle = "#1c4c9c"; x.font = "bold 46px Arial"; x.fillText("AI RESOURCE HUB", 0, 0); x.restore();
    });
    const even = (p, n) => { const o = []; for (let i = 0; i <= n; i++) { const y = L * i / n; let k = 1; while (k < p.length - 1 && p[k].y < y) k++; const a = p[k - 1], b = p[k], f = Math.min(1, Math.max(0, (y - a.y) / (b.y - a.y || 1))); o.push(new THREE.Vector2(a.x + (b.x - a.x) * f, y)); } return o; };
    const fp = [[0.01, 0], [0.9, 0.45], [1.6, 1.3], [2.3, 2.6], [2.8, 4.3], [3.05, 6.4], [3.1, 8.5], [3.1, 46], [2.9, 51], [2.3, 56], [1.4, 60.5], [0.6, 63.2], [0.3, L]].map(([r, y]) => new THREE.Vector2(r, y));
    fuseTex.flipY = false;
    const fg = new THREE.LatheGeometry(even(fp, 160), 96);
    { const pa = fg.attributes.position; for (let i = 0; i < pa.count; i++) { const y = pa.getY(i); if (y > 44) pa.setZ(i, pa.getZ(i) - 0.0055 * (y - 44) ** 2); } }   // tail cone sweeps up
    fg.rotateX(Math.PI / 2); fg.computeVertexNormals();
    const fuseBump = bumpTexture(512, 4096, (x, W, H) => {
      x.strokeStyle = "#5a5a5a"; x.lineWidth = 1.5;
      for (let v = 0.05; v < 0.97; v += 0.024) { x.beginPath(); x.moveTo(0, H * v); x.lineTo(W, H * v); x.stroke(); }      // circumferential skin joints
      for (const u of [0.12, 0.21, 0.36, 0.45, 0.55, 0.64, 0.79, 0.88]) { x.beginPath(); x.moveTo(W * u, 0); x.lineTo(W * u, H); x.stroke(); }   // lap joints
      x.strokeStyle = "#1e1e1e"; x.lineWidth = 3;
      for (const cx of [0.302, 0.698]) for (const v of [0.085, 0.3, 0.52, 0.86]) x.strokeRect(W * cx - 9, H * v - 26, 18, 52);   // doors
      for (const cx of [0.04, 0.96]) { x.strokeRect(W * cx - 14, H * 0.56, 28, H * 0.06); x.strokeRect(W * cx - 10, H * 0.24, 20, H * 0.025); }
      x.fillStyle = "#4a4a4a"; for (const cx of [0.302, 0.698]) for (let v = 0.105; v < 0.88; v += 0.0082) { x.beginPath(); x.ellipse(W * cx, H * v, 7, 10, 0, 0, Math.PI * 2); x.fill(); }   // window recesses
    });
    fuseBump.flipY = false;
    const fus = new THREE.Mesh(fg, std({ map: fuseTex, bumpMap: fuseBump, bumpScale: 1.4, color: 0xffffff, roughness: 0.32, metalness: 0.15 })); fus.position.set(FX, FY, NOSE); g.add(fus);
    const plate = (pts, depth) => { const s = new THREE.Shape(); s.moveTo(pts[0][0], pts[0][1]); pts.slice(1).forEach((p) => s.lineTo(p[0], p[1])); s.closePath(); return new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.08, bevelSegments: 2 }); };
    const beacons = [];
    for (const [by, bz] of [[3.12, -14], [-3.12, -10]]) { const bc = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8), new THREE.MeshBasicMaterial({ color: 0xff2222 })); bc.position.set(FX, FY + by, bz); g.add(bc); const bg = glow(0xff2a2a, 3.2); bg.position.copy(bc.position); g.add(bg); beacons.push(bg); }   // anti-collision beacons
    const antMat = std({ color: 0xe8eaed, roughness: 0.4, metalness: 0.2 });
    for (const [ay, az, h] of [[3.1, -30, 0.45], [3.1, -18, 0.32], [3.1, 4, 0.32], [-3.1, -25, 0.3], [-3.1, 0, 0.3]]) {   // blade antennas
      const an = new THREE.Mesh(plate([[0, 0], [0.22, h], [0.38, h], [0.55, 0]], 0.03), antMat); an.geometry.rotateY(-Math.PI / 2); if (ay < 0) an.rotation.z = Math.PI; an.position.set(FX + 0.015, FY + ay, az); g.add(an);
    }
    for (const sd of [1, -1]) { const pt = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.025, 0.32, 8), chrome); pt.rotation.x = Math.PI / 2; pt.position.set(FX + sd * 2.62, FY - 0.25, NOSE + 4.6); g.add(pt); }   // pitot tubes
    const apuR = 0.6 * 0.55, apuZ = NOSE + L, apuY = FY + 0.0055 * (L - 44) ** 2;
    const apu = new THREE.Mesh(new THREE.CylinderGeometry(apuR, apuR, 0.3, 24, 1, true), darkMat); apu.rotation.x = Math.PI / 2; apu.position.set(FX, apuY, apuZ - 0.05); g.add(apu);   // APU exhaust
    const apuIn = new THREE.Mesh(new THREE.CircleGeometry(apuR, 24), std({ color: 0x0c0d0f, roughness: 0.9 })); apuIn.position.set(FX, apuY, apuZ - 0.12); g.add(apuIn);
    g.userData.tick = (t) => {   // double-flash wingtip strobe and slow red beacons, like the real thing
      const p = t % 1.25, on = p < 0.05 || (p > 0.14 && p < 0.19);
      strobeGlow.visible = on; strobe.material.color.setScalar(on ? 1 : 0.55);
      const b = Math.max(0, Math.sin(t * Math.PI * 2 * 0.9)) ** 6; beacons.forEach((bg) => { bg.material.opacity = 0.15 + 0.85 * b; });
    };
    const fair = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), std({ color: 0xd9dde2, roughness: 0.4, metalness: 0.2 })); fair.scale.set(3.4, 1.3, 10); fair.position.set(FX + 0.6, FY - 2.3, -8.5); g.add(fair);   // wing-body fairing
    // vertical fin and stabilisers (swept, thin extrusions)
    const tailMat = std({ color: 0xf3f4f6, roughness: 0.32, metalness: 0.15, side: THREE.DoubleSide });
    const finTex = canvasTexture(1024, 1024, (x, W, H) => {
      x.fillStyle = "#f3f4f6"; x.fillRect(0, 0, W, H);
      const gr = x.createLinearGradient(0, H, W, 0); gr.addColorStop(0, "#0e2f6b"); gr.addColorStop(1, "#2a6fd6"); x.fillStyle = gr;
      x.beginPath(); x.moveTo(0, H * 0.62); x.quadraticCurveTo(W * 0.5, H * 0.5, W, H * 0.12); x.lineTo(W, 0); x.lineTo(0, 0); x.closePath(); x.fill();
      x.strokeStyle = "#ff7a1a"; x.lineWidth = 26; x.beginPath(); x.moveTo(0, H * 0.7); x.quadraticCurveTo(W * 0.5, H * 0.58, W, H * 0.2); x.stroke();
      x.strokeStyle = "rgba(40,45,55,0.55)"; x.lineWidth = 3; x.beginPath(); x.moveTo(W * 10.5 / 12.6, H); x.lineTo(W * 9.25 / 12.6, H * (1 - 11.2 / 11.5)); x.stroke();   // rudder hinge line
      x.save(); x.translate(W * 0.6, H * 0.33); x.rotate(0.42); x.scale(-1, 1); x.fillStyle = "#ffffff"; x.font = "bold 150px Arial"; x.textAlign = "center"; x.fillText("AIRH", 0, 0); x.restore();
    });
    finTex.wrapS = finTex.wrapT = THREE.ClampToEdgeWrapping; finTex.repeat.set(1 / 12.6, 1 / 11.5);
    const finMat = std({ map: finTex, color: 0xffffff, roughness: 0.32, metalness: 0.15, side: THREE.DoubleSide });
    const fin = new THREE.Mesh(plate([[0, 0], [7.2, 11.5], [10.6, 11.5], [12.6, 0]], 0.45), finMat); fin.geometry.rotateY(-Math.PI / 2); fin.position.set(FX + 0.22, FY + 2.6, NOSE + 47.5); g.add(fin);
    for (const sgn of [1, -1]) {
      const st = new THREE.Mesh(plate([[0, 0], [10.5, -5.8], [10.5, -8.3], [0, -7.2]], 0.3), tailMat); st.geometry.rotateX(-Math.PI / 2);
      st.scale.x = sgn; st.position.set(FX + sgn * 2.2, FY + 0.6, NOSE + 51); g.add(st);
      const el = new THREE.Mesh(new THREE.BoxGeometry(9.2, 0.02, 0.03), std({ color: 0x5a616b, roughness: 0.6 })); el.position.set(FX + sgn * (2.2 + 5.2), FY + 0.6 + 0.3 + 0.08, NOSE + 51 + 5.4 + 0.25 * 5.2 / 10.5 * 2.5); el.rotation.y = sgn * -0.25; g.add(el);   // elevator hinge seam
    }
    // far (left) wing and engine, mirrored across the fuselage centre line
    const lw = wing.clone(); lw.scale.x = -1; lw.position.x = 2 * FX; g.add(lw);
    const le2 = eng.clone(); le2.position.x = 2 * FX - ex; g.add(le2);
    const pl2 = pylon.clone(); pl2.position.x = 2 * FX - ex; g.add(pl2);
    const navR = navG.clone(); navR.material = new THREE.MeshBasicMaterial({ color: 0xff2a2a }); navR.position.x = 2 * FX - navG.position.x; g.add(navR);
    const navRGlow = glow(0xff2a2a, 0.32); navRGlow.position.copy(navR.position); g.add(navRGlow);
  }
  // ---- Miami I-395 Signature Bridge: she stands on the crown of the tallest arch (~100 m over the highway).
  // The arch runs along x (left / right in the front view). White concrete box section, cyan LED strips along
  // both top edges and the underside, white cable stays fanning down to the deck, two lower crossing arches.
  function archCurve(H, half) { const k = H / (half * half); return (x) => -k * x * x; }   // top surface, peak at y = 0
  function sweepBox(fy, x0, x1, step, w, d, mat, rot, off) {   // rectangular section swept along y = fy(x) in the xy plane
    const pos = [], idx = [], N = Math.round((x1 - x0) / step);
    const corners = [[-w / 2, 0], [w / 2, 0], [w / 2, -d], [-w / 2, -d]];   // (z, down along the normal)
    for (let i = 0; i <= N; i++) {
      const x = x0 + (x1 - x0) * i / N, y = fy(x), e = 0.01, dy = (fy(x + e) - fy(x - e)) / (2 * e);
      const tl = Math.hypot(1, dy), nx = -dy / tl, ny = 1 / tl;   // up normal of the curve
      for (const [z, dn] of corners) pos.push(x + nx * dn, y + ny * dn, z);
    }
    for (let i = 0; i < N; i++) for (let c = 0; c < 4; c++) {
      const a = i * 4 + c, b = i * 4 + (c + 1) % 4, a2 = a + 4, b2 = b + 4;
      idx.push(a, a2, b, b, a2, b2);
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, mat); if (rot) m.rotation.y = rot; if (off) m.position.set(off[0], off[1], off[2]); return m;
  }
  function makeArch(g, std) {
    const white = std({ color: 0xe6e9ec, roughness: 0.55, metalness: 0.05, side: THREE.DoubleSide });
    const led = new THREE.MeshBasicMaterial({ color: 0x48e6ff, toneMapped: false });
    const cable = std({ color: 0xf2f4f6, roughness: 0.4, metalness: 0.3 });
    const W = 3.2, D = 2.6;
    const arch = (H, half, rot, off, leds = true) => {
      const fy = archCurve(H, half), grp = new THREE.Group();
      grp.add(sweepBox(fy, -half * 1.02, half * 1.02, half / 90, W, D, white));
      if (leds) for (const s of [-1, 1]) {   // LED strips on both top edges and a wash along the underside
        grp.add(sweepBox((x) => fy(x) - 0.12, -half, half, half / 90, 0.12, 0.18, led, 0, [0, 0, s * (W / 2 + 0.05)]));
      }
      if (leds) grp.add(sweepBox((x) => fy(x) - D - 0.02, -half, half, half / 90, 1.4, 0.06, led));
      // cable stays: fan down from the arch to the deck 100 m below, on both sides
      for (let x = -half * 0.9; x <= half * 0.9; x += 7) {
        if (Math.abs(x) < 4) continue;
        for (const s of [-1, 1]) {
          const a = new THREE.Vector3(x, fy(x) - D * 0.5, s * 1.2), b = new THREE.Vector3(x * 0.96, -H - 2, s * 9);
          const len = a.distanceTo(b), c = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, len, 6, 1, true), cable);
          c.position.copy(a).add(b).multiplyScalar(0.5); c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()); grp.add(c);
        }
      }
      if (rot) grp.rotation.y = rot; if (off) grp.position.set(...off);
      g.add(grp); return grp;
    };
    arch(100, 82);                                   // the tallest arch: she stands on its crown
    // the five lower arches step down along the highway on both sides, turned and leaning so they cross each other
    for (const [H, x, rot, lean] of [[86, -34, 0.32, 0.14], [86, 34, -0.32, -0.14], [70, -66, -0.28, -0.12], [70, 66, 0.28, 0.12], [56, -96, 0.22, 0.1]]) {
      const a = arch(H, H * 0.84, rot, [x, -(100 - H), 0]); a.rotation.x = lean;
    }
    // highway deck far below (the panorama shows the city; this ties the cables to something)
    const deck = new THREE.Mesh(new THREE.BoxGeometry(260, 1.2, 34), std({ color: 0x3a3d42, roughness: 0.9 })); deck.position.y = -102.6; g.add(deck);
    const glowStrip = (z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(260, 0.1, 0.4), new THREE.MeshBasicMaterial({ color: z > 0 ? 0xff4030 : 0xfff1d0, toneMapped: false })); m.position.set(0, -101.95, z); g.add(m); };
    for (const z of [-11, -6, 6, 11]) glowStrip(z);
  }
  function makeProp(kind) {
    const g = new THREE.Group();
    const std = (o) => new THREE.MeshStandardMaterial(o);
    if (kind === "rock" || kind === "snow") {
      const geo = new THREE.IcosahedronGeometry(3.2, 3), pos = geo.getAttribute("position"), r = rnd(kind === "rock" ? 7 : 11), v = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i); const n = 1 + (r() - 0.5) * (kind === "rock" ? 0.22 : 0.08);
        v.multiplyScalar(n); v.y *= v.y > 0 ? 0.05 : 0.55; if (v.y > 0) v.y += (r() - 0.5) * 0.04; pos.setXYZ(i, v.x, v.y, v.z);
      }
      geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, std(kind === "rock" ? { color: 0x6f665c, roughness: 0.95, flatShading: true, side: THREE.DoubleSide } : { color: 0xf1f4f8, roughness: 0.8, side: THREE.DoubleSide }));
      m.position.y = -0.15; g.add(m);
    } else if (kind === "roof") {
      const concrete = std({ color: 0x8b8a86, roughness: 0.95 }), glass = std({ color: 0x1b2330, roughness: 0.25, metalness: 0.6 });
      const slab = new THREE.Mesh(new THREE.BoxGeometry(14, 0.4, 14), concrete); slab.position.y = -0.2; g.add(slab);
      for (const [x, z, w, d] of [[0, 7, 14, 0.3], [0, -7, 14, 0.3], [7, 0, 0.3, 14], [-7, 0, 0.3, 14]]) {
        const wall = new THREE.Mesh(new THREE.BoxGeometry(w, 1.1, d), concrete); wall.position.set(x, 0.55, z); g.add(wall);
      }
      const tower = new THREE.Mesh(new THREE.BoxGeometry(14.2, 40, 14.2), glass); tower.position.y = -20.4; g.add(tower);
      const pad = new THREE.Mesh(new THREE.RingGeometry(2.6, 2.9, 48), std({ color: 0xf2c230, roughness: 0.8 })); pad.rotation.x = -Math.PI / 2; pad.position.y = 0.004; g.add(pad);
    } else if (kind === "mast") {
      const steel = std({ color: 0x3b3f45, roughness: 0.45, metalness: 0.85 }), red = std({ color: 0xc8231f, roughness: 0.5, metalness: 0.3 }), white = std({ color: 0xeeeeee, roughness: 0.5, metalness: 0.3 });
      const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.72, 0.08, 40), steel); plate.position.y = -0.04; g.add(plate);
      for (let i = 0; i < 10; i++) {
        const y0 = -0.08 - i * 3, rt = 0.32 + i * 0.07, rb = rt + 0.07;
        const seg = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, 3, 24), i % 2 ? white : red); seg.position.y = y0 - 1.5; g.add(seg);
      }
      const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 8), new THREE.MeshBasicMaterial({ color: 0xff2a1a })); beacon.position.set(0.66, 0.06, -0.1); g.add(beacon);
    } else if (kind === "wing") {
      make777(g, std);
    } else if (kind === "arch") {
      makeArch(g, std);
    }
    g.traverse((o) => { if (o.isMesh) { o.receiveShadow = true; o.userData.lookShadow = true; } });
    g.visible = false; scene.add(g); return g;
  }
  // in high-up scenes the platform itself takes her shadow; the wide invisible shadow catcher and the soft blob would float in mid-air
  function upShadowFix() { const now = performance.now() / 1000; for (const k in props) if (props[k].visible && props[k].userData.tick) props[k].userData.tick(now);
    if (panoOn && PANO_UP[panoId] && sky && sky.visible) { shadowPlane.visible = false; ground.visible = false; } else if (curLook) shadowPlane.visible = !!curLook.shadows; }
  function hideSky() { if (camera.far !== 50) { camera.far = 50; camera.updateProjectionMatrix(); } if (skyG) skyG.visible = false; if (skyU) skyU.visible = false; for (const k in props) props[k].visible = false; sky = null; }
  function showPano(t) {
    const up = PANO_UP[panoId];
    hideSky();
    if (up) { if (!skyU) { skyU = new GroundedSkybox(t, 1000, 30, 96); skyU.position.y = PANO_H; skyU.material.toneMapped = false; skyU.renderOrder = -20; scene.add(skyU); } sky = skyU; (props[up] ||= makeProp(up)).visible = true; }
    else { if (!skyG) { skyG = new GroundedSkybox(t, PANO_H, PANO_R, 96); skyG.position.y = PANO_H - 0.005; skyG.material.toneMapped = false; skyG.renderOrder = -20; scene.add(skyG); } sky = skyG; }
    if (sky.material.map !== t) { sky.material.map = t; sky.material.needsUpdate = true; }
    sky.rotation.y = PANO_BASE + ((PANO_HERO[panoId] ?? 0.5) - 0.5) * Math.PI * 2;
    const far = up ? 160 : 50; if (camera.far !== far) { camera.far = far; camera.updateProjectionMatrix(); }
    if (up) {   // the platform reflects this scene's own sky
      const env = upEnv[panoId] || (upEnv[panoId] = pmrem.fromEquirectangular(t).texture);
      props[up].traverse((o) => { if (o.isMesh && o.material.isMeshStandardMaterial) { o.material.envMap = env; o.material.envMapIntensity = 1; o.material.envMapRotation.set(0, sky.rotation.y, 0); o.material.needsUpdate = true; } });
    }
    sky.visible = true; panoOn = true; backdrop.visible = false; floor.visible = false; skyFill.visible = false;
  }

  const ruler = new THREE.Group(); scene.add(ruler);
  const holder = new THREE.Group(); scene.add(holder);      // scaled by height
  let extras = new THREE.Group(); holder.add(extras);       // hair, gear, weapon

  // ------------------------------------------------------------ textures / helpers
  const texCache = {};
  function rnd(seed) { let s = seed >>> 0 || 1; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; }
  function canvasTex(key, w, h, draw) {
    if (texCache[key]) return texCache[key];
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    draw(c.getContext("2d"), w, h);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
    return (texCache[key] = t);
  }
  function radialTex() {
    const c = document.createElement("canvas"); c.width = c.height = 128;
    const g = c.getContext("2d"), gr = g.createRadialGradient(64, 64, 4, 64, 64, 64);
    gr.addColorStop(0, "rgba(0,0,0,0.55)"); gr.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  }
  const CAMO = {
    snow: ["#e9ebee", "#c9cdd3", "#9aa0a8", "#ffffff"], desert: ["#d2b48c", "#b8956a", "#8f7350", "#e3cfa6"],
    woodland: ["#5b6b3a", "#3f4a26", "#7d6b46", "#2b2f1c"], urban: ["#1b1c1f", "#2b2d31", "#3a3c41", "#111214"],
    navy: ["#1f2d4d", "#30436b", "#4b5f8a", "#15203a"], pink: ["#f2a7c3", "#e27ca4", "#c95b86", "#f8cfdf"],
    red: ["#141416", "#26272b", "#b3202a", "#1d1e22"]
  };
  function camoTex(id) {
    const p = CAMO[id] || CAMO.snow;
    // tileable woodland-style camo: smooth organic blobs (clusters of overlapping lobes), wrapped at the edges
    return canvasTex("camo2-" + id, 512, 512, (g, w, h) => {
      const r = rnd(id.length * 977 + 13);
      g.fillStyle = p[0]; g.fillRect(0, 0, w, h);
      const blob = (x, y, rr) => {
        const lobes = 3 + Math.floor(r() * 4);
        for (let l = 0; l < lobes; l++) {
          const ox = x + (r() - 0.5) * rr * 1.6, oy = y + (r() - 0.5) * rr * 1.1, rx = rr * (0.45 + r() * 0.5), ry = rx * (0.55 + r() * 0.35), rot = r() * Math.PI;
          for (const dx of [-w, 0, w]) for (const dy of [-h, 0, h]) { g.beginPath(); g.ellipse(ox + dx, oy + dy, rx, ry, rot, 0, Math.PI * 2); g.fill(); }
        }
      };
      const counts = [0, 95, 80, 70];
      for (let layer = 1; layer < p.length; layer++) {
        g.fillStyle = p[layer];
        for (let i = 0; i < (counts[layer] || 60); i++) blob(r() * w, r() * h, 9 + r() * (layer === 3 ? 9 : 15));
      }
    });
  }
  // Tattoo art: AI flash sheets on white (img/baddies/ink/<style>.webp), multiplied onto the skin in the shader.
  const INK_STYLES = ["color", "blackgrey", "japanese", "script", "tribal", "comic", "traditional", "geometric", "floral", "biomech", "chicano", "watercolor", "anime"];
  const inkCache = {};
  let inkWant = "color";
  const inkBlank = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1); inkBlank.needsUpdate = true;
  function inkTex(style) {
    if (INK_STYLES.indexOf(style) < 0) style = "color";
    inkWant = style;
    if (inkCache[style]) return inkCache[style];
    new THREE.TextureLoader().load(new URL("img/baddies/ink/" + style + ".webp?v=1122c", document.baseURI).href, (t) => {
      t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.MirroredRepeatWrapping; t.anisotropy = 8;
      inkCache[style] = t;
      if (inkWant === style && typeof U !== "undefined" && U.uInk) { U.uInk.value = t; if (typeof kick === "function") kick(); }
    });
    return inkBlank;
  }
  const std = (o) => new THREE.MeshStandardMaterial(Object.assign({ roughness: 0.6, metalness: 0 }, o));
  function sphere(r, mat, x, y, z, sx = 1, sy = 1, sz = 1) { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 32, 22), mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); return m; }
  function limb(a, b, r1, r2, mat, caps = true) {
    const g = new THREE.Group(), A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), len = A.distanceTo(B);
    const cyl = new THREE.Mesh(new THREE.CylinderGeometry(r2, r1, len, 24, 1, true), mat);
    cyl.position.copy(A).add(B).multiplyScalar(0.5);
    cyl.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize()); g.add(cyl);
    if (caps) { g.add(sphere(r1, mat, A.x, A.y, A.z)); g.add(sphere(r2, mat, B.x, B.y, B.z)); }
    return g;
  }
  function boxM(w, h, d, mat, x, y, z, rx = 0, ry = 0, rz = 0) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); return m; }

  const SKIN = { porcelain: "#f1d6c4", fair: "#e8c2a3", olive: "#d4a87f", honey: "#c99463", tan: "#bb7f4d", caramel: "#a66d3f",
    bronze: "#8f5a35", chestnut: "#7a4a2b", mocha: "#643a22", espresso: "#4a2a18", ebony: "#33200f" };
  const HAIR = { black: "#0d0c0e", brown: "#3b2416", honey: "#c8955a", platinum: "#ece3cf", burgundy: "#5e1424", copper: "#b5562a", pink: "#ff5fa8", blue: "#9fd8ff", own: "#4a3426" };
  const BOOTS = { white: "#efefea", black: "#18181b", tan: "#b08a5a", sneakers: "#f2f2f2" };
  const EYES = { brown: "#3d2414", hazel: "#6b4f24", green: "#3f7a4a", grey: "#7d8a92", blue: "#3d7cc9" };

  // ------------------------------------------------------------ garment masks (shared by the painted body and the 3D garment shells)
  // Everything is decided per pixel in rest space (vRest) plus smooth bone-region weights (vR1/vR2), so hems,
  // necklines and cuffs are clean lines instead of the old triangle-stepped edges.
  //   vR1 = head, upper arm, forearm, hand      vR2 = thigh, calf, foot, torso (incl. neck)
  const GAR_GLSL = `
    uniform vec4 uTopA, uTopB, uBotA, uGearA, uGearB, uTopCol, uBotCol;
    uniform vec3 uPadCol;
    varying vec4 vR1, vR2;
    float gArm() { return vR1.y + vR1.z + vR1.w; }
    float gLeg() { return vR2.x + vR2.y + vR2.z; }
    // uTopA: hem y, sleeves (0 none, 1 cap, 2 long), neck (0 crew, 1 tank scoop, 2 high collar), open-front half width
    float garTop(vec3 p) {
      if (uTopB.x < 0.5 || vR1.x > 0.5 || gLeg() > 0.5) return 0.0;
      float ax = abs(p.x);
      if (gArm() > 0.5) {
        if (uTopA.y < 0.5) return 0.0;
        if (uTopA.y < 1.5) return step(ax, 0.212);
        return step(vR1.w, 0.42);
      }
      if (p.y < uTopA.x) return 0.0;
      float fr = smoothstep(-0.015, 0.03, p.z);
      float ny;
      if (uTopA.z > 1.5) ny = 1.405 - 0.01 * fr;
      else if (uTopA.z > 0.5) {
        ny = mix(1.33 - 0.03 * (1.0 - smoothstep(0.0, 0.06, ax)), 1.345 - 0.105 * (1.0 - smoothstep(0.02, 0.075, ax)), fr);
        if (ax > uTopB.y + 0.11 * smoothstep(1.285, 1.15, p.y)) return 0.0;               // tank: bare shoulders beside the straps
      } else ny = 1.352 - 0.016 * fr;
      if (p.y > ny) return 0.0;
      if (uTopA.w > 0.0 && p.z > 0.02 && ax < uTopA.w * (0.3 + 0.9 * smoothstep(1.05, 1.34, p.y))) return 0.0;
      return 1.0;
    }
    // uBotA: kind (0 none, 1 bodysuit, 2 shorts / pants), waist y, leg hem y (0 = down to the ankle), front dip
    float garBot(vec3 p) {
      if (uBotA.x < 0.5 || vR1.x > 0.5 || gArm() > 0.5 || vR2.z > 0.5) return 0.0;
      float ax = abs(p.x);
      if (uBotA.x < 1.5) {
        float fr = smoothstep(-0.015, 0.03, p.z);
        float ny = mix(1.322 - 0.035 * (1.0 - smoothstep(0.0, 0.06, ax)), 1.335 - 0.115 * (1.0 - smoothstep(0.02, 0.08, ax)), fr);
        if (p.y > ny || ax > uTopB.y - 0.006 + 0.11 * smoothstep(1.285, 1.15, p.y)) return 0.0;
        float cut = mix(0.752, 0.9, smoothstep(0.028, 0.16, ax));
        return step(cut, p.y) * step(gLeg(), 0.9);
      }
      float w = uBotA.y - uBotA.w * smoothstep(-0.02, 0.07, p.z);
      if (p.y > w) return 0.0;
      if (gLeg() > 0.5 && p.y < uBotA.z) return 0.0;
      return 1.0;
    }
    // uGearA: gloves, knee pads, boot top y   uGearB: knee centre (x, y, z)
    float garBoot(vec3 p) { return max(step(0.5, vR2.z), step(0.5, vR2.y) * step(p.y, uGearA.z)); }
    float garGlove() { return uGearA.x * step(0.5, vR1.w); }
    float garPad(vec3 p) {
      if (uGearA.y < 0.5 || gLeg() < 0.5) return 0.0;
      vec2 d = (vec2(abs(p.x), p.y) - uGearB.xy) / vec2(0.05, 0.066);
      return step(length(d), 1.0) * step(uGearB.z - 0.035, p.z);
    }
  `;
  // ------------------------------------------------------------ body material (painted outfit)
  const U = {
    uSkin: { value: new THREE.Color(SKIN.caramel) }, uBoot: { value: new THREE.Color("#efefea") },
    uDark: { value: new THREE.Color("#3a3f2a") }, uBlack: { value: new THREE.Color("#141416") },
    uCamo: { value: camoTex("snow") }, uInk: { value: inkTex("color") },
    uSkinTex: { value: null }, uHasSkin: { value: 0 },
    // makeup, painted in rest (bind) space so it rides along with expressions
    uEyeL: { value: new THREE.Vector3(0.032, 1.5, 0.08) }, uEyeR: { value: new THREE.Vector3(-0.032, 1.5, 0.08) }, uMouth: { value: new THREE.Vector3(0, 1.44, 0.09) },
    uLip: { value: new THREE.Color("#a5555a") }, uLipAmt: { value: 0.3 }, uLiner: { value: 0 }, uShadowC: { value: new THREE.Color("#5a3a30") }, uShadowAmt: { value: 0 },
    uTopA: { value: new THREE.Vector4(1.085, 2, 2, 0) }, uTopB: { value: new THREE.Vector4(1, 0.096, 0, 0) }, uBotA: { value: new THREE.Vector4(1, 0, 0, 0) },
    uGearA: { value: new THREE.Vector4(0, 0, 0.28, 0) }, uGearB: { value: new THREE.Vector4(0.132, 0.48, 0.07, 0) },
    uTopCol: { value: new THREE.Vector4(1, 1, 1, 0) }, uBotCol: { value: new THREE.Vector4(0.2, 0.2, 0.2, 0) }, uPadCol: { value: new THREE.Color(0x2b2d31) }, uGarOn: { value: 0 }
  };
  const bodyMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.5, metalness: 0, sheen: 0.45, sheenRoughness: 0.55, sheenColor: new THREE.Color(0xffd2b8), clearcoat: 0.06, clearcoatRoughness: 0.45 });
  bodyMat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float aCls;\nattribute float aInk;\nattribute vec4 aR1;\nattribute vec4 aR2;\nvarying vec4 vR1;\nvarying vec4 vR2;\nvarying float vCls;\nvarying float vInk;\nvarying vec2 vUv2;\nvarying vec3 vRest;")
      .replace("#include <uv_vertex>", "#include <uv_vertex>\nvCls = aCls; vInk = aInk; vUv2 = uv; vRest = position; vR1 = aR1; vR2 = aR2;");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform vec3 uSkin, uBoot, uDark, uBlack;\nuniform sampler2D uCamo, uInk, uSkinTex;\nuniform float uHasSkin;\nvarying float vCls;\nvarying float vInk;\nvarying vec2 vUv2;\nvarying vec3 vRest;\nuniform vec3 uEyeL, uEyeR, uMouth, uLip, uShadowC;\nuniform float uLipAmt, uLiner, uShadowAmt, uGarOn;\nfloat garK = 0.0;\n" + GAR_GLSL)
      .replace("#include <color_fragment>", `#include <color_fragment>
        float gB = garBot(vRest), gT = garTop(vRest), gG = garGlove(), gK = garBoot(vRest), gP = garPad(vRest);
        if (uGarOn > 0.5 && max(max(gB, gT), gG) > 0.5) {   // the fitted garment shell is drawn here instead (6 mm in from its edges)
          float e = 0.006, deep = 1.0;
          for (int k = 0; k < 4; k++) {
            vec3 o = k == 0 ? vec3(0.0, e, 0.0) : k == 1 ? vec3(0.0, -e, 0.0) : k == 2 ? vec3(e, 0.0, 0.0) : vec3(-e, 0.0, 0.0);
            vec3 q = vRest + o;
            deep = min(deep, gT > 0.5 ? garTop(q) : gB > 0.5 ? garBot(q) : 1.0);
          }
          if (deep > 0.5) discard;
        }
        vec3 camoC = texture2D(uCamo, vUv2 * 4.5).rgb;
        vec3 col = uSkin;
        if (gB > 0.5) { col = uBotCol.w > 0.5 ? camoC : uBotCol.rgb; garK = 1.0; }
        if (gT > 0.5) { col = uTopCol.w > 0.5 ? camoC : uTopCol.rgb; garK = 1.0; }
        if (gP > 0.5) { col = uPadCol; garK = 3.0; }
        if (gG > 0.5) { col = uBlack; garK = 4.0; }
        if (gK > 0.5) { col = uBoot; garK = 2.0; }
        lkCloth = garK > 0.5 ? 1.0 : 0.0;
        float cls = garK;
        if (garK < 0.5 && uHasSkin > 0.5) { vec3 st = texture2D(uSkinTex, vUv2).rgb; float sl = dot(st, vec3(0.299, 0.587, 0.114)); col = uSkin * clamp(sl / 0.6, 0.55, 1.35); }
        if (cls < 0.5) {
          if (vInk > 0.5) {
            // ink sits under the skin: multiply blend (white paper = untouched skin), a touch of healed fade
            vec3 t = texture2D(uInk, vUv2 * 2.4).rgb;
            t = mix(t, vec3(dot(t, vec3(0.299, 0.587, 0.114))), 0.12);
            t = mix(t, vec3(0.08, 0.10, 0.14), (1.0 - dot(t, vec3(0.333))) * 0.15);
            col *= mix(vec3(1.0), t, 0.9);
          }
          if (vRest.z > uMouth.z - 0.03 && abs(vRest.y - uMouth.y) < 0.09) {
            vec2 dm = (vRest.xy - uMouth.xy) / vec2(0.0235, 0.0105);
            float lip = (1.0 - smoothstep(0.75, 1.05, length(dm))) * step(uMouth.z - 0.016, vRest.z);
            col = mix(col, uLip, lip * uLipAmt);
            for (int e = 0; e < 2; e++) {
              vec3 ec = e == 0 ? uEyeL : uEyeR;
              vec2 de = (vRest.xy - ec.xy) / vec2(0.0175, 0.0105);
              float r = length(de), up = step(0.0, vRest.y - ec.y + 0.002);
              float shadow = (1.0 - smoothstep(1.0, 1.9, r)) * smoothstep(0.85, 1.05, r) * up;
              float wing = (1.0 - smoothstep(0.0, 0.0022, abs((vRest.y - ec.y) - (abs(vRest.x) - abs(ec.x) - 0.011) * 0.55))) * step(abs(ec.x) + 0.011, abs(vRest.x)) * (1.0 - step(abs(ec.x) + 0.021, abs(vRest.x)));
              float liner = max((1.0 - smoothstep(0.0, 0.16, abs(r - 1.0))) * up, wing);
              col = mix(col, uShadowC, shadow * uShadowAmt);
              col = mix(col, vec3(0.03), liner * uLiner * step(uEyeL.z - 0.03, vRest.z));
            }
          }
        }
        diffuseColor.rgb = col;`)
      .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nfloat clsR = garK;\nif (clsR > 0.5) roughnessFactor = clsR < 1.5 ? 0.85 : (clsR < 2.5 ? 0.45 : 0.7);");
  };

  // ------------------------------------------------------------ load model
  let body = null, skel = null, part = null, rest = null, morphIdx = {}, hairCap = null, eyes = null, headInfo = null, eyeInfo = null;
  const M = {};          // asset meshes by name: cl_*, hair_*, brows, lashes, eyes_hp
  const skinned = [];    // every skinned mesh (they all share the body's morph names)
  const B = {};      // bones by name
  const restP = {};   // rest positions (pelvis moves for squats / kneeling)
  let headRestM = null, pelvisRestY = 0.95, lastTy = 0.9;   // head bone at rest (holder space): head add-ons follow the posed head
  const restQ = {};  // rest quaternions
  let pendingState = window.BADDIES_STATE || null;

  new GLTFLoader().load(new URL(MODEL_URL, document.baseURI).href, (gltf) => {
    const root = gltf.scene;
    root.traverse((o) => {
      if (o.isSkinnedMesh) {
        skinned.push(o); o.frustumCulled = false;
        const nm = (o.name + " " + (o.parent ? o.parent.name : "")).toLowerCase();
        const key = (nm.match(/\b(cl_[a-z]+|hair_[a-z]+|brows|lashes|eyes_hp)\b/) || [])[1];
        if (key) M[key] = o;
        else if (/haircap/.test(nm)) hairCap = o; else if (/\beyes\b/.test(nm)) eyes = o; else if (!body) body = o;
      }
      if (o.isBone) { B[o.name] = o; restQ[o.name] = o.quaternion.clone(); restP[o.name] = o.position.clone(); }
    });
    if (!eyes && M.eyes_hp) eyes = M.eyes_hp;
    if (B.head) { holder.updateMatrixWorld(true); headRestM = holder.matrixWorld.clone().invert().multiply(B.head.matrixWorld); }
    if (B.pelvis) pelvisRestY = bonePos("pelvis").y;
    setupAssetMaterials();
    if (eyes) {
      eyes.frustumCulled = false;
      if (eyes !== M.eyes_hp) { eyes.material = new THREE.MeshStandardMaterial({ color: 0xf2efe9, roughness: 0.4 }); eyes.material.envMapIntensity = 0.35; }
      const P = eyes.geometry.attributes.position, L = new THREE.Vector3(), Rr = new THREE.Vector3(); let nl = 0, nr = 0, zmax = -9;
      for (let i = 0; i < P.count; i++) { const x = P.getX(i); if (x > 0) { L.add(new THREE.Vector3(x, P.getY(i), P.getZ(i))); nl++; } else { Rr.add(new THREE.Vector3(x, P.getY(i), P.getZ(i))); nr++; } zmax = Math.max(zmax, P.getZ(i)); }
      L.divideScalar(nl || 1); Rr.divideScalar(nr || 1);
      eyeInfo = { l: L, r: Rr, front: zmax };
      U.uEyeL.value.copy(L); U.uEyeR.value.copy(Rr);
      // mouth: the most forward body point on the centre line ~6 cm under the eyes
      const BP = body.geometry.attributes.position, my = (L.y + Rr.y) / 2 - 0.062; let mz = -9;
      for (let i = 0; i < BP.count; i++) { if (Math.abs(BP.getX(i)) < 0.006 && Math.abs(BP.getY(i) - my) < 0.008) mz = Math.max(mz, BP.getZ(i)); }
      if (mz > -9) U.uMouth.value.set(0, my, mz);
    }
    if (hairCap) {
      hairCap.frustumCulled = false;
      // the MakeHuman hair helper is a hood that also covers the face: cut away the face part
      const g = hairCap.geometry, P = g.attributes.position;
      const eyeY = eyeInfo ? eyeInfo.l.y : null, front = eyeInfo ? eyeInfo.front : null;
      if (eyeInfo && g.index) {
        const src = g.index.array, keep = [];
        for (let t = 0; t < src.length; t += 3) {
          let y = 0, z = 0;
          for (let q = 0; q < 3; q++) { y += P.getY(src[t + q]); z += P.getZ(src[t + q]); }
          y /= 3; z /= 3;
          const face = z > front - 0.045 && y < eyeY + 0.05;     // forehead-down, front of the head
          const low = y < eyeY - 0.06 && z > front - 0.09;       // cheeks / jaw sides
          if (!face && !low) keep.push(src[t], src[t + 1], src[t + 2]);
        }
        g.setIndex(keep);
      }
      // push the shell a little off the scalp so it never sinks into the head
      g.computeVertexNormals();
      const N = g.attributes.normal;
      for (let i = 0; i < P.count; i++) P.setXYZ(i, P.getX(i) + N.getX(i) * 0.0045, P.getY(i) + N.getY(i) * 0.0045, P.getZ(i) + N.getZ(i) * 0.0045);
      P.needsUpdate = true; g.computeVertexNormals();
      g.computeBoundingBox();
      const bb = g.boundingBox;
      headInfo = eyeInfo ? { c: new THREE.Vector3(0, eyeInfo.l.y + 0.012, eyeInfo.front - 0.085), r: 0.092, top: bb.max.y }
                         : { c: bb.getCenter(new THREE.Vector3()), r: 0.092, top: bb.max.y };
    }
    // reshape two stock hair meshes to match the menu pictures:
    //   ponytail01 hangs low from the nape -> drop the tail (a high pony is built from the crown in buildExtras)
    //   bob01 has a fringe over one eye -> trim it to a clean middle-part bob
    if (eyeInfo) {
      const cut = (o, drop) => { if (!o || !o.geometry.index) return; const g = o.geometry, P = g.attributes.position, src = g.index.array, keep = [];
        for (let t = 0; t < src.length; t += 3) { let x = 0, y = 0, z = 0; for (let q = 0; q < 3; q++) { x += P.getX(src[t + q]); y += P.getY(src[t + q]); z += P.getZ(src[t + q]); }
          if (!drop(x / 3, y / 3, z / 3)) keep.push(src[t], src[t + 1], src[t + 2]); }
        g.setIndex(keep); };
      const ey = eyeInfo.l.y, ef = eyeInfo.front;
      // the stock tail hangs off the back of the skull: drop whatever stands clear of the scalp (keeps the nape hairline)
      const hc = new THREE.Vector3(0, ey + 0.012, ef - 0.085);
      cut(M.hair_pony, (x, y, z) => z < hc.z - 0.02 && y < ey + 0.05 && Math.hypot(x, (y - hc.y) * 0.92, z - hc.z) > 0.112);
      cut(M.hair_bob, (x, y, z) => z > ef - 0.035 && y < ey + 0.04 && Math.abs(x) < 0.07);
    }
    if (!body) return fail("No body in the model");
    if (body.material && body.material.map) { U.uSkinTex.value = body.material.map; U.uHasSkin.value = 1; }
    body.material = bodyMat;
    body.frustumCulled = false;
    skel = body.skeleton;
    try { setupFaceFrame(); } catch (e) { faceIdx = null; }
    morphIdx = body.morphTargetDictionary || {};
    classifyVertices();
    holder.add(root);
    box.classList.add("is-ready");
    if (pendingState) build(pendingState);
  }, undefined, (err) => fail("Couldn't load the 3D body"));

  function fail(msg) { const l = canvasWrap.querySelector(".bd-preview-load"); if (l) l.textContent = msg; }

  // Per-vertex body part from the dominant bone weight.
  function classifyVertices() {
    const g = body.geometry, J = g.attributes.skinIndex, W = g.attributes.skinWeight, P = g.attributes.position, n = P.count;
    const names = skel.bones.map((b) => b.name);
    part = new Uint8Array(n); rest = P;
    const code = (nm) => {
      if (/^(head|neck)/.test(nm)) return 1;            // head/neck
      if (/^spine_03|clavicle/.test(nm)) return 2;       // chest
      if (/^spine_02/.test(nm)) return 3;                // upper belly
      if (/^spine_01/.test(nm)) return 4;                // waist
      if (/^pelvis|Root/.test(nm)) return 5;             // hips/glutes
      if (/^thigh/.test(nm)) return 6;
      if (/^calf/.test(nm)) return 7;
      if (/^(foot|ball)/.test(nm)) return 8;
      if (/^upperarm/.test(nm)) return 9;
      if (/^lowerarm/.test(nm)) return 10;
      return 11;                                         // hands / fingers
    };
    for (let i = 0; i < n; i++) {
      let best = 0, bw = -1;
      for (let k = 0; k < 4; k++) { const w = W.getComponent(i, k); if (w > bw) { bw = w; best = J.getComponent(i, k); } }
      part[i] = code(names[best] || "");
    }
    g.setAttribute("aCls", new THREE.BufferAttribute(new Float32Array(n), 1));
    g.setAttribute("aInk", new THREE.BufferAttribute(new Float32Array(n), 1));
    // smooth region weights for the garment masks: (head, upper arm, forearm, hand), (thigh, calf, foot, torso)
    const r1 = new Float32Array(n * 4), r2 = new Float32Array(n * 4);
    const cat = names.map((nm) => /^head|^FACIAL|eye|jaw|tongue|teeth/i.test(nm) ? 0 : /^upperarm/.test(nm) ? 1 : /^lowerarm/.test(nm) ? 2 : /^(hand|thumb|index|middle|ring|pinky)/.test(nm) ? 3
      : /^thigh/.test(nm) ? 4 : /^calf/.test(nm) ? 5 : /^(foot|ball)/.test(nm) ? 6 : 7);
    for (let i = 0; i < n; i++) for (let k = 0; k < 4; k++) {
      const w = W.getComponent(i, k); if (!w) continue; const c = cat[J.getComponent(i, k)];
      if (c < 4) r1[i * 4 + c] += w; else r2[i * 4 + c - 4] += w;
    }
    g.setAttribute("aR1", new THREE.BufferAttribute(r1, 4)); g.setAttribute("aR2", new THREE.BufferAttribute(r2, 4));
    try { garPrep(); } catch (e) { console.warn("garments", e); G = null; }
  }

  // Materials for the real asset meshes: hair, brows and lashes are alpha cards tinted by colour;
  // shoes keep their texture detail but take the chosen colour; bottoms use the camo pattern.
  // GLSL: push a hair vertex (holder rest space) out of the hood rolled round her neck, so hair lies over it
  const HOOD_GLSL = `uniform vec4 uHood; uniform vec2 uHoodE;
    vec3 hoodOut(vec3 t, float py) {
      if (uHood.w < 0.5 || t.z > uHood.x + 0.03) return t;
      vec2 d = vec2(t.x, t.z - uHood.x);
      float e = length(d / uHoodE), back = clamp(-d.y / max(length(d), 0.001), 0.0, 1.0);
      float r = uHood.z * sqrt(back) + 0.03, tgt = 1.0 + r / (0.5 * (uHoodE.x + uHoodE.y));
      float f = smoothstep(uHood.y + r + 0.06, uHood.y + r * 0.3, py) * smoothstep(uHood.y - 0.26, uHood.y - r, py);
      if (e > 0.2 && e < tgt) { d *= mix(1.0, tgt / e, f); t.x = d.x; t.z = d.y + uHood.x; }
      return t;
    }`;
  function hoodOutJS(p, extra) {
    const u = HAIRU.uHood.value, E = HAIRU.uHoodE.value; if (u.w < 0.5 || p.z > u.x + 0.03) return p;
    let dx = p.x, dz = p.z - u.x; const L = Math.hypot(dx, dz), e = Math.hypot(dx / E.x, dz / E.y), back = Math.min(1, Math.max(0, -dz / Math.max(L, 0.001)));
    const r = u.z * Math.sqrt(back) + 0.03, tgt = 1 + (r + extra) / (0.5 * (E.x + E.y));
    const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
    const f = ss(u.y + r + 0.06, u.y + r * 0.3, p.y) * ss(u.y - 0.26, u.y - r, p.y);
    if (e > 0.2 && e < tgt && f > 0) { const k = 1 + (tgt / e - 1) * f; return new THREE.Vector3(dx * k, p.y, dz * k + u.x); }
    return p;
  }
  const hairOrg = { value: new THREE.Vector3() };   // the head group's rest position (strand hair is built relative to it)
  function strandHood(mat) {   // loose strands (knotless braids, locs, curls) get the same hood push
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uHood = HAIRU.uHood; sh.uniforms.uHoodE = HAIRU.uHoodE; sh.uniforms.uOrg = hairOrg;
      sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nuniform vec3 uOrg;\n" + HOOD_GLSL)
        .replace("#include <begin_vertex>", "#include <begin_vertex>\n transformed = hoodOut(transformed + uOrg, position.y + uOrg.y) - uOrg;");
    };
    mat.customProgramCacheKey = () => "strandHood";
    return mat;
  }
  const HAIRU = { uPlate: { value: new THREE.Vector4(0, 0, 0, 0) }, uPlateS: { value: 0 }, uEarL: { value: new THREE.Vector4(0, 0, 0, 0) }, uEarR: { value: new THREE.Vector4(0, 0, 0, 0) }, uHood: { value: new THREE.Vector4(0, 0, 0, 0) }, uHoodE: { value: new THREE.Vector2(0.1, 0.1) }, uHangM: { value: new THREE.Matrix4() }, uHangOn: { value: 0 }, uHangY: { value: 1.42 } };
  function tintMat(src, gain, base, amt, opts = {}) {
    const m = new THREE.MeshStandardMaterial({ map: src && src.map, roughness: opts.roughness ?? 0.5, metalness: 0,
      alphaTest: opts.alpha ? 0.35 : 0, transparent: false, side: opts.alpha ? THREE.DoubleSide : THREE.FrontSide });
    m.userData.uTint = { value: new THREE.Color(1, 1, 1) };
    m.userData.uWave = { value: 0 }; m.userData.uHoodK = { value: 1 };
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uTint = m.userData.uTint; sh.uniforms.uWave = m.userData.uWave; sh.uniforms.uHoodK = m.userData.uHoodK; Object.assign(sh.uniforms, HAIRU);
      // body-wave: ripple long hair below the ears (rest-space y; eyes sit at ~1.5 m)
      sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nuniform float uWave; uniform vec4 uPlate; uniform float uPlateS; uniform vec4 uEarL; uniform vec4 uEarR; uniform mat4 uHangM; uniform float uHangOn; uniform float uHangY; uniform float uHoodK;\n" + HOOD_GLSL)
        .replace("#include <begin_vertex>", `#include <begin_vertex>
          // the whole sheet moves together (offsets depend on height, plus a smooth outward swell), so the hair
          // cards never tear apart into steps and the inner layer never pokes through the outer one
          float wv = smoothstep(1.47, 1.36, position.y) * uWave * (1.0 + clamp((1.36 - position.y) * 2.0, 0.0, 0.4));
          vec2 rad = position.xz - vec2(0.0, -0.02); rad = rad / max(length(rad), 0.02);
          float ph = sin(position.y * 40.0);
          transformed.xz += rad * wv * (0.014 + 0.005 * ph);
          transformed.x += wv * clamp(position.x, -0.11, 0.11) * (0.04 + 0.03 * sin(position.y * 40.0));   // wavy outline on both sides
          transformed.z += wv * sin(position.y * 40.0 + 1.4) * 0.014;
          vec3 restT = transformed;   // (before the plate / hood pushes: hung hair is clear of both)
          if (uPlate.w > 0.5 && position.z < -0.02 && abs(position.x) < 0.17) {   // lie over the back plate, not between it and her back
            float zo = uPlate.x + uPlateS * (position.y - 1.17);
            float f = smoothstep(uPlate.y + 0.07, uPlate.y - 0.005, position.y) * smoothstep(uPlate.z - 0.1, uPlate.z, position.y);
            transformed.z = mix(transformed.z, min(transformed.z, zo), f);
          }
          transformed = mix(transformed, hoodOut(transformed, position.y), uHoodK);
          for (int k = 0; k < 2; k++) {   // tucked behind the ears so the earrings show
            vec4 e = k == 0 ? uEarL : uEarR;
            if (e.w > 0.5 && position.x * e.x > 0.0 && position.z > e.z - 0.05) {
              float wy = smoothstep(e.y + 0.07, e.y + 0.035, position.y) * smoothstep(e.y - 0.16, e.y - 0.09, position.y);
              float wx = smoothstep(abs(e.x) - 0.04, abs(e.x) - 0.012, abs(position.x));
              float w = wy * wx;
              transformed.z = mix(transformed.z, min(transformed.z, e.z - 0.038), w);
              transformed.x += sign(e.x) * 0.01 * w;
            }
          }`);
      sh.vertexShader = sh.vertexShader.replace("#include <skinning_vertex>", `#include <skinning_vertex>
          if (uHangOn > 0.0) {   // bent over (All fours): hair below the nape hangs from the head toward the floor instead of lying along her back
            float hw = uHangOn * smoothstep(uHangY, uHangY - 0.1, position.y);
            transformed = mix(transformed, (uHangM * vec4(restT, 1.0)).xyz, hw);
          }`);
      sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nuniform vec3 uTint;")
        .replace("#include <map_fragment>", `#include <map_fragment>
          float lum = clamp(dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114)) * ${gain.toFixed(2)}, 0.0, 1.0);
          diffuseColor.rgb = uTint * (${base.toFixed(2)} + ${amt.toFixed(2)} * lum);`);
    };
    return m;
  }
  function setupAssetMaterials() {
    for (const k in M) {
      const o = M[k], src = o.material;
      if (/^hair_/.test(k)) { o.material = tintMat(src, 1.6, 0.35, 1.0, { alpha: true, roughness: 0.42 }); if (k !== "hair_long") o.material.userData.uHoodK.value = 0; }   // short styles end above the hood: pushing them flared the ends
      else if (k === "brows") o.material = tintMat(src, 1.2, 0.4, 0.8, { alpha: true });
      else if (k === "lashes") { o.material = tintMat(src, 1.0, 0.0, 0.25, { alpha: true }); o.material.userData.uTint.value.set(0x111111); }
      else if (k === "cl_boots") o.material = tintMat(src, 3.2, 0.5, 0.6, { roughness: 0.4 });
      else if (k === "cl_sneakers") o.material = new THREE.MeshStandardMaterial({ map: src.map, roughness: 0.6 });
      else if (/^cl_/.test(k)) o.material = new THREE.MeshStandardMaterial({ map: camoTex("snow"), roughness: 0.85, side: THREE.DoubleSide });
      else if (k === "eyes_hp") { o.material = new THREE.MeshStandardMaterial({ color: 0xece8e2, roughness: 0.4 }); o.material.envMapIntensity = 0.35; }
      if (o.material.map) o.material.map.colorSpace = THREE.SRGBColorSpace;
      if (/^hair_|brows|lashes|eyes_hp/.test(k)) o.material.userData.outlineParameters = { visible: false };
      if (/^cl_/.test(k)) o.material.userData.cloth = true;
    }
  }
  const eyeTexCache = {};
  let eyeTexName = "";
  function setEyeTex(name) {
    const f = EYE_TEX[name] || "brown";
    if (f === eyeTexName) return; eyeTexName = f;
    const apply = (t) => { eyes.material.map = t; eyes.material.emissiveMap = t; eyes.material.needsUpdate = true; };
    if (eyeTexCache[f]) return apply(eyeTexCache[f]);
    new THREE.TextureLoader().load(new URL("models/eyes/" + f + ".webp", document.baseURI).href, (t) => { t.colorSpace = THREE.SRGBColorSpace; t.flipY = false; eyeTexCache[f] = t; if (eyeTexName === f) apply(t); });
  }

  // ------------------------------------------------------------ apply settings
  const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
  function build(s) {
    pendingState = s;
    if (!body) return;
    const P = s.pick || {}, one = (k) => (P[k] || [])[0];
    // the night-vision helmet replaces a cap or beanie (both were drawn, one through the other)
    const has = (k, v) => (k === "gear" && (v === "cap" || v === "beanie") && one("eyewear") === "nvg") ? false : (P[k] || []).indexOf(v) >= 0;
    const exag = (s.exag == null ? 80 : s.exag) / 100;
    const k = 0.55 + exag * 1.45;                        // how far the "up" morphs go
    const sh = s.shape || {};
    const e = (key, def = 5) => ((sh[key] == null ? def : sh[key]) - 5) / 5;   // -1 … 1
    const set = (name, val) => {
      const v = Math.max(0, Math.min(2.4, val));
      for (const m of skinned) { const d = m.morphTargetDictionary; if (d && d[name] != null) m.morphTargetInfluences[d[name]] = v; }
    };
    const pair = (up, dn, x, boost = k) => { set(up, x > 0 ? x * boost : 0); set(dn, x < 0 ? -x : 0); };
    const male = s.gender === "male";
    curGear = { vest: has("gear", "vest"), chest: has("gear", "chest"), puffer: one("top") === "puffer" };
    if (male) {   // the preview body is female: flatten it toward a male build (flat chest, straight hips, more muscle)
      pair("hips_up", "hips_dn", e("hips") * 0.45 - 0.6, 1);
      pair("glutes_up", "glutes_dn", e("glutes") * 0.7 - 0.3, 1);
      pair("waist_in", "waist_out", e("waist") * 0.9 - 0.35, 1);       // low = thick belly, high = V-taper
      pair("thighs_up", "thighs_dn", e("thighs") * 1.1, 1.1);           // skinny legs … very thick legs
      set("bust_up", 0); set("bust_dn", 1.7);
      pair("tone_up", "tone_dn", e("tone", 3) * 1.4 + 0.3, 1.4);         // soft … shredded
    } else {
      pair("hips_up", "hips_dn", e("hips"));
      pair("glutes_up", "glutes_dn", e("glutes"), k * 1.15);
      pair("waist_in", "waist_out", e("waist"), Math.min(1.6, k));
      pair("thighs_up", "thighs_dn", e("thighs"));
      pair("bust_up", "bust_dn", e("bust"), 1);
      pair("tone_up", "tone_dn", e("tone", 3), 1);
    }
    // facial expression (shape keys on the body, brows and lashes)
    const EXPRS = ["confident", "smirk", "fierce", "smile", "pout", "surprised", "sultry", "wink"], ex = one("expr") || "confident";
    const EXW = { confident: 1.5, smile: 1.5, smirk: 1.2, sultry: 1.4, pout: 0.65 };
    // newer expressions are mixes of the face's shape keys (+ a tongue for the tongue-out ones)
    const EXMIX = { tongue: { surprised: 0.75, smile: 0.9 }, tonguewink: { wink: 1, surprised: 0.6 }, laugh: { smile: 1.8, surprised: 0.65 }, angry: { fierce: 2.0 },
      kiss: { pout: 1.05 }, bite: { smirk: 1.0, pout: 0.2 }, stern: { fierce: 0.8 }, shout: { surprised: 1.25, fierce: 1.1 } };
    for (const x of EXPRS) set("ex_" + x, EXMIX[ex] ? (EXMIX[ex][x] || 0) : x === ex ? (EXW[x] || 1) : 0);

    // ---- paint the outfit
    U.uSkin.value.set(SKIN[s.skin] || SKIN.caramel);
    U.uCamo.value = camoTex(one("camo") || "snow");
    U.uBoot.value.set(BOOTS[one("boots")] || BOOTS.white);
    U.uInk.value = inkTex(one("inkstyle") || "color");
    const MK = { natural: ["#a8625c", 0.3, 0, "#5a3a30", 0], glam: ["#b8475a", 0.72, 0.55, "#6b4636", 0.38], bold: ["#3a0b16", 0.92, 1.0, "#2a1414", 0.5] }[one("makeup") || "glam"] || [0, 0, 0, 0, 0];
    if (s.gender === "male") { U.uLipAmt.value = 0.08; U.uLiner.value = 0; U.uShadowAmt.value = 0; }
    else if (MK[0]) { U.uLip.value.set(MK[0]); U.uLipAmt.value = MK[1]; U.uLiner.value = MK[2]; U.uShadowC.value.set(MK[3]); U.uShadowAmt.value = MK[4]; }
    curBg = s.bg || "white"; applyBg();
    const top = one("top") || "puffer", bottom = one("bottom") || "bodysuit", tat = one("tattoos") || "none";
    const sleeves = top === "puffer" || top === "jacket" || top === "hoodie";
    const vest = has("gear", "vest"), gloves = has("gear", "gloves"), pads = has("gear", "pads");
    const sneakers = one("boots") === "sneakers";
    const legInk = tat === "legs" || tat === "full" || tat === "accents", armInk = tat === "arms" || tat === "full" || tat === "accents";
    const cls = body.geometry.attributes.aCls.array, ink = body.geometry.attributes.aInk.array;
    // heights on the rest mesh (model is 1.60 m)
    const bootTop = M.cl_boots ? (sneakers || bottom === "leggings" || bottom === "pants" ? 0 : 0.28) : (sneakers ? 0.13 : 0.3), shortsLow = bottom === "cargo" ? 0.62 : 0.68, kneeY = 0.46;
    for (let i = 0; i < part.length; i++) {   // garments are masked per pixel now (garTop / garBot); here only where ink may show
      const p = part[i];
      cls[i] = 0; ink[i] = (p === 6 || p === 7) ? (legInk ? 1 : 0) : (p === 9 || p === 10) ? (armInk ? 1 : 0) : 0;
    }
    body.geometry.attributes.aCls.needsUpdate = true; body.geometry.attributes.aInk.needsUpdate = true;

    // ---- pose the arms for the weapon hold
    const PZ = s.pose || { preset: "hold" }, preset = PZ.preset || "hold";
    const handsBusy = preset !== "hold" && preset !== "kneel" && preset !== "custom";
    const w = s.weapon || "none", armed = w !== "none", pistol = w === "glock" || w === "deagle";
    const hold = armed && handsBusy ? "sling" : (preset === "custom" ? "free" : (s.hold || "low"));
    curHold = armed ? hold : "none"; curPistol = armed && pistol; holsterM = null;
    for (const n in restQ) B[n].quaternion.copy(restQ[n]);
    if (B.pelvis && restP.pelvis) B.pelvis.position.copy(restP.pelvis);
    const LK = PZ.look || {}, DEG = Math.PI / 180;
    holder.rotation.y = (LK.turn || 0) * DEG;              // whole body turn (180 = back to the camera)
    holder.updateMatrixWorld(true);
    const feet0 = { l: bonePos("foot_l"), r: bonePos("foot_r") }, footQ0 = { l: worldQ("foot_l"), r: worldQ("foot_r") };
    const PR = POSE_PRESETS[preset] || {};
    const cust = preset === "custom" ? PZ.custom : null;
    const seatType = PZ.seat && PZ.seat !== "none" && (preset === "custom" || preset === "sit") ? PZ.seat : (PR.seat || null);
    curSeat = seatType && SEATS[seatType] != null ? { type: seatType, h: SEATS[seatType] } : null;
    const pdy = curSeat ? (curSeat.h + 0.1 - pelvisRestY) : (cust ? (cust.pdy || 0) : (PR.pdy || 0));
    if (pdy || PR.pdx) movePelvis(v3(PR.pdx || 0, pdy, PR.pdz || 0));
    if (PR.pitch) {   // bend forward at the hips (all fours): the pelvis tips, the spine takes the rest, the head lifts to look ahead
      const ax = v3(1, 0, 0), a = PR.pitch * DEG;
      rotBone("pelvis", ax, a * (PR.pelvisK ?? 0.55)); const sk = (1 - (PR.pelvisK ?? 0.55)) / 3;
      rotBone("spine_01", ax, a * sk); rotBone("spine_02", ax, a * sk); rotBone("spine_03", ax, a * sk);
      if (PR.headUp) { rotBone("neck_01", ax, -PR.headUp * DEG * 0.45); rotBone("head", ax, -PR.headUp * DEG * 0.55); }
    }
    if (PR.yaw) { yawBone("spine_01", PR.yaw * 0.25); yawBone("spine_02", PR.yaw * 0.35); yawBone("spine_03", PR.yaw * 0.4); }
    if (PR.head) { yawBone("neck_01", PR.head * 0.5); yawBone("head", PR.head * 0.5); }
    // torso twist and head turn / nod / tilt from the sliders (on top of any preset)
    const tw = (LK.twist || 0) * DEG, hy = (LK.head || 0) * DEG;
    if (LK.lean) { const a = (LK.lean) * DEG, ax = v3(1, 0, 0); rotBone("spine_01", ax, a * 0.3); rotBone("spine_02", ax, a * 0.35); rotBone("spine_03", ax, a * 0.35); }
    if (tw) { yawBone("spine_01", tw * 0.25); yawBone("spine_02", tw * 0.35); yawBone("spine_03", tw * 0.4); }
    if (hy) { yawBone("neck_01", hy * 0.45); yawBone("head", hy * 0.55); }
    const faceYaw = tw + hy + (PR.yaw || 0) + (PR.head || 0);
    if (LK.nod) { const ax = v3(Math.cos(faceYaw), 0, -Math.sin(faceYaw)), a = -(LK.nod) * DEG; rotBone("neck_01", ax, a * 0.4); rotBone("head", ax, a * 0.6); }
    if (LK.tilt) rotBone("head", v3(Math.sin(faceYaw), 0, Math.cos(faceYaw)), -(LK.tilt) * DEG);
    const POSES = {
      rest:     { ua_l: v3(0.16, -1, 0.02), la_l: v3(0.06, -1, 0.12), ua_r: v3(-0.16, -1, 0.02), la_r: v3(-0.06, -1, 0.12) },
      low:      { ua_l: v3(0.3, -0.8, 0.5), la_l: v3(-0.55, 0.12, 0.85), ua_r: v3(-0.35, -0.92, 0.15), la_r: v3(0.12, -0.2, 1) },
      shoulder: { ua_l: v3(0.2, -0.4, 0.9), la_l: v3(-0.3, 0.2, 1), ua_r: v3(-0.65, -0.6, 0.45), la_r: v3(0.5, 0.3, 0.8) },
      side:     { ua_l: v3(0.16, -1, 0.02), la_l: v3(0.06, -1, 0.12), ua_r: v3(-0.2, -1, 0.06), la_r: v3(-0.1, -1, 0.35) }
    };
    const pose = !armed || hold === "sling" ? POSES.rest : (POSES[hold] || POSES.low);
    const hScale = ((s.height || 60) * IN) / BASE_H;
    if (armed && (hold === "shoulder" || hold === "low") && !pistol) {   // blade the torso so the support hand reaches the handguard
      const tw = hold === "shoulder" ? -0.42 : -0.3;
      yawBone("spine_01", tw * 0.25); yawBone("spine_02", tw * 0.35); yawBone("spine_03", tw * 0.4);
      yawBone("neck_01", -tw * 0.5); yawBone("head", -tw * 0.4);
    }
    curRig = armed && (hold === "shoulder" || hold === "low" || (pistol && hold !== "side" && hold !== "sling")) ? gunRig(w, hold, pistol, hScale) : null;
    curGunK = 1 / hScale;
    if (curRig) { ik("r", curRig.hr); ik("l", curRig.hl); }
    else {
      aim("upperarm_l", "lowerarm_l", pose.ua_l); aim("lowerarm_l", "hand_l", pose.la_l);
      aim("upperarm_r", "lowerarm_r", pose.ua_r); aim("lowerarm_r", "hand_r", pose.la_r);
    }
    // ---- pose presets and custom (dragged) hands and feet
    if (cust) { if (cust.hr) ik("r", v3(...cust.hr)); if (cust.hl) ik("l", v3(...cust.hl)); }
    else if (PR.hr && !curRig) { ik("r", fitHand(v3(...PR.hr)), PR.elbow); if (PR.hl) ik("l", fitHand(v3(...PR.hl)), PR.elbow); }
    const fT = {
      l: cust && cust.fl ? v3(...cust.fl) : feet0.l.clone().add(v3(...(PR.fl || [0, 0, 0]))),
      r: cust && cust.fr ? v3(...cust.fr) : feet0.r.clone().add(v3(...(PR.fr || [0, 0, 0])))
    };
    if (!cust && curSeat && curSeat.type === "stool") { fT.l.y = fT.r.y = 0.26; fT.l.z = fT.r.z = feet0.l.z + 0.2; }   // feet on the footrest
    if (pdy || PR.pdx || PR.fl || PR.fr || cust) {
      ikLeg("l", fT.l, PR.knee); ikLeg("r", fT.r, PR.knee);
      setWorldQ("foot_l", footQ0.l); setWorldQ("foot_r", footQ0.r);
      if (PR.kneelR) { const fb = B.foot_r; if (fb) fb.rotateX(0.9); }
      if (PR.footPitch) for (const fb of [B.foot_l, B.foot_r]) if (fb) fb.rotateX(PR.footPitch);
    }
    lastTargets = { hr: bonePos("hand_r").toArray(), hl: bonePos("hand_l").toArray(), fl: bonePos("foot_l").toArray(), fr: bonePos("foot_r").toArray(), pdy: pdy };
    // relax the fingers a little
    for (const n in B) if (/^(index|middle|ring|pinky)_0[123]/.test(n)) B[n].rotateZ(armed ? 0.5 : 0.2);

    // ---- height
    const hIn = s.height || 60, scale = (hIn * IN) / BASE_H;
    holder.scale.setScalar(scale);
    holder.updateMatrixWorld(true);
    const ty = 0.5 * hIn * IN + 0.05; lastTy = ty;
    if (bgOn) { /* backdrop on: camera stays fixed so the height change shows against the scenery */ }
    else if (lastH && lastH !== hIn) {   // keep her in frame from 3 ft to 7 ft: move the camera with her height
      const off = camera.position.clone().sub(controls.target).multiplyScalar(Math.max(hIn, 42) / Math.max(lastH, 42));
      controls.target.y = ty; camera.position.copy(controls.target).add(off); controls.update();
    } else if (!bgOn) controls.target.y = ty;
    lastH = hIn;

    buildExtras(s, one, has, armed, pistol, w, hold);
    drawRuler(hIn);
    placeHandles(preset === "custom");
    if (!drag) { try { window.dispatchEvent(new Event("baddies:posed")); } catch (_) {} }
    applyLook(s.style || "game");
    paintLookStrip(s.style || "game");
  }

  // Rotate a bone so the direction to its child points along dir (body space).
  function aim(boneName, childName, dir) {
    const b = B[boneName], c = B[childName]; if (!b || !c) return;
    holder.updateMatrixWorld(true);
    const bp = new THREE.Vector3(), cp = new THREE.Vector3();
    b.getWorldPosition(bp); c.getWorldPosition(cp);
    const cur = cp.sub(bp).normalize();
    const want = dir.clone().normalize().transformDirection(holder.matrixWorld).normalize();
    const delta = new THREE.Quaternion().setFromUnitVectors(cur, want);
    const bw = new THREE.Quaternion(); b.getWorldQuaternion(bw);
    const pw = new THREE.Quaternion(); b.parent.getWorldQuaternion(pw);
    b.quaternion.copy(pw.invert().multiply(delta).multiply(bw));
    b.updateMatrixWorld(true);
  }
  // A bone's position in holder (unscaled body) space.
  // Face frame from three skinned body vertices (nose tip, left ear, right ear). The face skin is weighted partly
  // to the neck and spine, so this follows the head as drawn better than the head bone does.
  let faceIdx = null, faceRestF = null;
  function skinnedPt(i) {
    const t = new THREE.Vector3(); body.getVertexPosition(i, t); t.applyMatrix4(body.matrixWorld); holder.worldToLocal(t); return t;
  }
  function faceFrame() {
    if (!faceIdx || !body) return null;
    holder.updateMatrixWorld(true); if (body.skeleton) body.skeleton.update();
    const n = skinnedPt(faceIdx[0]), l = skinnedPt(faceIdx[1]), r = skinnedPt(faceIdx[2]);
    const o = l.clone().add(r).multiplyScalar(0.5), x = l.clone().sub(r).normalize();
    const z0 = n.clone().sub(o).normalize(), y = new THREE.Vector3().crossVectors(z0, x).normalize(), z = new THREE.Vector3().crossVectors(x, y);
    return new THREE.Matrix4().makeBasis(x, y, z).setPosition(o);
  }
  // per eye: the rest-pose cornea apex vertex and a ring of vertices around the eyeball centre
  let eyeApex = null;
  function pinIrises(G) {
    if (!eyes || !eyes.isSkinnedMesh || !eyeInfo) return false;
    if (!eyeApex) {
      const P = eyes.geometry.attributes.position, ap = [-1, -1], az = [-9, -9], ring = [[], []];
      for (let i = 0; i < P.count; i++) { const sd = P.getX(i) > 0 ? 0 : 1; if (P.getZ(i) > az[sd]) { az[sd] = P.getZ(i); ap[sd] = i; } if (i % 9 === 0) ring[sd].push(i); }
      if (ap[0] < 0 || ap[1] < 0) return false;
      eyeApex = { ap, ring };
    }
    holder.updateMatrixWorld(true); if (eyes.skeleton) eyes.skeleton.update();
    const pt = (i) => { const t = new THREE.Vector3(); eyes.getVertexPosition(i, t); t.applyMatrix4(eyes.matrixWorld); return holder.worldToLocal(t); };
    const fr = [], ce = [];
    for (let sd = 0; sd < 2; sd++) {
      fr.push(pt(eyeApex.ap[sd]));
      const c = new THREE.Vector3(); eyeApex.ring[sd].forEach((i) => c.add(pt(i))); ce.push(c.divideScalar(eyeApex.ring[sd].length));
    }
    G.position.set(0, 0, 0); G.quaternion.identity(); G.scale.set(1, 1, 1);
    const up0 = new THREE.Vector3(0, 1, 0), z0 = new THREE.Vector3(0, 0, 1);
    G.children.forEach((m) => {
      const d = m.userData; if (!d || d.side == null) return;
      const dir = fr[d.side].clone().sub(ce[d.side]).normalize();
      const q = new THREE.Quaternion().setFromUnitVectors(z0, dir);
      const side = new THREE.Vector3(1, 0, 0).applyQuaternion(q), up = up0.clone().applyQuaternion(q);
      m.position.copy(fr[d.side]).addScaledVector(dir, d.lift - 0.0004).addScaledVector(side, d.ex || 0).addScaledVector(up, d.ey || 0);
      m.quaternion.copy(q);
    });
    return true;
  }
  // Rigid head frame from the two eyeballs (they ride the skull exactly): origin between the eye centres.
  let eyeRestF = null, eyeRing = null, faceFit = null;
  function eyeFrame() {
    if (!eyes || !eyes.isSkinnedMesh) return null;
    if (!eyeRing) {
      const P = eyes.geometry.attributes.position, ap = [-1, -1], az = [-9, -9], ring = [[], []];
      for (let i = 0; i < P.count; i++) { const sd = P.getX(i) > 0 ? 0 : 1; if (P.getZ(i) > az[sd]) { az[sd] = P.getZ(i); ap[sd] = i; } if (i % 7 === 0) ring[sd].push(i); }
      if (ap[0] < 0 || ap[1] < 0) return null;
      eyeRing = { ap, ring };
    }
    holder.updateMatrixWorld(true); if (eyes.skeleton) eyes.skeleton.update();
    const pt = (i) => { const t = new THREE.Vector3(); eyes.getVertexPosition(i, t); t.applyMatrix4(eyes.matrixWorld); return holder.worldToLocal(t); };
    const ce = [0, 1].map((sd) => { const c = new THREE.Vector3(); eyeRing.ring[sd].forEach((i) => c.add(pt(i))); return c.divideScalar(eyeRing.ring[sd].length); });
    const fw = [0, 1].map((sd) => pt(eyeRing.ap[sd]).sub(ce[sd])).reduce((a, b) => a.add(b)).normalize();
    const x = ce[0].clone().sub(ce[1]).normalize(), y = new THREE.Vector3().crossVectors(fw, x).normalize(), z = new THREE.Vector3().crossVectors(x, y);
    return new THREE.Matrix4().makeBasis(x, y, z).setPosition(ce[0].clone().add(ce[1]).multiplyScalar(0.5));
  }
  function setupFaceFrame() {
    eyeRestF = eyeFrame();
    if (!eyeInfo || !body) return;
    const P = body.geometry.attributes.position, ey = (eyeInfo.l.y + eyeInfo.r.y) / 2, cz = headInfo ? headInfo.c.z : eyeInfo.front - 0.085;
    let nose = -1, nz = -9, el = -1, ex = -9, er = -1, exr = 9;
    for (let i = 0; i < P.count; i++) {
      const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
      if (Math.abs(x) < 0.004 && y > ey - 0.05 && y < ey - 0.01 && z > nz) { nz = z; nose = i; }
      if (y > ey - 0.03 && y < ey + 0.01 && z > cz - 0.035 && z < cz + 0.025) { if (x > ex) { ex = x; el = i; } if (x < exr) { exr = x; er = i; } }
    }
    if (nose < 0 || el < 0 || er < 0) return;
    faceIdx = [nose, el, er];
    // glasses fit: nose-bridge depth between the eyes and where each ear meets the head
    let bz = -9; for (let i = 0; i < P.count; i++) { const x = P.getX(i), y = P.getY(i); if (Math.abs(x) < 0.006 && Math.abs(y - (ey + 0.004)) < 0.006) bz = Math.max(bz, P.getZ(i)); }
    // earlobes: the outermost skin points ~4.5 cm under the eyes, around the ear's depth
    const ezc = P.getZ(el), lobe = [null, null], lx = [0, 0];
    for (let i = 0; i < P.count; i++) { const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
      if (y > ey - 0.058 && y < ey - 0.036 && Math.abs(z - ezc) < 0.03) { const sd = x > 0 ? 0 : 1; if (Math.abs(x) > lx[sd]) { lx[sd] = Math.abs(x); lobe[sd] = new THREE.Vector3(x, y, z); } } }
    faceFit = { bridgeZ: bz, ear: [new THREE.Vector3(P.getX(el), P.getY(el), P.getZ(el)), new THREE.Vector3(P.getX(er), P.getY(er), P.getZ(er))], lobe };
    faceRestF = faceFrame();
  }
  function bonePos(name, off) {
    const p = new THREE.Vector3(); if (!B[name]) return p;
    B[name].getWorldPosition(p); holder.worldToLocal(p);
    if (off) p.add(off);
    return p;
  }

  // ------------------------------------------------------------ two-hand gun rig (IK)
  let curRig = null, curGunK = 1, curHold = "low", curPistol = false, holsterM = null;
  function gunDims(w, pistol) {
    const src = weaponCache[w];
    if (src) {
      if (!src.userData.dims) { src.updateMatrixWorld(true); const b = new THREE.Box3().setFromObject(src); src.userData.dims = { zMin: b.min.z, zMax: b.max.z, yMin: b.min.y }; }
      return src.userData.dims;
    }
    const L = pistol ? 0.2 : w === "barrett" ? 1.25 : w === "remington" ? 1.0 : w === "mp5" || w === "uzi" ? 0.6 : 0.88;
    return pistol ? { zMin: -0.04, zMax: L * 0.8, yMin: -0.12 } : { zMin: -L * 0.38, zMax: L * 0.62, yMin: -0.2 };
  }
  function basisQ(fwd) {
    const z = fwd.clone().normalize(), x = new THREE.Vector3(0, 1, 0).cross(z).normalize(), y = z.clone().cross(x).normalize();
    return { q: new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z)), x, y, z };
  }
  // Where the gun sits and where each hand must go, in body space (model is 1.60 m; guns keep real size).
  function gunRig(w, hold, pistol, hScale) {
    const d = gunDims(w, pistol), k = 1 / hScale;
    const shR = bonePos("upperarm_r"), shL = bonePos("upperarm_l");
    let fwd, G, hr, hl;
    if (pistol) {
      fwd = v3(0, -0.06, 1);
      const b = basisQ(fwd), mid = shR.clone().add(shL).multiplyScalar(0.5);
      G = mid.clone().add(v3(-0.01, -0.08, 0.44));
      hr = G.clone().add(b.z.clone().multiplyScalar(-0.06 * k)).add(b.y.clone().multiplyScalar(-0.05 * k));
      hl = hr.clone().add(v3(0.035, -0.015, 0.0));
      return { G, q: b.q, k, hr, hl };
    }
    const pocket = shR.clone().add(v3(0.06, -0.04, 0.07));
    if (hold === "low") { fwd = v3(0.38, -0.62, 0.72); pocket.add(v3(0.03, -0.08, 0.03)); }
    else fwd = v3(0.035, -0.02, 1);
    const b = basisQ(fwd);
    G = pocket.clone().add(b.z.clone().multiplyScalar(-d.zMin * k)).add(b.y.clone().multiplyScalar(-0.025 * k));
    hr = G.clone().add(b.z.clone().multiplyScalar(-0.1 * k)).add(b.y.clone().multiplyScalar(-0.07 * k)).add(b.x.clone().multiplyScalar(-0.03 * k));
    const fore = Math.min(0.3, d.zMax * 0.38);
    hl = G.clone().add(b.z.clone().multiplyScalar(fore * k)).add(b.y.clone().multiplyScalar(-0.07 * k)).add(b.x.clone().multiplyScalar(0.02 * k));
    return { G, q: b.q, k, hr, hl };
  }
  // Pose presets (body space: model 1.60 m, facing +Z, her right = -X). hr/hl = wrist targets,
  // fl/fr = foot offsets from standing, pdy = pelvis drop. Hands-busy presets sling the gun.
  const POSE_PRESETS = {
    hold: {},
    hips:    { hr: [-0.2, 0.98, 0.03], hl: [0.2, 0.98, 0.03], elbow: 1.4 },
    hippop:  { hr: [-0.2, 0.98, 0.03], hl: [0.22, 1.0, 0.02], elbow: 1.4, pdx: 0.045, pdy: -0.02, fr: [0.06, 0, 0.07] },
    lookback:{ yaw: 0.55, head: 0.65, fr: [0, 0, 0.06] },
    crossed: { hr: [0.13, 1.13, 0.15], hl: [-0.13, 1.1, 0.16], elbow: 0.6 },
    peace:   { hr: [-0.13, 1.46, 0.12], hl: [0.2, 0.98, 0.03], elbow: 1.3 },
    walk:    { fr: [0, 0, 0.2], fl: [0, 0.035, -0.17], pdy: -0.03, hr: [-0.16, 0.86, -0.12], hl: [0.17, 0.86, 0.16] },
    squat:   { pdy: -0.36, fl: [0.09, 0, 0.02], fr: [-0.09, 0, 0.02], knee: 0.9, hr: [-0.22, 0.58, 0.3], hl: [0.22, 0.58, 0.3] },
    kneel:   { pdy: -0.38, fl: [0, 0, 0.3], fr: [0, 0.02, -0.4], kneelR: true },
    sit:     { seat: "chair", fl: [0.03, 0, 0.36], fr: [-0.03, 0, 0.36], hr: [-0.15, 0.6, 0.24], hl: [0.15, 0.6, 0.24], elbow: 1.0, knee: 0.12 },
    sitfloor:{ seat: "floor", fl: [0.07, 0, 0.5], fr: [-0.07, 0, 0.52], hr: [-0.16, 0.44, 0.34], hl: [0.16, 0.44, 0.32], elbow: 0.9, knee: 0.25 },
    allfours:{ pdy: -0.42, pitch: 88, pelvisK: 0.55, headUp: 70, hr: [-0.17, 0.03, 0.45], hl: [0.17, 0.03, 0.45], elbow: 0.3, fl: [0.03, 0, -0.38], fr: [-0.03, 0, -0.38], knee: 0.1, footPitch: 1.2 },
    sitcross:{ seat: "floor", fl: [-0.2, 0.04, 0.24], fr: [0.2, 0.05, 0.28], hr: [-0.2, 0.3, 0.3], hl: [0.2, 0.3, 0.3], elbow: 0.9, knee: 1.4 }
  };
  let lastTargets = null, curSeat = null;
  // seat top heights in body space (model 1.60 m); the pelvis bone sits ~0.1 above the seat
  const SEATS = { chair: 0.46, stool: 0.68, crate: 0.44, steps: 0.36, floor: 0.02 };
  function worldQ(name) { const q = new THREE.Quaternion(); if (B[name]) { holder.updateMatrixWorld(true); B[name].getWorldQuaternion(q); } return q; }
  function setWorldQ(name, q) {
    const b = B[name]; if (!b) return; holder.updateMatrixWorld(true);
    const pw = new THREE.Quaternion(); b.parent.getWorldQuaternion(pw);
    b.quaternion.copy(pw.invert().multiply(q)); b.updateMatrixWorld(true);
  }
  function movePelvis(d) {
    const b = B.pelvis; if (!b) return; holder.updateMatrixWorld(true);
    const wp = new THREE.Vector3(); b.getWorldPosition(wp);
    const lp = holder.worldToLocal(wp.clone()).add(d), t = holder.localToWorld(lp);
    b.parent.worldToLocal(t); b.position.copy(t); b.updateMatrixWorld(true);
  }
  function ikLeg(side, T, kneeOut) {
    // knee direction: forward for standing legs; when the foot is out in front (sitting, knees up) the
    // forward pole lines up with the leg and the knee flips across, so bend the knee up and outward instead
    const sx = side === "r" ? -1 : 1, hip = B["thigh_" + side] ? bonePos("thigh_" + side) : T.clone();
    const dir = T.clone().sub(hip); const len = dir.length() || 1; dir.divideScalar(len);
    const fwd = Math.max(0, Math.min(1, (dir.z - 0.2) / 0.5));          // 0 = foot below hip, 1 = foot well in front
    const out = (kneeOut || 0.15) + fwd * 0.45 + Math.max(0, sx * dir.x) * 0.6;
    ikChain("thigh_" + side, "calf_" + side, "foot_" + side, T, v3(sx * out, fwd * 1.4, 1 - fwd * 0.6));
  }
  function rotBone(name, axisBody, ang) {
    const b = B[name]; if (!b) return; holder.updateMatrixWorld(true);
    const hq = new THREE.Quaternion(); holder.getWorldQuaternion(hq);
    const q = new THREE.Quaternion().setFromAxisAngle(axisBody.clone().normalize().applyQuaternion(hq), ang);
    const bw = new THREE.Quaternion(); b.getWorldQuaternion(bw);
    const pw = new THREE.Quaternion(); b.parent.getWorldQuaternion(pw);
    b.quaternion.copy(pw.invert().multiply(q).multiply(bw)); b.updateMatrixWorld(true);
  }
  function yawBone(name, ang) {
    const b = B[name]; if (!b) return;
    holder.updateMatrixWorld(true);
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ang);
    const bw = new THREE.Quaternion(); b.getWorldQuaternion(bw);
    const pw = new THREE.Quaternion(); b.parent.getWorldQuaternion(pw);
    b.quaternion.copy(pw.invert().multiply(q).multiply(bw)); b.updateMatrixWorld(true);
  }
  // Two-bone IK: bend the arm so the wrist reaches T, elbow pointing down and out.
  // Hands resting on the body (hands on hips, hip pop, the free hand of the peace sign): the preset wrist
  // targets were set for a slim figure, so with wide hips the fingers sank into her. Measure the posed body
  // just below the wrist and move the hand out so the palm rests on the surface.
  let torsoVerts = null;
  let curGear = {};   // set by build(): what she wears in front of her torso (hands in front of the chest must clear it)
  function torsoList() {
    const g = body.geometry;
    if (!torsoVerts || torsoVerts.g !== g) {
      const SI = g.attributes.skinIndex.array, SW = g.attributes.skinWeight.array, P = g.attributes.position.array;
      const nm = body.skeleton.bones.map(b => b.name), bad = nm.map(n => /arm|hand|clav|thumb|index|middle|ring|pinky|head|neck/.test(n));
      const list = [];
      for (let i = 0, n = P.length / 3; i < n; i += 2) {
        let w = 0; for (let j = 0; j < 4; j++) if (bad[SI[i * 4 + j]]) w += SW[i * 4 + j];
        if (w < 0.2) list.push(i);
      }
      torsoVerts = { g, list };
    }
    return torsoVerts.list;
  }
  function fitHand(T) {
    if (!body) return T;
    if (Math.abs(T.x) < 0.22 && T.z > 0.06 && T.y > 0.85 && T.y < 1.42) {   // hands in front of the chest (arms crossed): stay in front of the plate / chest rig
      const add = (curGear.vest && T.y > 0.98 && T.y < 1.34 ? 0.085 : 0) || (curGear.chest && T.y > 0.9 && T.y < 1.08 ? 0.07 : 0) || (curGear.puffer ? 0.025 : 0);
      if (!add) return T;
      holder.updateMatrixWorld(true); body.skeleton.update();
      const v = new THREE.Vector3(); let zf = -9;
      for (const i of torsoList()) { body.getVertexPosition(i, v); v.applyMatrix4(body.matrixWorld); holder.worldToLocal(v);
        if (Math.abs(v.x) < 0.16 && Math.abs(v.y - T.y) < 0.07 && v.z > zf) zf = v.z; }
      if (zf > -9) T.z = Math.max(T.z, zf + add + 0.035);
      if (add > 0.05) { T.x *= 0.35; T.y += 0.06; T.fwd = true; }   // over a plate the forearms can't cross as far: elbows come forward, wrists meet in front of it
      return T;
    }
    if (Math.abs(T.x) > 0.34 || T.y < 0.7 || T.y > 1.3 || Math.abs(T.z) > 0.14) return T;
    torsoList();
    holder.updateMatrixWorld(true); body.skeleton.update();
    const s = T.x < 0 ? -1 : 1, v = new THREE.Vector3(); let w = 0;
    for (const i of torsoVerts.list) {
      body.getVertexPosition(i, v); v.applyMatrix4(body.matrixWorld); holder.worldToLocal(v);
      if (v.y < T.y - 0.12 || v.y > T.y + 0.03 || Math.abs(v.z - T.z) > 0.12 || v.x * s <= 0) continue;
      if (v.x * s > w) w = v.x * s;
    }
    if (w + 0.03 > Math.abs(T.x)) T.x = s * (w + 0.03);
    return T;
  }
  function ik(side, T, elbowOut) {
    const e = elbowOut == null ? 0.75 : elbowOut;
    ikChain("upperarm_" + side, "lowerarm_" + side, "hand_" + side, T, T.fwd ? v3(side === "r" ? -0.55 : 0.55, -0.6, 1.1) : v3(side === "r" ? -e : e, -1, -0.25));
  }
  function ikChain(ua, la, h, T, pole) {
    if (!B[ua] || !B[la] || !B[h]) return;
    const S = bonePos(ua), Lp = bonePos(la), Hp = bonePos(h);
    const L1 = S.distanceTo(Lp), L2 = Lp.distanceTo(Hp);
    const D = T.clone().sub(S); let dd = D.length();
    dd = Math.max(Math.abs(L1 - L2) + 1e-3, Math.min(dd, (L1 + L2) * 0.999));
    const u = D.normalize();
    const a = (L1 * L1 - L2 * L2 + dd * dd) / (2 * dd), hh = Math.sqrt(Math.max(0, L1 * L1 - a * a));
    const pp = pole.clone().sub(u.clone().multiplyScalar(pole.dot(u))).normalize();
    const E = S.clone().add(u.clone().multiplyScalar(a)).add(pp.multiplyScalar(hh));
    aim(ua, la, E.clone().sub(S));
    const T2 = S.clone().add(u.clone().multiplyScalar(dd));
    aim(la, h, T2.sub(bonePos(la)));
  }

  // ------------------------------------------------------------ add-ons: hair, gear, jewelry, weapon
  // ------------------------------------------------------------ eyewear
  // Lens outlines (metres, centred on the lens), extruded into frames with real lenses, a bridge and temples.
  function lensShape(type, scale = 1) {
    const S = new THREE.Shape(), k = scale;
    const poly = (pts) => { pts.forEach(([x, y], i) => (i ? S.lineTo(x * k, y * k) : S.moveTo(x * k, y * k))); S.closePath(); return S; };
    if (type === "round") { S.absarc(0, 0, 0.0215 * k, 0, Math.PI * 2, false); return S; }
    if (type === "aviator") { // teardrop
      S.moveTo(-0.026 * k, 0.012 * k); S.bezierCurveTo(-0.012 * k, 0.02 * k, 0.014 * k, 0.02 * k, 0.026 * k, 0.012 * k);
      S.bezierCurveTo(0.03 * k, -0.006 * k, 0.012 * k, -0.026 * k, -0.004 * k, -0.026 * k);
      S.bezierCurveTo(-0.02 * k, -0.026 * k, -0.03 * k, -0.006 * k, -0.026 * k, 0.012 * k); return S;
    }
    if (type === "cateye") { // swept up at the outer corner (outer = +x)
      S.moveTo(-0.024 * k, 0.008 * k); S.bezierCurveTo(-0.01 * k, 0.016 * k, 0.016 * k, 0.016 * k, 0.03 * k, 0.022 * k);
      S.bezierCurveTo(0.028 * k, 0.004 * k, 0.02 * k, -0.018 * k, 0.002 * k, -0.019 * k);
      S.bezierCurveTo(-0.018 * k, -0.019 * k, -0.026 * k, -0.006 * k, -0.024 * k, 0.008 * k); return S;
    }
    // wayfarer / smart: trapezoid, wide top, rounded corners
    S.moveTo(-0.025 * k, 0.015 * k); S.lineTo(0.026 * k, 0.017 * k); S.quadraticCurveTo(0.029 * k, 0.017 * k, 0.028 * k, 0.012 * k);
    S.lineTo(0.022 * k, -0.013 * k); S.quadraticCurveTo(0.02 * k, -0.018 * k, 0.014 * k, -0.018 * k); S.lineTo(-0.016 * k, -0.017 * k);
    S.quadraticCurveTo(-0.023 * k, -0.017 * k, -0.024 * k, -0.011 * k); S.lineTo(-0.027 * k, 0.01 * k); S.quadraticCurveTo(-0.028 * k, 0.015 * k, -0.025 * k, 0.015 * k);
    return S;
  }
  // a strap around the back of the head: an arc in the horizontal plane with its gap at the front (+z)
  // elastic strap hugging the head: an elliptical band (rx wide, rz deep) with the gap at the front
  let headEll = { rx: 0.084, rz: 0.098, zc: -0.006 };
  function headStrap(r, tube, mat, y, z, arc = Math.PI * 1.3, flat = 0.5) {
    const rx = headEll.rx + 0.004, rz = headEll.rz + 0.004;
    const g = new THREE.TorusGeometry(rx, 0.0024, 6, 64, arc);
    g.rotateZ(Math.PI / 2 - arc / 2); g.rotateX(-Math.PI / 2); g.scale(1, Math.max(2.5, flat * 2.2), rz / rx);
    z = headEll.zc;
    const m = new THREE.Mesh(g, mat); m.position.set(0, y, z); return m;
  }
  // Long braids / locs: tubes rooted all over the scalp that hug the skull, then fall behind the shoulders.
  // Knotless = alternating braid lobes; butterfly = thicker, lumpy twisted locs.
  function braidHair(style, R, len, hairM, scalp, rim) {
    const G = new THREE.Group(), r = rnd(style === "butterfly" ? 41 : style === "curly" ? 53 : style === "wave" ? 61 : style === "locs" ? 67 : 29), fly = style === "butterfly", curly = style === "curly", wavy = style === "wave", locs = style === "locs";
    const mat = hairM.clone(); mat.roughness = fly ? 0.7 : curly ? 0.6 : wavy ? 0.36 : locs ? 0.88 : 0.55; strandHood(mat);
    // scalp ellipsoid from the short-hair cap's bounds (relative to H), else a sphere guess
    const d2r = Math.PI / 180, sc = scalp || { c: new THREE.Vector3(0, 0.004, -0.008), r: new THREE.Vector3(R, R, R) }, RS = 1.0;
    const sp = (a, e, rad) => new THREE.Vector3(Math.sin(a) * Math.cos(e) * (sc.r.x * rad + (rad - 1) * 0.0), Math.sin(e) * sc.r.y * rad, -Math.cos(a) * Math.cos(e) * sc.r.z * rad).add(sc.c);
    const n = fly ? 96 : curly ? 130 : wavy ? 80 : locs ? 70 : 130, thick = fly ? 0.0082 : curly ? 0.0042 : wavy ? 0.0085 : locs ? 0.0098 : 0.0055;
    for (let k = 0; k < n; k++) {
      // spread roots evenly over the back / sides / crown (golden-angle spiral), hairline stays off the face
      const u = (k + 0.5) / n, a = ((k * 137.508) % 300 - 150) * d2r; let e = (8 + 78 * Math.sqrt(1 - u)) * d2r;
      let front = Math.abs(a) > 105 * d2r;
      if (rim) {   // under a cap or beanie: no crown or front roots; each root sits just under the brim line
        if (front) continue;
        const ry = rim.back + (rim.front - rim.back) * (1 - Math.cos(a)) / 2 - 0.012;
        const eMax = Math.asin(THREE.MathUtils.clamp((ry - sc.c.y) / sc.r.y, -0.9, 0.95));
        if (e > eMax) e = eMax - r() * 0.12;
      }
      if (wavy && e > 52 * d2r && !rim) continue;   // the sleek crown is the base hair; waves start lower
      if (front && (e < 45 * d2r || style !== "curly" && style !== "wave")) continue;
      const way = [[a, e]];
      if (front) way.push([Math.sign(a) * 100 * d2r, e * 0.75]);      // front roots sweep back over the crown
      const a1 = way[way.length - 1][0];
      const pts = way.map(([aa, ee]) => sp(aa, ee, 1.02));
      const puff = (curly ? 0.03 + r() * 0.024 : wavy ? 0.003 : 0) * (rim ? 0.45 : 1);   // curls stand off the scalp for volume (less right under a hat brim)
      for (let ee = way[way.length - 1][1] - 15 * d2r; ee > -50 * d2r; ee -= 15 * d2r) pts.push(sp(a1, ee, 1.04 + (puff * (1 + (e - ee)) + (ee < 0 ? -ee * (curly ? 0.04 : 0.01) : 0)) / 0.09));
      // hang: behind the shoulders, spreading a little, gentle sway
      const last = pts[pts.length - 1], drop = len * (0.82 + r() * 0.3);
      const J = wavy ? 14 : 5;
      for (let j = 1; j <= J; j++) {
        const t = j / J, y = last.y - drop * t;
        const wide = curly ? 0.24 : wavy ? 0.2 : 0.16;
        const x = THREE.MathUtils.clamp(last.x * (1 + (curly ? 1.1 : wavy ? 0.6 : 0.35) * t), -wide, wide) + Math.sin(t * 5 + k) * 0.006 + (wavy ? Math.sin(t * 9 + k * 0.7) * 0.022 * (0.3 + t) : 0);
        const z = Math.min(last.z, -0.06) - 0.035 * t - (y < -0.2 ? 0.03 + Math.abs(x) * 0.15 : 0) - r() * 0.012;
        pts.push(new THREE.Vector3(x, y, z));
      }
      const mk = (pts) => {
      let curve = new THREE.CatmullRomCurve3(pts);
      if (curly) {   // wind a tight spiral around the path
        const NS = 170, sp2 = curve.getSpacedPoints(NS), fr = curve.computeFrenetFrames(NS, false), cr = 0.01 + r() * 0.005, ph0 = r() * 6.28;
        curve = new THREE.CatmullRomCurve3(sp2.map((pp, i) => { const t = i / NS * 58 + ph0, k2 = Math.min(1, i / 6);
          return pp.clone().addScaledVector(fr.normals[i], Math.cos(t) * cr * k2).addScaledVector(fr.binormals[i], Math.sin(t) * cr * k2); }));
      }
      const TS = curly ? 230 : 48, RAD = curly ? 5 : 6;
      const g = new THREE.TubeGeometry(curve, TS, thick * (0.85 + r() * 0.3), RAD, false), P = g.attributes.position, c = new THREE.Vector3(), v = new THREE.Vector3();
      const ph = r() * 6.28;
      for (let i = 0; i <= TS; i++) {
        curve.getPointAt(i / TS, c);
        const taper = i < 3 ? 0.55 + i * 0.15 : i > TS - 4 ? 0.65 + (TS - i) * 0.09 : 1;
        for (let j = 0; j <= RAD; j++) {
          const idx = i * (RAD + 1) + j, ang = (j / RAD) * Math.PI * 2;
          const f = curly || wavy ? 1 : locs ? 1 + 0.12 * Math.sin(i * 0.8 + ph) + 0.06 * Math.sin(i * 2.3 + ang) : fly ? 1 + 0.38 * Math.max(0, Math.sin(i * 0.9 + ph + ang)) + 0.12 * Math.sin(i * 2.7 + ph)
                        : 1 + 0.3 * Math.max(0, Math.sin(i * 1.6 + (j % 2 ? Math.PI : 0) + ang * 0.5));
          v.fromBufferAttribute(P, idx).sub(c).multiplyScalar(f * taper).add(c); P.setXYZ(idx, v.x, v.y, v.z);
        }
      }
      g.computeVertexNormals();
      return g; };
      const sm = new THREE.Mesh(mk(pts), mat); sm.userData.strand = { pts, mk }; G.add(sm);
    }
    // ends: small cuffs / sealed tips on butterfly locs
    return G;
  }
  // Sleek high ponytail: a bundle of strands gathered at the crown with a band, arcing back and down the back.
  function highPony(hairM, eyeY, eyeZ, top, hat, down, clear = 0) {
    const G = new THREE.Group(), r = rnd(17), mat = hairM.clone(); mat.roughness = 0.35;
    const base = hat === "cap" ? new THREE.Vector3(0, eyeY + 0.04, eyeZ - 0.19) : hat ? new THREE.Vector3(0, eyeY - 0.03, eyeZ - 0.185) : new THREE.Vector3(0, top - 0.02, eyeZ - 0.155);
    const spine = hat ? [base, new THREE.Vector3(0, base.y - 0.012, eyeZ - 0.228), new THREE.Vector3(0, base.y - 0.05, eyeZ - 0.252),
      new THREE.Vector3(0, eyeY - 0.14, eyeZ - 0.262), new THREE.Vector3(0, eyeY - 0.3, eyeZ - 0.255), new THREE.Vector3(0, eyeY - 0.46, eyeZ - 0.245)] : [base, new THREE.Vector3(0, top + 0.012, eyeZ - 0.2), new THREE.Vector3(0, eyeY + 0.03, eyeZ - 0.255),
      new THREE.Vector3(0, eyeY - 0.12, eyeZ - 0.262), new THREE.Vector3(0, eyeY - 0.3, eyeZ - 0.255), new THREE.Vector3(0, eyeY - 0.46, eyeZ - 0.245)];
    if (down && (down.y > -0.985 || clear)) {   // re-hang everything past the gathered top along gravity (and out over a back plate)
      const back = v3(0, 0, -1).sub(down.clone().multiplyScalar(-down.z)).normalize();
      for (let i = 3; i < spine.length; i++) { const seg = spine[i].distanceTo(spine[i - 1]); spine[i] = spine[i - 1].clone().addScaledVector(down, seg * 0.94).addScaledVector(back, seg * 0.12 + (i === 3 ? clear : 0)); }
    }
    const sc = new THREE.CatmullRomCurve3(spine), NS = 40, fr = sc.computeFrenetFrames(NS, false), sp = sc.getSpacedPoints(NS);
    for (let k = 0; k < 34; k++) {
      const a = r() * 6.28, rr = Math.sqrt(r()), ln = 0.75 + r() * 0.25, pts = [];
      for (let i = 0; i <= NS * ln; i++) {
        const t = i / NS, w = 0.012 + 0.022 * Math.sin(Math.min(1, t * 1.6) * Math.PI * 0.5) * (1 - t * 0.55);   // fans out then narrows to a tip
        pts.push(sp[i].clone().addScaledVector(fr.normals[i], Math.cos(a) * rr * w).addScaledVector(fr.binormals[i], Math.sin(a) * rr * w * 1.3));
      }
      if (pts.length < 4) continue;
      G.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, 0.0055 + r() * 0.003, 6, false), mat));
    }
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.014, 0.0045, 8, 24), std({ color: 0x111111, roughness: 0.5 }));
    band.position.copy(sp[2]); band.lookAt(sp[3]); G.add(band);
    return G;
  }
  function eyewear(type, H, eyeY, eyeZ, eyeX) {
    const G = new THREE.Group(); H.add(G);
    const frameBlack = new THREE.MeshPhysicalMaterial({ color: 0x050506, roughness: 0.35, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.25, envMapIntensity: 0.5 });
    const gold = new THREE.MeshPhysicalMaterial({ color: 0xd8b25a, roughness: 0.18, metalness: 1 });
    const lensDark = new THREE.MeshPhysicalMaterial({ color: 0x1b2a22, roughness: 0.04, metalness: 0.25, transparent: true, opacity: 0.86, clearcoat: 1, envMapIntensity: 2, side: THREE.DoubleSide });
    const lensGrad = new THREE.MeshPhysicalMaterial({ color: 0x3a2c22, roughness: 0.04, metalness: 0.35, transparent: true, opacity: 0.8, clearcoat: 1, envMapIntensity: 2.2, side: THREE.DoubleSide });
    const mirror = new THREE.MeshPhysicalMaterial({ color: 0x7fb4ff, roughness: 0.04, metalness: 0.9, envMapIntensity: 2.2, transparent: true, opacity: 0.94, side: THREE.DoubleSide });
    // lenses and polished frames reflect a studio room even when the look has no environment light
    if (!envTex) envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    for (const m of [frameBlack, gold, lensDark, lensGrad, mirror]) m.envMap = envTex;
    // sit the lenses just in front of the nose bridge (about 1 cm off the eyes), arms running back to the real ears
    if (faceFit) { const ex2 = Math.abs(faceFit.ear[0].x - faceFit.ear[1].x) / 2; headEll = { rx: ex2 - 0.002, rz: 0.096, zc: eyeZ - 0.088 }; }
    const zcF = eyeZ - 0.088;
    const hp = H.position, bridge = faceFit && faceFit.bridgeZ > -1 ? faceFit.bridgeZ - hp.z : eyeZ + 0.008;
    const z0 = Math.max(eyeZ + 0.009, bridge + 0.003), ex = eyeX;
    const ears = faceFit ? faceFit.ear.map((e) => e.clone().sub(hp)) : null;
    const bar = (a, b, th, hgt, mat) => {
      const A = new THREE.Vector3(...a), Bv = new THREE.Vector3(...b), m = new THREE.Mesh(new THREE.BoxGeometry(th, hgt, A.distanceTo(Bv)), mat);
      m.position.copy(A).add(Bv).multiplyScalar(0.5); m.lookAt(m.position.clone().add(Bv.clone().sub(A))); G.add(m); return m;
    };
    const temples = (mat, th = 0.0035, hgt = 0.006, y = 0.009) => {
      for (const sd of [-1, 1]) {
        const e = ears ? ears[sd > 0 ? 0 : 1] : new THREE.Vector3(sd * (ex + 0.035), eyeY - 0.005, z0 - 0.1);
        const ox = sd * Math.max(ex + 0.031, Math.abs(e.x) + th);           // hinge at the frame corner, never inside the head
        const earPt = [sd * (Math.abs(e.x) + th * 0.6 + 0.0015), e.y + 0.01, e.z + 0.008];
        bar([ox, eyeY + y * 0.5, z0 - 0.002], earPt, th, hgt, mat);
        bar(earPt, [earPt[0] - sd * 0.003, earPt[1] - 0.026, earPt[2] - 0.016], th, hgt * 0.8, mat);   // tip curls down behind the ear
      }
    };
    if (["wayfarer", "smart", "aviator", "round", "cateye"].includes(type)) {
      const metal = type === "aviator" || type === "round";
      const fMat = metal ? gold : frameBlack, lMat = type === "aviator" ? lensGrad : lensDark;
      const thick = type === "smart" ? 1.32 : (metal ? 1.1 : 1.24);
      for (const sd of [-1, 1]) {
        const outer = lensShape(type, thick), hole = lensShape(type, 1); outer.holes.push(new THREE.Path(hole.getPoints(48)));
        const fr = new THREE.Mesh(new THREE.ExtrudeGeometry(outer, { depth: metal ? 0.0016 : 0.0045, bevelEnabled: true, bevelThickness: 0.0008, bevelSize: 0.0006, bevelSegments: 2, curveSegments: 32 }), fMat);
        const ln = new THREE.Mesh(new THREE.ShapeGeometry(lensShape(type, 1), 32), lMat);
        for (const m of [fr, ln]) { m.scale.x = sd; m.position.set(sd * ex, eyeY, z0 + (m === ln ? 0.0016 : 0)); m.rotation.y = sd * 0.1; G.add(m); }
      }
      // bridge
      if (metal) { G.add(limb([-0.009, eyeY + 0.012, z0 + 0.003], [0.009, eyeY + 0.012, z0 + 0.003], 0.0012, 0.0012, gold));
        if (type === "aviator") G.add(limb([-0.012, eyeY + 0.019, z0 + 0.002], [0.012, eyeY + 0.019, z0 + 0.002], 0.001, 0.001, gold)); }
      else { const br = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.006, 0.005), fMat); br.position.set(0, eyeY + 0.01, z0 + 0.002); G.add(br); }
      temples(fMat, metal ? 0.0014 : (type === "smart" ? 0.006 : 0.0045), metal ? 0.0016 : (type === "smart" ? 0.009 : 0.007));
      if (type === "smart") {   // camera + LED in the frame corners
        const cam = new THREE.Mesh(new THREE.CylinderGeometry(0.0024, 0.0024, 0.002, 20), new THREE.MeshPhysicalMaterial({ color: 0x050505, roughness: 0.02, metalness: 0.6, clearcoat: 1 }));
        cam.rotation.x = Math.PI / 2; cam.position.set(ex + 0.029, eyeY + 0.016, z0 + 0.006); G.add(cam);
        const led = new THREE.Mesh(new THREE.SphereGeometry(0.0011, 10, 8), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 1.5 }));
        led.position.set(-(ex + 0.029), eyeY + 0.016, z0 + 0.006); G.add(led);
      }
      return G;
    }
    // flat pieces built facing +z at their own depth, then bent round the face about the skull centre
    const bend = (geo, r0, vk = 0) => {
      const P = geo.attributes.position;
      for (let i = 0; i < P.count; i++) { const x = P.getX(i), y = P.getY(i), rr = P.getZ(i) - zcF - vk * (y - eyeY) ** 2, a = x / r0; P.setX(i, Math.sin(a) * rr); P.setZ(i, zcF + Math.cos(a) * rr); }
      geo.computeVertexNormals(); return geo;
    };
    const atWrap = (x, y, z, r0) => { const rr = z - zcF, a = x / r0; return new THREE.Vector3(Math.sin(a) * rr, y, zcF + Math.cos(a) * rr); };
    const wrapTemples = (mat, xEnd, zEnd, r0, th, hgt, yOff = 0.004) => {
      for (const sd of [-1, 1]) {
        const e = ears ? ears[sd > 0 ? 0 : 1] : new THREE.Vector3(sd * (ex + 0.035), eyeY - 0.005, z0 - 0.1);
        const hinge = atWrap(sd * xEnd, eyeY + yOff, zEnd, r0), earPt = new THREE.Vector3(sd * (Math.abs(e.x) + th * 0.6 + 0.0015), e.y + 0.01, e.z + 0.008);
        if (Math.abs(hinge.x) < Math.abs(earPt.x)) hinge.x = sd * Math.abs(earPt.x);
        bar(hinge.toArray(), earPt.toArray(), th, hgt, mat);
        bar(earPt.toArray(), [earPt.x - sd * 0.003, earPt.y - 0.026, earPt.z - 0.016], th, hgt * 0.8, mat);
      }
    };
    const outline = (W, top, bot, notchW, notchH, side = 0.9) => {   // lens outline: wide, flatter top, rounded outer corners, nose notch at the bottom
      const S = new THREE.Shape();
      S.moveTo(-W, top * 0.45);
      S.bezierCurveTo(-W * 0.8, top * 1.05, -W * 0.35, top, 0, top * 0.94);
      S.bezierCurveTo(W * 0.35, top, W * 0.8, top * 1.05, W, top * 0.45);
      S.bezierCurveTo(W * 1.04, bot * 0.1, W * 0.92, bot * side, W * 0.62, bot);
      S.bezierCurveTo(W * 0.4, bot * 1.06, notchW * 1.6, bot * 0.9, notchW, bot + notchH * 0.35);
      S.quadraticCurveTo(0, bot + notchH * 1.25, -notchW, bot + notchH * 0.35);
      S.bezierCurveTo(-notchW * 1.6, bot * 0.9, -W * 0.4, bot * 1.06, -W * 0.62, bot);
      S.bezierCurveTo(-W * 0.92, bot * side, -W * 1.04, bot * 0.1, -W, top * 0.45);
      return S;
    };
    if (type === "shield") {   // sport wraparound (Oakley-style): one mirrored lens, slim brow bar, nose pads, straight stems
      const zL = z0 + 0.006, r0 = zL - zcF, W = 0.084;
      const lensS = outline(W, 0.024, -0.024, 0.012, 0.02, 0.75);
      const lens = new THREE.Mesh(bend(new THREE.ShapeGeometry(lensS, 40).translate(0, eyeY, zL), r0, 1.2), mirror); G.add(lens);
      const brow = new THREE.Shape(); { const pts = lensS.getPoints(40).filter((p) => p.y > 0.024 * 0.42); pts.sort((a, b) => a.x - b.x);
        brow.moveTo(pts[0].x, pts[0].y + 0.003); pts.forEach((p) => brow.lineTo(p.x, p.y + 0.003)); [...pts].reverse().forEach((p) => brow.lineTo(p.x, p.y - 0.0035)); brow.closePath(); }
      const bm = new THREE.Mesh(bend(new THREE.ExtrudeGeometry(brow, { depth: 0.004, bevelEnabled: true, bevelThickness: 0.0008, bevelSize: 0.0007, bevelSegments: 2, curveSegments: 24 }).translate(0, eyeY, zL - 0.002), r0, 1.2), frameBlack); G.add(bm);
      for (const sd of [-1, 1]) { const np = new THREE.Mesh(new THREE.SphereGeometry(0.004, 12, 8), new THREE.MeshPhysicalMaterial({ color: 0x9a9aa0, roughness: 0.3, transparent: true, opacity: 0.85 })); np.scale.set(0.6, 1, 0.5); np.position.set(sd * 0.0085, eyeY - 0.006, z0 - 0.002); G.add(np); }
      wrapTemples(frameBlack, W - 0.004, zL - 0.002, r0, 0.0045, 0.008, 0.012);
      return G;
    }
    if (type === "goggles") {   // tactical ballistic goggles: thick rubber frame sealed to the face, smoked wrap lens, vents, wide strap with side clips
      const zL = z0 + 0.016, r0 = zL - zcF, W = 0.088, frameD = 0.02;
      const outer = outline(W, 0.032, -0.034, 0.016, 0.024, 0.7), inner = outline(W - 0.008, 0.024, -0.026, 0.018, 0.022, 0.7);
      const ring = outline(W, 0.032, -0.034, 0.016, 0.024, 0.7); ring.holes.push(new THREE.Path(inner.getPoints(64)));
      const rubber = new THREE.MeshStandardMaterial({ color: 0x17181b, roughness: 0.85 });
      const fr = new THREE.Mesh(bend(new THREE.ExtrudeGeometry(ring, { depth: frameD, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.0018, bevelSegments: 3, curveSegments: 40 }).translate(0, eyeY, zL - frameD), r0, 1.4), rubber); G.add(fr);
      const smoked = new THREE.MeshPhysicalMaterial({ color: 0x3e4a46, roughness: 0.03, metalness: 0.35, transparent: true, opacity: 0.78, clearcoat: 1, envMap: envTex, envMapIntensity: 2.2, side: THREE.DoubleSide });
      const lens = new THREE.Mesh(bend(new THREE.ShapeGeometry(outline(W - 0.004, 0.028, -0.03, 0.017, 0.023, 0.7), 40).translate(0, eyeY, zL + 0.0005), r0, 1.4), smoked); G.add(lens);
      for (const x of [-0.05, -0.025, 0, 0.025, 0.05]) { const v = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.0025, 0.004), new THREE.MeshStandardMaterial({ color: 0x050506, roughness: 1 })); v.position.copy(atWrap(x, eyeY + 0.029, zL - 0.001, r0)); v.rotation.y = x / r0; G.add(v); }
      const strapM = new THREE.MeshStandardMaterial({ color: 0x24261f, roughness: 0.95 });
      G.add(headStrap(0.099, 0.012, strapM, eyeY + 0.002, -0.008, Math.PI * 1.25, 2.6));
      for (const sd of [-1, 1]) { const cl = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.026, 0.02), rubber); cl.position.copy(atWrap(sd * (W + 0.003), eyeY + 0.001, zL - frameD * 0.6, r0)); cl.rotation.y = sd * (W / r0); G.add(cl); }
      return G;
    }
    if (type === "vr") {   // Quest-3-style visor: rounded, gently curved front, three vertical sensor pills, grey face seal, side arms + rear strap
      const sh = new THREE.Shape(), w = 0.074, h = 0.033, rr = 0.016;
      sh.moveTo(-w + rr, -h); sh.lineTo(w - rr, -h); sh.quadraticCurveTo(w, -h, w, -h + rr); sh.lineTo(w, h - rr); sh.quadraticCurveTo(w, h, w - rr, h);
      sh.lineTo(-w + rr, h); sh.quadraticCurveTo(-w, h, -w, h - rr); sh.lineTo(-w, -h + rr); sh.quadraticCurveTo(-w, -h, -w + rr, -h);
      const white = new THREE.MeshPhysicalMaterial({ color: 0xf3f3f1, roughness: 0.42, clearcoat: 0.5, clearcoatRoughness: 0.35 }); white.envMap = envTex;
      const zB = eyeZ + 0.012, r0 = zB + 0.045 - zcF, D = 0.042;
      const box = new THREE.Mesh(bend(new THREE.ExtrudeGeometry(sh, { depth: D, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.009, bevelSegments: 6, curveSegments: 20 }).translate(0, eyeY + 0.008, zB), r0, 2.0), white); G.add(box);
      const seal = new THREE.Mesh(bend(new THREE.ExtrudeGeometry(sh, { depth: 0.016, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.004, bevelSegments: 3, curveSegments: 16 }).scale(0.95, 0.92, 1).translate(0, eyeY + 0.008, eyeZ - 0.005), r0, 2.0), new THREE.MeshStandardMaterial({ color: 0x55575c, roughness: 0.95 })); G.add(seal);
      const pillM = new THREE.MeshPhysicalMaterial({ color: 0x08080a, roughness: 0.08, clearcoat: 1 });
      for (const x of [-0.046, 0, 0.046]) {
        const pill = new THREE.Mesh(new THREE.CapsuleGeometry(0.0062, x === 0 ? 0.014 : 0.024, 6, 14), pillM); pill.scale.z = 0.35;
        pill.position.copy(atWrap(x, eyeY + 0.008, zB + D + 0.0115, r0)); pill.rotation.y = x / r0; G.add(pill);
      }
      const strapM = new THREE.MeshStandardMaterial({ color: 0x3a3b40, roughness: 0.85 });
      for (const sd of [-1, 1]) {   // rigid side arms running from the visor back over the ears
        const e = ears ? ears[sd > 0 ? 0 : 1] : new THREE.Vector3(sd * 0.075, eyeY - 0.005, zcF);
        const a0 = atWrap(sd * (w + 0.004), eyeY + 0.012, zB + 0.01, r0), a1 = new THREE.Vector3(sd * (Math.abs(e.x) + 0.012), eyeY + 0.016, e.z - 0.012);
        if (Math.abs(a0.x) < Math.abs(a1.x)) a0.x = sd * Math.abs(a1.x);
        bar(a0.toArray(), a1.toArray(), 0.009, 0.016, strapM);
      }
      G.add(headStrap(0.099, 0.008, strapM, eyeY + 0.014, -0.012, Math.PI * 1.25, 2.6));
      const top = new THREE.Mesh(new THREE.TorusGeometry(0.096, 0.0055, 6, 32, Math.PI * 0.9), strapM); top.rotation.y = Math.PI / 2; top.rotation.z = Math.PI * 0.05; top.position.set(0, eyeY - 0.004, -0.012); G.add(top);
      return G;
    }
    if (type === "nvg") {   // ballistic helmet with a front shroud, flip-down arm and twin green-glow tubes
      const olive = new THREE.MeshPhysicalMaterial({ color: 0x3b4230, roughness: 0.78, clearcoat: 0.15 });
      const blk = new THREE.MeshStandardMaterial({ color: 0x17181a, roughness: 0.6, metalness: 0.3 });
      const hr = { x: headEll.rx + 0.02, y: 0.108, z: headEll.rz + 0.02 };
      const helm = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24, 0, Math.PI * 2, 0, Math.PI * 0.53), olive);
      helm.scale.set(hr.x, hr.y, hr.z); helm.position.set(0, eyeY + 0.028, zcF - 0.004); helm.rotation.x = -0.22; G.add(helm);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(1, 0.035, 6, 64), blk); rim.scale.set(hr.x * 0.99, hr.z * 0.99, 0.14); rim.rotation.x = Math.PI / 2 - 0.22;
      rim.position.set(0, eyeY + 0.028 - 0.006, zcF - 0.004); G.add(rim);
      for (const sd of [-1, 1]) { const rail = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.016, 0.07), blk); rail.position.set(sd * (hr.x - 0.002), eyeY + 0.045, zcF - 0.01); rail.rotation.z = sd * 0.12; G.add(rail); }
      const fz = zcF + hr.z * Math.cos(0.35) - 0.004, fy = eyeY + 0.028 + hr.y * Math.sin(0.35) + 0.006;
      const shroud = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.022, 0.012), blk); shroud.position.set(0, fy, fz); shroud.rotation.x = -0.35; G.add(shroud);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.05, 0.012), blk); arm.position.set(0, (fy + eyeY + 0.012) / 2, z0 + 0.03); arm.rotation.x = 0.2; G.add(arm);
      const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.016, 0.022), blk); bridge.position.set(0, eyeY + 0.012, z0 + 0.034); G.add(bridge);
      for (const sd of [-1, 1]) {
        const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.0135, 0.0115, 0.06, 28), olive); tube.rotation.x = Math.PI / 2; tube.position.set(sd * ex, eyeY, z0 + 0.034); G.add(tube);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.0132, 0.0018, 8, 28), blk); ring.position.set(sd * ex, eyeY, z0 + 0.064); G.add(ring);
        const lens = new THREE.Mesh(new THREE.CircleGeometry(0.0122, 28), new THREE.MeshPhysicalMaterial({ color: 0x0a2a10, emissive: 0x2bff5a, emissiveIntensity: 0.55, roughness: 0.05, clearcoat: 1 })); lens.position.set(sd * ex, eyeY, z0 + 0.0645); G.add(lens);
      }
      return G;
    }
    return G;
  }

  // ================================================================== FITTED GARMENTS + GEAR
  // Clothes are "shells" grown from the body's own surface: a smoothed copy of the skin pushed out along the
  // normals by the fabric thickness, skinned to the same skeleton, so they follow every curve slider and pose.
  // Rigid gear (plate carrier, rigs, holster, pockets, jewellery) is modelled in rest space against the current
  // body shape and riding one bone.
  let G = null;
  const SOLID = {   // per colourway: main solid (puffer) and dark accent (crop, biker shorts, gear)
    snow: ["#eef0f3", "#34373c"], desert: ["#d8c29b", "#5d4a31"], woodland: ["#4f5c33", "#262a19"], urban: ["#202125", "#0f1012"],
    navy: ["#24345c", "#111a2e"], pink: ["#f4b0c9", "#26222a"], red: ["#151518", "#a51d27"]
  };
  function garPrep() {
    const g = body.geometry, P = g.attributes.position, N = g.attributes.normal, n = P.count, idx = g.index.array;
    const wid = new Int32Array(n), km = new Map(); let nw = 0;
    for (let i = 0; i < n; i++) {
      const k = Math.round(P.getX(i) * 2e4) + "," + Math.round(P.getY(i) * 2e4) + "," + Math.round(P.getZ(i) * 2e4);
      let id = km.get(k); if (id === undefined) { id = nw++; km.set(k, id); } wid[i] = id;
    }
    const wp = new Float32Array(nw * 3), wn = new Float32Array(nw * 3);
    for (let i = 0; i < n; i++) { const w = wid[i] * 3; wp[w] = P.getX(i); wp[w + 1] = P.getY(i); wp[w + 2] = P.getZ(i); wn[w] += N.getX(i); wn[w + 1] += N.getY(i); wn[w + 2] += N.getZ(i); }
    for (let w = 0; w < nw; w++) { const l = Math.hypot(wn[w * 3], wn[w * 3 + 1], wn[w * 3 + 2]) || 1; wn[w * 3] /= l; wn[w * 3 + 1] /= l; wn[w * 3 + 2] /= l; }
    const nb = Array.from({ length: nw }, () => new Set());
    for (let t = 0; t < idx.length; t += 3) {
      const a = wid[idx[t]], b = wid[idx[t + 1]], c = wid[idx[t + 2]];
      nb[a].add(b); nb[a].add(c); nb[b].add(a); nb[b].add(c); nb[c].add(a); nb[c].add(b);
    }
    const adj = nb.map((s) => Int32Array.from(s));
    const a = null;
    const repI = new Int32Array(nw); for (let i = n - 1; i >= 0; i--) repI[wid[i]] = i;
    G = { wid, nw, repI, smooth: a, wn, adj, n, R1: g.attributes.aR1.array, R2: g.attributes.aR2.array, rest: P.array.slice() };
    // knee pad centre (rest): front of the knee at the calf joint
    let kz = 0.08;
    for (let i = 0; i < n; i++) { const x = Math.abs(P.getX(i)), y = P.getY(i); if (Math.abs(x - 0.132) < 0.022 && Math.abs(y - 0.48) < 0.02 && gLegJ(i) > 0.5) kz = Math.max(kz, P.getZ(i)); }
    G.knee = new THREE.Vector4(0.132, 0.48, kz - 0.01, 0);
    // skull centre: between the ears, a little above the eyes
    let zl = 9, zh = -9, ey = 1.5;
    if (eyeInfo) ey = (eyeInfo.l.y + eyeInfo.r.y) / 2;
    for (let i = 0; i < n; i++) { if (G.R1[i * 4] < 0.5) continue; const y = P.getY(i); if (Math.abs(y - (ey + 0.03)) < 0.01) { zl = Math.min(zl, P.getZ(i)); zh = Math.max(zh, P.getZ(i)); } }
    G.headC = zl < 9 ? new THREE.Vector3(eyeInfo ? (eyeInfo.l.x + eyeInfo.r.x) / 2 : 0, ey + 0.02, (zl + zh) / 2) : null;
  }
  // current (morphed) rest-space positions: raw skin and the smoothed fabric base
  function garCurrent() {
    const g = body.geometry, n = G.n, cur = G.rest.slice(), curS = new Float32Array(n * 3), inf = body.morphTargetInfluences || [], MP = g.morphAttributes.position || [];
    for (let k = 0; k < MP.length; k++) {
      const f = inf[k]; if (!f) continue; const d = MP[k].array;
      for (let j = 0; j < n * 3; j++) cur[j] += d[j] * f;
    }
    // Taubin-smooth the welded current surface (no shrinking): irons out navel, ribs and nipples under fabric
    const nw = G.nw, adj = G.adj; let a = new Float32Array(nw * 3), b = new Float32Array(nw * 3);
    for (let i = 0; i < n; i++) { const w = G.wid[i] * 3; a[w] = cur[i * 3]; a[w + 1] = cur[i * 3 + 1]; a[w + 2] = cur[i * 3 + 2]; }
    for (let it = 0; it < 16; it++) for (const lam of [0.55, -0.58]) {
      for (let w = 0; w < nw; w++) {
        const ns = adj[w], w3 = w * 3; if (!ns.length) { b[w3] = a[w3]; b[w3 + 1] = a[w3 + 1]; b[w3 + 2] = a[w3 + 2]; continue; }
        let x = 0, y = 0, z = 0; for (let q = 0; q < ns.length; q++) { const o = ns[q] * 3; x += a[o]; y += a[o + 1]; z += a[o + 2]; }
        const m = 1 / ns.length; b[w3] = a[w3] + lam * (x * m - a[w3]); b[w3 + 1] = a[w3 + 1] + lam * (y * m - a[w3 + 1]); b[w3 + 2] = a[w3 + 2] + lam * (z * m - a[w3 + 2]);
      }
      const t = a; a = b; b = t;
    }
    // bust: spatial low-pass (topology-free, the nipples are separate patches in the mesh), then put back the lost volume
    if (!G.chest) {
      const ws = new Set(); for (let i = 0; i < n; i++) { const y = G.rest[i * 3 + 1]; if (y > 1.05 && y < 1.28 && G.rest[i * 3 + 2] > 0.03 && gArmJ(i) < 0.3 && G.R1[i * 4] < 0.3) ws.add(G.wid[i]); }
      G.chest = Int32Array.from(ws); G.chestM = new Uint8Array(nw); for (const w of G.chest) G.chestM[w] = 1;
    }
    {
      const C = G.chest, R = 0.022, R2 = R * R, src = new Float32Array(C.length * 3);
      C.forEach((w, k) => { src[k * 3] = a[w * 3]; src[k * 3 + 1] = a[w * 3 + 1]; src[k * 3 + 2] = a[w * 3 + 2]; });
      for (let pass = 0; pass < 2; pass++) {
        const out = new Float32Array(src.length);
        for (let k = 0; k < C.length; k++) {
          const x = src[k * 3], y = src[k * 3 + 1], z = src[k * 3 + 2]; let sx = 0, sy = 0, sz = 0, sw = 0;
          for (let j = 0; j < C.length; j++) { const dx = src[j * 3] - x, dy = src[j * 3 + 1] - y, dz = src[j * 3 + 2] - z, d2 = dx * dx + dy * dy + dz * dz; if (d2 > R2) continue; const wgt = 1 - d2 / R2; sx += src[j * 3] * wgt; sy += src[j * 3 + 1] * wgt; sz += src[j * 3 + 2] * wgt; sw += wgt; }
          out[k * 3] = sx / sw; out[k * 3 + 1] = sy / sw; out[k * 3 + 2] = sz / sw;
        }
        src.set(out);
      }
      // blend in from the edge of the region and push back out ~2 mm (what the low-pass shaved off the curve)
      C.forEach((w, k) => {
        const y = a[w * 3 + 1], f = Math.min(1, (y - 1.05) / 0.03, (1.28 - y) / 0.03), n3 = G.wn, nx = n3[w * 3], ny = n3[w * 3 + 1], nz = n3[w * 3 + 2];
        for (let c = 0; c < 3; c++) a[w * 3 + c] += f * (src[k * 3 + c] + [nx, ny, nz][c] * 0.002 - a[w * 3 + c]);
      });
    }
    for (let i = 0; i < n; i++) { const w = G.wid[i] * 3; curS[i * 3] = a[w]; curS[i * 3 + 1] = a[w + 1]; curS[i * 3 + 2] = a[w + 2]; }
    return { cur, curS };
  }
  // JS mirrors of the GLSL masks (per vertex) to pick which triangles a shell needs
  const gArmJ = (i) => G.R1[i * 4 + 1] + G.R1[i * 4 + 2] + G.R1[i * 4 + 3], gLegJ = (i) => G.R2[i * 4] + G.R2[i * 4 + 1] + G.R2[i * 4 + 2];
  const sstep = (e0, e1, x) => { const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
  function topJ(i) {
    const A = U.uTopA.value, B2 = U.uTopB.value, x = G.rest[i * 3], y = G.rest[i * 3 + 1], z = G.rest[i * 3 + 2], ax = Math.abs(x);
    if (B2.x < 0.5 || G.R1[i * 4] > 0.5 || gLegJ(i) > 0.5) return false;
    if (gArmJ(i) > 0.5) return A.y < 0.5 ? false : A.y < 1.5 ? ax <= 0.212 : G.R1[i * 4 + 3] <= 0.42;
    if (y < A.x) return false;
    const fr = sstep(-0.015, 0.03, z); let ny;
    if (A.z > 1.5) ny = 1.405 - 0.01 * fr;
    else if (A.z > 0.5) { ny = (1.33 - 0.03 * (1 - sstep(0, 0.06, ax))) * (1 - fr) + (1.345 - 0.105 * (1 - sstep(0.02, 0.075, ax))) * fr; if (ax > B2.y + 0.11 * sstep(1.285, 1.15, y)) return false; }
    else ny = 1.352 - 0.016 * fr;
    if (y > ny) return false;
    if (A.w > 0 && z > 0.02 && ax < A.w * (0.3 + 0.9 * sstep(1.05, 1.34, y))) return false;
    return true;
  }
  function botJ(i) {
    const A = U.uBotA.value, x = G.rest[i * 3], y = G.rest[i * 3 + 1], z = G.rest[i * 3 + 2], ax = Math.abs(x);
    if (A.x < 0.5 || G.R1[i * 4] > 0.5 || gArmJ(i) > 0.5 || G.R2[i * 4 + 2] > 0.5) return false;
    if (A.x < 1.5) { const fr = sstep(-0.015, 0.03, z), ny = (1.322 - 0.035 * (1 - sstep(0, 0.06, ax))) * (1 - fr) + (1.335 - 0.115 * (1 - sstep(0.02, 0.08, ax))) * fr; if (y > ny || ax > U.uTopB.value.y - 0.006 + 0.11 * sstep(1.285, 1.15, y)) return false; const cut = 0.752 + (0.9 - 0.752) * sstep(0.028, 0.16, ax); return y >= cut && gLegJ(i) <= 0.9; }
    if (y > A.y - A.w * sstep(-0.02, 0.07, z)) return false;
    if (gLegJ(i) > 0.5 && y < A.z) return false;
    return true;
  }
  function padJ(i) {
    const B2 = U.uGearB.value, x = G.rest[i * 3], y = G.rest[i * 3 + 1], z = G.rest[i * 3 + 2];
    if (U.uGearA.value.y < 0.5 || gLegJ(i) < 0.5) return false;
    return Math.hypot((Math.abs(x) - B2.x) / 0.05, (y - B2.y) / 0.066) <= 1 && z >= B2.z - 0.035;
  }
  const gloveJ = (i) => U.uGearA.value.x > 0.5 && G.R1[i * 4 + 3] >= 0.5;
  function bandJ(i, bd) {
    const x = G.rest[i * 3], y = G.rest[i * 3 + 1];
    if (y < bd.x || y > bd.y || gArmJ(i) > 0.5 || G.R1[i * 4] > 0.5) return false;
    if (bd.z && x * bd.z < 0) return false;
    if (bd.w > 1.5) return Math.abs(x) > 0.07 && gLegJ(i) < 0.5;
    if (bd.w > 0.5) return gLegJ(i) > 0.5;
    return gLegJ(i) < 0.5;
  }
  const SHELL_GLSL_V = "attribute vec3 aRest;\nattribute vec4 aR1;\nattribute vec4 aR2;\nvarying vec3 vRest;\nvarying vec4 vR1;\nvarying vec4 vR2;\nvarying vec2 vGUv;";
  const shellMats = {};   // reused across rebuilds so slider drags don't recompile shaders
  function shellMat(o) {
    const key = o.name + "|" + o.which;
    let m = shellMats[key];
    if (m) {
      const SU = m.userData.SU; SU.uWhich.value = o.which; SU.uBand.value = o.band || new THREE.Vector4(); SU.uShellCol.value = o.col; SU.uKnit.value = o.knit || 0; SU.uQuilt.value = o.quilt || 0;
      m.roughness = o.rough ?? 0.85; m.sheen = o.sheen ?? 0.6;
      const cc = o.clearcoat ?? 0; if ((cc > 0) !== (m.clearcoat > 0)) m.needsUpdate = true; m.clearcoat = cc;
      return m;
    }
    m = shellMats[key] = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: o.rough ?? 0.85, metalness: 0, side: THREE.DoubleSide,
      sheen: o.sheen ?? 0.6, sheenRoughness: 0.7, sheenColor: new THREE.Color(o.sheenColor ?? 0x8c8c8c), clearcoat: o.clearcoat ?? 0, clearcoatRoughness: 0.35 });
    m.userData.cloth = true; m.userData.keep = true;
    const SU = m.userData.SU = { uWhich: { value: o.which }, uBand: { value: o.band || new THREE.Vector4() }, uShellCol: { value: o.col }, uKnit: { value: o.knit || 0 }, uQuilt: { value: o.quilt || 0 } };
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U, SU);
      sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\n" + SHELL_GLSL_V)
        .replace("#include <uv_vertex>", "#include <uv_vertex>\nvRest = aRest; vR1 = aR1; vR2 = aR2; vGUv = uv;");
      sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nvarying vec3 vRest;\nvarying vec2 vGUv;\nuniform sampler2D uCamo;\nuniform float uWhich, uKnit, uQuilt;\nuniform vec4 uBand, uShellCol;\n" + GAR_GLSL + `
          float garBand(vec3 p) {
            if (p.y < uBand.x || p.y > uBand.y || gArm() > 0.5 || vR1.x > 0.5) return 0.0;
            if (uBand.z != 0.0 && p.x * uBand.z < 0.0) return 0.0;
            if (uBand.w > 1.5) return step(0.07, abs(p.x)) * step(gLeg(), 0.5);
            if (uBand.w > 0.5) return step(0.5, gLeg());
            return step(gLeg(), 0.5);
          }`)
        .replace("#include <clipping_planes_fragment>", `#include <clipping_planes_fragment>
          float gm = uWhich < 0.5 ? garTop(vRest) : uWhich < 1.5 ? garBot(vRest) : uWhich < 2.5 ? garGlove() : uWhich < 3.5 ? garPad(vRest) : garBand(vRest);
          if (gm < 0.5) discard;`)
        .replace("#include <color_fragment>", `#include <color_fragment>
          vec3 gc = uShellCol.w > 0.5 ? texture2D(uCamo, vGUv * 4.5).rgb : uShellCol.rgb;
          if (uKnit > 0.0) gc *= 1.0 - uKnit * (0.5 + 0.5 * sin(atan(vRest.x, vRest.z + 0.02) * 260.0 + vRest.y * 6.0));
          if (uQuilt > 0.0) gc *= 1.0 - uQuilt * step(gArm(), 0.5) * smoothstep(0.86, 1.0, abs(cos(((vRest.y - 1.0) / 0.058) * 3.14159)));
          if (uWhich < 1.5) {   // hems, cuffs, necklines and waistbands: a darker binding along every edge of the garment
            float edge = 0.0;
            for (int k = 0; k < 4; k++) {
              vec3 o = k == 0 ? vec3(0.0, 0.011, 0.0) : k == 1 ? vec3(0.0, -0.011, 0.0) : k == 2 ? vec3(0.011, 0.0, 0.0) : vec3(-0.011, 0.0, 0.0);
              edge = max(edge, 1.0 - (uWhich < 0.5 ? garTop(vRest + o) : garBot(vRest + o)));
            }
            gc = mix(gc, gc * 0.55 + vec3(0.02), edge * 0.85);
          }
          diffuseColor.rgb = gc;`);
    };
    patchLook(m);
    return m;
  }
  let shells = [];
  function clearShells() { for (const s of shells) { s.parent && s.parent.remove(s); s.geometry.dispose(); } shells = []; }
  function makeShell(o, CS) {
    const g = body.geometry, n = G.n, idx = g.index.array, ok = new Uint8Array(n);
    let any = false; for (let i = 0; i < n; i++) if (o.mask(i)) { ok[i] = 1; any = true; }
    if (!any) return null;
    // grow the selection by one ring so no partly-covered triangle is missing (the shader trims the exact edge)
    const wok = new Uint8Array(G.nw); for (let i = 0; i < n; i++) if (ok[i]) wok[G.wid[i]] = 1;
    const grow = new Uint8Array(G.nw); for (let t = 0; t < idx.length; t += 3) { const a = G.wid[idx[t]], b = G.wid[idx[t + 1]], c = G.wid[idx[t + 2]]; if (wok[a] || wok[b] || wok[c]) grow[a] = grow[b] = grow[c] = 1; }
    const keep = []; for (let t = 0; t < idx.length; t += 3) if (grow[G.wid[idx[t]]] || grow[G.wid[idx[t + 1]]] || grow[G.wid[idx[t + 2]]]) keep.push(idx[t], idx[t + 1], idx[t + 2]);
    const pos = new Float32Array(n * 3), minT = o.min ?? -0.0012;
    for (let i = 0; i < n; i++) {
      const w = G.wid[i] * 3, nx = G.wn[w], ny = G.wn[w + 1], nz = G.wn[w + 2], t = o.thick(i);
      let x = CS.curS[i * 3] + nx * t, y = CS.curS[i * 3 + 1] + ny * t, z = CS.curS[i * 3 + 2] + nz * t;
      const d = (x - CS.cur[i * 3]) * nx + (y - CS.cur[i * 3 + 1]) * ny + (z - CS.cur[i * 3 + 2]) * nz;   // never inside the skin
      if (d < (G.chestM && G.chestM[G.wid[i]] ? Math.min(minT, -0.012) : minT)) { const k = (G.chestM && G.chestM[G.wid[i]] ? Math.min(minT, -0.012) : minT) - d; x += nx * k; y += ny * k; z += nz * k; }
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    for (const k of ["uv", "skinIndex", "skinWeight", "aR1", "aR2"]) geo.setAttribute(k, g.attributes[k].clone());
    geo.setAttribute("aRest", new THREE.BufferAttribute(G.rest.slice(), 3));
    geo.setIndex(keep); geo.computeVertexNormals();
    const NN = geo.attributes.normal, acc = new Float32Array(G.nw * 3);
    for (let i = 0; i < n; i++) { const w = G.wid[i] * 3; acc[w] += NN.getX(i); acc[w + 1] += NN.getY(i); acc[w + 2] += NN.getZ(i); }
    if (G.chest) {   // the flattened nipple patches leave tiny folded triangles: low-pass the normals over the bust
      const C = G.chest, R2 = 0.02 * 0.02, cp = new Float32Array(C.length * 3), cn = new Float32Array(C.length * 3);
      C.forEach((w, k) => { const i = G.repI[w]; cp[k * 3] = pos[i * 3]; cp[k * 3 + 1] = pos[i * 3 + 1]; cp[k * 3 + 2] = pos[i * 3 + 2]; const l = Math.hypot(acc[w * 3], acc[w * 3 + 1], acc[w * 3 + 2]) || 1; cn[k * 3] = acc[w * 3] / l; cn[k * 3 + 1] = acc[w * 3 + 1] / l; cn[k * 3 + 2] = acc[w * 3 + 2] / l; });
      C.forEach((w, k) => {
        let x = 0, y = 0, z = 0;
        for (let j = 0; j < C.length; j++) { const dx = cp[j * 3] - cp[k * 3], dy = cp[j * 3 + 1] - cp[k * 3 + 1], dz = cp[j * 3 + 2] - cp[k * 3 + 2], d2 = dx * dx + dy * dy + dz * dz; if (d2 > R2) continue; const g = 1 - d2 / R2; x += cn[j * 3] * g; y += cn[j * 3 + 1] * g; z += cn[j * 3 + 2] * g; }
        acc[w * 3] = x; acc[w * 3 + 1] = y; acc[w * 3 + 2] = z;
      });
    }
    for (let i = 0; i < n; i++) { const w = G.wid[i] * 3, l = Math.hypot(acc[w], acc[w + 1], acc[w + 2]) || 1; NN.setXYZ(i, acc[w] / l, acc[w + 1] / l, acc[w + 2] / l); }
    const mesh = new THREE.SkinnedMesh(geo, shellMat(o));
    mesh.position.copy(body.position); mesh.quaternion.copy(body.quaternion); mesh.scale.copy(body.scale);
    body.parent.add(mesh); mesh.bind(skel, body.bindMatrix);
    mesh.frustumCulled = false; mesh.castShadow = body.castShadow; mesh.receiveShadow = body.receiveShadow;
    mesh.userData.garment = o.name;
    shells.push(mesh);
    return mesh;
  }
  // rest space -> holder space through one bone's current pose
  function restToHolder(name) {
    const i = skel.bones.findIndex((b) => b.name === name);
    holder.updateMatrixWorld(true);
    return new THREE.Matrix4().copy(holder.matrixWorld).invert().multiply(skel.bones[i].matrixWorld).multiply(skel.boneInverses[i]).multiply(body.bindMatrix);
  }
  function ride(group, bone) { group.matrixAutoUpdate = false; group.matrix.copy(restToHolder(bone)); extras.add(group); return group; }
  // the outermost body point in a box (current shape): which = "front" (max z), "back" (min z), "left"/"right" (x)
  function extent(CS, box, which, legOnly) {
    let best = which === "back" || which === "right" ? 9 : -9, n = G.n;
    for (let i = 0; i < n; i++) {
      const rx = G.rest[i * 3], ry = G.rest[i * 3 + 1];
      if (rx < box[0] || rx > box[1] || ry < box[2] || ry > box[3]) continue;
      if (gArmJ(i) > 0.5 || G.R1[i * 4] > 0.5) continue;
      if (legOnly === true && gLegJ(i) < 0.5) continue;
      if (legOnly === false && gLegJ(i) > 0.5) continue;
      const x = CS.cur[i * 3], z = CS.cur[i * 3 + 2];
      if (which === "front") best = Math.max(best, z); else if (which === "back") best = Math.min(best, z);
      else if (which === "left") best = Math.max(best, x); else best = Math.min(best, x);
    }
    return best;
  }
  function surfLine(CS, box, which, nb = 10, legOnly, maxSlope = 0.6) {
    const ext = new Array(nb).fill(null), side = which === "left" || which === "right", sgn = which === "front" || which === "left" ? 1 : -1;
    for (let i = 0; i < G.n; i++) {
      const rx = G.rest[i * 3], ry = G.rest[i * 3 + 1];
      if (rx < box[0] || rx > box[1] || ry < box[2] || ry > box[3]) continue;
      if (gArmJ(i) > 0.5 || G.R1[i * 4] > 0.5) continue;
      if (legOnly === true && gLegJ(i) < 0.5) continue;
      if (legOnly === false && gLegJ(i) > 0.5) continue;
      const k = Math.min(nb - 1, Math.floor((ry - box[2]) / (box[3] - box[2]) * nb)), v = (side ? CS.cur[i * 3] : CS.cur[i * 3 + 2]) * sgn, y = CS.cur[i * 3 + 1];
      if (!ext[k] || v > ext[k].v) ext[k] = { v, y };
    }
    const pts = ext.filter(Boolean); if (pts.length < 2) return null;
    const my = pts.reduce((a, p) => a + p.y, 0) / pts.length, mv = pts.reduce((a, p) => a + p.v, 0) / pts.length;
    let sxy = 0, sxx = 0; for (const p of pts) { sxy += (p.y - my) * (p.v - mv); sxx += (p.y - my) ** 2; }
    const b = Math.max(-maxSlope, Math.min(maxSlope, sxx > 1e-9 ? sxy / sxx : 0)); let a = mv - b * my;
    for (const p of pts) a = Math.max(a, p.v - b * p.y);   // shifted out so nothing pokes through
    return { at: (y) => sgn * (a + b * y), slope: sgn * b };
  }
  function centreZ(CS, box) {   // average z of leg vertices in a box (thigh centre for straps / pockets)
    let s = 0, c = 0;
    for (let i = 0; i < G.n; i++) { const rx = G.rest[i * 3], ry = G.rest[i * 3 + 1]; if (rx < box[0] || rx > box[1] || ry < box[2] || ry > box[3] || gLegJ(i) < 0.5) continue; s += CS.cur[i * 3 + 2]; c++; }
    return c ? s / c : 0.03;
  }
  // a ring around the neck / chest at back height yb dropping to yf in front, lying on the surface
  function neckRing(CS, yb, yf, off, N = 72, zc = 0.012) {
    const cand = [];
    const y0 = Math.min(yb, yf) - 0.04, y1 = Math.max(yb, yf) + 0.03;
    for (let i = 0; i < G.n; i++) {
      const y = CS.cur[i * 3 + 1]; if (y < y0 || y > y1 || gArmJ(i) > 0.4 || G.R1[i * 4] > 0.5) continue;
      const x = CS.cur[i * 3], z = CS.cur[i * 3 + 2] - zc; cand.push(Math.atan2(x, z), Math.hypot(x, z), y);
    }
    const rs = [], ys = [];
    for (let k = 0; k < N; k++) {
      const th = k / N * Math.PI * 2, y = yb + (yf - yb) * Math.pow(0.5 + 0.5 * Math.cos(th), 2.2);
      let r = 0.05;
      for (let j = 0; j < cand.length; j += 3) {
        let da = Math.abs(cand[j] - (th > Math.PI ? th - Math.PI * 2 : th)); if (da > Math.PI) da = Math.PI * 2 - da;
        if (da < 0.16 && Math.abs(cand[j + 2] - y) < 0.014) r = Math.max(r, cand[j + 1]);
      }
      rs.push(r); ys.push(y);
    }
    for (let p = 0; p < 3; p++) { const c = rs.slice(); for (let k = 0; k < N; k++) rs[k] = Math.max(c[k], (c[(k + N - 1) % N] + c[k] * 2 + c[(k + 1) % N]) / 4); }
    return rs.map((r, k) => { const th = k / N * Math.PI * 2; return v3(Math.sin(th) * (r + off), ys[k], zc + Math.cos(th) * (r + off)); });
  }
  // sweep a circle (or a flat strap) along points
  function sweep(pts, radius, mat, o = {}) {
    const curve = new THREE.CatmullRomCurve3(pts, !!o.closed, "centripetal");
    if (!o.flat) return new THREE.Mesh(new THREE.TubeGeometry(curve, o.seg || pts.length * 4, radius, o.radial || 10, !!o.closed), mat);
    const S = o.seg || 48, wv = o.flat[0], hv = o.flat[1], side = o.side || v3(1, 0, 0), P = [], I = [];
    for (let k = 0; k <= S; k++) {
      const t = k / S, p = curve.getPointAt(t), T = curve.getTangentAt(t), Nn = new THREE.Vector3().crossVectors(T, side).normalize(), Sd = new THREE.Vector3().crossVectors(Nn, T).normalize();
      for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const q = p.clone().addScaledVector(Sd, a * wv / 2).addScaledVector(Nn, b * hv / 2); P.push(q.x, q.y, q.z); }
      if (k) for (let f = 0; f < 4; f++) { const a0 = (k - 1) * 4 + f, a1 = (k - 1) * 4 + (f + 1) % 4, b0 = a0 + 4, b1 = a1 + 4; I.push(a0, a1, b1, a0, b1, b0); }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(P, 3)); g.setIndex(I); g.computeVertexNormals();
    return new THREE.Mesh(g, mat);
  }
  function rbox(w, h, d, r, mat) {   // rounded box (extruded rounded rectangle with a bevel)
    const S = new THREE.Shape(), x = w / 2 - r, y = h / 2 - r;
    S.moveTo(-x, -h / 2); S.lineTo(x, -h / 2); S.quadraticCurveTo(w / 2, -h / 2, w / 2, -y); S.lineTo(w / 2, y); S.quadraticCurveTo(w / 2, h / 2, x, h / 2);
    S.lineTo(-x, h / 2); S.quadraticCurveTo(-w / 2, h / 2, -w / 2, y); S.lineTo(-w / 2, -y); S.quadraticCurveTo(-w / 2, -h / 2, -x, -h / 2);
    const bv = Math.min(r * 0.6, d * 0.3);
    const g = new THREE.ExtrudeGeometry(S, { depth: d - bv * 2, bevelEnabled: true, bevelThickness: bv, bevelSize: bv, bevelSegments: 3, curveSegments: 6 });
    g.translate(0, 0, -(d - bv * 2) / 2);
    return new THREE.Mesh(g, mat);
  }
  function plateShape(w, h) {   // plate with shooter's cuts at the top corners
    const S = new THREE.Shape(), r = 0.012, c = 0.045;
    S.moveTo(-w / 2 + r, -h / 2); S.lineTo(w / 2 - r, -h / 2); S.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
    S.lineTo(w / 2, h / 2 - c); S.quadraticCurveTo(w / 2 - c * 0.2, h / 2 - c * 0.2, w / 2 - c, h / 2); S.lineTo(-w / 2 + c, h / 2);
    S.quadraticCurveTo(-w / 2 + c * 0.2, h / 2 - c * 0.2, -w / 2, h / 2 - c); S.lineTo(-w / 2, -h / 2 + r); S.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
    return S;
  }
  function plateMesh(w, h, d, mat) {
    const bv = 0.008, g = new THREE.ExtrudeGeometry(plateShape(w, h), { depth: d - bv * 2, bevelEnabled: true, bevelThickness: bv, bevelSize: bv * 0.8, bevelSegments: 4, curveSegments: 8 });
    g.translate(0, 0, -(d - bv * 2) / 2); return new THREE.Mesh(g, mat);
  }
  function webbingTex(base) {   // MOLLE webbing rows
    return canvasTex("molle-" + base, 256, 256, (g, w, h) => {
      g.fillStyle = base; g.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 32) { g.fillStyle = "rgba(255,255,255,0.07)"; g.fillRect(0, y + 8, w, 1); g.fillRect(0, y + 24, w, 1); g.fillStyle = "rgba(0,0,0,0.35)"; g.fillRect(0, y + 10, w, 2); g.fillRect(0, y + 22, w, 2); g.fillStyle = "rgba(255,255,255,0.05)"; g.fillRect(0, y + 12, w, 10);
        for (let x = 0; x < w; x += 32) { g.fillStyle = "rgba(0,0,0,0.35)"; g.fillRect(x + 15, y + 10, 2, 14); } }
      for (let i = 0; i < 1600; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? "0,0,0" : "255,255,255"},0.05)`; g.fillRect(Math.random() * w, Math.random() * h, 1, 1); }
    });
  }
  function getEnv() { if (!envTex) envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture; return envTex; }
  function brilliant(r) {   // a round brilliant: crown + pavilion
    const g = new THREE.CylinderGeometry(r * 0.55, r, r * 0.35, 8, 1); g.translate(0, r * 0.175, 0);
    const p = new THREE.ConeGeometry(r, r * 0.85, 8, 1); p.rotateX(Math.PI); p.translate(0, -r * 0.425, 0);
    const m = mergeGeos([g.toNonIndexed(), p.toNonIndexed()]); m.computeVertexNormals(); return m;
  }
  function mergeGeos(list) {
    let n = 0; for (const g of list) n += g.attributes.position.count;
    const P = new Float32Array(n * 3); let o = 0;
    for (const g of list) { P.set(g.attributes.position.array, o); o += g.attributes.position.array.length; }
    const out = new THREE.BufferGeometry(); out.setAttribute("position", new THREE.BufferAttribute(P, 3)); return out;
  }
  function instAlong(geo, mat, frames) {   // instanced copies placed by an array of Matrix4
    const im = new THREE.InstancedMesh(geo, mat, frames.length);
    frames.forEach((m, k) => im.setMatrixAt(k, m)); im.instanceMatrix.needsUpdate = true; return im;
  }
  // frames along a closed ring of points lying on the body: x = tangent, y = outward (from the neck axis), z = cross
  function ringFrames(pts, step, closed = true) {
    const c = new THREE.CatmullRomCurve3(pts, closed, "centripetal"), L = c.getLength(), n = Math.max(4, Math.round(L / step)), out = [];
    for (let k = 0; k < n; k++) {
      const t = k / n, p = c.getPointAt(t), T = c.getTangentAt(t), outw = v3(p.x, 0, p.z - 0.012).normalize();
      const Z = new THREE.Vector3().crossVectors(T, outw).normalize(), Y = new THREE.Vector3().crossVectors(Z, T).normalize();
      out.push({ p, m: new THREE.Matrix4().makeBasis(T, Y, Z).setPosition(p), T, Y, Z });
    }
    return out;
  }
  const TOPS = {
    puffer: { hem: 1.075, sleeves: 2, neck: 2, open: 0, col: "camo", thick: 0.018, rough: 0.5, clearcoat: 0.3, sheen: 0.25, quilt: 0.22, zip: true },
    crop:   { hem: 1.065, sleeves: 0, neck: 0, open: 0, col: "camo", thick: 0.0028, rough: 0.82, sheen: 0.5 },
    jacket: { hem: 1.055, sleeves: 2, neck: 2, open: 0, col: "camo", thick: 0.0065, rough: 0.92, sheen: 0.4, zip: true, pockets: true },
    hoodie: { hem: 1.06, sleeves: 2, neck: 0, open: 0, col: "camo", thick: 0.0078, rough: 0.97, sheen: 0.9 },
    tank:   { hem: 0.935, sleeves: 0, neck: 1, open: 0, col: "camo", thick: 0.0024, rough: 0.8, sheen: 0.5, knit: 0.06, strap: 0.096 }
  };
  const BOTS = {
    bodysuit: { kind: 1, waist: 0, hem: 0, dip: 0, col: "camo", thick: 0.0014, rough: 0.6, sheen: 0.6 },
    shorts:   { kind: 2, waist: 0.985, hem: 0.66, dip: 0.012, col: "camo", thick: 0.0045, flare: 0.006, rough: 0.7, sheen: 0.5 },
    cargo:    { kind: 2, waist: 0.955, hem: 0.668, dip: 0, col: "camo", thick: 0.0085, flare: 0.007, pockets: 0.722, belt: true, rough: 0.95 },
    leggings: { kind: 2, waist: 0.99, hem: 0, dip: 0.012, col: "camo", thick: 0.0019, rough: 0.7, sheen: 0.5 },
    pants:    { kind: 2, waist: 0.935, hem: 0, dip: 0, col: "camo", thick: 0.0095, loose: 0.005, pockets: 0.6, belt: true, rough: 0.95 }
  };
  const GEAR_BLACK = "#26272b";
  const domeCache = {};
  let headMesh = null;
  function headRay() {
    if (!G) return null;
    if (!headMesh) {   // the skull: body triangles owned by the head bone, in rest space
      const idx = body.geometry.index.array, keep = [];
      for (let t = 0; t < idx.length; t += 3) if (G.R1[idx[t] * 4] > 0.5 && G.R1[idx[t + 1] * 4] > 0.5 && G.R1[idx[t + 2] * 4] > 0.5) keep.push(idx[t], idx[t + 1], idx[t + 2]);
      const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(G.rest, 3)); g.setIndex(keep); g.computeBoundingSphere();
      headMesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })); headMesh.updateMatrixWorld(true);
    }
    const mesh = headMesh;
    const rc = new THREE.Raycaster();
    return (C, dir) => { rc.set(C.clone().addScaledVector(dir, 0.35), dir.clone().negate()); const h = rc.intersectObject(mesh, false)[0]; return h ? h.point : null; };
  }
  // a fitted dome over the head (beanie / cap crown): rest-space rows from the crown down to a rim line
  function headDome(kind, yFront, yBack, off, fold) {
    const key = kind + yFront.toFixed(3) + yBack.toFixed(3) + off;
    if (domeCache[key]) return domeCache[key];
    const ray = headRay(); if (!ray || !G.headC) return null;
    const C = G.headC.clone(), cols = 36, rows = 14, P = [], UV = [], I = [];
    const dirOf = (th, ph) => v3(Math.sin(th) * Math.sin(ph), Math.cos(th), Math.sin(th) * Math.cos(ph));
    const hit = (th, ph) => ray(C, dirOf(th, ph));
    for (let c = 0; c <= cols; c++) {
      const ph = c / cols * Math.PI * 2, yr = yFront + (yBack - yFront) * (1 - Math.cos(ph)) / 2;
      let lo = 0, hi = 0.1, h;
      while (hi < 2.4) { h = hit(hi, ph); if (!h || h.y < yr) break; lo = hi; hi += 0.09; }
      for (let b = 0; b < 7; b++) { const m = (lo + hi) / 2; h = hit(m, ph); if (h && h.y >= yr) lo = m; else hi = m; }
      for (let r = 0; r <= rows; r++) {
        const t = r / rows, th = Math.max(0.001, lo * t), d = dirOf(th, ph), p = hit(th, ph) || C.clone().addScaledVector(d, 0.1);
        const o = off + (fold && t > 1 - fold ? 0.005 : 0);
        p.addScaledVector(d, o); P.push(p.x, p.y, p.z); UV.push(c / cols, t);
      }
    }
    for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) { const a = c * (rows + 1) + r, b = a + rows + 1; I.push(a, b, a + 1, a + 1, b, b + 1); }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(P, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(UV, 2)); g.setIndex(I); g.computeVertexNormals();
    const rim = []; for (let c = 0; c <= cols; c++) { const k = (c * (rows + 1) + rows) * 3; rim.push(v3(P[k], P[k + 1], P[k + 2])); }
    return (domeCache[key] = { g, rim, cols, C });
  }
  function headArc(off, tilt = 0, a0 = -1.42, a1 = 1.42, n = 40) {   // ear-to-ear arc over the crown
    const ray = headRay(); if (!ray || !G.headC) return null;
    const C = G.headC, pts = [];
    for (let k = 0; k <= n; k++) { const a = a0 + (a1 - a0) * k / n, d = v3(Math.sin(a), Math.cos(a) * Math.cos(tilt), Math.cos(a) * Math.sin(tilt)).normalize(), h = ray(C, d); if (h) pts.push(h.addScaledVector(d, off)); }
    return pts;
  }
  function knitTex() {
    return canvasTex("knit", 256, 64, (g, w, h) => { g.fillStyle = "#fff"; g.fillRect(0, 0, w, h); for (let x = 0; x < w; x += 8) { g.fillStyle = "rgba(0,0,0,0.22)"; g.fillRect(x, 0, 3, h); g.fillStyle = "rgba(255,255,255,0.4)"; g.fillRect(x + 4, 0, 2, h); } });
  }
  function seamTex() {
    return canvasTex("capseams", 512, 64, (g, w, h) => { g.fillStyle = "#fff"; g.fillRect(0, 0, w, h); for (let k = 0; k < 6; k++) { const x = (k + 0.5) / 6 * w; g.fillStyle = "rgba(0,0,0,0.28)"; g.fillRect(x - 1.5, 0, 3, h); g.fillStyle = "rgba(0,0,0,0.12)"; g.fillRect(x - 6, 0, 1, h); g.fillRect(x + 5, 0, 1, h); } });
  }
  function hoodHair(pts, rad) {   // tell the hair shader where the hood lies: neck centre z, height, roll radius, ring half-sizes
    let zb = 0, yb = 0, xw = 0, czs = 0;
    for (const p of pts) { if (p.z < zb) { zb = p.z; yb = p.y; } if (Math.abs(p.x) > xw) { xw = Math.abs(p.x); czs = p.z; } }
    HAIRU.uHood.value.set(czs, yb, rad, 1); HAIRU.uHoodE.value.set(xw, Math.max(0.03, czs - zb));
  }
  function fuzzyRing(pts, rad, mat, closed = true, rough = 0.18) {   // fur hood / bunched hood: a tube with varying radius and a lumpy surface
    const curve = new THREE.CatmullRomCurve3(pts, closed, "centripetal"), TS = pts.length * 3, RS = 14;
    const g = new THREE.TubeGeometry(curve, TS, 1, RS, closed), P = g.attributes.position, rr = rnd(77);
    for (let i = 0; i <= TS; i++) {
      const t = i / TS, c = curve.getPointAt(Math.min(t, 1)), r = rad(t);
      for (let j = 0; j <= RS; j++) { const k = i * (RS + 1) + j, v = v3(P.getX(k), P.getY(k), P.getZ(k)).sub(c); v.multiplyScalar(r * (1 + rough * (rr() - 0.5))); P.setXYZ(k, c.x + v.x, c.y + v.y, c.z + v.z); }
    }
    g.computeVertexNormals(); return new THREE.Mesh(g, mat);
  }

  let garCS = null, garCSKey = "", garShellKey = "";
  let plateF = null, legVerts = null;
  // Sitting / squatting: the thighs come up into the lower edge of a front plate or chest rig. Swing the piece
  // out on its top edge (like a real plate riding up on the lap) just far enough that the thighs clear it.
  function clearThighs(bone, sub, pivot, box, maxDeg = 40) {
    const down = Math.max(...["l", "r"].map((sd) => -bonePos("calf_" + sd).sub(bonePos("thigh_" + sd)).normalize().y));
    if (down > 0.8) return 0;   // standing: thighs hang down
    if (!legVerts) { legVerts = []; for (let i = 0; i < G.n; i += 3) if (gLegJ(i) > 0.5) legVerts.push(i); }
    holder.updateMatrixWorld(true); body.skeleton.update(); sub.updateMatrix();
    const toSub = sub.matrix.clone().invert().multiply(restToHolder(bone).invert()), v = new THREE.Vector3(), q = [];
    for (const i of legVerts) { body.getVertexPosition(i, v); v.applyMatrix4(body.matrixWorld); holder.worldToLocal(v); v.applyMatrix4(toSub);
      if (v.y > box[2] - 0.05 && v.y < box[3] + 0.05 && Math.abs(v.x) < box[1] + 0.05) q.push(v.clone()); }
    if (!q.length) return 0;
    const P = new THREE.Matrix4().makeTranslation(pivot.x, pivot.y, pivot.z), Pi = new THREE.Matrix4().makeTranslation(-pivot.x, -pivot.y, -pivot.z);
    let a = 0;
    for (let deg = 0; deg <= maxDeg; deg += 3) {
      a = deg * Math.PI / 180;
      const inv = P.clone().multiply(new THREE.Matrix4().makeRotationX(a)).multiply(Pi);
      let hit = 0; for (const p0 of q) { const t = p0.clone().applyMatrix4(inv); if (t.x > box[0] && t.x < box[1] && t.y > box[2] && t.y < box[3] && t.z > box[4] && t.z < box[5]) hit++; }
      if (hit < 3) break;
    }
    if (a > 0) { sub.matrixAutoUpdate = false; sub.matrix.multiply(P).multiply(new THREE.Matrix4().makeRotationX(-a)).multiply(Pi); }
    return a;
  }
  function garments(s, one, has, H) {
    plateF = null;
    HAIRU.uPlate.value.set(0, 0, 0, 0); HAIRU.uHood.value.set(0, 0, 0, 0); HAIRU.uEarL.value.set(0, 0, 0, 0); HAIRU.uEarR.value.set(0, 0, 0, 0);
    U.uGarOn.value = 0;
    if (!G) { clearShells(); return; }
    // the shells are skinned, so a new pose doesn't need new ones: rebuild only when the shape or outfit changes
    const infKey = Array.from(body.morphTargetInfluences || [], (v) => v.toFixed(3)).join(",");
    if (infKey !== garCSKey || !garCS) { garCS = garCurrent(); garCSKey = infKey; }
    const CS = garCS;
    const shellKey = infKey + "|" + ["camo", "top", "bottom", "gear", "boots"].map((k) => (s.pick && s.pick[k] || []).join("+")).join("|");
    const reuse = shellKey === garShellKey && shells.length > 0;
    if (!reuse) { clearShells(); garShellKey = shellKey; }
    const mk = (o) => reuse ? null : makeShell(o, CS);
    const camo = one("camo") || "snow", SC = SOLID[camo] || SOLID.snow, CP = CAMO[camo] || CAMO.snow;
    const top = one("top") || "puffer", bottom = one("bottom") || "bodysuit";
    const T = TOPS[top] || TOPS.puffer, Bt = BOTS[bottom] || BOTS.bodysuit;
    const colOf = (k) => k === "camo" ? new THREE.Vector4(1, 1, 1, 1) : (() => { const c = new THREE.Color(k === "main" ? SC[0] : SC[1]); return new THREE.Vector4(c.r, c.g, c.b, 0); })();
    // ---- the painted under-layer and the shells read the same uniforms
    U.uTopA.value.set(T.hem, T.sleeves, T.neck, T.open); U.uTopB.value.set(1, T.strap || 0.096, 0, 0); U.uTopCol.value.copy(colOf(T.col));
    U.uBotA.value.set(Bt.kind, Bt.waist, Bt.hem, Bt.dip); U.uBotCol.value.copy(colOf(Bt.col));
    const sneakers = one("boots") === "sneakers";
    U.uGearA.value.set(has("gear", "gloves") ? 1 : 0, has("gear", "pads") ? 1 : 0, M.cl_boots ? (sneakers || bottom === "leggings" || bottom === "pants" ? 0 : 0.28) : (sneakers ? 0.13 : 0.3), 0);
    U.uGearB.value.copy(G.knee); U.uPadCol.value.set("#1e1f22");
    for (const k of ["cl_leggings", "cl_jeans", "cl_shorts"]) if (M[k]) M[k].visible = false;
    U.uGarOn.value = 1;

    const yOf = (i) => G.rest[i * 3 + 1], axOf = (i) => Math.abs(G.rest[i * 3]);
    const topT = (i) => {
      if (top !== "puffer") return T.thick + (T.neck === 2 && yOf(i) > 1.33 ? 0.003 : 0);
      const y = yOf(i), x = axOf(i);
      if (gArmJ(i) > 0.5) { const d = Math.hypot(x - 0.155, y - 1.263), w = 0.011 + 0.0075 * Math.pow(Math.abs(Math.sin(d / 0.055 * Math.PI)), 0.45); return G.R1[i * 4 + 3] > 0.15 ? w * 0.5 : w; }
      if (y > 1.335) return 0.012;
      return (0.013 + 0.0085 * Math.pow(Math.abs(Math.sin((y - 1.0) / 0.058 * Math.PI)), 0.45)) * (0.55 + 0.45 * sstep(T.hem, T.hem + 0.03, y));
    };
    const botT = (i) => {
      let t = Bt.thick;
      if (gLegJ(i) > 0.5) { const y = yOf(i); if (Bt.flare) t += Bt.flare * sstep(Bt.hem + 0.13, Bt.hem, y); if (Bt.loose) t += Bt.loose * sstep(0.82, 0.55, y) * sstep(0.1, 0.25, y); }
      return t;
    };
    const tc = colOf(T.col), bc = colOf(Bt.col);
    if (Bt.kind) mk({ name: "bottom", which: 1, mask: botJ, thick: botT, col: bc, rough: Bt.rough, sheen: Bt.sheen ?? 0.4 });
    mk({ name: "top", which: 0, mask: topJ, thick: topT, col: tc, rough: T.rough, sheen: T.sheen, clearcoat: T.clearcoat, knit: T.knit, quilt: T.quilt, min: top === "puffer" ? 0.004 : -0.0012 });
    if (U.uGearA.value.x) mk({ name: "gloves", which: 2, mask: gloveJ, thick: () => 0.0016, col: new THREE.Vector4(0.06, 0.06, 0.065, 0), rough: 0.55, sheen: 0.3, min: 0.001 });
    if (U.uGearA.value.y) mk({ name: "pads", which: 3, mask: padJ, col: new THREE.Vector4(...new THREE.Color(U.uPadCol.value).toArray(), 0), rough: 0.5, sheen: 0.2,
      thick: (i) => { const B2 = G.knee, d = Math.hypot((axOf(i) - B2.x) / 0.05, (yOf(i) - B2.y) / 0.066); return (bottom === "pants" || bottom === "leggings" ? botT(i) : 0) + 0.004 + 0.014 * Math.max(0, 1 - d * d); } });
    const band = (name, bd, thick, col, o = {}) => mk(Object.assign({ name, which: 4, band: bd, mask: (i) => bandJ(i, bd), thick, col, rough: 0.6, sheen: 0.2 }, o));
    const leather = new THREE.Vector4(0.07, 0.065, 0.06, 0);
    const mBlack = std({ color: 0x141416, roughness: 0.45, metalness: 0.4 }), metal = new THREE.MeshPhysicalMaterial({ color: 0x9a9da2, metalness: 1, roughness: 0.28, envMap: getEnv(), envMapIntensity: 1.2 });
    const tMax = top === "puffer" ? 0.026 : T.thick + 0.002;

    // ---- belt + buckle
    if (Bt.belt) {
      const y0 = Bt.waist - 0.034, y1 = Bt.waist - 0.004;
      band("belt", new THREE.Vector4(y0, y1, 0, 0), (i) => botT(i) + 0.004, leather, { min: 0.002 });
      const zf = extent(CS, [-0.03, 0.03, y0, y1], "front", false), bk = new THREE.Group();
      const b = rbox(0.052, 0.034, 0.008, 0.005, metal); b.position.set(0, (y0 + y1) / 2, zf + Bt.thick + 0.009); bk.add(b);
      ride(bk, "pelvis");
    }
    // ---- cargo pockets on the outer thighs
    if (Bt.pockets) {
      const cm = std({ color: 0xffffff, roughness: 0.95 }); const ct = camoTex(camo).clone(); ct.wrapS = ct.wrapT = THREE.RepeatWrapping; ct.repeat.set(5, 5); ct.needsUpdate = true; cm.map = ct; cm.userData.cloth = true;
      for (const sd of [1, -1]) {
        const y0 = Bt.pockets, bx = sd > 0 ? [0.05, 0.32, y0 - 0.012, y0 + 0.012] : [-0.32, -0.05, y0 - 0.012, y0 + 0.012];
        const xo = extent(CS, bx, sd > 0 ? "left" : "right", true), zc = centreZ(CS, [bx[0], bx[1], y0 - 0.03, y0 + 0.03]), g = new THREE.Group();
        const px = xo + sd * (Bt.thick + (Bt.flare || Bt.loose || 0) * 0.6 + 0.013);
        const p = rbox(0.13, 0.135, 0.026, 0.01, cm); p.rotation.y = Math.PI / 2; p.position.set(px, y0 - 0.01, zc + 0.008); g.add(p);
        const f = rbox(0.135, 0.04, 0.03, 0.008, cm); f.rotation.y = Math.PI / 2; f.position.set(px + sd * 0.003, y0 + 0.052, zc + 0.008); g.add(f);
        ride(g, sd > 0 ? "thigh_l" : "thigh_r");
      }
    }
    // ---- plate carrier
    if (has("gear", "vest")) {
      const g = new THREE.Group(), base = GEAR_BLACK, wt = webbingTex(base).clone(); wt.wrapS = wt.wrapT = THREE.RepeatWrapping; wt.repeat.set(5, 5); wt.needsUpdate = true;
      const vm = std({ color: 0xffffff, map: wt, roughness: 0.92 }); vm.userData.cloth = true;
      const pm = std({ color: new THREE.Color(base).multiplyScalar(0.92), roughness: 0.92 }); pm.userData.cloth = true;
      const vb = [-0.12, 0.12, 1.03, 1.29], LF = surfLine(CS, vb, "front", 10, false, 0.12), LB = surfLine(CS, [-0.12, 0.12, 1.1, 1.29], "back", 8, false, 0.35);   // upper back only: the glute shelf must not push the plate out
      const zf0 = extent(CS, vb, "front", false), zb0 = extent(CS, vb, "back", false);
      const zfAt = (y) => (LF ? LF.at(y) : zf0) + tMax, zbAt = (y) => (LB ? LB.at(y) : zb0) - tMax, zf = zfAt(1.165), zb = zbAt(1.17);
      const FG = new THREE.Group(); FG.position.set(0, 1.165, zf); FG.rotation.x = Math.atan(LF ? LF.slope : 0); g.add(FG);
      plateF = { zf, slope: LF ? LF.slope : 0 };   // necklaces lie over the front plate
      const BG = new THREE.Group(); BG.position.set(0, 1.17, zb); BG.rotation.x = Math.atan(LB ? LB.slope : 0); g.add(BG);
      const fp = plateMesh(0.27, 0.3, 0.045, vm); fp.position.set(0, 0, 0.024); FG.add(fp);
      const bp = plateMesh(0.28, 0.31, 0.04, vm); bp.position.set(0, 0, -0.022); BG.add(bp);
      HAIRU.uPlate.value.set(zb - 0.048, 1.17 + 0.155, 1.17 - 0.155, 1); HAIRU.uPlateS.value = LB ? LB.slope : 0;
      for (const x of [-0.072, 0, 0.072]) {
        const p = rbox(0.064, 0.1, 0.036, 0.009, pm); p.position.set(x, -0.095, 0.064); FG.add(p);
        const f = rbox(0.066, 0.032, 0.04, 0.008, pm); f.position.set(x, -0.043, 0.065); FG.add(f);
      }
      const ad = rbox(0.15, 0.07, 0.022, 0.01, pm); ad.position.set(0, 0.05, 0.058); FG.add(ad);
      for (const sd of [-1, 1]) for (const yy of [-0.08, 0.04]) { const lp = rbox(0.012, 0.03, 0.02, 0.004, pm); lp.position.set(sd * 0.13, yy, 0.022); FG.add(lp); }   // side loops
      for (const sd of [-1, 1]) {
        let ys = 0, zs = 0, c = 0;
        for (let i = 0; i < G.n; i++) { const x = G.rest[i * 3]; if (Math.abs(x - sd * 0.1) > 0.012 || gArmJ(i) > 0.5 || G.R1[i * 4] > 0.5 || G.rest[i * 3 + 1] < 1.2) continue; if (CS.cur[i * 3 + 1] > ys) { ys = CS.cur[i * 3 + 1]; zs = CS.cur[i * 3 + 2]; } c++; }
        if (!c) continue;
        const st = sweep([v3(sd * 0.098, 1.3, zfAt(1.3) + 0.006), v3(sd * 0.1, ys + tMax * 0.7 + 0.004, zs + 0.03), v3(sd * 0.1, ys + tMax * 0.7 + 0.006, zs - 0.03), v3(sd * 0.098, 1.31, zbAt(1.31) - 0.006)], 0, vm, { flat: [0.048, 0.014], side: v3(1, 0, 0), seg: 40 });
        g.add(st);
      }
      band("cummerbund", new THREE.Vector4(1.03, 1.13, 0, 2), (i) => (topJ(i) ? topT(i) : 0) + 0.014, new THREE.Vector4(...new THREE.Color(base).toArray(), 0), { rough: 0.92, min: 0.004 });
      clearThighs("spine_03", FG, v3(0, 0.15, 0), [-0.14, 0.14, -0.155, 0.02, -0.005, 0.095]);
      ride(g, "spine_03");
    }
    // ---- chest rig
    if (has("gear", "chest")) {
      const g = new THREE.Group(), base = GEAR_BLACK, wt = webbingTex(base).clone(); wt.wrapS = wt.wrapT = THREE.RepeatWrapping; wt.repeat.set(5, 5); wt.needsUpdate = true;
      const vm = std({ color: 0xffffff, map: wt, roughness: 0.92 }); vm.userData.cloth = true;
      const pm = std({ color: new THREE.Color(base).multiplyScalar(0.9), roughness: 0.92 }); pm.userData.cloth = true;
      const cb = [-0.13, 0.13, 0.93, 1.0], LC = surfLine(CS, cb, "front", 5, false, 0.2), cAdd = (T.hem < 0.96 ? (top === "puffer" ? tMax : T.thick) : (Bt.thick || 0.004)) + 0.002;
      const zf = (LC ? LC.at(0.985) : extent(CS, cb, "front", false)) + cAdd, zb = extent(CS, [-0.1, 0.1, 1.0, 1.2], "back", false) - (T.hem < 1.0 ? T.thick : tMax);
      const RG = new THREE.Group(); RG.position.set(0, 0.985, zf); RG.rotation.x = Math.atan(LC ? LC.slope : 0); g.add(RG);
      const pn = rbox(0.27, 0.11, 0.014, 0.012, vm); pn.position.set(0, 0.02, 0.008); RG.add(pn);
      for (const x of [-0.096, -0.032, 0.032, 0.096]) {
        const p = rbox(0.056, 0.115, 0.036, 0.009, pm); p.position.set(x, 0, 0.032); RG.add(p);
        const f = rbox(0.058, 0.03, 0.04, 0.008, pm); f.position.set(x, 0.055, 0.033); RG.add(f);
      }
      for (const sd of [-1, 1]) {
        const fz = extent(CS, [sd * 0.13 - 0.014, sd * 0.13 + 0.014, 1.17, 1.21], "front", false) + tMax;
        let ys = 0, zs = 0;
        for (let i = 0; i < G.n; i++) { const x = G.rest[i * 3]; if (Math.abs(x - sd * 0.095) > 0.012 || gArmJ(i) > 0.5 || G.R1[i * 4] > 0.5 || G.rest[i * 3 + 1] < 1.2) continue; if (CS.cur[i * 3 + 1] > ys) { ys = CS.cur[i * 3 + 1]; zs = CS.cur[i * 3 + 2]; } }
        g.add(sweep([v3(sd * 0.11, 1.075, zf + 0.012), v3(sd * 0.135, 1.19, fz + 0.006), v3(sd * 0.1, ys + tMax * 0.7 + 0.005, zs + 0.02), v3(sd * 0.085, ys + tMax * 0.7 + 0.004, zs - 0.035),
          v3(sd * 0.04, 1.17, zb - 0.008), v3(-sd * 0.06, 1.04, zb - 0.006)], 0, vm, { flat: [0.032, 0.008], side: v3(1, 0, 0), seg: 56 }));
      }
      clearThighs("spine_02", RG, v3(0, 0.075, 0), [-0.135, 0.135, -0.065, 0.075, -0.005, 0.06]);
      ride(g, "spine_02");
    }
    // ---- drop-leg holster on the right thigh (right = -x)
    if (has("gear", "holster") || (curPistol && curHold === "sling")) {
      const y0 = 0.69, bx = [-0.32, -0.04, y0 - 0.012, y0 + 0.012], legT = (bottom === "pants" || bottom === "leggings") ? Bt.thick + (Bt.loose || 0) * 0.5 : (bottom === "cargo" || bottom === "shorts") && y0 > Bt.hem ? Bt.thick + (Bt.flare || 0) * 0.5 : 0;
      const LT = surfLine(CS, [-0.32, -0.04, y0 - 0.12, y0 + 0.12], "right", 8, true);
      const xo = (LT ? LT.at(y0) : extent(CS, bx, "right", true)) - legT, zc = centreZ(CS, [-0.32, -0.04, y0 - 0.03, y0 + 0.03]), g = new THREE.Group();
      const HG = new THREE.Group(); HG.position.set(xo, y0, zc); HG.rotation.z = -Math.atan(LT ? LT.slope : 0); g.add(HG);
      const pl = rbox(0.085, 0.2, 0.012, 0.012, mBlack); pl.rotation.y = Math.PI / 2; pl.position.set(-0.011, 0, 0); HG.add(pl);
      const hb = rbox(0.064, 0.17, 0.036, 0.014, mBlack); hb.rotation.y = Math.PI / 2; hb.position.set(-0.034, -0.012, 0.006); HG.add(hb);
      const hood = rbox(0.07, 0.022, 0.04, 0.008, mBlack); hood.rotation.y = Math.PI / 2; hood.position.set(-0.034, 0.08, 0.0); HG.add(hood);   // retention hood over the slide
      if (curPistol && curHold === "sling") {   // the real pistol goes in: muzzle down, slide facing forward
        HG.updateMatrix(); g.updateMatrix();
        holsterM = restToHolder("thigh_r").clone().multiply(HG.matrix).multiply(new THREE.Matrix4().makeTranslation(-0.036, 0.085, -0.004));
      } else {
        const gr = rbox(0.032, 0.08, 0.026, 0.008, std({ color: 0x1b1c1f, roughness: 0.6 })); gr.rotation.set(0, Math.PI / 2, -0.12); gr.position.set(-0.036, 0.11, -0.012); HG.add(gr);
        const sl = rbox(0.12, 0.028, 0.024, 0.005, std({ color: 0x232428, roughness: 0.35, metalness: 0.5 })); sl.rotation.y = Math.PI / 2; sl.position.set(-0.036, 0.07, 0.02); HG.add(sl);
      }
      ride(g, "thigh_r");
      for (const [a, b2] of [[0.6, 0.628], [0.735, 0.763]]) band("strap" + a, new THREE.Vector4(a, b2, -1, 1), (i) => botT(i) * (botJ(i) ? 1 : 0) + 0.0042, new THREE.Vector4(0.05, 0.05, 0.055, 0), { min: 0.002 });
    }
    // ---- puffer fur hood / hoodie hood + drawstrings
    // zipper up the front of a zipped top, following the top's own (smoothed) surface on the centre line
    const topShell = shells.find((m) => m.userData.garment === "top");
    if (T.zip && topShell) {
      const P = topShell.geometry.attributes.position, AR = topShell.geometry.attributes.aRest, bins = {};
      for (let i = 0; i < P.count; i++) {
        if (Math.abs(AR.getX(i)) > 0.009 || AR.getZ(i) < 0.02 || !topJ(i)) continue;
        const y = AR.getY(i), b = Math.round(y / 0.016); if (!bins[b] || P.getZ(i) > bins[b].z) bins[b] = { i, x: 0, y: P.getY(i), z: P.getZ(i) };
      }
      holder.updateMatrixWorld(true); topShell.updateMatrixWorld(true); if (topShell.skeleton) topShell.skeleton.update();
      const qs = new THREE.Quaternion(); restToHolder("spine_02").decompose(new THREE.Vector3(), qs, new THREE.Vector3());
      const outN = v3(0, 0, 1).applyQuaternion(qs), sideN = v3(1, 0, 0).applyQuaternion(qs);
      const pts = Object.keys(bins).map(Number).sort((a, b) => a - b).map((b) => { const v = new THREE.Vector3(); topShell.getVertexPosition(bins[b].i, v); v.applyMatrix4(topShell.matrixWorld); holder.worldToLocal(v); return v.addScaledVector(outN, 0.0018); });
      if (pts.length > 3) {
        const zm = new THREE.MeshStandardMaterial({ color: 0x1a1a1c, roughness: 0.35, metalness: 0.6 }), g = new THREE.Group();
        g.add(sweep(pts, 0, zm, { flat: [0.0075, 0.0022], side: sideN, seg: pts.length * 6 }));
        const pull = rbox(0.008, 0.02, 0.003, 0.002, new THREE.MeshStandardMaterial({ color: 0x9a9da2, roughness: 0.25, metalness: 1 }));
        const tp = pts[pts.length - 1], tp2 = pts[Math.max(0, pts.length - 3)]; pull.position.copy(tp).lerp(tp2, 0.6).addScaledVector(outN, 0.003); pull.quaternion.copy(qs); g.add(pull);
        extras.add(g);
      }
    }
    if (top === "puffer") {   // fur-trimmed hood lying back on the shoulders (open at the front)
      const ring = neckRing(CS, 1.37, 1.32, 0.016, 56), N = ring.length;
      const back = ring.filter((p, k) => { const th = k / N * Math.PI * 2; return th > Math.PI * 0.32 && th < Math.PI * 1.68; });
      const fur = new THREE.MeshStandardMaterial({ color: new THREE.Color(camo === "snow" ? "#ece8e1" : "#d8d0c4"), roughness: 1 }); fur.userData.cloth = true;
      const hm = new THREE.MeshPhysicalMaterial({ color: 0xffffff, map: camoTex(camo), roughness: 0.5, clearcoat: 0.3 }); hm.userData.cloth = true;
      const g = new THREE.Group();
      const hood = back.map((p) => { const o = v3(p.x, 0, p.z - 0.012).normalize(); return p.clone().addScaledVector(o, 0.012).add(v3(0, -0.018, -0.008)); });
      g.add(fuzzyRing(hood, (t) => 0.02 + 0.03 * Math.sin(Math.PI * t), hm, false, 0.05));
      g.add(fuzzyRing(back, (t) => 0.012 + 0.016 * Math.sin(Math.PI * t), fur, false, 0.45));
      ride(g, "spine_03"); hoodHair(hood, 0.05);
    } else if (top === "hoodie") {
      const ring = neckRing(CS, 1.37, 1.335, T.thick + 0.004, 48), back = ring.filter((p, k) => { const th = k / 48 * Math.PI * 2; return th > Math.PI * 0.55 && th < Math.PI * 1.45; });
      const hm = std({ color: 0xffffff, map: camoTex(camo), roughness: 0.97 }); hm.userData.cloth = true;
      const g = new THREE.Group(); g.add(fuzzyRing(back, (t) => 0.018 + 0.03 * Math.sin(t * Math.PI), hm, false, 0.08)); hoodHair(back, 0.048);
      const cord = std({ color: 0xf2f2f2, roughness: 0.6 });
      for (const sd of [-1, 1]) {
        const pts = [];
        for (const y of [1.335, 1.3, 1.26, 1.22]) pts.push(v3(sd * 0.032, y, extent(CS, [sd * 0.032 - 0.012, sd * 0.032 + 0.012, y - 0.012, y + 0.012], "front", false) + T.thick + 0.004));
        g.add(sweep(pts, 0.0024, cord, { radial: 6 }));
        const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.0032, 0.0032, 0.014, 8), mBlack); tip.position.copy(pts[pts.length - 1]).add(v3(0, -0.006, 0)); g.add(tip);
      }
      ride(g, "spine_03");
    }

    // ---- necklaces (lie on the skin or over the top's collar; over the front plate of a plate carrier)
    const overPlate = (pts) => {
      if (!plateF) return pts;
      return pts.map((q) => {
        if (q.z < 0 || Math.abs(q.x) > 0.15) return q;
        const top = 1.315, w = q.y < top ? 1 : Math.max(0, 1 - (q.y - top) / 0.035);
        if (w <= 0) return q;
        let zt = plateF.zf + plateF.slope * (Math.min(q.y, top) - 1.165) + 0.05;
        if (Math.abs(q.x) < 0.08 && q.y > 1.175 && q.y < 1.255) zt += 0.022;   // over the admin pouch
        const z = q.z + Math.max(0, zt - q.z) * w;
        return z > q.z ? v3(q.x, q.y, z) : q;
      });
    };
    const jOff = 0.0032 + (T.neck === 1 ? 0 : (top === "puffer" ? 0.012 : T.thick));
    if (has("jewelry", "chain")) {
      const pts = overPlate(neckRing(CS, 1.372, 1.3, jOff + 0.002, 72)), fr = ringFrames(pts, 0.0066);
      const lg = new THREE.TorusGeometry(0.0041, 0.0016, 8, 18); lg.rotateX(Math.PI / 2); lg.scale(1.32, 1, 1);
      const gm = new THREE.MeshPhysicalMaterial({ color: 0xe8c36a, metalness: 1, roughness: 0.14, envMap: getEnv(), envMapIntensity: 1.7, clearcoat: 0.6 });
      const g = new THREE.Group(); g.add(instAlong(lg, gm, fr.map((f, k) => f.m.clone().multiply(new THREE.Matrix4().makeRotationX(k % 2 ? 0.55 : -0.55)))));
      ride(g, "spine_03");
    }
    if (has("jewelry", "tennis")) {
      const pts = overPlate(neckRing(CS, 1.366, 1.312, jOff + 0.0018, 72)), fr = ringFrames(pts, 0.0047);
      const dm = new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0, roughness: 0, ior: 2.4, specularIntensity: 1, clearcoat: 1, envMap: getEnv(), envMapIntensity: 4, emissive: 0x15161a });
      const wg = new THREE.MeshPhysicalMaterial({ color: 0xd9dce0, metalness: 1, roughness: 0.2, envMap: getEnv(), envMapIntensity: 1.4 });
      const cup = new THREE.CylinderGeometry(0.0027, 0.0021, 0.0022, 10);
      const g = new THREE.Group(); g.add(instAlong(brilliant(0.0022), dm, fr.map((f) => f.m.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0.0012, 0)))));
      g.add(instAlong(cup, wg, fr.map((f) => f.m)));
      ride(g, "spine_03");
    }
    if (has("jewelry", "dogtags")) {
      const pts = overPlate(neckRing(CS, 1.374, 1.2, jOff + 0.0045, 80)), fr = ringFrames(pts, 0.0034);
      const sm = new THREE.MeshPhysicalMaterial({ color: 0xc9ccd1, metalness: 1, roughness: 0.25, envMap: getEnv(), envMapIntensity: 1.4 });
      const g = new THREE.Group(); g.add(instAlong(new THREE.SphereGeometry(0.0013, 8, 6), sm, fr.map((f) => f.m)));
      let lo = fr[0]; for (const f of fr) if (f.p.y < lo.p.y) lo = f;
      const n = v3(lo.p.x, 0, lo.p.z - 0.012).normalize(), up = v3(0, 1, 0).addScaledVector(n, -n.y).normalize(), side = new THREE.Vector3().crossVectors(up, n).normalize();
      for (let k = 0; k < 2; k++) {
        const t = rbox(0.029, 0.05, 0.0013, 0.007, sm), m = new THREE.Matrix4().makeBasis(side, up, n);
        t.quaternion.setFromRotationMatrix(m); t.rotateZ(k ? 0.16 : -0.05);
        t.position.copy(lo.p).addScaledVector(up, -0.027 - k * 0.004).addScaledVector(n, 0.004 + k * 0.0016).addScaledVector(side, k * 0.006);
        g.add(t);
      }
      ride(g, "spine_03");
    }

    // ---- head pieces (rest space, carried by the head frame H)
    if (!H || !G.headC) return;
    const HG = new THREE.Group(); HG.position.copy(H.position).negate(); H.add(HG);
    const eyeY = eyeInfo ? eyeInfo.l.y : 1.5;
    const goldP = new THREE.MeshPhysicalMaterial({ color: 0xe8c36a, metalness: 1, roughness: 0.12, envMap: getEnv(), envMapIntensity: 1.8, clearcoat: 0.7 });
    const lobes = faceFit && faceFit.lobe ? faceFit.lobe : null;
    if (lobes && (has("jewelry", "hoops") || has("jewelry", "studs"))) for (let k = 0; k < 2; k++) { const L = lobes[k]; if (L) (L.x > 0 ? HAIRU.uEarL : HAIRU.uEarR).value.set(L.x, L.y, L.z, 1); }
    if (lobes && has("jewelry", "hoops")) for (let k = 0; k < 2; k++) {
      const L = lobes[k], sd = Math.sign(L.x) || 1, h = new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.0022, 12, 56), goldP);
      h.position.set(L.x + sd * 0.004, L.y - 0.02, L.z + 0.002); h.rotation.set(0, Math.PI / 2, sd * 0.08); HG.add(h);
    }
    if (lobes && has("jewelry", "studs")) for (let k = 0; k < 2; k++) {
      const L = lobes[k], sd = Math.sign(L.x) || 1, dm = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0, ior: 2.4, clearcoat: 1, envMap: getEnv(), envMapIntensity: 4, emissive: 0x15161a });
      const st = new THREE.Mesh(brilliant(0.0032), dm); st.position.set(L.x + sd * 0.0035, L.y - 0.001, L.z + 0.001); st.rotation.z = -sd * Math.PI / 2; HG.add(st);
    }
    const hs0 = one("hair") || "straight", hairOff = (hs0 === "pixie" || hs0 === "buzz") ? 0.004 : ["straight", "wave", "curly", "own", "pony", "bob"].includes(hs0) ? 0.017 : 0.008;   // hats sit over long hair, not through it
    if (has("jewelry", "crystalband")) {
      for (const [tl, rs] of [[0.37, 0.0034], [0.47, 0.0034]]) {   // extra rows either side of the main one
        const afroB = hs0 === "afro" && !has("gear", "beanie") && !has("gear", "cap") && one("eyewear") !== "nvg";
        const row = afroB && afroShell ? afroArc(tl, -1.1, 1.1, 30, 0.0) : headArc(hairOff + 0.0045, tl, -1.25, 1.25, 30); if (!row || row.length < 5) continue;
        const c = new THREE.CatmullRomCurve3(row), L = c.getLength(), n = Math.round(L / 0.0072), fr = [];
        for (let k = 0; k <= n; k++) { const p = c.getPointAt(k / n), d = p.clone().sub(G.headC).normalize(), T2 = c.getTangentAt(k / n), Z = new THREE.Vector3().crossVectors(T2, d).normalize(); fr.push(new THREE.Matrix4().makeBasis(T2, d, Z).setPosition(p)); }
        HG.add(instAlong(brilliant(rs), new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0, ior: 2.4, clearcoat: 1, envMap: getEnv(), envMapIntensity: 4.5, emissive: 0x1a1b22 }), fr));
      }
      const afroC = hs0 === "afro" && !has("gear", "beanie") && !has("gear", "cap") && one("eyewear") !== "nvg";
      const band = afroC && afroShell ? afroArc(0.42, -1.15, 1.15, 34, 0.006) : headArc(hairOff + 0.0025, 0.42, -1.3, 1.3, 34);
      if (band && band.length > 4) HG.add(sweep(band, 0, new THREE.MeshPhysicalMaterial({ color: 0x1b1b1e, metalness: 0.4, roughness: 0.4 }), { flat: [0.024, 0.003], side: v3(0, 0, 1), seg: 60 }));
      const pts = afroC && afroShell ? afroArc(0.42, -1.15, 1.15, 34, 0.002) : headArc(hairOff + 0.005, 0.42, -1.3, 1.3, 34);
      if (pts && pts.length > 4) {
        const fr = []; const c = new THREE.CatmullRomCurve3(pts), L = c.getLength(), n = Math.round(L / 0.0095);
        for (let k = 0; k <= n; k++) { const p = c.getPointAt(k / n), d = p.clone().sub(G.headC).normalize(), T2 = c.getTangentAt(k / n), Z = new THREE.Vector3().crossVectors(T2, d).normalize(); fr.push(new THREE.Matrix4().makeBasis(T2, d, Z).setPosition(p)); }
        const dm = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0, ior: 2.4, clearcoat: 1, envMap: getEnv(), envMapIntensity: 4.5, emissive: 0x1a1b22 });
        HG.add(instAlong(brilliant(0.0046), dm, fr));
        HG.add(sweep(pts, 0.0018, new THREE.MeshPhysicalMaterial({ color: 0xdfe2e6, metalness: 1, roughness: 0.2, envMap: getEnv() }), { radial: 6 }));
      }
    }
    if (has("gear", "beanie")) {
      const d = headDome("beanie", eyeY + 0.045, eyeY - 0.012, hairOff + 0.008, 0.26);
      if (d) {
        const kt = knitTex().clone(); kt.wrapS = kt.wrapT = THREE.RepeatWrapping; kt.repeat.set(1, 1); kt.needsUpdate = true;
        const m = new THREE.MeshStandardMaterial({ color: new THREE.Color("#222326"), map: kt, roughness: 1, side: THREE.DoubleSide }); m.userData.cloth = true;
        HG.add(new THREE.Mesh(d.g, m));
        HG.add(sweep(d.rim, 0.004, m, { closed: true, radial: 8 }));
      }
    }
    if (has("gear", "cap")) {
      const d = headDome("cap", eyeY + 0.052, eyeY + 0.008, hairOff + 0.006, 0);
      if (d) {
        const st = seamTex().clone(); st.needsUpdate = true;
        const cc = new THREE.Color("#1c1d20");
        const m = new THREE.MeshStandardMaterial({ color: cc, map: st, roughness: 0.9, side: THREE.DoubleSide }); m.userData.cloth = true;
        HG.add(new THREE.Mesh(d.g, m));
        // brim: from the front rim forward, curved down at the sides
        const P = [], I = [], cols = d.cols, segs = [];
        for (let c = 0; c <= cols; c++) { let ph = c / cols * Math.PI * 2; if (ph > Math.PI) ph -= Math.PI * 2; if (Math.abs(ph) < 1.15) segs.push([ph, d.rim[c]]); }
        segs.sort((a, b) => a[0] - b[0]);
        segs.forEach(([ph, p], k) => {
          const out = v3(Math.sin(ph), 0, Math.cos(ph)), len = 0.072 * Math.pow(Math.cos(ph * 1.25), 0.7);
          const q = p.clone().addScaledVector(out, len).add(v3(0, -0.012 - 0.01 * Math.abs(ph), 0));
          const mid = p.clone().addScaledVector(out, len * 0.5).add(v3(0, -0.003, 0));
          for (const v of [p, mid, q]) P.push(v.x, v.y, v.z);
          for (const v of [p, mid, q]) P.push(v.x, v.y - 0.004, v.z);
          if (k) { const a = (k - 1) * 6, b = k * 6; for (const o of [0, 3]) { I.push(a + o, b + o, a + o + 1, a + o + 1, b + o, b + o + 1, a + o + 1, b + o + 1, a + o + 2, a + o + 2, b + o + 1, b + o + 2); } I.push(a + 2, b + 2, a + 5, a + 5, b + 2, b + 5); }
        });
        const bg = new THREE.BufferGeometry(); bg.setAttribute("position", new THREE.Float32BufferAttribute(P, 3)); bg.setIndex(I); bg.computeVertexNormals();
        const bm = new THREE.MeshStandardMaterial({ color: cc.clone().multiplyScalar(0.92), roughness: 0.85, side: THREE.DoubleSide }); bm.userData.cloth = true;
        HG.add(new THREE.Mesh(bg, bm));
        const top0 = new THREE.Vector3(d.g.attributes.position.getX(0), d.g.attributes.position.getY(0), d.g.attributes.position.getZ(0));
        const btn = new THREE.Mesh(new THREE.SphereGeometry(0.007, 16, 10), bm); btn.scale.set(1, 0.45, 1); btn.position.copy(top0).add(v3(0, 0.002, 0)); HG.add(btn);
      }
    }
    if (has("gear", "headset") && faceFit && faceFit.ear) {
      const afroG = hs0 === "afro" && !has("gear", "beanie") && !has("gear", "cap") && one("eyewear") !== "nvg";
      const arc = afroG && afroShell ? afroArc(-0.12, -1.25, 1.25, 30, 0.014) : headArc(hairOff + (has("gear", "beanie") ? 0.018 : has("gear", "cap") ? 0.014 : 0.006), -0.12, -1.25, 1.25, 30);
      const hm = std({ color: 0x1a1b1e, roughness: 0.55, metalness: 0.2 }), pad = std({ color: 0x2a2c30, roughness: 0.9 }), olive = std({ color: 0x232427, roughness: 0.6 });
      if (arc && arc.length > 4) HG.add(sweep(arc, 0, hm, { flat: [0.026, 0.008], side: v3(0, 0, 1), seg: 48 }));
      for (const E of faceFit.ear) {
        const sd = Math.sign(E.x) || 1, c = E.clone().add(v3(sd * 0.026, 0.004, -0.004));
        const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.04, 0.032, 40), olive); cup.rotation.z = Math.PI / 2; cup.position.copy(c); HG.add(cup);
        const cush = new THREE.Mesh(new THREE.TorusGeometry(0.031, 0.008, 10, 36), pad); cush.rotation.y = Math.PI / 2; cush.position.copy(c).add(v3(-sd * 0.018, 0, 0)); HG.add(cush);
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.008, 28), hm); cap.rotation.z = Math.PI / 2; cap.position.copy(c).add(v3(sd * 0.018, 0, 0)); HG.add(cap);
        if (arc && arc.length) { const end = sd > 0 ? arc[arc.length - 1] : arc[0]; HG.add(sweep([end, end.clone().lerp(c, 0.5).add(v3(sd * 0.012, 0, 0)), c.clone().add(v3(sd * 0.012, 0.03, 0))], 0.006, hm, { radial: 8 })); }
        if (sd < 0) {
          const mo = U.uMouth.value, m0 = c.clone().add(v3(sd * 0.004, -0.012, 0.03));
          HG.add(sweep([m0, m0.clone().add(v3(-sd * 0.012, -0.03, 0.05)), v3(mo.x + sd * 0.03, mo.y - 0.006, mo.z + 0.012)], 0.0028, hm, { radial: 8 }));
          const mic = new THREE.Mesh(new THREE.SphereGeometry(0.0075, 14, 10), std({ color: 0x0c0c0d, roughness: 1 })); mic.position.set(mo.x + sd * 0.028, mo.y - 0.006, mo.z + 0.014); HG.add(mic);
        }
      }
    }
  }

  // ---- short / shaved hairstyles: a dome fitted to the skull with a hair texture, plus mohawk crests, a high-top block or a top knot
  const SHORT_STYLES = { buzz: 1, fade: 1, waves: 1, cornrows: 1, hightop: 1, mohawk_low: 1, mohawk_tall: 1, manbun: 1 };
  function hairTex(kind, col) {
    return canvasTex("hair-" + kind + "-" + col, 256, 256, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      const c = new THREE.Color(col), rgb = (k) => `rgba(${Math.round(c.r * 255 * k)},${Math.round(c.g * 255 * k)},${Math.round(c.b * 255 * k)},`;
      const r = rnd(kind.length * 31 + 7);
      for (let y = 0; y < h; y++) {
        const v = y / h;   // 0 = crown, 1 = hairline
        let a = kind === "buzz" ? 0.8 : kind === "fade" || kind === "hightop" || kind === "mohawk" ? 0.92 * (1 - Math.min(1, Math.max(0, (v - 0.42) / 0.45))) + 0.06 : 0.97;
        if (kind === "mohawk") a = 0.22 * (1 - Math.max(0, (v - 0.6) / 0.4)) + 0.04;   // shaved sides
        a *= 1 - Math.max(0, (v - 0.94) / 0.06);    // soft hairline
        for (let x = 0; x < w; x += 2) {
          let k = 0.75 + r() * 0.5;
          if (kind === "waves") k *= 0.72 + 0.4 * (0.5 + 0.5 * Math.sin(v * 70 + Math.sin(x / w * Math.PI * 2 * 3) * 1.2));
          if (kind === "cornrows") { const s2 = Math.abs(Math.sin(x / w * Math.PI * 22)); k *= s2 < 0.18 ? 0.35 : 0.8 + 0.35 * s2 * (0.6 + 0.4 * Math.abs(Math.sin(v * 60 + x))); }
          g.fillStyle = rgb(Math.min(1.4, k)) + (a * (0.7 + r() * 0.3)).toFixed(3) + ")"; g.fillRect(x, y, 2, 1);
        }
      }
    });
  }
  // coily texture: thousands of tiny curls in lighter / darker shades of the hair colour
  function coilTex(col) {
    const tx = canvasTex("coil-" + col, 512, 512, (g, w, h) => {
      const c = new THREE.Color(col), r = rnd(23), sh = (k, a) => `rgba(${Math.min(255, Math.round((c.r * 255 + 34) * k))},${Math.min(255, Math.round((c.g * 255 + 28) * k))},${Math.min(255, Math.round((c.b * 255 + 24) * k))},${a})`;
      g.fillStyle = sh(0.8, 1); g.fillRect(0, 0, w, h);
      for (let i = 0; i < 9000; i++) { const x = r() * w, y = r() * h, rad = 2 + r() * 4, k = 0.5 + r() * 1.2;
        g.strokeStyle = sh(k, 0.55); g.lineWidth = 1 + r(); g.beginPath(); g.arc(x, y, rad, r() * 6.28, r() * 6.28 + 3.5 + r() * 2); g.stroke(); }
    });
    tx.wrapS = tx.wrapT = THREE.RepeatWrapping; return tx;
  }
  // big round natural afro: a lumpy ellipsoid around the skull with the face left open
  function afroHair(hairM, sc, eyeY, eyeZ, cut) {
    const col = "#" + hairM.color.getHexString(), tx = coilTex(col); tx.repeat.set(8, 6);
    const m = new THREE.MeshStandardMaterial({ color: 0xffffff, map: tx, bumpMap: tx, bumpScale: 3, roughness: 1, side: THREE.DoubleSide });
    const g = new THREE.SphereGeometry(1, 128, 96), P = g.attributes.position, d = new THREE.Vector3(), q = new THREE.Vector3(), r = rnd(5);
    const C = new THREE.Vector3(sc.c.x, sc.c.y + 0.03, sc.c.z - 0.022), Rb = sc.r.x * 1.8, hairY = eyeY + 0.068, faceZ = eyeZ - 0.075;
    const keep = [];
    for (let i = 0; i < P.count; i++) {
      d.fromBufferAttribute(P, i);
      const k = 1 + 0.035 * Math.sin(d.x * 11 + d.y * 7) * Math.cos(d.z * 9) + (r() - 0.5) * 0.02;   // lumpy round silhouette
      q.copy(d).multiplyScalar(Rb * k).add(C);
      // near the face the hair thins down onto the hairline and frames the face
      const ex = q.x / 0.074, ey = (q.y - (eyeY - 0.035)) / (hairY - (eyeY - 0.035));
      const win = ex * ex + ey * ey;                                       // < 1 inside the face oval
      if (q.z > faceZ - 0.03 && win < 2.2) { const t = Math.min(1, (2.2 - win) / 1.2); q.z = THREE.MathUtils.lerp(q.z, Math.min(q.z, faceZ + 0.02), t); }
      keep[i] = !(q.z > faceZ - 0.06 && win < 1) && q.y > eyeY - 0.2;
      if (cut) {
        for (const [tl, dep] of cut.grooves) {   // the band presses the hair down a little
          const n = v3(0, -Math.sin(tl), Math.cos(tl)), rel = q.clone().sub(cut.hc), sd2 = Math.abs(rel.dot(n));
          const w = THREE.MathUtils.smoothstep(0.04, 0.014, sd2) * THREE.MathUtils.smoothstep(cut.hc.y - 0.04, cut.hc.y, q.y), rq = rel.length();
          if (w > 0) q.copy(cut.hc).addScaledVector(rel.normalize(), rq - dep * w);
        }
        for (const E of cut.ears) {   // flattened where the ear cups press against the head
          const sd = Math.sign(E.x) || 1; if (q.x * sd < Math.abs(E.x) - 0.01) continue;
          const dyz = Math.hypot(q.y - E.y, q.z - E.z), w = THREE.MathUtils.smoothstep(0.08, 0.048, dyz);
          if (w > 0) q.x = sd * THREE.MathUtils.lerp(Math.abs(q.x), Math.min(Math.abs(q.x), Math.abs(E.x) + 0.01), w);
        }
      }
      P.setXYZ(i, q.x, q.y, q.z);
    }
    const I = g.index.array, out = [];
    for (let t = 0; t < I.length; t += 3) if (keep[I[t]] && keep[I[t + 1]] && keep[I[t + 2]]) out.push(I[t], I[t + 1], I[t + 2]);
    g.setIndex(out); g.computeVertexNormals();
    const am = new THREE.Mesh(g, m); am.userData.afro = { C: C.clone(), R: Rb }; return am;
  }
  let afroShell = null;
  function afroArc(tilt, a0, a1, n, inset) {   // a band path riding the afro's surface (holder rest space)
    if (!afroShell || !G || !G.headC) return null;
    const O = G.headC, m = O.clone().sub(afroShell.C), pts = [];
    for (let k = 0; k <= n; k++) { const a = a0 + (a1 - a0) * k / n, d = v3(Math.sin(a), Math.cos(a) * Math.cos(tilt), Math.cos(a) * Math.sin(tilt)).normalize(), b = m.dot(d), c = m.dot(m) - afroShell.R ** 2, disc = b * b - c; if (disc > 0) pts.push(O.clone().addScaledVector(d, -b + Math.sqrt(disc) - inset)); }
    return pts;
  }
  // glossy wrapped-hair material: fine lengthwise strand streaks + clearcoat shine
  function sleekHairMat(hairM, rep = 1) {
    const col = "#" + hairM.color.getHexString();
    const tx = canvasTex("sleek-" + col, 64, 256, (g, w, h) => {
      const c = new THREE.Color(col), r = rnd(11);
      for (let x = 0; x < w; x++) { const k = 0.7 + r() * 0.6; g.fillStyle = `rgb(${Math.min(255, Math.round((c.r * 255 + 18) * k))},${Math.min(255, Math.round((c.g * 255 + 16) * k))},${Math.min(255, Math.round((c.b * 255 + 14) * k))})`; g.fillRect(x, 0, 1, h); }
    });
    tx.wrapS = tx.wrapT = THREE.RepeatWrapping; tx.repeat.set(rep, 1);
    return new THREE.MeshPhysicalMaterial({ color: 0xffffff, map: tx, roughness: 0.28, clearcoat: 0.9, clearcoatRoughness: 0.18, sheen: 0.3, sheenColor: new THREE.Color(col).lerp(new THREE.Color(0xffffff), 0.3) });
  }
  function spikeHair(hairM, zc, top) {
    const G = new THREE.Group(), m = sleekHairMat(hairM, 3);
    const bc = new THREE.Vector3(0, top - 0.13, zc - 0.07);                       // bun on the back of the head, a little below the crown
    const bun = new THREE.Mesh(new THREE.SphereGeometry(0.05, 40, 28), m); bun.position.copy(bc); bun.scale.set(1.1, 1, 0.85); G.add(bun);
    const wrap = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.012, 14, 40), m); wrap.position.copy(bc).add(new THREE.Vector3(0, 0, -0.026)); wrap.scale.set(1.08, 1, 1); G.add(wrap);   // the coiled wrap around the bun
    // the horn: a thick, almost even tube with a rounded end, slightly bowed, rooted in the top of the bun
    const a = bc.clone().add(new THREE.Vector3(0, 0.032, -0.018));
    const pts = [a, a.clone().add(new THREE.Vector3(0, 0.08, -0.06)), a.clone().add(new THREE.Vector3(0, 0.17, -0.14)), a.clone().add(new THREE.Vector3(0, 0.27, -0.25))];
    const curve = new THREE.CatmullRomCurve3(pts), N = 40, R0 = 0.031;
    const g = new THREE.TubeGeometry(curve, N, R0, 24, false), P = g.attributes.position, c = new THREE.Vector3(), v = new THREE.Vector3();
    for (let i = 0; i <= N; i++) { curve.getPointAt(i / N, c); const t = i / N, k = 1 - 0.22 * t + (t < 0.1 ? 0.25 * (1 - t / 0.1) : 0);   // flares into the bun, tapers a touch
      for (let j = 0; j <= 24; j++) { const idx = i * 25 + j; v.fromBufferAttribute(P, idx).sub(c).multiplyScalar(k).add(c); P.setXYZ(idx, v.x, v.y, v.z); } }
    g.computeVertexNormals(); G.add(new THREE.Mesh(g, m));
    const tip = new THREE.Mesh(new THREE.SphereGeometry(R0 * 0.78, 24, 16), m); tip.position.copy(pts[3]); G.add(tip);   // blunt rounded end
    return G;
  }
  function shortHair(style, H, hairM, capped) {
    if (!SHORT_STYLES[style] || capped || !eyeInfo || typeof headDome !== "function") return;
    const ey = (eyeInfo.l.y + eyeInfo.r.y) / 2, col = "#" + hairM.color.getHexString();
    const d = headDome("hair", ey + 0.064, ey - 0.07, style === "buzz" ? 0.003 : 0.0042, 0); if (!d) return;
    const HG = new THREE.Group(); HG.position.copy(H.position).negate(); H.add(HG);
    const kind = style === "mohawk_low" || style === "mohawk_tall" ? "mohawk" : style === "manbun" ? "fade" : style;
    const tx = hairTex(kind, col); if (tx.flipY) { tx.flipY = false; tx.needsUpdate = true; }
    const m = new THREE.MeshStandardMaterial({ color: 0xffffff, map: tx, transparent: true, depthWrite: false, roughness: 0.9, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    m.userData.outlineParameters = { visible: false };
    const dm = new THREE.Mesh(d.g, m); dm.renderOrder = 2; HG.add(dm);
    const P = d.g.attributes.position, rows = 15, C = G && G.headC ? G.headC : new THREE.Vector3(0, ey + 0.02, 0.04);
    const col0 = (c) => { const out = []; for (let r = 0; r < rows; r++) { const k = c * rows + r; out.push(new THREE.Vector3(P.getX(k), P.getY(k), P.getZ(k))); } return out; };
    const hm = hairM.clone(); hm.roughness = 0.85;
    if (style === "mohawk_low" || style === "mohawk_tall") {   // crest along the midline, hairline to nape
      const front = col0(0).reverse(), back = col0(d.cols / 2), path = front.concat(back.slice(1));
      const tall = style === "mohawk_tall", n = tall ? 15 : 22;
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1), p = path[Math.min(path.length - 1, Math.round(t * (path.length - 1)))], out = p.clone().sub(C).normalize();
        const hgt = tall ? 0.05 + 0.07 * Math.sin(Math.PI * Math.min(1, t * 1.15)) : 0.022 + 0.012 * Math.sin(Math.PI * t);
        const cone = new THREE.Mesh(new THREE.ConeGeometry(tall ? 0.014 : 0.018, hgt, 10), hm);
        cone.position.copy(p).addScaledVector(out, hgt / 2 - 0.004);
        cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), out.clone().add(new THREE.Vector3(0, 0, tall ? -0.15 : -0.5)).normalize());
        if (!tall) cone.scale.set(1, 1, 0.55);
        HG.add(cone);
      }
    } else if (style === "hightop") {   // a tall, slightly flared coily block on the crown with a rounded top edge
      const top = new THREE.Vector3(P.getX(0), P.getY(0), P.getZ(0));
      const tx2 = coilTex(col); tx2.repeat.set(6, 2);
      const bm = new THREE.MeshStandardMaterial({ color: 0xffffff, map: tx2, bumpMap: tx2, bumpScale: 2.5, roughness: 1 });
      const hgt = 0.054, prof = [];
      prof.push(new THREE.Vector2(0.074, -0.075));
      for (let i = 0; i <= 8; i++) prof.push(new THREE.Vector2(0.079 + 0.006 * (i / 8), -0.03 + (hgt + 0.03 - 0.02) * (i / 8)));   // flares a touch going up
      for (let i = 1; i <= 8; i++) { const a2 = (i / 8) * Math.PI / 2; prof.push(new THREE.Vector2(0.065 + 0.02 * Math.cos(a2), hgt - 0.02 + 0.02 * Math.sin(a2))); }   // rounded top edge
      prof.push(new THREE.Vector2(0.0001, hgt));
      const lg = new THREE.LatheGeometry(prof, 120), LP = lg.attributes.position, rr = rnd(9);
      for (let i = 0; i < LP.count; i++) { const j = 1 + (rr() - 0.5) * 0.06; LP.setXYZ(i, LP.getX(i) * j, LP.getY(i) + (rr() - 0.5) * 0.002, LP.getZ(i) * j); }
      lg.computeVertexNormals();
      const blk = new THREE.Mesh(lg, bm); blk.scale.set(1.0, 1, 1.18); blk.rotation.x = -0.12;
      blk.position.copy(top).add(new THREE.Vector3(0, -0.026, -0.022)); HG.add(blk);
    } else if (style === "manbun") {
      const top = new THREE.Vector3(P.getX(0), P.getY(0), P.getZ(0));
      HG.add(sphere(0.034, hm, top.x, top.y + 0.02, top.z - 0.02, 1, 0.85, 1));
    }
  }

  function buildExtras(s, one, has, armed, pistol, w, hold) {
    const sRef = s;
    holder.remove(extras); extras.traverse((o) => { o.geometry && o.geometry.dispose(); o.material && o.material.dispose && o.material.dispose(); });
    extras = new THREE.Group(); holder.add(extras);
    const hairM = std({ color: HAIR[one("haircolor")] || HAIR.black, roughness: 0.38 });
    const dark = std({ color: 0x3a3f2a, roughness: 0.75 }), black = std({ color: 0x141416, roughness: 0.5, metalness: 0.3 });
    const gold = std({ color: 0xd4af37, metalness: 0.9, roughness: 0.25 });

    // head frame: centre of the skull
    const neck = bonePos("neck_01"), headB = bonePos("head");
    const H = new THREE.Group(); extras.add(H);
    const R = headInfo ? headInfo.r : 0.095;                        // skull radius
    if (headInfo) H.position.copy(headInfo.c); else H.position.copy(headB).add(v3(0, 0.085, 0.01));
    if (eyeInfo) H.position.x = (eyeInfo.l.x + eyeInfo.r.x) / 2;   // centre on the face midline (the head bone sits slightly off it)
    hairOrg.value.copy(H.position);
    {   // gravity hang for the long hair sheet when her back is far from upright
      HAIRU.uHangOn.value = 0;
      const qs = new THREE.Quaternion(); restToHolder("spine_03").decompose(new THREE.Vector3(), qs, new THREE.Vector3());
      const ang = v3(0, -1, 0).applyQuaternion(qs).angleTo(v3(0, -1, 0));
      const on = THREE.MathUtils.clamp((ang - 0.5) / 0.5, 0, 1);
      if (on > 0) {
        const MH = restToHolder("head"), qh = new THREE.Quaternion(); MH.decompose(new THREE.Vector3(), qh, new THREE.Vector3());
        const hi = skel.bones.findIndex((b) => b.name === "head"), hb = new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().copy(skel.boneInverses[hi]).invert());   // head bone, rest pose
        const pr = hb.add(v3(0, 0.0, -0.06)), pp = pr.clone().applyMatrix4(MH);
        const qc = new THREE.Quaternion().setFromUnitVectors(v3(0, -1, 0).applyQuaternion(qh), v3(0, -1, 0));
        HAIRU.uHangM.value.makeTranslation(pp.x, pp.y, pp.z).multiply(new THREE.Matrix4().makeRotationFromQuaternion(qc))
          .multiply(new THREE.Matrix4().makeTranslation(-pp.x, -pp.y, -pp.z)).multiply(MH);
        HAIRU.uHangY.value = pr.y; HAIRU.uHangOn.value = on;
      }
    }
    // irises on the eyeballs
    const eyeC = std({ color: EYES[one("eyes")] || EYES.brown, roughness: 0.45 }), pupil = std({ color: 0x050505, roughness: 0.4 });
    eyeC.envMapIntensity = 0.3; pupil.envMapIntensity = 0.3;   // glossy eyes mirrored the bright sky and went white when seen from below
    for (const m of [eyeC, pupil]) { m.polygonOffset = true; m.polygonOffsetFactor = -2; m.polygonOffsetUnits = -4; }
    const EYEG = new THREE.Group(); extras.add(EYEG);
    if (eyeInfo) for (const c of [eyeInfo.l, eyeInfo.r]) {
      const lk = (sRef.pose && sRef.pose.look) || {}, ex = Math.max(-1, Math.min(1, (lk.eyeX || 0) / 10)) * 0.0042, ey = Math.max(-1, Math.min(1, (lk.eyeY || 0) / 10)) * 0.003;
      const side = c === eyeInfo.l ? 0 : 1;
      const ir = new THREE.Mesh(new THREE.CircleGeometry(0.0062, 24), eyeC); ir.position.set(c.x + ex, c.y + ey, eyeInfo.front + 0.0016); ir.userData = { side, ex, ey, lift: 0.0016 }; EYEG.add(ir);
      const pu = new THREE.Mesh(new THREE.CircleGeometry(0.0026, 16), pupil); pu.position.set(c.x + ex, c.y + ey, eyeInfo.front + 0.0021); pu.userData = { side, ex, ey, lift: 0.0021 }; EYEG.add(pu);
    }
    // head add-ons were laid out on the resting head: move them with the posed head (squats, kneeling, turned head)
    const followHead = () => {
      if (!headRestM || !B.head) return;
      holder.updateMatrixWorld(true);
      let delta;
      const fNow = faceFrame();
      const eNow = eyeRestF ? eyeFrame() : null;
      if (eNow) delta = eNow.multiply(eyeRestF.clone().invert());                 // follow the skull (eyeballs are rigid to it)
      else if (fNow && faceRestF) delta = fNow.multiply(faceRestF.clone().invert());   // follow the real (skinned) face
      else { const now = holder.matrixWorld.clone().invert().multiply(B.head.matrixWorld); delta = now.multiply(headRestM.clone().invert()); }
      [H].forEach((g) => { g.updateMatrix(); g.matrix.premultiply(delta); g.matrix.decompose(g.position, g.quaternion, g.scale); });
      // irises sit on the real (skinned) cornea of each eyeball, facing the way that eyeball faces
      const pinned = pinIrises(EYEG);
      if (!pinned) { EYEG.updateMatrix(); EYEG.matrix.premultiply(delta); EYEG.matrix.decompose(EYEG.position, EYEG.quaternion, EYEG.scale); }
    };
    const eyeY = eyeInfo ? eyeInfo.l.y - H.position.y : 0.012, eyeZ = eyeInfo ? eyeInfo.front - H.position.z : 0.08;
    const ewear = one("eyewear") || (has("gear", "shades") ? "shield" : "none");
    if (ewear && ewear !== "none") eyewear(ewear, H, eyeY, eyeZ, eyeInfo ? Math.abs(eyeInfo.l.x - H.position.x) : 0.032);

    // hair
    const style = one("hair") || "straight"; afroShell = null;
    const capped = has("gear", "beanie") || has("gear", "cap") || one("eyewear") === "nvg";
    const HAIRMAP = { straight: "hair_long", wave: "hair_long", curly: "hair_long", knotless: "hair_pixie", butterfly: "hair_pixie", pony: "hair_pony", buns: "hair_pixie", spike: "hair_pixie", bob: "hair_bob", pixie: "hair_pixie", own: "hair_long",
      afro: "", locs: "hair_pixie", manbun: "hair_pixie", cornrows: "", waves: "", hightop: "", mohawk_low: "", mohawk_tall: "", fade: "", buzz: "", bald: "" };
    const realHair = !!M.hair_long;
    if (realHair) {
      const want = HAIRMAP[style] ?? "hair_long", tint = new THREE.Color(HAIR[one("haircolor")] || HAIR.black);
      const braided = style === "knotless" || style === "butterfly" || style === "locs";
      for (const k in M) if (/^hair_/.test(k)) { M[k].visible = !(braided && k === "hair_pixie") && !(style === "curly" && k === "hair_afro") && k === want && !(capped && (k === "hair_afro" || k === "hair_bob" || k === "hair_pixie")); M[k].material.userData.uTint.value.copy(tint); }
      if (M.brows) M.brows.material.userData.uTint.value.copy(tint).multiplyScalar(0.7);
      if (M.hair_long) M.hair_long.material.userData.uWave.value = style === "wave" ? 1 : 0;
    }
    if (realHair) { /* real hair meshes handle the main styles */ }
    else if (hairCap) { hairCap.visible = !capped; hairCap.material = hairM.clone(); }
    else if (style !== "bob" && !capped) { const cap = new THREE.Mesh(new THREE.SphereGeometry(R * 1.05, 40, 24, 0, Math.PI * 2, 0, Math.PI * 0.55), hairM); cap.position.set(0, 0.008, -0.012); cap.rotation.x = -0.32; H.add(cap); }
    const backLen = { straight: 0.5, wave: 0.45, curly: 0.38, knotless: 0.52, butterfly: 0.48, pony: 0.45 }[style] || 0;
    const zc = eyeZ - 0.085;   // skull centre depth relative to H
    let scalp = null;
    if (M.hair_pixie) { const g = M.hair_pixie.geometry; if (!g.boundingBox) g.computeBoundingBox(); const bb = g.boundingBox;
      const c = bb.getCenter(new THREE.Vector3()).sub(H.position), hs = bb.getSize(new THREE.Vector3()).multiplyScalar(0.5);
      // the cap runs down to the nape; use its top half for the dome
      scalp = { c: new THREE.Vector3(0, c.y + hs.y - hs.x * 1.05, c.z), r: new THREE.Vector3(hs.x * 0.96, hs.x * 1.05, hs.z * 0.96) }; }
    const scalpTop = M.hair_pixie ? (M.hair_pixie.geometry.boundingBox || (M.hair_pixie.geometry.computeBoundingBox(), M.hair_pixie.geometry.boundingBox)).max.y - H.position.y : R;
    if (realHair && scalp && (style === "knotless" || style === "butterfly" || style === "locs")) {   // tight scalp cap under the braids / curls
      // matte cap with braid partings (scalp lines between sections) so it reads as hair, not a helmet
      const capCol = "#" + new THREE.Color(HAIR[one("haircolor")] || HAIR.black).getHexString();
      const capM = std({ color: 0xffffff, roughness: 0.85, map: canvasTex("parts-" + capCol, 512, 256, (g, w, h) => {
        const c = new THREE.Color(capCol), r = rnd(3), sh = (k) => `rgb(${Math.min(255, Math.round((c.r * 255 + 14) * k))},${Math.min(255, Math.round((c.g * 255 + 12) * k))},${Math.min(255, Math.round((c.b * 255 + 10) * k))})`;
        g.fillStyle = sh(1); g.fillRect(0, 0, w, h);
        for (let k = 0; k < 2600; k++) { g.fillStyle = sh(0.6 + r() * 1.3); g.fillRect(r() * w, r() * h, 1.5, 5 + r() * 6); }   // braided strand texture
        g.strokeStyle = "#5e4232"; g.globalAlpha = 0.85;   // scalp showing in the box parts
        for (let i = 0; i < 26; i++) { const x = (i + 0.5) / 26 * w; g.lineWidth = 2.4; g.beginPath(); g.moveTo(x, h * 0.04); for (let y = 0; y <= h; y += 16) g.lineTo(x + Math.sin(y * 0.05 + i) * 3, y); g.stroke(); }
        for (let j = 1; j < 7; j++) { const y = j / 7 * h; g.lineWidth = 2; g.beginPath(); for (let x = 0; x <= w; x += 8) g.lineTo(x, y + Math.sin(x * 0.04 + j) * 4); g.stroke(); }
        g.globalAlpha = 1;
      }) });
      const cap = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 28, 0, Math.PI * 2, 0, Math.PI * 0.6), capM);
      cap.scale.copy(scalp.r).multiplyScalar(capped ? 0.94 : 1.005); cap.position.copy(scalp.c); cap.rotation.x = -0.62; H.add(cap);   // tucked under a hat
    }
    const hatRim = has("gear", "beanie") ? { front: eyeY + 0.045, back: eyeY - 0.012 } : has("gear", "cap") ? { front: eyeY + 0.052, back: eyeY + 0.008 } : one("eyewear") === "nvg" ? { front: eyeY + 0.03, back: eyeY - 0.004 } : null;
    if (realHair && style === "curly") H.add(braidHair("curly", R, 0.3, hairM, scalp, hatRim));
    // (body wave: the long sheet carries the waves itself; the old loose strands ended mid-back like claws)
    else if (style === "afro" && scalp && !capped) {
      const grooves = [], ears = []; if (has("gear", "headset")) grooves.push([-0.12, 0.022]); if (has("jewelry", "crystalband")) grooves.push([0.42, 0.011]);
      if (has("gear", "headset") && faceFit && faceFit.ear) faceFit.ear.forEach((e) => ears.push(e.clone().sub(H.position)));
      const af = afroHair(hairM, scalp, eyeY, eyeZ, grooves.length && G && G.headC ? { hc: G.headC.clone().sub(H.position), R: headInfo ? headInfo.r : 0.095, grooves, ears } : null);
      H.add(af); afroShell = { C: af.userData.afro.C.clone().add(H.position), R: af.userData.afro.R };
    }
    else if (realHair && style === "pony") { const qh = new THREE.Quaternion(), qs = new THREE.Quaternion(); restToHolder("head").decompose(new THREE.Vector3(), qh, new THREE.Vector3()); restToHolder("spine_03").decompose(new THREE.Vector3(), qs, new THREE.Vector3());
      const up = Math.max(0, v3(0, 1, 0).applyQuaternion(qs).y), hang = v3(0, -0.55, -1).normalize().lerp(v3(0, -1, 0), up * up).normalize();   // bent over: drapes back along her neck and back
      H.add(highPony(hairM, eyeY, eyeZ, scalpTop, has("gear", "cap") ? "cap" : has("gear", "beanie") || one("eyewear") === "nvg" ? "beanie" : null, hang.applyQuaternion(qh.invert()), has("gear", "vest") ? 0.07 : 0)); }
    else if (realHair && style === "buns" && !capped) {
      for (const sd of [-1, 1]) {
        const bn = sphere(0.04, hairM, sd * 0.052, scalpTop - 0.024, zc - 0.004, 1, 0.9, 1); H.add(bn);
        const tw = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.009, 8, 28), hairM); tw.position.set(sd * 0.05, scalpTop - 0.034, zc - 0.004); tw.rotation.set(Math.PI / 2 - 0.2, 0, sd * 0.4); H.add(tw);
      }
    }
    else if (realHair && style === "locs") H.add(braidHair("locs", R, 0.2, hairM, scalp, hatRim));
    else if (realHair && !(style === "knotless" || style === "butterfly" || style === "spike")) { /* nothing extra */ }
    else if (style === "straight" || style === "wave") {
      const panel = new THREE.Mesh(new THREE.CapsuleGeometry(0.095, backLen, 8, 24), hairM);
      panel.position.set(0, -backLen / 2 - 0.03, -0.075); panel.scale.set(1.15, 1, 0.3); panel.rotation.x = 0.1; H.add(panel);
      for (const sd of [-1, 1]) {   // side curtains framing the face, down past the shoulders
        const f = new THREE.Mesh(new THREE.CapsuleGeometry(0.03, 0.34, 6, 12), hairM);
        f.position.set(sd * (R * 0.92), -0.16, 0.0); f.rotation.z = sd * 0.05; f.rotation.x = 0.08; f.scale.set(1, 1, 0.7); H.add(f);
      }
      if (style === "wave") for (let i = 0; i < 7; i++) H.add(sphere(0.042, hairM, (i % 2 ? 1 : -1) * 0.065, -0.15 - i * 0.065, -0.085));
    } else if (style === "curly") {
      const r = rnd(7);
      for (let i = 0; i < 34; i++) { const a = r() * Math.PI * 2, yy = 0.08 - r() * 0.48; H.add(sphere(0.055 + r() * 0.03, hairM, Math.cos(a) * 0.13, yy, -0.04 + Math.sin(a) * 0.07 - (yy < -0.05 ? 0.06 : 0))); }
    } else if (style === "knotless" || style === "butterfly") {
      H.add(braidHair(style, R, backLen, hairM, scalp, hatRim));
    } else if (style === "pony") {
      H.add(sphere(0.032, hairM, 0, 0.07, -0.1));
      H.add(limb([0, 0.07, -0.12], [0, -backLen, -0.17], 0.038, 0.018, hairM));
    } else if (style === "buns") {
      for (const sd of [-1, 1]) H.add(sphere(0.048, hairM, sd * 0.06, 0.1, -0.02));
    } else if (style === "spike") {   // sleek round bun at the back, one thick glossy blunt tube of hair jutting up and back like a horn
      H.add(spikeHair(hairM, zc, scalpTop));
    } else if (style === "bob") {
      const bob = new THREE.Mesh(new THREE.SphereGeometry(R * 1.2, 40, 24, 0, Math.PI * 2, 0, Math.PI * 0.66), hairM);
      bob.position.set(0, 0.0, -0.02); bob.rotation.x = -0.2; H.add(bob);
    } else if (style === "pixie") { /* the cap is enough */ }
    shortHair(style, H, hairM, capped);
    // tongue out: a tongue resting on the lower lip
    if ((one("expr") === "tongue" || one("expr") === "tonguewink") && U.uMouth) {
      const mo = U.uMouth.value.clone().sub(H.position), tg = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), new THREE.MeshPhysicalMaterial({ color: 0xd4606f, roughness: 0.32, clearcoat: 0.6, clearcoatRoughness: 0.3 }));
      tg.scale.set(0.0125, 0.0045, 0.019); tg.position.set(mo.x, mo.y - 0.011, mo.z - 0.002); tg.rotation.x = 0.55; H.add(tg);
    }
    // hair details
    if (has("hairx", "eye")) {   // side-swept fringe from her right temple down over her left eye
      const ex = eyeInfo ? eyeInfo.l.x - H.position.x : 0.032;
      // flat, tapered strands: each limb's cylinder is squashed front-to-back in its own frame
      const strand = (a2, b3, r1, r2) => { const g = limb(a2, b3, r1, r2, hairM, false), c = g.children[0];
        const n = new THREE.Vector3(...b3).sub(new THREE.Vector3(...a2)).normalize(), fwd = new THREE.Vector3(0, 0, 1);
        const side = new THREE.Vector3().crossVectors(n, fwd).normalize(), out = new THREE.Vector3().crossVectors(side, n).normalize();
        c.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(side, n, out)); c.scale.set(1, 1, 0.3); H.add(g); };
      strand([-0.04, eyeY + 0.06, eyeZ - 0.006], [ex + 0.012, eyeY - 0.016, eyeZ + 0.015], 0.026, 0.012);
      strand([-0.015, eyeY + 0.066, eyeZ - 0.008], [ex + 0.024, eyeY - 0.002, eyeZ + 0.011], 0.02, 0.009);
    }
    if (has("hairx", "bangs")) {   // a curved fringe hugging the forehead
      const r = eyeZ + 0.006, bg = new THREE.Mesh(new THREE.CylinderGeometry(r - 0.004, r + 0.004, 0.036, 32, 1, true, -0.85, 1.7), hairM);
      bg.material.side = THREE.DoubleSide; bg.position.set(0, eyeY + 0.03, 0); H.add(bg);
    }
    if (has("hairx", "edges")) for (const sd of [-1, 1]) {   // laid swirls at the temples
      const t = new THREE.Mesh(new THREE.TorusGeometry(0.009, 0.0016, 6, 20, Math.PI * 1.5), hairM);
      t.position.set(sd * 0.062, eyeY + 0.03, eyeZ - 0.022); t.rotation.y = sd * 1.1; H.add(t);
    }
    if (has("jewelry", "nails")) {   // long glossy nails on every fingertip
      const nailM = new THREE.MeshPhysicalMaterial({ color: 0xe9b8b8, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.05 });
      for (const sd of ["l", "r"]) for (const f of ["thumb", "index", "middle", "ring", "pinky"]) {
        const a = B[f + "_02_" + sd], b2 = B[f + "_03_" + sd]; if (!a || !b2) continue;
        const pa = bonePos(f + "_02_" + sd), pb = bonePos(f + "_03_" + sd), dir = pb.clone().sub(pa); const seg = dir.length() || 0.02; dir.normalize();
        const tip = pb.clone().add(dir.clone().multiplyScalar(seg * 0.85));
        extras.add(limb(tip.toArray(), tip.clone().add(dir.clone().multiplyScalar(0.016)).toArray(), 0.0045, 0.0028, nailM));
      }
    }
    const lobeAt = (sd) => { const L = faceFit && faceFit.lobe && faceFit.lobe[sd > 0 ? 0 : 1]; return L ? L.clone().sub(H.position) : new THREE.Vector3(sd * 0.073, -0.03, 0.005); };

    // shoes and bottoms: real fitted meshes when the model has them
    const sneaker = one("boots") === "sneakers";
    if (M.cl_boots) {
      const bt = new THREE.Color(BOOTS[one("boots")] || BOOTS.white);
      M.cl_boots.visible = !sneaker; M.cl_sneakers.visible = sneaker;
      M.cl_boots.material.userData.uTint.value.copy(bt);
      for (const k of ["cl_leggings", "cl_jeans", "cl_shorts"]) if (M[k]) M[k].visible = false;   // replaced by fitted shells
    }
    const bootM = std({ color: BOOTS[one("boots")] || BOOTS.white, roughness: 0.45 });
    if (!M.cl_boots) {
    const thick = 1 + Math.max(0, ((s.shape && s.shape.thighs) || 5) - 5) * 0.03 * (0.5 + (s.exag || 0) / 100);
    for (const sd of ["l", "r"]) {
      const an = bonePos("foot_" + sd), ball = bonePos("ball_" + sd);
      if (!sneaker) extras.add(limb([an.x, an.y - 0.02, an.z - 0.01], [an.x, 0.3, an.z - 0.005], 0.05 * thick, 0.056 * thick, bootM));
      const heel = v3(an.x, 0.052, an.z - 0.05), toe = v3(ball.x, 0.046, ball.z + 0.055);
      const f = limb([heel.x, heel.y, heel.z], [toe.x, toe.y, toe.z], 0.045, 0.04, bootM);
      extras.add(f);
      extras.add(boxM(0.078, 0.012, toe.z - heel.z + 0.07, std({ color: 0x1a1a1c, roughness: 0.8 }), (heel.x + toe.x) / 2, 0.006, (heel.z + toe.z) / 2));
    }
    }
    try { garments(s, one, has, H); } catch (e) { console.warn("garments", e); U.uGarOn.value = 0; }
    if (HAIRU.uHood.value.w > 0.5) H.traverse((m) => {   // loose braids / locs: move the strand's centre line out over the hood (the shader push alone flattened them)
      const st = m.userData && m.userData.strand; if (!st) return;
      const org = hairOrg.value, dense = new THREE.CatmullRomCurve3(st.pts).getPoints(48);
      let moved = false;
      const np = dense.map((q) => { const w = q.clone().add(org), o = hoodOutJS(w, 0.012); if (o !== w) moved = true; return o.sub(org); });
      if (moved) { m.geometry.dispose(); m.geometry = st.mk(np); }
    });
    followHead();
    // the seat she sits on
    if (curSeat && curSeat.type !== "floor") {
      const pz = bonePos("pelvis").z - 0.04, h = curSeat.h, SG = new THREE.Group(); SG.position.set(0, 0, pz); extras.add(SG);
      const metal = std({ color: 0x1b1c20, roughness: 0.45, metalness: 0.6 }), wood = std({ color: 0x6b4a2b, roughness: 0.7 }), olive = std({ color: 0x4a4f2c, roughness: 0.8 }), conc = std({ color: 0x8d8b86, roughness: 0.95 });
      if (curSeat.type === "chair") {
        SG.add(boxM(0.44, 0.035, 0.42, metal, 0, h - 0.018, 0));
        for (const [x, z] of [[-0.2, -0.19], [0.2, -0.19], [-0.2, 0.19], [0.2, 0.19]]) SG.add(boxM(0.025, h - 0.035, 0.025, metal, x, (h - 0.035) / 2, z));
        SG.add(boxM(0.44, 0.38, 0.03, metal, 0, h + 0.2, -0.21));
      } else if (curSeat.type === "stool") {
        const top = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.04, 28), metal); top.position.y = h - 0.02; SG.add(top);
        for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + 0.785, leg = boxM(0.022, h - 0.04, 0.022, metal, Math.cos(a) * 0.13, (h - 0.04) / 2, Math.sin(a) * 0.13); leg.rotation.set(Math.sin(a) * 0.08, 0, -Math.cos(a) * 0.08); SG.add(leg); }
        SG.add(boxM(0.26, 0.02, 0.02, metal, 0, h * 0.35, 0.09)); SG.add(boxM(0.26, 0.02, 0.02, metal, 0, h * 0.35, -0.09));
      } else if (curSeat.type === "crate") {
        SG.add(boxM(0.62, h, 0.46, olive, 0, h / 2, 0));
        for (const y of [h * 0.3, h * 0.7]) SG.add(boxM(0.64, 0.03, 0.48, std({ color: 0x3a3e22, roughness: 0.8 }), 0, y, 0));
      } else if (curSeat.type === "steps") {
        SG.add(boxM(1.2, h, 0.4, conc, 0, h / 2, -0.05)); SG.add(boxM(1.2, h / 2, 0.36, conc, 0, h / 4, 0.33)); SG.add(boxM(1.2, h * 1.5, 0.36, conc, 0, h * 0.75, -0.42));
      }
    }
    if (armed) extras.add(weapon(w, hold, pistol, black));
  }

  // Real weapon models (made on the hub's GPU: FLUX.2 picture -> TRELLIS.2 3D), +Z = muzzle, origin at the grip.
  const WEAPON_GLB = {ak47: "models/weapons/ak47.glb?v=2", akm: "models/weapons/akm.glb?v=2", m4a1: "models/weapons/m4a1.glb?v=2", hk416: "models/weapons/hk416.glb?v=2", scar: "models/weapons/scar.glb?v=2", mp5: "models/weapons/mp5.glb?v=2", uzi: "models/weapons/uzi.glb?v=2", remington: "models/weapons/remington.glb?v=2", barrett: "models/weapons/barrett.glb?v=3", glock: "models/weapons/glock.glb?v=2", deagle: "models/weapons/deagle.glb?v=2" };
  const weaponCache = {}, weaponLoading = {};
  let draco = null;
  function loadWeapon(w) {
    if (weaponCache[w] || weaponLoading[w] || !WEAPON_GLB[w]) return;
    weaponLoading[w] = true;
    if (!draco) { draco = new DRACOLoader(); draco.setDecoderPath("https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/libs/draco/gltf/"); }
    const l = new GLTFLoader(); l.setDRACOLoader(draco);
    l.load(new URL(WEAPON_GLB[w], document.baseURI).href, (g) => {
      g.scene.traverse((o) => { if (o.isMesh && o.material) { o.material.roughness = Math.min(0.7, o.material.roughness ?? 0.6); o.material.metalness = 0.35; o.material.userData.cloth = true; } });
      weaponCache[w] = g.scene;
      if (pendingState && pendingState.weapon === w) build(pendingState);
    });
  }
  function weapon(w, hold, pistol, black) {
    const g = new THREE.Group();
    if (WEAPON_GLB[w]) loadWeapon(w);
    if (weaponCache[w]) {
      g.add(weaponCache[w].clone());
      placeWeapon(g, hold, pistol, w);
      return g;
    }
    const wood = std({ color: 0x7a4a22, roughness: 0.55 }), metal = black, isAK = w === "ak47", furn = isAK ? wood : metal;
    const long = pistol ? 0.2 : w === "barrett" ? 1.25 : w === "remington" ? 1.0 : w === "mp5" || w === "uzi" ? 0.6 : 0.88;
    if (pistol) {
      g.add(boxM(0.032, 0.034, long, metal, 0, 0.02, 0.06));
      g.add(boxM(0.028, 0.085, 0.036, metal, 0, -0.025, 0.0, 0.25));
    } else {
      g.add(boxM(0.048, 0.07, long * 0.32, metal, 0, 0, long * 0.08));
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, long * 0.42, 12), metal);
      bar.rotation.x = Math.PI / 2; bar.position.set(0, 0.012, long * 0.44); g.add(bar);
      g.add(boxM(0.044, 0.05, long * 0.18, furn, 0, -0.003, long * 0.32));
      if (w !== "uzi") g.add(boxM(0.04, 0.08, long * 0.24, furn, 0, -0.03, -long * 0.2, -0.12));
      g.add(boxM(0.03, 0.08, 0.035, furn, 0, -0.055, 0.0, 0.3));
      if (w !== "remington" && w !== "barrett") g.add(boxM(0.028, 0.15, 0.05, metal, 0, -0.1, long * 0.14, isAK || w === "akm" ? -0.35 : -0.12));
      if (w === "m4a1" || w === "hk416" || w === "scar") g.add(boxM(0.03, 0.035, 0.07, metal, 0, 0.055, long * 0.08));
    }
    placeWeapon(g, hold, pistol, w);
    return g;
  }

  function placeWeapon(g, hold, pistol, w) {
    g.scale.setScalar(curGunK);
    if (curRig) { g.position.copy(curRig.G); g.quaternion.copy(curRig.q); return; }
    // the grip sits in the right hand; the barrel points along where the hands point
    const hr = bonePos("hand_r"), hl = bonePos("hand_l");
    if (hold === "sling") {
      if (pistol) {
        if (holsterM) { const p = new THREE.Vector3(), q = new THREE.Quaternion(); holsterM.decompose(p, q, new THREE.Vector3()); g.position.copy(p); g.quaternion.copy(q).multiply(new THREE.Quaternion().setFromAxisAngle(v3(1, 0, 0), Math.PI / 2)); return; }
        const t = bonePos("thigh_r"); g.position.copy(t).add(v3(-0.1, -0.12, 0.0)); g.rotation.set(Math.PI / 2, 0, 0); return;
      }
      const dm = gunDims(w, false), k = curGunK;
      if (curSeat && curSeat.type === "chair") {   // sitting back in a chair: the rifle rests across her lap, magazine toward her
        const pel = bonePos("pelvis"), kn = bonePos("calf_l").add(bonePos("calf_r")).multiplyScalar(0.5), th = bonePos("thigh_l").add(bonePos("thigh_r")).multiplyScalar(0.5);
        const c = th.clone().lerp(kn, 0.58); let lapY = Math.max(th.y, kn.y) + 0.12;
        try {
          holder.updateMatrixWorld(true); body.boundingSphere = null; const rc = new THREE.Raycaster(); let best = -1;
          for (const dx of [-0.16, 0, 0.16]) for (const sx of [-1, 1]) {
            const px = sx * Math.abs(th.x) * 0.9 + dx * 0.3, o = holder.localToWorld(v3(px, Math.max(th.y, kn.y) + 0.5, c.z));
            rc.set(o, v3(0, -1, 0)); for (const h of rc.intersectObject(body, false)) { const hy = holder.worldToLocal(h.point.clone()).y; if (hy < th.y + 0.3) { best = Math.max(best, hy); break; } }
          }
          if (best > 0) lapY = best + 0.03;
        } catch (e) {}
        const z = v3(1, 0.04, 0.22).normalize(), y = v3(0, 0, 1).sub(z.clone().multiplyScalar(z.z)).normalize(), x = y.clone().cross(z).normalize();
        g.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
        g.position.set(c.x, lapY, c.z + 0.05).addScaledVector(z, -((dm.zMin + dm.zMax) / 2) * k);
        return;
      }
      // slung diagonally across her back: stock behind her right shoulder, muzzle down toward her left hip,
      // lying flat against the back (its side facing out), top rail toward her right side. Laid out on the
      // standing body, then carried along by the upper back so it stays on her back when she bends or crawls.
      const M = restToHolder("spine_03"), Mi = M.clone().invert(), Mp = restToHolder("pelvis").clone().invert();
      const s3 = bonePos("spine_03").applyMatrix4(Mi), nk = bonePos("neck_01").applyMatrix4(Mi), sh = bonePos("upperarm_r").applyMatrix4(Mi), hipL = bonePos("thigh_l").applyMatrix4(Mp);
      const top = v3(sh.x * 0.85, nk.y - 0.03, s3.z - 0.12), M0 = new THREE.Quaternion(); M.decompose(new THREE.Vector3(), M0, new THREE.Vector3());
      const upright = Math.max(0, v3(0, 1, 0).applyQuaternion(M0).y);   // 1 standing, 0 bent flat over
      // down toward the far hip, leaning out behind her so the lower end clears her hips and glutes
      const z = v3(Math.max(0.55, (hipL.x - top.x) * 2.2), -1.0, -0.4 * upright * upright - 0.06).normalize(), x = v3(0, 0, -1), y = z.clone().cross(x).normalize(), x2 = y.clone().cross(z).normalize();
      const qr = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x2, y, z)), qM = new THREE.Quaternion();
      M.decompose(new THREE.Vector3(), qM, new THREE.Vector3());
      g.quaternion.copy(qM).multiply(qr);
      g.position.copy(top).addScaledVector(z, -dm.zMin * k).applyMatrix4(M);   // the butt sits at the shoulder end
      // keep both ends (and the magazine) off the floor or the seat: swing it up across her back about the shoulder end
      const minY = (curSeat && curSeat.type !== "floor" ? curSeat.h : 0) + 0.05, pivot = top.clone().applyMatrix4(M);
      const ends = () => { const zz = v3(0, 0, 1).applyQuaternion(g.quaternion), yy = v3(0, 1, 0).applyQuaternion(g.quaternion);
        const a = g.position.clone().addScaledVector(zz, dm.zMax * k), b = g.position.clone().addScaledVector(zz, dm.zMin * k);
        return Math.min(a.y, b.y, a.clone().addScaledVector(yy, dm.yMin * k).y, g.position.clone().addScaledVector(yy, dm.yMin * k).y); };
      const axis = v3(1, 0, 0).applyQuaternion(g.quaternion), swing = (ang) => { const q = new THREE.Quaternion().setFromAxisAngle(axis, ang); g.quaternion.premultiply(q); g.position.sub(pivot).applyQuaternion(q).add(pivot); };
      if (ends() < minY) {
        swing(0.1); const up = ends(); swing(-0.1); const dir = up > ends() ? 1 : -1;
        let n = 0; for (; n < 16 && ends() < minY; n++) swing(dir * 0.1);
        if (n > 6 && (!curSeat || curSeat.type === "floor")) {   // too low to wear it: laid flat on the ground beside her right hip
          const pel = bonePos("pelvis"), xr = Math.min(bonePos("thigh_r").x, bonePos("calf_r").x, bonePos("foot_r").x) - 0.2;
          const zz = v3(0.08, 0, 1).normalize(), yy = v3(-1, 0, 0), xx = yy.clone().cross(zz).normalize();
          g.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(xx, yy, zz));
          g.position.set(xr, 0.03, pel.z + 0.05).addScaledVector(zz, -((dm.zMin + dm.zMax) / 2) * k);
        }
      }
    } else {
      g.position.copy(hr).add(v3(0, -0.02, 0.03));
      const dir = pistol || hold === "side" ? null : hl.clone().sub(hr);
      if (dir && dir.length() > 0.05) {   // aim along the hands, keep the gun upright (no roll)
        const z = dir.normalize(), x = new THREE.Vector3(0, 1, 0).cross(z).normalize(), y = z.clone().cross(x).normalize();
        g.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
      }
      else if (hold === "side") g.rotation.set(1.25, 0, 0);
      else if (hold === "shoulder") g.rotation.set(0, 0, 0);
      else g.rotation.set(0.35, 0, 0);
    }
  }

  // ------------------------------------------------------------ height ruler
  let lastH = 0;
  function drawRuler(h) {
    while (ruler.children.length) { const c = ruler.children.pop(); c.geometry && c.geometry.dispose(); }
    const X = -0.52, line = new THREE.LineBasicMaterial({ color: 0x8a8a93, transparent: true, opacity: 0.7 });
    ruler.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([v3(X, 0, 0), v3(X, Math.max(72, h + 6) * IN, 0)]), line));
    for (let i = 24; i <= Math.max(72, Math.ceil((h + 6) / 6) * 6); i += 3) {
      const y = i * IN, len = i % 12 === 0 ? 0.06 : i % 6 === 0 ? 0.04 : 0.02;
      ruler.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([v3(X, y, 0), v3(X + len, y, 0)]), line));
      if (i % 6 === 0) ruler.add(label(ft(i), X + 0.13, y, "#9a9aa3", 0.05));
    }
    const accent = getComputedStyle(document.documentElement).getPropertyValue("--color-accent").trim() || "#ff6a1f";
    ruler.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([v3(X, h * IN, 0), v3(0.05, h * IN, 0)]), new THREE.LineBasicMaterial({ color: new THREE.Color(accent) })));
    ruler.add(label(ft(h), X + 0.33, h * IN + 0.04, accent, 0.065));
  }
  const labelCache = {};
  function label(text, x, y, color, size) {
    const kk = text + color;
    let tex = labelCache[kk];
    if (!tex) {
      const c = document.createElement("canvas"); c.width = 128; c.height = 48;
      const g = c.getContext("2d"); g.font = "600 30px Inter, system-ui, sans-serif"; g.fillStyle = color; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(text, 64, 24);
      tex = labelCache[kk] = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    }
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    sp.scale.set(size * 2.67, size, 1); sp.position.set(x, y, 0); return sp;
  }
  function ft(i) { i = Math.round(i); return Math.floor(i / 12) + "'" + (i % 12) + '"'; }


  // ================================================================== LOOKS
  // Every look is: a post-shading grade/effect in the materials (shared uniforms),
  // optional material overrides (albedo, roughness, metal, clay bumps), lighting,
  // background, outlines, environment reflections, shadows, pixel size and frame rate.
  const LOOKU = {
    uMode: { value: 0 }, uPoster: { value: 0 }, uSat: { value: 1 }, uGrade: { value: new THREE.Vector3(1, 1, 1) },
    uAlbMix: { value: 0 }, uAlbMode: { value: 0 }, uAlb: { value: new THREE.Color(1, 1, 1) },
    uRoughO: { value: -1 }, uMetalO: { value: -1 }, uClay: { value: 0 }, uTime: { value: 0 }
  };
  const LOOK_GLSL_COMMON = `
    uniform float uMode, uPoster, uSat, uAlbMix, uAlbMode, uRoughO, uMetalO, uClay, uTime;
    uniform vec3 uGrade, uAlb;
    varying vec3 vLookPos;
    float lkCloth = 0.0;
    float lkHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
    float lkNoise(vec3 x) { vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(mix(lkHash(i), lkHash(i + vec3(1,0,0)), f.x), mix(lkHash(i + vec3(0,1,0)), lkHash(i + vec3(1,1,0)), f.x), f.y),
                 mix(mix(lkHash(i + vec3(0,0,1)), lkHash(i + vec3(1,0,1)), f.x), mix(lkHash(i + vec3(0,1,1)), lkHash(i + vec3(1,1,1)), f.x), f.y), f.z); }
    float lkBayer(vec2 p) { vec2 q = mod(floor(p), 4.0); int i = int(q.x + q.y * 4.0);
      float m[16] = float[16](0.,8.,2.,10.,12.,4.,14.,6.,3.,11.,1.,9.,15.,7.,13.,5.); return m[i] / 16.0; }
    vec3 lkHeat(float t) { t = clamp(t, 0.0, 1.0);
      return t < 0.25 ? mix(vec3(0.02,0.0,0.1), vec3(0.35,0.0,0.6), t / 0.25) : t < 0.5 ? mix(vec3(0.35,0.0,0.6), vec3(0.9,0.1,0.15), (t - 0.25) / 0.25)
           : t < 0.75 ? mix(vec3(0.9,0.1,0.15), vec3(1.0,0.75,0.0), (t - 0.5) / 0.25) : mix(vec3(1.0,0.75,0.0), vec3(1.0,1.0,0.9), (t - 0.75) / 0.25); }
  `;
  function patchLook(m) {
    if (!m || m.userData.lookPatched || !(m.isMeshStandardMaterial)) return;
    m.userData.lookPatched = true;
    const prev = m.onBeforeCompile;
    m.onBeforeCompile = (sh, r) => {
      if (prev) prev.call(m, sh, r);
      Object.assign(sh.uniforms, LOOKU);
      sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vLookPos;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvLookPos = transformed;");
      sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\n" + LOOK_GLSL_COMMON)
        .replace("#include <alphamap_fragment>", `#include <alphamap_fragment>
          lkCloth = max(lkCloth, ${m.userData.cloth ? "1.0" : "0.0"});
          if (uAlbMix > 0.0) {
            vec3 alb = uAlb;
            if (uAlbMode > 0.5) {   // marble veins
              vec3 p = vLookPos * 9.0;
              float v = abs(sin((vLookPos.x * 0.8 + vLookPos.y * 1.3 + vLookPos.z) * 22.0 + lkNoise(p) * 6.0 + lkNoise(p * 2.3) * 3.0));
              alb = mix(vec3(0.5, 0.5, 0.54), uAlb, smoothstep(0.0, 0.18, v));
            }
            alb = mix(alb, alb * 0.6, lkCloth * 0.85);   // clothes and gear stay readable as a darker tone
            diffuseColor.rgb = mix(diffuseColor.rgb, alb, uAlbMix);
          }`)
        .replace("#include <metalnessmap_fragment>", "#include <metalnessmap_fragment>\nif (uRoughO >= 0.0) roughnessFactor = uRoughO;\nif (uMetalO >= 0.0) metalnessFactor = uMetalO;")
        .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>
          if (uClay > 0.0) {   // hand-sculpted lumps and thumbprints
            vec3 p = vLookPos * 38.0, q = vLookPos * 140.0;
            vec3 n1 = vec3(lkNoise(p) - 0.5, lkNoise(p + 17.1) - 0.5, lkNoise(p + 31.7) - 0.5);
            vec3 n2 = vec3(lkNoise(q) - 0.5, lkNoise(q + 7.3) - 0.5, lkNoise(q + 13.9) - 0.5);
            normal = normalize(normal + uClay * (n1 * 1.4 + n2 * 0.5));
          }`)
        .replace("#include <dithering_fragment>", `#include <dithering_fragment>
          {
            vec3 c = gl_FragColor.rgb;
            float lum = dot(c, vec3(0.299, 0.587, 0.114));
            float fres = pow(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), 2.0);
            c = mix(vec3(lum), c, uSat) * uGrade;
            if (uMode > 6.5 && uMode < 7.5) c += (lkBayer(gl_FragCoord.xy) - 0.5) / max(uPoster, 1.0);       // PS1 dither
            if (uPoster > 0.5) c = floor(c * uPoster + 0.5) / uPoster;
            if (uMode > 1.5 && uMode < 2.5) {        // comic halftone
              float d = length(mod(gl_FragCoord.xy, 7.0) - 3.5), dark = 1.0 - lum;
              c = mix(c, c * 0.3, step(d, dark * 3.6) * step(0.28, dark));
            } else if (uMode > 2.5 && uMode < 3.5) { // pencil
              vec3 paper = vec3(0.96, 0.95, 0.92);
              float s = smoothstep(0.08, 0.75, lum);
              c = paper * mix(0.42, 1.0, s);
              float h1 = step(0.55, fract((gl_FragCoord.x + gl_FragCoord.y) / 4.0));
              float h2 = step(0.55, fract((gl_FragCoord.x - gl_FragCoord.y) / 4.0));
              if (lum < 0.5) c *= mix(1.0, 0.78, h1);
              if (lum < 0.28) c *= mix(1.0, 0.78, h2);
            } else if (uMode > 3.5 && uMode < 4.5) { // night vision
              float g = lum * 1.7 + 0.04 + (lkHash(vec3(gl_FragCoord.xy, uTime * 60.0)) - 0.5) * 0.12;
              c = vec3(0.18, 1.0, 0.3) * g * (0.86 + 0.14 * sin(gl_FragCoord.y * 1.4));
            } else if (uMode > 4.5 && uMode < 5.5) { // thermal
              c = lkHeat(lum * 0.5 + (1.0 - fres) * 0.3 + (1.0 - lkCloth) * 0.3 - lkCloth * 0.05);
            } else if (uMode > 5.5 && uMode < 6.5) { // hologram
              float sc = 0.75 + 0.25 * sin(gl_FragCoord.y * 0.9 - uTime * 8.0);
              c = vec3(0.25, 0.85, 1.0) * (fres * 1.6 + 0.12 + lum * 0.25) * sc;
              gl_FragColor.a = clamp(fres * 1.2 + 0.18, 0.0, 1.0) * 0.9;
            } else if (uMode > 7.5 && uMode < 8.5) { // watercolor paper
              c = mix(c, vec3(1.0), 0.22) * (0.93 + 0.07 * lkHash(vec3(floor(gl_FragCoord.xy * 0.5), 1.0)));
            }
            gl_FragColor.rgb = c;
          }`);
    };
    const prevKey = m.customProgramCacheKey ? m.customProgramCacheKey.bind(m) : () => "";
    m.customProgramCacheKey = () => prevKey() + "|look|" + m.uuid;
    m.needsUpdate = true;
  }
  function patchSceneMaterials() {
    scene.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      const ms = Array.isArray(o.material) ? o.material : [o.material];
      ms.forEach((m) => {
        if (m.isMeshStandardMaterial && !m.userData.lookPatched) { patchLook(m); setHolo(m, curLook.holo); }
        if (o !== ground && o !== shadowPlane && !o.userData.lookShadow) { o.castShadow = true; o.userData.lookShadow = true; }
      });
    });
  }
  function setHolo(m, on) {
    if (!m.isMeshStandardMaterial) return;
    if (m.userData.holo === on) return;
    m.userData.holo = on;
    if (on) { m.userData.base = { t: m.transparent, b: m.blending, d: m.depthWrite }; m.transparent = true; m.blending = THREE.AdditiveBlending; m.depthWrite = false; }
    else if (m.userData.base) { m.transparent = m.userData.base.t; m.blending = m.userData.base.b; m.depthWrite = m.userData.base.d; }
    m.needsUpdate = true;
  }

  // environment, shadows, outlines, grid
  const pmrem = new THREE.PMREMGenerator(renderer);
  let envTex = null;
  const outline = new OutlineEffect(renderer, { defaultThickness: 0.004, defaultColor: [0, 0, 0], defaultAlpha: 1 });
  ground.material.userData.outlineParameters = { visible: false };
  const shadowPlane = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), new THREE.ShadowMaterial({ opacity: 0.35 }));
  shadowPlane.rotation.x = -Math.PI / 2; shadowPlane.position.y = 0.002; shadowPlane.receiveShadow = true; shadowPlane.visible = false;
  shadowPlane.material.userData.outlineParameters = { visible: false };
  scene.add(shadowPlane);
  key.shadow.mapSize.set(2048, 2048); key.shadow.camera.left = -1.2; key.shadow.camera.right = 1.2; key.shadow.camera.top = 2.2; key.shadow.camera.bottom = -0.3;
  key.shadow.camera.near = 0.5; key.shadow.camera.far = 10; key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02;
  const grid = new THREE.GridHelper(8, 40, 0xff2bd6, 0x6b1fbf); grid.visible = false; grid.position.y = 0.001; scene.add(grid);
  const basePR = Math.min(2, window.devicePixelRatio || 1);

  // lights: [hemiSky, hemiGround, hemiI, key color, keyI, rim color, rimI, rim2 color, rim2I, fill color, fillI]
  const RIGS = {
    studio: [0xfff4ea, 0x2a2430, 1.0, 0xfff1e0, 2.6, 0xffb98a, 1.8, 0x9fc2ff, 1.0, 0xc8d6ff, 0.55],
    soft:   [0xffffff, 0x4a4038, 0.7, 0xfff4e6, 2.2, 0xffe3c8, 0.9, 0xd6e4ff, 0.6, 0xe8eeff, 0.45],
    flat:   [0xffffff, 0xb0a8c0, 2.0, 0xffffff, 1.6, 0xffffff, 0.6, 0xffffff, 0.3, 0xffffff, 0.4],
    warm:   [0xfff0d8, 0x5a4030, 1.1, 0xffd9a8, 2.4, 0xffb070, 1.2, 0xa8c8ff, 0.5, 0xffe8cc, 0.5],
    museum: [0xffffff, 0x101014, 0.25, 0xfff6ea, 3.4, 0xd8e4ff, 1.6, 0xffffff, 0.4, 0xffffff, 0.15],
    neon:   [0x3a1060, 0x05010a, 0.35, 0xff5fd2, 1.4, 0xff2bd6, 3.6, 0x22e4ff, 3.4, 0x6a4cff, 0.6],
    bright: [0xffffff, 0x808080, 1.4, 0xffffff, 2.4, 0xffffff, 1.0, 0xffffff, 0.8, 0xffffff, 0.6]
  };
  function setRig(name) {
    const r = RIGS[name] || RIGS.studio;
    hemi.color.set(r[0]); hemi.groundColor.set(r[1]); hemi.intensity = r[2];
    key.color.set(r[3]); key.intensity = r[4]; rim.color.set(r[5]); rim.intensity = r[6];
    rim2.color.set(r[7]); rim2.intensity = r[8]; fill.color.set(r[9]); fill.intensity = r[10];
  }

  const LOOKS = {
    game:       { rig: "studio", env: 0.32, shadows: true },
    photo:      { rig: "soft", env: 0.55, shadows: true, sat: 0.95, exposure: 1.05, bg: "radial-gradient(120% 90% at 50% 15%, #4a4a50 0%, #1c1c20 60%, #0c0c0e 100%)" },
    anime:      { rig: "flat", outline: 0.0045, poster: 4, sat: 1.3, bg: "linear-gradient(180deg, #ffd9ec 0%, #c9e4ff 100%)" },
    comic:      { rig: "flat", outline: 0.007, poster: 3, sat: 1.45, mode: 2, bg: "radial-gradient(circle, #fff3b0 0 2px, #ffe066 2px) 0 0 / 10px 10px" },
    clay:       { rig: "warm", clay: 1.0, rough: 1, sat: 1.35, grade: [1.05, 1.0, 0.92], fps: 10, bg: "linear-gradient(180deg, #d9b98c 0%, #a8845a 100%)" },
    sculpt:     { rig: "studio", albMix: 1, alb: 0xb7a597, rough: 0.62, clay: 0.12, bg: "radial-gradient(110% 90% at 50% 20%, #6b6b70 0%, #2b2b30 100%)" },
    marble:     { rig: "museum", albMix: 1, albMode: 1, alb: 0xf1efe9, rough: 0.22, env: 0.5, shadows: true, bg: "radial-gradient(90% 70% at 50% 30%, #2a2a30 0%, #050506 100%)" },
    gold:       { rig: "museum", albMix: 1, alb: 0xffc95a, rough: 0.2, metal: 1, env: 1.1, shadows: true, exposure: 1.1, bg: "radial-gradient(90% 70% at 50% 30%, #2a0d16 0%, #050003 100%)" },
    synth:      { rig: "neon", sat: 1.35, exposure: 1.15, grid: true, bg: "linear-gradient(180deg, #12002b 0%, #3a0a5e 55%, #ff2bd6 140%)" },
    pencil:     { rig: "bright", outline: 0.003, outlineColor: [0.15, 0.15, 0.17], mode: 3, bg: "#f4f2ec" },
    ps1:        { rig: "studio", poster: 6, mode: 7, sat: 1.15, pixel: 0.28, bg: "linear-gradient(180deg, #1b2a6b 0%, #0a0f2e 100%)" },
    watercolor: { rig: "soft", poster: 5, sat: 0.75, mode: 8, bg: "#f6f1e7" },
    nightvision:{ rig: "bright", mode: 4, bg: "radial-gradient(80% 70% at 50% 40%, #0b2a10 0%, #000 100%)" },
    thermal:    { rig: "bright", mode: 5, bg: "#050018" },
    hologram:   { rig: "studio", mode: 6, holo: true, bg: "radial-gradient(80% 70% at 50% 50%, #062a3a 0%, #00060c 100%)" }
  };
  let curLook = LOOKS.game, curLookId = "";
  const DEFAULT_BG = "";
  let lookBg = DEFAULT_BG, curBg = "white";
  // the picked Background shows behind her for the everyday looks; stylised looks keep their own backdrop
  function applyBg() {
    const plain = !curLookId || curLookId === "game" || curLookId === "photo";
    const want = plain && curBg && curBg !== "white" ? curBg : "";
    const was = bgOn; bgOn = !!want; bgWant = want;
    if (want) {
      canvasWrap.style.background = "#0c0d10";
      const flat = () => {
        hideSky(); panoOn = false;
        const useT = (t) => { backdrop.material.map = t; backdrop.material.needsUpdate = true; const ft = floorFrom(want, t.image); floor.material.map = ft; floor.material.needsUpdate = true; floor.visible = true; skyFill.material.color.copy(ft.userData.sky); skyFill.visible = true; };
        if (bgTex[want]) useT(bgTex[want]);
        else new THREE.TextureLoader().load(new URL("img/baddies/bg3d/" + want + ".webp?v=4", document.baseURI).href, (t) => {
          t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; bgTex[want] = t;
          if (bgWant === want && !panoOn) useT(t);
        });
        backdrop.visible = true;
      };
      panoId = want;
      if (panoTex[want]) showPano(panoTex[want]);
      else { flat(); loadPano(want, (t) => { if (t && bgWant === want && bgOn) showPano(t); }); }
      ground.visible = true;
      controls.maxDistance = 7; controls.minPolarAngle = 0.35; controls.maxPolarAngle = Math.PI / 2 + 0.3;
      if (!was) frameForBackdrop();
    } else if (plain && (!curBg || curBg === "white")) {   // white studio: light seamless sweep with her shadow on the floor
      backdrop.visible = false; floor.visible = false; skyFill.visible = false; hideSky(); panoOn = false;
      canvasWrap.style.background = "radial-gradient(120% 85% at 50% 35%, #ffffff 0%, #f1f1f2 45%, #dcdcde 100%)";
      controls.maxDistance = 5.5; controls.minPolarAngle = 0.25; controls.maxPolarAngle = Math.PI / 2 + 0.12;
      ground.visible = true;
      if (was) unframeBackdrop();
    } else {
      if (was) unframeBackdrop();
      backdrop.visible = false; floor.visible = false; skyFill.visible = false; hideSky(); panoOn = false; canvasWrap.style.background = lookBg;
      controls.maxDistance = 5.5; controls.minPolarAngle = 0.25; controls.maxPolarAngle = Math.PI / 2 + 0.12;
      if (curLook && !curLook.holo && !curLook.grid && !curLook.shadows) ground.visible = true;
    }
  }
  // fixed "scene" framing: fits a 7'6" person, so shorter heights read as shorter against the background
  function frameForBackdrop() {
    const off = camera.position.clone().sub(controls.target); off.y = 0; if (off.lengthSq() < 1e-6) off.set(0, 0, 1);
    off.setLength(5.6); controls.target.set(0, 1.05, 0); camera.position.set(off.x, 1.1, off.z); controls.update();
  }
  function unframeBackdrop() {   // back to the normal follow-her-height framing
    const off = camera.position.clone().sub(controls.target); off.y = 0; if (off.lengthSq() < 1e-6) off.set(0, 0, 1);
    off.setLength(3.9); controls.target.set(0, lastTy, 0); camera.position.set(off.x, lastTy + 0.18, off.z); controls.update();
  }
  function placeBackdrop() {
    if (bgOn && camera.position.y < 0.06) { camera.position.y = 0.06; }   // never under the ground
    if (floor.visible) floor.position.set(camera.position.x, 0, camera.position.z);
    if (skyFill.visible) skyFill.position.copy(camera.position);
    if (!backdrop.visible) return;
    const dir = controls.target.clone().sub(camera.position); dir.y = 0; if (dir.lengthSq() < 1e-6) return; dir.normalize();
    const flat = camera.position.clone().sub(controls.target); flat.y = 0;
    const L = BG_D + flat.length(), W = 2 * L * BG_FOV, Hh = W * BG_AR, hz = BG_HORIZON[bgWant] ?? 0.55;
    backdrop.scale.set(W, Hh, 1);
    backdrop.position.set(controls.target.x + dir.x * BG_D, camera.position.y + (hz - 0.5) * Hh, controls.target.z + dir.z * BG_D);
    backdrop.rotation.set(0, Math.atan2(-dir.x, -dir.z), 0);
  }
  function applyLook(id) {
    if (id === curLookId) return;
    const L = LOOKS[id] || LOOKS.game; curLookId = LOOKS[id] ? id : "game"; curLook = L;
    setRig(L.rig);
    LOOKU.uMode.value = L.mode || 0; LOOKU.uPoster.value = L.poster || 0; LOOKU.uSat.value = L.sat ?? 1;
    LOOKU.uGrade.value.set(...(L.grade || [1, 1, 1]));
    LOOKU.uAlbMix.value = L.albMix || 0; LOOKU.uAlbMode.value = L.albMode || 0; LOOKU.uAlb.value.set(L.alb ?? 0xffffff);
    LOOKU.uRoughO.value = L.rough ?? -1; LOOKU.uMetalO.value = L.metal ?? -1; LOOKU.uClay.value = L.clay || 0;
    renderer.toneMappingExposure = L.exposure ?? 1.0;
    if (L.env) { if (!envTex) envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture; scene.environment = envTex; scene.environmentIntensity = L.env; }
    else scene.environment = null;
    const sh = !!L.shadows;
    if (renderer.shadowMap.enabled !== sh) {
      renderer.shadowMap.enabled = sh; renderer.shadowMap.type = THREE.PCFSoftShadowMap; key.castShadow = sh;
      scene.traverse((o) => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { m.needsUpdate = true; }); });
    }
    shadowPlane.visible = sh; ground.visible = !sh && !L.holo && !L.grid && !bgOn;
    grid.visible = !!L.grid;
    outline.defaultThickness = L.outline || 0.004; outline.defaultColor = L.outlineColor || [0, 0, 0];
    renderer.setPixelRatio(basePR * (L.pixel || 1));
    renderer.domElement.style.imageRendering = L.pixel ? "pixelated" : "";
    resize();
    lookBg = L.bg || DEFAULT_BG; applyBg();
    scene.traverse((o) => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => setHolo(m, !!L.holo)); });
    box.setAttribute("data-look", curLookId);
  }
  function paintLookStrip(active) {
    const strip = document.getElementById("bdLooks"); if (!strip) return;
    const list = window.BADDIES_STYLES || [];
    if (!strip.childElementCount && list.length) {
      strip.innerHTML = list.map((st) => '<button type="button" data-look="' + st[0] + '">' + st[1] + "</button>").join("");
      strip.addEventListener("click", (e) => { const b = e.target.closest("[data-look]"); if (b && window.BADDIES_SET_STYLE) window.BADDIES_SET_STYLE(b.getAttribute("data-look")); });
    }
    strip.querySelectorAll("[data-look]").forEach((b) => b.classList.toggle("is-on", b.getAttribute("data-look") === active));
    const on = strip.querySelector(".is-on"); if (on && on.scrollIntoView && strip.dataset.last !== active) { strip.dataset.last = active; on.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" }); }
  }

  // ------------------------------------------------------------ loop / resize / ui
  function resize() {
    const w = canvasWrap.clientWidth, h = canvasWrap.clientHeight; if (!w || !h) return;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(canvasWrap); resize();
  let visible = true;
  new IntersectionObserver((en) => { visible = en[0].isIntersecting; }).observe(canvasWrap);
  const clock = new THREE.Clock(); let stepAcc = 0;
  renderer.setAnimationLoop(() => {
    if (!visible || document.hidden) return;
    const dt = clock.getDelta();
    LOOKU.uTime.value += dt;
    if (curLook.fps) {                                   // stop-motion: only move on whole frames
      stepAcc += dt; if (stepAcc < 1 / curLook.fps) return;
      controls.autoRotateSpeed = 1.6 * (stepAcc * 60); stepAcc = 0;
    } else controls.autoRotateSpeed = 1.6;
    controls.update();
    ruler.rotation.y = Math.atan2(camera.position.x - controls.target.x, camera.position.z - controls.target.z);
    patchSceneMaterials();
    placeBackdrop();
    upShadowFix();
    if (curLook.outline) outline.render(scene, camera); else renderer.render(scene, camera);
  });

  // ------------------------------------------------------------ custom pose: drag the hands, feet and hips
  const handleGroup = new THREE.Group(); handleGroup.visible = false; scene.add(handleGroup);
  const handles = {};
  [["hr", 0x29b6ff], ["hl", 0x29b6ff], ["fr", 0x5be37d], ["fl", 0x5be37d], ["pelvis", 0xff6a1f]].forEach(([k, c]) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(k === "pelvis" ? 0.04 : 0.032, 18, 12), new THREE.MeshBasicMaterial({ color: c, depthTest: false, transparent: true, opacity: 0.92 }));
    m.renderOrder = 999; m.userData.key = k; handleGroup.add(m); handles[k] = m;
  });
  function placeHandles(show) {
    handleGroup.visible = !!show && !!lastTargets;
    if (!handleGroup.visible) return;
    holder.updateMatrixWorld(true);
    ["hr", "hl", "fr", "fl"].forEach((k) => handles[k].position.copy(holder.localToWorld(v3(...lastTargets[k]))));
    const pw = new THREE.Vector3(); if (B.pelvis) B.pelvis.getWorldPosition(pw); handles.pelvis.position.copy(pw);
  }
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), dom = renderer.domElement;
  let drag = null, dragQueued = false;
  function setNdc(e) { const r = dom.getBoundingClientRect(); ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); }
  dom.addEventListener("pointerdown", (e) => {
    if (!handleGroup.visible) return;
    setNdc(e); ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(handleGroup.children)[0]; if (!hit) return;
    e.stopImmediatePropagation(); e.preventDefault();
    controls.enabled = false; controls.autoRotate = false; syncSpin();
    const n = camera.getWorldDirection(new THREE.Vector3());
    const base = (pendingState && pendingState.pose && pendingState.pose.custom) || lastTargets;
    drag = { key: hit.object.userData.key, plane: new THREE.Plane().setFromNormalAndCoplanarPoint(n, hit.object.position.clone()),
      startY: holder.worldToLocal(hit.object.position.clone()).y, custom: JSON.parse(JSON.stringify(base)) };
    drag.pdy0 = drag.custom.pdy || 0;
    dom.setPointerCapture(e.pointerId); box.classList.add("is-posing");
  }, { capture: true });
  dom.addEventListener("pointermove", (e) => {
    if (!drag) {
      if (!handleGroup.visible) return;
      setNdc(e); ray.setFromCamera(ndc, camera);
      dom.style.cursor = ray.intersectObjects(handleGroup.children).length ? "grab" : ""; return;
    }
    setNdc(e); ray.setFromCamera(ndc, camera);
    const pt = new THREE.Vector3(); if (!ray.ray.intersectPlane(drag.plane, pt)) return;
    const lp = holder.worldToLocal(pt);
    if (drag.key === "pelvis") drag.custom.pdy = Math.max(-0.5, Math.min(0.05, drag.pdy0 + (lp.y - drag.startY)));
    else {
      if (drag.key[0] === "f") lp.y = Math.max(0.02, lp.y);
      drag.custom[drag.key] = lp.toArray();
    }
    if (!dragQueued) { dragQueued = true; requestAnimationFrame(() => { dragQueued = false; if (drag) build(Object.assign({}, pendingState, { pose: Object.assign({}, pendingState.pose || {}, { preset: "custom", custom: drag.custom }) })); }); }
  });
  function endDrag(e) {
    if (!drag) return;
    const custom = drag.custom; drag = null; controls.enabled = true; box.classList.remove("is-posing"); dom.style.cursor = "";
    try { dom.releasePointerCapture(e.pointerId); } catch (_) {}
    if (window.BADDIES_SET_POSE) window.BADDIES_SET_POSE(custom);
  }
  dom.addEventListener("pointerup", endDrag); dom.addEventListener("pointercancel", endDrag);

  // A clean front-view picture of the current pose (grey sculpt look, no ruler), used as the
  // pose reference for the AI render.
  // Words for the current 3D pose (used when the AI edits a character's own photo into the pose).
  window.BADDIES_POSE_DESC = function (opts) {
    opts = opts || {};
    if (!body || !B.pelvis) return "";
    const P = bonePos("pelvis"), Hd = bonePos("head"), N = bonePos("neck_01");
    const sh = { r: bonePos("upperarm_r"), l: bonePos("upperarm_l") }, hand = { r: bonePos("hand_r"), l: bonePos("hand_l") };
    const knee = { r: bonePos("calf_r"), l: bonePos("calf_l") }, foot = { r: bonePos("foot_r"), l: bonePos("foot_l") };
    const out = [], drop = pelvisRestY - P.y;
    if (knee.r.y < 0.16 && knee.l.y < 0.16 && hand.r.y < 0.18 && hand.l.y < 0.18 && P.y < 0.75)
      return "on all fours on her hands and knees, palms flat on the ground under her shoulders, back level, shins flat on the ground behind her, head up looking ahead";
    const kneelSide = knee.r.y < 0.14 ? "right" : knee.l.y < 0.14 ? "left" : "";
    const feetAhead = (foot.r.z + foot.l.z) / 2 - P.z;
    const seated = !!curSeat || (!kneelSide && drop > 0.2 && feetAhead > 0.15);
    if (seated) {
      const SW = { chair: "sitting on a chair", stool: "sitting on a tall stool", crate: "sitting on a crate", steps: "sitting on steps", floor: "sitting on the floor" };
      out.push(curSeat ? SW[curSeat.type] : (P.y < 0.35 ? "sitting on the floor" : "sitting down on a low seat"));
      const kneesUp = (knee.r.y + knee.l.y) / 2 > P.y + 0.05;
      if (Math.abs(foot.r.x + foot.l.x) < 0.1 && Math.abs(foot.r.x - foot.l.x) < 0.2 && Math.abs(knee.r.x - knee.l.x) > 0.45) out.push("legs crossed");
      else if (kneesUp) out.push("knees bent up in front of her");
      else if (Math.abs(foot.r.x - foot.l.x) <= 0.45) out.push("knees bent, thighs forward");
      if (Math.abs(knee.r.x - knee.l.x) > 0.45) out.push("knees apart");
      if (foot.r.y > 0.12 && foot.l.y > 0.12 && curSeat && curSeat.type !== "floor") out.push("feet off the ground");
      if (Math.abs(foot.r.x - foot.l.x) > 0.45) out.push(kneesUp ? "feet planted wide apart on the floor in front of her, legs not crossed" : "legs spread wide apart in a V and stretched out in front of her, knees only slightly bent, heels on the floor, legs not crossed");
    } else if (kneelSide) out.push("kneeling on her " + kneelSide + " knee with the other foot planted in front");
    else if (drop > 0.26) out.push("in a deep squat with her hips dropped low, knees bent" + (Math.abs(knee.r.x - knee.l.x) > 0.4 ? " and pointing outward" : ""));
    else if (drop > 0.1) out.push("in a half squat with her knees bent");
    else out.push("standing");
    const spread = Math.abs(foot.r.x - foot.l.x), stride = foot.r.z - foot.l.z;
    if (!kneelSide && !seated) {
      if (spread > 0.5) out.push("feet planted wide apart"); else if (spread < 0.16) out.push("feet close together");
      if (stride > 0.18) out.push("her right foot stepped forward"); else if (stride < -0.18) out.push("her left foot stepped forward");
      if (foot.r.y > 0.14) out.push("her right foot lifted off the ground"); if (foot.l.y > 0.14) out.push("her left foot lifted off the ground");
    }
    function handWords(side) {
      const h = hand[side], other = side === "r" ? "l" : "r", sgn = side === "r" ? -1 : 1, x = h.x * sgn; // x > 0 = toward her own side
      const onKnee = (k) => Math.hypot(h.x - k.x, h.z - k.z) < 0.2 && h.y > k.y - 0.08 && h.y < k.y + 0.22 && k.y < P.y + 0.05;
      if (onKnee(knee[side])) return "resting on her " + (side === "r" ? "right" : "left") + " knee";
      if (onKnee(knee[other])) return "resting on her other knee";
      if (h.y > Hd.y + 0.08) return "raised up above her head";
      if (Math.abs(h.y - Hd.y) < 0.12 && Math.abs(h.x - Hd.x) < 0.2) return "up beside her face";
      if (x < -0.04 && h.y > P.y && h.y < N.y) return "across her chest";
      const chestY = (N.y + P.y) / 2 + 0.08, spineZ = (N.z + P.z) / 2;
      if (Math.abs(h.y - chestY) < 0.13 && Math.abs(h.x) < 0.2 && h.z - spineZ < 0.24) return "pressed flat against her chest";
      if (h.y > P.y + 0.04 && h.y < chestY - 0.1 && Math.abs(h.x) < 0.18 && h.z - P.z < 0.24) return "resting on her stomach";
      if (h.y > Hd.y - 0.05 && Math.abs(h.x - Hd.x) < 0.22 && h.z < Hd.z) return "behind her head";
      if (h.y < 0.12) return "planted on the floor " + (h.z < P.z - 0.05 ? "behind her" : h.z > P.z + 0.25 ? "in front of her" : "beside her hip");
      const walking = Math.abs(foot.r.z - foot.l.z) > 0.18;
      if (h.z < -0.08 && h.y < P.y + 0.1) return walking ? "swinging back behind her hip" : "behind her hip";
      if (Math.abs(h.y - (P.y + 0.06)) < 0.11 && x > 0.12 && Math.abs(h.z) < 0.1) return "on her hip";
      if (h.z > 0.1 && h.y < P.y + 0.1 && h.y > P.y - 0.25 && h.z < 0.35) return walking ? "swinging forward" : "held low in front of her";
      if (h.z > 0.35) return "reaching forward " + (h.y > sh[side].y - 0.05 ? "at shoulder height" : h.y > P.y ? "at chest height" : "low");
      if (h.z < -0.12) return "behind her";
      if (h.y > sh[side].y - 0.05) return "raised out to the side at shoulder height";
      if (h.y < P.y - 0.05) return "down by her side";
      return "held in front of her waist";
    }
    const S = N.clone().sub(P), sl = S.length() || 1;
    if (S.z / sl < -0.18) out.push("upper body reclined, leaning back"); else if (S.z / sl > 0.22) out.push("upper body leaning forward");
    if (Math.abs(S.x) / sl > 0.2) out.push("leaning to her " + (S.x > 0 ? "left" : "right"));
    // hands go first: the image model weights early words more, and hands are what it drops
    if (opts.hands !== false) {
      const hr = handWords("r"), hl = handWords("l");
      const hands = hr === hl ? "both hands " + hr.replace("her right knee", "her knees").replace("her left knee", "her knees") : "right hand " + hr + ", left hand " + hl;
      out.unshift("HANDS: " + hands);
    }
    return out.join(", ");
  };

  // OpenPose-style skeleton (COCO 18 keypoints) of the current 3D pose, from the same camera as the
  // snapshot. Qwen Image Edit 2509 reads keypoint maps natively, so this pins the pose exactly.
  function snapCamera(W, H) {
    const cam = new THREE.PerspectiveCamera(camera.fov, W / H, 0.05, camera.far);
    const sc = holder.scale.y, top = ((B.head ? bonePos("head").y : 1.5) + 0.2) * sc, t14 = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const d = Math.max((top * 0.66) / t14, (0.6 * sc) / (t14 * (W / H)));
    cam.position.set(0, top * 0.52, d); cam.lookAt(0, top * 0.5, 0); cam.updateMatrixWorld(true); cam.updateProjectionMatrix();
    return cam;
  }
  window.BADDIES_POSE_SKELETON = async function () {
    if (!body || !B.pelvis) return null;
    const W = 640, H = 960, cam = snapCamera(W, H);
    holder.updateMatrixWorld(true);
    const hp = (name) => { const p = new THREE.Vector3(); B[name].getWorldPosition(p); return p; };
    // face points: laid out on the resting head, moved with the posed head
    let delta = new THREE.Matrix4();
    if (headRestM && B.head) delta = holder.matrixWorld.clone().invert().multiply(B.head.matrixWorld).multiply(headRestM.clone().invert());
    const facePt = (v) => holder.localToWorld(v.clone().applyMatrix4(delta));
    const eyL = eyeInfo ? eyeInfo.l.clone() : v3(0.032, 1.5, 0.08), eyR = eyeInfo ? eyeInfo.r.clone() : v3(-0.032, 1.5, 0.08);
    const front = eyeInfo ? eyeInfo.front : 0.09, cz = headInfo ? headInfo.c.z : 0.0;
    const nose = v3(0, (eyL.y + eyR.y) / 2 - 0.035, front + 0.012);
    eyL.z = eyR.z = front;
    const earL = v3(0.075, eyL.y - 0.01, cz), earR = v3(-0.075, eyR.y - 0.01, cz);
    const pts = [
      facePt(nose), hp("neck_01"), hp("upperarm_r"), hp("lowerarm_r"), hp("hand_r"), hp("upperarm_l"), hp("lowerarm_l"), hp("hand_l"),
      hp("thigh_r"), hp("calf_r"), hp("foot_r"), hp("thigh_l"), hp("calf_l"), hp("foot_l"),
      facePt(eyR), facePt(eyL), facePt(earR), facePt(earL)
    ].map((p) => { const q = p.clone().project(cam); return [(q.x + 1) / 2 * W, (1 - q.y) / 2 * H]; });
    const c = document.createElement("canvas"); c.width = W; c.height = H;
    const g = c.getContext("2d"); g.fillStyle = "#000"; g.fillRect(0, 0, W, H);
    const COL = [[255,0,0],[255,85,0],[255,170,0],[255,255,0],[170,255,0],[85,255,0],[0,255,0],[0,255,85],[0,255,170],[0,255,255],[0,170,255],[0,85,255],[0,0,255],[85,0,255],[170,0,255],[255,0,255],[255,0,170],[255,0,85]];
    const LIMBS = [[1,2],[1,5],[2,3],[3,4],[5,6],[6,7],[1,8],[8,9],[9,10],[1,11],[11,12],[12,13],[1,0],[0,14],[14,16],[0,15],[15,17]];
    const sw = Math.round(W / 80);
    LIMBS.forEach(([a, b2], i) => {
      const A = pts[a], Bp = pts[b2], mx = (A[0] + Bp[0]) / 2, my = (A[1] + Bp[1]) / 2, len = Math.hypot(A[0] - Bp[0], A[1] - Bp[1]) / 2, ang = Math.atan2(A[1] - Bp[1], A[0] - Bp[0]);
      g.fillStyle = "rgba(" + COL[i].join(",") + ",0.6)"; g.beginPath(); g.ellipse(mx, my, len, sw, ang, 0, Math.PI * 2); g.fill();
    });
    pts.forEach((p, i) => { g.fillStyle = "rgb(" + COL[i].join(",") + ")"; g.beginPath(); g.arc(p[0], p[1], sw * 0.8, 0, Math.PI * 2); g.fill(); });
    return await new Promise((res) => c.toBlob(res, "image/png"));
  };

  window.BADDIES_POSE_SNAPSHOT = async function () {
    const W = 640, H = 960, prevLook = curLookId || "game";
    const vis = [ruler.visible, handleGroup.visible, grid.visible, ground.visible];
    const cp = camera.position.clone(), ct = controls.target.clone(), ar = controls.autoRotate, pr = renderer.getPixelRatio(), bg = canvasWrap.style.background;
    try {
      curLookId = ""; applyLook("game");
      ruler.visible = false; handleGroup.visible = false; grid.visible = false; backdrop.visible = false;
      controls.autoRotate = false;
      // frame the pose itself (a squat or kneel is much shorter than standing)
      const sc = holder.scale.y, top = ((B.head ? bonePos("head").y : 1.5) + 0.2) * sc, t14 = Math.tan(THREE.MathUtils.degToRad(14));
      const d = Math.max((top * 0.66) / t14, (0.6 * sc) / (t14 * (W / H)));
      camera.position.set(0, top * 0.52, d); camera.lookAt(0, top * 0.5, 0);
      renderer.setPixelRatio(1); renderer.setSize(W, H, false); camera.aspect = W / H; camera.updateProjectionMatrix();
      renderer.setClearColor(0xf0f0f0, 1);
      renderer.render(scene, camera);
      return await new Promise((res) => dom.toBlob(res, "image/png"));
    } finally {
      renderer.setClearColor(0x000000, 0);
      ruler.visible = vis[0]; handleGroup.visible = vis[1]; grid.visible = vis[2]; backdrop.visible = bgOn;
      camera.position.copy(cp); controls.target.copy(ct); controls.autoRotate = ar;
      curLookId = ""; applyLook(prevLook); renderer.setPixelRatio(pr); resize(); controls.update();
      canvasWrap.style.background = bg;
    }
  };

  // ---- the viewer's camera, for "Viewer angle" renders: where it is relative to her, and a picture from exactly there
  function camInfo() {
    holder.updateMatrixWorld(true); camera.updateMatrixWorld();
    const toW = (v) => holder.localToWorld(v.clone());
    const head = B.head ? toW(bonePos("head")) : v3(0, 1.5, 0), top = head.clone().add(v3(0, 0.13 * holder.scale.y, 0));
    const pel = B.pelvis ? toW(bonePos("pelvis")) : v3(0, 0.9, 0), knee = B.calf_l ? toW(bonePos("calf_l")).lerp(toW(bonePos("calf_r")), 0.5) : v3(0, 0.48, 0);
    const chest = B.spine_03 ? toW(bonePos("spine_03")).add(v3(0, 0.1 * holder.scale.y, 0)) : v3(0, 1.2, 0);
    const feet = v3(pel.x, 0.02, pel.z), hgt = Math.max(0.5, top.y);
    const inView = (p) => { const q = p.clone().project(camera); return q.z < 1 && Math.abs(q.x) <= 1.02 && Math.abs(q.y) <= 1.02; };
    // vertical framing: lowest body landmark still in frame
    const frame = inView(feet) ? "full" : inView(knee) ? "knees" : inView(pel) ? "waist" : inView(chest) ? "chest" : "face";
    // camera height vs her and how steeply it looks
    const camH = camera.position.y / hgt, look = camera.getWorldDirection(new THREE.Vector3()), pitch = Math.asin(Math.max(-1, Math.min(1, look.y))) * 180 / Math.PI;
    // which side of her it sees: her facing is +z turned by the body turn and torso twist
    const across = B.upperarm_l && B.upperarm_r ? toW(bonePos("upperarm_l")).sub(toW(bonePos("upperarm_r"))) : new THREE.Vector3(1, 0, 0).applyQuaternion(holder.quaternion);
    const facing = new THREE.Vector3().crossVectors(across, new THREE.Vector3(0, 1, 0)); facing.y = 0; facing.normalize();
    const toCam = camera.position.clone().sub(pel); toCam.y = 0; toCam.normalize();
    let az = Math.atan2(new THREE.Vector3().crossVectors(facing, toCam).y, facing.dot(toCam)) * 180 / Math.PI;   // 0 = front, +90 = her left
    const dist = camera.position.distanceTo(chest) / holder.scale.y;
    return { frame, camH: +camH.toFixed(2), pitch: Math.round(pitch), az: Math.round(az), dist: +dist.toFixed(2), aspect: +(canvasWrap.clientWidth / Math.max(1, canvasWrap.clientHeight)).toFixed(3), fov: camera.fov, bg: bgOn, pano: panoOn };
  }
  window.BADDIES_CAMERA = camInfo;
  // the current view, as seen in the viewer (background on), without the height ruler and pose handles
  window.BADDIES_CAMERA_SNAPSHOT = async function (W, H) {
    const vis = [ruler.visible, handleGroup.visible], ar = controls.autoRotate, pr = renderer.getPixelRatio();
    try {
      ruler.visible = false; handleGroup.visible = false; controls.autoRotate = false;
      renderer.setPixelRatio(1); renderer.setSize(W, H, false); camera.aspect = W / H; camera.updateProjectionMatrix();
      if (!bgOn) renderer.setClearColor(0xf0f0f0, 1);
      placeBackdrop();
      upShadowFix();
    if (curLook.outline) outline.render(scene, camera); else renderer.render(scene, camera);
      return await new Promise((res) => dom.toBlob(res, "image/png"));
    } finally {
      renderer.setClearColor(0x000000, 0); ruler.visible = vis[0]; handleGroup.visible = vis[1]; controls.autoRotate = ar;
      renderer.setPixelRatio(pr); resize(); controls.update();
    }
  };

  let queued = null;
  function queue(st) { queued = st; requestAnimationFrame(() => { if (queued) { build(queued); queued = null; } }); }
  window.addEventListener("baddies:change", (ev) => queue(ev.detail));

  function setView(az) {
    const d = camera.position.distanceTo(controls.target);
    controls.autoRotate = false; syncSpin();
    camera.position.set(Math.sin(az) * d, controls.target.y + 0.15, Math.cos(az) * d); controls.update();
  }
  // one-tap camera angles: from above, from the ground, and a close-up (keeps the current side)
  function camPreset(v) {
    controls.autoRotate = false; syncSpin();
    const sc = holder.scale.y, off = camera.position.clone().sub(controls.target); off.y = 0; if (off.lengthSq() < 1e-6) off.set(0, 0, 1); off.normalize();
    const hgt = 1.6 * sc;
    if (v === "high") { controls.target.set(0, hgt * 0.45, 0); camera.position.set(off.x * 2.6 * sc, hgt * 1.75, off.z * 2.6 * sc); }
    else if (v === "low") { controls.target.set(0, hgt * 0.6, 0); camera.position.set(off.x * 2.6 * sc, 0.22, off.z * 2.6 * sc); }
    else { controls.target.set(0, hgt * 0.86, 0); camera.position.set(off.x * 1.05 * sc, hgt * 0.9, off.z * 1.05 * sc); }
    controls.update();
  }
  function syncSpin() { const b = document.getElementById("bdSpin"); if (b) { b.classList.toggle("is-on", controls.autoRotate); b.setAttribute("aria-pressed", controls.autoRotate); } }
  box.addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-pv]"); if (!b) return;
    const v = b.getAttribute("data-pv");
    if (v === "spin") { controls.autoRotate = !controls.autoRotate; syncSpin(); }
    else if (v === "front") setView(0); else if (v === "side") setView(Math.PI / 2); else if (v === "back") setView(Math.PI);
    else if (v === "high" || v === "low" || v === "close") camPreset(v);
  });
  renderer.domElement.addEventListener("pointerdown", () => { if (controls.autoRotate) { controls.autoRotate = false; syncSpin(); } });
  syncSpin();
  window.BADDIES_3D = { build, scene, camera, controls, bones: B, get body() { return body; }, get faceIdx() { return faceIdx; }, faceFrame: () => faceFrame(), get faceRestF() { return faceRestF; }, get gar() { return { G, shells, hairCap, headDome, headArc, headRay }; }, get dbg() { return { eyeInfo, headInfo, faceFit, extras, holder, eyeRestF, eyeNow: eyeFrame(), faceNow: faceFrame(), faceRestF, eyesSkinned: !!(eyes && eyes.isSkinnedMesh), eyesName: eyes && eyes.name }; } };
}
