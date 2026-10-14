import { useEffect, useState } from 'react';
import { m, animate, useMotionValue, useTransform } from 'framer-motion';
import art from './art.json';
import { STAGE } from './Scene.jsx';

// The illustrated truck standing on the road, inside the scene's stage box.
// Scroll turns it through the five walk-around angles while spec chips orbit
// it (a back ring behind the truck, a front ring over it) and the scenery
// pans behind. On entry it drives down the road toward the camera: it starts
// as a speck at the vanishing point and is projected with real perspective
// (everything about it scales by 1/z), headlights on, then brakes and parks.

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const lerp = (a, b, t) => a + (b - a) * t;
export const PHOTO_SIZES_ART = '(max-width: 820px) 70vw, 60vw';
const GROUND = 0.78; // truck tyres touch the road at 78% of the stage height (stays on screen on ultrawides)
const MAX_ASPECT = Math.max(...art.trucks.map((t) => t.aspect));

const TOUCH = window.matchMedia('(hover: none), (pointer: coarse)').matches;
// The CSS stage is sized in 100vh, which stays put while a phone's address
// bar slides in and out; window.innerHeight does not. Measure 100vh itself so
// the truck matches the stage and doesn't re-layout on every bar movement.
let vhProbe = null;
function viewportH() {
  if (!vhProbe) {
    vhProbe = document.createElement('div');
    vhProbe.style.cssText = 'position:fixed;top:0;left:0;width:0;height:100vh;visibility:hidden;pointer-events:none';
    document.body.appendChild(vhProbe);
  }
  return vhProbe.offsetHeight || window.innerHeight;
}
const stageHeight = () => Math.max(viewportH(), (window.innerWidth * STAGE.h) / STAGE.w);
// Truck height in CSS px; mirrors --truck-h in home.css
function truckHeight() {
  return Math.min(stageHeight() * 0.325, (window.innerWidth * 0.92) / MAX_ASPECT);
}
const FAR = 19; // at the horizon the truck is 1/(1+FAR) = 5% of its parked size
function useTruckHeight() {
  const [h, setH] = useState(truckHeight);
  useEffect(() => {
    // Only real layout changes (width / rotation) re-measure; height-only
    // resizes are a phone's address bar and must not rebuild the truck.
    let w = window.innerWidth;
    const on = () => {
      if (window.innerWidth === w) return;
      w = window.innerWidth;
      setH(truckHeight());
    };
    window.addEventListener('resize', on, { passive: true });
    return () => window.removeEventListener('resize', on);
  }, []);
  return h;
}

// Fade in over the previous angle, then out under the next: a short,
// motion-blurred handover instead of a long double exposure.
function Angle({ t, i, count, frame }) {
  const rampIn = (f, k) => (k <= 0 ? 1 : k >= count ? 0 : clamp01((f - k + 0.58) / 0.16));
  const opacity = useTransform(frame, (f) => rampIn(f, i) * (1 - rampIn(f, i + 1)));
  const x = useTransform(frame, (f) => `${(rampIn(f, i + 1) - (1 - rampIn(f, i))) * -4}%`);
  const filter = useTransform(opacity, (o) => (TOUCH || o > 0.98 || o < 0.02 ? 'none' : `blur(${(Math.sin(o * Math.PI) * 2.5).toFixed(2)}px)`));
  return (
    <m.img
      className="xc-truck"
      src={t.src}
      srcSet={t.srcset.map(([src, w]) => `${src} ${w}w`).join(', ')}
      sizes={PHOTO_SIZES_ART}
      alt=""
      decoding="async"
      draggable="false"
      style={{ opacity, x, filter }}
    />
  );
}

function Chip({ chip, idx, count, theta, rx, ry, show, layer }) {
  const off = (idx / count) * Math.PI * 2;
  const x = useTransform(theta, (a) => Math.cos(a + off) * rx);
  const y = useTransform(theta, (a) => Math.sin(a + off) * ry);
  const depth = useTransform(theta, (a) => Math.sin(a + off));
  const scale = useTransform(depth, (d) => lerp(0.8, 1.08, (d + 1) / 2));
  const opacity = useTransform([depth, show], ([d, s]) => {
    const front = clamp01((d + 0.08) / 0.16);
    return lerp(0.5, 1, (d + 1) / 2) * s * (layer === 'front' ? front : 1 - front);
  });
  return (
    <m.div className="xh-chip lg" style={{ x, y, scale, opacity }}>
      <span className="xh-chip-k">{chip.k}</span>
      <span className="xh-chip-v">{chip.v}</span>
    </m.div>
  );
}

