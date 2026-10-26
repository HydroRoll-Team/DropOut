import { ArrowLeftIcon } from "lucide-react";
import type * as React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/*
 * 页头：白标签 + 超大标题，背后压一个空心的章节号。
 * 二级页面左边多一个返回按钮。
 */
export function PageHeader({
  index,
  eyebrow,
  title,
  onBack,
  backLabel,
  actions,
  className,
}: {
  index?: string;
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  onBack?: () => void;
  backLabel?: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "relative flex shrink-0 items-end justify-between gap-3",
        className,
      )}
    >
      {index && (
        <span
          aria-hidden="true"
          className="type-display glyph-dropped pointer-events-none absolute -top-10 left-[min(671px,calc(100%-160px))] -translate-x-full text-[170px] leading-none opacity-50 select-none"
        >
          {index}
        </span>
      )}
      <div className="relative flex min-w-0 items-end gap-3">
        {onBack && (
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="mb-1.5"
            aria-label={backLabel}
            onClick={onBack}
          >
            <ArrowLeftIcon />
          </Button>
        )}
        <div className="min-w-0">
          {eyebrow && <p className="tag max-w-full text-[13px]">{eyebrow}</p>}
          <h1 className="type-display mt-2.5 truncate pb-1 text-[45px]">
            {title}
          </h1>
        </div>
      </div>
      {actions && (
        <div className="relative flex shrink-0 items-center gap-1.5 pb-1.5">
          {actions}
        </div>
      )}
    </header>
  );
}
