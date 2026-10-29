// Browser checks for the rebuilt review deck: rapid presses, gesture/button parity, tappable
// session results and decision changes. Native timing (AppState, gestures, haptics) is covered
// by unit tests and still needs a device build.
const { chromium } = require("playwright");
const fs = require("node:fs");
const { expect } = require("@playwright/test");
const assert = require("node:assert/strict");
async function saved(page, key = "session") {
  return page.evaluate(
    (k) =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open("flickwell", 1);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction("preferences", "readonly");
          const r = tx.objectStore("preferences").get(k);
          r.onsuccess = () => resolve(r.result);
          r.onerror = () => reject(r.error);
          tx.oncomplete = () => db.close();
        };
        request.onerror = () => reject(request.error);
      }),
    key,
  );
}
async function decisions(page, ids) {
  return page.evaluate(
    (list) =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open("flickwell", 1);
        request.onsuccess = () => {
          const db = request.result;
          const store = db.transaction("media", "readonly").objectStore("media");
          const out = {};
          let left = list.length;
          if (!left) resolve(out);
          for (const id of list) {
            const r = store.get(id);
            r.onsuccess = () => {
              out[id] = r.result?.decision ?? null;
              if (!--left) {
                db.close();
                resolve(out);
              }
            };
            r.onerror = () => reject(r.error);
          }
        };
        request.onerror = () => reject(request.error);
      }),
    ids,
  );
}
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
  page.setDefaultTimeout(20000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    await page.goto(process.env.PREVIEW_URL || "http://localhost:17290");
    await page.addStyleTag({ content: "#error-toast:empty { pointer-events: none; }" });
    await page.getByRole("radio", { name: "10 minutes", exact: true }).click();
    await page.getByRole("button", { name: "Start a 10-minute clean", exact: true }).click();
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    const chooser = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "Choose photos & videos", exact: true }).click();
    await (
      await chooser
    ).setFiles(
      Array.from({ length: 10 }, (_, i) => ({
        name: "deck-" + i + ".png",
        mimeType: "image/png",
        buffer: fs.readFileSync(i % 2 ? "assets/images/icon.png" : "assets/images/splash.png"),
      })),
    );
    const keep = page.getByRole("button", { name: "Keep", exact: true });
    const aside = page.getByRole("button", { name: "Set aside", exact: true });
    await page.getByText("1 of 10", { exact: true }).waitFor();
    await expect(keep).toBeEnabled();

    // A burst of presses records each photo once, in order, with nothing skipped.
    for (let i = 0; i < 6; i++) await keep.click({ delay: 0, noWaitAfter: true, force: true });
    await page.waitForTimeout(1500);
    let s = await saved(page);
    const ids = s.history.map((h) => h.id);
    assert.equal(new Set(ids).size, ids.length, "no duplicate decisions");
    assert.deepEqual(ids, s.ids.slice(0, ids.length), "no skipped photos");
    assert.equal(s.position, ids.length);
    assert.ok(ids.length >= 1 && ids.length <= 6, `recorded ${ids.length}`);
    await page.getByText(`${s.position + 1} of 10`, { exact: true }).waitFor();
    await expect(keep).toBeEnabled();
    console.log(`PASS Rapid presses: ${ids.length} of 6 presses recorded, no duplicates or skips`);

    // Buttons and gestures produce the same decisions; the deck is ready again afterwards.
    await aside.click();
    await page.getByText(`${s.position + 2} of 10`, { exact: true }).waitFor();
    await expect(keep).toBeEnabled(); // the next photo is on top and ready
    const card = await page.getByLabel("Open a larger view").boundingBox();
    await page.mouse.move(card.x + card.width / 2, card.y + card.height / 2);
    await page.mouse.down();
    await page.mouse.move(card.x + card.width / 2 - 160, card.y + card.height / 2, { steps: 12 });
    await page.mouse.up();
    await page.getByText(`${s.position + 3} of 10`, { exact: true }).waitFor();
    await expect(keep).toBeEnabled();
    // A short drag springs back without deciding anything.
    const before = (await saved(page)).position;
    const card2 = await page.getByLabel("Open a larger view").boundingBox();
    await page.mouse.move(card2.x + card2.width / 2, card2.y + card2.height / 2);
    await page.mouse.down();
    await page.mouse.move(card2.x + card2.width / 2 + 40, card2.y + card2.height / 2, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(600);
    assert.equal((await saved(page)).position, before);
    await expect(keep).toBeEnabled();
    s = await saved(page);
    const last = s.history.slice(-2).map((h) => h.decision);
    assert.deepEqual(last, ["delete", "delete"], "button and swipe both set aside");
    console.log("PASS Button and swipe give the same result; short drags spring back");

    // Undo returns the previous photo, ready to decide again.
    await page.getByLabel("Undo last decision").click();
    await page.getByText(`${s.position} of 10`, { exact: true }).waitFor();
    await expect(keep).toBeEnabled();
    await keep.click();
    await page.getByText(`${s.position + 1} of 10`, { exact: true }).waitFor();
    console.log("PASS Undo brings the last photo back, ready to decide");

    // Tapping the running totals opens this session's photos; changes update totals.
    s = await saved(page);
    const keptIds = s.history.filter((h) => h.decision === "keep").map((h) => h.id);
    const asideIds = s.history.filter((h) => h.decision === "delete").map((h) => h.id);
    await page
      .getByText(`${keptIds.length} kept • ${asideIds.length} set aside`, { exact: true })
      .click();
    await page.getByText("This session", { exact: true }).waitFor();
    await page.getByRole("tab", { name: `Set aside · ${asideIds.length}` }).waitFor();
    await page.getByRole("tab", { name: `Kept · ${keptIds.length}` }).click();
    await page.getByLabel("Set aside instead").first().click();
    await page.getByRole("tab", { name: `Set aside · ${asideIds.length + 1}` }).waitFor();
    await page.getByRole("tab", { name: `Kept · ${keptIds.length - 1}` }).waitFor();
    // Open one larger and change it back from the preview.
    await page.getByRole("tab", { name: `Set aside · ${asideIds.length + 1}` }).click();
    await page.getByLabel("See this photo larger").first().click();
    await page.getByText("Photo preview", { exact: true }).waitFor();
    await page.getByText("Set aside. Nothing is deleted until you confirm in the queue.").waitFor();
    await page.getByRole("button", { name: "Keep", exact: true }).click();
    await page.getByText("You kept this one.", { exact: true }).waitFor();
    await page.getByLabel("Close preview").click();
    await page.getByRole("tab", { name: `Kept · ${keptIds.length}` }).waitFor();
    const now = await decisions(page, [...keptIds, ...asideIds]);
    const kept = Object.values(now).filter((d) => d === "keep").length;
    assert.equal(kept, keptIds.length, "stored decisions match the totals shown");
    console.log("PASS Session totals open the photos; decisions change from the list and preview");

    // Deletion still needs its own confirmation step.
    await page.getByRole("button", { name: /^Review \d+ items? for deletion$/ }).click();
    await page.getByText("Nothing has been deleted yet.", { exact: true }).waitFor();
    console.log("PASS Set-aside photos lead to the separate deletion review");
    assert.deepEqual(errors, []);
    console.log("PASS No browser runtime errors");
  } catch (e) {
    console.error("Runtime errors:", errors);
    console.error(e);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
