import { animate, inView, stagger } from 'framer-motion';

const ease = [0.22, 1, 0.36, 1];

// ─── Liquid glass nav ─────────────────────────────────────
// The nav stays the page's own static markup (main.js still owns the scroll
// state + mobile toggle). We add: a glass pill that flows between links with
// a spring and stretches while it travels, a pointer-tracked specular
// highlight, and (Chromium only) a refraction filter on the backdrop.
export function enhanceNav(reduce) {
  // static generated pages render the nav without id="nav"
  const nav = document.getElementById('nav') || document.querySelector('nav.nav');
  if (!nav) return;
  nav.classList.add('lg-nav');

  const brands = (navigator.userAgentData && navigator.userAgentData.brands) || [];
  const isChromium = brands.some((b) => /Chromium/i.test(b.brand));
  if (isChromium && !reduce) {
    // Gentle noise displacement of whatever is behind the glass
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('width', '0');
    svg.setAttribute('height', '0');
    svg.style.position = 'absolute';
    svg.innerHTML = `
      <filter id="lgRefract" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
        <feTurbulence type="fractalNoise" baseFrequency="0.008 0.022" numOctaves="2" seed="7" result="n"/>
        <feGaussianBlur in="n" stdDeviation="2" result="nb"/>
        <feDisplacementMap in="SourceGraphic" in2="nb" scale="22" xChannelSelector="R" yChannelSelector="G"/>
      </filter>`;
    document.body.appendChild(svg);
    document.documentElement.classList.add('lg-refract');
  }

  nav.addEventListener('pointermove', (e) => {
    const r = nav.getBoundingClientRect();
    nav.style.setProperty('--mx', `${((e.clientX - r.left) / r.width) * 100}%`);
    nav.style.setProperty('--my', `${((e.clientY - r.top) / r.height) * 100}%`);
  }, { passive: true });

  const links = nav.querySelector('.nav-links');
  if (!links || reduce) return;
  const pill = document.createElement('span');
  pill.className = 'lg-pill';
  pill.setAttribute('aria-hidden', 'true');
  links.prepend(pill);

  let current = null;
  let lastX = 0;
  const moveTo = (a) => {
    // Desktop row only; the mobile dropdown is a vertical list
    if (getComputedStyle(links).flexDirection === 'column') return;
    const lr = links.getBoundingClientRect();
    const r = a.getBoundingClientRect();
    const x = r.left - lr.left - 14;
    const w = r.width + 28;
    const stretch = 1 + Math.min(0.35, Math.abs(x - lastX) / 400);
    lastX = x;
    animate(pill, { x, width: w, opacity: 1 }, { type: 'spring', stiffness: 380, damping: 30, mass: 0.7 });
    // squash and stretch: liquid feel while travelling, settles to 1
    animate(pill, { scaleY: [1 / stretch, 1] }, { duration: 0.45, ease });
    current = a;
  };
  links.querySelectorAll('a').forEach((a) => {
    a.addEventListener('pointerenter', () => moveTo(a));
    a.addEventListener('focus', () => moveTo(a));
  });
  links.addEventListener('pointerleave', () => {
    current = null;
    animate(pill, { opacity: 0 }, { duration: 0.25 });
  });
  window.addEventListener('resize', () => current && moveTo(current), { passive: true });
}

// ─── Homepage sections: liquid glass entrances ────────────
// Lessons from the .reveal bug: elements are only hidden by JS at the moment
// we attach the observer (no-JS = visible), anything already on screen
// animates immediately, and timed failsafes un-hide stragglers. Elements
// main.js manages (.reveal, incl. the truck cards) are never hidden here.

// Big glass panels "materialize": they condense from a soft, rounded drop
// into the panel (clip-path + scale), then a light streak sweeps the glass.
export const HOME_PANELS = [
  ['#lead .lead-inner', 32],
  ['#about .about-inner', 32],
  ['#contact .contact-card', 28],
  ['.footer .footer-inner', 28],
];
// Smaller pieces rise in, staggered with their siblings
export const HOME_RISE = [
  '#lead .lead-copy', '#lead .lead-form',
  '.section-head .eyebrow', '.section-head .section-sub',
  '#lead .eyebrow', '#lead .section-sub', '#about .eyebrow',
  '#flagship .flagship-more',
  '#about .about-text > p', '#about .about-list li',
  '#faq .faq-item',
  '#contact .contact-row', '#contact .contact-call',
  '#serving .geo-strip > *',
];

const hide = (el, how) => { Object.assign(el.style, how); el.dataset.lgHidden = '1'; };
const unhide = (el) => {
  if (!el.dataset.lgHidden) return;
  ['opacity', 'transform', 'clipPath', 'translate'].forEach((k) => { el.style[k] = ''; });
  delete el.dataset.lgHidden;
};

// "Curated attention, zero pressure" -> masked words that slide up in turn.
// Text stays identical (and stays in the DOM for SEO); only wrapped in spans.
function splitWords(h) {
  if (h.dataset.lgSplit || h.children.length) return [];
  h.dataset.lgSplit = '1';
  const words = h.textContent.trim().split(/\s+/);
  h.textContent = '';
  return words.map((w, i) => {
    const outer = document.createElement('span');
    outer.className = 'lg-w';
    const inner = document.createElement('span');
    inner.textContent = w;
    outer.appendChild(inner);
    h.appendChild(outer);
    if (i < words.length - 1) h.appendChild(document.createTextNode(' '));
    return inner;
  });
}

