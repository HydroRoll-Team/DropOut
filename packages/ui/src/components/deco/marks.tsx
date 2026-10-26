import type * as React from "react";
import { useEffect, useState } from "react";
import { CIPHER_VERTICAL, chunk } from "@/lib/eggs";
import { cn } from "@/lib/utils";

/** 分节记号：∵ x / x ∵ */
export function SectionMark({
  side = "left",
  className,
}: {
  side?: "left" | "right";
  className?: string;
}) {
  return (
    <span aria-hidden="true" className={cn("section-mark", className)}>
      {side === "left" ? "∵ x" : "x ∵"}
    </span>
  );
}

/** 套准记号 ⊕ */
export function RegMark({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <svg
      aria-hidden="true"
      style={style}
      viewBox="0 0 14 14"
      className={cn("size-3.5 text-ink", className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="1"
    >
      <circle cx="7" cy="7" r="4" />
      <path d="M7 0v14M0 7h14" />
    </svg>
  );
}

/** 标签 ……… 数值 */
export function Leader({
  label,
  value,
  className,
  valueClassName,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  className?: string;
  valueClassName?: string;
}) {
  return (
    <div className={cn("flex min-w-0 items-baseline", className)}>
      <span className="shrink-0">{label}</span>
      <span aria-hidden="true" className="leader" />
      <span className={cn("min-w-0 truncate text-right", valueClassName)}>
        {value}
      </span>
    </div>
  );
}

/** 分段条：十格，填到哪算哪，最后一格按比例填一部分 */
export function SegBar({
  value,
  segments = 10,
  className,
  fillClassName = "bg-ink",
}: {
  value: number;
  segments?: number;
  className?: string;
  fillClassName?: string;
}) {
  const clamped = Math.max(0, Math.min(1, value));
  return (
    <div
      aria-hidden="true"
      className={cn("flex h-2.5 w-full gap-px", className)}
    >
      {Array.from({ length: segments }, (_, index) => {
        const fill = Math.max(0, Math.min(1, clamped * segments - index));
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: 固定数量的格子
          <span key={index} className="bg-win relative flex-1">
            <span
              className={cn("absolute inset-y-0 left-0", fillClassName)}
              style={{ width: `${fill * 100}%` }}
            />
          </span>
        );
      })}
    </div>
  );
}

/** 尺寸标注线：量出目标元素的宽度，画在它上方 */
export function DimensionLine({
  target,
  className,
  prefix = "W",
}: {
  target: React.RefObject<HTMLElement | null>;
  className?: string;
  prefix?: string;
}) {
  const [width, setWidth] = useState<number | null>(null);

  useEffect(() => {
    const node = target.current;
    if (!node) return;
    const update = () => setWidth(node.offsetWidth);
    update();
    if (!("ResizeObserver" in window)) return;
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, [target]);

  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none relative flex h-3 items-center text-ink/70",
        className,
      )}
      style={width ? { width } : undefined}
    >
      <span className="absolute inset-y-0 left-0 w-px bg-current" />
      <span className="absolute inset-x-0 top-1/2 h-px bg-current" />
      <span className="absolute inset-y-0 right-0 w-px bg-current" />
      <span className="type-pixel relative mx-auto bg-paper px-1 text-[10px] leading-3">
        {prefix} {width ?? "—"}
      </span>
    </div>
  );
}

/** 彩蛋的复制：文字不可选中，点一下才复制，原处闪一下 */
function useCopyFlash(text: string) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1200);
    return () => window.clearTimeout(timer);
  }, [copied]);
  const copy = () => {
    void navigator.clipboard
      ?.writeText(text)
      .then(() => setCopied(true))
      .catch(() => undefined);
  };
  return { copied, copy };
}

/** 可以点一下复制的一串字（只给鼠标用，不进 Tab 顺序，读屏跳过） */
export function CopyText({
  text,
  className,
  copiedClassName = "bg-ink text-paper",
  children,
}: {
  text: string;
  className?: string;
  copiedClassName?: string;
  children?: React.ReactNode;
}) {
  const { copied, copy } = useCopyFlash(text);
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-hidden="true"
      className={cn(
        "cursor-copy text-left outline-none",
        className,
        copied && copiedClassName,
      )}
      onClick={copy}
    >
      {children ?? text}
    </button>
  );
}

/** 竖排的一串 base64（彩蛋）。点一下复制，解六次。 */
export function VerticalCipher({ className }: { className?: string }) {
  return (
    <CopyText
      text={CIPHER_VERTICAL}
      className={cn(
        "type-mono pointer-events-auto rotate-180 text-[9px] leading-none tracking-[0.06em] text-ink/55 [writing-mode:vertical-rl]",
        className,
      )}
    />
  );
}

/** [B.64] 块（彩蛋）。点一下复制。 */
export function B64Block({
  data,
  width = 30,
  label = "[B.64]",
  className,
}: {
  data: string;
  width?: number;
  label?: string;
  className?: string;
}) {
  const { copied, copy } = useCopyFlash(data);
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-hidden="true"
      onClick={copy}
      className={cn(
        "type-mono block cursor-copy text-left text-ink outline-none",
        className,
      )}
    >
      <span className="mb-1.5 block text-[10px] tracking-[0.04em]">
        {copied ? "[COPIED]" : label}
      </span>
      <span
        className={cn(
          "block text-[9.5px] leading-[1.28] tracking-[0.03em] break-all whitespace-pre",
          copied && "bg-ink text-paper",
        )}
      >
        {chunk(data, width).join("\n")}
      </span>
    </button>
  );
}

/*
 * 引线标注：从标题里被丢掉的那个字拉出一条折线，写上 DROPPED。
 * 标题的父元素要是 relative，标注按它定位。
 */
export function GlyphCallout({
  target,
  label,
  className,
}: {
  target: React.RefObject<HTMLElement | null>;
  label: string;
  className?: string;
}) {
  const [point, setPoint] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const node = target.current;
    const container = node?.parentElement;
    if (!node || !container) return;

    const update = () => {
      const glyph = node.querySelector<HTMLElement>("[data-dropped]");
      if (!glyph) {
        setPoint(null);
        return;
      }
      const g = glyph.getBoundingClientRect();
      const c = container.getBoundingClientRect();
      setPoint({
        x: Math.round(g.left - c.left + g.width * 0.7),
        y: Math.round(g.top - c.top + g.height * 0.22),
      });
    };

    update();
    void document.fonts?.ready.then(update);
    const resize =
      "ResizeObserver" in window ? new ResizeObserver(update) : null;
    resize?.observe(node);
    const mutation = new MutationObserver(update);
    mutation.observe(node, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    return () => {
      resize?.disconnect();
      mutation.disconnect();
    };
  }, [target]);

  if (!point) return null;

  return (
    <div
      aria-hidden="true"
      className={cn("pointer-events-none absolute z-10 text-ink", className)}
      style={{ left: point.x, top: point.y }}
    >
      <svg
        aria-hidden="true"
        width="48"
        height="28"
        viewBox="0 0 48 28"
        fill="none"
        stroke="currentColor"
        className="absolute -top-7 left-0 overflow-visible"
      >
        <path d="M0 28 L20 8 H48" strokeWidth="1" />
        <rect
          x="-3"
          y="25"
          width="6"
          height="6"
          fill="var(--signal)"
          strokeWidth="1"
        />
      </svg>
      <span className="type-pixel absolute -top-[29px] left-[50px] border border-rule bg-paper px-1 text-[10px] leading-[14px] whitespace-nowrap">
        {label}
      </span>
    </div>
  );
}
