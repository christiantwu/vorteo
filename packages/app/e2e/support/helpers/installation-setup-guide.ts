import type { BrowserContext } from "@playwright/test";

/** Register on an unnavigated context; this cannot dismiss an already loaded guide. */
export async function completeInstallationSetupGuide(
  context: Pick<BrowserContext, "addInitScript">,
  installation: { installationId: string; origin: string },
): Promise<void> {
  if (!installation.installationId.trim()) {
    throw new TypeError("Installation setup requires a nonempty installation identity");
  }
  const expectedOrigin = new URL(installation.origin).origin;
  const storageKey = `@vorteo:setup:v1:${encodeURIComponent(installation.installationId)}`;

  await context.addInitScript(
    ({ origin, key }) => {
      if (window !== window.top) return;
      if (window.location.origin !== origin) return;
      if (window.localStorage.getItem(key) !== null) return;
      window.localStorage.setItem(
        key,
        JSON.stringify({ disposition: "completed", updatedAt: new Date().toISOString() }),
      );
    },
    { origin: expectedOrigin, key: storageKey },
  );
}
