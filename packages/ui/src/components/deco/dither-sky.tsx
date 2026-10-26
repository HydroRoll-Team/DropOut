import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/*
 * 抖色天空：一块静态的像素云，按窗口大小画一次，主题变了再画一次。
 * 有序抖色（4×4 Bayer）叠一点固定种子的颗粒；越往下越稀，最后散成纸面。
 * 不做动画——上一版的粒子太闹，这里只要一块安静的色场。
 */

const PIXEL = 2;

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(
  (value) => (value + 0.5) / 16,
);

type Rgb = [number, number, number];

const PALETTES: Record<"light" | "dark", { sky: Rgb; cloud: Rgb; haze: Rgb }> =
  {
    light: {
      sky: [164, 196, 236],
      cloud: [245, 160, 182],
      haze: [212, 188, 240],
    },
    dark: {
      sky: [36, 46, 66],
      cloud: [96, 50, 74],
      haze: [60, 52, 90],
    },
  };

function hash2(x: number, y: number, seed: number) {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function valueNoise(x: number, y: number, seed: number) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, seed);
  const b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed);
  const d = hash2(xi + 1, yi + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function fbm(x: number, y: number, seed: number) {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  for (let octave = 0; octave < 5; octave += 1) {
    sum += amp * valueNoise(x * freq, y * freq, seed + octave * 17);
    freq *= 2.03;
    amp *= 0.5;
  }
  return sum;
}

function smoothstep(edge0: number, edge1: number, x: number) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function paint(canvas: HTMLCanvasElement, seed: number, dark: boolean) {
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, Math.ceil(rect.width / PIXEL));
  const height = Math.max(1, Math.ceil(rect.height / PIXEL));
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return;

  const palette = PALETTES[dark ? "dark" : "light"];
  const image = context.createImageData(width, height);
  const data = image.data;
  const scale = 1 / 60;

  for (let y = 0; y < height; y += 1) {
    const v = y / height;
    for (let x = 0; x < width; x += 1) {
      const threshold =
        BAYER[(y % 4) * 4 + (x % 4)] * 0.72 + hash2(x, y, seed + 99) * 0.28;

      // 云：上半部多、往两侧堆积，中间留出一块天
      const n = fbm(x * scale, y * scale * 1.5, seed);
      const side = Math.abs(x / width - 0.48) * 0.32;
      const lift = 0.08 - v * 0.26 + side;
      const cloud = smoothstep(0.44, 0.7, n + lift);
      const haze = 1 - Math.abs(cloud - 0.5) * 2;

      // 往下散成纸面；云心里也透出一点纸色，像印得不实
      const fade = smoothstep(0.18, 0.92, v + (n - 0.5) * 0.45);
      if (fade > threshold) continue;
      if (cloud > 0.9 && hash2(x, y, seed + 3) < 0.22) continue;

      let color = palette.sky;
      if (cloud > threshold) color = palette.cloud;
      if (haze > 0.5 && hash2(x, y, seed + 7) < haze * 0.55) {
        color = palette.haze;
      }

      const offset = (y * width + x) * 4;
      data[offset] = color[0];
      data[offset + 1] = color[1];
      data[offset + 2] = color[2];
      data[offset + 3] = 255;
    }
  }

  context.putImageData(image, 0, 0);
}

export function DitherSky({
  seed = 11,
  className,
}: {
  seed?: number;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let frame = 0;
    const isDark = () => document.documentElement.classList.contains("dark");
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => paint(canvas, seed, isDark()));
    };

    schedule();

    const resize =
      "ResizeObserver" in window ? new ResizeObserver(schedule) : null;
    resize?.observe(canvas);

    const themeWatcher = new MutationObserver(schedule);
    themeWatcher.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => {
      cancelAnimationFrame(frame);
      resize?.disconnect();
      themeWatcher.disconnect();
    };
  }, [seed]);

  return (
    <div
      aria-hidden="true"
      className={cn("pointer-events-none size-full", className)}
    >
      <canvas
        ref={canvasRef}
        className="block size-full [image-rendering:pixelated]"
      />
    </div>
  );
}
