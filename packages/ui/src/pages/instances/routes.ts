import type { RouteObject } from "react-router";

const routes = {
  path: "/instances",
  children: [
    {
      index: true,
      lazy: async () => {
        const { InstancesPage } = await import("./index");
        return { Component: InstancesPage };
      },
    },
    {
      path: "create",
      lazy: async () => {
        const { default: CreateInstancePage } = await import("./create");
        return { Component: CreateInstancePage };
      },
    },
    {
      path: "import",
      lazy: async () => {
        const { ImportInstancesPage } = await import("./import");
        return { Component: ImportInstancesPage };
      },
    },
    {
      path: ":instanceId/mods",
      lazy: async () => {
        const { default: ModsPage } = await import("./mods");
        return { Component: ModsPage };
      },
    },
    {
      path: ":instanceId/browse",
      lazy: async () => {
        const { default: BrowsePage } = await import("./browse");
        return { Component: BrowsePage };
      },
    },
  ],
} satisfies RouteObject;

export default routes;
