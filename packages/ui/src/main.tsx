import "@fontsource-variable/inter";
import "@fontsource-variable/inter-tight";
import "@fontsource-variable/jetbrains-mono";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import "./i18n";
import { RouterProvider } from "react-router";
import { Stage } from "./components/shell/stage";
import { Toaster } from "./components/ui/sonner";
import { LanguageProvider } from "./lib/i18n";
import router from "./pages/routes";

async function renderApp() {
  if (import.meta.env.DEV) {
    const { bootstrapLauncherFixture } = await import("./fixtures/bootstrap");
    bootstrapLauncherFixture();
  }

  const root = createRoot(document.getElementById("root") as HTMLElement);
  root.render(
    <StrictMode>
      <LanguageProvider>
        <Stage>
          <RouterProvider router={router} />
          <Toaster position="top-right" richColors />
        </Stage>
      </LanguageProvider>
    </StrictMode>,
  );
}

void renderApp();
