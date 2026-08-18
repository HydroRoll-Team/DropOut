import { driver } from "driver.js";
import "driver.js/dist/driver.css";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useSettingsStore } from "@/models/settings";

/**
 * Guided tour component using driver.js.
 *
 * Trigger logic:
 *   - Fires when `firstLaunchCompleted === false` in the persisted config.
 *   - On finish/dismiss: sets `firstLaunchCompleted = true` and saves to disk.
 *   - To replay the tour: set `firstLaunchCompleted = false` in Settings and
 *     relaunch the app.  The tour will start again on next startup because the
 *     config is loaded fresh from disk each session.
 *
 * `tourRunning` ref prevents double-firing within the same React render cycle
 * (e.g. StrictMode double-invoke) without blocking a legitimate re-trigger
 * after the config value changes to false on disk and the app restarts.
 */
export function GuidedTour() {
  const settings = useSettingsStore();
  const { t } = useTranslation();
  // Guards against double-firing within the *same* app session/render cycle.
  // NOT a "has-ever-run" flag — it resets to false on every process start.
  const tourRunning = useRef(false);

  useEffect(() => {
    // Config not yet loaded from backend — wait.
    if (!settings.config) return;
    // Already completed (persisted on disk from a previous session or this one).
    if (settings.config.firstLaunchCompleted) return;
    // Already started this tour in the current render cycle.
    if (tourRunning.current) return;

    tourRunning.current = true;

    // Delay to let the DOM settle after initial render.
    const timer = setTimeout(() => {
      const tour = driver({
        showProgress: true,
        animate: true,
        allowClose: true,
        overlayColor: "black",
        overlayOpacity: 0.6,
        stagePadding: 8,
        stageRadius: 8,
        popoverClass: "dropout-tour-popover",
        nextBtnText: t("tour.next"),
        prevBtnText: t("tour.back"),
        doneBtnText: t("tour.done"),
        steps: [
          {
            popover: {
              title: t("tour.welcome"),
              description: t("tour.welcomeDesc"),
            },
          },
          {
            element: '[data-tour="sidebar-nav"]',
            popover: {
              title: t("tour.navigation"),
              description: t("tour.navigationDesc"),
              side: "right" as const,
              align: "start" as const,
            },
          },
          {
            element: '[data-tour="sidebar-account"]',
            popover: {
              title: t("tour.account"),
              description: t("tour.accountDesc"),
              side: "right" as const,
              align: "end" as const,
            },
          },
          {
            element: '[data-tour="bottom-bar"]',
            popover: {
              title: t("tour.launchBar"),
              description: t("tour.launchBarDesc"),
              side: "top" as const,
              align: "center" as const,
            },
          },
          {
            element: '[data-tour="instance-selector"]',
            popover: {
              title: t("tour.instanceSelector"),
              description: t("tour.instanceSelectorDesc"),
              side: "top" as const,
              align: "start" as const,
            },
          },
          {
            element: '[data-tour="launch-button"]',
            popover: {
              title: t("tour.launch"),
              description: t("tour.launchDesc"),
              side: "top" as const,
              align: "end" as const,
            },
          },
        ],
        onDestroyStarted: () => {
          // Mark completed in both the in-memory store and on disk.
          // This prevents the tour from re-firing for the rest of this session.
          settings.merge({ firstLaunchCompleted: true });
          settings.save();
          tour.destroy();
        },
      });

      tour.drive();
    }, 800);

    return () => {
      clearTimeout(timer);
      // Reset guard when effect re-runs (e.g. config reloaded) so a legitimate
      // re-trigger (firstLaunchCompleted flipped back to false + app restart)
      // will work correctly next session.  Within this session the store value
      // will already be `true` after the tour runs, so the early-return above
      // prevents any re-trigger without needing the ref.
      tourRunning.current = false;
    };
  }, [settings.config, settings.merge, settings.save, t]);

  return null;
}
