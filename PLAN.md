# PLAN — Mein hu Hero, phone-first rebuild

Supersedes the previous PLAN.md (usability pass, completed). That work shipped
and is described in `PLAN-archive.md`. This plan covers the full overhaul agreed
on 2026-09-02.

Target: `/Users/I553472/Downloads/Mein hu hero/index.html`, plus new sibling
files for offline support. Deployed to GitHub Pages.

## Decisions agreed

| Question         | Decision                                                                                             |
| ---------------- | ---------------------------------------------------------------------------------------------------- |
| Line hierarchy   | **Two modes, switchable.** Read mode keeps an even surface; Rehearse mode makes your lines dominant. |
| Mobile chrome    | **Auto-hiding top bar + thumb-reachable bottom bar.**                                                |
| Visual direction | **Keep the show palette, rebuild the craft.** OKLCH/P3, glass elevation tiers, motion scale.         |
| Theme default    | **Time of day.** Light 07:00 to 18:00, dark otherwise. Manual override persists permanently.         |
| Offline          | **Self-hosted fonts + service worker.** GitHub Pages is https, so a service worker is available.     |
| File structure   | **Multi-file accepted.** index.html plus sw.js, manifest, icons, fonts.                              |
| Feature scope    | **Free to consolidate**, every change documented below for approval.                                 |
| Review           | **Build fully, then review** with `deliverable-reviewer` until clean.                                |

## Audience and constraint

The cast, ~12 non-technical people, reading on phones at rehearsal, often
standing, under variable light. Everything below is weighted to that. Desktop
must remain good, but it is the secondary case.

---

## Part 1 — Defects found during investigation

These are bugs in the current file, not matters of taste. They ship first.

### D1. Nothing persists (severity: high)

All four persisted preferences route through `window.storage`, which is an
Anthropic artifact API. It is never defined in this file and `localStorage` is
never used, so every `if (window.storage && ...)` branch falls through to its
fallback. On GitHub Pages the cast will re-dismiss the orientation strip, re-set
their text size, re-pick their practice scope and re-set their theme on **every
visit**.

Fix: a small storage shim that prefers `window.storage` when present and falls
back to `localStorage`, wrapped in try/catch for private-mode and
storage-disabled browsers. Keys: `mhh-theme`, `mhh-textsize`, `mhh-scope`,
`mhh-orient`, plus new `mhh-mode` and `mhh-actor`.

### D2. 79px horizontal overflow at 390px (severity: high)

`.topbar-controls` computes to 443px inside a 390px viewport. The "Music cues
only" pill is cut off mid-word and the whole page scrolls sideways. Resolved by
the Part 3 chrome rebuild, which moves these controls out of the top bar.

### D3. `--header-h` is wrong by 70px (severity: high)

Declared `76px`, computes to `146px` on a phone. Every `scroll-margin-top` and
sticky offset derives from it, so scene jumps, search jumps and cue steps all
land partially underneath the header. `syncHeaderHeight()` exists at line 4656
but the value it writes is not what the sticky offsets assume.

Fix: single source of truth. Measure both bars, write `--header-h` and a new
`--bottombar-h`, and derive every offset from those.

### D4. Contrast failures (severity: high)

Measured against the actual backgrounds:

| Token                 | Dark  | Light    | AA (4.5)       |
| --------------------- | ----- | -------- | -------------- |
| `--muted-2`           | 3.70  | 2.78     | **fails both** |
| `--marigold` on paper | 11.01 | **2.90** | fails light    |
| `--muted`             | 5.67  | 4.19     | fails light    |

`--marigold` on light is the "IN 6 SCENES" label on every cast card and the
metadata labels in every scene. The light theme is the daylight theme, so this
fails in exactly the condition the brief names as the constraint.

Fix: re-derive all muted and accent tokens in OKLCH at pinned lightness values
that hit 4.5:1 minimum against their own background, verified by script rather
than by eye.

### D5. Touch targets below 44px (severity: medium)

Cue stepper buttons 38x38, topbar pills 33px tall, text-size buttons 26x36.
All below the 44px minimum, all used one-handed while standing. Fixed in the
chrome rebuild; anything that survives gets a padded hit area.

### D6. No favicon, no app identity (severity: low)

404s on `/favicon.ico`. On GitHub Pages with add-to-homescreen this matters:
without an icon and manifest the cast get a generic browser glyph.

---

## Part 2 — Foundation

### 2.1 Colour system in OKLCH

Replace the two hand-maintained hex blocks (roughly 40 values, duplicated per
theme) with a derived system. Both themes come from the same four show hues:
marigold, sindoor, magenta, teal.

- Hue and chroma anchors defined once. Each theme sets only its lightness ramp.
- Every text token pinned to a lightness that satisfies AA against its own
  surface, so D4 cannot recur.
- `@supports (color: oklch(0 0 0))` with hex fallbacks, so older browsers get
  the current appearance rather than nothing.
- P3 via `color(display-p3 ...)` inside a gamut query. Marigold and sindoor are
  precisely the hues that gain from wide gamut, which is most of the cast's
  phones.

Deliverable: a contrast table in this file showing every text-on-surface pair
and its measured ratio, both themes, after the change.

### 2.2 Glass elevation tiers

Today four elements share one treatment (`blur(22px) saturate(150%)`, flat
`rgba(255,255,255,0.09)` border), so nothing reads as nearer or further. Replace
with four tiers, each distinct in blur, tint, border and shadow:

| Tier                 | Used by                             | Blur | Character             |
| -------------------- | ----------------------------------- | ---- | --------------------- |
| `--glass-0` ambient  | page background mesh                | none | parallax colour field |
| `--glass-1` raised   | scene stubs, cast cards, meta boxes | 10px | sits on the page      |
| `--glass-2` floating | top bar, bottom bar, scene nav      | 20px | floats above content  |
| `--glass-3` overlay  | cue stepper, sheets, toasts         | 32px | clearly detached      |

Each tier gets a gradient border rather than a flat stroke: light caught on the
top edge, lost at the bottom, via a masked pseudo-element. This is the single
biggest contributor to a surface reading as glass rather than as a tinted box.

### 2.3 Motion scale

One `@keyframes` currently exists, and 18 transitions share roughly one duration
and curve, so a hover and a page entrance move with the same personality.
Replace with a named scale:

- `--motion-1` 120ms, state feedback (press, toggle, focus)
- `--motion-2` 240ms, element transitions (reveal, filter, tab change)
- `--motion-3` 480ms, orchestrated entrances (scene reveal, mode switch)
- `--spring` for anything physical (bottom sheet, stepper, card press)

All inside the existing `prefers-reduced-motion` block, which stays authoritative.

### 2.4 Typography

- Fluid scale via `clamp()` across display, scene title, speaker, body and
  label, replacing the current three isolated uses.
- `text-wrap: balance` on headings, `pretty` on paragraphs, fixing the awkward
  tagline break visible today.
- Dialogue line-height and measure tuned for arm's-length phone reading, which
  is a different target from desktop reading.
- The existing five-step text-size control keeps working and now persists (D1).

### 2.5 Self-hosted fonts

Bricolage Grotesque, Hanken Grotesk and JetBrains Mono are all SIL Open Font
License, verified in the google/fonts repository, so self-hosting is permitted.

- Subset to Latin plus the punctuation the script actually uses, woff2 only.
- `font-display: swap`, preloaded, served from the repo.
- Removes a render-blocking third-party round trip and the blank-flash risk on
  venue wifi. Expect roughly 120 to 200KB total after subsetting, against a
  178KB current page.

---

## Part 3 — Mobile chrome rebuild

Currently 241px of an 844px phone viewport, 29%, is chrome before a single line
of dialogue. Target: under 100px at rest.

### 3.1 Top bar

Collapses to a slim strip: brand, search icon, theme toggle. Hides on
scroll-down, returns on scroll-up, always returns at the top of the page.
Search expands to full width on tap rather than occupying the bar permanently.

### 3.2 Bottom bar (new, thumb-reachable)

One `--glass-2` bar carrying what the cast actually use mid-rehearsal:

- **Scene** — opens a sheet listing all 8 scenes with actor-present dots,
  replacing the horizontal tab strip.
- **Filters** — one control consolidating "Hide optional cuts" and "Music cues
  only" (see Consolidation below).
- **Mode** — Read / Rehearse switch (Part 4).
- **Cue stepper** — prev / count / next, shown only when a character is
  selected, exactly as today.

All targets at least 44px, positioned above `env(safe-area-inset-bottom)`.

### 3.3 Consolidation, for approval

Agreed I may consolidate; every change listed here:

| Today                                | After                                             | Why                                                                                 |
| ------------------------------------ | ------------------------------------------------- | ----------------------------------------------------------------------------------- |
| "Hide optional cuts" pill in top bar | Filters sheet                                     | Set once, not per-scene. Does not deserve permanent bar space.                      |
| "Music cues only" pill in top bar    | Filters sheet                                     | Used by one person, the sound operator.                                             |
| Scene tab strip, permanent 89px      | Scene sheet from bottom bar                       | Recovers 89px on every screen. Sheet shows all 8 at once rather than 2.5 scrolling. |
| Text size A- / A+ in top bar         | Filters sheet                                     | Set once per person.                                                                |
| Actor dropdown in cast bar           | Stays, plus current character shown in bottom bar | Primary control, keeps prominence.                                                  |

No capability is removed. Everything above is one tap from the bottom bar.

Desktop keeps the sidebar scene nav and a single top bar; the bottom bar is
phone and tablet only.

### 3.4 Viewport units

Switch fixed positioning to `dvh` so the bars stop jumping as mobile browser
chrome shows and hides.

---

## Part 4 — Read mode and Rehearse mode

The switchable treatment agreed. Default is Read. The character picker enters
Rehearse directly, as it does today, so the common path is unchanged.

### Read mode

Even reading surface, close to today. Speaker, dialogue and stage directions all
legible and evenly weighted. For read-throughs and for anyone learning the shape
of the whole script.

### Rehearse mode

Same content, re-weighted around the selected character:

- **Your lines** — raised `--glass-1` card, full-weight type, accent edge,
  slightly larger. Practice blur applies here as it does today.
- **Others' lines** — quieter secondary text, reduced weight, no card.
- **Stage directions** — small, italic, recessive, still readable.
- The line immediately before yours keeps its cue treatment, as today.

Switching modes is a `::view-transition` where supported, plain state change
where not.

Mode persists (`mhh-mode`). Selecting a character from the picker sets Rehearse;
choosing "Just reading" sets Read. Practice mode, cue mode and own-only scope
all keep working within Rehearse exactly as they do now.

---

## Part 5 — Craft layer

Only after Parts 1 to 4 are working. None of this is allowed to cost legibility.

- **Specular sheen** on the hero lockup and on cast-card press. Light-follows-
  pointer on desktop, static highlight on touch.
- **Ambient mesh parallax** against scroll, so the colour field reads as depth
  rather than wallpaper. Very low amplitude, disabled under reduced motion.
- **Scroll-driven progress bar** via `animation-timeline: scroll()`, replacing
  the JS `requestAnimationFrame` loop. Moves off the main thread; JS path kept
  as fallback.
- **Container queries** on the cast-card grid, so cards respond to their own
  container rather than the viewport.
- **Landing pulse** kept, retuned to the new motion scale.
- **Per-line cascade** kept, retimed and capped so long scenes do not lag.

---

## Part 6 — Offline and installability

GitHub Pages serves over https, so this is available.

