// ============================================================
// dangm.ca: photo gallery for the static /v/ car pages.
// The markup (main photo, arrows, counter, thumbnails) is rendered by
// sync/build-sitemap.py, so every photo is in the HTML for Google; this
// only adds the interaction: arrows, thumbnails, keyboard, swipe, and
// preloading the next photo. Same classes as the interactive vehicle.html
// gallery (styles.css + glass.css style both).
// ============================================================
(function () {
  function init(root) {
    var main = root.querySelector('.vdp-main');
    var thumbs = Array.prototype.slice.call(root.querySelectorAll('.vdp-thumb'));
    var count = root.querySelector('.vdp-count');
    var srcs = thumbs.map(function (t) { return t.getAttribute('data-full') || t.src; });
    // originals from eDealer, used if a fast copy (images/photos/) is missing
    var origs = thumbs.map(function (t, i) { return t.getAttribute('data-orig') || srcs[i]; });
    main.addEventListener('error', function () {
      var o = origs[cur] || main.getAttribute('data-orig');
      if (o && main.src !== o) main.src = o;
    });
    thumbs.forEach(function (t, i) {
      t.addEventListener('error', function () {
        if (origs[i] && t.src !== origs[i] && t.src.indexOf('data:') !== 0) t.src = origs[i];
      });
    });
    if (!main || srcs.length < 2) return;
    var cur = 0;
    var warmed = {};

    function warm(i) {
      var s = srcs[(i + srcs.length) % srcs.length];
      if (warmed[s]) return;
      warmed[s] = true;
      var img = new Image();
      img.decoding = 'async';
      img.src = s;
    }

    function show(i) {
      cur = (i + srcs.length) % srcs.length;
      main.classList.add('is-swapping');
      main.src = srcs[cur];
      main.alt = main.getAttribute('data-alt') + ', photo ' + (cur + 1) + ' of ' + srcs.length;
      if (count) count.textContent = (cur + 1) + ' / ' + srcs.length;
      thumbs.forEach(function (t, idx) {
        var on = idx === cur;
        t.classList.toggle('active', on);
        t.setAttribute('aria-current', on ? 'true' : 'false');
      });
      var active = thumbs[cur];
      var strip = active && active.parentElement;
      if (strip) {
        // keep the active thumb in view without scrolling the page
        strip.scrollTo({ left: active.offsetLeft - (strip.clientWidth - active.clientWidth) / 2, behavior: 'smooth' });
      }
      warm(cur + 1);
      warm(cur - 1);
    }
    main.addEventListener('load', function () { main.classList.remove('is-swapping'); });

    root.querySelectorAll('.vdp-nav').forEach(function (btn) {
      btn.addEventListener('click', function () { show(cur + parseInt(btn.getAttribute('data-dir'), 10)); });
    });
    thumbs.forEach(function (t, idx) {
      t.addEventListener('click', function () { show(idx); });
      t.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); show(idx); }
      });
    });

    // Arrow keys while the pointer or focus is on the gallery
    var hot = false;
    root.addEventListener('pointerenter', function () { hot = true; });
    root.addEventListener('pointerleave', function () { hot = false; });
    document.addEventListener('keydown', function (e) {
      if (!hot && !root.contains(document.activeElement)) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); show(cur + 1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); show(cur - 1); }
    });

    // Swipe on touch screens
    var wrap = root.querySelector('.vdp-main-wrap');
    var x0 = null;
    var y0 = null;
    wrap.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
    wrap.addEventListener('touchend', function (e) {
      if (x0 === null) return;
      var dx = e.changedTouches[0].clientX - x0;
      var dy = e.changedTouches[0].clientY - y0;
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) show(cur + (dx < 0 ? 1 : -1));
      x0 = null;
    }, { passive: true });

    // The eDealer photo host is slow (1-2 MB each) and stalls on parallel
    // downloads: show a shimmer until the main photo is in, then fill the
    // thumbnails one at a time (they share the browser cache with the main
    // photo, so this also preloads every slide).
    var wrapEl = root.querySelector('.vdp-main-wrap');
    function fillThumbs() {
      var i = 0;
      (function next() {
        if (i >= thumbs.length) return;
        var t = thumbs[i++];
        var src = t.getAttribute('data-src');
        if (!src || t.src === src) return next();
        t.addEventListener('load', next, { once: true });
        t.addEventListener('error', next, { once: true });
        t.src = src;
        warmed[src] = true;
      })();
    }
    function mainReady() {
      wrapEl.classList.remove('is-loading');
      if (!root._thumbsStarted) { root._thumbsStarted = true; fillThumbs(); }
    }
    if (main.complete && main.naturalWidth) mainReady();
    else {
      wrapEl.classList.add('is-loading');
      main.addEventListener('load', mainReady, { once: true });
      main.addEventListener('error', mainReady, { once: true });
      setTimeout(mainReady, 8000); // never wait forever on a stalled photo
    }
  }

  function boot() {
    document.querySelectorAll('.vdp-gallery[data-static-gallery]').forEach(init);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
