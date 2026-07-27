// AI Resource Hub — file-input thumbnails.
// For every file input inside a .blend-inputs group (the AI Transitions clip
// pickers and the Motion Transfer image/video pickers), show a preview when a
// file is chosen: the image itself, or the first frame of a video.

(function () {
  function init() {
    var inputs = document.querySelectorAll(".blend-inputs input[type='file']");
    Array.prototype.forEach.call(inputs, attach);
  }

  function attach(input) {
    if (input.dataset.thumbWired) return;
    input.dataset.thumbWired = "1";

    var wrap = document.createElement("div");
    wrap.className = "file-thumb";
    wrap.style.display = "none";
    input.parentNode.insertBefore(wrap, input.nextSibling);

    input.addEventListener("change", function () {
      revoke(wrap);
      wrap.innerHTML = "";
      var f = input.files && input.files[0];
      if (!f) { wrap.style.display = "none"; return; }

      if (f.type.indexOf("image/") === 0) {
        var url = URL.createObjectURL(f);
        wrap._url = url;
        var img = document.createElement("img");
        img.alt = "Selected image preview";
        img.src = url;
        wrap.appendChild(img);
        wrap.style.display = "";
      } else if (f.type.indexOf("video/") === 0) {
        videoThumb(f, wrap);
      } else {
        wrap.style.display = "none";
      }
    });
  }

  function revoke(wrap) {
    if (wrap._url) { try { URL.revokeObjectURL(wrap._url); } catch (e) {} wrap._url = null; }
  }

  function videoThumb(f, wrap) {
    var url = URL.createObjectURL(f);
    wrap._url = url;
    var loading = document.createElement("span");
    loading.className = "file-thumb-loading";
    loading.textContent = "Loading preview…";
    wrap.appendChild(loading);
    wrap.style.display = "";

    var v = document.createElement("video");
    v.muted = true; v.playsInline = true; v.preload = "auto"; v.src = url;

    var done = false;
    function grab() {
      if (done) return;
      done = true;
      try {
        var c = document.createElement("canvas");
        c.width = v.videoWidth || 320;
        c.height = v.videoHeight || 180;
        c.getContext("2d").drawImage(v, 0, 0, c.width, c.height);
        wrap.innerHTML = "";
        var img = document.createElement("img");
        img.alt = "First frame preview";
        img.src = c.toDataURL("image/jpeg", 0.82);
        wrap.appendChild(img);
      } catch (e) {
        // Fallback: show the video element itself (paused on its first frame).
        wrap.innerHTML = "";
        v.controls = false;
        wrap.appendChild(v);
      }
      try { URL.revokeObjectURL(url); } catch (e) {}
      wrap._url = null;
    }

    v.addEventListener("loadeddata", function () {
      try { v.currentTime = Math.min(0.1, (v.duration || 1) / 2); }
      catch (e) { grab(); }
    });
    v.addEventListener("seeked", grab);
    v.addEventListener("error", function () { wrap.style.display = "none"; wrap.innerHTML = ""; });
    setTimeout(function () { if (!done && v.readyState >= 2) grab(); }, 2000);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
