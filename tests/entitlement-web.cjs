// Browser checks for Developer Tools in Settings with chosen photos: Free with a testing limit
// stops the review at the daily-limit page, reset reopens it, Pictopia+ removes the limit and
// every Plus tag at once, and the override survives a reload. Screenshots go to /tmp/ent.
const { chromium } = require("playwright");
const fs = require("node:fs");
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage({ viewport: { width: 402, height: 874 } });
  const logs = [];
  page.on("pageerror", (e) => logs.push(String(e)));
  fs.mkdirSync("/tmp/ent", { recursive: true });
  const shot = (name) => page.screenshot({ path: `/tmp/ent/${name}.png`, fullPage: true });
  const see = (text, timeout = 15000) => (typeof text === "string" ? page.getByText(text, { exact: true }) : page.getByText(text)).first().waitFor({ timeout });
  const pass = (message) => console.log(`PASS ${message}`);
  const base = process.env.PREVIEW_URL || "http://localhost:60701";
  const radio = (name) => page.getByRole("radio", { name, exact: true });
  const settings = async () => { await page.getByLabel("Settings", { exact: true }).filter({ visible: true }).first().click({ force: true }); await see("Developer tools"); };
  const done = () => page.getByLabel("Done with Settings").click();
  const usage = (text) => see(text);
  const plusTags = () => page.getByText("PLUS", { exact: true }).count();
  const review = async () => {
    await page.getByRole("button", { name: /^(Pictopia’s pick|Or try)/ }).first().click();
    const counter = page.getByText(/^\d+ of \d+$/).first();
    await counter.waitFor({ timeout: 20000 });
    const [at, total] = (await counter.textContent()).split(" of ").map(Number);
    const skip = page.getByText("Skip", { exact: true });
    if (await skip.count()) await skip.first().click().catch(() => {});
    return { at, total };
  };
  const next = async () => {
    const feed = await page.getByLabel("Vertically paged photo feed").boundingBox();
    await page.mouse.move(feed.x + feed.width / 2, feed.y + feed.height / 2);
    await page.mouse.wheel(0, feed.height);
    await page.waitForTimeout(900);
  };
  try {
    await page.goto(`${base}/home`);
    await see("Choose photos");
    const dir = "/tmp/ent-files";
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    const sources = ["icon.png", "adaptive-icon.png", "splash.png", "favicon.png"];
    const paths = [];
    for (let i = 0; i < 32; i++) {
      const file = `${dir}/entitlement-${i}.png`;
      fs.writeFileSync(file, Buffer.concat([fs.readFileSync(`assets/images/${sources[i % 4]}`), Buffer.from([i, 7])]));
      const when = new Date(i % 2 ? 2021 : 2023, [2, 5, 8, 9][i % 4], 1 + ((i * 3) % 27), 12);
      fs.utimesSync(file, when, when);
      paths.push(file);
    }
    const chooser = page.waitForEvent("filechooser");
    await page.getByText("Choose photos", { exact: true }).click();
    await (await chooser).setFiles(paths);
    await see("Where to today?", 40000);

    await settings();
    await see("No active purchase");
    await radio("Free").click();
    await radio("3").click();
    await usage("0 of 3 used");
    await see("Developer override · not a purchase");
    await shot("settings-free");
    pass("Developer tools: Free with a testing limit of 3, shown as a developer override");
    await done();

    const { total } = await review();
    for (let i = 0; i < 4; i++) await next();
    await see(/^You’ve reviewed 3 photos and videos today!/);
    await see("Unlock unlimited with Pictopia+");
    await shot("limit-page");
    pass(`Free: the review (${total} photos) stops at the daily-limit page after 3`);
    await page.getByText("Continue tomorrow", { exact: true }).click();
    await see("Where to today?");

    await settings();
    await usage("3 of 3 used");
    await page.getByText("Reset today’s usage", { exact: true }).click();
    await usage("0 of 3 used");
    pass("Reset today’s usage clears the count");
    await done();
    await page.getByRole("tab", { name: /Explore/ }).or(page.getByText("Explore", { exact: true })).first().click();
    await see("Surprise Me");
    await see("PLUS").catch(() => {});
    if (!(await plusTags())) throw Error("Free must show Pictopia+ tags in Explore");
    pass("Free: Explore shows Pictopia+ tags");

    await settings();
    await radio("Pictopia+").click();
    await see("Pictopia+ · Active");
    await shot("settings-plus");
    await done();
    await see("Surprise Me");
    await page.waitForTimeout(500);
    if (await plusTags()) throw Error("Pictopia+ must remove the Plus tag immediately");
    pass("Pictopia+: Explore drops the Plus tags without a reload");

    await page.getByRole("tab", { name: /Home/ }).or(page.getByText("Home", { exact: true })).first().click();
    await see("Where to today?");
    const resumed = await review();
    const steps = Math.min(resumed.total - resumed.at, 5);
    for (let i = 0; i < steps; i++) await next();
    await see(`${resumed.at + steps} of ${resumed.total}`);
    if (await page.getByText("Unlock unlimited with Pictopia+", { exact: true }).count()) throw Error("Pictopia+ must not hit the limit");
    await shot("plus-review");
    pass(`Pictopia+: reached photo ${resumed.at + steps}, past the testing limit of 3`);

    await page.goto(`${base}/paywall`);
    await see("Pictopia+ is already unlocked");
    pass("Paywall reads the same resolved entitlement");

    await page.goto(`${base}/on-this-day`);
    await see("Today");
    if (await page.getByText("Pictopia+", { exact: true }).count()) throw Error("Past dates should be unlocked in Pictopia+");
    await page.goto(`${base}/settings`);
    await see("Developer tools");
    const checked = (name) => page.locator('[role="radio"][aria-checked="true"]').filter({ hasText: new RegExp(`^${name.replace("+", "\\+")}$`) }).first().waitFor({ timeout: 10000 });
    await checked("Pictopia+").catch(() => { throw Error("Mode must survive a reload"); });
    await checked("3").catch(() => { throw Error("Limit must survive a reload"); });
    pass("The override and testing limit survive a full reload");
    await radio("Free").click();
    await page.goto(`${base}/on-this-day`);
    await see("Today");
    if (!(await page.getByText("Pictopia+", { exact: true }).count())) throw Error("Past dates must be locked in Free");
    pass("On This Day locks past dates in Free and opens them in Pictopia+");

    await page.goto(`${base}/settings`);
    await see("Developer tools");
    await radio("Automatic").click();
    await radio("100 (real)").click();
    await see("No active purchase");
    pass("Automatic restores the real (no purchase) state");
    if (logs.length) throw Error(`Page errors: ${logs.join("\n")}`);
  } catch (e) {
    await shot("failure").catch(() => {});
    console.error("FAIL", e.message);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
