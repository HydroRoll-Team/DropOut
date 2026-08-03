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
  {
    fixture: "memory-pressure",
    route: "/",
    heading: "Fix the memory allocation",
  },
  { fixture: "ready", route: "/", heading: "Copper Valley is ready" },
  { fixture: "downloading", route: "/", heading: "Preparing Copper Valley" },
  { fixture: "launching", route: "/", heading: "Starting Copper Valley" },
  { fixture: "running", route: "/", heading: "Copper Valley is running" },
  { fixture: "stopped", route: "/", heading: "Copper Valley stopped" },
  { fixture: "failed", route: "/", heading: "Copper Valley needs recovery" },
  { fixture: "error", route: "/", heading: "Readiness check interrupted" },
  {
    fixture: "instances-20",
    route: "/instances",
    heading: "Instance library",
  },
  {
    fixture: "instances-grid",
    route: "/instances",
    heading: "Instance library",
  },
  {
    fixture: "instances-empty",
    route: "/instances",
    heading: "Instance library",
  },
  {
    fixture: "instances-error",
    route: "/instances",
    heading: "Instance library",
  },
  {
    fixture: "migration",
    route: "/instances/import",
    heading: "Import from another launcher",
  },
  {
    fixture: "config-editor",
    route: "/settings/editor",
    heading: "Configuration studio",
  },
  {
    fixture: "assistant-ready",
    route: "/assistant",
    heading: "Diagnostic assistant",
  },
  {
    fixture: "assistant-offline",
    route: "/assistant",
    heading: "Diagnostic assistant",
  },
  {
    fixture: "memory-settings",
    route: "/settings",
    heading: "Settings",
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
        await expect(page.getByText("Prism / MultiMC")).toBeVisible();
      }

      if (fixture === "downloading") {
        await expect(page.getByText("Downloads")).toBeVisible();
      }

      if (fixture === "assistant-ready") {
        await expect(page.getByText("Ready", { exact: true })).toBeVisible();
        await expect(
          page.getByRole("heading", {
            name: "Start from evidence, not guesses",
          }),
        ).toBeInViewport();
        await expect(
          page.getByText(/Could not initialize Fabric loader/),
        ).toBeVisible();
      }

      if (fixture === "assistant-offline") {
        await expect(
          page.getByText("Unavailable", { exact: true }),
        ).toBeVisible();
      }

      if (fixture === "memory-settings") {
        const memoryPanel = page.getByTestId("memory-allocation-panel");
        await expect(memoryPanel).toBeVisible();
        await memoryPanel.scrollIntoViewIfNeeded();
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
  {
    fixture: "instances-20",
    route: "/instances",
    heading: "Instance library",
  },
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
    fixture: "config-editor",
    route: "/settings/editor",
    heading: "Configuration studio",
  },
  {
    fixture: "assistant-ready",
    route: "/assistant",
    heading: "Diagnostic assistant",
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

  await expect(
    page.getByRole("heading", { name: "Instance library" }),
  ).toBeVisible();
  const createButton = page.getByRole("button", { name: "Create Instance" });
  await tabTo(createButton);
  await page.keyboard.press("Enter");

  await expect(
    page.getByRole("heading", { name: "Create Instance" }),
  ).toBeVisible();
  const backButton = page.getByRole("button", { name: "Back" });
  await tabTo(backButton);
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { name: "Instance library" }),
  ).toBeVisible();
});

test("settings reports the current launcher version", async ({ page }) => {
  await page.addInitScript(() => {
    const existingInternals = Reflect.get(window, "__TAURI_INTERNALS__");
    Object.assign(window, { isTauri: true });
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      writable: true,
      value: {
        ...(typeof existingInternals === "object" && existingInternals !== null
          ? existingInternals
          : {}),
        invoke: async (command: string) => {
          if (command === "plugin:app|version") return "9.8.7-test";
          throw new Error(`Unexpected Tauri command: ${command}`);
        },
      },
    });
  });
  await page.goto("/?fixture=ready&theme=dark#/settings");
  await page.getByRole("tab", { name: "Advanced" }).click();

  await expect(page.getByText("Current version")).toBeVisible();
  await expect(page.getByText("v9.8.7-test", { exact: true })).toBeVisible();
});

