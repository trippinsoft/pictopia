// Browser checks for Adventures with chosen photos: Home offers two curated Adventures that
// open straight into the vertical explorer, progress resumes from Home, and Explore starts a
// chosen one that waits under Continue. Screenshots go to /tmp/adv for a visual pass.
const { chromium } = require("playwright");
const fs = require("node:fs");
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const logs = [];
  page.on("console", (m) => logs.push(m.text()));
  page.on("pageerror", (e) => logs.push(String(e)));
  fs.mkdirSync("/tmp/adv", { recursive: true });
  const shot = (name) => page.screenshot({ path: `/tmp/adv/${name}.png` });
  const see = (text, timeout = 15000) => page.getByText(text, { exact: true }).first().waitFor({ timeout });
  const pass = (message) => console.log(`PASS ${message}`);
  const base = process.env.PREVIEW_URL || "http://localhost:35583";
  try {
    await page.goto(`${base}/home`);
    await see("Every library holds a few surprises.");
    // Files dated across two years and many days, like a real library.
    const dir = "/tmp/adv-files";
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    const sources = ["icon.png", "adaptive-icon.png", "splash.png", "favicon.png"];
    const paths = [];
    for (let i = 0; i < 32; i++) {
      const file = `${dir}/adventure-${i}.png`;
      fs.writeFileSync(file, Buffer.concat([fs.readFileSync(`assets/images/${sources[i % 4]}`), Buffer.from([i])]));
      const year = i % 2 ? 2021 : 2023;
      const when = new Date(year, [2, 5, 8, 9][i % 4], 1 + ((i * 3) % 27), 12);
      fs.utimesSync(file, when, when);
      paths.push(file);
    }
    const chooser = page.waitForEvent("filechooser");
    await page.getByText("Choose photos", { exact: true }).click();
    await (await chooser).setFiles(paths);
    await see("Two adventures are waiting.", 40000);
    const card = page.getByRole("button", { name: /^Adventure A\./ });
    await card.waitFor();
    const label = await card.getAttribute("aria-label");
    if (/beach|family|location|Paris/i.test(label)) throw Error(`Invented hint: ${label}`);
    if (await page.locator("img").count()) throw Error("Home must not preview photos");
    if (await page.getByText("Choose your own adventure").count()) throw Error("Home has no chooser link");
    await shot("home-two");
    pass(`Home offers two curated Adventures with truthful hints (${label})`);

    await card.click();
    const counter = page.getByText(/^1 \/ \d+$/);
    await counter.waitFor({ timeout: 15000 });
    const total = Number((await counter.textContent()).split("/ ")[1]);
    if (total > 20) throw Error(`Adventure too long: ${total}`);
    const feed = await page.getByLabel("Vertically paged photo feed").boundingBox();
    const cx = feed.x + feed.width / 2,
      cy = feed.y + feed.height / 2;
    if (await page.getByLabel(/^Photograph 1, /).count()) throw Error("The thumbnail filmstrip is gone");
    await page.getByLabel("Trash, nothing marked for deletion yet").waitFor();
    // Vertical scrolling browses without deciding anything.
    await page.mouse.move(cx, cy);
    await page.mouse.wheel(0, feed.height);
    await see(`2 / ${total}`);
    await page.waitForTimeout(400);
    const flick = async () => {
      await page.mouse.move(cx, cy);
      await page.mouse.down();
      await page.mouse.move(cx - 170, cy + 4, { steps: 8 });
      await page.mouse.up();
    };
    await flick();
    await see(`2 / ${total - 1}`);
    await page.getByLabel(/^Trash, 1 photograph marked/).waitFor();
    await shot("review-discard");
    pass(`One tap opens the feed with no instruction screen (${total} photos); a flick sends one to the trash`);

    // Immediate Undo and the trash both reach the same pending-deletion state.
    await page.getByLabel(/^Undo the last discard/).click();
    await see(`2 / ${total}`);
    await page.getByLabel("Trash, nothing marked for deletion yet").waitFor();
    pass("Undo brings the photograph straight back into the sequence");

    // The restored photograph slides back in before it can be swiped again.
    await page.waitForTimeout(700);
    await flick();
    await page.waitForTimeout(700);
    await flick();
    await page.getByLabel(/^Trash, 2 photographs marked/).click();
    await see("Marked for deletion (2)");
    await see("Nothing is deleted until you confirm.");
    await shot("review-trash");
    await page.getByText("Restore", { exact: true }).click();
    await see("Marked for deletion (1)");
    await page.getByLabel("Close the trash").first().click();
    await page.getByLabel(/^Trash, 1 photograph marked/).waitFor();
    // The restored photograph is back in the sequence, ahead of where the user is standing.
    await page.getByText(new RegExp(`^\\d+ / ${total - 1}$`)).first().waitFor();
    pass("The trash tray restores a chosen photograph and the count follows it");

    await page.getByLabel("Exit photo review").click();
    await page.getByText(/^Continue · \d+ of \d+$/).first().waitFor();
    await page.getByText(/explored on your Journey · 1 set aside$/).first().waitFor();
    await shot("home-continue");
    pass("Home offers Continue with this Adventure's place and one photo set aside");

    await page.getByText("Explore", { exact: true }).last().click();
    await see("Choose your adventure.");
    await see("Time Machine");
    await see("Surprise Me");
    await shot("explore");
    await page.getByRole("button", { name: /^Surprise Me/ }).click();
    await page.getByText(/^1 \/ \d+$/).waitFor({ timeout: 20000 });
    pass("Explore's Surprise Me opens straight into a new Adventure");
    await page.getByLabel("Exit photo review").click();
    await see("Continue");
    pass("Back in Explore, the unfinished chosen Adventure waits under Continue");

    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto(`${base}/home`);
    await see("pictopia");
    await shot("home-dark");
    const errors = logs.filter((l) => /Error|Encountered two children/.test(l) && !/postMessage/.test(l));
    if (errors.length) throw Error(`Console errors:\n${errors.join("\n")}`);
    pass("No console errors");
  } catch (e) {
    console.log(logs.filter((l) => !/postMessage/.test(l)).slice(-20).join("\n"));
    await shot("failure");
    throw e;
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
