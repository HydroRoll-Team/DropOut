import { create } from "zustand/react";
import { detectJava, refreshJavaCatalog } from "@/client";
import type { JavaCatalog, JavaInstallation } from "@/types";

export interface JavaState {
  catalog: JavaCatalog | null;
  installations: JavaInstallation[] | null;

  refresh: () => Promise<void>;
  refreshInstallations: () => Promise<void>;
}

export const useJavaStore = create<JavaState>((set) => ({
  catalog: null,
  installations: null,

  refresh: async () => {
    const catalog = await refreshJavaCatalog();
    set({ catalog });
  },
  refreshInstallations: async () => {
    const installations = await detectJava();
    set({ installations });
  },
}));
