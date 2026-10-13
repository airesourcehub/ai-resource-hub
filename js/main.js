// AI Resource Hub — shared site behavior (nav toggle, active link)

document.addEventListener("DOMContentLoaded", function () {
  var toggle = document.querySelector(".nav-toggle");
  var links = document.querySelector(".nav-links");

  if (toggle && links) {
    toggle.addEventListener("click", function () {
      links.classList.toggle("open");
    });
  }

  // Highlight the active nav link based on current page
  var current = window.location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll(".nav-links a").forEach(function (link) {
    var href = link.getAttribute("href");
    if (href === current) {
      link.classList.add("active");
    }
  });

  // "New" / "Top" tags beside nav links. Edit this list to change them
  // on every page at once: "new" = solid gold tag, "top" = outlined tag.
  var NAV_BADGES = {
    "lip-sync.html": "new",
    "wan-video.html": "new",
    "motion-transfer.html": "top"
  };
  document.querySelectorAll(".nav-links a").forEach(function (link) {
    var kind = NAV_BADGES[link.getAttribute("href")];
    if (!kind || link.querySelector(".nav-badge")) return;
    var tag = document.createElement("span");
    tag.className = "nav-badge" + (kind === "top" ? " is-top" : "");
    tag.textContent = kind === "top" ? "Top" : "New";
    link.appendChild(tag);
  });

  // Set current year in footer
  var yearEl = document.getElementById("year");
  if (yearEl) {
    yearEl.textContent = new Date().getFullYear();
  }
});

// Resource directory filtering (only runs if a filter bar exists on the page)
document.addEventListener("DOMContentLoaded", function () {
  var filterBar = document.querySelector(".filter-bar");
  if (!filterBar) return;

  var buttons = filterBar.querySelectorAll(".filter-btn");
  var categories = document.querySelectorAll(".resource-category");

  buttons.forEach(function (btn) {
    btn.addEventListener("click", function () {
      buttons.forEach(function (b) { b.classList.remove("active"); });
      btn.classList.add("active");

      var target = btn.getAttribute("data-filter");

      categories.forEach(function (cat) {
        if (target === "all" || cat.getAttribute("data-category") === target) {
          cat.style.display = "";
        } else {
          cat.style.display = "none";
        }
      });
    });
  });
});