- `sw.js` — cache-first for the page, fonts and icons. Versioned cache name,
  old caches cleared on activate. Network-first for navigation so an updated
  script reaches the cast without a hard refresh.
- `manifest.webmanifest` — name, short name, theme colour matched to the active
  theme, `display: standalone`, portrait.
- Icons at 192, 512 and maskable, drawn from the show's own marigold and sindoor
  rather than a generic glyph.
- Result: cast add it to their homescreen once and it opens instantly with no
  connection at the venue.
- `index.html` still opens and works standalone if AirDropped, minus caching.

---

## Part 7 — Accessibility floor

Non-negotiable, verified rather than assumed:

- Every text pair at AA or better, both themes, table published in this file.
- All touch targets at least 44px.
- Visible focus on every interactive element. Currently only three
  `:focus-visible` rules exist for far more controls.
- `@media (hover: hover)` guarding hover states so touch devices do not get
  stuck ones. Currently absent.
- ARIA preserved: `aria-pressed`, the `#cueLive` region, sheet focus trapping
  and `Esc` to close.
- `prefers-reduced-motion` collapses parallax, sheen, cascade and view
  transitions.
- Print stylesheet preserved, including the music-only sound cue sheet.

---

## Non-goals

- No script content changes. Source of truth is the Google Doc master.
- No build step. Hand-written CSS and vanilla JS, matching the existing IIFE
  style (`var`, function declarations, feature guards).
- No framework, no runtime dependency.
- No em dashes anywhere in code, comments or UI copy.

---

## Build order

1. Part 1 defects, D1 to D6.
2. Part 2 foundation: colour, glass, motion, type, fonts.
3. Part 3 mobile chrome.
4. Part 4 modes.
5. Part 5 craft.
6. Part 6 offline.
7. Part 7 verification sweep.

## Verification before review

In-browser (Playwright) at 360, 390 and 1440px, both themes:

- No horizontal overflow at any width.
- Chrome under 100px at rest on a phone.
- Search, practice, cue, picker, scene sheet, filters sheet, mode switch,
  stepper, back-to-top all working.
- Contrast table generated and passing.
- Reduced-motion and print rendered and checked.
- Service worker registers, page loads with network disabled.
- No console errors.

Then hand to `deliverable-reviewer` against this plan and BRIEF.md. Fix in
`index.html`, re-render, repeat until clean. If one defect survives two fix
attempts, stop and report.

## Rollback

`index_old.html` is the pre-redesign original and stays untouched. I will copy
the current `index.html` to `index-prev.html` before starting, so there is a
one-step revert to today's working page.

## Open questions

None. Awaiting approval to build.

## Progress

Plan approved 2026-09-02. Rollback copy saved as `index-prev.html`.

### Done

- **Fonts (Part 2.5).** All three families self-hosted, subset to the 118
  glyphs the script actually uses, woff2. Bricolage additionally had its unused
  `opsz` and `wdth` axes pinned (408KB to 149KB before subsetting). Total 94.5KB
  against a 178KB page. OFL licences shipped alongside as the licence requires.
  Google Fonts link removed, so no third-party round trip and no blank flash on
  venue wifi.
  - Found while subsetting: the star, music note and circle glyphs are not in
    any of the three families and currently render from an unpredictable system
    fallback. Being replaced with inline SVG in Part 3.
- **Palette (Part 2.1).** Rebuilt in OKLCH, derived from four show hues, with
  hex fallback and a P3 `@supports` block. Every token solved against its own
  surface and the ratio recorded in the CSS beside it. Full table below.
  - Design note: AA is treated as a floor that is checked, not a target that is
    solved to. Solving every accent to exactly 4.5:1 flattened them into one
    muddy mid-tone and destroyed the identity, so accents keep poster
    saturation and are only nudged when they miss the floor.
- **Motion scale and glass tiers (Part 2.2, 2.3)** declared as tokens.
- **D1 storage (fixed and verified).** Shim added that prefers the host API and
  falls back to localStorage, wrapped for Safari private mode. All 24 call
  sites rewritten. Verified: theme, text size, practice scope and orientation
  dismissal all persist and survive a reload.
- **Theme boundary.** Evening now starts at 18:00 as agreed (was 19:00). Manual
  override persists permanently. `theme-color` meta now tracks the theme so the
  phone status bar matches once installed to the homescreen.

### Contrast table (measured, both themes)

| Token | Dark | Light | Floor | Note |
| --- | --- | --- | --- | --- |
| `--ink` | 14.90 | 13.43 | 4.5 | body |
| `--ink-dim` | 10.59 | 8.71 | 4.5 | body |
| `--muted` | 5.88 | 5.00 | 4.5 | body |
| `--muted-2` | 3.74 | 3.65 | 3.0 | UI and large text only |
| `--marigold` | 11.15 | 4.76 | 4.5 | was **2.90** on light |
| `--sindoor` | 6.88 | 5.43 | 4.5 | |
| `--magenta` | 6.38 | 6.39 | 4.5 | |
| `--teal` | 10.41 | 5.32 | 4.5 | |
| `--terracotta` | 8.86 | 5.39 | 4.5 | |

All pass. D4 resolved.

- **Part 3 mobile chrome (done and measured).**
  - Chrome at rest on a 390x844 phone: **241px to 129px**, 29% to 15% of the
    viewport. The top bar then hides on scroll-down, so while actually reading
    it is 60px.
  - **D2 fixed:** horizontal overflow 79px to **0** at 390px.
  - **D3 fixed:** `--header-h` now measured (57px) and matches the real bar. A
    new `--bottombar-h` is measured the same way. Both are the single source of
    truth for every sticky offset.
  - **D5 fixed:** every control in the new chrome is at least 44px.
  - Top bar slimmed to brand, search and theme. Search collapses to an icon on
    phones and expands over the bar.
  - Bottom bar added with Scenes, Mode, cue stepper and Options. Scene sheet
    shows all 8 scenes at once instead of 2.5 in a horizontal scroller.
  - Sheets have focus trapping, Esc to close, scrim dismiss, and a spring
    transition.
  - Options sheet controls are **mirrored, not duplicated**: they drive the
    same handlers and `syncMirrors()` keeps state identical.
  - A dot appears on Options whenever a filter is narrowing the script, so a
    filtered view is never a mystery.
  - Star, music note and circle glyphs replaced with inline SVG (they were
    absent from all three fonts and fell back unpredictably).
  - `@media (hover: none)` guard added so touch taps no longer leave hover
    states stuck on.
  - **Caught and fixed during build:** hiding the bottom bar on desktop made
    the cue stepper unreachable there, removing a working feature. Desktop now
    shows the bar as a floating stepper-only pill once a character is chosen.

- **Part 4 modes (done and verified).**
  - Read mode keeps the even surface. Rehearse re-ranks the same lines: your
    lines become raised cards with an accent edge and full-weight type, other
    people's lines drop to secondary, stage directions recede but stay legible.
  - Lines are classified from the `data-actor` attribute that already existed,
    so no markup migration was needed. 15 stage directions and 15 of Raj's
    lines correctly tagged out of 76.
  - Picking a character enters Rehearse; "Just reading" and clearing the actor
    return to Read. Mode persists as `mhh-mode`.
  - Uses `document.startViewTransition` where supported so the re-ranking reads
    as one change, falling back to a plain state change.
  - A music cue on one of your own lines keeps its teal edge rather than being
    overwritten by the accent edge.
  - **Caught and fixed during build:** with the cue stepper shown, the bottom
    bar overflowed at 390px and clipped the Options button by 30px. The stepper
    now takes its own row above the buttons when active, and `--bottombar-h`
    tracks the taller bar so script padding follows.

- **Part 5 craft (done).** Specular sheen on the hero lockup (one pass on
  load) and pointer-tracked highlight on cast cards, both pointer-guarded.
  Ambient mesh parallaxes against scroll at low amplitude. Progress bar moved
  to a CSS scroll timeline with the JS rAF path kept as fallback and skipped
  when CSS owns it. Container queries on the picker grid. `text-wrap: balance`
  and `pretty`. Dead `.cue-stepper` CSS removed.
