// Site-wide liquid glass layer for every page except the homepage.
// Builds to site/js/glass.js (no React): the mountain-road backdrop from the
// Gemini art, the glass nav, panels that materialize, content that rises in,
// a pointer-tracked highlight and card tilt. Pure enhancement: it never
// touches main.js, page markup, SEO tags or JSON-LD, and every page still
// works (and stays themed via glass.css) if this file never loads.
import art from './art.json';
import { enhanceNav, animateSections, glassPointer } from './enhance.js';

const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const STAND_BASE = 455; // keep in sync with Scene.jsx
const STAND_SCALE = 0.8;
const FAR_LIFT = 120;
const pct = (v, of) => `${(v / of) * 100}%`;
// Absolute: these pages live at /, /blog/x/, /v/x/, /forum/x/, /locations/x/
const abs = (src) => (src.startsWith('/') || /^https?:/.test(src) ? src : `/${src}`);

function injectScene() {
  if (document.querySelector('.xs-host')) return;
  const { w: SW, h: SH } = art.stage;
  const img = (src, cls, style = {}) => {
    const el = document.createElement('img');
    el.src = abs(src);
    el.alt = '';
    el.decoding = 'async';
    el.draggable = false;
    el.className = cls;
    Object.assign(el.style, style);
    return el;
  };
  const stage = document.createElement('div');
  stage.className = 'xs-stage';
  stage.style.setProperty('--sw', SW);
  stage.style.setProperty('--sh', SH);
  stage.style.setProperty('--horizon', pct(art.layers.road.horizon, SH));
  stage.style.setProperty('--hfrac', art.layers.road.horizon / SH);
  stage.style.setProperty('--far-lift', pct(-FAR_LIFT, SH));
  stage.append(
    img(art.layers.sky.src, 'xs-img xs-sky'),
    img(art.layers.far.src, 'xs-img xs-far'),
    img(art.layers.road.src, 'xs-img xs-road'),
  );
  const haze = document.createElement('div');
  haze.className = 'xs-haze';
  stage.append(haze);
  art.stands.forEach((st) => {
    stage.append(img(st.src, 'xs-stand', {
      width: pct(st.w * STAND_SCALE, SW),
      height: pct(st.h * STAND_SCALE, SH),
      top: pct(STAND_BASE - st.base * STAND_SCALE, SH),
      [st.side]: pct(-24, SW),
    }));
  });
  const xs = document.createElement('div');
  xs.className = 'xs';
  const vignette = document.createElement('div');
  vignette.className = 'xs-vignette';
  xs.append(stage, vignette);
  const host = document.createElement('div');
  host.className = 'xs-host';
  host.setAttribute('aria-hidden', 'true');
  host.append(xs);
  document.body.prepend(host);

  if (reduce) return;
  // Gentle depth while reading: far layers drift up slower than near ones
  const layers = [
    [stage.querySelector('.xs-sky'), 0.02],
    [stage.querySelector('.xs-far'), 0.035],
  ];
  let raf = 0;
  const onScroll = () => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      const y = Math.min(window.scrollY, 4000);
      layers.forEach(([el, k]) => { el.style.transform = `translate3d(0, ${(-y * k).toFixed(1)}px, 0)`; });
    });
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

// Interior page building blocks (markup from styles.css / main.js / generators)
const PANELS = [
  ['.lead-inner', 32],
  ['.contact-card', 28],
  ['.about-page-body', 28],
  ['.vehicle-main', 28],
  ['.inv-sidebar', 24],
  ['.footer .footer-inner', 28],
];
const RISE = [
  '.section-head .eyebrow', '.section-head .section-sub',
  '.lead-copy', '.lead-form',
  '.faq-item',
  '.forum-post-body > h2', '.forum-post-body > .tbl-wrap', '.forum-post-cta',
  '.vdp-details', '.vdp-desc', '.vdp-actions',
];
const GLASS = '.lead-inner, .contact-card, .about-page-body, .vehicle-main, .inv-sidebar, .faq-item, .footer-inner, .truck-card, .forum-card, .service-card';
const TILT = '.truck-card:not(.truck-card-list), .forum-card, .service-card';

function boot() {
  injectScene();
  enhanceNav(reduce);
  animateSections(reduce, { panels: PANELS, rise: RISE, titles: '.section-title' });
  glassPointer(reduce, { glass: GLASS, tilt: TILT });
}

try {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
} catch (e) {
  console.error('glass.js failed', e);
}
