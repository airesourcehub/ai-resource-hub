// Admin → GPU Access tab (uses js/gpu-access-admin.js)
(function () {
  var mountEl = document.getElementById("adminGpuAccess");
  if (!mountEl || !window.AIRH_GPU_ADMIN || !window.supabase || typeof SUPABASE_URL === "undefined") return;
  var client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  var mounted = false;
  function mount() { if (!mounted) { mounted = true; window.AIRH_GPU_ADMIN.mount(mountEl, client); } }
  var tab = document.querySelector('[data-admin-tab="gpuaccess"]');
  if (tab) tab.addEventListener("click", mount);
  // pending-request count on the tab
  client.from("gpu_access").select("user_id", { count: "exact", head: true }).eq("status", "requested").then(function (r) {
    var n = r.count || 0, b = document.getElementById("gaTabCount");
    if (b && n) { b.textContent = n; b.hidden = false; }
  });
})();
