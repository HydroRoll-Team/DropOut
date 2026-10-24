import { getVersion } from "@tauri-apps/api/app";
import { isTauri } from "@tauri-apps/api/core";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router";
import { CopyText } from "@/components/deco/marks";
import { FOOTER_LINE } from "@/lib/eggs";

function pad(value: number) {
  return String(Math.max(0, Math.round(value))).padStart(4, "0");
}

/*
 * 底栏：像 F3 调试界面压成了一行。
 * 左边是系统名、版本、当前路由；中间一串 base64；右边是鼠标坐标和语言。
 * 坐标直接改文字，不触发重渲染。
 */
export function StatusStrip() {
  const { i18n } = useTranslation();
  const location = useLocation();
  const coordsRef = useRef<HTMLSpanElement>(null);
  const [version, setVersion] = useState<string>("dev");

  useEffect(() => {
    if (!isTauri()) return;
    let mounted = true;
    getVersion()
      .then((value) => {
        if (mounted) setVersion(value);
      })
      .catch(() => undefined);
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let frame = 0;
    let x = 0;
    let y = 0;
    const onMove = (event: PointerEvent) => {
      x = event.clientX;
      y = event.clientY;
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (coordsRef.current) {
          coordsRef.current.textContent = `X ${pad(x)} Y ${pad(y)}`;
        }
      });
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onMove);
    };
  }, []);

  return (
    <footer
      aria-hidden="true"
      className="type-pixel relative z-20 col-span-2 flex h-5 items-center gap-3 border-t border-rule bg-paper px-2 text-[11px] leading-5 whitespace-nowrap text-ink select-none"
    >
      <span className="chip">DROPOUT.OS1</span>
      <span className="opacity-70">VER {version}</span>
      <span className="max-w-40 truncate opacity-70">{location.pathname}</span>
      <span className="flex min-w-0 flex-1 justify-center">
        <CopyText
          text={FOOTER_LINE}
          className="max-w-full truncate px-1 text-[10px] opacity-45"
          copiedClassName="bg-ink text-paper opacity-100"
        />
      </span>
      <span ref={coordsRef} className="opacity-70 tabular-nums">
        X ---- Y ----
      </span>
      <span className="opacity-70">
        {(i18n.resolvedLanguage ?? i18n.language).toUpperCase()}
      </span>
      <span className="border border-rule px-1 leading-[14px] opacity-70">
        F3
      </span>
    </footer>
  );
}
