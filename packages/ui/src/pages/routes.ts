import { createHashRouter } from "react-router";
import { HomePage } from "./home";
import { IndexPage } from "./index";
import instanceRoute from "./instances/routes";
import { SettingsPage } from "./settings";

const router = createHashRouter([
  {
    path: "/",
    Component: IndexPage,
    children: [
      {
        index: true,
        Component: HomePage,
      },
      {
        path: "settings",
        Component: SettingsPage,
      },
      instanceRoute,
    ],
  },
]);

export default router;
