import { useEffect, useState } from 'react';
import { m, AnimatePresence, useTransform } from 'framer-motion';

// Liquid glass intro. The mountain scene loads *behind* a sheet of frosted
// glass; in front floats a morphing glass capsule with the wordmark and a
// liquid progress fill that tracks the real hero load, while glass droplets
// drift and merge around it. When ready, the capsule swells and dissolves
// and the frost melts away, revealing the scene (and the truck's drive).
// Full intro once per session; later visits get a quick frost fade only.
// Never blocks for long: MAX_MS hard cap, plus a CSS failsafe in home.css.

const MIN_MS = 1800;
const MAX_MS = 4200;
const WORD = 'dangm.ca'.split('');
const ease = [0.22, 1, 0.36, 1];
// Organic blob outline the droplets morph through
const BLOB = [
  '42% 58% 62% 38% / 46% 40% 60% 54%',
  '58% 42% 38% 62% / 55% 60% 40% 45%',
  '50% 50% 55% 45% / 40% 55% 45% 60%',
];
const DROPS = [
  { x: -260, y: -110, s: 74, d: 0 },
  { x: 250, y: -90, s: 52, d: 0.6 },
  { x: 210, y: 110, s: 90, d: 1.1 },
  { x: -220, y: 120, s: 40, d: 0.3 },
];

export default function Loader({ progress, ready, onDone, quick }) {
  const [minPassed, setMinPassed] = useState(false);
  const [capped, setCapped] = useState(false);
  const [open, setOpen] = useState(true);
  const fill = useTransform(progress, (v) => `${Math.round(Math.min(1, v) * 100)}%`);

  useEffect(() => {
    const a = setTimeout(() => setMinPassed(true), quick ? 250 : MIN_MS);
    const b = setTimeout(() => setCapped(true), quick ? 1200 : MAX_MS);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, [quick]);

  useEffect(() => {
    if ((ready && minPassed) || capped) setOpen(false);
  }, [ready, minPassed, capped]);

  return (
    <AnimatePresence onExitComplete={onDone}>
      {open && (
        <m.div
          className={`xl${quick ? ' xl--quick' : ''}`}
          role="status"
          aria-live="polite"
          aria-label="Loading dangm.ca"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: quick ? 0.35 : 0.9, ease: [0.4, 0, 0.2, 1], delay: quick ? 0 : 0.25 } }}
        >
          {!quick && (
            <m.div
              className="xl-stage"
              exit={{ scale: 1.25, opacity: 0, filter: 'blur(14px)', transition: { duration: 0.75, ease: [0.7, 0, 0.3, 1] } }}
            >
              {DROPS.map((dr, i) => (
                <m.span
                  key={i}
                  className="xl-drop"
                  style={{ width: dr.s, height: dr.s, marginLeft: -dr.s / 2, marginTop: -dr.s / 2 }}
                  initial={{ x: 0, y: 0, scale: 0, opacity: 0 }}
                  animate={{
                    x: [0, dr.x, 0],
                    y: [0, dr.y, 0],
                    scale: [0.3, 1, 0.3],
                    opacity: [0, 1, 0],
                    borderRadius: BLOB,
                  }}
                  transition={{ duration: 3.4, ease: 'easeInOut', repeat: Infinity, delay: 0.3 + dr.d }}
                />
              ))}

              <m.div
                className="xl-capsule"
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ scale: { type: 'spring', stiffness: 160, damping: 14, mass: 0.9 }, opacity: { duration: 0.4 } }}
              >
                <span className="xl-sheen" aria-hidden="true" />
                <div className="xl-word" aria-hidden="true">
                  {WORD.map((c, i) => (
                    <m.span
                      key={i}
                      className={i > 4 ? 'xl-accent' : undefined}
                      initial={{ y: '45%', opacity: 0, filter: 'blur(8px)' }}
                      animate={{ y: '0%', opacity: 1, filter: 'blur(0px)' }}
                      transition={{ duration: 0.8, ease, delay: 0.35 + i * 0.055 }}
                    >
                      {c}
                    </m.span>
                  ))}
                </div>
                <div className="xl-bar" aria-hidden="true">
                  <m.span className="xl-fill" style={{ width: fill }}>
                    <i />
                  </m.span>
                </div>
                <m.p
                  className="xl-tag"
                  initial={{ opacity: 0, letterSpacing: '0.5em' }}
                  animate={{ opacity: 1, letterSpacing: '0.28em' }}
                  transition={{ duration: 1.1, ease, delay: 0.8 }}
                >
                  Eagle Ridge GM · Coquitlam, BC
                </m.p>
              </m.div>
            </m.div>
          )}
        </m.div>
      )}
    </AnimatePresence>
  );
}
