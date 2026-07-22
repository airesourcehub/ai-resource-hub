// AI Resource Hub — theme toggle (Light / Dark / System)
// The actual theme is applied instantly by an inline script in <head> to
// avoid a flash of the wrong theme; this file just wires up the toggle
// button and keeps things in sync if the system preference changes live.

(function () {
  var STORAGE_KEY = "ai-resource-hub-theme"; // 'light' | 'dark' | 'system'
  var ICONS = { light: "☀️", dark: "🌙", system: "🖥️" };
  var LABELS = { light: "Light", dark: "Dark", system: "System" };

  function getStored() {
    try { return localStorage.getItem(STORAGE_KEY); } catch (e) { return null; }
  }

  function setStored(pref) {
    try { localStorage.setItem(STORAGE_KEY, pref); } catch (e) {}
  }

  function systemPrefersDark() {
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  }

  function resolve(pref) {
    if (pref === "dark" || pref === "light") return pref;
    return systemPrefersDark() ? "dark" : "light";
  }

  function apply(pref) {
    document.documentElement.setAttribute("data-theme", resolve(pref));
  }

  document.addEventListener("DOMContentLoaded", function () {
    var btn = document.getElementById("themeToggle");
    var pref = getStored() || "system";
    apply(pref);
    updateButton(btn, pref);

    if (btn) {
      btn.addEventListener("click", function () {
        var current = getStored() || "system";
        var next = current === "system" ? "light" : current === "light" ? "dark" : "system";
        setStored(next);
        apply(next);
        updateButton(btn, next);
      });
    }

    if (window.matchMedia) {
      window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", function () {
        var current = getStored() || "system";
        if (current === "system") apply("system");
      });
    }
  });

  function updateButton(btn, pref) {
    if (!btn) return;
    btn.textContent = ICONS[pref];
    btn.setAttribute("title", "Theme: " + LABELS[pref] + " (click to change)");
    btn.setAttribute("aria-label", "Theme: " + LABELS[pref] + ". Click to change.");
  }
})();
