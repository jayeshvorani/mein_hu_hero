# BRIEF — Mein hu Hero rehearsal companion

## Status

Live. Round 5 (2026-09-05) complete pending review: five defects fixed, the
orientation strip removed, the draft-marking accepted, and the end-of-scene
links replaced by a floating scene rail. See PLAN.md "Round 5" for detail.

Earlier rounds (visual redesign, phone-first rebuild, mobile search rebuild)
are recorded in PLAN.md and are not repeated here.

### Current state of the deliverable

- Single self-contained `index.html`, plus `sw.js`, `manifest.webmanifest`,
  self-hosted subset fonts and icons. No build step.
- Type: Bricolage Grotesque (display), Hanken Grotesk (body), JetBrains Mono
  (labels, cues, scene numbers). All three SIL OFL, self-hosted and subset.
- Colour: OKLCH-derived from four show hues (marigold, sindoor, magenta,
  peacock teal), dark and light themes off one identity, every text token
  solved to WCAG AA against its own surface.
- Markers still carrying meaning: stage directions (italic) and music cues
  (teal, plus a note badge). Draft markers are gone: added text was accepted
  as final in round 5, struck text was deleted from the script.
- Navigation: sticky sidebar above 900px; below that a scene rail on the
  right edge (running order, current scene, prev/next) plus the Scenes sheet.

## What this is

A single self-contained `index.html` used by an amateur/community Bollywood-skit
cast (~12 people) to rehearse. It already works well: search, practice mode
(blur your own lines), cue mode (compress the preceding line to a cue), actor
filter, per-scene nav, day/night, print, keyboard shortcuts, adjustable text.
Reviewed already: strong tool, clean editorial look, minor content roughness.

## Audience

The cast. Non-technical. Reading on phones at rehearsal, often standing, under
variable light. Some open it once and need to understand it without a manual.

## The job of the page

Get an actor from "opened the page" to "rehearsing my lines" in as few taps as
possible, on a phone, and make the markup + modes self-explaining.

## Goals agreed

1. Easier for actors on stage (phone-first, fast to find + drill your lines).
2. Easier for first-time users (orientation, discoverable modes, explained markup).
3. Nicer look and feel — a distinctive **vintage Bollywood film-poster** identity.
4. Content roughness: **leave as-is** (source is a Google Doc master; fixed there).

## Specific instructions from the user

- Mobile scene strip (Homecoming / The Job Interview / …) must **read clearly as
  tabs**. Today it is a horizontal scroll that isn't obviously interactive.
- **Remove** the "7 of 8 scenes end with Raj's hand on his forehead" gag badge in
  the hero. It distracts.
- Hero becomes a **character picker**: choose your character → drop straight into
  practice mode. This is the primary action.
- Interface language stays **English** (dialogue stays Hindi-in-Latin-script).
- Keep every existing feature working. Design + structure only; no content edits.

## Design plan (frontend-design)

### Direction: vintage hand-painted Bollywood film poster

Warm, theatrical, unmistakably the subject. Restraint everywhere except the
signature. Not the AI-default cream/serif/terracotta look — this is a saturated
poster palette with a condensed display face and ticket/filmstrip devices that
encode real structure (scenes are a running order; a rehearsal is a ticket).

### Colour (light theme; dark theme derives from it)

- `--poster-ink` #1E1A17 near-black warm ink (text)
- `--marigold` #F4A521 marigold — primary accent (the poster gold)
- `--sindoor` #C1362F deep vermilion/sindoor red — secondary accent, CTAs
- `--magenta` #A6215E poster magenta — used sparingly for "twist"/emphasis
- `--paper` #FBF3E4 warm poster paper (background)
- `--surface` #FFFDF8 raised card
- `--teal` #17706E peacock teal — music cues (was flat blue)
  Meaning kept from the original markup: added text, music cue, optional cut,
  struck cut — remapped onto this palette, legend updated to match.

### Type

- Display: a bold **condensed** face with poster swagger (e.g. Anton, or
  Archivo/Oswald Expanded weight) for the title, scene titles, character picker.
  Used with restraint — big only where it earns it.
- Body: a warm, highly legible humanist sans for dialogue (stage reading under
  poor light is the constraint) — keep Source Sans 3 or move to something with a
  taller x-height; will pick in build and justify.
- Utility/mono: keep a mono for labels, cue flags, scene numbers, keyboard hints.

### Layout / structure

- **Hero = character picker.** Poster-style title lockup, one line of tagline,
  then a grid of character "cast cards" (character name, actor, the scene count
  they're in). Tap a card → practice mode on, filtered to that character,
  scrolled to their first line. A clear "Just reading / All" escape.
- **Scene numbering stays** — it's a genuine running order, so numbers carry
  real information (order matters to a rehearsal). Rendered as a filmstrip/ticket
  motif rather than plain 01/02.
- **Mobile scenes = real tabs.** Segmented, clearly-tappable pill tabs with an
  active state, a visible edge-fade + count so it's obvious they scroll, and the
  active tab auto-scrolls into view. Actor-present dot kept.
- Dialogue two-column on desktop, stacked on mobile — unchanged, it works.

### Signature (the one memorable thing)

A **ticket-stub / filmstrip scene marker**: each scene opens with a perforated
"ticket" header carrying the scene number and title in poster type, and the
mobile tabs echo the same stub shape. Everything else stays quiet.

### First-time orientation

- Removed in round 5. The cast know the tool, and the strip cost a screenful
  above the first scene on a phone. The legend below the cast list still
  explains the markers that remain.
- Mode buttons keep their plain-language labels and tooltips.

## Quality floor (non-negotiable, not announced)

Responsive to 360px, visible keyboard focus, `prefers-reduced-motion` respected,
print stylesheet preserved, ARIA/`aria-pressed` preserved, WCAG AA contrast
checked for the new palette (marigold-on-paper and text combinations).

## Build + review loop

Single-file `index.html`, which is itself the source. After building, render
at 360 / 390 / 768 / 820 / 1440px in both themes, exercise search / practice /
cue / picker / rail / sheets / print, then hand to the `deliverable-reviewer`
against this brief. Repeat until clean. A timestamped `index.backup-*.html` is
taken before each round.

## Open questions

- None blocking. Body typeface final choice made at build, justified in the
  handover.

```

```
