import type { RouteObject } from "react-router";
import CreateInstancePage from "./create";
import { InstancesPage } from "./index";

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
  ],
} satisfies RouteObject;

export default routes;