test("settings avoids version errors outside the Tauri runtime", async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await page.goto("/?fixture=ready&theme=dark#/settings");
  await page.getByRole("tab", { name: "Advanced" }).click();

  await expect(page.getByText("Current version")).toBeVisible();
  await expect(page.getByText("—", { exact: true })).toBeVisible();
  expect(consoleErrors).not.toContainEqual(
    expect.stringContaining("Failed to read app version"),
  );
});

test("system tray lifecycle settings are progressive and save immediately", async ({
  page,
}, testInfo) => {
  await page.goto("/?fixture=ready&theme=dark#/settings");
  await page.getByRole("tab", { name: "Advanced" }).click();

  const enableTray = page.getByRole("switch", {
    name: "Enable system tray",
  });
  const closeToTray = page.getByRole("switch", {
    name: "Close window to tray",
  });
  const startMinimized = page.getByRole("switch", {
    name: "Start minimized to tray",
  });
  const minimizeAfterLaunch = page.getByRole("switch", {
    name: "Minimize after launching Minecraft",
  });

  await expect(enableTray).not.toBeChecked();
  await expect(closeToTray).toBeDisabled();
  await expect(startMinimized).toBeDisabled();
  await expect(minimizeAfterLaunch).toBeDisabled();

  await enableTray.click();

  await expect(enableTray).toBeChecked();
  await expect(closeToTray).toBeEnabled();
  await expect(closeToTray).toBeChecked();
  await expect(startMinimized).toBeEnabled();
  await expect(minimizeAfterLaunch).toBeEnabled();
  await expect(minimizeAfterLaunch).toBeChecked();

  const checkUpdates = page.getByRole("button", { name: "Check for Updates" });
  await checkUpdates.scrollIntoViewIfNeeded();
  await expect(checkUpdates).toBeVisible();
  await expect
    .poll(() =>
      page
        .locator("main")
        .evaluate((element) => [element.scrollLeft, element.scrollTop]),
    )
    .toEqual([0, 0]);
  if (testInfo.project.name === "minimum-window") {
    await expect
      .poll(() =>
        page
          .locator('[data-slot="scroll-area-viewport"]')
          .evaluate((element) => element.scrollTop),
      )
      .toBeGreaterThan(0);
  }
});

async function triggerTrayQuickLaunch(page: Page) {
  await page.evaluate(async () => {
    const fixtureModule = "/src/fixtures/launcher.ts";
    const fixture = await import(fixtureModule);
    fixture.resetFixtureCommandLog();
    fixture.emitFixtureEvent("tray-quick-launch", {
      instanceId: "fixture-fabric-1211",
      instanceName: "Copper Valley",
      versionId: "1.21.1",
    });
  });
}

async function fixtureCommandLog(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const fixtureModule = "/src/fixtures/launcher.ts";
    const fixture = await import(fixtureModule);
    return fixture.getFixtureCommandLog();
  });
}

const trayRecoveryScenarios = [
  {
    fixture: "not-ready",
    heading: "Compatible Java required",
    requiredCommands: ["get_launch_readiness", "show_main_window"],
  },
  {
    fixture: "no-account",
    heading: "Sign in to continue",
    requiredCommands: ["show_main_window"],
  },
  {
    fixture: "memory-invalid",
    heading: "Fix the memory allocation",
    requiredCommands: ["get_launch_readiness", "show_main_window"],
  },
  {
    fixture: "launching",
    heading: "Starting Copper Valley",
    requiredCommands: ["show_main_window"],
  },
] as const;

for (const { fixture, heading, requiredCommands } of trayRecoveryScenarios) {
  test(`tray quick launch opens recovery for ${fixture}`, async ({ page }) => {
    await page.goto(`/?fixture=${fixture}&theme=dark#/`);
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();

    await triggerTrayQuickLaunch(page);
    await expect
      .poll(() => fixtureCommandLog(page))
      .toEqual(expect.arrayContaining([...requiredCommands]));
    expect(await fixtureCommandLog(page)).not.toContain("start_game");
  });
}

test("tray recovery returns to Home before revealing readiness guidance", async ({
  page,
}) => {
  await page.goto("/?fixture=not-ready&theme=dark#/settings");
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();

  await triggerTrayQuickLaunch(page);

  await expect(
    page.getByRole("heading", { name: "Compatible Java required" }),
  ).toBeVisible();
  expect(await fixtureCommandLog(page)).not.toContain("start_game");
});

