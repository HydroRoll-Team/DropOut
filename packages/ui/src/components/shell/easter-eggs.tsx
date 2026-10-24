import { XIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router";
import { KONAMI, printConsoleBanner } from "@/lib/eggs";
import { useInstanceStore } from "@/models/instance";

function isTyping(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT" ||
    target.closest(".monaco-editor") !== null
  );
}

/*
 * 彩蛋：
 * - ↑↑↓↓←→←→BA：解构模式，所有盒子的边界都描出来，背景抽掉。
 * - F3：Minecraft 式的调试信息，叠在画面左上角。
 * - 控制台里有一句招呼。
 */
function setXray(on: boolean) {
  document.documentElement.toggleAttribute("data-xray", on);
}

export function EasterEggs() {
  const [debugOpen, setDebugOpen] = useState(false);
  const [xray, setXrayState] = useState(() =>
    document.documentElement.hasAttribute("data-xray"),
  );
  const progress = useRef(0);

  useEffect(() => {
    printConsoleBanner();
  }, []);

  useEffect(() => {
    setXray(xray);
  }, [xray]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "F3") {
        event.preventDefault();
        setDebugOpen((open) => !open);
        return;
      }
      if (event.key === "Escape") {
        setDebugOpen(false);
        setXrayState(false);
      }
      if (isTyping(event.target)) {
        progress.current = 0;
        return;
      }

      const expected = KONAMI[progress.current];
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
      if (key === expected) {
        progress.current += 1;
        if (progress.current === KONAMI.length) {
          progress.current = 0;
          setXrayState((on) => !on);
        }
      } else {
        progress.current = key === KONAMI[0] ? 1 : 0;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      {debugOpen && <DebugOverlay />}
      {xray && <XrayPanel onClose={() => setXrayState(false)} />}
    </>
  );
}

/*
 * 解构模式的提示：一扇固定 360×96 的小窗，钉在窗口左下角
 * （首页日志窗口下面那块空白），微微歪着，像贴上去的标签。
 */
function XrayPanel({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();

  return (
    <section
      data-xray-panel=""
      role="status"
      aria-live="polite"
      aria-label={t("deco.xrayTitle")}
      className="win fixed bottom-[30px] left-[42px] z-[60] flex h-24 w-[360px] rotate-[-1.2deg] flex-col"
    >
      <div className="win-title shrink-0 pr-0">
        <span>DECONSTRUCT.EXE</span>
        <span className="flex items-center gap-2">
          <span className="chip chip-signal h-3.5 leading-[14px]">ON</span>
          <button
            type="button"
            aria-label={t("deco.xrayClose")}
            className="flex h-[18px] w-6 cursor-pointer items-center justify-center bg-ink text-paper outline-none hover:bg-signal hover:text-[#1e1e1e] focus-visible:bg-signal focus-visible:text-[#1e1e1e]"
            onClick={onClose}
          >
            <XIcon className="size-3" strokeWidth={2.5} />
          </button>
        </span>
      </div>
      <div className="flex min-h-0 flex-1 items-stretch gap-3 px-2.5 py-2">
        <div className="min-w-0 flex-1">
          <p className="type-display truncate text-[22px] leading-none">
            {t("deco.xrayTitle")}
          </p>
          <p className="mt-1 truncate text-[11px] text-ink/70">
            {t("deco.xrayOn")}
          </p>
          <p className="type-pixel mt-1 truncate text-[10px] text-ink/55">
            ↑↑↓↓←→←→BA · ESC
          </p>
        </div>
        <ul className="type-pixel flex shrink-0 flex-col justify-center gap-1 border-l border-dashed border-rule pl-2.5 text-[10px]">
          <li className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="size-2.5 border border-dashed border-signal"
            />
            {t("deco.xrayEdges")}
          </li>
          <li className="flex items-center gap-1.5">
            <span aria-hidden="true" className="size-2.5 bg-signal" />
            {t("deco.xrayLayers")}
          </li>
        </ul>
      </div>
    </section>
  );
}

function DebugOverlay() {
  const { i18n } = useTranslation();
  const location = useLocation();
  const instances = useInstanceStore((state) => state.instances);
  const activeInstance = useInstanceStore((state) => state.activeInstance);
  const [fps, setFps] = useState(0);
  const [pointer, setPointer] = useState({ x: 0, y: 0 });

  useEffect(() => {
    let frame = 0;
    let frames = 0;
    let last = performance.now();
    const loop = (now: number) => {
      frames += 1;
      if (now - last >= 500) {
        setFps(Math.round((frames * 1000) / (now - last)));
        frames = 0;
        last = now;
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    const onMove = (event: PointerEvent) => {
      setPointer({
        x: Math.round(event.clientX),
        y: Math.round(event.clientY),
      });
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onMove);
    };
  }, []);

  const root = document.documentElement;
  const lines = [
    `DropOut (${root.classList.contains("dark") ? "ink" : "paper"}/${i18n.resolvedLanguage ?? i18n.language})`,
    `${fps} fps`,
    "",
    `XY: ${pointer.x} / ${pointer.y}`,
    `Chunk: ${Math.floor(pointer.x / 16)} ${Math.floor(pointer.y / 16)}`,
    `Route: ${location.pathname}`,
    `Window: ${window.innerWidth}×${window.innerHeight} @${window.devicePixelRatio}x`,
    "",
    `Instances: ${instances.length}`,
    `Active: ${activeInstance?.name ?? "—"} ${activeInstance?.versionId ?? ""}`,
    `Loader: ${activeInstance?.modLoader ?? "vanilla"}`,
    "",
    "p(dropout) = 0.50",
    "Never dig straight down.",
  ];

  return (
    <div
      aria-hidden="true"
      className="type-pixel pointer-events-none fixed top-10 left-6 z-[60] flex flex-col items-start gap-px text-[11px] leading-4 text-white"
    >
      {lines.map((line, index) =>
        line ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: 固定顺序的行
          <span key={index} className="bg-[#505050]/80 px-1">
            {line}
          </span>
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: 空行
          <span key={index} className="h-2" />
        ),
      )}
    </div>
  );
}
