import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { createHashRouter, RouterProvider } from "react-router";
import { Toaster } from "./components/ui/sonner";
import { HomeView } from "./pages/home-view";
import { IndexPage } from "./pages/index";
import { InstancesView } from "./pages/instances-view";
import { SettingsPage } from "./pages/settings";

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
        path: "settings",
        element: <SettingsPage />,
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
