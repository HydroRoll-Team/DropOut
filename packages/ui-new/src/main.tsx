import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { createHashRouter, RouterProvider } from "react-router";
import { Toaster } from "./components/ui/sonner";
import { AssistantView } from "./pages/assistant-view";
import { HomeView } from "./pages/home-view";
import { IndexPage } from "./pages/index";
import { InstancesView } from "./pages/instances-view";
import { SettingsView } from "./pages/settings-view";
import { VersionsView } from "./pages/versions-view";

const router = createHashRouter([
  {
    path: "/",
    element: <IndexPage />,
    children: [
      {
        index: true,
        element: <HomeView />,
      },
      {
        path: "instances",
        element: <InstancesView />,
      },
      {
        path: "versions",
        element: <VersionsView />,
      },
      {
        path: "settings",
        element: <SettingsView />,
      },
      {
        path: "guide",
        element: <AssistantView />,
      },
    ],
  },
]);

const root = createRoot(document.getElementById("root") as HTMLElement);
root.render(
  <StrictMode>
    <RouterProvider router={router} />
    <Toaster />
  </StrictMode>,
);
