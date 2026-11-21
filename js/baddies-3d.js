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

const box = document.getElementById("bdPreview");
const canvasWrap = document.getElementById("bdPreviewCanvas");
const MODEL_URL = "models/baddie_base.glb?v=2";
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
  scene.add(new THREE.HemisphereLight(0xfff4ea, 0x2a2430, 1.0));
  const key = new THREE.DirectionalLight(0xfff1e0, 2.6); key.position.set(2.2, 3.2, 2.8); scene.add(key);
  const rim = new THREE.DirectionalLight(0xffb98a, 1.8); rim.position.set(-2.6, 2.4, -2.8); scene.add(rim);
  const rim2 = new THREE.DirectionalLight(0x9fc2ff, 1.0); rim2.position.set(2.8, 1.8, -2.6); scene.add(rim2);
  const fill = new THREE.DirectionalLight(0xc8d6ff, 0.55); fill.position.set(-3, 1.2, 2.2); scene.add(fill);

  const ground = new THREE.Mesh(new THREE.CircleGeometry(0.6, 48), new THREE.MeshBasicMaterial({ map: radialTex(), transparent: true, depthWrite: false }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = 0.001; scene.add(ground);

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
    return canvasTex("camo-" + id, 512, 512, (g, w, h) => {
      const r = rnd(id.length * 977 + 13);
      g.fillStyle = p[0]; g.fillRect(0, 0, w, h);
      for (let layer = 1; layer < p.length; layer++) {
        g.fillStyle = p[layer];
        for (let i = 0; i < 60; i++) {
          const x = r() * w, y = r() * h, rr = 6 + r() * 18;
          g.beginPath();
          for (let a = 0; a < 7; a++) { const ang = a / 7 * Math.PI * 2, d = rr * (0.6 + r() * 0.6); g.lineTo(x + Math.cos(ang) * d, y + Math.sin(ang) * d * 0.7); }
          g.closePath(); g.fill();
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
  function inkTex(style) {
    return canvasTex("ink-" + style, 1024, 1024, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      const pal = INK[style] || INK.color, r = rnd(style.length * 131 + 7);
      g.lineCap = "round"; g.lineJoin = "round";
      const n = style === "script" ? 160 : 420;
      for (let i = 0; i < n; i++) {
        g.strokeStyle = g.fillStyle = pal[Math.floor(r() * pal.length)];
        g.lineWidth = style === "script" ? 1.4 : 1.5 + r() * 4;
        g.globalAlpha = 0.9;
        const x = r() * w, y = r() * h;
        g.beginPath(); g.moveTo(x, y);
        for (let k = 0; k < 4; k++) g.quadraticCurveTo(x + (r() - 0.5) * 60, y + (r() - 0.5) * 60, x + (r() - 0.5) * 50, y + (r() - 0.5) * 50);
        g.stroke();
        if (style !== "script" && r() < 0.45) { g.globalAlpha = 0.75; g.beginPath(); g.arc(x, y, 3 + r() * 10, 0, Math.PI * 2); g.fill(); }
      }
      g.globalAlpha = 1;
    });
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
  const HAIR = { black: "#0d0c0e", brown: "#3b2416", honey: "#c8955a", platinum: "#ece3cf", burgundy: "#5e1424", copper: "#b5562a", pink: "#ff5fa8", blue: "#9fd8ff" };
  const BOOTS = { white: "#efefea", black: "#18181b", tan: "#b08a5a", sneakers: "#f2f2f2" };
  const EYES = { brown: "#3d2414", hazel: "#6b4f24", green: "#3f7a4a", grey: "#7d8a92", blue: "#3d7cc9" };

  // ------------------------------------------------------------ body material (painted outfit)
  const U = {
    uSkin: { value: new THREE.Color(SKIN.caramel) }, uBoot: { value: new THREE.Color("#efefea") },
    uDark: { value: new THREE.Color("#3a3f2a") }, uBlack: { value: new THREE.Color("#141416") },
    uCamo: { value: camoTex("snow") }, uInk: { value: inkTex("color") }
  };
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.52, metalness: 0 });
  bodyMat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float aCls;\nattribute float aInk;\nvarying float vCls;\nvarying float vInk;\nvarying vec2 vUv2;")
      .replace("#include <uv_vertex>", "#include <uv_vertex>\nvCls = aCls; vInk = aInk; vUv2 = uv;");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform vec3 uSkin, uBoot, uDark, uBlack;\nuniform sampler2D uCamo, uInk;\nvarying float vCls;\nvarying float vInk;\nvarying vec2 vUv2;")
      .replace("#include <color_fragment>", `#include <color_fragment>
        float cls = floor(vCls + 0.5);
        vec3 col = uSkin;
        if (cls < 0.5) {
          if (vInk > 0.5) { vec4 t = texture2D(uInk, vUv2 * 3.0); col = mix(col, t.rgb * 0.85, t.a * 0.9); }
        } else if (cls < 1.5) col = texture2D(uCamo, vUv2 * 3.0).rgb;
        else if (cls < 2.5) col = uBoot;
        else if (cls < 3.5) col = uDark;
        else col = uBlack;
        diffuseColor.rgb = col;`)
      .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nfloat clsR = floor(vCls + 0.5);\nif (clsR > 0.5) roughnessFactor = clsR < 1.5 ? 0.85 : (clsR < 2.5 ? 0.45 : 0.7);");
  };

  // ------------------------------------------------------------ load model
  let body = null, skel = null, part = null, rest = null, morphIdx = {}, hairCap = null, eyes = null, headInfo = null, eyeInfo = null;
  const B = {};      // bones by name
  const restQ = {};  // rest quaternions
  let pendingState = window.BADDIES_STATE || null;

  new GLTFLoader().load(new URL(MODEL_URL, document.baseURI).href, (gltf) => {
    const root = gltf.scene;
    root.traverse((o) => {
      if (o.isSkinnedMesh) {
        const nm = (o.name + " " + (o.parent ? o.parent.name : "")).toLowerCase();
        if (/haircap/.test(nm)) hairCap = o; else if (/eyes/.test(nm)) eyes = o; else if (!body) body = o;
      }
      if (o.isBone) { B[o.name] = o; restQ[o.name] = o.quaternion.clone(); }
    });
    if (eyes) {
      eyes.frustumCulled = false;
      eyes.material = new THREE.MeshStandardMaterial({ color: 0xf2efe9, roughness: 0.2 });
      const P = eyes.geometry.attributes.position, L = new THREE.Vector3(), Rr = new THREE.Vector3(); let nl = 0, nr = 0, zmax = -9;
      for (let i = 0; i < P.count; i++) { const x = P.getX(i); if (x > 0) { L.add(new THREE.Vector3(x, P.getY(i), P.getZ(i))); nl++; } else { Rr.add(new THREE.Vector3(x, P.getY(i), P.getZ(i))); nr++; } zmax = Math.max(zmax, P.getZ(i)); }
      L.divideScalar(nl || 1); Rr.divideScalar(nr || 1);
      eyeInfo = { l: L, r: Rr, front: zmax };
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
    if (!body) return fail("No body in the model");
    body.material = bodyMat;
    body.frustumCulled = false;
    skel = body.skeleton;
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
  }

  // ------------------------------------------------------------ apply settings
  const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
  function build(s) {
    pendingState = s;
    if (!body) return;
    const P = s.pick || {}, one = (k) => (P[k] || [])[0], has = (k, v) => (P[k] || []).indexOf(v) >= 0;
    const exag = (s.exag == null ? 80 : s.exag) / 100;
    const k = 0.55 + exag * 1.45;                        // how far the "up" morphs go
    const sh = s.shape || {};
    const e = (key, def = 5) => ((sh[key] == null ? def : sh[key]) - 5) / 5;   // -1 … 1
    const inf = body.morphTargetInfluences;
    const set = (name, val) => { const i = morphIdx[name]; if (i != null) inf[i] = Math.max(0, Math.min(2.4, val)); };
    const pair = (up, dn, x, boost = k) => { set(up, x > 0 ? x * boost : 0); set(dn, x < 0 ? -x : 0); };
    pair("hips_up", "hips_dn", e("hips"));
    pair("glutes_up", "glutes_dn", e("glutes"), k * 1.15);
    pair("waist_in", "waist_out", e("waist"), Math.min(1.6, k));
    pair("thighs_up", "thighs_dn", e("thighs"));
    pair("bust_up", "bust_dn", e("bust"), 1);
    pair("tone_up", "tone_dn", e("tone", 3), 1);

    // ---- paint the outfit
    U.uSkin.value.set(SKIN[s.skin] || SKIN.caramel);
    U.uCamo.value = camoTex(one("camo") || "snow");
    U.uBoot.value.set(BOOTS[one("boots")] || BOOTS.white);
    U.uInk.value = inkTex(one("inkstyle") || "color");
    const top = one("top") || "puffer", bottom = one("bottom") || "bodysuit", tat = one("tattoos") || "none";
    const sleeves = top === "puffer" || top === "jacket" || top === "hoodie";
    const vest = has("gear", "vest"), gloves = has("gear", "gloves"), pads = has("gear", "pads");
    const sneakers = one("boots") === "sneakers";
    const legInk = tat === "legs" || tat === "full" || tat === "accents", armInk = tat === "arms" || tat === "full" || tat === "accents";
    const cls = body.geometry.attributes.aCls.array, ink = body.geometry.attributes.aInk.array;
    // heights on the rest mesh (model is 1.60 m)
    const bootTop = sneakers ? 0.13 : 0.3, shortsLow = bottom === "cargo" ? 0.62 : 0.68, kneeY = 0.46;
    for (let i = 0; i < part.length; i++) {
      const p = part[i], y = rest.getY(i), x = Math.abs(rest.getX(i)), z = rest.getZ(i);
      let c = 0, inked = 0;
      if (p === 2) c = vest ? 3 : 1;                                             // chest: every top covers it
      else if (p === 3) c = vest && y > 1.08 ? 3 : (top === "crop" || top === "tank" ? (bottom === "bodysuit" ? 1 : 0) : (top === "puffer" || top === "jacket" ? (y > 1.12 ? 1 : (bottom === "bodysuit" ? 1 : 0)) : 1));
      else if (p === 4) c = bottom === "bodysuit" || bottom === "pants" || bottom === "leggings" ? 1 : (y < 0.98 ? 1 : 0);
      else if (p === 5) c = 1;
      else if (p === 6) {
        if (bottom === "leggings" || bottom === "pants") c = 1;
        else if ((bottom === "shorts" || bottom === "cargo") && y > shortsLow) c = 1;
        else if (bottom === "bodysuit" && y > 0.8 && x < 0.085 && Math.abs(z) < 0.11) c = 1;   // high-cut leg line
        if (pads && Math.abs(y - kneeY) < 0.045 && z > 0) c = 3;
        if (!c && legInk) inked = 1;
      } else if (p === 7) {
        c = y < bootTop ? 2 : (bottom === "leggings" || bottom === "pants" ? 1 : 0);
        if (pads && Math.abs(y - kneeY) < 0.045 && z > 0) c = 3;
        if (!c && legInk) inked = 1;
      } else if (p === 8) c = 2;
      else if (p === 9) { c = sleeves ? 1 : (top === "crop" && y > 1.3 ? 1 : 0); if (!c && armInk) inked = 1; }
      else if (p === 10) { c = sleeves ? 1 : 0; if (!c && armInk) inked = 1; }
      else if (p === 11) c = gloves ? 4 : 0;
      cls[i] = c; ink[i] = inked;
    }
    body.geometry.attributes.aCls.needsUpdate = true; body.geometry.attributes.aInk.needsUpdate = true;

    // ---- pose the arms for the weapon hold
    const w = s.weapon || "none", hold = s.hold || "low", armed = w !== "none", pistol = w === "glock" || w === "deagle";
    for (const n in restQ) B[n].quaternion.copy(restQ[n]);
    holder.updateMatrixWorld(true);
    const POSES = {
      rest:     { ua_l: v3(0.16, -1, 0.02), la_l: v3(0.06, -1, 0.12), ua_r: v3(-0.16, -1, 0.02), la_r: v3(-0.06, -1, 0.12) },
      low:      { ua_l: v3(0.3, -0.8, 0.5), la_l: v3(-0.55, 0.12, 0.85), ua_r: v3(-0.35, -0.92, 0.15), la_r: v3(0.12, -0.2, 1) },
      shoulder: { ua_l: v3(0.2, -0.4, 0.9), la_l: v3(-0.3, 0.2, 1), ua_r: v3(-0.65, -0.6, 0.45), la_r: v3(0.5, 0.3, 0.8) },
      side:     { ua_l: v3(0.16, -1, 0.02), la_l: v3(0.06, -1, 0.12), ua_r: v3(-0.2, -1, 0.06), la_r: v3(-0.1, -1, 0.35) }
    };
    const pose = !armed || hold === "sling" ? POSES.rest : (POSES[hold] || POSES.low);
    aim("upperarm_l", "lowerarm_l", pose.ua_l); aim("lowerarm_l", "hand_l", pose.la_l);
    aim("upperarm_r", "lowerarm_r", pose.ua_r); aim("lowerarm_r", "hand_r", pose.la_r);
    // relax the fingers a little
    for (const n in B) if (/^(index|middle|ring|pinky)_0[123]/.test(n)) B[n].rotateZ(armed ? 0.5 : 0.2);

    // ---- height
    const hIn = s.height || 60, scale = (hIn * IN) / BASE_H;
    holder.scale.setScalar(scale);
    holder.updateMatrixWorld(true);
    controls.target.y = 0.5 * hIn * IN + 0.05;

    buildExtras(s, one, has, armed, pistol, w, hold);
    drawRuler(hIn);
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
  function bonePos(name, off) {
    const p = new THREE.Vector3(); if (!B[name]) return p;
    B[name].getWorldPosition(p); holder.worldToLocal(p);
    if (off) p.add(off);
    return p;
  }

  // ------------------------------------------------------------ add-ons: hair, gear, jewelry, weapon
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
    // irises on the eyeballs
    const eyeC = std({ color: EYES[one("eyes")] || EYES.brown, roughness: 0.15 }), pupil = std({ color: 0x050505, roughness: 0.1 });
    if (eyeInfo) for (const c of [eyeInfo.l, eyeInfo.r]) {
      const ir = new THREE.Mesh(new THREE.CircleGeometry(0.0062, 24), eyeC); ir.position.set(c.x, c.y, eyeInfo.front + 0.0004); extras.add(ir);
      const pu = new THREE.Mesh(new THREE.CircleGeometry(0.0026, 16), pupil); pu.position.set(c.x, c.y, eyeInfo.front + 0.0008); extras.add(pu);
    }
    const eyeY = eyeInfo ? eyeInfo.l.y - H.position.y : 0.012, eyeZ = eyeInfo ? eyeInfo.front - H.position.z : 0.08;
    if (has("gear", "shades")) { H.add(boxM(0.135, 0.032, 0.012, black, 0, eyeY, eyeZ + 0.012)); }

    // hair
    const style = one("hair") || "straight";
    const capped = has("gear", "beanie") || has("gear", "cap");
    if (hairCap) { hairCap.visible = !capped; hairCap.material = hairM.clone(); }
    else if (style !== "bob" && !capped) { const cap = new THREE.Mesh(new THREE.SphereGeometry(R * 1.05, 40, 24, 0, Math.PI * 2, 0, Math.PI * 0.55), hairM); cap.position.set(0, 0.008, -0.012); cap.rotation.x = -0.32; H.add(cap); }
    const backLen = { straight: 0.5, wave: 0.45, curly: 0.38, knotless: 0.52, butterfly: 0.48, pony: 0.45 }[style] || 0;
    if (style === "straight" || style === "wave") {
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
      for (let i = 0; i < 13; i++) {
        const a = -1.5 + i * 0.25, x = Math.sin(a) * 0.095, z = -Math.cos(a) * 0.075 - 0.01;
        H.add(limb([x, 0.03, z], [x * 1.3, -backLen, z - 0.05], style === "butterfly" ? 0.016 : 0.011, style === "butterfly" ? 0.014 : 0.009, hairM, false));
      }
    } else if (style === "pony") {
      H.add(sphere(0.032, hairM, 0, 0.07, -0.1));
      H.add(limb([0, 0.07, -0.12], [0, -backLen, -0.17], 0.038, 0.018, hairM));
    } else if (style === "buns") {
      for (const sd of [-1, 1]) H.add(sphere(0.048, hairM, sd * 0.06, 0.1, -0.02));
    } else if (style === "bob") {
      const bob = new THREE.Mesh(new THREE.SphereGeometry(R * 1.2, 40, 24, 0, Math.PI * 2, 0, Math.PI * 0.66), hairM);
      bob.position.set(0, 0.0, -0.02); bob.rotation.x = -0.2; H.add(bob);
    } else if (style === "pixie") { /* the cap is enough */ }
    if (has("gear", "beanie")) H.add(sphere(R * 1.08, std({ color: 0x2a2b2e, roughness: 1 }), 0, 0.03, -0.01, 0.97, 0.92, 1.05));
    if (has("gear", "cap")) { H.add(sphere(R * 1.06, dark, 0, 0.03, -0.01, 0.97, 0.82, 1.05)); H.add(boxM(0.13, 0.012, 0.09, dark, 0, 0.04, 0.1)); }
    if (has("gear", "headset")) {
      const hb = new THREE.Mesh(new THREE.TorusGeometry(R * 1.08, 0.009, 8, 32, Math.PI), black); hb.position.set(0, 0.0, -0.005); H.add(hb);
      for (const sd of [-1, 1]) H.add(sphere(0.028, black, sd * R * 1.04, 0, 0, 0.6, 1, 1));
    }
    if (has("jewelry", "hoops")) for (const sd of [-1, 1]) { const h = new THREE.Mesh(new THREE.TorusGeometry(0.016, 0.0028, 8, 24), gold); h.position.set(sd * 0.072, -0.045, 0.0); h.rotation.y = Math.PI / 2; H.add(h); }
    if (has("jewelry", "studs")) for (const sd of [-1, 1]) H.add(sphere(0.005, std({ color: 0xffffff, metalness: 0.6, roughness: 0.05 }), sd * 0.073, -0.03, 0.005));

    // fur hood / chains at the neck
    const nk = neck.clone().add(v3(0, 0.02, -0.01));
    if ((one("top") || "puffer") === "puffer") {
      const hood = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.036, 16, 40), std({ color: 0xdad7d1, roughness: 1 }));
      hood.position.copy(nk).add(v3(0, -0.01, -0.015)); hood.rotation.x = Math.PI / 2 - 0.3; extras.add(hood);
    }
    if (has("jewelry", "chain") || has("jewelry", "tennis") || has("jewelry", "dogtags")) {
      const c = new THREE.Mesh(new THREE.TorusGeometry(0.068, 0.005, 8, 40), has("jewelry", "dogtags") ? std({ color: 0xbfc4c9, metalness: 0.9, roughness: 0.3 }) : gold);
      c.position.copy(nk).add(v3(0, -0.04, 0.035)); c.rotation.x = Math.PI / 2 + 0.55; extras.add(c);
    }
    if (has("gear", "holster")) { const t = bonePos("thigh_r"); extras.add(boxM(0.055, 0.16, 0.05, dark, t.x - 0.1, t.y - 0.14, t.z)); }
    if (has("gear", "chest")) { const sp = bonePos("spine_02"); extras.add(boxM(0.22, 0.09, 0.04, dark, sp.x, sp.y + 0.03, sp.z + 0.13)); }

    // boots: a shaft around the ankle and a rounded foot
    const bootM = std({ color: BOOTS[one("boots")] || BOOTS.white, roughness: 0.45 });
    const sneaker = one("boots") === "sneakers";
    const thick = 1 + Math.max(0, ((s.shape && s.shape.thighs) || 5) - 5) * 0.03 * (0.5 + (s.exag || 0) / 100);
    for (const sd of ["l", "r"]) {
      const an = bonePos("foot_" + sd), ball = bonePos("ball_" + sd);
      if (!sneaker) extras.add(limb([an.x, an.y - 0.02, an.z - 0.01], [an.x, 0.3, an.z - 0.005], 0.05 * thick, 0.056 * thick, bootM));
      const heel = v3(an.x, 0.052, an.z - 0.05), toe = v3(ball.x, 0.046, ball.z + 0.055);
      const f = limb([heel.x, heel.y, heel.z], [toe.x, toe.y, toe.z], 0.045, 0.04, bootM);
      extras.add(f);
      extras.add(boxM(0.078, 0.012, toe.z - heel.z + 0.07, std({ color: 0x1a1a1c, roughness: 0.8 }), (heel.x + toe.x) / 2, 0.006, (heel.z + toe.z) / 2));
    }
    if (armed) extras.add(weapon(w, hold, pistol, black));
  }

  function weapon(w, hold, pistol, black) {
    const g = new THREE.Group();
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
    // the grip sits in the right hand; the barrel points along where the hands point
    const hr = bonePos("hand_r"), hl = bonePos("hand_l");
    if (hold === "sling") {
      const sp = bonePos("spine_03");
      g.position.copy(sp).add(v3(0, -0.05, -0.17)); g.rotation.set(0, Math.PI / 2, pistol ? 0 : 0.85);
      if (pistol) { const t = bonePos("thigh_r"); g.position.copy(t).add(v3(-0.1, -0.12, 0.0)); g.rotation.set(Math.PI / 2, 0, 0); }
    } else {
      g.position.copy(hr).add(v3(0, -0.02, 0.03));
      const dir = pistol || hold === "side" ? null : hl.clone().sub(hr);
      if (dir && dir.length() > 0.05) g.quaternion.setFromUnitVectors(v3(0, 0, 1), dir.normalize());
      else if (hold === "side") g.rotation.set(1.25, 0, 0);
      else if (hold === "shoulder") g.rotation.set(0, 0, 0);
      else g.rotation.set(0.35, 0, 0);
    }
    return g;
  }

  // ------------------------------------------------------------ height ruler
  function drawRuler(h) {
    while (ruler.children.length) { const c = ruler.children.pop(); c.geometry && c.geometry.dispose(); }
    const X = -0.52, line = new THREE.LineBasicMaterial({ color: 0x8a8a93, transparent: true, opacity: 0.7 });
    ruler.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([v3(X, 0, 0), v3(X, 72 * IN, 0)]), line));
    for (let i = 36; i <= 72; i += 3) {
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

  // ------------------------------------------------------------ loop / resize / ui
  function resize() {
    const w = canvasWrap.clientWidth, h = canvasWrap.clientHeight; if (!w || !h) return;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(canvasWrap); resize();
  let visible = true;
  new IntersectionObserver((en) => { visible = en[0].isIntersecting; }).observe(canvasWrap);
  renderer.setAnimationLoop(() => {
    if (!visible || document.hidden) return;
    controls.update();
    ruler.rotation.y = Math.atan2(camera.position.x - controls.target.x, camera.position.z - controls.target.z);
    renderer.render(scene, camera);
  });

  let queued = null;
  function queue(st) { queued = st; requestAnimationFrame(() => { if (queued) { build(queued); queued = null; } }); }
  window.addEventListener("baddies:change", (ev) => queue(ev.detail));

  function setView(az) {
    const d = camera.position.distanceTo(controls.target);
    controls.autoRotate = false; syncSpin();
    camera.position.set(Math.sin(az) * d, controls.target.y + 0.15, Math.cos(az) * d); controls.update();
  }
  function syncSpin() { const b = document.getElementById("bdSpin"); if (b) { b.classList.toggle("is-on", controls.autoRotate); b.setAttribute("aria-pressed", controls.autoRotate); } }
  box.addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-pv]"); if (!b) return;
    const v = b.getAttribute("data-pv");
    if (v === "spin") { controls.autoRotate = !controls.autoRotate; syncSpin(); }
    else if (v === "front") setView(0); else if (v === "side") setView(Math.PI / 2); else if (v === "back") setView(Math.PI);
  });
  renderer.domElement.addEventListener("pointerdown", () => { if (controls.autoRotate) { controls.autoRotate = false; syncSpin(); } });
  syncSpin();
  window.BADDIES_3D = { build, scene, camera, controls, bones: B, get body() { return body; } };
}
