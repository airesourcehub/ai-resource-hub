// AI Resource Hub — site-wide settings from the admin panel (Admin → Site Settings).
// Loaded in <head> on every page. Applies the cached accent colors right away
// (no flash), then applies menu changes and refreshes the cache from Supabase
// (table site_settings, key "site").

(function () {
  var CACHE = "airh-site-settings";
  var DEFAULT_NAV = ["explore", "image", "video", "audio", "influencer", "mcp", "prompts"];

  function read() { try { return JSON.parse(localStorage.getItem(CACHE) || "null"); } catch (e) { return null; } }
  function write(v) { try { localStorage.setItem(CACHE, JSON.stringify(v)); } catch (e) {} }

  // ---------------------------------------------------------------- colors
  function hexToRgb(h) {
    h = String(h || "").replace("#", "");
    if (h.length === 3) h = h.split("").map(function (c) { return c + c; }).join("");
    if (!/^[0-9a-f]{6}$/i.test(h)) return null;
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  function toHex(rgb) { return "#" + rgb.map(function (v) { v = Math.max(0, Math.min(255, Math.round(v))); return ("0" + v.toString(16)).slice(-2); }).join(""); }
  function mix(rgb, target, t) { return rgb.map(function (v, i) { return v + (target[i] - v) * t; }); }
  function lum(rgb) {
    var a = rgb.map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
  }
  function on(rgb) { return lum(rgb) > 0.36 ? "#121214" : "#ffffff"; }

  function colorCss(s) {
    var dark = hexToRgb(s && s.accent);
    if (!dark) return "";
    var light = hexToRgb(s.accentLight) || (lum(dark) > 0.3 ? mix(dark, [0, 0, 0], 0.38) : dark);
    var dHover = toHex(mix(dark, [255, 255, 255], 0.22));
    var lHover = toHex(mix(light, [0, 0, 0], 0.18));
    var D = toHex(dark), L = toHex(light);
    return "html[data-theme=\"dark\"]{" +
      "--color-accent:" + D + ";--color-accent-hover:" + dHover + ";--color-accent-soft:rgba(" + dark.join(",") + ",0.12);" +
      "--color-on-accent:" + on(dark) + ";--color-cta:" + D + ";--color-cta-hover:" + dHover + ";--color-on-cta:" + on(dark) + ";" +
      "--color-gold:" + D + ";--color-gold-hover:" + dHover + "}" +
      "html:root:not([data-theme=\"dark\"]){" +
      "--color-accent:" + L + ";--color-accent-hover:" + lHover + ";--color-accent-soft:" + toHex(mix(light, [255, 255, 255], 0.86)) + ";" +
      "--color-on-accent:" + on(light) + ";--color-cta:" + D + ";--color-cta-hover:" + dHover + ";--color-on-cta:" + on(dark) + ";" +
      "--color-gold:" + D + ";--color-gold-hover:" + dHover + "}";
  }

  function applyColors(s) {
    var el = document.getElementById("airhSiteVars");
    if (!el) { el = document.createElement("style"); el.id = "airhSiteVars"; document.head.appendChild(el); }
    el.textContent = colorCss(s);
  }

  // ---------------------------------------------------------------- menu
  function applyNav(s) {
    var ul = document.querySelector(".nav-links");
    if (!ul || !s) return;
    var nav = s.nav || {};
    var order = (s.navOrder && s.navOrder.length ? s.navOrder : DEFAULT_NAV).slice();
    DEFAULT_NAV.forEach(function (k) { if (order.indexOf(k) < 0) order.push(k); });
    var anchor = ul.querySelector(".nav-plain");
    order.forEach(function (key) {
      var li = ul.querySelector('.nav-sec[data-sec="' + key + '"]');
      if (!li) return;
      var cfg = nav[key] || {};
      li.hidden = cfg.visible === false;
      li.style.display = cfg.visible === false ? "none" : "";
      var a = li.querySelector(".nav-sec-link");
      if (a) {
        if (!a.getAttribute("data-default-label")) a.setAttribute("data-default-label", a.textContent);
        var label = (cfg.label || "").trim() || a.getAttribute("data-default-label");
        a.textContent = label;
        if (cfg.badge) {
          var b = document.createElement("span");
          b.className = "nav-badge";
          b.textContent = String(cfg.badge).slice(0, 8);
          a.appendChild(b);
        }
      }
      if (anchor) ul.insertBefore(li, anchor);
    });
    var cta = s.cta || {};
    var ctaA = ul.querySelector(".nav-cta");
    if (ctaA) {
      if (cta.label) ctaA.textContent = cta.label;
      if (cta.href) ctaA.setAttribute("href", cta.href);
      ctaA.parentElement.style.display = cta.visible === false ? "none" : "";
    }
    var status = ul.querySelector(".nav-plain");
    if (status) status.style.display = s.showStatus === false ? "none" : "";
  }

  // ---------------------------------------------------------------- boot
  var cached = read();
  if (cached) applyColors(cached);

  window.AIRH_SITE = {
    defaults: { accent: "#ff6a1f", accentLight: "", navOrder: DEFAULT_NAV.slice(), nav: {}, cta: { label: "Start creating", href: "image-studio.html", visible: true }, showStatus: true, signupsOpen: false, hostGpuName: "" },
    apply: function (s) { applyColors(s); applyNav(s); },
    colorCss: colorCss
  };

  document.addEventListener("DOMContentLoaded", function () {
    if (cached) applyNav(cached);
    if (typeof SUPABASE_URL === "undefined" || typeof SUPABASE_ANON_KEY === "undefined") return;
    fetch(SUPABASE_URL + "/rest/v1/site_settings?key=eq.site&select=value", {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: "Bearer " + SUPABASE_ANON_KEY }
    }).then(function (r) { return r.ok ? r.json() : []; }).then(function (rows) {
      var v = rows && rows[0] ? rows[0].value : null;
      if (!v) {
        if (cached) { try { localStorage.removeItem(CACHE); } catch (e) {} v = window.AIRH_SITE.defaults; applyColors({}); applyNav(v); }
        return;
      }
      var changed = JSON.stringify(v) !== JSON.stringify(cached);
      write(v);
      if (changed) { applyColors(v); applyNav(v); }
    }).catch(function () {});
  });
})();
