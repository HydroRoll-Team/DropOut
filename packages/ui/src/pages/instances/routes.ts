import type { RouteObject } from "react-router";
import BrowsePage from "./browse";
import CreateInstancePage from "./create";
import { InstancesPage } from "./index";
import ModsPage from "./mods";

const routes = {
  path: "/instances",
  children: [
    {
      index: true,
      Component: InstancesPage,
    },
    {
      path: "create",
      Component: CreateInstancePage,
    },
    {
      path: ":instanceId/mods",
      Component: ModsPage,
    },
    {
      path: ":instanceId/browse",
      Component: BrowsePage,
    },
  ],
} satisfies RouteObject;

export default routes;
