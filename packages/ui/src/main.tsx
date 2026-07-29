import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/inter";
import "./index.css";
import "./i18n";
import { RouterProvider } from "react-router";
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
        <RouterProvider router={router} />
        <Toaster position="top-right" richColors />
      </LanguageProvider>
    </StrictMode>,
  );
}

void renderApp();
