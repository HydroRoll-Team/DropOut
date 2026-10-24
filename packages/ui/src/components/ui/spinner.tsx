import { cn } from "@/lib/utils";

/* 四个方块轮流亮起：比转圈更像一台老机器在忙 */
function Spinner({ className, ...props }: React.ComponentProps<"svg">) {
  return (
    <svg
      role="status"
      aria-label="Loading"
      viewBox="0 0 16 16"
      fill="currentColor"
      className={cn("size-4 shrink-0", className)}
      {...props}
    >
      {[
        [1, 1],
        [9, 1],
        [9, 9],
        [1, 9],
      ].map(([x, y], index) => (
        <rect
          key={`${x}-${y}`}
          x={x}
          y={y}
          width="6"
          height="6"
          className="animate-[spinner-step_0.8s_steps(1,end)_infinite] motion-reduce:animate-none"
          style={{ animationDelay: `${index * 0.2}s` }}
        />
      ))}
    </svg>
  );
}

export { Spinner };
