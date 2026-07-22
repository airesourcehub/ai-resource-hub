// AI Resource Hub — Cloudinary config
// Cloud name is not secret (it's part of every delivery URL). The upload
// preset name is also safe to expose client-side as long as it's configured
// as "Unsigned" in the Cloudinary console — that's what makes browser-only
// uploads possible without a backend or API secret.
//
// One-time setup (Cloudinary Console → Settings → Upload → Upload presets):
//   1. Click "Add upload preset".
//   2. Set "Preset name" to exactly: ai_resource_hub_gallery
//   3. Set "Signing Mode" to "Unsigned".
//   4. (Optional but recommended) Set "Folder" to: gallery
//   5. Save.
// If you pick a different preset name, update CLOUDINARY_UPLOAD_PRESET below
// to match.

var CLOUDINARY_CLOUD_NAME = "xif5o0uw";
var CLOUDINARY_UPLOAD_PRESET = "ai_resource_hub_gallery";