export function animateSections(reduce, { panels = HOME_PANELS, rise = HOME_RISE, titles = '.section-title' } = {}) {
  if (reduce || !('IntersectionObserver' in window)) return;
  const pending = new Set();
  const skip = (el) => !!el.closest('.reveal') || el.getBoundingClientRect().bottom < 0;
  const watch = (el, run, amount = 0.15) => {
    pending.add(el);
    const stop = inView(el, () => { pending.delete(el); run(); stop(); }, { amount });
  };

  panels.forEach(([sel, r]) => document.querySelectorAll(sel).forEach((el) => {
    if (skip(el)) return;
    hide(el, { opacity: '0', clipPath: `inset(10% 7% 10% 7% round ${r * 4}px)`, transform: 'scale(0.96)' });
    watch(el, () => {
      animate(el, {
        opacity: [0, 1],
        clipPath: [`inset(10% 7% 10% 7% round ${r * 4}px)`, `inset(0% 0% 0% 0% round ${r}px)`],
        transform: ['scale(0.96)', 'scale(1)'],
      }, { duration: 1.05, ease: [0.16, 1, 0.3, 1] }).then(() => {
        el.style.clipPath = '';
        el.style.transform = '';
        delete el.dataset.lgHidden;
        el.classList.add('lg-lit'); // one light streak across the glass
      });
    }, 0.12);
  }));

  document.querySelectorAll(titles).forEach((h) => {
    if (skip(h)) return;
    const words = splitWords(h);
    if (!words.length) return;
    words.forEach((w) => hide(w, { transform: 'translateY(105%)' }));
    pending.add(h);
    const stop = inView(h, () => {
      pending.delete(h);
      animate(words, { transform: ['translateY(105%)', 'translateY(0%)'] }, { duration: 0.8, ease, delay: stagger(0.06) })
        .then(() => words.forEach(unhide));
      stop();
    }, { amount: 0.3 });
    h._lgWords = words;
  });

  document.querySelectorAll(rise.join(',')).forEach((el) => {
    if (skip(el) || el.dataset.lgHidden) return;
    hide(el, { opacity: '0', transform: 'translateY(28px)' });
    watch(el, () => {
      const sib = el.parentElement ? Array.prototype.indexOf.call(el.parentElement.children, el) : 0;
      animate(el, { opacity: [0, 1], transform: ['translateY(28px)', 'translateY(0px)'] },
        { duration: 0.8, ease, delay: 0.12 + Math.min(sib, 6) * 0.06 }).then(() => unhide(el));
    }, 0.1);
  });

  // Failsafes: nothing on (or above) the screen may stay hidden
  const flush = () => pending.forEach((el) => {
    if (el.getBoundingClientRect().top < window.innerHeight) {
      unhide(el);
      (el._lgWords || []).forEach(unhide);
      pending.delete(el);
    }
  });
  setTimeout(flush, 2500);
  let t = 0;
  window.addEventListener('scroll', () => { clearTimeout(t); t = setTimeout(flush, 1200); }, { passive: true });
  window.addEventListener('pagehide', () => pending.forEach((el) => { unhide(el); (el._lgWords || []).forEach(unhide); }));
}

// ─── Pointer: specular highlight on glass + 3D tilt on cards ─
// Delegated, so it also covers the flagship cards main.js renders later.
// Tilt uses the individual `rotate` property, so it composes with the
// transform main.js/styles.css already animate on cards (.reveal, hover lift).
export const HOME_GLASS = '.lead-inner, .about-inner, .contact-card, .faq-item, .footer-inner, .truck-card, .service-card';
export const HOME_TILT = '.truck-card, .service-card';

export function glassPointer(reduce, { glass: GLASS = HOME_GLASS, tilt: TILT = HOME_TILT } = {}) {
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  let active = null;   // glass element under the pointer
  let tiltEl = null;   // card currently tilted (springs back after leaving)
  let raf = 0;
  let tx = 0, ty = 0, cx = 0, cy = 0;
  const loop = () => {
    cx += (tx - cx) * 0.16;
    cy += (ty - cy) * 0.16;
    const ang = Math.hypot(cx, cy);
    if (tiltEl) tiltEl.style.rotate = ang < 0.04 ? '' : `${(-cy).toFixed(3)} ${cx.toFixed(3)} 0 ${ang.toFixed(2)}deg`;
    if (Math.abs(tx - cx) + Math.abs(ty - cy) > 0.01) raf = requestAnimationFrame(loop);
    else { raf = 0; if (tx === 0 && ty === 0 && tiltEl) { tiltEl.style.rotate = ''; tiltEl = null; } }
  };
  const kick = () => { if (!raf) raf = requestAnimationFrame(loop); };
  const leave = () => {
    if (active) active.classList.remove('lg-hot');
    active = null;
    tx = ty = 0; // tilted card springs back
    kick();
  };
  document.addEventListener('pointermove', (e) => {
    const el = e.target.closest && e.target.closest(GLASS);
    if (el !== active) {
      leave();
      if (!el) return;
      active = el;
      el.classList.add('lg-hot');
      if (!reduce && el.matches(TILT)) {
        if (tiltEl && tiltEl !== el) tiltEl.style.rotate = '';
        tiltEl = el;
        cx = cy = 0;
      }
    }
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    el.style.setProperty('--mx', `${(px * 100).toFixed(1)}%`);
    el.style.setProperty('--my', `${(py * 100).toFixed(1)}%`);
    if (el === tiltEl) {
      tx = (px - 0.5) * 9; // degrees
      ty = (py - 0.5) * 9;
      kick();
    }
  }, { passive: true });
  document.documentElement.addEventListener('pointerleave', leave);
}
