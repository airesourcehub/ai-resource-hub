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

const box = document.getElementById("bdPreview");
const canvasWrap = document.getElementById("bdPreviewCanvas");
const MODEL_URL = "models/baddie_full.glb?v=1";
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
  const HAIR = { black: "#0d0c0e", brown: "#3b2416", honey: "#c8955a", platinum: "#ece3cf", burgundy: "#5e1424", copper: "#b5562a", pink: "#ff5fa8", blue: "#9fd8ff", own: "#4a3426" };
  const BOOTS = { white: "#efefea", black: "#18181b", tan: "#b08a5a", sneakers: "#f2f2f2" };
  const EYES = { brown: "#3d2414", hazel: "#6b4f24", green: "#3f7a4a", grey: "#7d8a92", blue: "#3d7cc9" };

  // ------------------------------------------------------------ body material (painted outfit)
  const U = {
    uSkin: { value: new THREE.Color(SKIN.caramel) }, uBoot: { value: new THREE.Color("#efefea") },
    uDark: { value: new THREE.Color("#3a3f2a") }, uBlack: { value: new THREE.Color("#141416") },
    uCamo: { value: camoTex("snow") }, uInk: { value: inkTex("color") },
    uSkinTex: { value: null }, uHasSkin: { value: 0 }
  };
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.52, metalness: 0 });
  bodyMat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float aCls;\nattribute float aInk;\nvarying float vCls;\nvarying float vInk;\nvarying vec2 vUv2;")
      .replace("#include <uv_vertex>", "#include <uv_vertex>\nvCls = aCls; vInk = aInk; vUv2 = uv;");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform vec3 uSkin, uBoot, uDark, uBlack;\nuniform sampler2D uCamo, uInk, uSkinTex;\nuniform float uHasSkin;\nvarying float vCls;\nvarying float vInk;\nvarying vec2 vUv2;")
      .replace("#include <color_fragment>", `#include <color_fragment>
        float cls = floor(vCls + 0.5);
        lkCloth = cls > 0.5 ? 1.0 : 0.0;
        vec3 col = uSkin;
        if (uHasSkin > 0.5) { vec3 st = texture2D(uSkinTex, vUv2).rgb; float sl = dot(st, vec3(0.299, 0.587, 0.114)); col = uSkin * clamp(sl / 0.6, 0.55, 1.35); }
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
  const M = {};          // asset meshes by name: cl_*, hair_*, brows, lashes, eyes_hp
  const skinned = [];    // every skinned mesh (they all share the body's morph names)
  const B = {};      // bones by name
  const restP = {};   // rest positions (pelvis moves for squats / kneeling)
  let headRestM = null, pelvisRestY = 0.95;   // head bone at rest (holder space): head add-ons follow the posed head
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
      if (eyes !== M.eyes_hp) eyes.material = new THREE.MeshStandardMaterial({ color: 0xf2efe9, roughness: 0.2 });
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
    if (body.material && body.material.map) { U.uSkinTex.value = body.material.map; U.uHasSkin.value = 1; }
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

  // Materials for the real asset meshes: hair, brows and lashes are alpha cards tinted by colour;
  // shoes keep their texture detail but take the chosen colour; bottoms use the camo pattern.
  function tintMat(src, gain, base, amt, opts = {}) {
    const m = new THREE.MeshStandardMaterial({ map: src && src.map, roughness: opts.roughness ?? 0.5, metalness: 0,
      alphaTest: opts.alpha ? 0.35 : 0, transparent: false, side: opts.alpha ? THREE.DoubleSide : THREE.FrontSide });
    m.userData.uTint = { value: new THREE.Color(1, 1, 1) };
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uTint = m.userData.uTint;
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
      if (/^hair_/.test(k)) o.material = tintMat(src, 1.6, 0.35, 1.0, { alpha: true, roughness: 0.42 });
      else if (k === "brows") o.material = tintMat(src, 1.2, 0.4, 0.8, { alpha: true });
      else if (k === "lashes") { o.material = tintMat(src, 1.0, 0.0, 0.25, { alpha: true }); o.material.userData.uTint.value.set(0x111111); }
      else if (k === "cl_boots") o.material = tintMat(src, 3.2, 0.5, 0.6, { roughness: 0.4 });
      else if (k === "cl_sneakers") o.material = new THREE.MeshStandardMaterial({ map: src.map, roughness: 0.6 });
      else if (/^cl_/.test(k)) o.material = new THREE.MeshStandardMaterial({ map: camoTex("snow"), roughness: 0.85, side: THREE.DoubleSide });
      else if (k === "eyes_hp") o.material = new THREE.MeshStandardMaterial({ color: 0xece8e2, roughness: 0.15 });
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
    const P = s.pick || {}, one = (k) => (P[k] || [])[0], has = (k, v) => (P[k] || []).indexOf(v) >= 0;
    const exag = (s.exag == null ? 80 : s.exag) / 100;
    const k = 0.55 + exag * 1.45;                        // how far the "up" morphs go
    const sh = s.shape || {};
    const e = (key, def = 5) => ((sh[key] == null ? def : sh[key]) - 5) / 5;   // -1 … 1
    const set = (name, val) => {
      const v = Math.max(0, Math.min(2.4, val));
      for (const m of skinned) { const d = m.morphTargetDictionary; if (d && d[name] != null) m.morphTargetInfluences[d[name]] = v; }
    };
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
    const bootTop = M.cl_boots ? (sneakers || bottom === "leggings" || bottom === "pants" ? 0 : 0.28) : (sneakers ? 0.13 : 0.3), shortsLow = bottom === "cargo" ? 0.62 : 0.68, kneeY = 0.46;
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
    const PZ = s.pose || { preset: "hold" }, preset = PZ.preset || "hold";
    const handsBusy = preset !== "hold" && preset !== "kneel" && preset !== "custom";
    const w = s.weapon || "none", armed = w !== "none", pistol = w === "glock" || w === "deagle";
    const hold = armed && handsBusy ? "sling" : (preset === "custom" ? "free" : (s.hold || "low"));
    for (const n in restQ) B[n].quaternion.copy(restQ[n]);
    if (B.pelvis && restP.pelvis) B.pelvis.position.copy(restP.pelvis);
    holder.updateMatrixWorld(true);
    const feet0 = { l: bonePos("foot_l"), r: bonePos("foot_r") }, footQ0 = { l: worldQ("foot_l"), r: worldQ("foot_r") };
    const PR = POSE_PRESETS[preset] || {};
    const cust = preset === "custom" ? PZ.custom : null;
    const pdy = cust ? (cust.pdy || 0) : (PR.pdy || 0);
    if (pdy || PR.pdx) movePelvis(v3(PR.pdx || 0, pdy, PR.pdz || 0));
    if (PR.yaw) { yawBone("spine_01", PR.yaw * 0.25); yawBone("spine_02", PR.yaw * 0.35); yawBone("spine_03", PR.yaw * 0.4); }
    if (PR.head) { yawBone("neck_01", PR.head * 0.5); yawBone("head", PR.head * 0.5); }
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
    else if (PR.hr && !curRig) { ik("r", v3(...PR.hr), PR.elbow); if (PR.hl) ik("l", v3(...PR.hl), PR.elbow); }
    const fT = {
      l: cust && cust.fl ? v3(...cust.fl) : feet0.l.clone().add(v3(...(PR.fl || [0, 0, 0]))),
      r: cust && cust.fr ? v3(...cust.fr) : feet0.r.clone().add(v3(...(PR.fr || [0, 0, 0])))
    };
    if (pdy || PR.pdx || PR.fl || PR.fr || cust) {
      ikLeg("l", fT.l, PR.knee); ikLeg("r", fT.r, PR.knee);
      setWorldQ("foot_l", footQ0.l); setWorldQ("foot_r", footQ0.r);
      if (PR.kneelR) { const fb = B.foot_r; if (fb) fb.rotateX(0.9); }
    }
    lastTargets = { hr: bonePos("hand_r").toArray(), hl: bonePos("hand_l").toArray(), fl: bonePos("foot_l").toArray(), fr: bonePos("foot_r").toArray(), pdy: pdy };
    // relax the fingers a little
    for (const n in B) if (/^(index|middle|ring|pinky)_0[123]/.test(n)) B[n].rotateZ(armed ? 0.5 : 0.2);

    // ---- height
    const hIn = s.height || 60, scale = (hIn * IN) / BASE_H;
    holder.scale.setScalar(scale);
    holder.updateMatrixWorld(true);
    const ty = 0.5 * hIn * IN + 0.05;
    if (lastH && lastH !== hIn) {   // keep her in frame from 3 ft to 7 ft: move the camera with her height
      const off = camera.position.clone().sub(controls.target).multiplyScalar(Math.max(hIn, 42) / Math.max(lastH, 42));
      controls.target.y = ty; camera.position.copy(controls.target).add(off); controls.update();
    } else controls.target.y = ty;
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
  function bonePos(name, off) {
    const p = new THREE.Vector3(); if (!B[name]) return p;
    B[name].getWorldPosition(p); holder.worldToLocal(p);
    if (off) p.add(off);
    return p;
  }

  // ------------------------------------------------------------ two-hand gun rig (IK)
  let curRig = null, curGunK = 1;
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
    kneel:   { pdy: -0.38, fl: [0, 0, 0.3], fr: [0, 0.02, -0.4], kneelR: true }
  };
  let lastTargets = null;
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
    ikChain("thigh_" + side, "calf_" + side, "foot_" + side, T, v3((side === "r" ? -1 : 1) * (kneeOut || 0.15), 0, 1));
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
  function ik(side, T, elbowOut) {
    const e = elbowOut == null ? 0.75 : elbowOut;
    ikChain("upperarm_" + side, "lowerarm_" + side, "hand_" + side, T, v3(side === "r" ? -e : e, -1, -0.25));
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
    const EYEG = new THREE.Group(); extras.add(EYEG);
    if (eyeInfo) for (const c of [eyeInfo.l, eyeInfo.r]) {
      const ir = new THREE.Mesh(new THREE.CircleGeometry(0.0062, 24), eyeC); ir.position.set(c.x, c.y, eyeInfo.front + 0.0004); EYEG.add(ir);
      const pu = new THREE.Mesh(new THREE.CircleGeometry(0.0026, 16), pupil); pu.position.set(c.x, c.y, eyeInfo.front + 0.0008); EYEG.add(pu);
    }
    // head add-ons were laid out on the resting head: move them with the posed head (squats, kneeling, turned head)
    const followHead = () => {
      if (!headRestM || !B.head) return;
      holder.updateMatrixWorld(true);
      const now = holder.matrixWorld.clone().invert().multiply(B.head.matrixWorld);
      const delta = now.multiply(headRestM.clone().invert());
      [H, EYEG].forEach((g) => { g.updateMatrix(); g.matrix.premultiply(delta); g.matrix.decompose(g.position, g.quaternion, g.scale); });
    };
    const eyeY = eyeInfo ? eyeInfo.l.y - H.position.y : 0.012, eyeZ = eyeInfo ? eyeInfo.front - H.position.z : 0.08;
    if (has("gear", "shades")) { H.add(boxM(0.135, 0.032, 0.012, black, 0, eyeY, eyeZ + 0.012)); }

    // hair
    const style = one("hair") || "straight";
    const capped = has("gear", "beanie") || has("gear", "cap");
    const HAIRMAP = { straight: "hair_long", wave: "hair_long", curly: "hair_afro", knotless: "hair_pixie", butterfly: "hair_pixie", pony: "hair_pony", buns: "hair_pixie", bob: "hair_bob", pixie: "hair_pixie", own: "hair_long" };
    const realHair = !!M.hair_long;
    if (realHair) {
      const want = HAIRMAP[style] || "hair_long", tint = new THREE.Color(HAIR[one("haircolor")] || HAIR.black);
      for (const k in M) if (/^hair_/.test(k)) { M[k].visible = k === want && !(capped && (k === "hair_afro" || k === "hair_bob" || k === "hair_pixie")); M[k].material.userData.uTint.value.copy(tint); }
      if (M.brows) M.brows.material.userData.uTint.value.copy(tint).multiplyScalar(0.7);
    }
    if (realHair) { /* real hair meshes handle the main styles */ }
    else if (hairCap) { hairCap.visible = !capped; hairCap.material = hairM.clone(); }
    else if (style !== "bob" && !capped) { const cap = new THREE.Mesh(new THREE.SphereGeometry(R * 1.05, 40, 24, 0, Math.PI * 2, 0, Math.PI * 0.55), hairM); cap.position.set(0, 0.008, -0.012); cap.rotation.x = -0.32; H.add(cap); }
    const backLen = { straight: 0.5, wave: 0.45, curly: 0.38, knotless: 0.52, butterfly: 0.48, pony: 0.45 }[style] || 0;
    if (realHair && !(style === "knotless" || style === "butterfly" || style === "buns")) { /* nothing extra */ }
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

    // shoes and bottoms: real fitted meshes when the model has them
    const sneaker = one("boots") === "sneakers";
    if (M.cl_boots) {
      const bt = new THREE.Color(BOOTS[one("boots")] || BOOTS.white);
      M.cl_boots.visible = !sneaker; M.cl_sneakers.visible = sneaker;
      M.cl_boots.material.userData.uTint.value.copy(bt);
      const bottom = one("bottom") || "bodysuit";
      M.cl_leggings.visible = bottom === "leggings";
      M.cl_jeans.visible = bottom === "pants";
      M.cl_shorts.visible = bottom === "shorts" || bottom === "cargo";
      const cm = camoTex(one("camo") || "snow");
      for (const k of ["cl_leggings", "cl_jeans", "cl_shorts"]) { M[k].material.map = cm; M[k].material.needsUpdate = true; }
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
    followHead();
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
      placeWeapon(g, hold, pistol);
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
    placeWeapon(g, hold, pistol);
    return g;
  }

  function placeWeapon(g, hold, pistol) {
    g.scale.setScalar(curGunK);
    if (curRig) { g.position.copy(curRig.G); g.quaternion.copy(curRig.q); return; }
    // the grip sits in the right hand; the barrel points along where the hands point
    const hr = bonePos("hand_r"), hl = bonePos("hand_l");
    if (hold === "sling") {
      const sp = bonePos("spine_03");
      g.position.copy(sp).add(v3(0, -0.05, -0.17)); g.rotation.set(0, Math.PI / 2, pistol ? 0 : 0.85);
      if (pistol) { const t = bonePos("thigh_r"); g.position.copy(t).add(v3(-0.1, -0.12, 0.0)); g.rotation.set(Math.PI / 2, 0, 0); }
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
    game:       { rig: "studio" },
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
    shadowPlane.visible = sh; ground.visible = !sh && !L.holo && !L.grid;
    grid.visible = !!L.grid;
    outline.defaultThickness = L.outline || 0.004; outline.defaultColor = L.outlineColor || [0, 0, 0];
    renderer.setPixelRatio(basePR * (L.pixel || 1));
    renderer.domElement.style.imageRendering = L.pixel ? "pixelated" : "";
    resize();
    canvasWrap.style.background = L.bg || DEFAULT_BG;
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
    if (!dragQueued) { dragQueued = true; requestAnimationFrame(() => { dragQueued = false; if (drag) build(Object.assign({}, pendingState, { pose: { preset: "custom", custom: drag.custom, match: pendingState.pose && pendingState.pose.match } })); }); }
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
    const kneelSide = knee.r.y < 0.14 ? "right" : knee.l.y < 0.14 ? "left" : "";
    if (kneelSide) out.push("kneeling on her " + kneelSide + " knee with the other foot planted in front");
    else if (drop > 0.26) out.push("in a deep squat with her hips dropped low, knees bent" + (Math.abs(knee.r.x - knee.l.x) > 0.4 ? " and pointing outward" : ""));
    else if (drop > 0.1) out.push("in a half squat with her knees bent");
    else out.push("standing");
    const spread = Math.abs(foot.r.x - foot.l.x), stride = foot.r.z - foot.l.z;
    if (!kneelSide) {
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
    if (opts.hands !== false) out.push("right hand " + handWords("r"), "left hand " + handWords("l"));
    return out.join(", ");
  };

  window.BADDIES_POSE_SNAPSHOT = async function () {
    const W = 640, H = 960, prevLook = curLookId || "game";
    const vis = [ruler.visible, handleGroup.visible, grid.visible, ground.visible];
    const cp = camera.position.clone(), ct = controls.target.clone(), ar = controls.autoRotate, pr = renderer.getPixelRatio(), bg = canvasWrap.style.background;
    try {
      curLookId = ""; applyLook("game");
      ruler.visible = false; handleGroup.visible = false; grid.visible = false;
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
      ruler.visible = vis[0]; handleGroup.visible = vis[1]; grid.visible = vis[2];
      camera.position.copy(cp); controls.target.copy(ct); controls.autoRotate = ar;
      curLookId = ""; applyLook(prevLook); renderer.setPixelRatio(pr); resize(); controls.update();
      canvasWrap.style.background = bg;
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
