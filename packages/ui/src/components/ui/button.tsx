import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/*
 * 按钮：方角、1px 墨线。悬停时整块往左上抬 1px，身后露出一道粉色的错版影子；
 * 按下去影子消失，像一枚被按平的印章。
 */
const buttonVariants = cva(
  "cursor-pointer relative rounded-none border border-transparent bg-clip-padding text-xs font-medium tracking-[-0.005em] inline-flex items-center justify-center whitespace-nowrap shrink-0 outline-none select-none group/button transition-[transform,box-shadow,background-color,color] duration-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring aria-invalid:border-destructive disabled:pointer-events-none disabled:opacity-45 [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground border-rule hover:-translate-x-px hover:-translate-y-px hover:shadow-[3px_3px_0_0_var(--signal)] active:translate-x-0 active:translate-y-0 active:shadow-none aria-expanded:shadow-[3px_3px_0_0_var(--signal)]",
        outline:
          "border-rule bg-sheet text-foreground hover:bg-primary hover:text-primary-foreground aria-expanded:bg-primary aria-expanded:text-primary-foreground",
        secondary:
          "border-rule bg-secondary text-secondary-foreground hover:bg-win-2 aria-expanded:bg-win-2",
        ghost:
          "hover:bg-foreground/8 hover:text-foreground aria-expanded:bg-foreground/8",
        destructive:
          "border-rule bg-destructive text-white hover:-translate-x-px hover:-translate-y-px hover:shadow-[3px_3px_0_0_var(--rule)] active:translate-x-0 active:translate-y-0 active:shadow-none",
        go: "border-rule bg-go text-[#1e1e1e] hover:-translate-x-px hover:-translate-y-px hover:shadow-[3px_3px_0_0_var(--rule)] active:translate-x-0 active:translate-y-0 active:shadow-none",
        link: "text-foreground underline decoration-1 underline-offset-4 hover:decoration-2",
      },
      size: {
        default:
          "h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        xs: "h-6 gap-1 px-2 text-xs has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 px-2.5 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-9 gap-1.5 px-3 text-[13px] has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
        icon: "size-8",
        "icon-xs": "size-6 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-7",
        "icon-lg": "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
