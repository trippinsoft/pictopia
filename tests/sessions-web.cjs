const { chromium } = require("playwright");
const { expect } = require("@playwright/test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
async function saved(page) {
  return page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open("flickwell", 1);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction("preferences", "readonly");
          const r = tx.objectStore("preferences").get("session");
          r.onsuccess = () => resolve(r.result);
          r.onerror = () => reject(r.error);
          tx.oncomplete = () => db.close();
        };
        request.onerror = () => reject(request.error);
      }),
  );
}
(async () => {
  const browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
  page.setDefaultTimeout(20000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    await page.goto(process.env.PREVIEW_URL || "http://localhost:17290");
    // Draftbit authoring chrome has an empty toast hit target at mobile tab coordinates.
    // Ignore only the empty harness element; real errors remain visible and recorded.
    await page.addStyleTag({ content: "#error-toast:empty { pointer-events: none; }" });
    await page.getByRole("radio", { name: "2 minutes", exact: true }).click();
    await page.getByRole("button", { name: "Start a 2-minute clean", exact: true }).click();
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.getByText("Your photos. Your say.", { exact: true }).waitFor();
    const chooser = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "Choose photos & videos", exact: true }).click();
    await (
      await chooser
    ).setFiles(
      Array.from({ length: 16 }, (_, i) => ({
        name: "real-memory-" + i + ".png",
        mimeType: "image/png",
        buffer: fs.readFileSync("assets/images/icon.png"),
      })),
    );
    await page.getByText("1 of 12 in this batch", { exact: true }).waitFor();
    await expect(page.getByRole("button", { name: "Keep", exact: true })).toBeEnabled();
    assert.equal((await saved(page)).minutes, 2);
    console.log("PASS Two-step onboarding leads straight to chosen 2-minute session");
    await page.waitForTimeout(2300);
    let s = await saved(page);
    assert.ok(s.elapsedMs >= 1000);
    const setHidden = (hidden) =>
      page.evaluate((h) => {
        Object.defineProperty(document, "visibilityState", {
          configurable: true,
          get: () => (h ? "hidden" : "visible"),
        });
        document.dispatchEvent(new Event("visibilitychange"));
      }, hidden);
    await setHidden(true);
    await page.waitForTimeout(600);
    const hidden = await saved(page);
    await page.waitForTimeout(2200);
    assert.equal((await saved(page)).elapsedMs, hidden.elapsedMs);
    await setHidden(false);
    await page.waitForTimeout(2300);
    assert.ok((await saved(page)).elapsedMs > hidden.elapsedMs);
    console.log("PASS Timer pauses while the tab is hidden and resumes when visible");

    await page.getByRole("button", { name: "Set aside", exact: true }).click();

    await page.getByText("2 of 12 in this batch").waitFor();
    await page.getByRole("tab", { name: "Home", exact: true }).click();
    await page.getByRole("button", { name: "Resume your session", exact: true }).waitFor();
    // Leaving Swipe flushes its last sub-second tick asynchronously; let that write land first.
    let paused = await saved(page);
    for (let settled = false; !settled; ) {
      await page.waitForTimeout(400);
      const next = await saved(page);
      settled = next.elapsedMs === paused.elapsedMs;
      paused = next;
    }
    await page.waitForTimeout(2200);
    assert.equal((await saved(page)).elapsedMs, paused.elapsedMs);
    assert.equal(await page.getByRole("radio", { name: "10 minutes", exact: true }).count(), 0);
    await page.reload();
    await page.addStyleTag({ content: "#error-toast:empty { pointer-events: none; }" });
    await page.getByRole("button", { name: "Resume your session", exact: true }).click();
    await page.getByText("2 of 12 in this batch").waitFor();
    s = await saved(page);
    assert.equal(s.id, paused.id);
    assert.equal(s.position, 1);
    assert.ok(s.elapsedMs >= paused.elapsedMs);
    console.log("PASS Timer pauses on Home; exact review and duration survive reload");
    await page.screenshot({ path: "/tmp/pictopia-session-mobile.png" });
    await page.getByRole("button", { name: "Finish session", exact: true }).click();
    await page.getByText("That’s progress worth keeping.").waitFor();
    await page.getByText("1 memory reviewed", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Review set-aside items", exact: true }).click();
    await page.getByRole("button", { name: "About device deletion", exact: true }).click();
    await page.getByRole("button", { name: "Cancel, keep my photos", exact: true }).click();
    assert.equal((await saved(page)).marked, 1);
    console.log(
      "PASS Early finish summarizes real decisions and safe deletion review remains reversible",
    );
    await page.getByLabel("Restore this item", { exact: true }).click();
    await page.getByText("No memories marked for deletion").waitFor();
    await page.getByLabel("Back", { exact: true }).click();
    await page.getByText("That’s progress worth keeping.").waitFor();
    await page.waitForTimeout(500);
    assert.equal(await page.getByText("1 memory reviewed", { exact: true }).count(), 0);
    assert.equal(
      await page.getByRole("button", { name: "Review set-aside items", exact: true }).count(),
      0,
    );
    await page.getByRole("button", { name: "Done for now", exact: true }).click();
    console.log("PASS Restored items no longer count as set aside in the session summary");
    await page.getByRole("radio", { name: "10 minutes", exact: true }).click();
    await page.getByRole("button", { name: /Memory Lane/ }).click();
    // 15 unreviewed files plus the photo restored above, which is unreviewed again.
    await page.getByText("1 of 16 in this batch", { exact: true }).waitFor();
    assert.equal((await saved(page)).minutes, 10);
    assert.equal((await saved(page)).ids.length, 16);
    await expect(page.getByRole("button", { name: "Keep", exact: true })).toBeEnabled();
    for (let i = 1; i <= 10; i++) {
      await expect(page.getByRole("button", { name: "Keep", exact: true })).toBeEnabled();
      await page.getByRole("button", { name: "Keep", exact: true }).click();
      await page.getByText(i + 1 + " of 16 in this batch", { exact: true }).waitFor();
    }
    await page
      .getByText("10 memories reviewed. A little lighter already.", { exact: true })
      .waitFor();
    // Set only the clock checkpoint to exercise expiration without waiting ten minutes.
    await page.evaluate(
      () =>
        new Promise((resolve, reject) => {
          const r = indexedDB.open("flickwell", 1);
          r.onsuccess = () => {
            const db = r.result,
              tx = db.transaction("preferences", "readwrite"),
              store = tx.objectStore("preferences");
            const request = store.get("session");
            request.onsuccess = () => {
              const s = request.result;
              store.put({ ...s, elapsedMs: s.minutes * 60000 }, "session");
            };
            tx.oncomplete = () => {
              db.close();
              resolve();
            };
            tx.onerror = () => reject(tx.error);
          };
        }),
    );
    await page.reload();
    await page.addStyleTag({ content: "#error-toast:empty { pointer-events: none; }" });
    await page
      .getByText("Time well spent. Finish here, or keep going at your own pace.", { exact: true })
      .waitFor();
    assert.equal((await saved(page)).complete, false);
    await expect(page.getByRole("button", { name: "Keep", exact: true })).toBeEnabled();
    await page.getByRole("button", { name: "Finish session", exact: true }).click();
    await page.getByRole("button", { name: "Done for now", exact: true }).click();
    await page.getByRole("radio", { name: "5 minutes", exact: true }).click();
    await page.getByRole("button", { name: /Best of the Bunch/ }).click();
    await page.getByText("Find your bunch first", { exact: true }).waitFor();
    assert.equal((await saved(page)).ids.length, 0);
    assert.equal((await saved(page)).minutes, 5);
    console.log("PASS 10-minute Memory Lane and honest 5-minute Best of the Bunch empty state");
    await page.getByRole("button", { name: "Choose another session", exact: true }).click();
    await page.getByRole("tab", { name: "Settings", exact: true }).click();
    await page.getByRole("radio", { name: "Dark", exact: true }).click();
    await page.getByRole("tab", { name: "Home", exact: true }).click();
    await page.screenshot({ path: "/tmp/pictopia-sessions-dark.png" });
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      true,
    );
    assert.deepEqual(errors, []);
    console.log("PASS Mobile Smart Sessions fit in light and dark themes without runtime errors");
  } catch (e) {
    console.log("Runtime errors:", errors);
    await page.screenshot({ path: "/tmp/pictopia-session-error.png" });
    throw e;
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
