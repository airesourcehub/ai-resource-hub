// AI Resource Hub — Video section helpers (shared by the video tool pages).
// 1. Upload boxes: show a thumbnail / file name once a file is picked or dropped.
// 2. Hide the "how it works" steps once a render is running or finished.
(function () {
  document.addEventListener("DOMContentLoaded", function () {
    var root = document.querySelector(".vs");
    if (!root) return;

    // ---------- Upload boxes ----------
    Array.prototype.forEach.call(document.querySelectorAll(".vs-drop"), function (drop) {
      var input = drop.querySelector('input[type="file"]');
      var out = drop.querySelector(".vs-drop-file");
      if (!input || !out) return;
      var url = null;

      function paint() {
        var f = input.files && input.files[0];
        if (url) { URL.revokeObjectURL(url); url = null; }
        out.innerHTML = "";
        drop.classList.toggle("has-file", !!f);
        if (!f) return;
        var kind = (f.type || "").split("/")[0];
        if (kind === "image" || kind === "video") {
          url = URL.createObjectURL(f);
          var el = document.createElement(kind === "image" ? "img" : "video");
          el.src = url;
          if (kind === "video") { el.muted = true; el.playsInline = true; el.preload = "metadata"; }
          else el.alt = "";
          out.appendChild(el);
        } else {
          var a = document.createElement("div");
          a.className = "vs-drop-audio";
          a.innerHTML = '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/></svg>';
          out.appendChild(a);
        }
        var name = document.createElement("div");
        name.className = "vs-drop-name";
        name.textContent = f.name + " · " + fmtSize(f.size);
        out.appendChild(name);
        var rep = document.createElement("span");
        rep.className = "vs-drop-replace";
        rep.textContent = "Replace";
        out.appendChild(rep);
      }

      input.addEventListener("change", paint);
      ["dragenter", "dragover"].forEach(function (ev) {
        drop.addEventListener(ev, function () { drop.classList.add("is-over"); });
      });
      ["dragleave", "drop"].forEach(function (ev) {
        drop.addEventListener(ev, function () { drop.classList.remove("is-over"); });
      });
      if (input.files && input.files.length) paint();
    });

    // ---------- Empty state ----------
    var watch = root.querySelectorAll(".vs-output > *");
    function visible(el) {
      if (el.classList.contains("form-status")) return el.textContent.trim().length > 0;
      return el.style.display !== "none" && getComputedStyle(el).display !== "none";
    }
    function sync() {
      var any = false;
      Array.prototype.forEach.call(watch, function (el) { if (visible(el)) any = true; });
      root.classList.toggle("has-output", any);
    }
    if (window.MutationObserver) {
      var mo = new MutationObserver(sync);
      Array.prototype.forEach.call(watch, function (el) {
        mo.observe(el, { attributes: true, attributeFilter: ["style", "class"], childList: true, characterData: true, subtree: el.classList.contains("form-status") });
      });
    }
    sync();
  });

  function fmtSize(b) {
    if (!b && b !== 0) return "";
    if (b > 1048576) return (b / 1048576).toFixed(1) + " MB";
    return Math.max(1, Math.round(b / 1024)) + " KB";
  }
})();
