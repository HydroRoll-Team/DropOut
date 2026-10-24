import { useLayoutEffect, useRef, useState } from "react";
import { RegMark, SectionMark, VerticalCipher } from "@/components/deco/marks";
import { onTitlebarMouseDown } from "@/lib/desktop-window";

/*
 * 施工网格的格子是固定大小的：默认窗口（1024×768）的内容区是 1006×711，
 * 正好 12 列 × 8 行，一格约 84×89。窗口变大只会多出格子，格子本身不变大；
 * 轴号按格数生成。
 */
export const GRID_CELL = { width: 1006 / 12, height: 711 / 8 } as const;

/** 列号：A…Z，再往后接 AA、AB…（和表格一样） */
export function columnLabel(index: number) {
  let label = "";
  let n = index + 1;
  while (n > 0) {
    const rest = (n - 1) % 26;
    label = String.fromCharCode(65 + rest) + label;
    n = Math.floor((n - 1) / 26);
  }
  return label;
}

/** 标尺上要画几格：量自己的长度，最后一格不满也画（被窗口边切掉） */
function useCellCount(axis: "width" | "height") {
  const ref = useRef<HTMLDivElement>(null);
  const [count, setCount] = useState(axis === "width" ? 12 : 8);

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const update = () => {
      const length = axis === "width" ? node.clientWidth : node.clientHeight;
      // 减一点点，免得浮点误差在整格处多画一格
      setCount(Math.max(1, Math.ceil(length / GRID_CELL[axis] - 0.01)));
    };
    update();
    if (!("ResizeObserver" in window)) return;
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, [axis]);

  return [ref, count] as const;
}

/** 顶上的标尺：A、B、C… 有多少列写多少 */
export function TopRuler() {
  const [ref, count] = useCellCount("width");

  return (
    <div
      ref={ref}
      aria-hidden="true"
      className="relative col-start-2 flex h-3.5 overflow-hidden border-b border-hair select-none"
      onMouseDown={onTitlebarMouseDown}
    >
      {Array.from({ length: count }, (_, index) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: 列号就是位置
          key={index}
          className="type-pixel shrink-0 border-l border-ink/25 pl-1 text-[10px] leading-3.5 text-ink/45"
          style={{ width: GRID_CELL.width }}
        >
          {columnLabel(index)}
        </span>
      ))}
    </div>
  );
}

/** 左边的标尺：1、2、3… 有多少行写多少，外加一条竖着的密文 */
export function SideRuler() {
  const [ref, count] = useCellCount("height");

  return (
    <div
      ref={ref}
      aria-hidden="true"
      className="relative col-start-1 row-start-3 flex flex-col overflow-hidden border-r border-hair select-none"
    >
      {Array.from({ length: count }, (_, index) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: 行号就是位置
          key={index}
          className="type-pixel shrink-0 border-t border-ink/25 pt-0.5 text-center text-[10px] leading-3 text-ink/45"
          style={{ height: GRID_CELL.height }}
        >
          {index + 1}
        </span>
      ))}
      {/* 密文钉在固定位置（第 3 行中间起，最长 427），窗口矮时底下留 42 */}
      <div className="absolute inset-x-0 top-[242px] flex h-[min(427px,calc(100%-284px))] justify-center overflow-hidden bg-paper py-1">
        <VerticalCipher />
      </div>
    </div>
  );
}

/*
 * 施工网格：固定格子的细线，铺满内容区，画在所有页面后面。
 * 左上、右下各一个套准记号，底角标着 ∵ x / x ∵，都钉在窗口角上。
 */
export function ConstructionGrid() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-0"
      style={{
        backgroundImage: `linear-gradient(to right, var(--hair) 1px, transparent 1px), linear-gradient(to bottom, var(--hair) 1px, transparent 1px)`,
        backgroundSize: `${GRID_CELL.width}px 100%, 100% ${GRID_CELL.height}px`,
      }}
    >
      <RegMark className="absolute -top-[7px] -left-[7px] text-ink/60" />
      <RegMark className="absolute right-1.5 bottom-1.5 text-ink/60" />
      <SectionMark className="absolute bottom-1 left-2" />
      <SectionMark side="right" className="absolute right-7 bottom-1" />
    </div>
  );
}