test("tray quick launch installs missing files instead of starting an incomplete instance", async ({
  page,
}) => {
  await page.goto("/?fixture=files-missing&theme=dark#/");
  await expect(
    page.getByRole("heading", { name: "Game files need attention" }),
  ).toBeVisible();

  await triggerTrayQuickLaunch(page);
  await expect
    .poll(() => fixtureCommandLog(page))
    .toEqual(
      expect.arrayContaining([
        "get_launch_readiness",
        "install_version",
        "show_main_window",
      ]),
    );
  expect(await fixtureCommandLog(page)).not.toContain("start_game");
});

test("tray quick launch reveals an active download without starting duplicate work", async ({
  page,
}) => {
  await page.goto("/?fixture=downloading&theme=dark#/");
  await expect(
    page.getByRole("heading", { name: "Preparing Copper Valley" }),
  ).toBeVisible();

  await triggerTrayQuickLaunch(page);
  await expect
    .poll(() => fixtureCommandLog(page))
    .toContain("show_main_window");
  const commands = await fixtureCommandLog(page);
  expect(commands).not.toContain("install_version");
  expect(commands).not.toContain("start_game");
});

test("tray quick launch starts a fully ready instance", async ({ page }) => {
  await page.goto("/?fixture=ready&theme=dark#/");
  await expect(
    page.getByRole("heading", { name: "Copper Valley is ready" }),
  ).toBeVisible();

  await triggerTrayQuickLaunch(page);
  await expect
    .poll(() => fixtureCommandLog(page))
    .toEqual(
      expect.arrayContaining([
        "set_active_instance",
        "get_launch_readiness",
        "start_game",
      ]),
    );
});

test("home primary action follows launcher recovery state", async ({
  page,
}) => {
  await page.goto("/?fixture=no-account&theme=dark#/");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Login" })).toBeVisible();

  await page.goto("/?fixture=no-instance&theme=dark#/");
  await page.getByRole("button", { name: "Create or import" }).click();
  await expect(
    page.getByRole("heading", { name: "Instance library" }),
  ).toBeVisible();

  await page.goto("/?fixture=not-ready&theme=dark#/");
  await page.getByRole("button", { name: "Repair Java" }).click();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
});

test("critical memory pressure blocks launch with a repair action", async ({
  page,
}) => {
  await page.goto("/?fixture=memory-pressure&theme=dark#/");

  await expect(
    page.getByRole("heading", { name: "Fix the memory allocation" }),
  ).toBeVisible();
  await expect(page.getByText("6 GB max · Instance")).toBeVisible();
  await page.getByRole("button", { name: "Fix memory" }).click();
  await expect(page.getByTestId("memory-allocation-panel")).toBeVisible();
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

test("failed launch can open a consent-gated assistant diagnosis", async ({
  page,
}) => {
  await page.goto("/?fixture=failed&theme=dark#/");
  await page.getByRole("button", { name: "Ask diagnostic assistant" }).click();

  await expect(
    page.getByRole("heading", { name: "Diagnostic assistant" }),
  ).toBeVisible();
  await expect(page.getByText("Ready", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("switch", { name: "Attach to next request" }),
  ).not.toBeChecked();
  await expect(
    page.getByRole("textbox", { name: "Message diagnostic assistant" }),
  ).toHaveValue(/Analyze the last failed launch/);
  await expect(
    page.getByText(/Could not initialize Fabric loader/),
  ).toBeVisible();

  await page.getByRole("switch", { name: "Attach to next request" }).click();
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(
    page.getByText(
      /The attached evidence points to a Fabric mod compatibility conflict/,
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("switch", { name: "Attach to next request" }),
  ).not.toBeChecked();
});

test("assistant keeps session evidence detached by default", async ({
  page,
}) => {
  await page.goto("/?fixture=assistant-ready&theme=dark#/assistant");
  await expect(page.getByText("Ready", { exact: true })).toBeVisible();
  await expect(page.getByTestId("assistant-transcript")).not.toHaveAttribute(
    "aria-live",
  );

  const attachment = page.getByRole("switch", {
    name: "Attach to next request",
  });
  await expect(attachment).not.toBeChecked();

  const composer = page.getByRole("textbox", {
    name: "Message diagnostic assistant",
  });
  await composer.fill("What should I check first?");
  await page.getByRole("button", { name: "Send", exact: true }).click();

  await expect(
    page.getByText(
      "Start by checking the loader and mod versions for the active instance.",
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("status").filter({ hasText: "Assistant response complete" }),
  ).toBeAttached();
  await expect(attachment).not.toBeChecked();
});

test("assistant reports a redacted-evidence clipboard failure", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: () => Promise.reject(new Error("clipboard denied")),
      },
    });
  });
  await page.goto("/?fixture=assistant-ready&theme=dark#/assistant");
  await expect(page.getByText("Ready", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Copy redacted evidence" }).click();
  await expect(
    page.getByText("Could not copy redacted evidence"),
  ).toBeVisible();
});

test("clearing a streaming answer cannot leak stale chunks into the next request", async ({
  page,
}) => {
  await page.goto("/?fixture=assistant-race&theme=dark#/assistant");
  await expect(page.getByText("Ready", { exact: true })).toBeVisible();

  const composer = page.getByRole("textbox", {
    name: "Message diagnostic assistant",
  });
  await composer.fill("first request");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await page
    .getByRole("button", { name: "Clear conversation", exact: true })
    .click();

  await composer.fill("second request");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByText("Fixture answer: second request")).toBeVisible();
  await page.waitForTimeout(650);
  await expect(page.getByText("Fixture answer: first request")).toHaveCount(0);
});