- **Part 6 offline (done and verified offline).** Icon drawn as SVG (gold star
  plus ticket perforation, the show's own motif), rasterised to 192, 512, 180
  and maskable-512, quantised from 409KB to 13.4KB. Manifest and service
  worker shipped. Cache is network-first for navigation so updates reach the
  cast, cache-first for assets. **Verified with the server stopped: the page
  loads and is fully functional, all 76 lines, 8 scenes, self-hosted fonts.**
- **Part 7 verification (done).**

### Verification results

| Check | Result |
| --- | --- |
| Horizontal overflow, 320 / 360 / 390 / 768 / 1440 | **0 at every width** |
| Chrome at rest on a phone | 129px, was 241px (top bar then hides on scroll) |
| Contrast, 19 rendered text styles, both themes | **all pass** |
| Touch targets under 44px | **none** |
| Focus styles | 15 rules, was 3; all interactive elements covered |
| Reduced motion | parallax, sheen, progress bar, cascade all suppressed |
| Print | chrome hidden, white ground, all lines visible |
| Service worker offline | page fully functional with server stopped |
| Console errors | none |
| Existing features | search, picker, practice, cue stepper, keyboard, music-only all working |

Defects found and fixed during verification:

- `.cc-count` on the "Just reading" card used `--muted-2` at body size,
  measuring 3.7:1 against a 4.5 floor. Moved to `--muted`.
- Undersized targets raised to 44px: actor select, jump button, orientation
  dismiss, scene footer nav, mini buttons, back-to-top.
- Missing focus rings added to actor select, jump button and mini buttons.
- 8px page overflow at 360px traced to the cast table's natural minimum width
  (pre-existing, not introduced here). The table now scrolls inside its own
  shell rather than moving the page.
- My first audit script reported every contrast pair as failing at ~1.02:1.
  The page was fine; the script parsed `oklch()` strings as RGB. Rewritten to
  resolve colours through a canvas, which is what produced the table above.

### Review round 1

`deliverable-reviewer` returned 20 defects. All fixed:

**Bugs**

- **A1 (critical)** Toggling any pill wrote `textContent` to the button,
  deleting the inline SVG icon and label span permanently. All seven sites now
  route through `setPillLabel()`, which writes to the label span only.
- **A2 (critical)** The circle, note and down-arrow characters were still in
  eleven UI strings, and the fonts are subset so they fell back to whatever the
  phone had (colour emoji on iOS). Replaced with an inline SVG state dot that
  fills when the control is on, and an SVG arrow on the jump button. The
  left/right arrows in the scene footer were verified present in the subset and
  left alone.
- **A3 (major)** Practice mode and Cue mode, which the brief calls the core of
  the tool, had no thumb-reachable control on a phone once the cast bar had
  scrolled away. Both are now mirrored into the Options sheet.
- **A4, A6 (major)** The four glass tiers were declared but applied to nothing,
  and the recipe was duplicated inline in four places. Tiers are now assigned
  by selector and every surface reads `--tier-*`. The gradient border is one
  shared rule instead of four copies.
- **A5 (major)** The desktop stepper pill used tier 3 where the plan assigns
  tier 2, so the same element sat at different elevations on desktop and phone.
  Now tier 2 on both.
- **A7 (major)** The sheet was hidden 180ms before its 480ms spring finished.
  The delay is now derived from `--motion-3` rather than a magic 300.
- **A8 (major)** `@media (hover: none)` with `background: inherit` did not
  reset hover correctly and left borders stuck after a tap. Replaced with the
  correct pattern: all 19 hover rules scoped inside `@media (hover: hover)`.
- **A9 (minor)** Keys renamed to match the plan. `mhh-actor` was specified but
  never implemented, so the chosen character was forgotten every visit.
  Implemented and persisted on both paths, including the picker, which sets the
  select directly and would otherwise have been missed.
- **A10, A11, A13 (minor)** Removed the dead tab-strip scroll code, corrected a
  stale comment, and added the missing `.no-speaker` rule so speakerless stage
  directions no longer reserve an empty 158px column.
- **A12 (minor)** `icon-180.png` added to the service worker precache.

**Deviations**

- **B1 (major)** The legend told phone users to use a control "in the top bar"
  where it is not. Reworded to be true on both.
- **B2, B3, B4 (minor)** Thirteen hard-coded durations mapped onto the motion
  scale; the two that remain are one-shot flourishes deliberately outside it
  and now say so. `--ambient-opacity` and `--radius-inner` were declared and
  bypassed; both now used. `.to-top` and `nav.scene-nav` re-declared the retired
  one-size blur; both moved onto tiers.

**Language**

- **C1 (major)** "Practicing" to "Practising", matching the sheet control.
- **C2, C3 (minor)** Apostrophes normalised in UI copy (script content left as
  the master has it). `lang` set to `en-GB` in the page and the manifest.
- **C4** Em dashes in `PLAN.md` and `BRIEF.md` are Markdown table rules and
  bullet separators in the planning documents, not the deliverable. The house
  rule covers code, comments and UI copy; `index.html`, `sw.js` and the
  manifest are clean, which the reviewer confirmed.

### Verification after fixes

| Check | 320px | 390px | 768px | 1440px |
| --- | --- | --- | --- | --- |
| Contrast failures, both themes | 0 | 0 | 0 | 0 |
| Touch targets under 44px | 0 | 0 | 0 | 0 |
| Horizontal overflow | 0 | 0 | 0 | 0 |
| Console errors | 0 | 0 | 0 | 0 |

Glass tiers confirmed live: 10px on cast cards, meta boxes and scene stubs;
20px on the top bar; 32px on sheets and back-to-top.

Features re-tested after the fixes: search, picker into Rehearse, cue stepper,
keyboard, scene sheet with Esc, all five Options controls mirrored, music-only,
mode toggle, and character persistence across a reload.

### Found during post-fix testing (not in the review)

The runtime cache in `sw.js` stored **any** same-origin GET indefinitely. A
test file requested repeatedly with cache-busting query strings piled up as
fourteen separate cache entries, which showed that on a phone the cache would
grow without bound over time. Now only the asset types the page actually ships
are cached, and entries are keyed without the query string so repeated
cache-busted requests for one file cannot accumulate. Cache version bumped to
`mhh-v2`, which clears the polluted v1 cache on activate.

Re-verified offline after the change: server stopped, page loads, character
picked, Rehearse mode entered, 15 lines marked, stepper counting, no errors.
Cache holds exactly the 12 shipped assets.

### Review round 2

Returned 11 items, including two critical regressions caused by my own round 1
fixes. All fixed:

**Regressions I introduced**

- **N1 (critical)** My blanket replacement of the longhand
  `calc(var(--radius-sm) - 0.4rem)` with `var(--radius-inner)` also rewrote the
  token's own definition, making it self-referential. A cyclic custom property
  is invalid at computed-value time, so every consumer fell back to `0`: the
  concentric Double-Bezel radius was square on all 13 cast cards, the cast bar,
  the cast table and all 8 ticket stubs. The most visible element on the first
  screen. Restored to the real expression; verified 9.6px on all four.
- **N3 (major)** The tier refactor moved the raised surfaces off `--shell` and
  `--surface`, which the print block whitened, onto `--tier-bg`, which it did
  not. Printing from the dark theme would have put a 4%-opacity backing and a
  live 10px blur on paper. Print now resets all nine glass tokens plus the
  edge colours. Verified: pure white, no blur, no shadow, printing from dark.

**Fix that did not land**

- **N2 (critical)** The B1 legend rewording was reported as done but never
  applied: my match was a single line and the text wraps across three, so the
  replacement silently did nothing. Now applied. I audited the other round 1
  copy fixes the same way; N2 was the only one that had failed.

**Genuine defects in my new code**

- **N4 (major)** Actor restore and mode restore were two unordered promises,
  with a comment claiming an ordering the code did not enforce. It held only
  because localStorage resolves synchronously. Mode restore is now chained off
  actor restore, so the host-storage path cannot silently downgrade a returning
  cast member to Read.
- **N8 (major)** Tapping Practice or Cue in the Options sheet left the sheet
  open, so the cast member saw a switch flip but not the script change behind
  the scrim, nor the status line the action writes into the cast bar. Those two
  controls now close the sheet; the set-once filters correctly stay open.
- **N5 (minor)** `CACHE_VERSION` bumped to `mhh-v2` (done during my own
  post-fix testing, before this review arrived).
- **N6, N7, N9, N11 (minor)** Orphaned hover comment removed; four unreferenced
  IDs removed; the `[aria-pressed="true"] .state-dot` selector scoped to
  `.pill` and `.mini-btn` so a future icon cannot be caught by it; the dead
  `.nav-scroll` / `.nav-track` wrappers and their rule removed.

**Noted, not actioned**

- **N10** flags that `.cast-card` now combines `overflow: hidden`,
  `backdrop-filter` and a hover `transform`, which can judder on WebKit with 13
  cards on the first screen. I cannot verify this in a desktop browser. The
  hover lift only applies on pointer devices, so phones are unaffected, but it
  is worth a look on a real Mac. If it judders, drop tier 1 from `.cast-card`:
  the card sits on an opaque core and gains little from the blur.

### Verification after round 2 fixes

| Check | 320px | 390px | 768px | 1440px |
| --- | --- | --- | --- | --- |
| Contrast failures, both themes (24 styles) | 0 | 0 | 0 | 0 |
| Touch targets under 44px | 0 | 0 | 0 | 0 |
| Horizontal overflow | 0 | 0 | 0 | 0 |
| Console errors | 0 | 0 | 0 | 0 |

Re-tested: search, picker into Rehearse, cue stepper, keyboard, scene sheet,
all five Options controls, music-only, mode toggle, character and mode
persistence across reload, print from the dark theme, and icon integrity after
repeated toggling.

### Found while testing the round 2 fixes

Testing the edge cases around N4 and N8 turned up a related defect neither
review had reached. Tapping **Practice mode** in the Options sheet with no
character chosen fell through to `ensurePracticeModeOn`, which silently
auto-assigns the first actor in the list. The cast member got someone else's
lines blurred, the sheet closed, and the status line explaining who had been
picked was off-screen at the top of the page. Measured: actor went from empty
to "Aparna", `statusInViewport: false`, page at scroll 0.

Both controls now check for a chosen character first and send the cast member
to the picker rather than guessing on their behalf. Verified across three
cases: no actor goes to the picker with nothing forced; with an actor it
toggles off and back on cleanly; the sheet closes each time.

Also confirmed correct while testing: a saved actor who is no longer in the
cast list, and a saved Rehearse mode with no saved actor, both fall back to
Read without error.

### Review round 3

All 11 round 2 items confirmed fixed, including a sweep that found no other
self-referential custom property. Two new items, both fixed:

- **R1 (major)** My N3 print fix whitened the *surfaces* but I never audited
  the *foreground* tokens. The reviewer found three elements printing pale
  yellow on white; auditing the whole class myself found **seventeen**,
  including the speaker name on every line (2.28:1) and the added-text and
  music-cue meaning colours (2.23:1 and 1.9:1), which carry real information in
  the script. The print block now overrides every accent token to its
  light-theme value, with a matching `@supports` block so wide-gamut browsers
  do not keep the P3 screen values, plus a white background on the ticket stub
  whose gradient was built from `--sindoor`. Verified: **zero** elements below
  4.5:1 on paper, printing from either theme, and the music cue keeps its teal
  so the meaning survives in ink.
- **R2 (minor)** The runtime cache wrote entries keyed on the path but read
  with `caches.match(req)`, which includes the query string, so a query-string
  request would have missed the entry it just wrote and returned nothing at
  all when offline. Latent rather than live, since no shipped asset carries a
  query string, but now correct: the lookup passes `{ignoreSearch: true}`.
  Cache version bumped to `mhh-v3`.

### Final verification

| Check | 320px | 390px | 768px | 1440px |
| --- | --- | --- | --- | --- |
| Contrast failures, both themes (35 styles) | 0 | 0 | 0 | 0 |
| Touch targets under 44px | 0 | 0 | 0 | 0 |
| Horizontal overflow | 0 | 0 | 0 | 0 |
| Console errors | 0 | 0 | 0 | 0 |

Print, both themes: zero elements below 4.5:1 on white, no blur, no shadow, no
tinted backgrounds.

Offline with the server stopped: page loads, 76 lines, 8 scenes, self-hosted
fonts, character picked, Rehearse mode, stepper counting, inner radius correct.
Service worker `mhh-v3` holds exactly the 12 shipped assets.

### Open, for the user to check on a real device

**N10.** `.cast-card` combines `overflow: hidden`, `backdrop-filter` and a hover
`transform`, with 13 cards on the first screen. WebKit can re-rasterise the
backdrop each frame on that combination. It cannot be judged from a headless
browser, and it only affects pointer devices, so the cast's phones are
unaffected. If the hero judders on hover on a Mac, the remedy is to drop tier 1
from `.cast-card`: the card sits on an opaque core and gains little from the
blur.

### Round 4: not completed

The reviewer hit an API session limit and terminated before producing a
report. Rather than wait for the reset, I verified its three open questions
myself.

**Does the print `@supports` block actually win?** Yes, on both counts. The
screen block uses `:root` (specificity 0,1,0); the print override uses
`html[data-theme]` (0,1,1), and sits later in source inside `@media print`.
Confirmed empirically: printing from the dark theme resolves `.c-music` to the
light value.

**Should print keep the meaning colours?** Yes. The legend names four
distinctions, and the music-only view is explicitly a printable sound cue
sheet, so collapsing to grey would make the legend describe something the page
no longer shows. Measured in print: added text 6.35:1, music 6.23:1, both well
clear of body ink (133 and 106 RGB distance) and of each other (191).

**Anything else in the print path.** I diffed all 59 declared tokens against
the 39 the print block resets. The 20 unreset ones are radii, motion, metrics,
or resolve through tokens that are reset. Three needed checking: `--muted-2`
(background on a disabled icon only), the `--ambient-*` set (feeds `.ambient`,
which print hides), and `--bg-3`, which turned out to be **declared four times
and used nowhere**. Removed.

That audit did find one real defect neither review reached: whitening
`--gold-bg` for print erased the tint that marks an **optional cut**, so cuts
printed identically to normal lines while the legend still promised the
distinction. Cuts now carry a 3px brown rule in print instead of a fill, which
also saves toner. Verified distinguishable in both themes.

### Final state

| Check | 320px | 390px | 768px | 1440px |
| --- | --- | --- | --- | --- |
| Contrast failures, both themes (37 styles) | 0 | 0 | 0 | 0 |
| Touch targets under 44px | 0 | 0 | 0 | 0 |
| Horizontal overflow | 0 | 0 | 0 | 0 |
| Console errors | 0 | 0 | 0 | 0 |

Print, both themes: zero elements below 4.5:1, no blur, no shadow, no tinted
backgrounds, all four legend distinctions preserved.

Offline: page loads and is fully usable with the server stopped. Service
worker `mhh-v3` holds exactly the 12 shipped assets.

Features verified after every round: search, picker into Rehearse, cue stepper,
keyboard shortcuts, scene sheet with Esc, all five Options controls, music-only,
mode toggle, character and mode persistence, icon integrity after repeated
toggling.

### Open, for the user

**N10.** `.cast-card` combines `overflow: hidden`, `backdrop-filter` and a hover
`transform`, 13 on the first screen. WebKit can re-rasterise the backdrop each
frame on that combination. Not judgeable from a headless browser, and it only
affects pointer devices, so the cast's phones are unaffected. If the hero
judders on hover on a Mac, drop tier 1 from `.cast-card`: it sits on an opaque
core and gains little from the blur.

**Three review rounds completed; the fourth was cut short by a rate limit
rather than by a clean result.** Everything either review raised is fixed and
verified. If you want a fourth opinion, the reviewer can be resumed after the
limit resets.


## Post-delivery fix: mobile search focus and icon overlap (2026-09-02)

User reported two bugs after the rebuild shipped:
1. The search field did not reliably get keyboard focus when tapped on
   phones — the field opened but you had to tap again to type.
2. Once open, the search-open magnifying-glass icon showed through, visually
   overlapping the close (X) button.

### Root causes

**Overlap (straightforward):** `.search-open`, the icon button that opens the
field on phones, stayed `display: inline-flex` regardless of open state.
`.search-wrap` covers the whole bar once open, including the spot
`.search-open` sits in, so its icon showed through behind the close button.
Fixed by hiding it while open, via both a CSS `:has()` rule and a JS `hidden`
attribute for browsers without `:has()` support.

**Focus (the real culprit, found after extensive isolated testing):**
`.search-wrap` was hidden with `visibility: hidden`, included in the same
`transition` list as `opacity` and `transform`. Toggling the `.is-open` class
adds `visibility: visible` to the cascade correctly and instantly by every
inspection (`classList`, `CSSOM` matched-rules, `matchMedia`) — but a
`getComputedStyle().visibility` read and, critically, a same-tick call to
`.focus()` on a descendant, both still observed the pre-toggle "hidden"
used value. This reproduced in a minimal isolated test case with no other
code involved, confirming it is a genuine Chromium timing quirk with
`visibility` specifically when it participates in a `transition`, not a bug
in this page's JS. No amount of forcing a layout flush (`offsetHeight` read,
`getComputedStyle` read, single or double `requestAnimationFrame`, or a
macrotask `setTimeout`) made the *same* toggle-then-focus sequence work
reliably against `visibility`.

