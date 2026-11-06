// Browser checks for the shared review and its endings with chosen photos: Home's postcard
// opens the review, the two-step coach, browsing, marking, Undo, the trash, the exit recap,
// resume from Continue, the end card's Finish, Completion, Ready to delete and the web
// deletion notice. Screenshots go to /tmp/adv for a visual pass.
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
  page.on("console", (m) => logs.push(m.text()));
  page.on("pageerror", (e) => logs.push(String(e)));
  page.on("response", (r) => { if (r.status() >= 500) logs.push(`HTTP ${r.status()} ${r.url()}`); });
  fs.mkdirSync("/tmp/adv", { recursive: true });
  const shot = (name) => page.screenshot({ path: `/tmp/adv/${name}.png` });
  const see = (text, timeout = 15000) => (typeof text === "string" ? page.getByText(text, { exact: true }) : page.getByText(text)).first().waitFor({ timeout });
  const pass = (message) => console.log(`PASS ${message}`);
  const base = process.env.PREVIEW_URL || "http://localhost:35583";
  try {
    await page.goto(`${base}/home`);
    await see("Choose photos");
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
    await see("Where to today?", 40000);
    const card = page.getByRole("button", { name: /^(The Yearbook|Surprise Me|On This Day|Time Capsule|Screenshot Sweep)\. / }).first();
    await card.waitFor({ timeout: 40000 });
    await shot("home-two");
    pass("Home offers adventure postcards");

    await card.click();
    const counter = page.getByText(/^1 of \d+$/);
    await counter.waitFor({ timeout: 20000 });
    const total = Number((await counter.textContent()).split("of ")[1]);
    await see("Scroll up to explore");
    await page.getByLabel("Back. Your place is saved").waitFor();
    if (!(await page.getByLabel(/^Undo, nothing to undo yet/).count())) throw Error("Undo must always be visible");
    await shot("review-coach");
    pass(`The review opens on photo 1 of ${total} with the first coach tip and a dimmed Undo`);

    const feed = await page.getByLabel("Vertically paged photo feed").boundingBox();
    const cx = feed.x + feed.width / 2, cy = feed.y + feed.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.wheel(0, feed.height);
    await see(`2 of ${total}`);
    await see("Swipe sideways to mark");
    pass("Scrolling browses and moves the coach to its second tip");

    await page.waitForTimeout(500);
    const flick = async () => {
      await page.mouse.move(cx, cy);
      await page.mouse.down();
      await page.mouse.move(cx - 170, cy + 4, { steps: 8 });
      await page.mouse.up();
    };
    await flick();
    await page.getByLabel(/^Trash, 1 photograph marked/).waitFor();
    if (await page.getByText("Swipe sideways to mark", { exact: true }).count()) throw Error("The coach should finish after a real swipe");
    await shot("review-marked");
    pass("A sideways flick marks a photo, fills the trash and ends the coach");

    await page.getByLabel(/^Undo the last mark/).click();
    await page.getByLabel(/^Trash, 0 photographs marked/).waitFor();
    pass("Undo brings the photo straight back");

    await page.waitForTimeout(700);
    await flick();
    await page.waitForTimeout(700);
    await flick();
    await page.getByLabel(/^Trash, 2 photographs marked/).click();
    await see("Marked for deletion (2)");
    await page.getByText("Restore", { exact: true }).click();
    await see("Marked for deletion (1)");
    await page.getByLabel("Close the trash").first().click();
    await page.getByLabel(/^Trash, 1 photograph marked/).waitFor();
    pass("The trash restores a chosen photo and the count follows it");

    await page.getByLabel("Back. Your place is saved").click();
    await page.getByText("Nice exploring!", { exact: true }).waitFor();
    await see(/explored · 1 marked/);
    await shot("recap");
    pass("Leaving with a mark shows the recap card on the screen the review came from");

    await page.getByText("Review 1 marked", { exact: true }).click();
    await see("Ready to delete");
    await see(/^1 marked/);
    await page.getByText("Delete 1 photo", { exact: true }).click();
    await see(/Originals can only be deleted in the Pictopia phone app/);
    await shot("ready-web");
    pass("Ready to delete names the exact count, and the browser explains it can't delete originals");
    await page.getByLabel("Back, nothing is deleted").click();

    await page.getByRole("button", { name: /^Continue your trip\./ }).click();
    await page.getByText(new RegExp(`^\\d+ of ${total}$`)).first().waitFor({ timeout: 20000 });
    pass("Continue on Home resumes the same review");

    // Scroll to the last photo, then the iPhone sequence that corrupted the saved place:
    // mark the last photo, scroll back, mark an earlier one.
    for (let i = 0; i < total + 2; i++) {
      if (await page.getByText(`${total} of ${total}`, { exact: true }).count()) break;
      await page.mouse.move(cx, cy);
      await page.mouse.wheel(0, feed.height);
      await page.waitForTimeout(450);
    }
    await see(`${total} of ${total}`);
    await page.waitForTimeout(500);
    await flick();
    await see(`End of ${total}`);
    await see(/^That’s all \d+$/);
    if (await page.getByText(/left today/).count()) throw Error("No running allowance counter in review");
    for (let i = 0; i < 4 && !(await page.getByText(`${total - 2} of ${total}`, { exact: true }).count()); i++) { await page.mouse.move(cx, cy); await page.mouse.wheel(0, -feed.height); await page.waitForTimeout(700); }
    await see(`${total - 2} of ${total}`);
    await page.waitForTimeout(400);
    await flick();
    await see(`${total - 1} of ${total}`);
    await page.waitForTimeout(800);
    if (await page.getByText(/Couldn’t save your place/).count()) throw Error("The saved place broke again");
    // The end card is rendered off-screen below; the header says where the screen really is.
    if (await page.getByText(`End of ${total}`, { exact: true }).count()) throw Error("A false end card appeared");
    await see(`${total - 1} of ${total}`);
    pass("Marking the last photo, scrolling back and marking another keeps the place, with no error and no false end card");
    await page.mouse.move(cx, cy); await page.mouse.wheel(0, feed.height); await page.waitForTimeout(600);
    await see(/^That’s all \d+$/);
    await shot("end-card");
    await page.getByText("Finish", { exact: true }).click();
    await see(/· Complete$/);
    await see("Review 3 marked photos");
    await page.getByText(/^(of your library|library explored)$/).last().waitFor({ timeout: 20000 });
    await shot("completion");
    pass("The end card's Finish opens Completion with the marked count");

    await page.getByText("Review 3 marked photos", { exact: true }).click();
    await see(/^From this review · 3$/);
    pass("Ready to delete groups this review's marks first");
    for (let i = 0; i < 3; i++) { await page.getByLabel(/Tap to keep it$/).first().click(); await page.waitForTimeout(400); }
    await see("Nothing waiting");
    await page.getByText("Done", { exact: true }).last().click();
    await see("Where to today?");
    pass("Keeping the last photo empties the list; Done returns to the review's origin");

    await page.getByText("Explore", { exact: true }).last().click();
    await see("Months & Years");
    await shot("explore");
    if (await page.getByText("Albums", { exact: true }).count()) throw Error("The browser has no albums to show");
    await page.getByRole("button", { name: /^2021, / }).click();
    await see(/^\d+% explored$/, 20000);
    await shot("collection");
    pass("A year opens in the shared review with collection progress in the header");
    await page.getByLabel("Back. Your place is saved").last().click();

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
