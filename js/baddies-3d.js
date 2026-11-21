// AI Resource Hub — Baddies Generator live 3D preview.
// A stylized, rotatable mannequin that follows the settings in real time:
// skin tone, height, exaggeration and each body slider, hair, outfit colors,
// gear, boots, tattoos and the weapon. It's a rough guide, not the render.
// Listens for the "baddies:change" event from js/baddies.js.

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const box = document.getElementById("bdPreview");
const canvasWrap = document.getElementById("bdPreviewCanvas");
if (box && canvasWrap) init();

function init() {
  // ------------------------------------------------------------ scene
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  canvasWrap.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 50);
  camera.position.set(0.35, 1.05, 3.9);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0.86, 0);
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.minDistance = 1.4;
  controls.maxDistance = 5.5;
  controls.minPolarAngle = 0.25;
  controls.maxPolarAngle = Math.PI / 2 + 0.12;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 1.6;

  scene.add(new THREE.HemisphereLight(0xffffff, 0x3a3340, 1.35));
  const key = new THREE.DirectionalLight(0xffffff, 2.1); key.position.set(2, 3.5, 3); scene.add(key);
  const rim = new THREE.DirectionalLight(0xffc7a0, 1.2); rim.position.set(-2.5, 2.5, -3); scene.add(rim);
  const fill = new THREE.DirectionalLight(0xbfd4ff, 0.6); fill.position.set(-3, 1, 2); scene.add(fill);

  // ground shadow
  const shadowTex = radialTex();
  const ground = new THREE.Mesh(new THREE.CircleGeometry(0.6, 48), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = 0.001; scene.add(ground);

  const IN = 1.68 / 66;          // 66 inches = 1.68 m
  const ruler = new THREE.Group(); scene.add(ruler);
  let figure = new THREE.Group(); scene.add(figure);

  // ------------------------------------------------------------ helpers
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
    snow: ["#e9ebee", "#c9cdd3", "#9aa0a8", "#ffffff"],
    desert: ["#d2b48c", "#b8956a", "#8f7350", "#e3cfa6"],
    woodland: ["#5b6b3a", "#3f4a26", "#7d6b46", "#2b2f1c"],
    urban: ["#1b1c1f", "#2b2d31", "#3a3c41", "#111214"],
    navy: ["#1f2d4d", "#30436b", "#4b5f8a", "#15203a"],
    pink: ["#f2a7c3", "#e27ca4", "#c95b86", "#f8cfdf"],
    red: ["#141416", "#26272b", "#b3202a", "#1d1e22"]
  };
  function camoTex(id) {
    const p = CAMO[id] || CAMO.snow;
    return canvasTex("camo-" + id, 256, 256, (g, w, h) => {
      const r = rnd(id.length * 977 + 13);
      g.fillStyle = p[0]; g.fillRect(0, 0, w, h);
      for (let layer = 1; layer < p.length; layer++) {
        g.fillStyle = p[layer];
        for (let i = 0; i < 26; i++) {
          const x = r() * w, y = r() * h, rr = 8 + r() * 26;
          g.beginPath();
          for (let a = 0; a < 7; a++) { const ang = a / 7 * Math.PI * 2, d = rr * (0.6 + r() * 0.6); g.lineTo(x + Math.cos(ang) * d, y + Math.sin(ang) * d * 0.7); }
          g.closePath(); g.fill();
          // wrap copies so the texture tiles
          g.save(); g.translate(x > w / 2 ? -w : w, 0); g.fill(); g.restore();
        }
      }
    });
  }
  const INK = {
    color: ["#d7263d", "#f46036", "#ffd23f", "#1b998b", "#2e86ab", "#7b2cbf", "#111111"],
    blackgrey: ["#151515", "#2a2a2a", "#444444", "#5c5c5c"],
    japanese: ["#c1121f", "#003049", "#f77f00", "#2a9d8f", "#111111"],
    script: ["#141414", "#2b2b2b"]
  };
  function skinTex(skin, inkStyle, density) {
    const key = "skin-" + skin + "-" + inkStyle + "-" + density;
    const t = canvasTex(key, 256, 256, (g, w, h) => {
      g.fillStyle = skin; g.fillRect(0, 0, w, h);
      if (!density) return;
      const pal = INK[inkStyle] || INK.color, r = rnd(skin.length * 31 + inkStyle.length * 7 + density);
      g.lineCap = "round"; g.lineJoin = "round";
      const n = inkStyle === "script" ? 14 : 18 * density;
      for (let i = 0; i < n; i++) {
        g.strokeStyle = pal[Math.floor(r() * pal.length)]; g.fillStyle = g.strokeStyle;
        g.lineWidth = inkStyle === "script" ? 1.5 : 1.5 + r() * 3;
        g.globalAlpha = 0.85;
        const x = r() * w, y = r() * h;
        g.beginPath(); g.moveTo(x, y);
        for (let k = 0; k < 4; k++) g.quadraticCurveTo(x + (r() - 0.5) * 70, y + (r() - 0.5) * 70, x + (r() - 0.5) * 60, y + (r() - 0.5) * 60);
        g.stroke();
        if (inkStyle !== "script" && r() < 0.5) { g.globalAlpha = 0.7; g.beginPath(); g.arc(x, y, 4 + r() * 12, 0, Math.PI * 2); g.fill(); }
      }
      g.globalAlpha = 1;
    });
    if (density) t.repeat.set(2, 1.5);
    return t;
  }
  const std = (o) => new THREE.MeshStandardMaterial(Object.assign({ roughness: 0.6, metalness: 0 }, o));

  function sphere(r, mat, x, y, z, sx = 1, sy = 1, sz = 1) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 40, 28), mat);
    m.position.set(x, y, z); m.scale.set(sx, sy, sz); return m;
  }
  // tapered limb between two points with rounded ends
  function limb(a, b, r1, r2, mat, caps = true) {
    const g = new THREE.Group();
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
    const len = A.distanceTo(B);
    const cyl = new THREE.Mesh(new THREE.CylinderGeometry(r2, r1, len, 32, 1, true), mat);
    cyl.position.copy(A).add(B).multiplyScalar(0.5);
    cyl.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
    g.add(cyl);
    if (caps) { g.add(sphere(r1, mat, A.x, A.y, A.z)); g.add(sphere(r2, mat, B.x, B.y, B.z)); }
    return g;
  }
  function boxM(w, h, d, mat, x, y, z, rx = 0, ry = 0, rz = 0) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z); m.rotation.set(rx, ry, rz); return m;
  }

  // ------------------------------------------------------------ figure
  const SKIN = { porcelain: "#f3d9c8", fair: "#ebc6a8", olive: "#d9ae86", honey: "#cf9a67", tan: "#c18552", caramel: "#ad7444",
    bronze: "#97603a", chestnut: "#80502f", mocha: "#6a3f25", espresso: "#4f2d1a", ebony: "#36200f" };
  const HAIR = { black: "#0d0c0e", brown: "#3b2416", honey: "#c8955a", platinum: "#ece3cf", burgundy: "#5e1424", copper: "#b5562a", pink: "#ff5fa8", blue: "#9fd8ff" };
  const BOOTS = { white: "#efefea", black: "#18181b", tan: "#b08a5a", sneakers: "#f2f2f2" };
  const EYES = { brown: "#4a2c17", hazel: "#7a5a2a", green: "#3f7a4a", grey: "#7d8a92", blue: "#3d7cc9" };

  function build(s) {
    scene.remove(figure);
    disposeGroup(figure);
    figure = new THREE.Group();
    const P = s.pick || {}, one = (k) => (P[k] || [])[0], has = (k, v) => (P[k] || []).indexOf(v) >= 0;
    const ex = (k) => ((s.shape && s.shape[k] != null ? s.shape[k] : 5) / 10) * (0.45 + (s.exag || 0) / 100 * 0.85);   // 0 … 1.3

    // materials
    const skinHex = SKIN[s.skin] || SKIN.caramel;
    const tat = one("tattoos") || "none", inkStyle = one("inkstyle") || "color";
    const legInk = tat === "legs" || tat === "full" ? 2 : tat === "accents" ? 1 : 0;
    const armInk = tat === "arms" || tat === "full" ? 2 : tat === "accents" ? 1 : 0;
    const skin = std({ color: 0xffffff, map: skinTex(skinHex, inkStyle, 0), roughness: 0.48 });
    const skinLeg = legInk ? std({ color: 0xffffff, map: skinTex(skinHex, inkStyle, legInk), roughness: 0.48 }) : skin;
    const skinArm = armInk ? std({ color: 0xffffff, map: skinTex(skinHex, inkStyle, armInk), roughness: 0.48 }) : skin;
    const camo = std({ color: 0xffffff, map: camoTex(one("camo") || "snow"), roughness: 0.8 });
    const dark = std({ color: 0x3a3f2a, roughness: 0.75 });      // olive webbing
    const black = std({ color: 0x141416, roughness: 0.5, metalness: 0.3 });
    const hairM = std({ color: HAIR[one("haircolor")] || HAIR.black, roughness: 0.42 });
    const bootM = std({ color: BOOTS[one("boots")] || BOOTS.white, roughness: 0.55 });
    const furM = std({ color: 0xd9d6d0, roughness: 1 });
    const gold = std({ color: 0xd4af37, metalness: 0.9, roughness: 0.25 });

    const top = one("top") || "puffer", bottom = one("bottom") || "bodysuit";
    const sleeves = top === "puffer" || top === "jacket" || top === "hoodie";
    const puff = top === "puffer" ? 1.18 : top === "hoodie" ? 1.1 : top === "jacket" ? 1.06 : 1;
    const legsCovered = bottom === "leggings" || bottom === "pants";
    const shorts = bottom === "shorts" || bottom === "cargo";
    const torsoCovered = bottom === "bodysuit";     // bodysuit covers the waist too

    // proportions
    const hW = 0.155 + ex("hips") * 0.075;          // hip half-width
    const wW = 0.125 - ex("waist") * 0.034;         // waist half-width
    const gR = 0.08 + ex("glutes") * 0.06;          // glute radius
    const tR = 0.072 + ex("thighs") * 0.045;        // thigh top radius
    const bR = 0.048 + ex("bust") * 0.022;
    const tone = ((s.shape && s.shape.tone) || 3) / 10;
    const armR = 0.036 + tone * 0.008;
    const legX = hW * 0.52;

    // --- legs
    for (const side of [-1, 1]) {
      const hip = [side * legX, 0.88, -0.005], knee = [side * 0.075, 0.48, 0.01], ankle = [side * 0.078, 0.095, -0.005];
      const legMat = legsCovered ? camo : skinLeg;
      figure.add(limb(hip, knee, tR, 0.05, legMat));
      figure.add(sphere(tR * 0.92, legMat, side * (legX + tR * 0.18), 0.76, -0.012, 1, 1.5, 1));   // outer thigh fullness
      figure.add(limb(knee, ankle, 0.05, 0.032, legMat));
      figure.add(sphere(0.047, legMat, side * 0.078, 0.36, -0.018, 1, 1.6, 1.05));                  // calf
      if (shorts) figure.add(limb([side * legX, 0.9, -0.005], [side * (legX * 0.85 + 0.01), bottom === "cargo" ? 0.72 : 0.76, 0], tR * 1.06, tR * 0.96, camo, false));
      // boots
      const bootTop = one("boots") === "sneakers" ? 0.12 : 0.24;
      figure.add(limb([side * 0.078, bootTop, -0.005], [side * 0.078, 0.06, -0.005], 0.044, 0.046, bootM));
      figure.add(boxM(0.085, 0.07, 0.2, bootM, side * 0.078, 0.035, 0.045));
      if (has("gear", "pads")) figure.add(sphere(0.048, dark, side * 0.077, 0.48, 0.035, 1, 1.15, 0.7));
    }
    if (has("gear", "holster")) { figure.add(boxM(0.06, 0.16, 0.05, dark, legX + tR * 0.75, 0.74, 0.0)); figure.add(boxM(0.04, 0.08, 0.04, black, legX + tR * 0.78, 0.78, 0.0)); }

    // --- hips / glutes / torso
    const lowerMat = torsoCovered || shorts || legsCovered ? camo : skin;
    figure.add(sphere(1, lowerMat, 0, 0.93, -0.01, hW, 0.13, 0.115));
    for (const side of [-1, 1]) figure.add(sphere(gR, lowerMat, side * hW * 0.42, 0.9, -0.045 - gR * 0.32, 1, 0.95, 1));
    const waistMat = torsoCovered ? camo : skin;
    figure.add(sphere(1, waistMat, 0, 1.075, -0.005, wW, 0.13, 0.085));
    const chestMat = camo;
    figure.add(sphere(1, chestMat, 0, 1.255, -0.005, 0.15 * puff, 0.15, 0.098 * puff));
    for (const side of [-1, 1]) figure.add(sphere(bR, chestMat, side * 0.062, 1.245, 0.07 + (puff - 1) * 0.05));
    // shoulders
    const shMat = sleeves || top === "crop" ? camo : skinArm;
    for (const side of [-1, 1]) figure.add(sphere(0.052 * puff, shMat, side * 0.165, 1.365, -0.01));

    // --- arms (pose depends on the weapon hold)
    const w = s.weapon || "none", hold = s.hold || "low";
    const armed = w !== "none";
    const pistol = w === "glock" || w === "deagle";
    const armMat = sleeves ? camo : skinArm;
    const handMat = has("gear", "gloves") ? black : skinArm;
    const poses = {
      rest: { L: [[-0.205, 1.12, -0.01], [-0.225, 0.86, 0.02]], R: [[0.205, 1.12, -0.01], [0.225, 0.86, 0.02]] },
      low: { L: [[-0.2, 1.12, 0.04], [-0.05, 1.05, 0.22]], R: [[0.2, 1.12, 0.0], [0.12, 0.95, 0.16]] },
      shoulder: { L: [[-0.21, 1.2, 0.12], [-0.04, 1.3, 0.38]], R: [[0.2, 1.17, 0.06], [0.07, 1.31, 0.17]] },
      side: { L: [[-0.205, 1.12, -0.01], [-0.225, 0.86, 0.02]], R: [[0.21, 1.12, 0.0], [0.235, 0.88, 0.05]] }
    };
    const pose = !armed || hold === "sling" ? poses.rest : poses[hold] || poses.low;
    for (const [side, key] of [[-1, "L"], [1, "R"]]) {
      const sh = [side * 0.175, 1.36, -0.01], el = pose[key][0], hand = pose[key][1];
      figure.add(limb(sh, el, armR * puff, 0.032 * puff, armMat));
      figure.add(limb(el, hand, 0.032 * (sleeves ? puff : 1), 0.026, armMat));
      figure.add(sphere(0.032, handMat, hand[0], hand[1], hand[2], 0.9, 1.1, 0.8));
    }

    // --- top details
    if (top === "puffer") {
      const hood = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.04, 16, 40), furM);
      hood.position.set(0, 1.43, -0.02); hood.rotation.x = Math.PI / 2 - 0.25; figure.add(hood);
    }
    if (has("gear", "vest")) {
      figure.add(sphere(1, dark, 0, 1.235, -0.005, 0.158 * puff + 0.012, 0.13, 0.108 * puff + 0.016));
      for (const side of [-1, 1]) figure.add(limb([side * 0.09, 1.33, 0.06 * puff], [side * 0.1, 1.42, -0.02], 0.016, 0.016, dark, false));   // shoulder straps
    }
    if (has("gear", "chest")) { figure.add(boxM(0.25, 0.1, 0.06, dark, 0, 1.17, 0.11 * puff)); for (let i = -1; i <= 1; i++) figure.add(boxM(0.055, 0.09, 0.03, dark, i * 0.07, 1.18, 0.14 * puff)); }

    // --- neck / head / face
    figure.add(limb([0, 1.4, -0.01], [0, 1.5, -0.005], 0.045, 0.042, skin, false));
    const headY = 1.6, hs = 1 + Math.max(0, 62 - (s.height || 60)) * 0.006;   // petite = slightly bigger head ratio
    const head = sphere(0.1, skin, 0, headY, 0.005, 0.92 * hs, 1.1 * hs, 1 * hs); figure.add(head);
    const eyeM = std({ color: EYES[one("eyes")] || EYES.brown, roughness: 0.2 });
    if (has("gear", "shades")) figure.add(boxM(0.15, 0.03, 0.02, black, 0, headY + 0.015, 0.093 * hs));
    else for (const side of [-1, 1]) figure.add(sphere(0.011, eyeM, side * 0.034, headY + 0.015, 0.09 * hs));
    const lipM = std({ color: one("makeup") === "bold" ? 0x5a0f1e : one("makeup") === "glam" ? 0xb5566b : 0x9a5a50, roughness: 0.3 });
    figure.add(sphere(0.016, lipM, 0, headY - 0.05, 0.085 * hs, 1.4, 0.55, 0.6));
    if (has("jewelry", "hoops")) for (const side of [-1, 1]) { const h = new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.003, 8, 24), gold); h.position.set(side * 0.093 * hs, headY - 0.04, 0); h.rotation.y = Math.PI / 2; figure.add(h); }
    if (has("jewelry", "chain") || has("jewelry", "tennis") || has("jewelry", "dogtags")) {
      const c = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.006, 8, 40), has("jewelry", "dogtags") ? std({ color: 0xbfc4c9, metalness: 0.9, roughness: 0.3 }) : gold);
      c.position.set(0, 1.395, 0.03); c.rotation.x = Math.PI / 2 + 0.5; figure.add(c);
    }

    // --- hair
    const hairStyle = one("hair") || "straight";
    const capR = 0.106 * hs;
    const cap = new THREE.Mesh(new THREE.SphereGeometry(capR, 40, 24, 0, Math.PI * 2, 0, Math.PI * 0.56), hairM);
    cap.position.set(0, headY + 0.008, -0.006); cap.scale.set(0.95, 1.12, 1.05); cap.rotation.x = -0.18;
    if (hairStyle !== "bob" && !(has("gear", "beanie") || has("gear", "cap"))) figure.add(cap);
    if (has("gear", "beanie")) figure.add(sphere(capR * 1.06, std({ color: 0x2a2b2e, roughness: 1 }), 0, headY + 0.03, -0.006, 0.96, 0.95, 1.04));
    if (has("gear", "cap")) { figure.add(sphere(capR * 1.04, dark, 0, headY + 0.03, -0.006, 0.96, 0.85, 1.04)); figure.add(boxM(0.13, 0.012, 0.09, dark, 0, headY + 0.045, 0.1)); }
    if (has("gear", "headset")) { const hb = new THREE.Mesh(new THREE.TorusGeometry(0.11 * hs, 0.01, 8, 32, Math.PI), black); hb.position.set(0, headY + 0.005, 0); figure.add(hb); for (const side of [-1, 1]) figure.add(sphere(0.03, black, side * 0.105 * hs, headY, 0, 0.6, 1, 1)); }
    const backLen = { straight: 0.62, wave: 0.5, curly: 0.42, knotless: 0.62, butterfly: 0.56, pony: 0.5, buns: 0, bob: 0, pixie: 0 }[hairStyle];
    if (hairStyle === "straight" || hairStyle === "wave") {
      const panel = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, backLen, 8, 24), hairM);
      panel.position.set(0, headY - backLen / 2 - 0.02, -0.075); panel.scale.set(1.15, 1, 0.32); panel.rotation.x = 0.06; figure.add(panel);
      for (const side of [-1, 1]) { const f = new THREE.Mesh(new THREE.CapsuleGeometry(0.03, 0.22, 6, 12), hairM); f.position.set(side * 0.105 * hs, headY - 0.11, -0.01); figure.add(f); }
      if (hairStyle === "wave") for (let i = 0; i < 6; i++) figure.add(sphere(0.045, hairM, (i % 2 ? 1 : -1) * 0.07, headY - 0.15 - i * 0.07, -0.085));
    } else if (hairStyle === "curly") {
      const r = rnd(7);
      for (let i = 0; i < 30; i++) { const a = r() * Math.PI * 2, yy = headY + 0.08 - r() * 0.5; figure.add(sphere(0.06 + r() * 0.03, hairM, Math.cos(a) * 0.14, yy, -0.04 + Math.sin(a) * 0.08 - (yy < headY - 0.05 ? 0.06 : 0))); }
    } else if (hairStyle === "knotless" || hairStyle === "butterfly") {
      for (let i = 0; i < 11; i++) {
        const a = -1.4 + i * 0.28, x = Math.sin(a) * 0.1, z = -Math.cos(a) * 0.08 - 0.01;
        figure.add(limb([x, headY + 0.02, z], [x * 1.25, headY - backLen, z - 0.04], hairStyle === "butterfly" ? 0.018 : 0.012, hairStyle === "butterfly" ? 0.016 : 0.01, hairM, false));
      }
    } else if (hairStyle === "pony") {
      figure.add(sphere(0.035, hairM, 0, headY + 0.07, -0.1));
      figure.add(limb([0, headY + 0.07, -0.12], [0, headY - backLen, -0.16], 0.04, 0.02, hairM));
    } else if (hairStyle === "buns") {
      for (const side of [-1, 1]) figure.add(sphere(0.05, hairM, side * 0.065, headY + 0.11, -0.02));
    } else if (hairStyle === "bob") {
      const bob = new THREE.Mesh(new THREE.SphereGeometry(0.125 * hs, 40, 24, 0, Math.PI * 2, 0, Math.PI * 0.68), hairM);
      bob.position.set(0, headY + 0.005, -0.015); bob.scale.set(1, 1.05, 1.05); figure.add(bob);
      const fringe = new THREE.Mesh(new THREE.SphereGeometry(0.108 * hs, 32, 16, -0.9, 1.8 + Math.PI * 0, 0, 0.7), hairM);
      fringe.position.set(0, headY + 0.02, 0.01); figure.add(fringe);
    }

    // --- weapon
    if (armed) figure.add(weapon(w, hold, pistol, black));

    figure.scale.setScalar((s.height || 60) / 66);
    scene.add(figure);
    drawRuler(s.height || 60);
  }

  function weapon(w, hold, pistol, black) {
    const g = new THREE.Group();
    const wood = std({ color: 0x7a4a22, roughness: 0.6 });
    const metal = black;
    const isAK = w === "ak47";
    const furn = isAK ? wood : metal;
    if (pistol) {
      g.add(boxM(0.035, 0.035, w === "deagle" ? 0.2 : 0.17, metal, 0, 0.02, 0.0));
      g.add(boxM(0.03, 0.09, 0.04, metal, 0, -0.03, -0.05, 0.25));
    } else {
      const long = w === "barrett" ? 1.25 : w === "remington" ? 1.0 : w === "mp5" || w === "uzi" ? 0.6 : 0.9;
      g.add(boxM(0.05, 0.07, long * 0.32, metal, 0, 0, 0));                                       // receiver
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, long * 0.42, 12), metal);
      bar.rotation.x = Math.PI / 2; bar.position.set(0, 0.012, long * 0.36); g.add(bar);           // barrel
      g.add(boxM(0.045, 0.05, long * 0.18, furn, 0, -0.003, long * 0.24));                          // handguard
      if (w !== "uzi") g.add(boxM(0.04, 0.08, long * 0.24, furn, 0, -0.03, -long * 0.27, -0.12)); // stock
      g.add(boxM(0.03, 0.08, 0.035, furn, 0, -0.06, -long * 0.08, 0.3));                            // grip
      if (w !== "remington" && w !== "barrett") {
        const mag = boxM(0.028, 0.15, 0.05, metal, 0, -0.1, long * 0.06, isAK || w === "akm" ? -0.35 : -0.12);
        g.add(mag);
      }
      if (w === "m4a1" || w === "hk416" || w === "scar") g.add(boxM(0.03, 0.035, 0.07, metal, 0, 0.055, 0.0));    // optic
      if (w === "barrett") { g.add(boxM(0.035, 0.05, 0.12, metal, 0, 0.06, 0.02)); g.add(boxM(0.1, 0.008, 0.01, metal, 0, -0.04, long * 0.5)); }
    }
    if (pistol) {
      if (hold === "sling") { g.position.set(0.21, 0.8, 0.02); g.rotation.set(Math.PI / 2, 0, 0); }
      else if (hold === "shoulder") { g.position.set(0.02, 1.32, 0.42); }
      else if (hold === "side") { g.position.set(0.235, 0.84, 0.1); g.rotation.set(0.5, 0, 0); }
      else { g.position.set(0.05, 1.0, 0.24); g.rotation.set(0.35, 0, 0); }
    } else {
      if (hold === "shoulder") { g.position.set(0.03, 1.31, 0.3); g.rotation.set(0, 0, 0); }
      else if (hold === "sling") { g.position.set(0, 1.12, -0.17); g.rotation.set(0, Math.PI / 2, 0.85); }
      else if (hold === "side") { g.position.set(0.25, 0.78, 0.06); g.rotation.set(1.25, 0, 0); }
      else { g.position.set(0.04, 1.0, 0.2); g.rotation.set(0.15, 0.95, 0.5); }
    }
    return g;
  }

  // height ruler beside the figure
  function drawRuler(h) {
    while (ruler.children.length) { const c = ruler.children.pop(); c.geometry && c.geometry.dispose(); }
    const X = -0.52, line = new THREE.LineBasicMaterial({ color: 0x8a8a93, transparent: true, opacity: 0.7 });
    const pts = [new THREE.Vector3(X, 0, 0), new THREE.Vector3(X, 72 * IN, 0)];
    ruler.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), line));
    for (let i = 36; i <= 72; i += 3) {
      const y = i * IN, len = i % 12 === 0 ? 0.06 : i % 6 === 0 ? 0.04 : 0.02;
      ruler.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(X, y, 0), new THREE.Vector3(X + len, y, 0)]), line));
      if (i % 6 === 0) ruler.add(label(ft(i), X + 0.13, y, "#9a9aa3", 0.05));
    }
    const accent = getComputedStyle(document.documentElement).getPropertyValue("--color-accent").trim() || "#ff6a1f";
    const mark = new THREE.LineBasicMaterial({ color: new THREE.Color(accent) });
    ruler.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(X, h * IN, 0), new THREE.Vector3(0.05, h * IN, 0)]), mark));
    ruler.add(label(ft(h), X + 0.33, h * IN + 0.04, accent, 0.065));
  }
  const labelCache = {};
  function label(text, x, y, color, size) {
    const k = text + color;
    let tex = labelCache[k];
    if (!tex) {
      const c = document.createElement("canvas"); c.width = 128; c.height = 48;
      const g = c.getContext("2d"); g.font = "600 30px Inter, system-ui, sans-serif"; g.fillStyle = color; g.textAlign = "center"; g.textBaseline = "middle";
      g.fillText(text, 64, 24);
      tex = labelCache[k] = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    }
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    sp.scale.set(size * 2.67, size, 1); sp.position.set(x, y, 0);
    return sp;
  }
  function ft(i) { i = Math.round(i); return Math.floor(i / 12) + "'" + (i % 12) + '"'; }

  function disposeGroup(g) {
    g.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material && o.material.dispose) o.material.dispose(); });
  }

  // ------------------------------------------------------------ loop / resize / ui
  function resize() {
    const w = canvasWrap.clientWidth, h = canvasWrap.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(canvasWrap);
  resize();

  let visible = true;
  new IntersectionObserver((e) => { visible = e[0].isIntersecting; }).observe(canvasWrap);
  renderer.setAnimationLoop(() => {
    if (!visible || document.hidden) return;
    controls.update();
    ruler.rotation.y = Math.atan2(camera.position.x - controls.target.x, camera.position.z - controls.target.z);
    renderer.render(scene, camera);
  });

  let pending = null;
  function queue(s) {
    pending = s;
    requestAnimationFrame(() => { if (pending) { build(pending); pending = null; } });
  }
  window.addEventListener("baddies:change", (e) => queue(e.detail));
  if (window.BADDIES_STATE) queue(window.BADDIES_STATE);

  // view buttons
  function setView(az) {
    const d = camera.position.distanceTo(controls.target);
    controls.autoRotate = false; syncSpin();
    camera.position.set(Math.sin(az) * d, 1.05, Math.cos(az) * d);
    controls.update();
  }
  function syncSpin() { const b = document.getElementById("bdSpin"); if (b) { b.classList.toggle("is-on", controls.autoRotate); b.setAttribute("aria-pressed", controls.autoRotate); } }
  box.addEventListener("click", (e) => {
    const b = e.target.closest("[data-pv]"); if (!b) return;
    const v = b.getAttribute("data-pv");
    if (v === "spin") { controls.autoRotate = !controls.autoRotate; syncSpin(); }
    else if (v === "front") setView(0);
    else if (v === "side") setView(Math.PI / 2);
    else if (v === "back") setView(Math.PI);
  });
  renderer.domElement.addEventListener("pointerdown", () => { if (controls.autoRotate) { controls.autoRotate = false; syncSpin(); } });
  syncSpin();
  box.classList.add("is-ready");
  window.BADDIES_3D = { build: (s) => build(s), scene, camera, controls };
}
