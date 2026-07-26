// AI Resource Hub — AI Transitions frame extractor
// Grabs the first and last frame of an uploaded video at its native
// resolution, entirely client-side (nothing is uploaded). Offers each frame
// as a JPEG or PNG download and shows the resolution under the buttons.

(function () {
  var MAX_BYTES = 250 * 1024 * 1024; // 250 MB
  var JPEG_QUALITY = 0.95;

  document.addEventListener("DOMContentLoaded", function () {
    var input = document.getElementById("videoInput");
    var video = document.getElementById("transitionsVideo");
    var statusEl = document.getElementById("transitionsStatus");
    var results = document.getElementById("transitionsResults");
    if (!input || !video) return;

    // Holds the object URLs we hand out so we can revoke the previous run's.
    var currentUrls = [];
    function clearUrls() {
      currentUrls.forEach(function (u) { try { URL.revokeObjectURL(u); } catch (e) {} });
      currentUrls = [];
    }

    function setStatus(msg, type) {
      if (!statusEl) return;
      statusEl.textContent = msg || "";
      statusEl.className = "form-status" + (msg ? " show" : "") + (type ? " " + type : "");
    }

    input.addEventListener("change", function () {
      var file = input.files && input.files[0];
      if (!file) return;

      if (file.type && file.type.indexOf("video") !== 0) {
        setStatus("Please choose a video file.", "error");
        return;
      }
      if (file.size > MAX_BYTES) {
        setStatus("That video is larger than 250 MB. Please use a smaller clip.", "error");
        return;
      }

      if (results) results.style.display = "none";
      clearUrls();
      setStatus("Loading video…", "");

      var srcUrl = URL.createObjectURL(file);
      currentUrls.push(srcUrl);
      video.src = srcUrl;

      var baseName = (file.name || "video").replace(/\.[^.]+$/, "").replace(/[^a-z0-9_-]+/gi, "_").slice(0, 40) || "video";

      onceLoaded(video).then(function () {
        setStatus("Extracting frames…", "");
        return extractFrames(video);
      }).then(function (frames) {
        var w = frames.width, h = frames.height;
        if (!w || !h) throw new Error("unsupported");
        return renderResults(frames, w, h, baseName);
      }).then(function () {
        setStatus("", "");
      }).catch(function (err) {
        console.error(err);
        if (err && err.message === "unsupported") {
          setStatus("Couldn't read frames from that video — the format or codec may not be supported by your browser. Try an MP4 (H.264) or WebM file.", "error");
        } else {
          setStatus("Something went wrong reading that video. Try a different file or format.", "error");
        }
      });
    });

    // ---- helpers ----

    function onceLoaded(v) {
      return new Promise(function (resolve, reject) {
        var done = false;
        function ok() { if (!done) { done = true; cleanup(); resolve(); } }
        function fail() { if (!done) { done = true; cleanup(); reject(new Error("load error")); } }
        function cleanup() {
          v.removeEventListener("loadedmetadata", ok);
          v.removeEventListener("error", fail);
        }
        if (v.readyState >= 1 && v.videoWidth) return resolve();
        v.addEventListener("loadedmetadata", ok);
        v.addEventListener("error", fail);
        v.load();
        setTimeout(function () { if (!done) { done = true; cleanup(); resolve(); } }, 20000);
      });
    }

    // Some containers (e.g. certain WebM recordings) report duration as
    // Infinity until you seek to the end — force it to resolve.
    function ensureDuration(v) {
      return new Promise(function (resolve) {
        if (isFinite(v.duration) && v.duration > 0) return resolve(v.duration);
        var done = false;
        function check() {
          if (!done && isFinite(v.duration) && v.duration > 0) {
            done = true; v.removeEventListener("durationchange", check); resolve(v.duration);
          }
        }
        v.addEventListener("durationchange", check);
        try { v.currentTime = 1e6; } catch (e) {}
        setTimeout(function () {
          if (!done) { done = true; v.removeEventListener("durationchange", check); resolve(isFinite(v.duration) ? v.duration : (v.currentTime || 0)); }
        }, 4000);
      });
    }

    function seekTo(v, t) {
      return new Promise(function (resolve) {
        var done = false;
        function onSeeked() { if (!done) { done = true; v.removeEventListener("seeked", onSeeked); resolve(); } }
        v.addEventListener("seeked", onSeeked);
        try { v.currentTime = t; } catch (e) { if (!done) { done = true; v.removeEventListener("seeked", onSeeked); resolve(); } }
        setTimeout(function () { if (!done) { done = true; v.removeEventListener("seeked", onSeeked); resolve(); } }, 5000);
      });
    }

    function grabCanvas(v) {
      var c = document.createElement("canvas");
      c.width = v.videoWidth;
      c.height = v.videoHeight;
      c.getContext("2d").drawImage(v, 0, 0, c.width, c.height);
      return c;
    }

    function toBlob(canvas, type, quality) {
      return new Promise(function (resolve) {
        canvas.toBlob(function (b) { resolve(b); }, type, quality);
      });
    }

    async function extractFrames(v) {
      var dur = await ensureDuration(v);
      // First frame
      await seekTo(v, 0);
      var firstCanvas = grabCanvas(v);
      // Last frame — nudge just before the end so a real frame is decoded
      var lastT = Math.max(0, (isFinite(dur) && dur > 0 ? dur : (v.currentTime || 0)) - 0.05);
      await seekTo(v, lastT);
      var lastCanvas = grabCanvas(v);
      return { firstCanvas: firstCanvas, lastCanvas: lastCanvas, width: v.videoWidth, height: v.videoHeight };
    }

    async function renderResults(frames, w, h, baseName) {
      var firstImg = document.getElementById("firstFrameImg");
      var lastImg = document.getElementById("lastFrameImg");
      var firstRes = document.getElementById("firstFrameRes");
      var lastRes = document.getElementById("lastFrameRes");

      var res = w + " × " + h + " px";
      if (firstRes) firstRes.textContent = res;
      if (lastRes) lastRes.textContent = res;

      var firstPng = await toBlob(frames.firstCanvas, "image/png");
      var firstJpg = await toBlob(frames.firstCanvas, "image/jpeg", JPEG_QUALITY);
      var lastPng = await toBlob(frames.lastCanvas, "image/png");
      var lastJpg = await toBlob(frames.lastCanvas, "image/jpeg", JPEG_QUALITY);

      var firstPngUrl = URL.createObjectURL(firstPng); currentUrls.push(firstPngUrl);
      var firstJpgUrl = URL.createObjectURL(firstJpg); currentUrls.push(firstJpgUrl);
      var lastPngUrl = URL.createObjectURL(lastPng); currentUrls.push(lastPngUrl);
      var lastJpgUrl = URL.createObjectURL(lastJpg); currentUrls.push(lastJpgUrl);

      if (firstImg) firstImg.src = firstPngUrl;
      if (lastImg) lastImg.src = lastPngUrl;

      wireDownload("firstPngBtn", firstPngUrl, baseName + "-first-frame.png");
      wireDownload("firstJpgBtn", firstJpgUrl, baseName + "-first-frame.jpg");
      wireDownload("lastPngBtn", lastPngUrl, baseName + "-last-frame.png");
      wireDownload("lastJpgBtn", lastJpgUrl, baseName + "-last-frame.jpg");

      if (results) results.style.display = "";
    }

    function wireDownload(btnId, url, filename) {
      var btn = document.getElementById(btnId);
      if (!btn) return;
      btn.onclick = function () {
        var a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      };
    }
  });
})();
