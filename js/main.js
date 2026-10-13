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
  if (current.indexOf(".") === -1) current += ".html"; // Cloudflare serves pretty URLs (/gallery)
  document.querySelectorAll(".nav-links a").forEach(function (link) {
    var href = link.getAttribute("href");
    if (href === current) {
      link.classList.add("active");
    }
  });

  // Section nav: highlight the section that contains the current page, and
  // let phones/tablets expand a section with its caret button.
  // A section whose main link is this page wins; otherwise the first menu that lists it.
  var secs = Array.prototype.slice.call(document.querySelectorAll(".nav-links .nav-sec"));
  var hit = secs.filter(function (sec) { return sec.querySelector('.nav-sec-link[href="' + current + '"]'); })[0] ||
            secs.filter(function (sec) { return sec.querySelector('.mega a[href="' + current + '"]'); })[0];
  if (hit) hit.classList.add("is-current");
  secs.forEach(function (sec) {
    var caret = sec.querySelector(".nav-sec-caret");
    if (caret) {
      caret.addEventListener("click", function () {
        var open = sec.classList.toggle("open");
        caret.setAttribute("aria-expanded", open ? "true" : "false");
      });
    }
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
