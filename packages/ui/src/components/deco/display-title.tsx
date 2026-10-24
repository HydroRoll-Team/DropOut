import type * as React from "react";
import { cn } from "@/lib/utils";

function hash(text: string) {
  let value = 2166136261;
  for (const char of text) {
    value ^= char.codePointAt(0) ?? 0;
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

/** 选一个要「丢掉」的字：不选第一个字，不选空格和标点；同一句话总是丢同一个。 */
export function droppedGlyphIndex(text: string) {
  const glyphs = Array.from(text);
  const candidates = glyphs
    .map((glyph, index) => ({ glyph, index }))
    .filter(({ glyph, index }) => index > 0 && /\p{L}/u.test(glyph))
    .map(({ index }) => index);
  if (glyphs.length < 4 || candidates.length === 0) return -1;
  return candidates[hash(text) % candidates.length] ?? -1;
}

/*
 * 超大标题。一个字被丢掉，只剩轮廓（dropout）；
 * 除第一行外，后面的行整体缩进，像被推开了半格。
 * 读屏和测试读到的仍是完整的一句话。
 */
export function DisplayTitle({
  as: Tag = "h1",
  text,
  drop = true,
  stagger = true,
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement> & {
  ref?: React.Ref<HTMLHeadingElement>;
  as?: "h1" | "h2" | "h3" | "p";
  text: string;
  drop?: boolean;
  stagger?: boolean;
}) {
  const glyphs = Array.from(text);
  const dropped = drop ? droppedGlyphIndex(text) : -1;

  return (
    <Tag
      className={cn(
        "type-display text-balance",
        stagger && "-indent-[0.9em] pl-[0.9em]",
        className,
      )}
      {...props}
    >
      {dropped < 0
        ? text
        : [
            glyphs.slice(0, dropped).join(""),
            <span key="dropped" className="glyph-dropped" data-dropped="">
              {glyphs[dropped]}
            </span>,
            glyphs.slice(dropped + 1).join(""),
          ]}
    </Tag>
  );
}
