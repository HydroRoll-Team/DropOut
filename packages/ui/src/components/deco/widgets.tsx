import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { isLauncherFixtureMode } from "@/lib/launcher-runtime";
import { cn } from "@/lib/utils";
import { Win } from "./win";

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function mulberry32(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const RATES = [0.1, 0.25, 0.5, 0.75, 0.9] as const;

/*
 * DROPOUT 小部件：一排神经元，每隔一会儿按 p 随机丢掉一部分（只剩虚线框）。
 * 点一下换一个 p。这是 DropOut 名字的来历：训练时随机丢掉神经元，剩下的更强。
 */
export function DropoutWidget({
  columns = 8,
  rows = 4,
  className,
}: {
  columns?: number;
  rows?: number;
  className?: string;
}) {
  const { t } = useTranslation();
  const frozen = isLauncherFixtureMode() || prefersReducedMotion();
  const [rateIndex, setRateIndex] = useState(2);
  const [tick, setTick] = useState(0);
  const rate = RATES[rateIndex] ?? 0.5;
  const total = columns * rows;

  useEffect(() => {
    if (frozen) return;
    const timer = window.setInterval(() => setTick((value) => value + 1), 1400);
    return () => window.clearInterval(timer);
  }, [frozen]);

  const mask = useMemo(() => {
    const random = mulberry32(0x5eed + tick * 7919 + rateIndex * 31);
    return Array.from({ length: total }, () => random() >= rate);
  }, [rate, rateIndex, tick, total]);

  const kept = mask.filter(Boolean).length;
  const percent = Math.round(rate * 100);

  return (
    <Win
      title={`DROPOUT p=${rate.toFixed(2)}`}
      meta={`${kept}/${total}`}
      tone="gray"
      className={className}
    >
      <button
        type="button"
        className="block w-full cursor-pointer p-2 text-left outline-none focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-ring"
        aria-label={t("deco.dropoutRate", { percent })}
        onClick={() => setRateIndex((index) => (index + 1) % RATES.length)}
      >
        <span
          className="grid gap-1"
          style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
          aria-hidden="true"
        >
          {mask.map((on, index) => (
            <span
              // biome-ignore lint/suspicious/noArrayIndexKey: 固定数量的格子
              key={index}
              className={cn(
                "aspect-square transition-colors duration-300",
                on ? "bg-ink" : "dropped",
              )}
            />
          ))}
        </span>
        <span className="type-pixel mt-1.5 flex justify-between text-[10px] text-ink/70">
          <span>{t("deco.kept", { kept, total })}</span>
          <span>↻ p</span>
        </span>
      </button>
    </Win>
  );
}

/* 夹具模式下固定在这一刻，截图才能逐像素一致 */
const FIXTURE_NOW = Date.UTC(2026, 9, 24, 4, 30, 0);
const MINECRAFT_RELEASE = Date.UTC(2011, 10, 18);

function minecraftClock(now: number) {
  const ticks = Math.floor(now / 50) % 24000;
  const day = Math.floor((now - MINECRAFT_RELEASE) / 1_200_000);
  // 第 0 刻是早上六点
  const minutesOfDay = ((ticks / 1000 + 6) % 24) * 60;
  const hours = Math.floor(minutesOfDay / 60);
  const minutes = Math.floor(minutesOfDay % 60);
  const daytime = ticks < 12542 || ticks > 23460;
  return { ticks, day, hours, minutes, daytime };
}

/*
 * DAYLIGHT 小部件：把现实时间换算成游戏里的时间（一天二十分钟），
 * 第几天从 Minecraft 正式版发布那天算起。
 */
export function DaylightWidget({ className }: { className?: string }) {
  const { t, i18n } = useTranslation();
  const frozen = isLauncherFixtureMode();
  const [now, setNow] = useState(() => (frozen ? FIXTURE_NOW : Date.now()));

  useEffect(() => {
    if (frozen) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [frozen]);

  const clock = minecraftClock(now);
  const time = `${String(clock.hours).padStart(2, "0")}:${String(clock.minutes).padStart(2, "0")}`;
  const day = new Intl.NumberFormat(i18n.resolvedLanguage ?? "en").format(
    clock.day,
  );

  return (
    <Win
      title="DAYLIGHT 1.0"
      meta={clock.daytime ? "☼" : "☾"}
      className={className}
    >
      <div className="p-2">
        <p className="type-pixel text-[11px] text-ink/70">
          {t("deco.day", { day })}
        </p>
        <p className="type-pixel text-[22px] leading-6 text-ink">
          <span className="sr-only">{t("deco.gameTime", { time })}</span>
          <span aria-hidden="true">{time}</span>
        </p>
        <div
          aria-hidden="true"
          className="relative mt-1.5 h-2.5 transform-gpu border border-rule"
        >
          <div className="absolute inset-0 bg-[linear-gradient(90deg,var(--sky)_0%,var(--sky)_52%,#1e1e2a_56%,#1e1e2a_96%,var(--sky)_100%)]" />
          <div
            className="absolute -inset-y-1 w-0.5 bg-signal"
            style={{ left: `${(clock.ticks / 24000) * 100}%` }}
          />
        </div>
        <p className="type-pixel mt-1 text-[10px] text-ink/60">
          {clock.ticks.toString().padStart(5, "0")} / 24000
        </p>
      </div>
    </Win>
  );
}