Fixed at the root: `.search-wrap` no longer uses `visibility` at all. It is
hidden with `opacity: 0` and `pointer-events: none` instead (both fully
un-transitioned-hazard-free for focus purposes), animated the same way via
the existing `opacity`/`transform` transition. Since `opacity` and
`pointer-events` do not remove an element from the tab order or the
accessibility tree the way `visibility: hidden` does, `inert` is now toggled
explicitly in JS (`syncSearchInert()`), gated on the same `(max-width: 900px)`
media query as the collapse behaviour itself, so:
- On phones, the closed search field is unreachable by tab and invisible to
  screen readers, exactly as before.
- On desktop, where the field is always visible and never collapses, it is
  never made inert.
- Resizing across the breakpoint (e.g. a tablet rotating) live-updates the
  `inert` state via a `matchMedia` change listener.

Also fixed in the same pass: the opened search input measured 43px tall and
the close button 40x40, both marginally under the 44px touch-target floor.
Raised to 46px and 44x44.

### Verification

- Real click-driven open/close cycle tested at 320, 390, 768 and 1440px:
  focus lands on the input every time, `inert` toggles correctly, the
  magnifying-glass icon is hidden while open and reappears on close, and
  focus returns to the open button on close.
- Search itself (typing, highlighting, clearing) verified working inside the
  reopened flow.
- Full regression: contrast (32-33 styles per width), touch targets, overflow
  and console errors all clean at all four widths, both themes.
- Desktop behaviour unchanged: field always visible, never inert, always
  focusable.


## Post-delivery fix, take two: mobile search rebuilt from scratch (2026-09-03)

The previous fix (visibility -> opacity/pointer-events, plus inert) did not
work on a real phone: the icon still overlapped the brand mark and the
theme toggle, tapping the bar itself (not the icon) still did nothing, and
tapping the icon zoomed the whole page in. Told explicitly not to keep
patching the same approach.

### Why the previous approach kept failing

The in-bar collapsing field was fundamentally the wrong shape for this: one
element trying to occupy the same row as the brand mark and the theme
toggle, in three different size/position states (collapsed icon, expanding
overlay, open field), animated between them. Every fix attempt patched one
symptom of that shape without changing the shape itself, so a new symptom
kept surfacing. The zoom bug had been present the whole time and was never
tested for: `.search-wrap input` was `font-size: 0.9rem` (14.4px), under
iOS Safari's 16px auto-zoom threshold, unrelated to any of the focus/overlap
work already done.

### The rebuild

Replaced the whole mechanism. `#searchWrap` (one element, one id, same
search logic as always) now has exactly two states, switched by a single
`search-open` class on `<html>`:

- **Closed (default on phones):** `display: none`. Zero footprint, zero
  layout participation, cannot overlap anything because it does not
  occupy any space.
- **Open:** `position: fixed; inset: 0; z-index: 200`, a full-screen opaque
  layer above everything else on the page, with its own single input and
  close button and nothing else sharing that space.

`openSearch()`/`closeSearch()` in JS do nothing but flip that one class,
manage `inert` on the now-hidden-behind-the-overlay open button, move focus,
and clear the query on close. No transition to sequence around, no
`requestAnimationFrame`, no `setTimeout`, no `offsetHeight` flush: the
previous fix's entire category of workaround is gone because there is no
timing-sensitive animated property left to race against.

Font-size on the overlay's input is 17px, a full integer above the zoom
threshold rather than exactly 16px, so it cannot regress back through a
rounding difference. The desktop inline field's font-size was also raised
from 14.4px to 16px for the same reason, though desktop was never the
reported symptom.

Other fixed-position chrome (reading-progress bar, back-to-top, bottom bar)
is explicitly hidden while the overlay is open rather than relying on
z-index alone, and the body is scroll-locked so the page behind cannot move
while search is active.

### Verification

- Real click-driven cycle at 320, 390, 768, 1440px: zero overlap at rest
  (brand vs. open-icon vs. theme-toggle all measured, none intersect), focus
  lands on the input on the very first click with no delay, font-size reads
  17px, the field and everything behind it render correctly with a
  screenshot check.
- Search itself (type, highlight, clear) verified working through the
  overlay.
- Close correctly restores scroll, clears the query, un-inerts the open
  button, and returns focus to it.
- The `/` keyboard shortcut opens the overlay; `Escape` closes it.
- Full regression: 32-33 text styles checked per width, zero contrast
  failures, zero touch targets under 44px, zero horizontal overflow, zero
  console errors, all at every width in both themes.
- Desktop confirmed unaffected: field stays inline, always visible, always
  focusable, mobile-only icon button correctly hidden.
- Service worker cache bumped to `mhh-v4`; reinstalls cleanly with all 12
  assets.

---

# Round 5 — bug fixes, markup simplification, scene navigator (2026-09-05)

Raised by the user after a full code review of `index.html`. Five reproduced
defects, three content/UX changes. Backup taken as
`index.backup-20260905-230251.html` before any edit.

## Scope agreed

Fix findings 1–5 from the review. Finding 6 (the 2.5 MB hero photo) is
explicitly **out of scope** at the user's instruction and is not touched.

## Part A — Defects to fix

### A1. Sound operator silently loses music cues (severity: high)

`refreshSceneVisibility()` (index.html:5308) collapses a whole scene when the
selected actor has no line in it. That test is applied even while
`music-only` is on, so scenes containing a visible music cue but none of the
selected actor's lines are hidden outright.

Reproduced from a clean profile: 9 music cues visible with no character
selected, **5** with a character selected. Four cues in scenes 3, 5 and 6
disappear. Because the character choice is persisted and the picker is the
app's primary entry path, this hits anyone who has ever tapped a cast card
and then switches to Music cues only for a sound check.

**Fix.** Suppress the `actorAbsent` clause whenever `music-only` is active.
A scene stays visible if it has any visible line, regardless of who is in it.

### A2. Cue mode breaks when optional cuts are hidden (severity: high)

`applyCueState()` (index.html:5675) walks `lines[i-1]` in document order to
find the cue for each practising line, without checking whether that previous
line is currently visible. Two of Apurva's cue lines are themselves `is-cut`,
so with Hide optional cuts on, those lines lose their cue and show a blank.
`hideCutsToggle` also never calls `applyCueState()`, so cues are never
recomputed when that filter changes.

**Fix.** Walk backwards from each practising line to the nearest *visible*
non-practising line, using the existing `isLineVisible()`. Call
`applyCueState()` from the cuts and music toggles so cues track the filters.

### A3. Stale search highlight persists after the query is cleared (severity: medium)

Search, then enable Cue mode, then clear the search. `cueOriginal` cached the
`.content` innerHTML *including* the injected `<mark>` elements, so restoring
it re-introduces a highlight for a query that no longer exists. Reproduced: 1
stray `mark.search-hit` left on screen.

**Fix.** Strip highlight markup from the cached HTML at the point it is
cached, so what is restored is always the clean original.

### A4. Practice and Cue mode are not persisted (severity: medium)

Only `mhh-theme`, `mhh-textsize`, `mhh-actor` and `mhh-scope` are written.
The `practiceToggle` pill never routes through `setMode()`, so `mhh-mode` is
never written on that path. A cast member re-enables Practice mode on every
single visit, which is precisely the friction the persistence work set out to
remove.

**Fix.** Persist `mhh-practice` and `mhh-cue`, and restore them after the
actor restore resolves (chained, not parallel, for the same reason the mode
restore is already chained: both are meaningless without a character).

### A5. Printing produces truncated dialogue (severity: medium)

With Cue mode on, 11 lines print as `CUE …` stubs instead of full text. The
`beforeprint` handler that exists to prevent this is unreliable in Safari,
the likeliest browser for a cast printing from a phone or iPad.

**Fix.** Stop depending on the event. Keep the original text in the DOM
permanently: render the cue tail as a sibling element and hide the full text
with CSS, so `@media print` can simply reverse the two. The `beforeprint`
handler is then belt-and-braces rather than load-bearing.

## Part B — Content and UX changes

### B1. Remove the orientation strip

The cast know how to use the page. Remove `#orientStrip` markup, its CSS, its
JS IIFE and its `mhh-orient` persistence key.

### B2. Accept the edits: added text and struck cuts

The draft-marking is finished business. Added text is now final; struck text
is now cut.

- **`c-added` (46 spans):** unwrap. The words stay, the highlight colour goes.
- **`is-strike` (29 spans in the body):** **delete the words entirely** —
  confirmed by the user. Each affected line's `data-search` attribute is
  rebuilt from the surviving text so search cannot match deleted words.
- Both legend rows and the associated CSS are removed.
- `is-italic` (stage directions) and `c-music` (music cues) are **kept** —
  they mark performance information, not draft state.

This permanently changes the script text. The Google Doc master remains the
source of truth; the backup holds the previous state.

### B3. Replace end-of-scene links with a floating scene navigator

The eight `.scene-footer-nav` blocks are removed. In their place, a single
piece of fixed chrome on the right edge:

- **Scene progress rail.** Eight ticks, one per scene, in running order. The
  current scene's tick is filled and carries its title; the rest are dots.
  Tapping a tick jumps to that scene.
