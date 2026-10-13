import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { LazyMotion, MotionConfig, domAnimation } from 'framer-motion';
import Hero from './Hero.jsx';
import { enhanceNav, animateSections, glassPointer } from './enhance.js';

// Progressive enhancement for the homepage only. The static <header class="hero">
// in index.html stays the SEO/no-JS version; this replaces it in place with the
// React + Framer Motion hero and reuses its exact headline markup.
function boot() {
  const header = document.getElementById('top');
  const content = header && header.querySelector('.hero-content');
  if (!header || !content) return;

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Copy the headline markup, minus .reveal (main.js observes .reveal at
  // DOMContentLoaded; React's copies would never get its .visible class).
  const clone = content.cloneNode(true);
  clone.querySelectorAll('.reveal').forEach((el) => el.classList.remove('reveal'));
  const copyHTML = clone.innerHTML;

  const sceneHost = document.createElement('div');
  sceneHost.className = 'xs-host';
  document.body.prepend(sceneHost);
  const loaderHost = document.createElement('div');
  loaderHost.className = 'xl-host';
  document.body.appendChild(loaderHost);

  header.classList.remove('hero');
  header.classList.add('xh-host');
  document.documentElement.classList.add('xh-ready');

  createRoot(header).render(
    <StrictMode>
      <MotionConfig reducedMotion="user">
        <LazyMotion features={domAnimation} strict>
          <Hero copyHTML={copyHTML} sceneHost={sceneHost} loaderHost={loaderHost} />
        </LazyMotion>
      </MotionConfig>
    </StrictMode>,
  );

  enhanceNav(reduce);
  animateSections(reduce);
  glassPointer(reduce);
}

try {
  boot();
} catch (e) {
  // Never leave the page hidden: drop back to the static hero
  document.documentElement.classList.remove('xh-js');
  console.error('Hero failed to start', e);
}
