// AI Resource Hub — accept a photo handed over from the gallery.
// Links like motion-transfer.html?ref=<image url> drop that image into the
// page's photo input as if the user had picked it, then fire "change" so the
// page's own preview logic runs. If the image can't be fetched (CORS or the
// host is offline), a short note asks the user to add it manually.
(function () {
  var TARGETS = ["motionImage", "lipImage"];
  var ref;
  try { ref = new URLSearchParams(location.search).get("ref"); } catch (e) { return; }
  if (!ref || !/^https?:\/\//i.test(ref)) return;

  document.addEventListener("DOMContentLoaded", function () {
    var input = null;
    for (var i = 0; i < TARGETS.length; i++) {
      input = document.getElementById(TARGETS[i]);
      if (input) break;
    }
    if (!input) return;

    fetch(ref, { mode: "cors" })
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.blob(); })
      .then(function (blob) {
        if (!/^image\//.test(blob.type)) throw new Error("not an image");
        var ext = (blob.type.split("/")[1] || "jpg").replace("jpeg", "jpg");
        var file = new File([blob], "gallery-image." + ext, { type: blob.type });
        var dt = new DataTransfer();
        dt.items.add(file);
        input.files = dt.files;
        input.dispatchEvent(new Event("change", { bubbles: true }));
        note(input, "Photo added from the gallery.", false);
      })
      .catch(function () {
        note(input, "Couldn't bring that photo over automatically. Download it from the gallery, then add it here.", true);
      });

    try { history.replaceState(null, "", location.pathname); } catch (e) {}
  });

  function note(input, text, isError) {
    var p = document.createElement("p");
    p.className = "frame-res";
    p.style.margin = "8px 0 0";
    if (isError) p.style.color = "var(--color-red)";
    p.textContent = text;
    input.insertAdjacentElement("afterend", p);
  }
})();
