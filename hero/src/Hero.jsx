import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  m,
  animate,
  stagger,
  useScroll,
  useTransform,
  useSpring,
  useMotionValue,
  useMotionTemplate,
  useReducedMotion,
} from 'framer-motion';
import Scene from './Scene.jsx';
import Showroom, { PHOTO_SIZES_ART } from './Showroom.jsx';
import art from './art.json';
import Loader from './Loader.jsx';
import { loadHeroTruck, preload, matchesArt, PHOTO_SIZES } from './data.js';

const ease = [0.22, 1, 0.36, 1];
const INTRO_KEY = 'dangm-intro-seen';
const clamp01 = (v) => Math.min(1, Math.max(0, v));
// Normalised position of v inside [a, b], clamped
const seg = (v, a, b) => clamp01((v - a) / (b - a));
const lerp = (a, b, t) => a + (b - a) * t;

function useNarrow() {
  const q = '(max-width: 820px)';
  const [narrow, setNarrow] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const on = () => setNarrow(mq.matches);
    mq.addEventListener ? mq.addEventListener('change', on) : mq.addListener(on);
    return () => (mq.removeEventListener ? mq.removeEventListener('change', on) : mq.removeListener(on));
  }, []);
  return narrow;
}

function seenIntro() {
  try { return sessionStorage.getItem(INTRO_KEY) === '1'; } catch (_) { return false; }
}
function markIntro() {
  try { sessionStorage.setItem(INTRO_KEY, '1'); } catch (_) { /* private mode */ }
}

// One photo of the walk-around. It is fully visible while the orbit frame
// index sits on i, and slides with the camera so each cut reads as movement.
function OrbitPhoto({ photo, i, frame, stamped, alt }) {
  const [loaded, setLoaded] = useState(false);
  const loadedRef = useRef(false);
  // Photos stack in walk-around order. Each one wipes in over the previous
  // across a short stretch of scroll, then stays put under the next: no
  // double exposure, and a photo that is still downloading just leaves the
  // previous angle showing.
  const ramp = useTransform(frame, (f) => (i === 0 ? 1 : clamp01((f - i + 0.62) / 0.24)));
  // camera-pan wipe from the right (no double exposure mid-turn)
  const clipPath = useTransform(ramp, (r) => (r >= 1 ? 'none' : `inset(0 0 0 ${((1 - r) * 100).toFixed(2)}%)`));
  const opacity = useTransform(ramp, (r) => (loadedRef.current ? Math.min(1, r * 4) : 0));
  const x = useTransform(ramp, (r) => `${(1 - r) * 4}%`);
  const scale = useTransform(ramp, (r) => 1 + (1 - r) * 0.05);
  const onLoad = () => {
    loadedRef.current = true;
    setLoaded(true);
    frame.set(frame.get()); // re-run the transforms now that it can show
    opacity.set(ramp.get());
  };
  return (
    <m.img
      className={`xh-img${stamped ? ' xh-img--stamped' : ''}`}
      src={photo.src}
      srcSet={photo.srcset}
      sizes={photo.srcset ? PHOTO_SIZES : undefined}
      alt={alt}
      decoding="async"
      draggable="false"
      onLoad={onLoad}
      data-loaded={loaded ? '1' : '0'}
      style={{ opacity, x, scale, clipPath }}
    />
  );
}

// Spec chip riding an elliptical orbit around the truck. sin(theta) > 0 means
// it is passing in front of the truck (lower, larger). Each chip renders in a
// back layer and a front layer (the frame sits between them) and crossfades
// between the two as it swings past, so it really goes around the truck.
function OrbitChip({ chip, idx, count, theta, rx, ry, show, layer }) {
  const off = (idx / count) * Math.PI * 2;
  const x = useTransform(theta, (t) => Math.cos(t + off) * rx);
  const y = useTransform(theta, (t) => Math.sin(t + off) * ry);
  const depth = useTransform(theta, (t) => Math.sin(t + off));
  const scale = useTransform(depth, (d) => lerp(0.78, 1.08, (d + 1) / 2));
  const opacity = useTransform([depth, show], ([d, s]) => {
    const front = clamp01((d + 0.08) / 0.16);
    return lerp(0.45, 1, (d + 1) / 2) * s * (layer === 'front' ? front : 1 - front);
  });
  return (
    <m.div className="xh-chip lg" style={{ x, y, scale, opacity }}>
      <span className="xh-chip-k">{chip.k}</span>
      <span className="xh-chip-v">{chip.v}</span>
    </m.div>
  );
}

