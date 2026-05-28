/**
 * Confetti leve, sem dependência. Cria um <canvas> overlay temporário,
 * dispara partículas com gravidade/rotação e se auto-remove no fim.
 * No-op em SSR e quando o usuário pede `prefers-reduced-motion: reduce`.
 */

const COLORS = [
  "#6D3FE3", // violet (primary)
  "#A78BFA", // violet claro
  "#F59E0B", // amber (coins)
  "#10B981", // emerald
  "#38BDF8", // sky
  "#F472B6", // pink
];

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  rot: number;
  vrot: number;
  color: string;
  circle: boolean;
};

export function fireConfetti(
  opts: { origin?: { x: number; y: number }; particleCount?: number } = {},
): void {
  if (typeof window === "undefined") return;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

  const { origin = { x: 0.5, y: 0.4 }, particleCount = 90 } = opts;

  const canvas = document.createElement("canvas");
  canvas.style.cssText =
    "position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:9999";
  document.body.appendChild(canvas);

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    canvas.remove();
    return;
  }

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = window.innerWidth;
  const H = window.innerHeight;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  ctx.scale(dpr, dpr);

  const ox = origin.x * W;
  const oy = origin.y * H;

  const particles: Particle[] = Array.from({ length: particleCount }, () => {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.1;
    const speed = 6 + Math.random() * 8;
    return {
      x: ox,
      y: oy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: 5 + Math.random() * 6,
      rot: Math.random() * Math.PI,
      vrot: (Math.random() - 0.5) * 0.4,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      circle: Math.random() < 0.35,
    };
  });

  const gravity = 0.32;
  const drag = 0.992;
  const start = performance.now();
  const lifeMs = 1600;

  const frame = (now: number) => {
    const elapsed = now - start;
    const fade = Math.max(0, 1 - elapsed / lifeMs);
    ctx.clearRect(0, 0, W, H);

    for (const p of particles) {
      p.vx *= drag;
      p.vy = p.vy * drag + gravity;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vrot;

      ctx.save();
      ctx.globalAlpha = fade;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      if (p.circle) {
        ctx.beginPath();
        ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
      }
      ctx.restore();
    }

    if (elapsed < lifeMs) {
      requestAnimationFrame(frame);
    } else {
      canvas.remove();
    }
  };

  requestAnimationFrame(frame);
}