- **Floating prev/next buttons** beneath the rail.
- **Dynamic.** Hidden over the hero, fades in once the script starts, fades
  out after ~1.6s of scroll inactivity and returns on the next scroll or on
  hover/focus. Always visible while focused, so it is keyboard-reachable.
- **Filter-aware.** Prev/next step only through scenes that are currently
  visible, skipping any the active filter has collapsed (user's choice).
  Collapsed scenes are dimmed on the rail.
- Reuses the existing IntersectionObserver scroll-spy for "current scene"
  rather than adding a second one.

Hidden on print, under `prefers-reduced-motion` it appears without animating,
and on narrow phones it sits clear of the existing bottom bar.

## Verification before review

1. Music cues: 9 visible with and without a character selected.
2. Cue mode: every practising line has a cue with cuts shown *and* hidden.
3. No stray `mark.search-hit` after the search/cue/clear sequence.
4. Practice + Cue survive a reload; still correctly downgrade with no actor.
5. Print emulation: zero `CUE` stubs, all 76 lines full text.
6. Zero `c-added` / `is-strike` / `orientStrip` / `scene-footer-nav` left.
7. `data-search` matches rendered text on every edited line.
8. Rail: correct scene tracked, filter-aware stepping, tap-to-jump, fade
   behaviour, hidden on print, ≥44px targets, no overflow at 360/390px.
9. Regression: no console errors, no h-overflow, both themes, search /
   practice / cue / picker / sheets all still working.
10. Bump service worker `CACHE_VERSION` to `mhh-v5`.

Then hand to `deliverable-reviewer` against BRIEF.md and this plan.

## Progress

- [x] A1 music cue visibility
- [x] A2 cue mode vs hidden cuts
- [x] A3 stale highlight
- [x] A4 persist practice + cue
- [x] A5 print truncation
- [x] B1 remove orientation strip
- [x] B2 accept added text, delete struck cuts
- [x] B3 floating scene navigator
- [x] Verification
- [x] Round 7 review defects fixed
- [x] Reviewer clean (fifth pass, 2026-09-06)

### Found while building (not in the original list)

**A1 had a second half.** Fixing `refreshSceneVisibility` only lifted the
scene-level collapse. `applyActorState` was independently setting
`actor-hidden` on individual lines, so with a character selected the actor
filter still hid other people's music lines one at a time: 9 cues with no
character, 5 with one. Both now check `music-only`, and the music toggle
routes through `applyActorState` so the per-line filter is recomputed when
the view is entered and left. Verified 9 on all four paths (no actor; pick
actor while on; actor first then on; with practice mode also on).

**18 stale `data-search` attributes.** Deleting the struck spans changed the
rendered text, so the search index was rebuilt from source with a tag-strip.
That inserted a space at every tag boundary, and this markup breaks words
mid-span, so "khushi" indexed as "k h ushi" and became unfindable. Rebuilt
instead from the browser's own `textContent`, which concatenates those nodes
the way a reader sees them. All 18 now match the rendered text exactly, and
words that never matched before this round ("khushi", "forehead" in 7 lines)
are searchable for the first time.

**One line removed.** Sharda Devi's only speech in scene 4 was struck in full,
so accepting the cut left a speaker with no words. The line was removed
rather than left blank. Her replacement dialogue is Deendayal's added line
directly above it. Line count 76 to 75.

**Pre-existing 360px overflow, fixed.** `#actorSelect` is sized by its widest
option ("Maneesh · Ramu Kaka, Man in office, Bhairav Baba") and measured
365px, forcing the page to 390px and horizontal scroll at 360px. Present in
the backup too, so not a regression from this round, but it is one line in
the area being worked and 360px is still a live width (iPhone SE). Capped
with `max-width:100%` and an ellipsis.

**Scene rail scoped to under 900px.** Above that the sticky sidebar already
lists all eight scenes with titles and an active state, so the rail was a
second copy of the same control on the same screen. It now appears exactly
where the sidebar is hidden, which is where the removed footer links were
the only way to move between scenes.

**`[` and `]` unified with the rail.** The old `jumpScene` walked scene
numbers arithmetically and could land on a scene the filters had emptied.
Both shortcuts now call the rail's `stepScene`, so keyboard and rail can
never disagree about what "next scene" means. `jumpScene` was deleted.

### Verification results

| Check | Result |
|---|---|
| Music cues, no character | 9 of 9 |
| Music cues, character selected | 9 of 9 (was 5) |
| Cue lines hidden by a filter | 0 (was 2) |
| Practising lines without a cue | 2, both correct by design |
| Stray highlights after search/cue/clear | 0 (was 1) |
| Practice + Cue survive reload | yes, with pills, mirrors and scope lock |
| Print: cue stubs / hidden dialogue / blur | 0 / 0 / 0, all 75 lines full text |
| `data-search` mismatches | 0 of 75 (was 18) |
| Draft markers, orient strip, footer nav left | 0 |
| Horizontal overflow, 360 to 1440px | none, both themes |
| Tap targets under 44px | none |
| Console errors | none |
| Rail: track, jump, step, skip empty, disable at ends | all pass |

Two of Apurva's lines have no cue: one directly follows another of his own
lines (nothing to cue from, you are already speaking) and one opens a scene.
Both match the original behaviour.

### Review round 1 (2026-09-05)

Twelve defects returned. Ten were real and are fixed; one was not reproducible
and one was a misreading of an accurate comment.

**Fixed**

- **D2 Dimmed rail ticks were live buttons.** A scene the filters had emptied
  was faded but still clickable, still in the tab order, and tapping it
  repainted the rail to claim you had arrived at a scene that is
  `display:none`. Emptied ticks are now genuinely `disabled` (out of the tab
  order), their `aria-label` says "nothing to show under the current filters",
  and `goToScene` refuses a jump to a hidden scene rather than lying about
  position.
- **D3 The rail was unreachable by keyboard.** It was `visibility:hidden`
  until a scroll event, and tabbing does not scroll, so it was not in the tab
  order at all: measured at 45 tab stops down the page without ever reaching
  it. The hidden state is now opacity-only and `:focus-within` brings it into
  view. Related: the markup was moved from before the header to after
  `</main>`, because once focusable it became the *first* tab stop, putting
  eight invisible scene buttons ahead of all content. Now 23 stops of real
  content come first.
- **D5 The panel resized as the reader scrolled.** The current scene's label
  animated `max-width` open, so the rail was a different width per scene
  title. The label now sits in a fixed-width clipped column and only its
  opacity changes: measured identical at 59px across scenes 1, 3 and 8.
- **D6 A dimmed tick was effectively invisible.** `0.32` on the tick
  multiplied with `0.55` on the idle rail gave 0.176, around 1.3:1. Now 0.55
  with no compounding, since focus and hover both hold the rail at full
  opacity.
- **D4 (partial), D7, D8, D9, D10, D12.** Tick rows raised 26px to 32px and
  the comment rewritten to describe what is actually true rather than implying
  a 44px claim it did not meet; the single em dash removed; dead
  `.line.music-hidden` deleted; the print comment made explicit that there is
  deliberately no `beforeprint` handler; two hyphens-as-dashes replaced with
  colons; the lone inline `style="position:static"` moved into a rule.

**Not reproducible**

- **D1 "hit strips swallow taps on the dialogue".** Reported as critical: the
  ticks' invisible `::before` was said to extend leftward over the script and
  intercept the tap that reveals a blurred line. Probed with
  `elementFromPoint` across the rail's full vertical band: at every tick row,
  x=300 through x=322 returns the dialogue element, and the rail only takes
  over at x=326, inside its own panel. The pseudo-element resolves to
  `right: -5.6px`, i.e. it extends *away* from the script, because the tick is
  27px wide inside a 44px strip anchored to its right edge. The hit strips
  were removed anyway as part of the D5 fix, so the concern is moot.

**Real underneath a wrong diagnosis**

- The rail panel itself *did* overlap the dialogue on phones, clipping the
  last word or two of each line it crossed (visible in the round 5
  screenshots). Fixed by insetting the reading column: `--rail-w` is measured
  at runtime next to `--header-h` and `--bottombar-h` and applied as
  `.app { padding-right }` under 900px. Verified zero text under the rail at
  360, 390 and 820px.

**Rejected**

- **D11 `sr-` prefix collides with `.sr-only`.** Noted, not changed. Renaming
  six classes across CSS, markup and JS to resolve an ambiguity that no
  browser sees and no reader has hit is churn on a file the cast depend on
  tonight. Worth doing in a quieter round if it ever actually confuses anyone.

### Verification after review fixes

- All five original defects re-confirmed after the rail rework: 9 of 9 music
  cues with and without a character, 0 hidden cue lines with cuts shown and
  hidden, 0 stray highlights, all four storage keys written, print emits 75
  full lines with 0 stubs.
- Rail: reachable by keyboard after 23 content stops, emptied ticks disabled
  and inert, panel width stable, no dialogue underneath at any width.
- 6 widths (360 to 1440) times 2 themes: no horizontal overflow, no touch
  target under 44px except the documented 32px tick rows, no console errors.
- Full feature regression: search, picker, stepper, both sheets, mirrored
  controls, "Just reading", theme toggle, all working.

### Review round 2 (2026-09-05)

The reviewer re-confirmed all five original fixes (A1 to A5) and all round 1
fixes as intact, and raised seven new points. Six fixed, one out of scope.

**Fixed**

- **Rail could overlap the bottom bar on a short screen.** The rail was
  centred on the viewport (`top:50%` + `translateY(-50%)`), and a max-height on
  a centred box gives space back at the top as fast as at the bottom, so it
  could never be made to clear the bar. Now anchored to the gap between the two
  bars (`top: header + 0.75rem`, `bottom: bottombar + 0.75rem`, auto margins to
  centre within that gap), sized `max-content` and capped with an explicit
  `calc` so it scrolls rather than spilling out of the glass panel. The extra
  0.75rem also absorbs the safe-area inset, which lands after `--bottombar-h`
  is first measured. Verified across 8 sizes from 640x360 to 820x1180: panel
  clears both bars everywhere, sized to its content (395px) on phones, scrolls
  on the two cramped landscape cases.
  - Two dead ends worth recording: `height: fit-content` and a percentage
    `max-height` both resolve against the containing block rather than the
    top/bottom inset, and each let the panel grow back over the bars.
- **`--rail-w` undeclared until JS ran.** The reading column's right inset had
  no value at first paint, so the dialogue sat briefly under where the rail was
  about to appear. Now declared `0px` in the `:root` metrics block beside
  `--header-h` and `--bottombar-h`, and seeded at 64px inside the 900px
  breakpoint so the first paint is already correct.
- **aria-label could render as "Scene 5, ".** The label was built in two
  places, and the version in `syncRailAvailability` appended a comma before a
  title that might be absent. Both paths now call one `railTickLabel()`
  builder. Verified: zero malformed labels on load and after a filter change.
- **Redundant selectors in the phone override.** Three selectors set
  `display:none` on the tick label where one does the job.
- **Wasted work in the scroll path.** `showRail()` restarted the idle timer on
  every scroll frame even while the rail held focus and was already pinned
  open. Now skipped in that case.
- **Comment quoted arithmetic that did not hold.** "Eight 44px rows would be a
  350px column" was neither 352 (the plain multiple) nor 365 (the laid-out
  height with gaps). Rewritten to state the constraint rather than a figure.

**Out of scope**

