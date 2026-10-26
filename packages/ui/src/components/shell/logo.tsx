import { cn } from "@/lib/utils";

/*
 * 标志：一张神经网络，中间一层有两个节点被丢掉了（虚线圈）。
 * 字标「DropOut」里 Out 的 O 也被丢掉，只剩轮廓。
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 100 100"
      fill="none"
      className={cn("size-4 shrink-0", className)}
    >
      <path
        d="M22 22 L50 50 M22 78 L50 50 M22 50 L50 50 M50 50 L80 50"
        stroke="currentColor"
        strokeWidth="6"
      />
      <rect x="12" y="12" width="20" height="20" fill="currentColor" />
      <rect x="12" y="40" width="20" height="20" fill="currentColor" />
      <rect x="12" y="68" width="20" height="20" fill="currentColor" />
      <rect
        x="41"
        y="9"
        width="18"
        height="18"
        stroke="currentColor"
        strokeWidth="4"
        strokeDasharray="6 5"
      />
      <rect
        x="41"
        y="73"
        width="18"
        height="18"
        stroke="currentColor"
        strokeWidth="4"
        strokeDasharray="6 5"
      />
      <rect x="38" y="38" width="24" height="24" fill="currentColor" />
      <rect x="70" y="40" width="20" height="20" fill="currentColor" />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "font-display font-semibold tracking-[-0.045em]",
        className,
      )}
    >
      Drop<span className="glyph-dropped">O</span>ut
    </span>
  );
}
