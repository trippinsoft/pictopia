/* global document */
// Browser checks for Vertical Explore on the real feed with chosen photos: mouse/touch flicks,
// wheel scrolling and Next land exactly one page; discarded photos leave the feed (also when
// scrolling back); tapping the photo undoes the latest discard into its original slot.
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
  const counter = (n, total) =>
    page.getByText(`${n} / ${total}`, { exact: true }).waitFor({ timeout: 5000 });
  const discards = (n) =>
    page
      .getByLabel("Review experimental discards")
      .getByText(String(n), { exact: true })
      .waitFor({ timeout: 5000 });
  const pass = (message) => console.log(`PASS ${message}`);
  try {
    await page.goto((process.env.PREVIEW_URL || "http://localhost:32622") + "/vertical-explore");
    const chooser = page.waitForEvent("filechooser");
    await page.getByText("Choose Photos", { exact: true }).click();
    // Six distinct files.
    const files = ["icon.png", "adaptive-icon.png", "splash.png", "favicon.png", "icon.png", "splash.png"];
    await (await chooser).setFiles(
      files.map((f, i) => ({
        name: `explore-${i}.png`,
        mimeType: "image/png",
        // A trailing byte after IEND keeps each file's bytes (and data URL) unique.
        buffer: Buffer.concat([fs.readFileSync(`assets/images/${f}`), Buffer.from([i])]),
      })),
    );
    await page.getByText("Start Vertical Explore", { exact: true }).click({ timeout: 20000 });
    await page.getByText("Let’s explore", { exact: true }).click();
    await counter(1, 6);
    const feed = await page.getByLabel("Vertically paged photo feed").boundingBox();
    const cx = feed.x + feed.width / 2,
      cy = feed.y + feed.height / 2;
    // The photo actually painted at the centre of the feed.
    const shown = async () => {
      await page.waitForTimeout(150);
      return page.evaluate(
        // Images ignore pointer hit-testing, so find the one whose box covers the centre.
        ([x, y]) =>
          [...document.querySelectorAll("img")].find((img) => {
            const r = img.getBoundingClientRect();
            return r.left <= x && r.right >= x && r.top <= y && r.bottom >= y;
          })?.src ?? null,
        [cx, cy],
      );
    };
    const flick = async (dy, pause = 120) => {
      await page.mouse.move(cx, cy - dy / 2);
      await page.mouse.down();
      await page.mouse.move(cx, cy + dy / 2, { steps: 3 });
      await page.mouse.up();
      await page.waitForTimeout(pause);
    };
    const sideways = async (dx) => {
      await page.waitForTimeout(300);
      await page.mouse.move(cx, cy);
      await page.mouse.down();
      await page.mouse.move(cx + dx, cy + 4, { steps: 8 });
      await page.mouse.up();
    };
    const tap = async () => {
      await page.waitForTimeout(250);
      await page.mouse.click(cx, cy);
    };

    // Mouse flick upward.
    const A = await shown();
    await page.mouse.move(cx, cy + 150);
    await page.mouse.down();
    await page.mouse.move(cx, cy - 150, { steps: 6 });
    await page.mouse.up();
    await counter(2, 6);
    const B = await shown();
    pass("Mouse flick up advances one photo");
    // Quick short flick.
    await page.mouse.move(cx, cy + 40);
    await page.mouse.down();
    await page.mouse.move(cx, cy - 30, { steps: 3 });
    await page.mouse.up();
    await counter(3, 6);
    const C = await shown();
    pass("Short fast flick advances one photo");
    // Flick down returns, wheel scroll advances.
    await flick(300, 0);
    await counter(2, 6);
    if ((await shown()) !== B) throw Error("Flick down didn't return to the previous photo");
    pass("Flick down returns one photo");
    await page.mouse.move(cx, cy);
    await page.mouse.wheel(0, feed.height);
    await counter(3, 6);
    pass("Wheel scroll advances one photo");

    // Sideways drag discards photo 3; photo 4 takes its place and the feed shrinks.
    await sideways(-160);
    await counter(3, 5);
    await discards(1);
    const D = await shown();
    if (!D || [A, B, C].includes(D))
      throw Error(`The next photo didn't replace the discarded one: ${[A, B, C, D].map((v) => v?.slice(0, 60)).join(" | ")}`);
    pass("Left discard removes the photo and shows the next one in its place");
    // Scrolling back skips the discarded photo entirely.
    await flick(200);
    await counter(2, 5);
    if ((await shown()) !== B) throw Error("Back from photo 4 should show photo 2");
    await flick(200);
    await counter(1, 5);
    if ((await shown()) !== A) throw Error("Back should reach photo 1");
    pass("Backward scrolling never shows the discarded photo");
    // Undo after navigating away: tap restores it into its slot and shows it.
    await flick(-200);
    await flick(-200);
    await counter(3, 5);
    await flick(-200);
    await counter(4, 5);
    await tap();
    await counter(3, 6);
    await discards(0);
    await page.waitForTimeout(450); // Slide-in from the left.
    if ((await shown()) !== C) throw Error("Undo should show the restored photo");
    pass("Tapping the photo undoes the discard, in its original slot, from elsewhere in the feed");

    // Right discard, then the last photo, then undo them newest first.
    await sideways(160);
    await counter(3, 5);
    await flick(-200);
    await counter(4, 5);
    const E = await shown();
    await sideways(-160);
    await counter(4, 4);
    const F = await shown();
    await sideways(160);
    await counter(3, 3);
    if ((await shown()) !== D) throw Error("Discarding the last photo should show the previous one");
    await discards(3);
    pass("Discarding the last photo shows the nearest earlier photo");
    await flick(200);
    await flick(200);
    await counter(1, 3);
    await tap();
    await counter(4, 4);
    await page.waitForTimeout(450);
    if ((await shown()) !== F) throw Error("First undo should restore the last photo");
    await tap();
    await counter(4, 5);
    await page.waitForTimeout(450);
    const second = await shown();
    if (second !== E)
      throw Error(`Second undo should restore photo 5: ${[A, B, C, D, E, F, second].map((v) => v?.slice(-6)).join(" ")}`);
    await tap();
    await counter(3, 6);
    await discards(0);
    await page.waitForTimeout(450);
    if ((await shown()) !== C) throw Error("Third undo should restore photo 3");
    await tap();
    await page.waitForTimeout(300);
    await counter(3, 6);
    pass("Several undos restore newest first; an extra tap with nothing to undo does nothing");

    // Drags never count as taps.
    await sideways(-160);
    await counter(3, 5);
    await page.waitForTimeout(300);
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx, cy - 40, { steps: 6 });
    await page.mouse.move(cx, cy, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(300);
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 40, cy, { steps: 6 });
    await page.mouse.move(cx, cy, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(500);
    await counter(3, 5);
    await discards(1);
    pass("Cancelled vertical and sideways drags don't undo");

    // Rapid flicks, each made while the previous one is still snapping into place.
    await flick(200);
    await flick(200);
    await counter(1, 5);
    pass("Back-to-back flicks each land one page");
    await flick(-200);
    await flick(-200);
    await flick(200);
    await counter(2, 5);
    pass("Rapid up/up/down flicks land on the right photo");
    await page.getByText("Next ↑", { exact: true }).click();
    await counter(3, 5);
    pass("Next advances one photo at a time");
    // Undo button, then discard button.
    await page.getByLabel("Undo latest discard").click();
    await counter(3, 6);
    await page.waitForTimeout(450);
    await page.getByText("Discard", { exact: true }).click();
    await counter(3, 5);
    pass("Undo and Discard buttons match the gestures");

    await page.reload();
    await counter(3, 5);
    await discards(1);
    pass("Place and discards persist across reload");
    await page.waitForTimeout(600);
    await tap();
    await counter(3, 6);
    pass("Undo still works after reload");
    const errors = logs.filter((l) => /Error|Warning: Encountered two children/.test(l));
    if (errors.length) throw Error(`Console errors:\n${errors.join("\n")}`);
    pass("No console errors or duplicate keys");
  } catch (e) {
    console.log(logs.slice(-30).join("\n"));
    fs.mkdirSync("/tmp/ex", { recursive: true });
    await page.screenshot({ path: "/tmp/ex/explore-failure.png" });
    throw e;
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
