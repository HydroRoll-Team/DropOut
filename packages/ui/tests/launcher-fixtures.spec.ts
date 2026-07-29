import { expect, type Page, test } from "@playwright/test";

const themes = ["dark", "light"] as const;
const screenshotTolerance = {
  animations: "disabled",
  fullPage: true,
  maxDiffPixelRatio: 0.005,
  threshold: 0.2,
} as const;

const visualScenarios = [
  { fixture: "no-account", route: "/", heading: "Sign in to continue" },
  { fixture: "no-instance", route: "/", heading: "Choose what to play" },
  { fixture: "not-ready", route: "/", heading: "Compatible Java required" },
  { fixture: "ready", route: "/", heading: "Copper Valley is ready" },
  { fixture: "downloading", route: "/", heading: "Preparing Copper Valley" },
  { fixture: "launching", route: "/", heading: "Starting Copper Valley" },
  { fixture: "running", route: "/", heading: "Copper Valley is running" },
  { fixture: "stopped", route: "/", heading: "Copper Valley stopped" },
  { fixture: "failed", route: "/", heading: "Copper Valley needs recovery" },
  { fixture: "error", route: "/", heading: "Readiness check interrupted" },
  {
    fixture: "migration",
    route: "/instances/import",
    heading: "Import from another launcher",
  },
] as const;

for (const theme of themes) {
  for (const { fixture, heading, route } of visualScenarios) {
    test(`${fixture} launcher fixture is deterministic in ${theme} mode`, async ({
      page,
    }) => {
      const pageErrors: string[] = [];
      page.on("pageerror", (error) => pageErrors.push(error.message));

      await page.goto(`/?fixture=${fixture}&theme=${theme}#${route}`);
      await expect(page.locator("html")).toHaveAttribute(
        "data-launcher-fixture",
        fixture,
      );
      await expect(page.locator("html")).toHaveAttribute(
        "data-launcher-fixture-theme",
        theme,
      );

      await expect(page.getByRole("heading", { name: heading })).toBeVisible();

      if (fixture === "migration") {
        await expect(page.getByText("MultiMC compatible")).toBeVisible();
      }

      if (fixture === "downloading") {
        await expect(page.getByText("Downloads")).toBeVisible();
      }

      await page.evaluate(() => document.fonts.ready);

      expect(pageErrors).toEqual([]);

      await expect(page).toHaveScreenshot(
        `${fixture}-${theme}.png`,
        screenshotTolerance,
      );
    });
  }
}

const accessibleRoutes = [
  { fixture: "ready", route: "/", heading: "Copper Valley is ready" },
  { fixture: "ready", route: "/instances", heading: "Instances" },
  {
    fixture: "ready",
    route: "/instances/create",
    heading: "Create Instance",
  },
  {
    fixture: "migration",
    route: "/instances/import",
    heading: "Import from another launcher",
  },
  { fixture: "ready", route: "/settings", heading: "Settings" },
  {
    fixture: "ready",
    route: "/settings/editor",
    heading: "Edit Configuration",
  },
] as const;

async function expectAccessibilitySmoke(page: Page) {
  await expect(page.locator("html")).toHaveAttribute("lang", /^[a-z]{2}/i);

  const duplicateIds = await page.locator("[id]").evaluateAll((elements) => {
    const counts = new Map<string, number>();
    for (const element of elements) {
      counts.set(element.id, (counts.get(element.id) ?? 0) + 1);
    }
    return [...counts.entries()]
      .filter(([, count]) => count > 1)
      .map(([id]) => id);
  });
  expect(duplicateIds).toEqual([]);

  const images = page.locator("img");
  for (let index = 0; index < (await images.count()); index += 1) {
    await expect(images.nth(index)).toHaveAttribute("alt");
  }

  const interactiveControls = page.locator(
    'button, a[href], input:not([type="hidden"]), select, textarea, [role="button"], [role="link"], [role="tab"], [role="checkbox"], [role="radio"], [role="switch"]',
  );
  for (let index = 0; index < (await interactiveControls.count()); index += 1) {
    const control = interactiveControls.nth(index);
    const isHiddenFromAccessibilityTree = await control.evaluate(
      (element) =>
        element.matches('[aria-hidden="true"]') ||
        element.closest('[aria-hidden="true"], [inert]') !== null,
    );
    if ((await control.isVisible()) && !isHiddenFromAccessibilityTree) {
      await expect(control).toHaveAccessibleName(/\S+/);
    }
  }
}

