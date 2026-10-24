"use client";

import { Switch as SwitchPrimitive } from "@base-ui/react/switch";

import { cn } from "@/lib/utils";

/* 方形拨杆：关着是空槽，开了整条变绿，黑色滑块推到右端 */
function Switch({
  className,
  size = "default",
  ...props
}: SwitchPrimitive.Root.Props & {
  size?: "sm" | "default";
}) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      className={cn(
        "border-rule bg-sheet data-checked:bg-go focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring aria-invalid:border-destructive peer group/switch relative inline-flex shrink-0 cursor-pointer items-center rounded-none border p-px transition-colors outline-none after:absolute after:-inset-x-3 after:-inset-y-2 data-[size=default]:h-[18px] data-[size=default]:w-[34px] data-[size=sm]:h-[14px] data-[size=sm]:w-[26px] data-disabled:cursor-not-allowed data-disabled:opacity-45",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="bg-ink pointer-events-none block rounded-none transition-transform duration-100 group-data-[size=default]/switch:size-[14px] group-data-[size=sm]/switch:size-[10px] data-unchecked:translate-x-0 group-data-[size=default]/switch:data-checked:translate-x-[16px] group-data-[size=sm]/switch:data-checked:translate-x-[12px] dark:group-data-checked/switch:bg-[#1e1e1e]"
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
