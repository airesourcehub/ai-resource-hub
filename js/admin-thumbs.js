// AI Resource Hub — admin: replace Image Studio model thumbnails.
// Uploads to the public Supabase Storage bucket `model-thumbnails`; RLS lets
// only admins write. The Studio reads that bucket first, then the bundled
// default, then a gradient.

(function () {
  if (!window.supabase || typeof SUPABASE_URL === "undefined") return;
  var grid = document.getElementById("thumbAdminGrid");
  if (!grid) return;

  var client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  var BUCKET = "model-thumbnails";
  var BASE = SUPABASE_URL + "/storage/v1/object/public/" + BUCKET + "/";

  var MODELS = [
    { id: "flux2", name: "FLUX.2" }, { id: "qwen2512", name: "Qwen-Image 2512" },
    { id: "krea2", name: "Krea 2 Turbo" }, { id: "zimage", name: "Z-Image Turbo" },
    { id: "anima", name: "Anima" }, { id: "hidream", name: "HiDream O1" },
    { id: "sd35", name: "Stable Diffusion 3.5" }, { id: "qwen_edit", name: "Qwen Image Edit" },
    { id: "qwen_edit2509", name: "Qwen Edit 2509" }, { id: "qwen_edit2511", name: "Qwen Edit 2511" },
    { id: "firered", name: "FireRed Edit" }, { id: "flux2_edit", name: "FLUX.2 Image-to-Image" }
  ];

  render();

  function bust() { return "?t=" + Date.now(); }

  function render() {
    grid.innerHTML = MODELS.map(function (m) {
      return '<div class="thumb-admin-card">' +
        '<img class="thumb-admin-img" data-img="' + m.id + '" alt="' + m.name + '" ' +
             'src="' + BASE + m.id + '.jpg' + bust() + '" ' +
             'onerror="this.onerror=null;this.src=\'img/models/' + m.id + '.jpg\'" />' +
        '<div class="model-name" style="padding:8px 0 4px;">' + m.name + '</div>' +
        '<label class="btn btn-secondary btn-small" style="cursor:pointer;">Replace' +
          '<input type="file" accept="image/*" data-up="' + m.id + '" style="display:none;" />' +
        '</label>' +
        '<div class="form-status" data-st="' + m.id + '" style="min-height:18px;"></div>' +
      '</div>';
    }).join("");
    Array.prototype.forEach.call(grid.querySelectorAll("input[data-up]"), function (inp) {
      inp.addEventListener("change", function () { upload(inp.getAttribute("data-up"), inp.files[0]); });
    });
  }

  async function upload(id, file) {
    if (!file) return;
    var st = grid.querySelector('[data-st="' + id + '"]');
    st.textContent = "Uploading…"; st.className = "form-status";
    try {
      var r = await client.storage.from(BUCKET).upload(id + ".jpg", file, {
        upsert: true, contentType: file.type || "image/jpeg", cacheControl: "60"
      });
      if (r.error) throw r.error;
      var img = grid.querySelector('img[data-img="' + id + '"]');
      img.onerror = null; img.src = BASE + id + ".jpg" + bust();
      st.textContent = "Updated ✓"; st.className = "form-status success";
    } catch (e) {
      st.textContent = "Failed: " + (e.message || "upload error — are you logged in as admin?");
      st.className = "form-status error";
    }
  }
})();
