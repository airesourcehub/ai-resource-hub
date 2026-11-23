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
  const BG_HORIZON = { desert: 0.5, jungle: 0.59, miami: 0.61, snow: 0.6, christmas: 0.52, halloween: 0.64, newyear: 0.6, valentine: 0.62, july4: 0.68 };
  const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff, depthWrite: false, toneMapped: false, fog: false }));
  backdrop.renderOrder = -10; backdrop.visible = false; backdrop.frustumCulled = false;
  const bgTex = {}; let bgOn = false, bgWant = "";
  const ground = new THREE.Mesh(new THREE.CircleGeometry(0.6, 48), new THREE.MeshBasicMaterial({ map: radialTex(), transparent: true, depthWrite: false }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = 0.001; scene.add(ground); scene.add(backdrop);

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

  // ------------------------------------------------------------ body material (painted outfit)
  const U = {
    uSkin: { value: new THREE.Color(SKIN.caramel) }, uBoot: { value: new THREE.Color("#efefea") },
    uDark: { value: new THREE.Color("#3a3f2a") }, uBlack: { value: new THREE.Color("#141416") },
    uCamo: { value: camoTex("snow") }, uInk: { value: inkTex("color") },
    uSkinTex: { value: null }, uHasSkin: { value: 0 },
    // makeup, painted in rest (bind) space so it rides along with expressions
    uEyeL: { value: new THREE.Vector3(0.032, 1.5, 0.08) }, uEyeR: { value: new THREE.Vector3(-0.032, 1.5, 0.08) }, uMouth: { value: new THREE.Vector3(0, 1.44, 0.09) },
    uLip: { value: new THREE.Color("#a5555a") }, uLipAmt: { value: 0.3 }, uLiner: { value: 0 }, uShadowC: { value: new THREE.Color("#5a3a30") }, uShadowAmt: { value: 0 }
  };
  const bodyMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.5, metalness: 0, sheen: 0.45, sheenRoughness: 0.55, sheenColor: new THREE.Color(0xffd2b8), clearcoat: 0.06, clearcoatRoughness: 0.45 });
  bodyMat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float aCls;\nattribute float aInk;\nvarying float vCls;\nvarying float vInk;\nvarying vec2 vUv2;\nvarying vec3 vRest;")
      .replace("#include <uv_vertex>", "#include <uv_vertex>\nvCls = aCls; vInk = aInk; vUv2 = uv; vRest = position;");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform vec3 uSkin, uBoot, uDark, uBlack;\nuniform sampler2D uCamo, uInk, uSkinTex;\nuniform float uHasSkin;\nvarying float vCls;\nvarying float vInk;\nvarying vec2 vUv2;\nvarying vec3 vRest;\nuniform vec3 uEyeL, uEyeR, uMouth, uLip, uShadowC;\nuniform float uLipAmt, uLiner, uShadowAmt;")
      .replace("#include <color_fragment>", `#include <color_fragment>
        float cls = floor(vCls + 0.5);
        lkCloth = cls > 0.5 ? 1.0 : 0.0;
        vec3 col = uSkin;
        if (uHasSkin > 0.5) { vec3 st = texture2D(uSkinTex, vUv2).rgb; float sl = dot(st, vec3(0.299, 0.587, 0.114)); col = uSkin * clamp(sl / 0.6, 0.55, 1.35); }
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
      cut(M.hair_pony, (x, y, z) => y < ey - 0.02 && z < ef - 0.14);
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
  }

  // Materials for the real asset meshes: hair, brows and lashes are alpha cards tinted by colour;
  // shoes keep their texture detail but take the chosen colour; bottoms use the camo pattern.
  function tintMat(src, gain, base, amt, opts = {}) {
    const m = new THREE.MeshStandardMaterial({ map: src && src.map, roughness: opts.roughness ?? 0.5, metalness: 0,
      alphaTest: opts.alpha ? 0.35 : 0, transparent: false, side: opts.alpha ? THREE.DoubleSide : THREE.FrontSide });
    m.userData.uTint = { value: new THREE.Color(1, 1, 1) };
    m.userData.uWave = { value: 0 };
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uTint = m.userData.uTint; sh.uniforms.uWave = m.userData.uWave;
      // body-wave: ripple long hair below the ears (rest-space y; eyes sit at ~1.5 m)
      sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nuniform float uWave;")
        .replace("#include <begin_vertex>", `#include <begin_vertex>
          float wv = smoothstep(1.47, 1.36, position.y) * uWave;
          transformed += normal * wv * (0.55 + 0.45 * sin(position.y * 42.0 + position.x * 9.0)) * 0.032;
          transformed.x += wv * sin(position.y * 34.0 + 1.3) * 0.011;
          transformed.z += wv * cos(position.y * 34.0 + position.x * 12.0) * 0.008;`);
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
    // facial expression (shape keys on the body, brows and lashes)
    const EXPRS = ["confident", "smirk", "fierce", "smile", "pout", "surprised", "sultry", "wink"], ex = one("expr") || "confident";
    const EXW = { confident: 1.5, smile: 1.5, smirk: 1.2, sultry: 1.4, pout: 0.65 };
    for (const x of EXPRS) set("ex_" + x, x === ex ? (EXW[x] || 1) : 0);

    // ---- paint the outfit
    U.uSkin.value.set(SKIN[s.skin] || SKIN.caramel);
    U.uCamo.value = camoTex(one("camo") || "snow");
    U.uBoot.value.set(BOOTS[one("boots")] || BOOTS.white);
    U.uInk.value = inkTex(one("inkstyle") || "color");
    const MK = { natural: ["#a8625c", 0.3, 0, "#5a3a30", 0], glam: ["#b8475a", 0.72, 0.55, "#6b4636", 0.38], bold: ["#3a0b16", 0.92, 1.0, "#2a1414", 0.5] }[one("makeup") || "glam"] || [0, 0, 0, 0, 0];
    if (MK[0]) { U.uLip.value.set(MK[0]); U.uLipAmt.value = MK[1]; U.uLiner.value = MK[2]; U.uShadowC.value.set(MK[3]); U.uShadowAmt.value = MK[4]; }
    curBg = s.bg || "white"; applyBg();
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
    else if (PR.hr && !curRig) { ik("r", v3(...PR.hr), PR.elbow); if (PR.hl) ik("l", v3(...PR.hl), PR.elbow); }
    const fT = {
      l: cust && cust.fl ? v3(...cust.fl) : feet0.l.clone().add(v3(...(PR.fl || [0, 0, 0]))),
      r: cust && cust.fr ? v3(...cust.fr) : feet0.r.clone().add(v3(...(PR.fr || [0, 0, 0])))
    };
    if (!cust && curSeat && curSeat.type === "stool") { fT.l.y = fT.r.y = 0.26; fT.l.z = fT.r.z = feet0.l.z + 0.2; }   // feet on the footrest
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
    kneel:   { pdy: -0.38, fl: [0, 0, 0.3], fr: [0, 0.02, -0.4], kneelR: true },
    sit:     { seat: "chair", fl: [0.03, 0, 0.36], fr: [-0.03, 0, 0.36], hr: [-0.15, 0.6, 0.24], hl: [0.15, 0.6, 0.24], elbow: 1.0, knee: 0.12 },
    sitfloor:{ seat: "floor", fl: [0.07, 0, 0.5], fr: [-0.07, 0, 0.52], hr: [-0.16, 0.44, 0.34], hl: [0.16, 0.44, 0.32], elbow: 0.9, knee: 0.25 },
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
  function braidHair(style, R, len, hairM, scalp) {
    const G = new THREE.Group(), r = rnd(style === "butterfly" ? 41 : style === "curly" ? 53 : 29), fly = style === "butterfly", curly = style === "curly";
    const mat = hairM.clone(); mat.roughness = fly ? 0.7 : curly ? 0.62 : 0.55;
    // scalp ellipsoid from the short-hair cap's bounds (relative to H), else a sphere guess
    const d2r = Math.PI / 180, sc = scalp || { c: new THREE.Vector3(0, 0.004, -0.008), r: new THREE.Vector3(R, R, R) }, RS = 1.0;
    const sp = (a, e, rad) => new THREE.Vector3(Math.sin(a) * Math.cos(e) * (sc.r.x * rad + (rad - 1) * 0.0), Math.sin(e) * sc.r.y * rad, -Math.cos(a) * Math.cos(e) * sc.r.z * rad).add(sc.c);
    const n = fly ? 96 : curly ? 100 : 130, thick = fly ? 0.0082 : curly ? 0.0042 : 0.0055;
    for (let k = 0; k < n; k++) {
      // spread roots evenly over the back / sides / crown (golden-angle spiral), hairline stays off the face
      const u = (k + 0.5) / n, e = (8 + 78 * Math.sqrt(1 - u)) * d2r, a = ((k * 137.508) % 300 - 150) * d2r;
      const front = Math.abs(a) > 105 * d2r;
      if (front && e < 45 * d2r) continue;
      const way = [[a, e]];
      if (front) way.push([Math.sign(a) * 100 * d2r, e * 0.75]);      // front roots sweep back over the crown
      const a1 = way[way.length - 1][0];
      const pts = way.map(([aa, ee]) => sp(aa, ee, 1.02));
      const puff = curly ? 0.022 + r() * 0.018 : 0;   // curls stand off the scalp for volume
      for (let ee = way[way.length - 1][1] - 15 * d2r; ee > -50 * d2r; ee -= 15 * d2r) pts.push(sp(a1, ee, 1.04 + (puff * (1 + (e - ee)) + (ee < 0 ? -ee * (curly ? 0.04 : 0.01) : 0)) / 0.09));
      // hang: behind the shoulders, spreading a little, gentle sway
      const last = pts[pts.length - 1], drop = len * (0.82 + r() * 0.3);
      for (let j = 1; j <= 5; j++) {
        const t = j / 5, y = last.y - drop * t;
        const x = THREE.MathUtils.clamp(last.x * (1 + (curly ? 0.9 : 0.35) * t), curly ? -0.21 : -0.16, curly ? 0.21 : 0.16) + Math.sin(t * 5 + k) * 0.006;
        const z = Math.min(last.z, -0.06) - 0.035 * t - (y < -0.2 ? 0.03 + Math.abs(x) * 0.15 : 0) - r() * 0.012;
        pts.push(new THREE.Vector3(x, y, z));
      }
      let curve = new THREE.CatmullRomCurve3(pts);
      if (curly) {   // wind a tight spiral around the path
        const NS = 90, sp2 = curve.getSpacedPoints(NS), fr = curve.computeFrenetFrames(NS, false), cr = 0.007 + r() * 0.004, ph0 = r() * 6.28;
        curve = new THREE.CatmullRomCurve3(sp2.map((pp, i) => { const t = i / NS * 26 + ph0, k2 = Math.min(1, i / 6);
          return pp.clone().addScaledVector(fr.normals[i], Math.cos(t) * cr * k2).addScaledVector(fr.binormals[i], Math.sin(t) * cr * k2); }));
      }
      const TS = curly ? 150 : 48, RAD = curly ? 5 : 6;
      const g = new THREE.TubeGeometry(curve, TS, thick * (0.85 + r() * 0.3), RAD, false), P = g.attributes.position, c = new THREE.Vector3(), v = new THREE.Vector3();
      const ph = r() * 6.28;
      for (let i = 0; i <= TS; i++) {
        curve.getPointAt(i / TS, c);
        const taper = i < 3 ? 0.55 + i * 0.15 : i > TS - 4 ? 0.65 + (TS - i) * 0.09 : 1;
        for (let j = 0; j <= RAD; j++) {
          const idx = i * (RAD + 1) + j, ang = (j / RAD) * Math.PI * 2;
          const f = curly ? 1 : fly ? 1 + 0.38 * Math.max(0, Math.sin(i * 0.9 + ph + ang)) + 0.12 * Math.sin(i * 2.7 + ph)
                        : 1 + 0.3 * Math.max(0, Math.sin(i * 1.6 + (j % 2 ? Math.PI : 0) + ang * 0.5));
          v.fromBufferAttribute(P, idx).sub(c).multiplyScalar(f * taper).add(c); P.setXYZ(idx, v.x, v.y, v.z);
        }
      }
      g.computeVertexNormals();
      G.add(new THREE.Mesh(g, mat));
    }
    // ends: small cuffs / sealed tips on butterfly locs
    return G;
  }
  // Sleek high ponytail: a bundle of strands gathered at the crown with a band, arcing back and down the back.
  function highPony(hairM, eyeY, eyeZ, top) {
    const G = new THREE.Group(), r = rnd(17), mat = hairM.clone(); mat.roughness = 0.35;
    const base = new THREE.Vector3(0, top - 0.02, eyeZ - 0.155);
    const spine = [base, new THREE.Vector3(0, top + 0.012, eyeZ - 0.2), new THREE.Vector3(0, eyeY + 0.03, eyeZ - 0.255),
      new THREE.Vector3(0, eyeY - 0.12, eyeZ - 0.262), new THREE.Vector3(0, eyeY - 0.3, eyeZ - 0.255), new THREE.Vector3(0, eyeY - 0.46, eyeZ - 0.245)];
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
    if (type === "shield") {   // one wrap-around mirrored visor
      const r = z0 - zcF + 0.003, v = new THREE.Mesh(new THREE.CylinderGeometry(r, r - 0.003, 0.038, 48, 1, true, -0.72, 1.44), mirror);
      v.position.set(0, eyeY, zcF); G.add(v);
      const top = new THREE.Mesh(new THREE.TorusGeometry(r + 0.001, 0.0022, 8, 48, 1.44), frameBlack); top.rotation.x = Math.PI / 2; top.rotation.z = -Math.PI / 2 - 0.72; top.position.set(0, eyeY + 0.019, zcF); G.add(top);
      temples(frameBlack, 0.004, 0.006); return G;
    }
    if (type === "goggles") {
      const r = z0 - zcF + 0.01;
      const lens = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.034, 48, 1, true, -0.62, 1.24), new THREE.MeshPhysicalMaterial({ color: 0x5a6a5a, roughness: 0.04, metalness: 0.6, transparent: true, opacity: 0.8, clearcoat: 1, envMap: envTex, envMapIntensity: 2, side: THREE.DoubleSide }));
      lens.position.set(0, eyeY, zcF); G.add(lens);
      const rim = new THREE.Mesh(new THREE.CylinderGeometry(r - 0.003, r - 0.003, 0.044, 48, 1, true, -0.68, 1.36), new THREE.MeshStandardMaterial({ color: 0x141416, roughness: 0.8, side: THREE.DoubleSide }));
      rim.position.set(0, eyeY, zcF - 0.002); G.add(rim);
      G.add(headStrap(0.098, 0.008, new THREE.MeshStandardMaterial({ color: 0x1d1f1a, roughness: 0.95 }), eyeY + 0.004, -0.006, Math.PI * 1.3, 1.6));
      return G;
    }
    if (type === "vr") {
      const sh = new THREE.Shape(), w = 0.072, h = 0.03, rr = 0.014;
      sh.moveTo(-w + rr, -h); sh.lineTo(w - rr, -h); sh.quadraticCurveTo(w, -h, w, -h + rr); sh.lineTo(w, h - rr); sh.quadraticCurveTo(w, h, w - rr, h);
      sh.lineTo(-w + rr, h); sh.quadraticCurveTo(-w, h, -w, h - rr); sh.lineTo(-w, -h + rr); sh.quadraticCurveTo(-w, -h, -w + rr, -h);
      const white = new THREE.MeshPhysicalMaterial({ color: 0xf2f2f0, roughness: 0.35, clearcoat: 0.6 });
      white.envMap = envTex;
      const box = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 0.034, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.008, bevelSegments: 4, curveSegments: 16 }), white);
      box.position.set(0, eyeY + 0.008, eyeZ + 0.012); G.add(box);
      // soft black light seal between the visor and the face
      const seal = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 0.016, bevelEnabled: false, curveSegments: 16 }), new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.95 }));
      seal.scale.set(0.94, 0.9, 1); seal.position.set(0, eyeY + 0.008, eyeZ - 0.004); G.add(seal);
      const face = new THREE.Mesh(new THREE.ShapeGeometry(sh, 16), new THREE.MeshPhysicalMaterial({ color: 0x0c0c10, roughness: 0.15, clearcoat: 1 }));
      face.visible = false;
      const pillM = new THREE.MeshPhysicalMaterial({ color: 0x0a0a0c, roughness: 0.1, clearcoat: 1 });
      for (const x of [-0.042, 0, 0.042]) {   // three sensor pills across the front
        const pill = new THREE.Mesh(new THREE.CapsuleGeometry(0.0055, 0.012, 6, 12), pillM); pill.rotation.z = Math.PI / 2; pill.scale.z = 0.3;
        pill.position.set(x, eyeY + 0.008, eyeZ + 0.0565); G.add(pill);
      }
      const strapM = new THREE.MeshStandardMaterial({ color: 0x2a2a2e, roughness: 0.85 });
      G.add(headStrap(0.099, 0.006, strapM, eyeY, -0.01, Math.PI * 1.35, 2.2));
      const top = new THREE.Mesh(new THREE.TorusGeometry(0.095, 0.005, 6, 32, Math.PI * 0.9), strapM); top.rotation.y = Math.PI / 2; top.rotation.z = Math.PI * 0.05; top.position.set(0, eyeY - 0.005, -0.012); G.add(top);
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
    // irises on the eyeballs
    const eyeC = std({ color: EYES[one("eyes")] || EYES.brown, roughness: 0.15 }), pupil = std({ color: 0x050505, roughness: 0.1 });
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
    const style = one("hair") || "straight";
    const capped = has("gear", "beanie") || has("gear", "cap");
    const HAIRMAP = { straight: "hair_long", wave: "hair_long", curly: "hair_afro", knotless: "hair_pixie", butterfly: "hair_pixie", pony: "hair_pony", buns: "hair_pixie", spike: "hair_pixie", bob: "hair_bob", pixie: "hair_pixie", own: "hair_long" };
    const realHair = !!M.hair_long;
    if (realHair) {
      const want = HAIRMAP[style] || "hair_long", tint = new THREE.Color(HAIR[one("haircolor")] || HAIR.black);
      const braided = style === "knotless" || style === "butterfly" || style === "curly";
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
    if (realHair && scalp && (style === "knotless" || style === "butterfly" || style === "curly")) {   // tight scalp cap under the braids / curls
      // matte cap with braid partings (scalp lines between sections) so it reads as hair, not a helmet
      const capM = std({ color: HAIR[one("haircolor")] || HAIR.black, roughness: 0.85, map: canvasTex("parts", 512, 256, (g, w, h) => {
        g.fillStyle = "#ffffff"; g.fillRect(0, 0, w, h); g.strokeStyle = "#5a4636"; g.globalAlpha = 0.85;
        for (let i = 0; i < 26; i++) { const x = (i + 0.5) / 26 * w; g.lineWidth = 2.2; g.beginPath(); g.moveTo(x, h * 0.04); for (let y = 0; y <= h; y += 16) g.lineTo(x + Math.sin(y * 0.05 + i) * 3, y); g.stroke(); }
        g.globalAlpha = 0.35; g.fillStyle = "#000"; for (let k = 0; k < 900; k++) g.fillRect((k * 97) % w, (k * 53) % h, 2, 6);   // fine strand texture
      }) });
      const cap = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 28, 0, Math.PI * 2, 0, Math.PI * 0.6), capM);
      cap.scale.copy(scalp.r).multiplyScalar(1.005); cap.position.copy(scalp.c); cap.rotation.x = -0.62; H.add(cap);
    }
    if (realHair && style === "curly") H.add(braidHair("curly", R, 0.26, hairM, scalp));
    else if (realHair && style === "pony") H.add(highPony(hairM, eyeY, eyeZ, scalpTop));
    else if (realHair && style === "buns") {
      for (const sd of [-1, 1]) {
        const bn = sphere(0.04, hairM, sd * 0.052, scalpTop - 0.024, zc - 0.004, 1, 0.9, 1); H.add(bn);
        const tw = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.009, 8, 28), hairM); tw.position.set(sd * 0.05, scalpTop - 0.034, zc - 0.004); tw.rotation.set(Math.PI / 2 - 0.2, 0, sd * 0.4); H.add(tw);
      }
    }
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
      H.add(braidHair(style, R, backLen, hairM, scalp));
    } else if (style === "pony") {
      H.add(sphere(0.032, hairM, 0, 0.07, -0.1));
      H.add(limb([0, 0.07, -0.12], [0, -backLen, -0.17], 0.038, 0.018, hairM));
    } else if (style === "buns") {
      for (const sd of [-1, 1]) H.add(sphere(0.048, hairM, sd * 0.06, 0.1, -0.02));
    } else if (style === "spike") {   // low bun at the nape + a stiff tapered ponytail shooting up and back like a horn
      H.add(sphere(0.05, hairM, 0, -0.055, -0.1, 1.05, 0.95, 0.9));
      H.add(limb([0, 0.035, -0.095], [0, 0.22, -0.38], 0.03, 0.011, hairM));
      H.add(sphere(0.024, hairM, 0, 0.04, -0.095));
    } else if (style === "bob") {
      const bob = new THREE.Mesh(new THREE.SphereGeometry(R * 1.2, 40, 24, 0, Math.PI * 2, 0, Math.PI * 0.66), hairM);
      bob.position.set(0, 0.0, -0.02); bob.rotation.x = -0.2; H.add(bob);
    } else if (style === "pixie") { /* the cap is enough */ }
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
      const nailM = std({ color: 0xd94c8a, roughness: 0.15, metalness: 0.1 });
      for (const sd of ["l", "r"]) for (const f of ["thumb", "index", "middle", "ring", "pinky"]) {
        const a = B[f + "_02_" + sd], b2 = B[f + "_03_" + sd]; if (!a || !b2) continue;
        const pa = bonePos(f + "_02_" + sd), pb = bonePos(f + "_03_" + sd), dir = pb.clone().sub(pa); const seg = dir.length() || 0.02; dir.normalize();
        const tip = pb.clone().add(dir.clone().multiplyScalar(seg * 0.85));
        extras.add(limb(tip.toArray(), tip.clone().add(dir.clone().multiplyScalar(0.016)).toArray(), 0.0045, 0.0028, nailM));
      }
    }
    if (has("gear", "beanie")) H.add(sphere(R * 1.08, std({ color: 0x2a2b2e, roughness: 1 }), 0, 0.03, -0.01, 0.97, 0.92, 1.05));
    if (has("gear", "cap")) { H.add(sphere(R * 1.06, dark, 0, 0.03, -0.01, 0.97, 0.82, 1.05)); H.add(boxM(0.13, 0.012, 0.09, dark, 0, 0.04, 0.1)); }
    if (has("gear", "headset")) {
      const hb = new THREE.Mesh(new THREE.TorusGeometry(R * 1.08, 0.009, 8, 32, Math.PI), black); hb.position.set(0, 0.0, -0.005); H.add(hb);
      for (const sd of [-1, 1]) H.add(sphere(0.028, black, sd * R * 1.04, 0, 0, 0.6, 1, 1));
    }
    const lobeAt = (sd) => { const L = faceFit && faceFit.lobe && faceFit.lobe[sd > 0 ? 0 : 1]; return L ? L.clone().sub(H.position) : new THREE.Vector3(sd * 0.073, -0.03, 0.005); };
    if (has("jewelry", "hoops")) for (const sd of [-1, 1]) { const L = lobeAt(sd), h = new THREE.Mesh(new THREE.TorusGeometry(0.016, 0.0024, 8, 32), gold); h.position.set(L.x + sd * 0.002, L.y - 0.015, L.z); h.rotation.y = Math.PI / 2; H.add(h); }
    if (has("jewelry", "crystalband")) {   // rhinestone band over the crown, ear to ear
      const ice = std({ color: 0xffffff, metalness: 0.7, roughness: 0.05, emissive: 0x333344 });
      for (let i = 0; i <= 14; i++) { const a = -1.25 + i * (2.5 / 14); H.add(sphere(0.0065, ice, Math.sin(a) * R * 1.12, -0.035 + Math.cos(a) * R * 1.12, 0.012 + Math.cos(a) * 0.012, 1, 1, 0.6)); }
    }
    if (has("jewelry", "studs")) for (const sd of [-1, 1]) { const L = lobeAt(sd); H.add(sphere(0.0032, new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0.2, roughness: 0.02, clearcoat: 1, envMap: envTex || null, envMapIntensity: 2.5 }), L.x + sd * 0.0015, L.y - 0.002, L.z)); }

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
      if (bgTex[want]) backdrop.material.map = bgTex[want];
      else new THREE.TextureLoader().load(new URL("img/baddies/bg3d/" + want + ".webp?v=2", document.baseURI).href, (t) => {
        t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; bgTex[want] = t;
        if (bgWant === want) { backdrop.material.map = t; backdrop.material.needsUpdate = true; }
      });
      backdrop.material.needsUpdate = true; backdrop.visible = true; ground.visible = false;
      controls.maxDistance = 7; controls.minPolarAngle = 1.2; controls.maxPolarAngle = Math.PI / 2 + 0.06;
      if (!was) frameForBackdrop();
    } else {
      backdrop.visible = false; canvasWrap.style.background = lookBg;
      controls.maxDistance = 5.5; controls.minPolarAngle = 0.25; controls.maxPolarAngle = Math.PI / 2 + 0.12;
      if (curLook && !curLook.holo && !curLook.grid && !curLook.shadows) ground.visible = true;
    }
  }
  // fixed "scene" framing: fits a 7'6" person, so shorter heights read as shorter against the background
  function frameForBackdrop() {
    const off = camera.position.clone().sub(controls.target); off.y = 0; if (off.lengthSq() < 1e-6) off.set(0, 0, 1);
    off.setLength(5.6); controls.target.set(0, 1.05, 0); camera.position.set(off.x, 1.1, off.z); controls.update();
  }
  function placeBackdrop() {
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
    const cam = new THREE.PerspectiveCamera(camera.fov, W / H, 0.05, 50);
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
  window.BADDIES_3D = { build, scene, camera, controls, bones: B, get body() { return body; }, get faceIdx() { return faceIdx; }, faceFrame: () => faceFrame(), get faceRestF() { return faceRestF; }, get dbg() { return { eyeInfo, headInfo, faceFit, extras, holder, eyeRestF, eyeNow: eyeFrame(), faceNow: faceFrame(), faceRestF, eyesSkinned: !!(eyes && eyes.isSkinnedMesh), eyesName: eyes && eyes.name }; } };
}