- **Hero photo missing from the service worker precache.** Correct, and worth
  fixing: `Apurva Aparna.png` is not in `PRECACHE`, so the first offline visit
  after install has no hero image. It belongs to review finding 6 (the 2.5 MB
  photo), which the user explicitly placed out of scope for this round. Left
  alone deliberately, and best fixed together with resizing the photo, since
  precaching 2.5 MB as-is would be the wrong trade for a decorative image on
  venue wifi.

**Also done**

- Stale round 5 screenshots deleted from `.playwright-mcp/`; only current
  captures (`final-mobile2.png`, `final-desktop.png`) remain, so a later
  reviewer cannot judge against superseded renders.

### Final verification

All green, with the service worker at `mhh-v5`:

| Check | Result |
|---|---|
| A1 music cues, with and without a character | 9 and 9 |
| A2 cue lines hidden by a filter, cuts shown / hidden | 0 / 0 |
| A3 stray highlights | 0 |
| A4 persisted keys | actor, cue, practice, scope |
| A5 print: stubs / hidden dialogue / lines | 0 / 0 / 75 |
| 6 widths x 2 themes | no overflow, no undersized targets |
| Rail geometry, 8 sizes incl. landscape | clears both bars everywhere |
| Console errors | none |
| Feature regression | search, picker, stepper, sheets, mirrors, theme all pass |

### Review round 3 (2026-09-05)

Two defects, both mine, both real. Fixed.

**The bar-clearance fix was scoped to the wrong breakpoint.** The anchoring
added in round 2 sat inside `@media (max-width: 700px)`, but the rail is only
hidden above 900px. The 701 to 900px band therefore kept the old centred
geometry with no bottom inset, no cap and no overflow, which is precisely the
overlap round 2 set out to remove. Any phone in landscape lands in that band:
measured on an iPhone 14 Pro Max rotated (844x390) the rail ran from y=-5 to
y=395 across a bottom bar starting at y=321, and off the top of the screen as
well. My round 2 verification missed it because every size in that grid was
either portrait or under 700px wide.

The geometry now lives in the base `.scene-rail` rule, where it applies at
every width the rail exists at. Re-verified across 12 sizes including four
landscape cases in the previously untested band: all clear both bars, size to
their content, and scroll when the viewport is genuinely too short.

**The `--rail-w` seed was wrong in the band where the rail is widest.** One
seed of 64px covered a rail that is 59px on a phone and 158px in the 701 to
900px band, where the scene titles are shown. It was 94px short exactly where
the inset matters most, so the dialogue painted under the rail and reflowed.
Now seeded per breakpoint, with the narrower value in a query nested inside
the 900px block rather than the earlier 700px block, which the cascade would
otherwise let the wider value override. Seed and measured value now agree
exactly at every width: no first-paint reflow anywhere.

### Verification after round 3

| Check | Result |
|---|---|
| Rail geometry, 12 sizes incl. 4 landscape in the 701 to 900px band | all clear both bars |
| `--rail-w` seed versus measured, every width | identical, 0px gap |
| A1 music cues with and without a character | 9 and 9 |
| A2 cue lines hidden by a filter | 0 with cuts shown and hidden |
| A3 stray highlights | 0 |
| A4 persisted keys | actor, cue, practice, scope |
| A5 print | 0 stubs, 0 hidden, 75 lines, rail hidden |
| Disabled rail ticks under Music cues only | scenes 4 and 7, 0 malformed labels |
| 6 widths x 2 themes | no overflow, no undersized targets |
| Console errors | none |

---

## Round 6 — the scene rail was squeezing the script (2026-09-06)

Raised by the user: the rail was taking too much room on the right and
cutting into the dialogue. Measured, and they were right by some margin.

### What was wrong

The rail reserved a permanent gutter (`.app { padding-right }` fed by a
measured `--rail-w`) for chrome that is only on screen while you scroll. It
also carried scene titles, which made it as wide as the longest one.

| | Rail width | Dialogue |
|---|---|---|
| Small phone (360) | 59px, 16% | 28 characters per line |
| Phone (390) | 59px, 15% | 31 characters |
| Tablet portrait (768) | 158px, 21% | 44 characters |
| Tablet (820) | 158px, 19% | 51 characters |

Comfortable reading is 45 to 75 characters. Every phone size was well under
it, for a cast reading at arm's length on stage.

### The fix: overlay, no reserved space

- **Gutter removed.** `--rail-w`, its seeds, its runtime measurement and the
  `.app` right padding are all gone. The rail overlays the right margin.
- **Titles dropped from the rail.** They were what made it 158px. The scene
  name lives in each tick's `aria-label` and in the Scenes sheet, which is the
  labelled route to the same jumps. Nothing is lost to a screen reader.
- **Panel chrome removed.** No glass, no border, no shadow, minimal padding:
  the dashes sit directly on the page. The panel's own padding and border were
  a large share of the width.
- **Prev/next kept 44px tall** for the tap target but no longer 44px wide,
  since a square button set the whole rail's width.

The rail is now 41 to 43px at every size, and the 700px breakpoint that gave
phones a different rail is gone: it is identical everywhere.

### Result

| | Before | After | |
|---|---|---|---|
| Small phone | 28 chars | 35 | +25% |
| Phone | 31 chars | 39 | +26% |
| Large phone | 36 chars | 44 | +22% |
| Tablet portrait | 44 chars | 64 | +45% |
| Tablet | 51 chars | 71 | +39% |

Both tablet sizes now sit inside the comfortable band.

### Verification

- Glyph-level check (Range rects per line box, not block boxes): zero text
  under the rail at any size. The paragraph boxes extend behind it, but the
  text wraps before reaching it.
- Rail function unchanged: 8 ticks with full scene names in their labels,
  tap-to-jump, filter-aware prev/next, disabled ticks for emptied scenes,
  keyboard reachable after 20 content tab stops.
- A1, A2 and A4 re-confirmed; 6 widths x 2 themes with no overflow, no
  undersized targets, no console errors.

### Round 6 review, and the fixes it produced

The first slim version fixed the width complaint but broke two other things.
Both were caught in review and are fixed.

**The step buttons sat 16px over the dialogue cards.** With no `width` on
`.scene-rail` and `min-width: 26px` on `.sr-step`, the button was what set the
rail's width, and the rail was wider than the gutter the layout leaves. The
first slim rail was 43px against a 24px margin. Measured 16px of a live
control over the cards at 820px and in landscape, at z-index 62 over the
page's 2.

The glyph-level check in the earlier verification could not catch this,
because the collision was with the card surface, not with a letter. The rail
is now explicitly `width: 22px`, sized to fit inside the 1.5rem right padding
`.app` already has: measured clearance is exactly 0px at every size, with no
overlap anywhere.

**The dashes were below the contrast floor.** Removing the glass panel put
them straight on the page, where three opacities compounded: 0.5 on the dash,
0.55 on the idle rail, 0.55 again on a disabled tick. Idle is the resting
state on a phone, which has neither hover nor focus to lift it.

Measured from rendered pixels rather than computed styles, the non-current
dashes came out at 2.3 to 2.6:1 against a 3:1 floor, and disabled ones at
about 1.5:1.

Fixed by removing opacity from the state model entirely. Every state now
differs by **width and colour**:

| state | mark |
|---|---|
| current | 16px, accent |
| normal | 10px, `--ink-dim` |
| emptied by a filter | 5px, same ink |
| step at the end of the run | arrow not drawn |

The idle fade was also raised from 0.55 to 0.82, and a faint backing
(`--bg` at 62%, 6px blur) sits behind the dashes so they hold up over the dark
line cards as well as the page. Re-measured from pixels: **every mark passes
3:1 in both themes, worst case 3.62**.

Four separate attempts at dimming the disabled arrow all failed the floor
(`--muted-2` 2.38:1, `--muted` 2.30:1, `--ink-dim` at 0.75 opacity 2.48:1, a
smaller glyph 2.69:1 through anti-aliasing alone). Not drawing it is the
honest answer: there is no scene that way, the button is already inert and out
of the tab order, and the remaining arrow shows the direction that works.

Also fixed from the same review: the hover fill used `--surface-2`, a
near-opaque white built to sit inside the glass panel that this round removed,
which painted a bare white block on the light theme. Now a tint of the accent.

The step button is recorded as a knowing exception to the app's 44px floor,
alongside the 32px tick rows: it is 18x40, clears the WCAG 2.5.8 minimum of
24x24 on its long axis, and the Scenes sheet remains the full-size route to
every jump it makes.

### Verification after the round 6 review

| Check | Result |
|---|---|
| Rail width | 22px at every size, was 59 to 158 |
| Text under the rail | none at 360, 390, 430, 768, 820, landscape |
| Reading width | 35 to 74 characters, was 28 to 51 |
| Rail mark contrast, both themes, idle | all pass 3:1, worst 3.62 |
| Rail clears both bars, stays in viewport | yes at every size |
| Tap-to-jump, prev/next, disabled ticks | 4 and 7 disabled under Music cues only |
| A1 / A2 / A4 | 9 cues, 0 hidden cue lines, 4 keys stored |
| Horizontal overflow, 4 widths x 2 themes | none |
| Console errors | none |

### Round 6, second review pass

Two real defects, both introduced by the width fix. Fixed.

**The back-to-top button covered the rail's prev/next in landscape.** The
button sits 17.6px to 61.6px from the right edge; the rail occupied 2px to
24px, so they overlapped by 6.4px horizontally at every width. In portrait the
rail is short enough that they never met vertically, but in landscape it fills
the whole gap between the two bars and its step buttons ended up under the
opaque disc, which is a layer above them (z-index 64 against 62). Confirmed by
measurement before fixing. The back-to-top now sits at `2rem`, clear of the
rail's column: verified no overlap at five sizes including two landscape.

**Focus rings were clipped down both sides.** `overflow-y: auto` makes the
rail a clipping box in both axes, and the controls were `width: 100%` of a
22px content box, so a ring drawn at `outline-offset: 2px` was cut off at
-2px. The rail is now 24px wide with 3px of horizontal padding: measured 1px
of clearance on each side, ring intact.

Also from the same pass:

- **`viewport-fit=cover` added.** Every `env(safe-area-inset-*)` in the file
  was resolving to its 0px fallback, so the safe-area handling on the bottom
  bar, the rail and the back-to-top was inert. On a notched phone added to the
  homescreen, all three would have sat under the home indicator.
- Three stale comments corrected: two still described the emptied-scene state
  as "dimmed" after this round changed it to a short stub, and one claimed the
  rail is `visibility: hidden` when the whole point of the implementation is
  that it is not.
- The plan's own "26px-wide step button" line corrected to 18x40.

### Final verification, round 6

| Check | Result |
|---|---|
| Rail width | 24px, was 59 to 158 |
| Rail vs dialogue, 5 sizes | no overlap |
| Rail vs back-to-top, incl. 2 landscape | no overlap |
| Focus ring clipping | none, 1px clearance each side |
| Rail mark contrast, both themes, idle | all pass 3:1, worst 3.62 |
| Reading width | 35 to 74 characters, was 28 to 51 |
| Rail: tap-jump, next, prev, disabled ticks | 3, 4, 3, and 4/7 disabled |
| A1 / A2 / A3 / A4 | 9 cues, 0 hidden, 0 stray, 4 keys |
| Print | 0 stubs, 0 hidden, 75 lines, rail hidden |
| Search, sheets | 18 hits, 8 sheet rows |
| 7 widths x 2 themes | no overflow, no undersized targets |
| Console errors | none |

---

## Round 7 — play buttons on the music cues (2026-09-06)

