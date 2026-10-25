const { chromium } = require("playwright");
const fs = require("node:fs");
const { expect } = require("@playwright/test");
const assert = require("node:assert/strict");
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox"],
  });
  const context = await browser.newContext({ viewport: { width: 1280, height: 950 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    await page.goto("http://localhost:17514");
    await page.getByText("Your months, made lighter").waitFor();
    console.log("PASS Home renders with honest empty state");
    const chooser = page.waitForEvent("filechooser");
    await page.getByText("Add photos", { exact: true }).click();
    await (
      await chooser
    ).setFiles([
      {
        name: "memory-one.png",
        mimeType: "image/png",
        buffer: fs.readFileSync("assets/images/icon.png"),
      },
      {
        name: "memory-two.png",
        mimeType: "image/png",
        buffer: fs.readFileSync("assets/images/adaptive-icon.png"),
      },
      {
        name: "memory-three.png",
        mimeType: "image/png",
        buffer: fs.readFileSync("assets/images/splash.png"),
      },
      {
        name: "memory-four.png",
        mimeType: "image/png",
        buffer: fs.readFileSync("assets/images/favicon.png"),
      },
    ]);
    await page.getByText("4 items • 0 reviewed").waitFor({ timeout: 20000 });
    console.log("PASS Real browser files import with monthly collections");
    await page.getByRole("button", { name: "Start a 5-minute clean" }).click();
    await page.getByText("1 of 4 in this batch").waitFor();
    await expect(page.getByRole("button", { name: "Set aside", exact: true })).toBeEnabled();
    const card = await page.getByLabel("Open full-screen media preview").boundingBox();
    await page.mouse.move(card.x + card.width / 2, card.y + card.height / 2);
    await page.mouse.down();
    await page.mouse.move(card.x + card.width / 2 - 140, card.y + card.height / 2, { steps: 15 });
    await page.mouse.up();
    await page.getByText("2 of 4 in this batch").waitFor();
    console.log("PASS Swipe gesture uses the decision threshold");
    await page.getByRole("button", { name: "Keep", exact: true }).click();
    await page.getByText("3 of 4 in this batch").waitFor();
    await page.getByLabel("Undo last decision").click();
    await page.getByText("2 of 4 in this batch").waitFor();
    console.log("PASS Keep, Set aside, and Undo update the saved session");
    await page.reload();
    await page.getByText("2 of 4 in this batch").waitFor();
    console.log("PASS Session resumes after browser reload");
    await page.getByLabel("Open full-screen media preview").click();
    await page.getByText("Photo preview", { exact: true }).waitFor();
    await page.getByLabel("Zoomable photo").dblclick();
    assert.match(await page.getByTestId("photo-transform").getAttribute("style"), /scale\(2\)/);
    console.log("PASS Double-tap photo zoom");
    await page.getByLabel("Add app favorite").click();
    await page.getByLabel("Remove app favorite").waitFor();
    await page.getByLabel("Media details").click();
    await page
      .getByText("Favorites are saved in FlickWell; your original media is not modified.", {
        exact: false,
      })
      .waitFor();
    await page.getByLabel("Close preview").click();
    console.log("PASS Photo preview, metadata, and persisted favorite");
    await page.getByLabel("Review deletion queue").click();
    await page.getByText("Review before you let go").waitFor();
    await page.getByRole("button", { name: "About device deletion" }).click();
    await page.getByText("The browser cannot request device deletion.", { exact: false }).waitFor();
    await page.getByRole("button", { name: "Cancel, keep my photos" }).click();
    await page.getByLabel("Restore this item").click();
    await page.getByText("No memories marked for deletion").waitFor();
    console.log("PASS Browser deletion stays unavailable and queue restoration works");
    await page.getByLabel("Back", { exact: true }).click();
    await page.getByRole("tab", { name: "Settings" }).click();
    await page.getByRole("radio", { name: "Dark", exact: true }).click();
    await page.getByText("Make yourself at home").waitFor();
    await page.screenshot({ path: "/tmp/flickwell-settings-dark.png" });
    await page.reload();
    await page.getByRole("radio", { name: "Dark", exact: true }).waitFor();
    console.log("PASS Appearance preference survives reload");
    await page.getByRole("tab", { name: "Smart Clean" }).click();
    await page.getByRole("button", { name: "Explore FlickWell Pro" }).click();
    await page.getByText("Monthly Pro", { exact: true }).waitFor();
    assert.equal(
      await page.getByRole("button", { name: "Continue with selected plan" }).isDisabled(),
      true,
    );
    console.log("PASS Pro gating and unavailable store checkout");
    await page.getByText("Privacy", { exact: true }).click();
    await page.getByText("Release draft • Publisher details pending").waitFor();
    console.log("PASS Privacy disclosures are reachable");
    assert.deepEqual(errors, []);
    console.log("PASS No browser runtime errors");
    const mobile = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const p = await mobile.newPage();
    await p.goto("http://localhost:17514");
    await p.getByText("Less clutter.").waitFor();
    await p.screenshot({ path: "/tmp/flickwell-mobile.png" });
    assert.equal(
      await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      true,
    );
    console.log("PASS Mobile preview fits the viewport");
    await mobile.close();
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
