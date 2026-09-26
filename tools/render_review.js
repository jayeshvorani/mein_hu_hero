// Renders the review images for the deliverable-reviewer into review/.
// Run through the Playwright MCP server (browser_run_code_unsafe with this
// file) while the repo folder is served on http://127.0.0.1:8765/.
// Set REVIEW_DIR to the absolute path of this repo's review/ folder.
async (page) => {
  const R = "REVIEW_DIR/"; // replaced with the local path before running
  const B = "http://127.0.0.1:8765/";
  // Editor screenshots are about the page, not a passing message: any
  // toast is dismissed first so nothing under it goes unchecked. The one
  // shot that is about the toast (08) passes { keepToast: true }.
  const shot = async (n, o) => {
    o = o || {};
    if (!o.keepToast)
      await page.evaluate(() => {
        const t = document.getElementById("toast");
        if (t) t.hidden = true;
      });
    const { keepToast, ...opts } = o;
    return page.screenshot({ path: R + n + ".png", ...opts });
  };

  // never render from the HTTP cache: a stale editor.js once hid a fix
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });

  // start clean: no service worker, no caches, no draft, no settings
  await page.goto(B + "index.html");
  await page.evaluate(async () => {
    for (const r of await navigator.serviceWorker.getRegistrations())
      await r.unregister();
    for (const k of await caches.keys()) await caches.delete(k);
    localStorage.clear();
  });
  await page.emulateMedia({
    colorScheme: "light",
    reducedMotion: "no-preference",
  });

  // A draft with one sound effect in the library and placed in scene 1,
  // so songs and sound effects can be seen side by side in the editor.
  await page.evaluate(async () => {
    const show = await (await fetch("show.json")).json();
    const baseJson = JSON.stringify(show);
    show.sfx.push({ id: "sfx-demo", title: "Door knock", file: "Audio files/sfx/door-knock.mp3" });
    show.scenes[0].items.splice(3, 0, { id: "i-demo", type: "sfx", sfxId: "sfx-demo", note: "three sharp knocks" });
    localStorage.setItem("mhh-editor-draft", JSON.stringify({ show, baseSha: null, baseJson }));
  });

  // ---- editor, laptop ----
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(B + "editor.html");
  await page.waitForSelector(".card");
  await shot("01-editor-script-1440");
  await page.click("#hintClose");
  await page.click(".card:nth-child(3) .rich");
  await page.keyboard.press("End");
  await page.hover(".card:nth-child(3)");
  await shot("02-editor-editing-1440");
  await page.click(".card:nth-child(1) .rich");
  await shot("02b-editor-editing-top-1440");
  await page.click(".card:nth-child(5) .rich");
  await page.waitForTimeout(150);
  await shot("02c-editor-editing-next-box-1440");
  await page.click(".card:nth-child(4) .insert-before");
  await shot("03-editor-insert-menu-1440");
  await page.keyboard.press("Escape");
  await page.click('[data-act="toggle-details"][data-scene="scene-3"]');
  await page.evaluate(() =>
    document.getElementById("blk-scene-3").scrollIntoView(),
  );
  await shot("04-editor-scene-details-1440");
  await page.click('.tab[data-tab="cast"]');
  await shot("05-editor-cast-1440", { fullPage: true });
  await page.click('[data-act="remove-character"][data-char="bhairav"]');
  await shot("06-editor-remove-dialog-1440");
  await page.keyboard.press("Escape");
  await page.click('.tab[data-tab="sounds"]');
  await shot("07-editor-sounds-1440");
  await page.click('.tab[data-tab="places"]');
  await shot("07b-editor-places-1440", { fullPage: true });
  await page.click('.tab[data-tab="show"]');
  await shot("07c-editor-show-1440", { fullPage: true });
  await page.click('.tab[data-tab="script"]');
  await page.click('.card:nth-child(2) [data-act="delete"]');
  await page.waitForTimeout(200);
  await shot("08-editor-deleted-toast-1440", { keepToast: true });
  await page.click("#toastBtn");

  // the scene 1 songs and the sound effect, side by side
  await page.evaluate(() => {
    const c = document.querySelector('.card[data-id="i12-s1"]');
    window.scrollTo({ top: c.getBoundingClientRect().top + scrollY - 200, behavior: "instant" });
  });
  await page.waitForTimeout(300);
  await shot("08b-editor-song-and-sfx-cards-1440");

  // ---- editor, phone and tablet (the editor is light-theme only) ----
  for (const w of [360, 390, 768]) {
    await page.setViewportSize({ width: w, height: 844 });
    await page.goto(B + "editor.html");
    await page.waitForSelector(".card");
    await shot(`09-editor-script-${w}`);
    await page.evaluate(() => {
      const c = document.querySelector('.card[data-id="i-demo"]');
      window.scrollTo({ top: c.getBoundingClientRect().top + scrollY - 150, behavior: "instant" });
    });
    await page.waitForTimeout(300);
    await shot(`09b-editor-sfx-card-${w}`);
    await page.click('.tab[data-tab="cast"]');
    await shot(`10-editor-cast-${w}`, { fullPage: true });
    await page.click('.tab[data-tab="sounds"]');
    await shot(`11-editor-sounds-${w}`, { fullPage: true });
    await page.click('.tab[data-tab="places"]');
    await shot(`11b-editor-places-${w}`, { fullPage: true });
    await page.click('.tab[data-tab="show"]');
    await shot(`11c-editor-show-${w}`, { fullPage: true });
    await page.click('.tab[data-tab="script"]');
    await page.click('[data-act="toggle-details"][data-scene="scene-2"]');
    await page.evaluate(() => document.getElementById("blk-scene-2").scrollIntoView());
    await shot(`11d-editor-scene-details-${w}`);
  }

  // ---- site preview with one sound effect placed ----
  // Set from the site page, not the editor: the editor saves its own draft
  // when it is left, which would overwrite this one.
  await page.goto(B + "index.html");
  await page.evaluate(async () => {
    localStorage.clear();
    const show = await (await fetch("show.json")).json();
    show.sfx.push({
      id: "sfx-demo",
      title: "Door knock",
      file: "Audio files/sfx/door-knock.mp3",
    });
    show.scenes[1].items.splice(3, 0, {
      id: "i-demo",
      type: "sfx",
      sfxId: "sfx-demo",
      note: "three sharp knocks",
    });
    localStorage.setItem("mhh-editor-draft", JSON.stringify({ show }));
  });
  const matrix = [];
  for (const w of [360, 390, 768, 820, 1440])
    for (const th of ["dark", "light"]) matrix.push([w, w > 900 ? 900 : 844, th]);
  for (const [w, h, th] of matrix) {
    await page.setViewportSize({ width: w, height: h });
    await page.emulateMedia({ colorScheme: th });
    await page.goto(B + "index.html?draft");
    await page.waitForSelector("section.scene");
    await page.waitForTimeout(400);
    await shot(`12-site-preview-top-${w}-${th}`);
    const to = async (sel, off) => {
      await page.evaluate(
        ([sel, off]) => {
          document
            .querySelectorAll(".reveal-on-scroll")
            .forEach((e) => e.classList.add("in-view"));
          const r = document.querySelector(sel).closest(".line, section");
          window.scrollTo({
            top: r.getBoundingClientRect().top + scrollY - off,
            behavior: "instant",
          });
        },
        [sel, off],
      );
      await page.waitForTimeout(600);
    };
    await to(".cue-row .c-sfx", 250);
    await shot(`13-site-sfx-${w}-${th}`);
    await to(".cue-row .c-music", 300);
    await shot(`14-site-song-${w}-${th}`);
    await to("#legend", 80);
    await shot(`15-site-legend-${w}-${th}`);
    await page.evaluate(() => { document.querySelector("#crew-checklist details").open = true; });
    await to("#crew-checklist", 80);
    await shot(`16-site-crew-checklist-${w}-${th}`);
    await to("#scene-2 .meta-box", 90);
    await shot(`17-site-scene-details-${w}-${th}`);
  }
  await page.emulateMedia({ colorScheme: "light" });
  await page.evaluate(() => localStorage.clear());
  return "rendered";
}
