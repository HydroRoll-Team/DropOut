import type * as React from "react";
import { useAppLikeContextMenu } from "@/lib/desktop-window";

/*
 * 舞台：界面铺满窗口，全部是固定像素，不跟着窗口缩放（照官方启动器）。
 * 系统显示缩放（125%、150%）由 webview 的 devicePixelRatio 处理，这里不用管。
 * 窗口变大时，多出来的地方给施工网格、抖色天空和留白，界面元素不变大；
 * 放不下的内容在自己那一栏里滚动。
 */
export function Stage({ children }: { children: React.ReactNode }) {
  useAppLikeContextMenu();

  return (
    <div className="fixed inset-0 overflow-hidden bg-background text-foreground">
      {children}
    </div>
  );
}
