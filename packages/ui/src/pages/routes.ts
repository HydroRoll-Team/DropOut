import { createHashRouter } from "react-router";
import instanceRoute from "./instances/routes";

const router = createHashRouter([
  {
    path: "/",
    lazy: async () => {
      const { IndexPage } = await import("./index");
      return { Component: IndexPage };
    },
    children: [
      {
        index: true,
        lazy: async () => {
          const { HomePage } = await import("./home");
          return { Component: HomePage };
        },
      },
      {
        path: "settings",
        lazy: async () => {
          const { SettingsPage } = await import("./settings");
          return { Component: SettingsPage };
        },
      },
      {
        path: "settings/editor",
        lazy: async () => {
          const { SettingsEditorPage } = await import("./settings-editor");
          return { Component: SettingsEditorPage };
        },
      },
      instanceRoute,
    ],
  },
]);

export default router;