export default function Hero({ copyHTML, sceneHost, loaderHost }) {
  const reduce = useReducedMotion();
  const still = !!reduce;
  const narrow = useNarrow();
  const [truck, setTruck] = useState(undefined); // undefined = loading, null = none
  const [ready, setReady] = useState(false);
  const [entered, setEntered] = useState(false);
  const [avail, setAvail] = useState(1); // walk-around photos warmed so far
  const [arrived, setArrived] = useState(false); // illustrated truck finished its drive-in
  // Arriving on a section link (e.g. /index.html#contact from another page):
  // no long intro, no scroll hold, and we re-jump once the hero has its final
  // height, otherwise the browser's own jump lands thousands of px short.
  const [deepLink] = useState(() => {
    const h = window.location.hash;
    try { return h.length > 1 && document.querySelector(h) ? h : ''; } catch (_) { return ''; }
  });
  const [quick] = useState(() => seenIntro() || !!deepLink);
  const progressRaw = useMotionValue(0.08);
  const progress = useSpring(progressRaw, { stiffness: 90, damping: 22 });
  const zero = useMotionValue(0);

  // Live config read by the scroll transforms (avoids stale closures)
  const cfg = useRef({ narrow, n: 1 });
  cfg.current.narrow = narrow;
  cfg.current.n = truck ? truck.orbit.length : 1;

  // ── Data + first photo ────────────────────────────────────
  useEffect(() => {
    let alive = true;
    const scene = Promise.all([...['sky', 'far', 'road'].map((k) => art.layers[k].src), ...art.stands.map((t) => t.src)].map((src) => preload({ src })));
    loadHeroTruck().then(async (t) => {
      if (!alive) return;
      progressRaw.set(0.45);
      // Illustrated truck while the hero is the model the art depicts,
      // otherwise the listing's own walk-around photos in a glass frame
      const useArt = matchesArt(t, art.match);
      const orbit = !t ? [] : useArt
        ? art.trucks.map((a) => ({ src: a.src, srcset: a.srcset.map(([u, w]) => `${u} ${w}w`).join(', ') }))
        : t.orbit;
      const sizes = useArt ? PHOTO_SIZES_ART : PHOTO_SIZES;
      setTruck(t ? { ...t, art: useArt, orbit } : t);
      await Promise.all([scene, orbit[0] ? preload(orbit[0], sizes) : null]);
      if (!alive) return;
      progressRaw.set(1);
      setReady(true);
      // warm the rest of the walk-around one at a time, in orbit order
      for (const ph of orbit.slice(1)) {
        if (!alive) return;
        await preload(ph, sizes);
        if (alive) setAvail((n) => n + 1);
      }
    });
    return () => { alive = false; };
  }, [progressRaw]);

  useEffect(() => { if (still) setEntered(true); }, [still]);
  // framer measures the track on resize; nudge it after layout changes
  useEffect(() => { window.dispatchEvent(new Event('resize')); }, [truck, narrow, entered]);
  const showLoader = !still && !entered;
  // Hold the page still through the first-visit intro and the truck's drive
  // down the road, so the walk-around never starts mid-drive. 7s hard cap.
  const driving = !!truck?.art && entered && !arrived;
  const lock = !quick && !still && (showLoader || driving);

  useEffect(() => {
    if (!deepLink || truck === undefined || !entered) return;
    // Land on the section, then keep it there while content above it is
    // still loading (flagship cards, images) for up to 5s, until the visitor
    // scrolls or interacts themselves.
    const el = document.querySelector(deepLink);
    if (!el) return;
    const land = () => el.scrollIntoView({ block: 'start', behavior: 'auto' });
    const id = requestAnimationFrame(land);
    const ro = new ResizeObserver(() => requestAnimationFrame(land));
    ro.observe(document.body);
    const stop = () => {
      ro.disconnect();
      ['wheel', 'touchstart', 'keydown', 'pointerdown'].forEach((t) => window.removeEventListener(t, stop));
    };
    ['wheel', 'touchstart', 'keydown', 'pointerdown'].forEach((t) => window.addEventListener(t, stop, { passive: true, once: true }));
    const cap = setTimeout(stop, 5000);
    return () => { cancelAnimationFrame(id); clearTimeout(cap); stop(); };
  }, [deepLink, truck, entered]);
  useEffect(() => {
    document.documentElement.classList.toggle('xh-locked', lock);
    const cap = lock ? setTimeout(() => document.documentElement.classList.remove('xh-locked'), 7000) : 0;
    return () => { clearTimeout(cap); document.documentElement.classList.remove('xh-locked'); };
  }, [lock]);

  // Headline copy is the page's own static HTML (SEO source of truth);
  // stagger it in once the intro clears.
  const copyRef = useRef(null);
  useEffect(() => {
    const el = copyRef.current;
    if (!el || !entered) return;
    el.classList.add('xh-copy--in');
    if (still) return;
    const kids = Array.from(el.children);
    const ctl = animate(
      kids,
      { opacity: [0, 1], y: [28, 0], filter: ['blur(8px)', 'blur(0px)'] },
      { duration: 0.9, ease, delay: stagger(0.08, { startDelay: 0.1 }) },
    );
    return () => ctl.stop();
  }, [entered, still]);

  // ── Scroll timeline ───────────────────────────────────────
  const trackRef = useRef(null);
  const { scrollYProgress } = useScroll({ target: trackRef, offset: ['start start', 'end end'] });
  const { scrollY } = useScroll();
  const p = useSpring(scrollYProgress, { stiffness: 140, damping: 30, mass: 0.4, restDelta: 0.0005 });
  const hasCar = !!truck;
  const artMode = !!truck?.art;
  // As the hero track ends, the truck scrolls away with the page
  const { scrollYProgress: exitProgress } = useScroll({ target: trackRef, offset: ['end end', 'end start'] });
  const exitY = useTransform(exitProgress, (v) => `${-v * 100}vh`);
  // Illustrated truck: waits in the right lane beside the copy, then the
  // camera swings in to centre it before walking around it
  const carX = useTransform(p, (v) => (cfg.current.narrow ? '0vw' : `${lerp(17, 0, seg(v, 0, 0.2))}vw`));
  const carScale = useTransform(p, (v) => lerp(0.9, 1, seg(v, 0, 0.2)));

  // Copy lifts away as the camera moves in
  const copyOpacity = useTransform(p, [0, 0.1, 0.2], [1, 1, 0]);
  const copyY = useTransform(p, [0, 0.2], ['0vh', '-12vh']);
  const copyBlur = useTransform(p, [0.08, 0.2], [0, 10]);
  const copyFilter = useMotionTemplate`blur(${copyBlur}px)`;
  const copyPE = useTransform(p, (v) => (v > 0.16 ? 'none' : 'auto'));

  // Truck: parked right of the copy, rolls to centre, orbits, settles back
  const frameX = useTransform(p, (v) => (cfg.current.narrow ? '0vw' : `${lerp(17, 0, seg(v, 0, 0.2))}vw`));
  const frameY = useTransform(p, (v) => {
    const [a, b] = cfg.current.narrow ? [31, -5] : [6, -7];
    return v < 0.82 ? `${lerp(a, 0, seg(v, 0, 0.2))}vh` : `${lerp(0, b, seg(v, 0.82, 1))}vh`;
  });
  const frameScale = useTransform(p, (v) => {
    const [a, b] = cfg.current.narrow ? [0.88, 0.9] : [0.74, 0.84];
    return v < 0.82 ? lerp(a, 1, seg(v, 0, 0.2)) : lerp(1, b, seg(v, 0.82, 1));
  });
  const frameRot = useTransform(p, [0, 0.2, 0.36, 0.5, 0.64, 0.82, 1], [-14, 0, 6, -6, 6, 0, 0]);
  const frame = useTransform(p, (v) => seg(v, 0.22, 0.8) * Math.max(0, cfg.current.n - 1));
  const glareX = useTransform(p, [0, 1], ['-60%', '160%']);
  const degrees = useTransform(frame, (f) => `${Math.round((f / Math.max(1, cfg.current.n - 1)) * 180)}°`);

  // Orbiting spec chips + turntable ring
  const theta = useTransform(p, [0.18, 0.84], [-Math.PI / 2, Math.PI * 1.5]);
  const chipShow = useTransform(p, [0.16, 0.26, 0.76, 0.86], [0, 1, 1, 0]);
  const ringOpacity = useTransform(p, [0.12, 0.24, 0.84, 0.95], [0.35, 1, 1, 0.5]);
  const ringRot = useTransform(p, [0, 1], [0, 360]);

  // Finale panel + scroll hint
  const finOpacity = useTransform(p, [0.82, 0.92], [0, 1]);
  const finY = useTransform(p, [0.82, 0.94], ['5vh', '0vh']);
  const finPE = useTransform(p, (v) => (v > 0.86 ? 'auto' : 'none'));
  const hintOpacity = useTransform(p, [0, 0.06], [1, 0]);

  const chips = useMemo(() => {
    if (!truck) return [];
    return [
      { k: 'Price', v: truck.price },
      truck.engine && { k: 'Engine', v: truck.engine },
      truck.drivetrain && { k: 'Drive', v: truck.drivetrain },
      truck.mileage && { k: 'Odometer', v: truck.mileage },
      truck.color && { k: 'Colour', v: truck.color },
    ].filter(Boolean).slice(0, narrow ? 4 : 5);
  }, [truck, narrow]);

  const rx = narrow ? 150 : 430;
  const ry = narrow ? 70 : 110;
  const label = truck ? `${truck.name} ${truck.trim || ''}`.trim() : '';
  // Not-yet-warmed photos mount later so they never compete with photo 0
  const photos = truck ? (still ? truck.orbit.slice(0, 1) : truck.orbit.slice(0, avail)) : [];

  return (
    <>
      {sceneHost && createPortal(
        <Scene orbit={hasCar && !still ? p : zero} pageY={scrollY}>
          {artMode && (
            <Showroom
              frame={frame}
              carX={still ? (narrow ? '0vw' : '17vw') : carX}
              carScale={still ? 1 : carScale}
              exitY={exitY}
              theta={theta}
              chipShow={chipShow}
              chips={chips}
              entered={entered}
              avail={avail}
              still={still}
              quick={quick}
              narrow={narrow}
              onArrived={() => setArrived(true)}
            />
          )}
        </Scene>,
        sceneHost,
      )}
      {loaderHost && showLoader && createPortal(
        <Loader
          progress={progress}
          ready={ready}
          quick={quick}
          onDone={() => { markIntro(); setEntered(true); }}
        />,
        loaderHost,
      )}

      <div ref={trackRef} className={`xh${truck !== null ? ' xh--car' : ''}${still ? ' xh--still' : ''}`}>
        <div className="xh-stage">
          <m.div
            className="hero-content xh-copy"
            style={still ? undefined : { opacity: copyOpacity, y: copyY, filter: copyFilter, pointerEvents: copyPE }}
          >
            <div ref={copyRef} className="xh-copy-inner" dangerouslySetInnerHTML={{ __html: copyHTML }} />
          </m.div>

          {artMode && (
            <>
              {!still && <m.div
                className="xh-fin xh-fin--art lg"
                style={still ? undefined : { opacity: finOpacity, y: finY, pointerEvents: finPE }}
              >
                <p className="xh-fin-eyebrow">Our flagship right now</p>
                <h2 className="xh-fin-title">
                  {truck.name} <span>{truck.trim}</span>
                </h2>
                <p className="xh-fin-price">{truck.price}</p>
                <div className="xh-fin-actions">
                  <a className="btn btn-primary lg-btn" href={truck.href}>See the real truck</a>
                  <a className="btn btn-ghost lg-btn" href="tel:6047351396">Call 604-735-1396</a>
                </div>
              </m.div>}
              <a className="xh-disclose" href={truck.href}>
                Illustration of the {art.label}. <span>See real photos</span>
              </a>
            </>
          )}

          {hasCar && !artMode && (
            <div className="xh-car">
              <m.div className="xh-ring-wrap" style={still ? undefined : { x: frameX, y: frameY }} aria-hidden="true">
                <m.div className="xh-ring" style={still ? undefined : { opacity: ringOpacity, rotate: ringRot }} />
              </m.div>

              {!still && ['back', 'front'].map((layer) => (
                <m.div key={layer} className={`xh-orbit xh-orbit--${layer}`} style={{ x: frameX, y: frameY }} aria-hidden="true">
                  {chips.map((c, i) => (
                    <OrbitChip
                      key={`${c.k}-${narrow}`}
                      chip={c}
                      idx={i}
                      count={chips.length}
                      theta={theta}
                      rx={rx}
                      ry={ry}
                      show={chipShow}
                      layer={layer}
                    />
                  ))}
                </m.div>
              ))}

              {/* entrance wrapper (one-off) / scroll-driven frame (continuous) */}
              <m.div
                className="xh-frame-wrap"
                variants={{
                  hidden: { opacity: 0, y: 60, filter: 'blur(16px)' },
                  shown: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 1.2, ease, delay: 0.15 } },
                }}
                initial={still ? false : 'hidden'}
                animate={entered || still ? 'shown' : 'hidden'}
              >
                <m.a
                  href={truck.href}
                  className="xh-frame lg"
                  aria-label={`View the ${label}, ${truck.price}`}
                  style={still ? undefined : { x: frameX, y: frameY, scale: frameScale, rotateY: frameRot }}
                >
                  <div className="xh-photo">
                    {photos.map((ph, i) => (
                      <OrbitPhoto
                        key={ph.src}
                        photo={ph}
                        i={i}
                        frame={frame}
                        stamped={truck.stamped}
                        alt={i === 0 ? `${label} for sale in Coquitlam, BC` : ''}
                      />
                    ))}
                    {!still && <m.span className="xh-glare" style={{ x: glareX }} aria-hidden="true" />}
                  </div>
                  <span className="xh-frame-tag">
                    <span className="xh-dot" aria-hidden="true" />
                    Flagship · {truck.price}
                  </span>
                  {!still && <m.span className="xh-deg" aria-hidden="true">{degrees}</m.span>}
                </m.a>
              </m.div>

              <m.div
                className="xh-fin lg"
                style={still ? undefined : { opacity: finOpacity, y: finY, pointerEvents: finPE }}
              >
                <p className="xh-fin-eyebrow">Our flagship right now</p>
                <h2 className="xh-fin-title">
                  {truck.name} <span>{truck.trim}</span>
                </h2>
                <p className="xh-fin-price">{truck.price}</p>
                {still && chips.length > 1 && (
                  <ul className="xh-fin-specs">
                    {chips.slice(1).map((c) => <li key={c.k}><b>{c.k}</b> {c.v}</li>)}
                  </ul>
                )}
                <div className="xh-fin-actions">
                  <a className="btn btn-primary lg-btn" href={truck.href}>View this truck</a>
                  <a className="btn btn-ghost lg-btn" href="tel:6047351396">Call 604-735-1396</a>
                </div>
              </m.div>
            </div>
          )}

          {hasCar && !still && (
            <m.div className="xh-hint" style={{ opacity: hintOpacity }} aria-hidden="true">
              <span>Scroll to walk around it</span>
              <i />
            </m.div>
          )}
        </div>
      </div>
    </>
  );
}
