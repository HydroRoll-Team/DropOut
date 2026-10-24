import type * as React from "react";
import { cn } from "@/lib/utils";

/*
 * 一扇系统窗口：黑色标题栏（像素字的「文件名」）+ 1px 墨线 + 硬投影。
 * 页面上的面板都用它，彼此可以错开、压叠。
 */
export function Win({
  title,
  meta,
  tone = "sheet",
  flat = false,
  className,
  bodyClassName,
  children,
  ...props
}: Omit<React.ComponentProps<"section">, "title"> & {
  title: React.ReactNode;
  meta?: React.ReactNode;
  tone?: "sheet" | "gray" | "dots" | "paper";
  flat?: boolean;
  bodyClassName?: string;
}) {
  return (
    <section
      className={cn("win flex min-w-0 flex-col", flat && "win-flat", className)}
      {...props}
    >
      <header className="win-title shrink-0">
        <span>{title}</span>
        {meta !== undefined && <span className="opacity-70">{meta}</span>}
      </header>
      <div
        className={cn(
          "min-h-0 flex-1",
          tone === "gray" && "win-body-gray",
          tone === "dots" && "dots bg-sheet",
          tone === "paper" && "bg-paper",
          bodyClassName,
        )}
      >
        {children}
      </div>
    </section>
  );
}
