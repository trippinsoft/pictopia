// Browser checks for Vertical Explore paging: mouse/touch flicks, wheel scrolling and Next
// must each land exactly one page further and persist that place.
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
  const counter = (n, total) => page.getByText(`${n} / ${total}`, { exact: true }).waitFor({ timeout: 5000 });
  try {
    await page.goto((process.env.PREVIEW_URL || "http://localhost:32622") + "/vertical-explore");
    const chooser = page.waitForEvent("filechooser");
    await page.getByText("Choose Photos", { exact: true }).click();
    const files = ["icon.png", "adaptive-icon.png", "splash.png", "favicon.png"];
    await (await chooser).setFiles(
      files.map((f, i) => ({
        name: `explore-${i}.png`,
        mimeType: "image/png",
        buffer: fs.readFileSync(`assets/images/${f}`),
      })),
    );
    await page.getByText("Start Vertical Explore", { exact: true }).click({ timeout: 20000 });
    await page.getByText("Let’s explore", { exact: true }).click();
    await counter(1, 4);
    const feed = await page.getByLabel("Vertically paged photo feed").boundingBox();
    const cx = feed.x + feed.width / 2,
      cy = feed.y + feed.height / 2;
    // Mouse flick upward.
    await page.mouse.move(cx, cy + 150);
    await page.mouse.down();
    await page.mouse.move(cx, cy - 150, { steps: 6 });
    await page.mouse.up();
    await counter(2, 4);
    console.log("PASS Mouse flick up advances one photo");
    // Quick short flick.
    await page.mouse.move(cx, cy + 40);
    await page.mouse.down();
    await page.mouse.move(cx, cy - 30, { steps: 3 });
    await page.mouse.up();
    await counter(3, 4);
    console.log("PASS Short fast flick advances one photo");
    // Flick down returns.
    await page.mouse.move(cx, cy - 150);
    await page.mouse.down();
    await page.mouse.move(cx, cy + 150, { steps: 6 });
    await page.mouse.up();
    await counter(2, 4);
    console.log("PASS Flick down returns one photo");
    await page.mouse.move(cx, cy);
    await page.mouse.wheel(0, feed.height);
    await counter(3, 4);
    console.log("PASS Wheel scroll advances one photo");
    // Sideways mouse drag discards photo 3 and slides photo 4 in.
    await page.waitForTimeout(300);
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx - 160, cy + 4, { steps: 8 });
    await page.mouse.up();
    await counter(4, 4);
    await page.getByLabel("Review experimental discards").getByText("1").waitFor();
    console.log("PASS Sideways drag discards and shows the next photo");
    // Rapid flicks, each made while the previous one is still snapping into place.
    const flick = async (dy) => {
      await page.mouse.move(cx, cy - dy / 2);
      await page.mouse.down();
      await page.mouse.move(cx, cy + dy / 2, { steps: 3 });
      await page.mouse.up();
      await page.waitForTimeout(120);
    };
    await flick(200);
    await flick(200);
    await counter(2, 4);
    console.log("PASS Back-to-back flicks each land one page");
    await flick(-200);
    await flick(-200);
    await flick(200);
    await counter(3, 4);
    console.log("PASS Rapid up/up/down flicks land on the right photo");
    await page.getByText("Next ↑", { exact: true }).click();
    await counter(4, 4);
    console.log("PASS Next advances one photo at a time");
    await page.reload();
    await counter(4, 4);
    console.log("PASS Place persists across reload");
  } catch (e) {
    console.log(logs.slice(-30).join("\n"));
    await page.screenshot({ path: "/tmp/ex/explore-failure.png" });
    throw e;
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
