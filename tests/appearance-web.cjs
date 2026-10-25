const { chromium } = require("playwright");
const { expect } = require("@playwright/test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const url = process.env.PREVIEW_URL || "http://localhost:61772";
async function surfaces(page) {
  return page.evaluate(() => ({
    html: getComputedStyle(document.documentElement).backgroundColor,
    body: getComputedStyle(document.body).backgroundColor,
    scheme: getComputedStyle(document.documentElement).colorScheme,
    card: getComputedStyle(document.documentElement).getPropertyValue("--card"),
    override: document.documentElement.getAttribute("data-theme"),
  }));
}
async function dark(page) {
  await expect
    .poll(async () => {
      const s = await surfaces(page);
      return s.scheme === "dark" && s.html === s.body && s.card.includes("13%");
    })
    .toBe(true);
}
(async () => {
  const browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox"],
  });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    colorScheme: "light",
  });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (message) => {
    if (/Unexpected text node|Text strings must be rendered within a <Text>/.test(message.text())) {
      errors.push(message.text());
    }
  });
  try {
    await page.goto(url + "/settings");
    // Only an empty authoring-toast hit target is ignored; real errors remain visible.
    await page.addStyleTag({ content: "#error-toast:empty { pointer-events:none; }" });
    await page.getByRole("radio", { name: "Dark", exact: true }).click();
    await dark(page);
    await page.getByText("Reset cleanup decisions", { exact: true }).click();
    await page.getByText("Start fresh?", { exact: true }).waitFor();
    const modal = await page.getByText("Start fresh?", { exact: true }).evaluate((el) => {
      let container = el.parentElement;
      return {
        card: getComputedStyle(container).backgroundColor,
        backdrop: getComputedStyle(container.parentElement).backgroundColor,
        text: getComputedStyle(el).color,
      };
    });
    assert.match(modal.card, /rgb\(25, 33, 41\)/);
    assert.match(modal.backdrop, /rgba\(0, 0, 0, 0.7\)/);
    await page.waitForTimeout(350); // Let the existing modal fade finish before visual inspection.
    await page.screenshot({ path: "/tmp/pictopia-dark-dialog.png" });
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    console.log("PASS Dark dialogs inherit theme variables and use a dimmed black backdrop");
    await page.reload({ waitUntil: "domcontentloaded" });
    // The small appearance cache is read before preferences finish loading.
    await expect
      .poll(() => page.evaluate(() => document.documentElement.getAttribute("data-theme")))
      .toBe("dark");
    await page.getByRole("radio", { name: "Dark", exact: true }).waitFor();
    await dark(page);
    await page.addStyleTag({ content: "#error-toast:empty { pointer-events:none; }" });
    console.log(
      "PASS Persisted Dark appearance survives reload with matching page/background colors",
    );
    await page.getByRole("radio", { name: "System", exact: true }).click();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.getAttribute("data-theme")))
      .toBe(null);
    const expected = await page.evaluate(() =>
      matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light",
    );
    await expect.poll(async () => (await surfaces(page)).scheme).toBe(expected);
    assert.equal(await page.evaluate(() => localStorage.getItem("pictopia.appearance")), null);
    await page.getByRole("radio", { name: "Dark", exact: true }).click();
    await dark(page);
    console.log(
      "PASS System releases the saved override and resolves the active browser preference",
    );
    await page.goto(url + "/home");
    await page.getByText("Pictopia", { exact: true }).waitFor();
    await dark(page);
    const chooser = page.waitForEvent("filechooser");
    await page.getByText("Add photos", { exact: true }).click();
    await (
      await chooser
    ).setFiles([
      {
        name: "real-photo.png",
        mimeType: "image/png",
        buffer: fs.readFileSync("assets/images/icon.png"),
      },
      {
        name: "another-real-photo.png",
        mimeType: "image/png",
        buffer: fs.readFileSync("assets/images/favicon.png"),
      },
    ]);
    await page.getByText("2 items • 0 reviewed").waitFor();
    await page.screenshot({ path: "/tmp/pictopia-dark-home.png" });
    await page.getByRole("button", { name: "Start a 5-minute clean", exact: true }).click();
    await expect(page.getByRole("button", { name: "Set aside", exact: true })).toBeEnabled();
    await dark(page);
    const button = await page
      .getByRole("button", { name: "Set aside", exact: true })
      .evaluate((el) => ({
        background: getComputedStyle(el).backgroundColor,
        foreground: getComputedStyle(el.children[0]).color,
      }));
    assert.match(button.foreground, /rgb\(20, 31, 41\)/);
    await page.screenshot({ path: "/tmp/pictopia-dark-swipe.png" });
    await page.getByRole("button", { name: "Set aside", exact: true }).click();
    await page.getByText("2 of 2 in this batch").waitFor();
    await page.locator('[aria-label="Review deletion queue"]:visible').last().click();
    await page.getByRole("button", { name: "About device deletion", exact: true }).click();
    await page.getByText("One last check.", { exact: true }).waitFor();
    await dark(page);
    await page.getByRole("button", { name: "Cancel, keep my photos", exact: true }).click();
    console.log(
      "PASS Real-media swipe, set-aside controls and safe deletion review work in Dark mode",
    );
    for (const [route, title] of [
      ["smart", "A smarter kind of clean"],
      ["onboarding", "Welcome to Pictopia"],
      ["paywall", "A little extra brilliance"],
      ["statistics", "A little progress adds up"],
      ["help", "A little help"],
      ["legal?page=privacy", "Privacy policy"],
      ["compare?id=missing", "Choose your keepers"],
      ["preview?id=missing", "Photo preview"],
    ]) {
      await page.goto(url + "/" + route);
      await page.getByText(title, { exact: true }).first().waitFor();
      await dark(page);
    }
    console.log("PASS Secondary screens, legal pages and empty/error states retain dark surfaces");
    await page.goto(url + "/settings");
    await page.getByRole("radio", { name: "Light", exact: true }).click();
    await expect.poll(async () => (await surfaces(page)).scheme).toBe("light");
    const light = await surfaces(page);
    assert.equal(light.html, light.body);
    await page.reload();
    await page.getByRole("radio", { name: "Light", exact: true }).waitFor();
    assert.equal((await surfaces(page)).scheme, "light");
    assert.deepEqual(errors, []);
    console.log("PASS Light mode and persisted settings still work without browser runtime errors");
  } catch (e) {
    console.log("Runtime errors:", errors);
    await page.screenshot({ path: "/tmp/pictopia-appearance-error.png" });
    throw e;
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