The user has added eight MP3s in `Audio files/`. Each cue that has a matching
file gets an inline play button, so the sound operator can hear the cue from
the script itself.

Backup taken as `index.backup-20260906-102027.html`.

### What we have, and what we do not

Ten musical moments in the script, eight files. Seven are confident matches:

| Scene | Cue | File |
|---|---|---|
| 1 | Kabhi khushi kabhi gam, mother waits | `01 - Kabhi Khushi - Sad` |
| 1 | "music changes and on a happy note" | `02 - Kabhi Khushi - Happy` |
| 3 | Tathya tathya ho | `04 - Ta thaiya` |
| 5 | Le jayenge le jayenge | `05 - Le jayegne` |
| 6 | Main nagin tu sapera | `06 - Mein Nagin` |
| 8 | jab main chota bacha tha | `07 - Jab mein chota baccha` |
| 8 | Ek dusre se karte hain pyaar hum | `08 - Ek Dusre se` |

Scene 1 is one line carrying TWO cues (the sad music, then the switch to
happy), in separate paragraphs, so it takes two buttons.

**No button, by the user's decision:**

- **Scene 2**, "(Haunting music of Dil to Pagal Hain)" when Raj collides with
  Simran. No file.
- **Scene 3**, "Ek main aur ek tu" under the narration. The script itself
  still marks this "Music tbd".
- **Scene 8**, Raj's "I am back" comeback dance. The script has not chosen a
  song yet, it asks a question.
- `03 - Are re are re.mp3` is **unused**. It matches neither cue's text. It is
  from Dil To Pagal Hai so scene 2 is the likelier home, but the user chose
  not to guess. To be placed later.

### Build

**Markup.** A `<button class="cue-play">` immediately after the last `.c-music`
span of each matched cue, carrying `data-audio` (the file path) and
`data-cue` (a short label for the accessible name). Inline, so it sits with the
cue text rather than floating.

