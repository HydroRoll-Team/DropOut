import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const themes = ["dark", "light"] as const;

const visualScenarios = [
  { fixture: "empty", route: "/" },
  { fixture: "ready", route: "/" },
  { fixture: "downloading", route: "/" },
  { fixture: "running", route: "/" },
  { fixture: "error", route: "/" },
  { fixture: "migration", route: "/instances/import" },
] as const;

for (const theme of themes) {
  for (const { fixture, route } of visualScenarios) {
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

      if (fixture === "migration") {
        await expect(
          page.getByRole("heading", { name: "Import from another launcher" }),
        ).toBeVisible();
        await expect(page.getByText("MultiMC compatible")).toBeVisible();
      } else {
        await expect(
          page.getByRole("heading", { name: "MINECRAFT" }),
        ).toBeVisible();
      }

      if (fixture === "downloading") {
        await expect(page.getByText("Downloads")).toBeVisible();
      }

      await page.evaluate(() => document.fonts.ready);

      if (fixture !== "error") {
        expect(pageErrors).toEqual([]);
      }

      await expect(page).toHaveScreenshot(`${fixture}-${theme}.png`, {
        animations: "disabled",
        fullPage: true,
        maxDiffPixelRatio: 0.015,
        threshold: 0.25,
      });
    });
  }
}

const accessibleRoutes = [
  { fixture: "ready", route: "/", heading: "MINECRAFT" },
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

for (const theme of themes) {
  for (const { fixture, heading, route } of accessibleRoutes) {
    test(`${theme} fixture route ${route} has no serious accessibility violations`, async ({
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

      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
      const seriousViolations = results.violations.filter(
        ({ impact }) => impact === "serious" || impact === "critical",
      );

      expect(
        seriousViolations.map(({ id, impact, nodes }) => ({
          id,
          impact,
          nodes: nodes.map(({ any, html, target }) => ({
            html,
            target,
            checks: any.map(({ data, message }) => ({ data, message })),
          })),
        })),
      ).toEqual([]);
    });
  }
}

test("primary launcher flow is keyboard operable", async ({ page }) => {
  await page.goto("/?fixture=ready&theme=dark#/");
  await expect(page.getByRole("heading", { name: "MINECRAFT" })).toBeVisible();

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
