import { m, useTransform } from 'framer-motion';
import art from './art.json';

// Fixed, full-page backdrop built from the Gemini art (see hero/tools/process-art.py):
// sky, snowy range, pine forest and the road, each its own alpha layer on one
// shared "stage" box that covers the viewport anchored to the bottom (like
// background-size: cover). Layers pan at different speeds while the camera
// orbits the truck, which is what sells the move around it. Anything placed
// in `children` (the truck) lives on the same stage, so it stands on the road.

const { w: SW, h: SH } = art.stage;
export const STAGE = { w: SW, h: SH, horizon: art.layers.road.horizon };
const FAR_LIFT = 120; // stage px: mountains sit higher so the haze meets the horizon
// Pine stands stand on the fields beside the road: base line + scale in stage px
const STAND_BASE = 455;
const STAND_SCALE = 0.8;
const pct = (v, of) => `${(v / of) * 100}%`;

function Layer({ name, x, y }) {
  return (
    <m.img
      className={`xs-img xs-${name}`}
      src={art.layers[name].src}
      alt=""
      decoding="async"
      draggable="false"
      style={{ x, y }}
    />
  );
}

export default function Scene({ orbit, pageY, children }) {
  // Camera orbit: nearer layers pan further (parallax), opposite to rotation
  const skyX = useTransform(orbit, [0, 1], ['0.6%', '-0.6%']);
  const farX = useTransform(orbit, [0, 1], ['2%', '-2%']);
  const nearX = useTransform(orbit, [0, 1], ['6%', '-6%']);
  // Page scroll: background rises a touch as the content scrolls over it
  const skyY = useTransform(pageY, [0, 4000], ['0%', '-2%'], { clamp: true });
  const farY = useTransform(pageY, [0, 4000], ['0%', '-3%'], { clamp: true });

  return (
    <div className="xs" aria-hidden="true">
      <div
        className="xs-stage"
        style={{
          '--sw': SW,
          '--sh': SH,
          '--horizon': `${(STAGE.horizon / SH) * 100}%`,
          '--hfrac': STAGE.horizon / SH,
          '--far-lift': `${(-FAR_LIFT / SH) * 100}%`,
        }}
      >
        <Layer name="sky" x={skyX} y={skyY} />
        <Layer name="far" x={farX} y={farY} />
        <Layer name="road" />
        <div className="xs-haze" />
        {art.stands.map((st) => {
          const w = st.w * STAND_SCALE;
          const h = st.h * STAND_SCALE;
          return (
            <m.img
              key={st.side}
              className="xs-stand"
              src={st.src}
              alt=""
              decoding="async"
              draggable="false"
              style={{
                x: nearX, // pans with the orbit but stays planted on the ground (no page-scroll lift)
                width: pct(w, SW),
                height: pct(h, SH),
                top: pct(STAND_BASE - st.base * STAND_SCALE, SH),
                ...(st.side === 'left' ? { left: pct(-24, SW) } : { right: pct(-24, SW) }),
              }}
            />
          );
        })}
        {children}
      </div>
      <div className="xs-vignette" />
    </div>
  );
}