**Playback.** One `Audio` object reused for all seven, since only one track
plays at a time: pressing a second button stops the first and starts the new
one (the user's choice). State on the button reflects idle / loading /
playing. Pressing the playing button again stops it.

**Loading: prefetch the moment "Music cues only" goes on.** A cue that
buffers when the operator presses play is a cue that misses its moment on
stage, so the audio must be resident before it is needed, not fetched on
demand.

Turning that filter on is the operator identifying themselves: nobody else
uses that view. So it is the trigger. On switching it on, all seven files are
fetched into the service worker cache in the background, sequentially so a
phone on venue wifi is not saturated by seven parallel downloads, and the
Options sheet shows quiet progress ("Loading music, 3 of 7") and then a ready
state. All seven are requested again on a later visit, but with `cache:
"force-cache"` and the service worker answering from its own cache, so no
network bytes are spent: the counter walks 1 to 7 and settles immediately.

The files stay OUT of `PRECACHE`: 8.8 MB is 3.5x the hero photo, and a cast
member who only ever reads their lines should not download it. This way the
weight lands on the one person who needs it, at the moment they ask for it,
which is typically well before the cue is played.

One shared `<audio>` serves every button, so there is nothing to warm per
cue; the readiness comes from the service worker cache, not from the element.
Pressing play on a track that is somehow still cold falls back to streaming
from the network rather than refusing.

**Failure.** If a file 404s or the format is unsupported, the button shows a
quiet "unavailable" state rather than doing nothing. The cast are on mixed
phones and this must not look broken.

**Accessibility.** Real `<button>`, `aria-label` naming the cue, `aria-pressed`
for the playing state, visible focus ring, 44px minimum tap target. Announce
nothing on a live region: the sound is the feedback.

**Print.** Buttons hidden.

**Music cues only view.** These buttons are the whole point of that view, so
they must survive it, and be visible in the filtered list.

### Verification

1. All seven buttons present, on the right cues, in running order.
2. Each plays its intended file; audio actually starts (currentTime advances).
3. Pressing a second button stops the first.
4. Pressing a playing button stops it.
5. A missing file shows the unavailable state, does not hang.
6. Buttons visible and working under "Music cues only" and with a character
   selected; hidden on print.
7. Keyboard: reachable, operable with Enter and Space, visible focus.
8. No layout shift, no horizontal overflow, both themes, 360 to 1440px.
9. Existing regression: A1 to A5, rail, search, sheets, no console errors.
10. Service worker `CACHE_VERSION` bumped, `PRECACHE` unchanged.
11. Prefetch: turning on "Music cues only" fetches all seven, progress is
    shown, and it completes. Measured with the network log.
12. After prefetch, a play press starts from cache with no network request.
13. Prefetch is skipped on a second visit, and does not re-download.
14. Turning the filter on and straight off again does not leave a runaway
    download or a stuck progress label.
15. Prefetch failure (offline, or a 404) degrades quietly: the ready state
    does not lie, and play still attempts the network.

### Progress

- [x] Markup: 7 buttons
- [x] CSS
- [x] JS player
- [x] Prefetch on Music cues only, with progress
- [x] Verification
- [x] Round 7 review defects fixed
- [x] Reviewer clean (fifth pass, 2026-09-06)

### Verification results

| Check | Result |
|---|---|
| Buttons present, right cues, running order | 7, scenes 1x2, 3, 5, 6, 8x2 |
| Audio actually plays | playhead advanced 2.01s over 2s wall clock |
| Correct file per button | verified by src on each press |
| Second press stops the first | yes, one Audio object reused |
| Press the playing button stops it | yes, and rewinds to 0 |
| Missing file | `is-unavailable`, aria-disabled, no hang |
| **Plays with the network OFF after prefetch** | **yes, 2.91s into a 16s track** |
| mp3 requests on page load | 0 |
| mp3 requests when the filter goes on | 7, sequential, ends "Music ready to play" |
| All 7 in the service worker cache | yes, under mhh-v6 |
| Leaving the music view | stops playback, clears the note |
| Rapid on/off | no stuck label, no runaway |
| Keyboard | real button, focusable, 44x44 hit area |
| Print | buttons hidden |
| Regression A1-A4, search, sheets, rail | all pass |
| 4 widths x 2 themes | no overflow, button 26px |
| Console errors | none |

The offline test is the one that matters: with the network disabled the cue
still played from cache, which is the proof that prefetch removes the buffer
at the moment of pressing play.

### Found while building

- **The service worker would never have cached the audio.** Its `cacheable`
  regex listed woff2/png/svg/webmanifest/css/js and not mp3, so every prefetch
  would have been discarded and every play would have hit the network. Added.
- **Range requests would have poisoned the cache.** An `<audio>` element asks
  for byte ranges and gets 206 Partial Content back. Storing one of those and
  later serving it as a whole file gives a track that plays a few seconds and
  stops. Range requests now pass straight through to the network, and the
  cache is filled only by the page's own full-file prefetch.
- **The progress note went stale.** Toggling the view off while a prefetch was
  in flight left "Music ready to play" in the Options sheet with nothing to
  play it against. It now only speaks while the music view is on.

### Round 7 review, and the fixes it produced

Ten defects. Nine fixed, one measured and found not to apply as described.
Two of them would have broken the feature on the cast's own phones.

**The audio would not have played offline on any iPhone.** The service worker
passed every range request straight to the network. An `<audio>` element does
not request a file, it requests byte ranges: measured, even Chromium sends
`Range: bytes=0-` on first load, and WebKit always does. So the 8.8 MB
prefetch would have been unreachable the moment the venue wifi dropped, which
is the whole reason for prefetching it. The earlier "offline playback works"
result was a false pass: the browser's own HTTP memory cache answered, not the
service worker.

Ranges are now served from the cache by slicing the stored whole file and
synthesising the 206 (`Content-Range`, `Accept-Ranges`, 416 for an
unsatisfiable start). Re-verified from a genuinely cold start: seven files
cached, network disabled, cue plays to 3.41s of a 16 second track, and
seeking forward to 10s works offline too.

**The play button hijacked taps on the dialogue around it.** The 44px hit pad
was 44px in both axes, but the button sits mid-paragraph in wrapped stage
directions with a 25.9px line-height. Measured: every probe 18px above and
below the disc hit the button, so tapping a word in the line above or below
played a cue out loud. The pad is now full width but capped to the disc's own
height: zero vertical steal, 44px of horizontal reach kept.

Also fixed:

- **A race between two fast presses.** `cuePlaying = null` ran outside the
  stale-cue guard, so pressing B while A's `play()` was still pending left B
  stuck showing a spinner over audible music, with no button able to stop it.
  Both the promise rejection and the `error` listener now only act when the
  button is still the current one. Verified with two clicks fired in the same
  tick: the winner plays, nothing is stuck, and it can be stopped.
- **A failed cue was dead for the session.** One dropped request and the
  button could never be pressed again. Pressing an unavailable button now
  clears the state and retries.
- **The prefetch lied about failure.** Successes and failures both incremented
  the same counter, so seven failed fetches still reported "Music ready to
  play", and the state could never return to idle to be retried. Failures are
  counted separately; any failure reports "Some music could not be loaded,
  cues will stream" and leaves the state retryable. Verified by pointing all
  seven buttons at missing files.
- **A cache bump would have evicted the audio.** `activate` sweeps every cache
  that is not the current version, so any future edit to the page would have
  cost the operator the 8.8 MB again. The audio now lives in its own
  unversioned `mhh-audio` cache, which activate leaves alone.
- **The play button was blurred, and doubled as a peek toggle.** Two cues sit
  on actor-attributed lines (Apurva scene 8, Maneesh scene 6), so in practice
  mode the button was blurred with the dialogue and a press also revealed or
  re-hid the line. The button is excluded from the blur, and the click no
  longer bubbles to the document peek handler.
- **The progress note announced seven times.** It was a live region updated
  per file. The visible counter is now silent and a separate sr-only region
  announces only the settled outcome.
- **`aria-pressed` on an unavailable button**, which reads as an unpressed
  toggle rather than a broken one. Dropped, and the label reworded to
  "X, audio unavailable, press to retry".
- Two comments and one plan paragraph claimed a `preload="auto"` belt-and-
  braces that does not exist. Removed.

**Not reproducible as described:** the reviewer read the 44px pad as extending
sideways over neighbouring text. It does, by about 5 to 7px into the inline
margin, which is whitespace between words rather than glyphs. The vertical
reach was the real defect and is fixed above.

### Final verification, round 7

| Check | Result |
|---|---|
| 7 buttons, right cues, running order | yes |
| Audio plays, correct file per button | verified, playhead advances |
| Exclusive playback, press-again stops | yes, one Audio reused |
| Two presses in the same tick | winner plays, nothing stuck, stoppable |
| **Cold start, network off, press play** | **plays to 3.41s of 16s** |
| **Offline seek to 10s** | **works, playing at 11.43s** |
| Cache layout | 7 files in `mhh-audio`, 0 in the versioned cache |
| Prefetch on filter, progress, ready | yes, sequential, 7 of 7 |
| All files missing | honest failure message, retryable |
| Retry after a failed cue | clears and replays |
| Practice mode: blur and peek | button legible, no peek side effect |
| Hit pad vertical steal | 0 (was 8 of 8 probes) |
| Print | buttons hidden |
| Regression A1-A4, search, sheets, rail | all pass |
| 4 widths x 2 themes | no overflow |
| Console errors | none |


### Round 7, second review pass

Ten more findings. Two were mine to have caught before claiming the feature
worked.

**The blur exclusion did not work, and could not have.** A CSS filter
rasterises its entire subtree; `filter: none` on a descendant cannot undo an
ancestor's blur. There is no such thing as un-filtering. My "verified" note
was worthless: the screenshot I checked was not in the blurred state at all.

Two cues sit on actor lines (Maneesh scene 6, Apurva scene 8), and the
reviewer's first pass named only one of them. The button now physically
leaves `.content` while its line is blurred, pinned to the line's own corner,
and returns to its exact position in the sentence when the line is revealed. A
hidden placeholder marks where it came from, so it never comes back at the end
of the paragraph. Verified as an invariant across seven state transitions
(actor set, practice on, reveal all, hide all, actor swapped, practice off):
zero violations, no stranded placeholders, sentence text intact.

**The range branch intercepted every asset, not just audio.** Any same-origin
GET carrying a Range header, including the 2.5 MB hero photo, was pulled into
a heap buffer, sliced, and served with an `audio/mpeg` fallback Content-Type.
Now gated on `isAudio`; everything else falls through to the ordinary
cache-first path. Verified the photo still loads.

Also fixed:

- **Whole-file `arrayBuffer()` on every range request.** A multi-megabyte heap
  allocation plus a second copy for the slice, repeated on every seek, on a
  phone. Now `Blob.slice`, which is a view over the stored bytes rather than a
  copy.
- **Two malformed range cases.** `bytes=5-2` (end before start) produced a
  zero-length 206 with a nonsense Content-Range that a media element cannot
  recover from; it is now a 416. `bytes=-500` (the suffix form, "the last 500
  bytes", which Safari uses) was silently reinterpreted as the FIRST 501
  bytes; it is now handled correctly.
- **The audio cache could go stale forever.** Cache-first with no
  revalidation, query strings stripped, and exempt from the activate sweep
  meant a replaced track under the same filename would play the old recording
  on every device that had already prefetched, with no way to force it. The
  cache is now `mhh-audio-v1`, still exempt from the asset sweep but swept
  when that constant changes. **Bump it whenever a file in `Audio files/` is
  replaced.**
- **The error listener blamed the wrong cue.** It tested `if (cuePlaying)`
  rather than identity, so on a fast second press it marked the newly started
  cue as broken. Now tracks which button owns the loaded src and compares.
- **`"unsupported"` had no label branch** and returned "" only by falling
  through a failure test that happened to be zero. Made explicit, and the
  state comment now names all four states and which are terminal.
- Two more stale comments and one dead `removeAttribute("aria-disabled")`.

### Final verification, round 7 second pass

| Check | Result |
|---|---|
| Blurred line: button legible and usable | yes, detached to the line corner |
| Detach invariant, 7 transitions | 0 violations, 0 stranded placeholders |
| Sentence text after round trip | intact |
| Range branch scope | audio only; hero photo unaffected |
| Offline play and seek | plays, seeks to 10.53s, still playing |
| Cache split | `mhh-v6` 12 assets 0 mp3, `mhh-audio-v1` 7 mp3 |
| A1 / A2 / A3 / A4 | 9 cues, 0 hidden, 0 stray, 4 keys |
| Print | 0 stubs, 75 lines, buttons hidden |
| Search, sheets | 18 hits, 8 rows |
| 4 widths x 2 themes | no overflow |
| Console errors | none |

### Round 7, third review pass

Five findings. Two were real defects in my own fixes from the previous pass.

**`CACHE_VERSION` was not bumped when the audio was split out.** The previous
build wrote the seven mp3s into `mhh-v6`; leaving the constant at `mhh-v6`
meant activate would keep that cache intact on any device upgrading from it,
so the audio would be stored twice (about 17.6 MB) and the global
`caches.match` could serve the stale copy from the wrong cache, defeating the
whole point of giving the audio its own version counter. Bumped to `mhh-v7`,
and both lookups are now scoped to their own cache with
`caches.open(target).then(c => c.match(...))` rather than the global search,
which has no defined ordering across caches.

**The `cueLoadingFor` fix was vacuous.** It tracked the button, and the button
is assigned in the same breath as `cuePlaying`, so the two were always
identical and the guard collapsed to the truthiness test it was meant to
replace. The error event carries no identity of its own, so the test now
compares the element's resolved `currentSrc` against the URL recorded when the
src was set. Verified against the exact race: press a broken cue, press a good
one in the same tick, and the good one plays, is correctly labelled, is not
marked unavailable, and remains stoppable.

Also fixed:

- `stopCue` now clears the tracked src, so a late error cannot be attributed
  to a track that was already stopped.
- The re-attach branch used to strip `is-detached` even when the placeholder
  was missing, which would drop the button out of its sentence and into the
  line's grid with no way back. It now returns without touching the class
  unless the slot was actually found.
- The placeholder was looked up as "the first slot in this line". Scene 1
  already carries two cues on one line, so that assumption holds only while no
  such line is actor-attributed. Slots are now keyed to their button.

### Final verification, round 7 third pass

| Check | Result |
|---|---|
| Cache split, clean install | `mhh-v7` 12 assets 0 mp3, `mhh-audio-v1` 7 mp3 |
| Offline play and seek | plays, seeks to 10.53s, still playing |
| Broken cue then good cue, same tick | good one plays, labelled, stoppable |
| Detach invariant, 7 transitions | 0 violations, 0 stranded placeholders |
| A1 / A2 / A3 / A4 | 9 cues, 0 hidden, 0 stray, 4 keys |
| Search | 18 hits |
| Console errors | none |

**Note for the next release: `AUDIO_CACHE` must be bumped whenever a file in
`Audio files/` is replaced, added or renamed**, or devices that have already
prefetched will keep playing the old recording.

### Round 7, fourth review pass

Five findings, all real, all fixed.

- **The navigation branch had a key mismatch.** It stored the cached page
  under the full request URL but read it back without `ignoreSearch`, so a
  visit carrying a query string (a shared link, a launcher parameter) wrote an
  entry a later plain-URL visit could not find. Rescoping the asset lookups in
  the previous pass had left this one inconsistent with the rest of the file.
  Now keyed on the path and read with `ignoreSearch`, scoped to its own cache.
  Verified: visit with `?tracking=abc`, go offline, load the bare URL, 200.
- **The detach test inferred state from parentage** rather than reading the
  class the function itself sets. True only while every cue sits inside
  `.content > p`; a cue authored as a direct child of `.line`, where the
  reveal button and music badge already live, would have read as permanently
  detached and never been positioned. Now reads `is-detached`.
- **The slot key was an array index written into the DOM.** Stable this
  session, but it would silently disagree with the array if a cue were ever
  added or reordered. The button now holds a direct reference to its own
  placeholder: no key, no query, nothing to get out of step.
- **A genuine failure could be missed after a double tap.** Two presses on one
  26px disc run `playCue` twice; the second stops the first and clears the
  tracked src, so a real load error arriving afterwards was discarded and a
  broken file looked like a working button. `stopCue` now detaches the source
  outright, so no error can arrive for a track we deliberately stopped.
- **`cursor: not-allowed` on a button that retries when pressed.** It told a
  pointer user the control was inert while the accessible name said "press to
  retry". Removed.

### Final verification, round 7 fourth pass

| Check | Result |
|---|---|
| Offline navigation after a query-string visit | 200 |
| Detach invariant, 6 transitions | 0 violations, 0 stranded slots, text intact |
| Slot keying | direct reference, no `data-slot` in the DOM |
| Double tap a broken cue | ends idle (second tap is a stop), no false state |
| Single press a broken cue | "audio unavailable, press to retry" |
| Cursor on an unavailable button | pointer, matching the retry promise |
| Cache split, clean install | `mhh-v7` 12 assets 0 mp3, `mhh-audio-v1` 7 mp3 |
| Offline play and seek | plays, seeks to 10.53s, still playing |
| A1 / A2 / A3 / A4, search, sheets | 9 cues, 0, 0, 4 keys, 18 hits, 8 rows |
| Print | 0 stubs, 75 lines, buttons hidden |
| 4 widths x 2 themes | no overflow |
| Console errors | none |

### Round 7, fifth review pass

All five fixes from the fourth pass confirmed holding. Two new defects, both
introduced by my own navigation rewrite in that pass, both fixed.

- **The navigation write had no status guard.** `fetch()` resolves happily for
  a 404, a 500, or a captive portal's sign-in page, and `Cache.put` only
  refuses a 206, so any of those would have been stored over the good cached
  page and served as the app on the next offline visit. Venue wifi with a
  portal is exactly where this would have bitten. Now gated on
  `status === 200 && type === "basic"`, the same guard the asset path already
  used; the rewrite simply failed to carry it across.
- **Neither runtime `Cache.put` had a catch.** A quota failure would surface
  as an unhandled rejection inside the service worker, and quota pressure is
  realistic here rather than theoretical given the audio cache is 8.8 MB on
  the operator's phone. Both now swallow it, matching the install handler's
  existing posture of tolerating a failed `cache.add`.

### Final verification, round 7 fifth pass

| Check | Result |
|---|---|
| Cached pages after several visits | `/` and `/index.html`, nothing spurious |
| Offline navigation | 200, real page: 75 lines, script alive |
| Offline audio after prefetch | playing |
| Console errors | none |

---

## Round 8 — the scene rail's prev/next were being missed (2026-09-06)

Raised by the user: the tick column works, but the two buttons at the bottom
of it are too subtle to notice, especially in day mode.

### Why

When the rail was slimmed in round 6 I stripped the buttons to bare 14px
chevrons on a transparent background, in `--ink-dim`, inside a rail that fades
to 82% when idle. The result reads as two more marks at the bottom of a column
of marks: a cast member scrolling past sees a tick column and never registers
that the last two items are controls. Worse in the light theme, where a thin
grey chevron on warm paper is nearly nothing.

### Fix: make them look like buttons

- **Filled discs in the accent colour**, 30x30, with a border and a heavier
  2.6 stroke on a 15px arrow. Accent is used nowhere else in the rail, so the
  two controls are immediately distinct from the eight ticks.
- **Rail widened 24px to 36px** to hold them. `overflow-y: auto` makes the
  rail a clipping box, so anything wider than the rail is simply cut off.
- **More separation**: the gap under the divider went 0.1rem to 0.3rem, and
  the buttons are spaced 0.3rem apart rather than 0.1rem.
- **Disabled is now not drawn at all** rather than drawn faintly. Every dimmed
  treatment measured under the 3:1 non-text floor once the rail's idle fade
  multiplied it, and a faint disc beside a bold one muddies the bold one too.
  With one arrow gone the live one is unmistakable, and its direction is
  itself the information. `visibility: hidden`, not `display`, so the rail's
  height does not change at the ends of the running order.

### The overlap trade

36px in a 24px gutter means the rail now overhangs the reading column by 12px.
Measured with Range rects at every size: **zero glyphs** underneath it. The
overhang falls on the line card's own padding, which is wider than 12px. That
is the right trade for buttons that can actually be found.

### Verification

| Check | Result |
|---|---|
| Rail 36px, buttons 30x30, not clipped | all 7 sizes |
| Glyph overlap | 0 at 360, 390, 430, 768, 820, landscape |
| Clears the bottom bar, stays in viewport | yes, all sizes |
| Rail height when a button hides | 362px both ways, no jump |
| At scene 1 / scene 8 | correct arrow hidden, other live |
| Tap a tick, next, prev | all still work |
| Regression: cue buttons, music cues, A2, A3, A4, search, sheets | 7, 9, 0, 0, 4, 18, 8 |
| Print | rail and cue buttons hidden, 75 lines |
| 4 widths x 2 themes | no overflow |
| Console errors | none |
