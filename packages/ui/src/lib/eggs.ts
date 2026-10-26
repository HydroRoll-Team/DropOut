/*
 * 藏在界面里的「第二层文本」。
 *
 * 表面上它们只是一串串 base64，当作纹理摆在页面边上；
 * 复制下来解码，才读得到真正的内容。解构主义的那一半：意义不在表面。
 *
 * - CIPHER_VERTICAL：左边那条竖排的字，套了六层 base64。
 * - DROPOUT_SOURCE：设置页的 [B.64]，解出来是 dropout 本身的代码。
 * - CREEPER_PNG：助手页的 [B.64]，是一张 16×16 的灰度 PNG。
 * - FOOTER_LINE：状态栏中间那一串。
 */

function encode(text: string, times = 1) {
  let value = text;
  for (let index = 0; index < times; index += 1) {
    value = btoa(value);
  }
  return value;
}

/** 解六次：Never dig straight down. */
export const CIPHER_VERTICAL = encode("Never dig straight down.", 6);

export const DROPOUT_SOURCE = encode(`def dropout(x, p=0.5, training=True):
    # Srivastava et al., 2014
    if not training:
        return x
    mask = (np.random.rand(*x.shape) > p) / (1.0 - p)
    return x * mask  # drop half. the rest get stronger.
`);

/** 16×16 灰度，一张苦力怕的脸。 */
export const CREEPER_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAAAAAA6mKC9AAAAs0lEQVR42hWPyxHEMAhDXYPXnySOY9fKkQJUgAqgAKpbPFwYMUJPySh0cRGDq0MSAMaiBgMEmoi9vgvuKGPcQILn+lU42Ouz5Vhm3RfDV3ZpYKKPkYcI0fpqKvFDVZBbnnSFeVKqOe48S6Q4jmDcT/vu35ju9GNB7c/ou3QGXQpQlu/3ljmbBlmCmeY6R0TcogEmUaGvoLby+hGUwAowtVUsCJJQSY2TukH0pCCSPYbR0PkHzdly1xaag5QAAAAASUVORK5CYII=";

export const FOOTER_LINE = encode(
  "DropOut, the next-generation Minecraft launcher.",
);

/** 把一长串切成固定宽度的行，用于 [B.64] 块。 */
export function chunk(text: string, width: number) {
  const lines: string[] = [];
  for (let index = 0; index < text.length; index += width) {
    lines.push(text.slice(index, index + width));
  }
  return lines;
}

export const KONAMI = [
  "ArrowUp",
  "ArrowUp",
  "ArrowDown",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ArrowLeft",
  "ArrowRight",
  "b",
  "a",
] as const;

let bannerPrinted = false;

/** 控制台里的招呼。 */
export function printConsoleBanner() {
  if (bannerPrinted || typeof console === "undefined") return;
  bannerPrinted = true;
  const art = [
    "█▀▄ █▀█ █▀█ █▀█   █▀█ █ █ ▀█▀",
    "█▄▀ █▀▄ █▄█ █▀▀   █▄█ █▄█  █ ",
  ].join("\n");
  console.log(
    `%c${art}%c\n\np = 0.5 — half of everything was dropped. the rest got stronger.\n↑ ↑ ↓ ↓ ← → ← → B A   ·   F3`,
    "font-family: monospace; font-size: 12px; line-height: 1.1; color: #f386a1",
    "font-family: monospace; font-size: 11px; color: inherit",
  );
}