test("opt-in system speech reads only a completed assistant response", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const spoken: string[] = [];
    Object.defineProperty(window, "__dropoutSpokenTexts", { value: spoken });
    Object.defineProperty(window, "SpeechSynthesisUtterance", {
      value: class {
        text: string;
        lang = "";

        constructor(text: string) {
          this.text = text;
        }
      },
    });
    Object.defineProperty(window, "speechSynthesis", {
      value: {
        cancel: () => undefined,
        speak: (utterance: { text: string }) => spoken.push(utterance.text),
      },
    });
  });
  await page.goto("/?fixture=assistant-tts&theme=dark#/assistant");
  await expect(page.getByText("Ready", { exact: true })).toBeVisible();

  const composer = page.getByRole("textbox", {
    name: "Message diagnostic assistant",
  });
  await composer.fill("Explain the current objective");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(
    page.getByText(
      "Start by checking the loader and mod versions for the active instance.",
    ),
  ).toBeVisible();

  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { __dropoutSpokenTexts: string[] })
            .__dropoutSpokenTexts,
      ),
    )
    .toEqual([
      "Start by checking the loader and mod versions for the active instance.",
    ]);
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

test("instance library scales from empty to one active workspace", async ({
  page,
}) => {
  await page.goto("/?fixture=instances-empty&theme=dark#/instances");
  await expect(
    page.getByRole("heading", { name: "Build your first environment" }),
  ).toBeVisible();
  await expect(
    page
      .locator('section[aria-label="Instance library"]')
      .getByRole("button", { name: "Create Instance" }),
  ).toBeVisible();

  await page.goto("/?fixture=instances-single&theme=dark#/instances");
  await expect(page.locator("#instance-detail-title")).toHaveText(
    "Copper Valley",
  );
  await expect(page.getByText("12", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Launch active instance" }),
  ).toBeVisible();

  await page
    .getByRole("button", { name: "More actions for Copper Valley" })
    .click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await expect(
    page.getByText(/Export the instance first if you may need its saves/),
  ).toBeVisible();
});

test("large instance library supports search, sorting, views, and active selection", async ({
  page,
}) => {
  await page.goto("/?fixture=instances-100&theme=dark#/instances");
  await expect(page.getByText("100 / 100 shown")).toBeVisible({
    timeout: 15_000,
  });

  const search = page.getByRole("searchbox", { name: "Search instances" });
  await search.fill("Redstone Archive 097");
  await expect(page.getByText("1 / 100 shown")).toBeVisible();
  await page
    .getByRole("button", {
      name: "Use Redstone Archive 097 as the active instance",
    })
    .click();
  await expect(page.locator("#instance-detail-title")).toHaveText(
    "Redstone Archive 097",
  );

  await search.fill("");
  await page.getByRole("combobox", { name: "Sort instances" }).click();
  await page.getByRole("option", { name: "Name", exact: true }).click();
  await expect(
    page.getByTestId("instance-library-item").first(),
  ).toHaveAttribute("data-instance-name", "Alpine 006");

  await page.getByRole("button", { name: "Grid view" }).click();
  await expect(page.getByRole("button", { name: "Grid view" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByRole("button", { name: "List view" }).click();

  await page.getByRole("button", { name: "Overview" }).click();
  await expect(
    page.getByRole("heading", { name: "Redstone Archive 097 is ready" }),
  ).toBeVisible();
});

test("instance library exposes deterministic loading and repair states", async ({
  page,
}) => {
  await page.goto("/?fixture=instances-loading&theme=dark#/instances");
  await expect(
    page.getByRole("heading", { name: "Reading the instance index" }),
  ).toBeVisible();

  await page.goto("/?fixture=instances-error&theme=dark#/instances");
  await expect(
    page.getByRole("heading", { name: "The instance index needs repair" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Repair Index" }),
  ).toBeVisible();
});

test("migration manifest resolves conflicts, reports copied content, and supports undo", async ({
  page,
}) => {
  await page.goto("/?fixture=migration&theme=dark#/instances/import");
  await expect(
    page.getByRole("button", { name: "Choose archive" }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Prism \/ MultiMC/ }).click();

  await expect(
    page.getByRole("heading", { name: "Choose environments to move" }),
  ).toBeVisible();
  await page.getByRole("checkbox").first().check();
  await page.getByRole("checkbox").nth(1).check();
  await page.getByRole("button", { name: "Review 2 selected" }).click();

  await expect(
    page.getByRole("heading", { name: "Review the move manifest" }),
  ).toBeVisible();
  await expect(
    page.getByText("The source stays byte-for-byte unchanged"),
  ).toBeVisible();
  await expect(
    page.getByText("An instance named “Create Live” already exists."),
  ).toBeVisible();
  await expect(page.getByText("mods", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("logs", { exact: true }).first()).toBeVisible();
  await expect(
    page.getByText("Unsupported", { exact: true }).first(),
  ).toBeVisible();
  await expect(page.getByText("mods/external-library").first()).toBeVisible();

  const names = page.getByRole("textbox", { name: "Name in DropOut" });
  await expect(names.first()).toHaveValue("Create Live (Prism)");
  await names.first().fill("Create Live Archive");
  await page.getByRole("button", { name: "Import 2 environments" }).click();

  await expect(
    page.getByRole("heading", { name: "Copying reviewed content" }),
  ).toBeVisible();
  await expect(
    page.getByRole("progressbar", { name: "Migration copy progress" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Migration report" }),
  ).toBeVisible();
  await expect(page.getByText("2 imported · 0 failed")).toBeVisible();
  await expect(page.getByText("Create Live Archive")).toBeVisible();

  await page.getByRole("button", { name: "Undo import" }).first().click();
  await expect(page.getByText("Import undone").first()).toBeVisible();
  await expectAccessibilitySmoke(page);
});

test("PCL and HMCL isolated versions use the same reviewed migration flow", async ({
  page,
}) => {
  await page.goto("/?fixture=migration&theme=dark#/instances/import");
  await page.getByRole("button", { name: /PCL \/ HMCL/ }).click();
  await expect(
    page.getByRole("heading", { name: "Choose environments to move" }),
  ).toBeVisible();
  await expect(page.getByText("1.20.1 Fabric Isolated")).toBeVisible();
  await expect(page.getByText("Version folder")).toBeVisible();

  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Review 1 selected" }).click();
  await expect(
    page.getByRole("heading", { name: "Review the move manifest" }),
  ).toBeVisible();
  await expect(
    page.getByText("version-metadata", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("logs", { exact: true })).toBeVisible();
  await expectAccessibilitySmoke(page);
});

test("migration cancellation rolls back the active copy and the Chinese flow remains accessible", async ({
  page,
}) => {
  await page.goto(
    "/?fixture=migration&theme=dark&locale=zh-CN#/instances/import",
  );
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  await expect(
    page.getByRole("heading", { name: "从其他启动器导入" }),
  ).toBeVisible();
  await expectAccessibilitySmoke(page);

  await page.getByRole("button", { name: /Prism \/ MultiMC/ }).click();
  await page.getByRole("checkbox").first().check();
  await page.getByRole("button", { name: "核对已选 1 项" }).click();
  await expect(page.getByText("来源保持逐字节不变")).toBeVisible();
  await expectAccessibilitySmoke(page);

  await page.getByRole("button", { name: "导入 1 个环境" }).click();
  await page.getByRole("button", { name: "取消并回滚" }).click();
  await expect(page.getByRole("heading", { name: "迁移报告" })).toBeVisible();
  await expect(page.getByText("成功 0 个 · 失败 1 个")).toBeVisible();
  await expect(page.getByText(/Migration cancelled/)).toBeVisible();
  await expectAccessibilitySmoke(page);
});

test("migration cancellation stops the remaining queue", async ({ page }) => {
  await page.goto("/?fixture=migration&theme=dark#/instances/import");
  await page.getByRole("button", { name: /Prism \/ MultiMC/ }).click();
  await page.getByRole("checkbox").first().check();
  await page.getByRole("checkbox").nth(1).check();
  await page.getByRole("button", { name: "Review 2 selected" }).click();
  await page.getByRole("button", { name: "Import 2 environments" }).click();
  await page.getByRole("button", { name: "Cancel and roll back" }).click();

  await expect(
    page.getByRole("heading", { name: "Migration report" }),
  ).toBeVisible();
  await expect(page.getByText("0 imported · 1 failed")).toBeVisible();
  await expect(page.getByText("Vanilla Lab", { exact: true })).toHaveCount(0);
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

  await page.goto("/?fixture=instances-20&theme=dark&locale=zh-CN#/instances");
  await expect(page.getByRole("heading", { name: "实例库" })).toBeVisible();
  await expect(page.getByRole("searchbox", { name: "搜索实例" })).toBeVisible();
  await expect(page.getByText("当前工作区")).toBeVisible();
  await expectAccessibilitySmoke(page);

  await page.goto(
    "/?fixture=config-editor&theme=dark&locale=zh-CN#/settings/editor",
  );
  await expect(page.getByRole("heading", { name: "配置工作台" })).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "配置源代码" }),
  ).toBeAttached();
  await expect(page.getByRole("button", { name: "格式化 JSON" })).toBeVisible();
  await expectAccessibilitySmoke(page);
});

test("configuration studio validates, saves, and protects unsaved changes", async ({
  page,
}) => {
  await page.goto("/?fixture=config-editor&theme=dark#/settings/editor");

  const editor = page.getByTestId("monaco-config-editor");
  const save = page.getByRole("button", { name: /Save changes/ });
  await expect(editor).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Configuration source" }),
  ).toBeAttached();
  await expect(save).toBeDisabled();

  await editor.click({ position: { x: 240, y: 120 } });
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.insertText(" ");
  await expect(page.getByText("Valid JSON · Unsaved changes")).toBeVisible();
  await expect(save).toBeEnabled();

  await page.keyboard.press("ControlOrMeta+s");
  await expect(page.getByText("Valid JSON · All changes saved")).toBeVisible();
  await expect(save).toBeDisabled();

  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.insertText(" ");
  await page
    .getByRole("button", { name: "Close", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("alertdialog").getByText("Discard unsaved changes?"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Keep editing" }).click();
  await expect(page.getByTestId("monaco-config-editor")).toBeVisible();

  await editor.click({ position: { x: 240, y: 120 } });
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.insertText("{");
  await expect(save).toBeDisabled();
  await expect(page.getByTestId("config-editor-status")).not.toContainText(
    "Valid JSON",
  );
});

test("automatic memory exposes live headroom and a manual fallback", async ({
  page,
}) => {
  await page.goto("/?fixture=memory-settings&theme=dark#/settings");

  const panel = page.getByTestId("memory-allocation-panel");
  await expect(panel).toBeVisible();
  await expect(panel.getByText("11 GB", { exact: true })).toBeVisible();
  await expect(panel.getByText("Healthy launch headroom")).toBeVisible();
  await expect(
    panel.getByRole("progressbar", { name: "Available physical memory" }),
  ).toHaveAttribute("aria-valuenow", "69");

  await panel.getByRole("switch", { name: "Automatic memory" }).click();
  await expect(panel.getByLabel("Min Memory (MB)")).toBeVisible();
  await expect(panel.getByLabel("Max Memory (MB)")).toBeVisible();

  const minimumMemory = panel.getByLabel("Min Memory (MB)");
  await minimumMemory.fill("");
  await minimumMemory.blur();
  await expect(minimumMemory).toHaveValue("1024");
});