// Warm headlight flares on the front 3/4 angle (positions measured on that
// render, as fractions of the image box), plus a light pool on the road ahead.
const HEADLIGHTS = [[0.055, 0.4], [0.405, 0.385]];

export default function Showroom({ frame, carX, carScale, exitY, exitOpacity, theta, chipShow, chips, entered, avail, still, quick, narrow, onArrived }) {
  const h = useTruckHeight();

  // ── Drive-in: d goes 1 (at the vanishing point) → 0 (parked) ──
  const d = useMotionValue(still ? 0 : 1);
  useEffect(() => {
    if (still) { onArrived && onArrived(); return; }
    if (!entered) return;
    const ctl = animate(d, 0, {
      duration: quick ? 1.6 : 4,
      // ease-out quad on distance: with 1/z perspective this reads as a steady
      // approach that grows on you, then a smooth brake into the spot
      ease: [0.25, 0.46, 0.45, 0.94],
      onComplete: () => onArrived && onArrived(),
    });
    return () => ctl.stop();
  }, [entered, still]); // eslint-disable-line react-hooks/exhaustive-deps
  // Perspective: screen offset from the vanishing point scales with 1/z,
  // so moving the parked position toward the VP by (s - 1) is exact.
  const dx = narrow ? 0 : window.innerWidth * 0.17;          // parked lane offset (carX at rest)
  const dy = (GROUND - STAGE.horizon / STAGE.h) * stageHeight(); // ground line below the horizon
  const s = useTransform(d, (v) => 1 / (1 + FAR * v));
  const driveX = useTransform(s, (v) => dx * (v - 1));
  const driveY = useTransform([s, d], ([v, dv]) => dy * (v - 1) + (dv > 0.003 ? Math.sin(dv * 70) * 1.6 * v : 0));
  const driveOpacity = useTransform(d, (v) => clamp01((1 - v) / 0.06)); // emerges from the haze
  // suspension: nose dips as it brakes, then settles
  const pitch = useTransform(d, (v) => (v < 0.12 ? 1 - Math.sin((v / 0.12) * Math.PI) * 0.018 : 1));
  const lights = useTransform([d, frame], ([dv, f]) => clamp01(1 - f / 0.45) * (0.45 + 0.55 * clamp01(dv * 4)));
  const count = art.trucks.length;
  const trucks = still ? art.trucks.slice(0, 1) : art.trucks.slice(0, avail);
  // Shadow follows the silhouette width of whichever angle is showing
  const shadowW = useTransform(frame, (f) => {
    const i = Math.min(count - 1, Math.floor(f));
    const a = lerp(art.trucks[i].aspect, art.trucks[Math.min(count - 1, i + 1)].aspect, f - i);
    return a * h * 1.04;
  });
  // keep the orbit (plus half a chip) inside the screen on phones
  const rx = Math.min(h * 1.75, window.innerWidth / 2 - 72);
  const ry = h * 0.36;

  const chipLayer = (layer) => !still && (
    <div className={`xc-orbit xc-orbit--${layer}`} style={{ bottom: h * 0.5 }}>
      {chips.map((c, i) => (
        <Chip key={`${c.k}-${Math.round(h)}`} chip={c} idx={i} count={chips.length} theta={theta} rx={rx} ry={ry} show={chipShow} layer={layer} />
      ))}
    </div>
  );

  return (
    <m.div
      className="xc"
      style={{ top: `${GROUND * 100}%`, '--truck-h': `${h}px`, y: exitY, opacity: exitOpacity }}
    >
      <m.div className="xc-move" style={{ x: carX, scale: carScale }}>
        {/* drive-in down the road on entry */}
        <m.div className="xc-drive" style={{ x: driveX, y: driveY, scale: s, opacity: driveOpacity }}>
          <m.div className="xc-beam" style={{ opacity: lights }} />
          <m.div className="xc-shadow" style={{ width: shadowW }} />
          {chipLayer('back')}
          <m.div className="xc-angles" style={{ height: h, scaleY: pitch }}>
            {trucks.map((t, i) => <Angle key={t.src} t={t} i={i} count={trucks.length} frame={frame} />)}
            <m.div className="xc-lights" style={{ opacity: lights, width: h * art.trucks[0].aspect }}>
              {HEADLIGHTS.map(([fx, fy]) => <i key={fx} style={{ left: `${fx * 100}%`, top: `${fy * 100}%` }} />)}
            </m.div>
          </m.div>
          {chipLayer('front')}
        </m.div>
      </m.div>
    </m.div>
  );
}

