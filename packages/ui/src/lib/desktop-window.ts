import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useState } from "react";

/*
 * 无边框窗口的那一套：自绘标题栏的拖动、最小化 / 最大化 / 关闭、右键菜单。
 * 窗口随便拉，不锁比例，界面也不跟着缩放（系统显示缩放由 webview 自己处理）。
 * 不在 Tauri 里（浏览器预览、测试夹具）时全部什么都不做。
 */

export function isDesktop() {
  try {
    return isTauri();
  } catch {
    return false;
  }
}

async function attempt(action: () => Promise<unknown>) {
  if (!isDesktop()) return;
  try {
    await action();
  } catch (error) {
    console.warn("[window]", error);
  }
}

export const windowActions = {
  minimize: () => attempt(() => getCurrentWindow().minimize()),
  toggleMaximize: () => attempt(() => getCurrentWindow().toggleMaximize()),
  close: () => attempt(() => getCurrentWindow().close()),
};

const INTERACTIVE =
  "button, a, input, textarea, select, [role='button'], [role='menuitem'], [role='tab'], [data-no-drag]";

/** 标题栏空白处：按住拖动窗口，双击最大化 / 还原 */
export function onTitlebarMouseDown(event: React.MouseEvent) {
  if (!isDesktop() || event.button !== 0) return;
  if ((event.target as HTMLElement).closest(INTERACTIVE)) return;
  event.preventDefault();
  if (event.detail === 2) {
    void windowActions.toggleMaximize();
    return;
  }
  void attempt(() => getCurrentWindow().startDragging());
}

/** 窗口是否最大化（给最大化按钮换图标用） */
export function useMaximized() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!isDesktop()) return;
    let unlisten: (() => void) | undefined;
    let disposed = false;
    const sync = () =>
      attempt(async () => setMaximized(await getCurrentWindow().isMaximized()));
    void sync();
    void attempt(async () => {
      const off = await getCurrentWindow().onResized(() => void sync());
      if (disposed) off();
      else unlisten = off;
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  return maximized;
}

/* 不像网页：右键不弹浏览器菜单（输入框里照常；按住 Shift 右键留给开发者） */
export function useAppLikeContextMenu() {
  useEffect(() => {
    const onContextMenu = (event: MouseEvent) => {
      if (event.shiftKey && import.meta.env.DEV) return;
      const target = event.target as HTMLElement | null;
      if (
        target?.closest(
          "input, textarea, [contenteditable='true'], .monaco-editor",
        )
      ) {
        return;
      }
      event.preventDefault();
    };
    window.addEventListener("contextmenu", onContextMenu);
    return () => window.removeEventListener("contextmenu", onContextMenu);
  }, []);
}
