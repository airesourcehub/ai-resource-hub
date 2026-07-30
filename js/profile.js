// AI Resource Hub — user profiles.
// View any member's public profile (?u=<user_id>): avatar, bio, social links,
// and their public gallery posts. Your own profile is editable (avatar upload,
// bio, socials). Other members get a "Send message" button.

(function () {
  if (!window.supabase || typeof SUPABASE_URL === "undefined") return;
  var client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  var AVATAR_BASE = SUPABASE_URL + "/storage/v1/object/public/avatars/";

  var me = null, profileId = null, isOwn = false, data = null;

  var SOCIALS = [
    { key: "instagram", label: "Instagram", base: "https://instagram.com/" },
    { key: "tiktok", label: "TikTok", base: "https://tiktok.com/@" },
    { key: "youtube", label: "YouTube", base: "https://youtube.com/" },
    { key: "facebook", label: "Facebook", base: "https://facebook.com/" },
    { key: "snapchat", label: "Snapchat", base: "https://snapchat.com/add/" },
    { key: "x_twitter", label: "X", base: "https://x.com/" },
    { key: "website", label: "Website", base: "" }
  ];

  init();

  async function init() {
    var s = await client.auth.getSession();
    me = s.data.session ? s.data.session.user : null;
    var params = new URLSearchParams(location.search);
    profileId = params.get("u") || (me && me.id);
    if (!profileId) {
      showGate('Please <a href="auth.html">log in</a> to view your profile.');
      return;
    }
    isOwn = !!(me && me.id === profileId);
    await load();
    wire();
  }

  function showGate(html) {
    var g = document.getElementById("profGate");
    g.innerHTML = html; g.classList.add("show"); g.style.display = "";
  }

  async function load() {
    var res = await client.from("public_profiles").select("*").eq("id", profileId).single();
    data = (res && res.data) || { id: profileId };
    render();
    loadGallery();
  }

  function avatarUrl(bust) {
    if (data.avatar_url) return data.avatar_url + (bust ? ("?t=" + Date.now()) : "");
    return "img/models/anima.jpg"; // soft fallback tile
  }

  function render() {
    document.getElementById("profHeader").style.display = "";
    var name = (data.display_name || "").trim() || (isOwn ? "You" : "Member");
    document.getElementById("profName").textContent = name;
    document.getElementById("profBio").textContent = data.bio || "";
    var av = document.getElementById("profAvatar");
    av.src = avatarUrl(true);
    av.onerror = function () { av.onerror = null; av.src = "img/models/anima.jpg"; };

    // socials
    var host = document.getElementById("profSocials");
    host.innerHTML = SOCIALS.map(function (s) {
      var v = (data[s.key] || "").trim();
      if (!v) return "";
      return '<a class="profile-social" target="_blank" rel="noopener" href="' + esc(socialUrl(s, v)) + '">' + s.label + '</a>';
    }).join("");

    document.getElementById("profEditBtn").style.display = isOwn ? "" : "none";
    document.getElementById("profActivityBtn").style.display = isOwn ? "" : "none";
    document.getElementById("profMessageBtn").style.display = (!isOwn && me) ? "" : "none";
  }

  function socialUrl(s, v) {
    if (/^https?:\/\//i.test(v)) return v;
    return s.base + v.replace(/^@/, "");
  }

  async function loadGallery() {
    var res = await client.from("gallery_prompts")
      .select("id, image_url, cover_url, title, media_type")
      .eq("user_id", profileId).eq("is_public", true).eq("is_removed", false)
      .order("created_at", { ascending: false }).limit(24);
    var rows = (res && res.data) || [];
    if (!rows.length) return;
    document.getElementById("profGalleryTitle").textContent = (isOwn ? "Your" : (data.display_name || "Member") + "’s") + " gallery posts";
    document.getElementById("profGalleryWrap").style.display = "";
    document.getElementById("profGallery").innerHTML = rows.map(function (r) {
      var img = r.cover_url || r.image_url;
      return '<a class="image-cell" href="gallery.html" title="' + esc(r.title || "") + '"><img loading="lazy" src="' + esc(img) + '" alt="" /></a>';
    }).join("");
  }

  // ---- edit ---------------------------------------------------------------
  function wire() {
    var eb = document.getElementById("profEditBtn");
    if (eb) eb.addEventListener("click", openEdit);
    var cancel = document.getElementById("profCancelBtn");
    if (cancel) cancel.addEventListener("click", function () { document.getElementById("profEdit").style.display = "none"; });
    var save = document.getElementById("profSaveBtn");
    if (save) save.addEventListener("click", saveProfile);
    var msg = document.getElementById("profMessageBtn");
    if (msg) msg.addEventListener("click", function () { location.href = "messages.html?to=" + encodeURIComponent(profileId); });
    var af = document.getElementById("editAvatarFile");
    if (af) af.addEventListener("change", uploadAvatar);
  }

  function openEdit() {
    var box = document.getElementById("profEdit");
    box.style.display = "";
    document.getElementById("editName").value = data.display_name || "";
    document.getElementById("editBio").value = data.bio || "";
    document.getElementById("editInstagram").value = data.instagram || "";
    document.getElementById("editTiktok").value = data.tiktok || "";
    document.getElementById("editYoutube").value = data.youtube || "";
    document.getElementById("editFacebook").value = data.facebook || "";
    document.getElementById("editSnapchat").value = data.snapchat || "";
    document.getElementById("editX").value = data.x_twitter || "";
    document.getElementById("editWebsite").value = data.website || "";
    document.getElementById("editAvatarPreview").src = avatarUrl(true);
    box.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  async function uploadAvatar() {
    var f = document.getElementById("editAvatarFile").files[0];
    if (!f || !me) return;
    setSave("Uploading picture…");
    var key = me.id + ".jpg";
    try {
      var up = await client.storage.from("avatars").upload(key, f, { upsert: true, contentType: f.type || "image/jpeg", cacheControl: "60" });
      if (up.error) throw up.error;
      data.avatar_url = AVATAR_BASE + key;
      document.getElementById("editAvatarPreview").src = data.avatar_url + "?t=" + Date.now();
      setSave("Picture uploaded — remember to Save.", "success");
    } catch (e) {
      setSave("Couldn’t upload the picture: " + (e.message || e), "error");
    }
    document.getElementById("editAvatarFile").value = "";
  }

  async function saveProfile() {
    if (!me) return;
    setSave("Saving…");
    var patch = {
      display_name: val("editName"), bio: val("editBio"),
      instagram: val("editInstagram"), tiktok: val("editTiktok"),
      youtube: val("editYoutube"), facebook: val("editFacebook"),
      snapchat: val("editSnapchat"), x_twitter: val("editX"), website: val("editWebsite"),
      avatar_url: data.avatar_url || null
    };
    var r = await client.from("profiles").update(patch).eq("id", me.id);
    if (r.error) { setSave("Couldn’t save: " + r.error.message, "error"); return; }
    Object.keys(patch).forEach(function (k) { data[k] = patch[k]; });
    setSave("Saved.", "success");
    render();
    setTimeout(function () { document.getElementById("profEdit").style.display = "none"; }, 700);
  }

  function val(id) { var v = (document.getElementById(id).value || "").trim(); return v || null; }
  function setSave(m, k) { var e = document.getElementById("profSaveStatus"); e.textContent = m || ""; e.className = "form-status" + (k ? " " + k : ""); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
})();
