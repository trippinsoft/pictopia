const { chromium } = require("playwright");
const assert = require("node:assert/strict");
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    await page.goto(process.env.PREVIEW_URL || "http://localhost:17290");
    await page.getByText("Add photos", { exact: true }).waitFor();
    const payload = await page.evaluate(async () => {
      const canvas = document.createElement("canvas");
      canvas.width = 320;
      canvas.height = 240;
      const ctx = canvas.getContext("2d");
      const stream = canvas.captureStream(12),
        parts = [];
      const recorder = new MediaRecorder(stream, { mimeType: "video/webm;codecs=vp8" });
      recorder.ondataavailable = (e) => parts.push(e.data);
      const finished = new Promise((resolve) => (recorder.onstop = resolve));
      recorder.start();
      let n = 0;
      const timer = setInterval(() => {
        ctx.fillStyle = n++ % 2 ? "#b9e2d1" : "#174a40";
        ctx.fillRect(0, 0, 320, 240);
      }, 80);
      await new Promise((r) => setTimeout(r, 1000));
      recorder.stop();
      await finished;
      clearInterval(timer);
      stream.getTracks().forEach((t) => t.stop());
      return Array.from(
        new Uint8Array(await new Blob(parts, { type: "video/webm" }).arrayBuffer()),
      );
    });
    const chooser = page.waitForEvent("filechooser");
    await page.getByText("Add photos", { exact: true }).click();
    await (
      await chooser
    ).setFiles([
      { name: "real-test-clip.webm", mimeType: "video/webm", buffer: Buffer.from(payload) },
    ]);
    await page.getByText("1 item • 0 reviewed").waitFor();
    await page.getByText("Videos", { exact: true }).click();
    await page.getByText("1 of 1 in this batch").waitFor();
    await page.getByRole("button", { name: "Keep", exact: true }).waitFor();
    await page.getByLabel("Open full-screen media preview").click();
    await page.getByText("Video preview", { exact: true }).waitFor();
    const video = page.locator("video[controls]");
    await video.waitFor();
    const state = await video.evaluate(async (el) => {
      await new Promise((resolve, reject) => {
        if (el.readyState >= 2) resolve();
        else {
          el.onloadeddata = resolve;
          el.onerror = reject;
        }
      });
      await el.play();
      await new Promise((r) => setTimeout(r, 250));
      el.pause();
      el.currentTime = Math.min(0.1, el.duration / 2);
      return {
        duration: el.duration,
        currentTime: el.currentTime,
        paused: el.paused,
        controls: el.controls,
      };
    });
    assert.ok(state.duration > 0);
    assert.equal(state.paused, true);
    assert.ok(state.currentTime > 0);
    assert.equal(state.controls, true);
    assert.deepEqual(errors, []);
    console.log(
      "PASS Real WebM file import, video collection, preview, play, pause, seek, and native browser controls; no runtime errors",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