for (const theme of themes) {
  for (const { fixture, heading, route } of accessibleRoutes) {
    test(`${theme} fixture route ${route} passes accessibility smoke checks`, async ({
      page,
    }) => {
      await page.goto(`/?fixture=${fixture}&theme=${theme}#${route}`);
      await expect(page.locator("html")).toHaveAttribute(
        "data-launcher-fixture",
        fixture,
      );
      await expect(page.locator("html")).toHaveClass(
        new RegExp(`(^|\\s)${theme}(\\s|$)`),
      );
      await expect(page.getByRole("heading", { name: heading })).toBeVisible();
      await page.evaluate(async () => {
        await document.fonts.ready;
        const finiteAnimations = document
          .getAnimations()
          .filter((animation) => {
            const iterations = animation.effect?.getTiming().iterations;
            return iterations !== Number.POSITIVE_INFINITY;
          });
        await Promise.all(
          finiteAnimations.map((animation) =>
            animation.finished.catch(() => undefined),
          ),
        );
      });

      await expectAccessibilitySmoke(page);
    });
  }
}

test("primary launcher flow is keyboard operable", async ({ page }) => {
  await page.goto("/?fixture=ready&theme=dark#/");
  await expect(
    page.getByRole("heading", { name: "Copper Valley is ready" }),
  ).toBeVisible();

  const tabTo = async (target: ReturnType<typeof page.getByRole>) => {
    for (let index = 0; index < 10; index += 1) {
      if (
        await target.evaluate((element) => element === document.activeElement)
      ) {
        return;
      }
      await page.keyboard.press("Tab");
    }
    await expect(target).toBeFocused();
  };

  await tabTo(page.getByRole("button", { name: "Instances" }));
  await page.keyboard.press("Enter");

  await expect(page.getByRole("heading", { name: "Instances" })).toBeVisible();
  const createButton = page.getByRole("button", { name: "Create Instance" });
  await tabTo(createButton);
  await page.keyboard.press("Enter");

  await expect(
    page.getByRole("heading", { name: "Create Instance" }),
  ).toBeVisible();
  const backButton = page.getByRole("button", { name: "Back" });
  await tabTo(backButton);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Instances" })).toBeVisible();
});

test("home primary action follows launcher recovery state", async ({
  page,
}) => {
  await page.goto("/?fixture=no-account&theme=dark#/");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Login" })).toBeVisible();

  await page.goto("/?fixture=no-instance&theme=dark#/");
  await page.getByRole("button", { name: "Create or import" }).click();
  await expect(page.getByRole("heading", { name: "Instances" })).toBeVisible();

  await page.goto("/?fixture=not-ready&theme=dark#/");
  await page.getByRole("button", { name: "Repair Java" }).click();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
});

test("home launch and stop actions follow the game lifecycle", async ({
  page,
}) => {
  await page.goto("/?fixture=ready&theme=dark#/");
  await page.getByRole("button", { name: "Launch", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Copper Valley is running" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Stop game" }).click();
  await expect(
    page.getByRole("heading", { name: "Copper Valley stopped" }),
  ).toBeVisible();
});

test("download and failure states expose actionable diagnostics", async ({
  page,
}) => {
  await page.goto("/?fixture=downloading&theme=dark#/");
  await expect(
    page.getByRole("progressbar", { name: "Download progress" }),
  ).toHaveAttribute("aria-valuenow", "65");
  await page.getByRole("button", { name: "Track download" }).click();
  await expect(page.locator("#download-monitor")).toBeFocused();

  await page.goto("/?fixture=failed&theme=dark#/");
  await page.getByRole("button", { name: "Inspect failure" }).click();
  await expect(page.getByText("Process exited with code 1")).toBeVisible();
  await expect(
    page.locator('section[aria-labelledby="activity-title"]'),
  ).toBeFocused();
});

test("Java runtime download progress stays bounded and accessible", async ({
  page,
}) => {
  await page.goto("/?fixture=java-download-progress&theme=dark#/");

  const monitor = page.locator("#download-monitor");
  await expect(monitor.getByText("Java runtime")).toBeVisible();
  await expect(monitor.getByText("100%", { exact: true })).toBeVisible();
  await expect(
    monitor.getByRole("progressbar", { name: "Download progress" }),
  ).toHaveAttribute("aria-valuenow", "100");
  await expect(monitor).toContainText("1.5 GB / 2.0 GB");

  await page.getByRole("button", { name: "Track download" }).click();
  await expect(monitor).toBeFocused();
});

test("home supports Chinese and reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/?fixture=ready&theme=dark&locale=zh-CN#/");

  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  await expect(
    page.getByRole("heading", { name: "Copper Valley 已就绪" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "启动", exact: true }),
  ).toBeVisible();
  await expectAccessibilitySmoke(page);
});
