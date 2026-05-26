import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate } from "remotion";

// === Color system: matches the app's Aurora Glass theme ===
const BG = "#0a1020";
const CYAN = "#5fd4e6";
const VIOLET = "#7c5cff";
const MAGENTA = "#c558ff";

const TAU = Math.PI * 2;

// Loop-friendly sine using normalized progress 0..1
const wave = (t: number, phase = 0) => Math.sin(t * TAU + phase);

function AuroraBlobs() {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const t = frame / durationInFrames;

  const blobs = [
    { color: CYAN,    size: 1100, baseX: 15, baseY: 25, ax: 8,  ay: 6,  phase: 0,   opacity: 0.55 },
    { color: VIOLET,  size: 1300, baseX: 80, baseY: 70, ax: 7,  ay: 9,  phase: 1.2, opacity: 0.50 },
    { color: MAGENTA, size: 800,  baseX: 55, baseY: 40, ax: 12, ay: 8,  phase: 2.6, opacity: 0.35 },
    { color: CYAN,    size: 700,  baseX: 90, baseY: 15, ax: 6,  ay: 10, phase: 3.4, opacity: 0.30 },
  ];

  return (
    <AbsoluteFill>
      {blobs.map((b, i) => {
        const x = b.baseX + b.ax * wave(t, b.phase);
        const y = b.baseY + b.ay * wave(t, b.phase + 1.1);
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: `${x}%`,
              top: `${y}%`,
              width: b.size,
              height: b.size,
              transform: "translate(-50%, -50%)",
              borderRadius: "9999px",
              background: `radial-gradient(circle at center, ${b.color}, transparent 65%)`,
              opacity: b.opacity,
              filter: "blur(80px)",
              mixBlendMode: "screen",
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
}

function PerspectiveGrid() {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const t = (frame / fps) % 4; // 4s loop
  const offset = (t / 4) * 80; // grid spacing

  const lines: React.ReactElement[] = [];
  // Horizontal lines receding to horizon
  const horizon = height * 0.45;
  const rows = 22;
  for (let i = 0; i < rows; i++) {
    const progress = ((i + offset / 80) % rows) / rows;
    const eased = Math.pow(progress, 2.2);
    const y = horizon + eased * (height - horizon);
    const opacity = interpolate(progress, [0, 0.1, 1], [0, 0.6, 0.05]);
    lines.push(
      <line key={`h${i}`} x1={0} x2={width} y1={y} y2={y} stroke={CYAN} strokeOpacity={opacity} strokeWidth={1} />
    );
  }
  // Vertical lines converging to vanishing point
  const cx = width / 2;
  const cols = 24;
  for (let i = -cols; i <= cols; i++) {
    const xBottom = cx + (i / cols) * width * 1.4;
    lines.push(
      <line
        key={`v${i}`}
        x1={cx}
        y1={horizon}
        x2={xBottom}
        y2={height}
        stroke={CYAN}
        strokeOpacity={0.18}
        strokeWidth={1}
      />
    );
  }

  return (
    <AbsoluteFill style={{ opacity: 0.55 }}>
      <svg width={width} height={height}>
        <defs>
          <linearGradient id="gridMask" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#000" stopOpacity="0" />
            <stop offset="0.4" stopColor="#000" stopOpacity="0.4" />
            <stop offset="1" stopColor="#000" stopOpacity="1" />
          </linearGradient>
        </defs>
        {lines}
      </svg>
    </AbsoluteFill>
  );
}

function OrbitalRings() {
  const frame = useCurrentFrame();
  const { width, height, durationInFrames } = useVideoConfig();
  const t = frame / durationInFrames;
  const cx = width * 0.78;
  const cy = height * 0.32;

  const rings = [
    { r: 260, rot: t * 360, color: CYAN,    op: 0.5,  dash: "6 14" },
    { r: 360, rot: -t * 280, color: VIOLET, op: 0.4,  dash: "2 22" },
    { r: 480, rot: t * 200, color: MAGENTA, op: 0.25, dash: "1 18" },
    { r: 600, rot: -t * 160, color: CYAN,   op: 0.18, dash: "1 30" },
  ];

  return (
    <AbsoluteFill>
      <svg width={width} height={height}>
        {rings.map((r, i) => (
          <g key={i} transform={`rotate(${r.rot} ${cx} ${cy})`}>
            <circle
              cx={cx}
              cy={cy}
              r={r.r}
              fill="none"
              stroke={r.color}
              strokeOpacity={r.op}
              strokeWidth={1.2}
              strokeDasharray={r.dash}
            />
          </g>
        ))}
        {/* Node dots on rings */}
        {rings.map((r, i) => {
          const angle = (r.rot * Math.PI) / 180 + i;
          const x = cx + Math.cos(angle) * r.r;
          const y = cy + Math.sin(angle) * r.r;
          return <circle key={`n${i}`} cx={x} cy={y} r={4} fill={r.color} opacity={0.9} />;
        })}
      </svg>
    </AbsoluteFill>
  );
}

function Particles() {
  const frame = useCurrentFrame();
  const { width, height, durationInFrames } = useVideoConfig();
  const t = frame / durationInFrames;
  const count = 80;
  const seeds = Array.from({ length: count }, (_, i) => i);

  return (
    <AbsoluteFill>
      {seeds.map((i) => {
        // Deterministic pseudo-random
        const sx = ((Math.sin(i * 12.9898) * 43758.5453) % 1 + 1) % 1;
        const sy = ((Math.sin(i * 78.233) * 12345.678) % 1 + 1) % 1;
        const speed = 0.3 + sx * 0.8;
        const size = 1 + sy * 3;
        const color = i % 3 === 0 ? VIOLET : i % 3 === 1 ? CYAN : MAGENTA;

        // Drift loopably
        const x = ((sx + t * speed) % 1) * width;
        const y = ((sy + t * speed * 0.6 + Math.sin((t + sx) * TAU) * 0.04) % 1 + 1) % 1 * height;
        const twinkle = 0.4 + 0.6 * Math.abs(Math.sin((t + sx) * TAU * 2));

        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x,
              top: y,
              width: size,
              height: size,
              borderRadius: 9999,
              background: color,
              boxShadow: `0 0 ${size * 6}px ${color}`,
              opacity: twinkle * 0.85,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
}

function DataLines() {
  const frame = useCurrentFrame();
  const { width, height, durationInFrames } = useVideoConfig();
  const t = frame / durationInFrames;
  const lines = 6;

  return (
    <AbsoluteFill>
      <svg width={width} height={height}>
        {Array.from({ length: lines }, (_, i) => {
          const seed = i * 1.7;
          const y = (i / lines) * height + Math.sin((t + seed) * TAU) * 30;
          const progress = ((t * 0.6 + i * 0.15) % 1);
          const x1 = -200 + progress * (width + 400);
          const x2 = x1 + 220;
          const color = i % 2 ? CYAN : VIOLET;
          return (
            <g key={i}>
              <line x1={x1} y1={y} x2={x2} y2={y} stroke={color} strokeWidth={1.5} opacity={0.7} />
              <circle cx={x2} cy={y} r={3} fill={color} opacity={0.9} />
            </g>
          );
        })}
      </svg>
    </AbsoluteFill>
  );
}

function Vignette() {
  return (
    <AbsoluteFill
      style={{
        background:
          "radial-gradient(ellipse at center, transparent 40%, rgba(5,8,18,0.65) 100%)",
        pointerEvents: "none",
      }}
    />
  );
}

function Scanlines() {
  return (
    <AbsoluteFill
      style={{
        backgroundImage:
          "repeating-linear-gradient(0deg, rgba(255,255,255,0.025) 0px, rgba(255,255,255,0.025) 1px, transparent 1px, transparent 3px)",
        opacity: 0.5,
        mixBlendMode: "overlay",
      }}
    />
  );
}

export const MainVideo: React.FC = () => {
  return (
    <AbsoluteFill style={{ background: BG, overflow: "hidden" }}>
      <AuroraBlobs />
      <PerspectiveGrid />
      <OrbitalRings />
      <DataLines />
      <Particles />
      <Scanlines />
      <Vignette />
    </AbsoluteFill>
  );
};