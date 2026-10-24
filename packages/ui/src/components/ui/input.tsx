import { Input as InputPrimitive } from "@base-ui/react/input";
import type * as React from "react";

import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "border-input bg-sheet focus-visible:shadow-[3px_3px_0_0_var(--signal)] focus-visible:outline-none aria-invalid:border-destructive aria-invalid:shadow-[3px_3px_0_0_var(--fault)] disabled:bg-muted h-8 rounded-none border px-2.5 py-1 text-xs transition-shadow file:h-6 file:text-xs file:font-medium md:text-xs file:text-foreground placeholder:text-muted-foreground w-full min-w-0 outline-none file:inline-flex file:border-0 file:bg-transparent disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
