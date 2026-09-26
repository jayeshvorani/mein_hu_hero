/* Mein hu Hero · script editor.
 *
 * Edits show.json, the single source of truth for the script, cast, songs
 * and sound effects. The rehearsal site (index.html) renders from the same
 * file, so publishing here is all it takes to change the live site.
 *
 * How changes flow:
 *   1. Every edit is applied to an in-memory copy and saved straight away as
 *      a DRAFT in this browser (localStorage), so nothing is lost if the tab
 *      closes. index.html?draft previews that draft.
 *   2. PUBLISH writes show.json to the GitHub repository through the GitHub
 *      API. GitHub Pages redeploys the site about a minute later.
 *   3. The SHA of show.json the draft was based on is kept, so publishing
 *      over someone else's newer version is caught and asked about.
 *
 * Audio files are uploaded to the repository as soon as they are chosen,
 * under a name that is never reused, so the site's offline audio cache can
 * never serve an old recording under a new track's name. A file that ends
 * up unused is harmless.
 *
 * Plain ES5-style JavaScript, no build step and no dependencies, to match
 * the rest of the site.
 */
(function () {
  "use strict";

  var DRAFT_KEY = "mhh-editor-draft";
  var SETTINGS_KEY = "mhh-editor-settings";
  var HINT_KEY = "mhh-editor-hint-dismissed";
  var SHOW_PATH = "show.json";
  var UNDO_LIMIT = 200;
  // actorId for a part the whole company plays; null means not cast yet
  var EVERYONE = "everyone";

  // ------------------------------------------------------------------
  // state
  // ------------------------------------------------------------------
  var S = {
    show: null, // the working copy being edited
    baseSha: null, // sha of the published show.json this draft started from
    baseJson: "", // that published version, to tell "changed" from "not"
    undo: [], // [{ snap, label }]
    redo: [],
    tab: "script",
    detailsOpen: {}, // scene id -> scene details panel open
  };

  var app = document.getElementById("app");
  var statusEl = document.getElementById("status");
  var undoBtn = document.getElementById("undoBtn");
  var redoBtn = document.getElementById("redoBtn");

  // ------------------------------------------------------------------
  // small helpers
  // ------------------------------------------------------------------
  function $(sel, root) {
    return (root || document).querySelector(sel);
  }
  function $all(sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  }
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function uid(prefix) {
    return (
      prefix +
      "-" +
      Date.now().toString(36) +
      Math.random().toString(36).slice(2, 6)
    );
  }
  function two(n) {
    return (n < 10 ? "0" : "") + n;
  }
  function scrollBehaviour() {
    return window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "auto"
      : "smooth";
  }
  function plural(n, one, many) {
    return n + " " + (n === 1 ? one : many || one + "s");
  }
  function clone(o) {
    return JSON.parse(JSON.stringify(o));
  }
  function readJson(key) {
    try {
      return JSON.parse(localStorage.getItem(key) || "null");
    } catch (e) {
      return null;
    }
  }
  function writeJson(key, val) {
    try {
      localStorage.setItem(key, JSON.stringify(val));
      return true;
    } catch (e) {
      return false;
    }
  }
  function slug(s) {
    return (
      String(s)
        .toLowerCase()
        .replace(/\.[a-z0-9]+$/, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 40) || "track"
    );
  }
  function titleFromFile(name) {
    return String(name)
      .replace(/\.[a-z0-9]+$/i, "")
      .replace(/^\d+\s*[-_.]\s*/, "")
      .replace(/[_]+/g, " ")
      .trim();
  }

  var ICONS = {
    grip: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>',
    plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    trash:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
    more: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>',
    play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>',
    stop: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="1" fill="currentColor"/></svg>',
    up: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 15 6-6 6 6"/></svg>',
    down: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>',
  };

  ICONS.note =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>';
  ICONS.speaker =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>';

  var KIND_LABEL = {
    line: "Line",
    direction: "Stage direction",
    song: "Song",
    sfx: "Sound effect",
  };

  // ------------------------------------------------------------------
  // rich text: the stored subset is <p>, <i>, <mark>, <br>
  // ------------------------------------------------------------------
  // Turns whatever the browser's contenteditable produced (divs, spans,
  // pasted fragments) into that subset. Same whitelist the site renders
  // with, so what is typed here is exactly what the cast will see.
  function cleanRich(html) {
    var tpl = document.createElement("template");
    tpl.innerHTML = html || "";
    var paras = [];
    var cur = null;
    function open() {
      if (cur === null) {
        cur = "";
      }
    }
    function close() {
      if (cur !== null) {
        paras.push(cur);
        cur = null;
      }
    }
    function walk(node, it, mu) {
      Array.prototype.forEach.call(node.childNodes, function (n) {
        if (n.nodeType === 3) {
          var t = n.nodeValue.replace(/[\s ]+/g, " ");
          if (!t) return;
          open();
          t = esc(t);
          if (it) t = "<i>" + t + "</i>";
          if (mu)
            t =
              (mu === "sfx" ? '<mark class="sfx">' : "<mark>") + t + "</mark>";
          cur += t;
        } else if (n.nodeType === 1) {
          var tag = n.tagName;
          var style = (n.getAttribute("style") || "").toLowerCase();
          if (tag === "BR") {
            open();
            cur += "<br>";
          } else if (tag === "P" || tag === "DIV" || tag === "LI") {
            close();
            walk(n, it, mu);
            close();
          } else {
            walk(
              n,
              it ||
                tag === "I" ||
                tag === "EM" ||
                style.indexOf("italic") !== -1,
              // <mark> is a song cue, <mark class="sfx"> a sound effect
              mu ||
                (tag === "MARK"
                  ? n.classList.contains("sfx")
                    ? "sfx"
                    : "song"
                  : ""),
            );
          }
        }
      });
    }
    walk(tpl.content, false, "");
    close();
    return paras
      .map(function (p) {
        p = p
          .replace(/<\/i><i>/g, "")
          .replace(/^(<br>|\s)+|(<br>|\s)+$/g, "");
        return p.trim();
      })
      .filter(Boolean)
      .map(function (p) {
        return "<p>" + p + "</p>";
      })
      .join("");
  }
  function plainOf(html) {
    var d = document.createElement("div");
    d.innerHTML = html || "";
    return (d.textContent || "").replace(/\s+/g, " ").trim();
  }

  // ------------------------------------------------------------------
  // lookups
  // ------------------------------------------------------------------
  function byId(list, id) {
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  function findItem(itemId) {
    var scenes = S.show.scenes;
    for (var s = 0; s < scenes.length; s++) {
      var items = scenes[s].items;
      for (var i = 0; i < items.length; i++) {
        if (items[i].id === itemId)
          return { scene: scenes[s], sceneIndex: s, index: i, item: items[i] };
      }
    }
    return null;
  }
  function eachItem(fn) {
    S.show.scenes.forEach(function (sc, si) {
      sc.items.forEach(function (it, ii) {
        fn(it, sc, si, ii);
      });
    });
  }
  function characterLabel(c) {
    var a = byId(S.show.actors, c.actorId);
    return (
      c.name +
      (a ? " · " + a.name : c.actorId === EVERYONE ? "" : " · not cast yet")
    );
  }
  // Scene "who is on stage" text is free text, so it does not follow a
  // character by id. Renaming a character rewrites the old name there;
  // removing one (newName "") takes it out and tidies the commas.
  function renameInCast(sh, oldName, newName) {
    oldName = (oldName || "").trim();
    if (!oldName || oldName === newName) return;
    var rx = new RegExp(
      "\\b" + oldName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b",
      "gi",
    );
    sh.scenes.forEach(function (sc) {
      if (!sc.cast) return;
      var v = sc.cast.replace(rx, newName);
      if (!newName)
        v = v
          .replace(/\s*,(\s*,)+\s*/g, ", ")
          .replace(/^\s*,\s*|\s*,\s*$/g, "")
          .trim();
      sc.cast = v;
    });
  }
  function usesOf(kind, id) {
    var found = [];
    eachItem(function (it, sc, si) {
      if (
        (kind === "character" && it.type === "line" && it.characterId === id) ||
        (kind === "song" && it.type === "song" && it.songId === id) ||
        (kind === "sfx" && it.type === "sfx" && it.sfxId === id)
      )
        found.push({ item: it, sceneIndex: si });
    });
    return found;
  }
  function sceneList(uses) {
    var seen = {};
    var out = [];
    uses.forEach(function (u) {
      if (!seen[u.sceneIndex]) {
        seen[u.sceneIndex] = true;
        out.push(u.sceneIndex + 1);
      }
    });
    return out.length
      ? (out.length === 1 ? "scene " : "scenes ") + out.join(", ")
      : "";
  }

  // ------------------------------------------------------------------
  // changes, undo, draft
  // ------------------------------------------------------------------
  // Every change goes through here: snapshot for undo, apply, save the
  // draft, redraw. Text typed into a field is the exception; see bindText.
  function change(label, fn, opts) {
    var snap = JSON.stringify(S.show);
    fn(S.show);
    if (JSON.stringify(S.show) === snap) return;
    pushUndo(snap, label);
    saveDraft();
    if (!opts || opts.render !== false) render();
    if (opts && opts.toast) toast(opts.toast, true);
  }
  // Undo labels are stored as they read in a toast after the fact
  // ("Deleted stage direction"). Undo and redo messages name the action
  // instead: "Undone: delete stage direction."
  var VERB = {
    Added: "add", Changed: "change", Chose: "choose", Deleted: "delete",
    Discarded: "discard", Duplicated: "duplicate", Edited: "edit",
    Loaded: "load", Moved: "move", Recast: "recast", Removed: "remove",
    Renamed: "rename", Replaced: "replace", Uploaded: "upload",
  };
  function actionName(label) {
    var m = /^(\S+)(.*)$/.exec(label || "");
    if (!m) return label;
    return VERB[m[1]] ? VERB[m[1]] + m[2] : label.charAt(0).toLowerCase() + label.slice(1);
  }
  function pushUndo(snap, label) {
    // A toast's Undo button undoes the change it announced. Once anything
    // else changes, that is no longer the top of the stack, so the toast
    // goes rather than let its button undo the wrong thing.
    if (!toastEl.hidden && !$("#toastBtn").hidden) toastEl.hidden = true;
    S.undo.push({ snap: snap, label: label });
    if (S.undo.length > UNDO_LIMIT) S.undo.shift();
    S.redo = [];
    syncUndoButtons();
  }
  function undo() {
    var e = S.undo.pop();
    if (!e) return;
    S.redo.push({ snap: JSON.stringify(S.show), label: e.label });
    S.show = JSON.parse(e.snap);
    saveDraft();
    render();
    toast("Undone: " + actionName(e.label) + ".", false);
  }
  function redo() {
    var e = S.redo.pop();
    if (!e) return;
    S.undo.push({ snap: JSON.stringify(S.show), label: e.label });
    S.show = JSON.parse(e.snap);
    saveDraft();
    render();
    toast("Redone: " + actionName(e.label) + ".", false);
  }
  function syncUndoButtons() {
    undoBtn.disabled = !S.undo.length;
    redoBtn.disabled = !S.redo.length;
    undoBtn.title = S.undo.length
      ? "Undo: " + actionName(S.undo[S.undo.length - 1].label) + " (Ctrl+Z)"
      : "Nothing to undo";
    redoBtn.title = S.redo.length
      ? "Redo: " + actionName(S.redo[S.redo.length - 1].label) + " (Ctrl+Shift+Z)"
      : "Nothing to redo";
  }

  var draftTimer = null;
  function saveDraft() {
    clearTimeout(draftTimer);
    draftTimer = setTimeout(saveDraftNow, 250);
    syncStatus();
  }
  function saveDraftNow() {
    clearTimeout(draftTimer);
    var ok = writeJson(DRAFT_KEY, {
      show: S.show,
      baseSha: S.baseSha,
      baseJson: S.baseJson,
      savedAt: Date.now(),
    });
    if (!ok)
      toast(
        "Could not save the draft in this browser. Publish soon.",
        false,
        true,
      );
    syncStatus();
  }
  function isDirty() {
    return S.show && JSON.stringify(S.show) !== S.baseJson;
  }
  function syncStatus() {
    syncUndoButtons();
    var dirty = isDirty();
    statusEl.textContent = dirty
      ? "Unpublished changes, draft saved"
      : "Everything is published";
    statusEl.classList.toggle("is-dirty", dirty);
    $("#publishBtn").disabled = !dirty;
  }

  // ------------------------------------------------------------------
  // toast
  // ------------------------------------------------------------------
  var toastEl = document.getElementById("toast");
  var toastTimer = null;
  function toast(msg, withUndo, isError) {
    $("#toastText").textContent = msg;
    var btn = $("#toastBtn");
    btn.hidden = !withUndo;
    toastEl.classList.toggle("is-error", !!isError);
    toastEl.hidden = false;
    keepFmtBarClear();
    clearTimeout(toastTimer);
    toastTimer = setTimeout(
      function () {
        toastEl.hidden = true;
      },
      withUndo || isError ? 8000 : 3500,
    );
  }
  $("#toastBtn").addEventListener("click", function () {
    toastEl.hidden = true;
    undo();
  });

  // ------------------------------------------------------------------
  // dialog: ask({ title, body, buttons }) -> Promise(value)
  // ------------------------------------------------------------------
  var dialog = document.getElementById("dialog");
  var dialogResolve = null;
  function ask(opts) {
    $("#dialogTitle").textContent = opts.title;
    var body = $("#dialogBody");
    body.innerHTML = "";
    if (typeof opts.body === "string") body.innerHTML = opts.body;
    else if (opts.body) body.appendChild(opts.body);
    var bar = $("#dialogButtons");
    bar.innerHTML = "";
    (opts.buttons || [{ label: "OK", value: "ok", primary: true }]).forEach(
      function (b) {
        var el = document.createElement("button");
        el.type = "button";
        el.className =
          "btn" + (b.primary ? " primary" : "") + (b.danger ? " danger" : "");
        el.textContent = b.label;
        el.addEventListener("click", function () {
          if (b.validate && !b.validate()) return;
          close(b.value);
        });
        bar.appendChild(el);
      },
    );
    function close(v) {
      var r = dialogResolve;
      dialogResolve = null;
      dialog.close();
      if (r) r(v);
    }
    return new Promise(function (resolve) {
      dialogResolve = resolve;
      dialog.showModal();
      var first = body.querySelector("input, select, textarea");
      if (first) first.focus();
      else {
        // A destructive confirm opens on the safe choice, so a stray Enter
        // or Space cannot delete or overwrite anything.
        var p = bar.querySelector(".primary") || bar.lastChild;
        if (p && p.classList.contains("danger"))
          p = bar.querySelector(".btn:not(.danger)") || p;
        if (p) p.focus();
      }
    });
  }
  dialog.addEventListener("cancel", function () {
    if (dialogResolve) {
      var r = dialogResolve;
      dialogResolve = null;
      r(null);
    }
  });
  $("#dialogForm").addEventListener("submit", function (e) {
    // Enter in a text field presses the primary button
    e.preventDefault();
    // Enter never presses a destructive button: that takes a deliberate press.
    var p = $("#dialogButtons .primary");
    if (p && !p.classList.contains("danger")) p.click();
  });
  function el(html) {
    var d = document.createElement("div");
    d.innerHTML = html;
    return d;
  }

  // ------------------------------------------------------------------
  // popover menus
  // ------------------------------------------------------------------
  var openMenu = null;
  function closeMenu() {
    if (!openMenu) return;
    openMenu.el.remove();
    if (openMenu.anchor) openMenu.anchor.setAttribute("aria-expanded", "false");
    openMenu = null;
  }
  // entries: [{ label, onClick, danger, dot }] or "-" for a divider
  function showMenu(anchor, entries) {
    closeMenu();
    var m = document.createElement("div");
    m.className = "menu";
    m.setAttribute("role", "menu");
    entries.forEach(function (e) {
      if (e === "-") {
        m.appendChild(document.createElement("hr"));
        return;
      }
      var b = document.createElement("button");
      b.type = "button";
      b.setAttribute("role", "menuitem");
      if (e.danger) b.className = "danger";
      b.innerHTML =
        (e.dot
          ? '<span class="dot" style="background:' + e.dot + '"></span>'
          : "") + esc(e.label);
      b.addEventListener("click", function () {
        closeMenu();
        e.onClick();
      });
      m.appendChild(b);
    });
    document.body.appendChild(m);
    var r = anchor.getBoundingClientRect();
    var mw = m.offsetWidth;
    var mh = m.offsetHeight;
    var left = Math.min(
      window.scrollX + r.left,
      window.scrollX + document.documentElement.clientWidth - mw - 12,
    );
    var top = window.scrollY + r.bottom + 6;
    if (r.bottom + mh + 12 > window.innerHeight && r.top > mh + 12)
      top = window.scrollY + r.top - mh - 6;
    m.style.left = Math.max(12, left) + "px";
    m.style.top = top + "px";
    anchor.setAttribute("aria-expanded", "true");
    openMenu = { el: m, anchor: anchor };
    var first = m.querySelector("button");
    if (first) first.focus();
  }
  document.addEventListener("pointerdown", function (e) {
    if (
      openMenu &&
      !openMenu.el.contains(e.target) &&
      e.target !== openMenu.anchor
    )
      closeMenu();
  });
  document.addEventListener("keydown", function (e) {
    if (!openMenu) return;
    if (e.key === "Escape") {
      var a = openMenu.anchor;
      closeMenu();
      if (a) a.focus();
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      var bs = $all("button", openMenu.el);
      var i = bs.indexOf(document.activeElement);
      i = (i + (e.key === "ArrowDown" ? 1 : -1) + bs.length) % bs.length;
      bs[i].focus();
    }
  });

  // ------------------------------------------------------------------
  // rendering
  // ------------------------------------------------------------------
  // Everything is redrawn from S.show after a structural change. Focus is
  // put back on the element with the same data-key, so tabbing through
  // fields or pressing a move key does not lose the user's place.
  function render() {
    closeMenu();
    hideFmtBar();
    var active = document.activeElement;
    var key = active && active.getAttribute && active.getAttribute("data-key");
    var sel = null;
    if (
      key &&
      active.setSelectionRange &&
      typeof active.selectionStart === "number"
    ) {
      sel = [active.selectionStart, active.selectionEnd];
    }
    if (S.tab === "script") {
      renderScript();
      markCurrentScene();
    }
    else if (S.tab === "cast") renderCast();
    else renderSounds();
    $all(".tab").forEach(function (t) {
      t.setAttribute(
        "aria-pressed",
        t.getAttribute("data-tab") === S.tab ? "true" : "false",
      );
    });
    if (key) {
      var again = app.querySelector('[data-key="' + key + '"]');
      if (again) {
        again.focus({ preventScroll: true });
        if (sel && again.setSelectionRange) {
          try {
            again.setSelectionRange(sel[0], sel[1]);
          } catch (e) {
            /* not a text input */
          }
        }
      }
    }
    syncStatus();
  }

  function hintHtml() {
    if (readJson(HINT_KEY)) return "";
    return (
      '<div class="hint" id="hint"><div>' +
      "<p><strong>How this works.</strong> Click any text to change it. Drag the dotted handle to move a line, song or sound effect, or use the <strong>+</strong> buttons to add one. " +
      "Everything is kept as a draft in this browser as you go, and <strong>Undo</strong> takes back any change. Nobody else sees your edits until you press <strong>Publish</strong>.</p>" +
      '</div><button type="button" class="btn small" id="hintClose">Got it</button></div>'
    );
  }

  // ----- script tab -----
  function renderScript() {
    var sh = S.show;
    var html = hintHtml();
    html +=
      '<div class="script-layout"><nav class="scene-index" aria-label="Scenes">';
    html +=
      '<div class="scene-index-label">Scenes</div><ol class="scene-index-list" id="sceneIndex">';
    sh.scenes.forEach(function (sc, i) {
      html +=
        '<li class="scene-index-item" data-scene-id="' +
        esc(sc.id) +
        '"><button type="button" class="handle scene-handle" data-key="sh-' +
        esc(sc.id) +
        '" aria-label="Move scene ' +
        (i + 1) +
        ' (drag, or use the arrow keys)">' +
        ICONS.grip +
        '</button><a href="#blk-' +
        esc(sc.id) +
        '"><span class="num">' +
        two(i + 1) +
        '</span><span class="t">' +
        esc(sc.title || "Untitled scene") +
        "</span></a></li>";
    });
    html +=
      '</ol><button type="button" class="btn small" data-act="add-scene">' +
      ICONS.plus +
      "Add scene</button></nav><div>";
    html +=
      '<label class="scene-jump"><span class="field-label">Jump to scene</span><select class="select" id="sceneJump">' +
      sh.scenes
        .map(function (sc, i) {
          return (
            '<option value="' +
            esc(sc.id) +
            '">' +
            two(i + 1) +
            " " +
            esc(sc.title) +
            "</option>"
          );
        })
        .join("") +
      "</select></label>";
    sh.scenes.forEach(function (sc, i) {
      html += sceneHtml(sc, i);
    });
    html +=
      '<button type="button" class="btn" data-act="add-scene">' +
      ICONS.plus +
      "Add a scene at the end</button></div></div>";
    app.innerHTML = html;
    // Rich text is set through the DOM after cleaning, never concatenated
    // raw, so a stray tag in show.json cannot inject markup here either.
    $all(".rich", app).forEach(function (r) {
      var f = findItem(r.getAttribute("data-item"));
      if (f) r.innerHTML = cleanRich(f.item.text);
    });
  }

  function sceneHtml(sc, i) {
    var open = !!S.detailsOpen[sc.id];
    var h =
      '<section class="scene-block" id="blk-' +
      esc(sc.id) +
      '" data-scene-id="' +
      esc(sc.id) +
      '"><div class="scene-header"><span class="scene-no">Scene ' +
      two(i + 1) +
      '</span><input class="scene-title" data-field="scene-title" data-scene="' +
      esc(sc.id) +
      '" data-key="st-' +
      esc(sc.id) +
      '" value="' +
      esc(sc.title) +
      '" aria-label="Scene ' +
      (i + 1) +
      ' title" placeholder="Scene title" />' +
      '<button type="button" class="btn small ghost" data-act="toggle-details" data-scene="' +
      esc(sc.id) +
      '" aria-expanded="' +
      open +
      '">' +
      (open ? "Hide cast, location &amp; props" : "Cast, location &amp; props") +
      "</button>" +
      '<button type="button" class="icon-btn" data-act="scene-menu" data-scene="' +
      esc(sc.id) +
      '" aria-label="Scene ' +
      (i + 1) +
      ' options" aria-haspopup="menu" aria-expanded="false">' +
      ICONS.more +
      "</button></div>";
    if (open) {
      h +=
        '<div class="scene-details">' +
        detailField(sc, "cast", "Who is on stage (leave empty to list whoever speaks)", true) +
        detailField(sc, "location", "Location", false) +
        detailField(sc, "props", "Props", false) +
        detailField(sc, "notes", "Set-up notes for the crew", true) +
        "</div>";
    }
    h += '<div class="items" data-scene-id="' + esc(sc.id) + '">';
    sc.items.forEach(function (it) {
      h += cardHtml(it);
    });
    h += "</div>";
    h +=
      '<div class="add-row"><span class="add-label">Add to scene ' +
      (i + 1) +
      ":</span>" +
      ["line", "direction", "song", "sfx"]
        .map(function (k) {
          return (
            '<button type="button" class="btn small" data-act="add" data-kind="' +
            k +
            '" data-scene="' +
            esc(sc.id) +
            '">' +
            ICONS.plus +
            KIND_LABEL[k] +
            "</button>"
          );
        })
        .join("") +
      "</div></section>";
    return h;
  }
  function detailField(sc, field, label, full) {
    return (
      '<label class="' +
      (full ? "full" : "") +
      '"><span class="field-label">' +
      label +
      '</span><textarea class="textarea" rows="2" data-field="scene-' +
      field +
      '" data-scene="' +
      esc(sc.id) +
      '" data-key="sd-' +
      field +
      "-" +
      esc(sc.id) +
      '">' +
      esc(sc[field] || "") +
      "</textarea></label>"
    );
  }

  function cardHtml(it) {
    var id = esc(it.id);
    var cls = "card card--" + it.type + (it.optional ? " is-optional" : "");
    var h =
      '<article class="' +
      cls +
      '" data-id="' +
      id +
      '"><button type="button" class="insert-before" data-act="insert" data-item="' +
      id +
      '" aria-haspopup="menu" aria-expanded="false" aria-label="Insert something above this">' +
      ICONS.plus +
      "Insert</button>" +
      '<button type="button" class="handle" data-key="h-' +
      id +
      '" aria-label="Move this ' +
      KIND_LABEL[it.type].toLowerCase() +
      ' (drag, or use the arrow keys)">' +
      ICONS.grip +
      "</button>";
    // who / kind column
    h += '<div class="who">';
    if (it.type === "line") {
      h +=
        '<select class="select" data-field="character" data-item="' +
        id +
        '" data-key="c-' +
        id +
        '" aria-label="Who speaks this line">' +
        characterOptions(it.characterId) +
        "</select>" +
        '<input class="note-input" spellcheck="false" data-field="note" data-item="' +
        id +
        '" data-key="n-' +
        id +
        '" value="' +
        esc(it.note || "") +
        '" placeholder="+ note, e.g. Old" aria-label="Note shown after the name" />';
    } else if (it.type === "direction") {
      h +=
        '<span class="kind">Stage direction</span>' +
        '<input class="note-input" data-field="label" data-item="' +
        id +
        '" data-key="l-' +
        id +
        '" value="' +
        esc(it.label || "") +
        '" placeholder="+ heading (optional)" aria-label="Heading shown beside the direction" />';
    } else {
      h += '<span class="kind">' + KIND_LABEL[it.type] + "</span>";
    }
    h += "</div>";
    // body
    h += '<div class="body">';
    if (it.type === "line" || it.type === "direction") {
      h +=
        '<div class="rich" contenteditable="true" spellcheck="false" role="textbox" aria-multiline="true" data-item="' +
        id +
        '" data-key="t-' +
        id +
        '" aria-label="' +
        (it.type === "line" ? "Line text" : "Direction text") +
        '" data-placeholder="' +
        (it.type === "line"
          ? "Type the line…"
          : "Describe what happens on stage…") +
        '"></div>';
    } else {
      var list = it.type === "song" ? S.show.songs : S.show.sfx;
      var cur = it.type === "song" ? it.songId : it.sfxId;
      var track = byId(list, cur);
      h += '<div class="cue-body">';
      if (!list.length) {
        h +=
          '<span class="empty-note">No ' +
          (it.type === "song" ? "songs" : "sound effects") +
          ' yet. </span><button type="button" class="link-btn" data-act="upload-for" data-item="' +
          id +
          '">Upload one</button>';
      } else {
        h +=
          '<select class="select" data-field="track" data-item="' +
          id +
          '" data-key="k-' +
          id +
          '" aria-label="Which ' +
          KIND_LABEL[it.type].toLowerCase() +
          '">' +
          (track ? "" : '<option value="">Choose…</option>') +
          list
            .map(function (t) {
              return (
                '<option value="' +
                esc(t.id) +
                '"' +
                (t.id === cur ? " selected" : "") +
                ">" +
                esc(t.title) +
                "</option>"
              );
            })
            .join("") +
          '<option value="__new">+ Upload a new one…</option></select>';
        if (track && track.file)
          h +=
            '<button type="button" class="play-btn" data-act="play" data-file="' +
            esc(track.file) +
            '" aria-label="Play ' +
            esc(track.title) +
            '">' +
            ICONS.play +
            "</button>";
      }
      h +=
        '<input class="note-input" spellcheck="false" data-field="note" data-item="' +
        id +
        '" data-key="n-' +
        id +
        '" value="' +
        esc(it.note || "") +
        '" placeholder="+ note for the sound operator, e.g. fade out when Raj enters" aria-label="Note" />';
      h += "</div>";
    }
    h += "</div>";
    // actions
    h += '<div class="card-actions">';
    if (it.type === "line" || it.type === "direction") {
      h +=
        '<button type="button" class="chip-toggle" data-act="optional" data-item="' +
        id +
        '" aria-pressed="' +
        !!it.optional +
        '" aria-label="Optional: ' +
        esc(cardName(it)) +
        '" title="Optional: can be cut if the show runs long. Shown highlighted in yellow on the site.">Optional</button>';
    }
    h +=
      '<button type="button" class="icon-btn" data-act="item-menu" data-item="' +
      id +
      '" aria-label="More options for ' +
      esc(cardName(it)) +
      '" aria-haspopup="menu" aria-expanded="false">' +
      ICONS.more +
      "</button>" +
      '<button type="button" class="icon-btn danger" data-act="delete" data-item="' +
      id +
      '" aria-label="Delete ' +
      esc(cardName(it)) +
      '" title="Delete (you can undo)">' +
      ICONS.trash +
      "</button></div></article>";
    return h;
  }
  function characterOptions(selected) {
    var sel = byId(S.show.characters, selected);
    var h = sel ? "" : '<option value="">Choose who speaks…</option>';
    S.show.characters.forEach(function (c) {
      h +=
        '<option value="' +
        esc(c.id) +
        '"' +
        (c.id === selected ? " selected" : "") +
        ">" +
        esc(characterLabel(c)) +
        "</option>";
    });
    return h + '<option value="__new">+ New character…</option>';
  }

  // Actor values a character can have: an actor's id, EVERYONE for a part
  // the whole company plays, or null for a part nobody has been given yet.
  function actorOptions(selected) {
    return (
      '<option value=""' +
      (selected ? "" : " selected") +
      ">Not cast yet</option>" +
      '<option value="' +
      EVERYONE +
      '"' +
      (selected === EVERYONE ? " selected" : "") +
      ">Everyone</option>" +
      S.show.actors
        .map(function (a) {
          return (
            '<option value="' +
            esc(a.id) +
            '"' +
            (a.id === selected ? " selected" : "") +
            ">" +
            esc(a.name) +
            "</option>"
          );
        })
        .join("")
    );
  }
  // One labelled cell. The label is a column heading's job on a wide
  // screen, so it is visually hidden there but still names the field for
  // screen readers; on a narrow screen, where rows stack, it is shown.
  function cell(label, inner, cls) {
    return (
      '<label class="cell' +
      (cls ? " " + cls : "") +
      '"><span class="cell-label">' +
      label +
      "</span>" +
      inner +
      "</label>"
    );
  }
  function info(label, inner, cls) {
    return (
      '<div class="cell' +
      (cls ? " " + cls : "") +
      '"><span class="cell-label">' +
      label +
      "</span>" +
      inner +
      "</div>"
    );
  }

  // ----- cast tab -----
  function renderCast() {
    var sh = S.show;
    var h =
      '<h1 class="panel-title">Cast</h1><p class="panel-intro">Actors are the real people. Characters are who they play, and the character’s name is what appears beside each line on the site. Each line belongs to a character, so changing who plays a character updates every one of their lines.</p>';

    h +=
      '<section class="section"><div class="section-head"><h2>Actors</h2><p>' +
      plural(sh.actors.length, "actor") +
      '</p><button type="button" class="btn small" data-act="add-actor">' +
      ICONS.plus +
      'Add actor</button></div><div class="rows">';
    if (!sh.actors.length) h += '<p class="empty">No actors yet.</p>';
    else
      h +=
        '<div class="row actor-row row-head" aria-hidden="true"><span>Name</span><span>Plays</span><span></span></div>';
    sh.actors.forEach(function (a) {
      var plays = sh.characters.filter(function (c) {
        return c.actorId === a.id;
      });
      h +=
        '<div class="row actor-row">' +
        cell(
          "Name",
          '<input class="text-input" data-field="actor-name" data-actor="' +
            esc(a.id) +
            '" data-key="an-' +
            esc(a.id) +
            '" value="' +
            esc(a.name) +
            '" />',
        ) +
        info(
          "Plays",
          '<span class="meta">' +
            (plays.length
              ? plays
                  .map(function (c) {
                    return "<strong>" + esc(c.name) + "</strong>";
                  })
                  .join(", ")
              : "Not cast yet") +
            "</span>",
        ) +
        '<div class="cell cell-end"><button type="button" class="btn small danger" data-act="remove-actor" data-actor="' +
        esc(a.id) +
        '" aria-label="Remove ' +
        esc(a.name) +
        '">Remove</button></div></div>';
    });
    h += "</div></section>";

    h +=
      '<section class="section"><div class="section-head"><h2>Characters</h2><p>' +
      plural(sh.characters.length, "character") +
      '</p><button type="button" class="btn small" data-act="add-character">' +
      ICONS.plus +
      'Add character</button></div><div class="rows">';
    if (sh.characters.length)
      h +=
        '<div class="row char-row row-head" aria-hidden="true"><span>Name</span><span>Role</span><span>Played by</span><span>Lines</span><span></span></div>';
    sh.characters.forEach(function (c) {
      var n = usesOf("character", c.id).length;
      h +=
        '<div class="row char-row">' +
        cell(
          "Name",
          '<input class="text-input" data-field="char-name" data-char="' +
            esc(c.id) +
            '" data-key="cn-' +
            esc(c.id) +
            '" value="' +
            esc(c.name) +
            '" />',
        ) +
        cell(
          "Role",
          '<input class="text-input" data-field="char-role" data-char="' +
            esc(c.id) +
            '" data-key="cr-' +
            esc(c.id) +
            '" value="' +
            esc(c.role || "") +
            '" placeholder="e.g. Father" />',
        ) +
        cell(
          "Played by",
          '<select class="select" data-field="char-actor" data-char="' +
            esc(c.id) +
            '" data-key="ca-' +
            esc(c.id) +
            '">' +
            actorOptions(c.actorId) +
            "</select>",
        ) +
        info(
          "Lines",
          '<span class="meta">' + (n ? plural(n, "line") : "No lines") + "</span>",
        ) +
        '<div class="cell cell-end"><button type="button" class="btn small danger" data-act="remove-character" data-char="' +
        esc(c.id) +
        '" aria-label="Remove ' +
        esc(c.name) +
        '">Remove</button></div></div>';
    });
    h += "</div></section>";
    app.innerHTML = h;
  }

  // ----- sounds tab -----
  function renderSounds() {
    var h =
      '<h1 class="panel-title">Songs &amp; sound effects</h1><p class="panel-intro">Upload MP3 files here, then place them in the script from the Script tab. Songs and sound effects are kept separate and look different on the site.</p>';
    h += soundSection("song", "Songs", S.show.songs);
    h += soundSection("sfx", "Sound effects", S.show.sfx);
    app.innerHTML = h;
  }
  function soundSection(kind, title, list) {
    var h =
      '<section class="section"><div class="section-head"><h2>' +
      title +
      "</h2><p>" +
      plural(list.length, kind === "song" ? "song" : "sound effect") +
      '</p><button type="button" class="btn small" data-act="upload" data-kind="' +
      kind +
      '">' +
      ICONS.plus +
      "Upload " +
      (kind === "song" ? "a song" : "a sound effect") +
      '</button></div><div class="rows">';
    if (!list.length)
      h +=
        '<p class="empty">None yet. Upload an MP3 to add ' +
        (kind === "song" ? "a song" : "a sound effect") +
        ".</p>";
    else
      h +=
        '<div class="row sound-row row-head" aria-hidden="true"><span></span><span>Title</span><span>File</span><span>Used in</span><span></span></div>';
    list.forEach(function (t) {
      var uses = usesOf(kind, t.id);
      h +=
        '<div class="row sound-row">' +
        '<div class="cell cell-play">' +
        (t.file
          ? '<button type="button" class="play-btn" data-act="play" data-file="' +
            esc(t.file) +
            '" aria-label="Play ' +
            esc(t.title) +
            '">' +
            ICONS.play +
            "</button>"
          : "") +
        "</div>" +
        cell(
          "Title",
          '<input class="text-input" data-field="track-title" data-kind="' +
            kind +
            '" data-track="' +
            esc(t.id) +
            '" data-key="tt-' +
            esc(t.id) +
            '" value="' +
            esc(t.title) +
            '" />',
          "cell-title",
        ) +
        info(
          "File",
          '<span class="file-name">' +
            esc((t.file || "No file").split("/").pop()) +
            "</span>",
        ) +
        info(
          "Used in",
          '<span class="meta">' +
            (uses.length
              ? esc(sceneList(uses).replace(/^s/, "S")) +
                (uses.length > 1 ? " (" + esc(plural(uses.length, "time")) + ")" : "")
              : "Not placed in the script yet") +
            "</span>",
        ) +
        '<div class="cell cell-end"><button type="button" class="btn small" data-act="replace-file" data-kind="' +
        kind +
        '" data-track="' +
        esc(t.id) +
        '" aria-label="Replace the file for ' +
        esc(t.title) +
        '">Replace file</button> <button type="button" class="btn small danger" data-act="remove-track" data-kind="' +
        kind +
        '" data-track="' +
        esc(t.id) +
        '" aria-label="Remove ' +
        esc(t.title) +
        '">Remove</button></div></div>';
    });
    return h + "</div></section>";
  }

  // ------------------------------------------------------------------
  // text fields: snapshot on focus, commit to undo on blur
  // ------------------------------------------------------------------
  // Typing is not one undo step per key. The state before the field was
  // focused is kept; when the field loses focus, if anything changed, that
  // snapshot becomes a single undo entry ("Edited line").
  var fieldSnap = null;
  var fieldLabel = "";
  app.addEventListener("focusin", function (e) {
    var t = e.target;
    if (
      t.classList.contains("rich") ||
      t.matches(
        "input.text-input, input.note-input, input.scene-title, textarea",
      )
    ) {
      fieldSnap = JSON.stringify(S.show);
      fieldLabel = labelForField(t);
      if (t.classList.contains("rich")) showFmtBar(t);
    }
  });
  app.addEventListener("focusout", function (e) {
    var t = e.target;
    if (t.classList.contains("rich")) {
      // normalise what the browser produced, then store it
      applyField(t);
      var f = findItem(t.getAttribute("data-item"));
      if (f && t.innerHTML !== cleanRich(f.item.text))
        t.innerHTML = cleanRich(f.item.text);
      // Runs after focus has landed. Clicking straight from one text box
      // into another used to hide the bar the new box had just shown.
      setTimeout(function () {
        var now = document.activeElement;
        if (now && now.classList && now.classList.contains("rich")) showFmtBar(now);
        else if (!now || !now.closest || !now.closest(".fmt-bar")) hideFmtBar();
      }, 0);
    }
    if (fieldSnap !== null) {
      var snap = fieldSnap;
      fieldSnap = null;
      if (snap !== JSON.stringify(S.show)) {
        if (t.getAttribute("data-field") === "char-name") {
          var cid = t.getAttribute("data-char");
          var before = byId(JSON.parse(snap).characters, cid);
          var now = byId(S.show.characters, cid);
          if (before && now) renameInCast(S.show, before.name, now.name.trim());
        }
        pushUndo(snap, fieldLabel);
        saveDraftNow();
        // names show up elsewhere (dropdowns, scene list): refresh those
        if (
          /actor-name|char-name|track-title|scene-title/.test(
            t.getAttribute("data-field") || "",
          )
        ) {
          setTimeout(render, 0);
        }
      }
    }
  });
  app.addEventListener("input", function (e) {
    var t = e.target;
    if (
      t.classList.contains("rich") ||
      t.matches(
        "input.text-input, input.note-input, input.scene-title, textarea",
      )
    ) {
      applyField(t);
      saveDraft();
    }
  });
  function labelForField(t) {
    var f = t.getAttribute("data-field") || "";
    if (t.classList.contains("rich")) return "Edited text";
    return (
      {
        "scene-title": "Renamed scene",
        "scene-cast": "Edited who is on stage",
        "scene-location": "Edited location",
        "scene-props": "Edited props",
        "scene-notes": "Edited set-up notes",
        note: "Edited note",
        label: "Edited heading",
        "actor-name": "Renamed actor",
        "char-name": "Renamed character",
        "char-role": "Edited role",
        "track-title": "Renamed track",
      }[f] || "Edit"
    );
  }
  // Copies one field's current value into S.show. No redraw.
  function applyField(t) {
    var f = t.getAttribute("data-field");
    var sh = S.show;
    if (t.classList.contains("rich")) {
      var hit = findItem(t.getAttribute("data-item"));
      if (hit) hit.item.text = cleanRich(t.innerHTML);
      return;
    }
    var v = t.value;
    var sc = byId(sh.scenes, t.getAttribute("data-scene"));
    var it = findItem(t.getAttribute("data-item"));
    if (f === "scene-title" && sc) sc.title = v;
    else if (f === "scene-cast" && sc) sc.cast = v;
    else if (f === "scene-location" && sc) sc.location = v;
    else if (f === "scene-props" && sc) sc.props = v;
    else if (f === "scene-notes" && sc) sc.notes = v;
    else if (f === "note" && it) it.item.note = v.trim() ? v : "";
    else if (f === "label" && it) it.item.label = v;
    else if (f === "actor-name") {
      var a = byId(sh.actors, t.getAttribute("data-actor"));
      if (a) a.name = v;
    } else if (f === "char-name" || f === "char-role") {
      var c = byId(sh.characters, t.getAttribute("data-char"));
      if (c) c[f === "char-name" ? "name" : "role"] = v;
    } else if (f === "track-title") {
      var list = t.getAttribute("data-kind") === "song" ? sh.songs : sh.sfx;
      var tr = byId(list, t.getAttribute("data-track"));
      if (tr) tr.title = v;
    }
  }
  // Enter in a single-line input just finishes the edit
  app.addEventListener("keydown", function (e) {
    if (
      e.key === "Enter" &&
      e.target.matches("input.text-input, input.note-input, input.scene-title")
    ) {
      e.preventDefault();
      e.target.blur();
    }
  });

  // paste as plain text, keeping line breaks as paragraphs
  app.addEventListener("paste", function (e) {
    if (!e.target.closest || !e.target.closest(".rich")) return;
    e.preventDefault();
    var text =
      (e.clipboardData || window.clipboardData).getData("text/plain") || "";
    document.execCommand("insertText", false, text);
  });

  // ------------------------------------------------------------------
  // formatting bar for rich text
  // ------------------------------------------------------------------
  var fmtBar = document.createElement("div");
  fmtBar.className = "fmt-bar";
  fmtBar.hidden = true;
  fmtBar.innerHTML =
    '<button type="button" class="fmt-i" data-fmt="italic" title="Stage direction style: italic and dimmer, for actions inside a line (Ctrl+I)">Stage direction</button>' +
    '<button type="button" class="fmt-m" data-fmt="music" title="Song style: words describing music, shown in teal on the site">' + ICONS.note + 'Song</button>' +
    '<button type="button" class="fmt-s" data-fmt="sfx" title="Sound effect style: words describing a sound effect, shown in magenta on the site">' + ICONS.speaker + 'Sound effect</button>' +
    '<button type="button" data-fmt="plain" title="Remove formatting from the selected words">Plain</button>';
  document.body.appendChild(fmtBar); // moved into a card when editing
  var fmtTarget = null;
  // The bar sits in the card, directly under the text being edited, in
  // normal flow. A floating bar always ended up covering some other line.
  function showFmtBar(r) {
    fmtTarget = r;
    if (r.nextSibling !== fmtBar) r.parentNode.insertBefore(fmtBar, r.nextSibling);
    fmtBar.hidden = false;
    keepFmtBarClear();
  }
  // The toast floats at the bottom of the window. If the formatting bar
  // would sit behind it, scroll just enough to lift the bar clear.
  function keepFmtBarClear() {
    if (fmtBar.hidden || toastEl.hidden || !fmtBar.closest("#app")) return;
    var bar = fmtBar.getBoundingClientRect();
    var t = toastEl.getBoundingClientRect();
    var overlap = bar.bottom + 8 - t.top;
    if (overlap > 0 && bar.right > t.left && bar.left < t.right)
      window.scrollBy(0, overlap);
  }
  function hideFmtBar() {
    fmtBar.hidden = true;
    fmtTarget = null;
    // park it outside #app so a redraw of the script cannot destroy it
    if (fmtBar.parentNode !== document.body) document.body.appendChild(fmtBar);
  }
  // keep the text selection when a format button is pressed
  fmtBar.addEventListener("mousedown", function (e) {
    e.preventDefault();
  });
  fmtBar.addEventListener("click", function (e) {
    var b = e.target.closest("button");
    if (!b || !fmtTarget) return;
    var sel = window.getSelection();
    if (!sel.rangeCount || sel.isCollapsed) {
      toast("Select some words first, then choose a style.", false);
      return;
    }
    var fmt = b.getAttribute("data-fmt");
    if (fmt === "italic") document.execCommand("italic");
    else if (fmt === "music") toggleMark(sel, "song");
    else if (fmt === "sfx") toggleMark(sel, "sfx");
    else {
      document.execCommand("removeFormat");
      unwrapMarks(sel);
    }
    fmtTarget.dispatchEvent(new Event("input", { bubbles: true }));
  });
  function closestMark(node, root) {
    while (node && node !== root) {
      if (node.nodeType === 1 && node.tagName === "MARK") return node;
      node = node.parentNode;
    }
    return null;
  }
  function unwrap(m) {
    while (m.firstChild) m.parentNode.insertBefore(m.firstChild, m);
    m.remove();
  }
  function unwrapMarks(sel) {
    var range = sel.getRangeAt(0);
    var root = fmtTarget;
    $all("mark", root).forEach(function (m) {
      if (range.intersectsNode(m)) unwrap(m);
    });
  }
  // kind is "song" or "sfx". Pressing the same style again removes it;
  // pressing the other one switches the marked words over.
  function toggleMark(sel, kind) {
    var range = sel.getRangeAt(0);
    var root = fmtTarget;
    var m = closestMark(range.commonAncestorContainer, root);
    if (m) {
      var isSfx = m.classList.contains("sfx");
      if (isSfx === (kind === "sfx")) unwrap(m);
      else m.className = kind === "sfx" ? "sfx" : "";
      return;
    }
    var frag = range.extractContents();
    $all("mark", frag).forEach(unwrap);
    var mark = document.createElement("mark");
    if (kind === "sfx") mark.className = "sfx";
    mark.appendChild(frag);
    range.insertNode(mark);
    sel.removeAllRanges();
    var r2 = document.createRange();
    r2.selectNodeContents(mark);
    sel.addRange(r2);
  }

  // ------------------------------------------------------------------
  // drag and drop
  // ------------------------------------------------------------------
  // Pointer events cover mouse, pen and touch with one code path. Only the
  // dotted handle starts a drag (it has touch-action: none), so the rest of
  // a card still scrolls normally on a phone.
  var drag = null;
  app.addEventListener("pointerdown", function (e) {
    var handle = e.target.closest(".handle");
    if (!handle || e.button > 0) return;
    var isScene = handle.classList.contains("scene-handle");
    var itemEl = handle.closest(isScene ? ".scene-index-item" : ".card");
    if (!itemEl) return;
    e.preventDefault();
    startDrag(e, handle, itemEl, isScene);
  });

  function startDrag(e, handle, itemEl, isScene) {
    var rect = itemEl.getBoundingClientRect();
    var ghost = itemEl.cloneNode(true);
    ghost.classList.add("drag-ghost");
    ghost.style.width = rect.width + "px";
    ghost.style.left = rect.left + "px";
    ghost.style.top = rect.top + "px";
    ghost.removeAttribute("id");
    document.body.appendChild(ghost);
    var ph = document.createElement(isScene ? "li" : "div");
    ph.className = "drop-placeholder";
    ph.style.height = rect.height + "px";
    itemEl.parentNode.insertBefore(ph, itemEl);
    itemEl.classList.add("is-dragging");
    itemEl.style.display = "none";
    drag = {
      el: itemEl,
      ghost: ghost,
      ph: ph,
      isScene: isScene,
      dy: e.clientY - rect.top,
      y: e.clientY,
      pointerId: e.pointerId,
      handle: handle,
      raf: 0,
    };
    try {
      handle.setPointerCapture(e.pointerId);
    } catch (err) {
      /* capture is a nicety */
    }
    document.body.style.userSelect = "none";
    autoScroll();
  }
  document.addEventListener("pointermove", function (e) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    drag.y = e.clientY;
    drag.ghost.style.top = e.clientY - drag.dy + "px";
    placePlaceholder(e.clientY);
  });
  function containersForDrag() {
    return drag.isScene ? [$("#sceneIndex")] : $all(".items", app);
  }
  function placePlaceholder(y) {
    var boxes = containersForDrag();
    // the container under the pointer, or the nearest one vertically
    var best = null;
    var bestD = Infinity;
    boxes.forEach(function (b) {
      var r = b.getBoundingClientRect();
      var d = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0;
      if (d < bestD) {
        bestD = d;
        best = b;
      }
    });
    if (!best) return;
    var kids = Array.prototype.filter.call(best.children, function (k) {
      return k !== drag.el && k !== drag.ph;
    });
    var before = null;
    for (var i = 0; i < kids.length; i++) {
      var r = kids[i].getBoundingClientRect();
      if (y < r.top + r.height / 2) {
        before = kids[i];
        break;
      }
    }
    if (before) {
      if (drag.ph.nextSibling !== before || drag.ph.parentNode !== best)
        best.insertBefore(drag.ph, before);
    } else if (best.lastChild !== drag.ph) {
      best.appendChild(drag.ph);
    }
  }
  function autoScroll() {
    if (!drag) return;
    var edge = 90;
    var top = drag.isScene ? 0 : 70;
    var v = 0;
    if (drag.y < top + edge) v = -Math.ceil((top + edge - drag.y) / 6);
    else if (drag.y > window.innerHeight - edge)
      v = Math.ceil((drag.y - (window.innerHeight - edge)) / 6);
    if (v) {
      window.scrollBy(0, v);
      placePlaceholder(drag.y);
    }
    drag.raf = requestAnimationFrame(autoScroll);
  }
  function endDrag(cancel) {
    if (!drag) return;
    var d = drag;
    drag = null;
    cancelAnimationFrame(d.raf);
    document.body.style.userSelect = "";
    d.ghost.remove();
    var box = d.ph.parentNode;
    var index = Array.prototype.filter
      .call(box.children, function (k) {
        return k !== d.el;
      })
      .indexOf(d.ph);
    d.ph.remove();
    d.el.style.display = "";
    d.el.classList.remove("is-dragging");
    if (cancel) return;
    if (d.isScene) {
      var sid = d.el.getAttribute("data-scene-id");
      change("Moved scene", function (sh) {
        var from = sh.scenes.indexOf(byId(sh.scenes, sid));
        var sc = sh.scenes.splice(from, 1)[0];
        sh.scenes.splice(index, 0, sc);
      });
    } else {
      var itemId = d.el.getAttribute("data-id");
      var toScene = box.getAttribute("data-scene-id");
      moveItem(itemId, toScene, index, "drag");
    }
  }
  document.addEventListener("pointerup", function (e) {
    if (drag && e.pointerId === drag.pointerId) endDrag(false);
  });
  document.addEventListener("pointercancel", function (e) {
    if (drag && e.pointerId === drag.pointerId) endDrag(true);
  });
  document.addEventListener("keydown", function (e) {
    if (drag && e.key === "Escape") endDrag(true);
  });

  function moveItem(itemId, toSceneId, toIndex, how) {
    var f = findItem(itemId);
    if (!f) return;
    var kind = KIND_LABEL[f.item.type].toLowerCase();
    change("Moved " + kind, function (sh) {
      var from = findItem(itemId);
      var it = from.scene.items.splice(from.index, 1)[0];
      var target = byId(sh.scenes, toSceneId);
      target.items.splice(Math.min(toIndex, target.items.length), 0, it);
    });
    flash(itemId);
  }
  function flash(itemId) {
    var c = app.querySelector('.card[data-id="' + itemId + '"]');
    if (!c) return;
    c.classList.remove("flash");
    void c.offsetWidth;
    c.classList.add("flash");
  }

  // keyboard moving: arrow keys on a focused handle
  app.addEventListener("keydown", function (e) {
    var h = e.target.closest && e.target.closest(".handle");
    if (!h || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
    e.preventDefault();
    var dir = e.key === "ArrowUp" ? -1 : 1;
    if (h.classList.contains("scene-handle")) {
      var sid = h.closest(".scene-index-item").getAttribute("data-scene-id");
      var i = S.show.scenes.indexOf(byId(S.show.scenes, sid));
      var j = i + dir;
      if (j < 0 || j >= S.show.scenes.length) return;
      change("Moved scene", function (sh) {
        var sc = sh.scenes.splice(i, 1)[0];
        sh.scenes.splice(j, 0, sc);
      });
    } else {
      stepItem(h.closest(".card").getAttribute("data-id"), dir);
    }
  });
  // one step up or down; at a scene edge it crosses into the next scene
  function stepItem(itemId, dir) {
    var f = findItem(itemId);
    var scenes = S.show.scenes;
    if (dir < 0) {
      if (f.index > 0) moveItem(itemId, f.scene.id, f.index - 1);
      else if (f.sceneIndex > 0) {
        var prev = scenes[f.sceneIndex - 1];
        moveItem(itemId, prev.id, prev.items.length);
      }
    } else {
      if (f.index < f.scene.items.length - 1)
        moveItem(itemId, f.scene.id, f.index + 1);
      else if (f.sceneIndex < scenes.length - 1)
        moveItem(itemId, scenes[f.sceneIndex + 1].id, 0);
    }
  }

  // ------------------------------------------------------------------
  // clicks
  // ------------------------------------------------------------------
  app.addEventListener("click", function (e) {
    var b = e.target.closest("[data-act]");
    if (b && app.contains(b)) onAction(b.getAttribute("data-act"), b, e);
    if (e.target.id === "hintClose") {
      writeJson(HINT_KEY, true);
      $("#hint").remove();
    }
  });
  app.addEventListener("change", function (e) {
    var t = e.target;
    var f = t.getAttribute("data-field");
    if (f === "character") {
      var itemId = t.getAttribute("data-item");
      if (t.value === "__new") {
        newCharacterFlow().then(function (cid) {
          if (cid)
            change("Changed speaker", function () {
              findItem(itemId).item.characterId = cid;
            });
          else render();
        });
        return;
      }
      change("Changed speaker", function () {
        findItem(itemId).item.characterId = t.value;
      });
    } else if (f === "track") {
      var id = t.getAttribute("data-item");
      var it = findItem(id).item;
      if (t.value === "__new") {
        uploadFlow(it.type).then(function (trackId) {
          if (trackId)
            change("Chose " + KIND_LABEL[it.type].toLowerCase(), function () {
              var x = findItem(id).item;
              x[x.type === "song" ? "songId" : "sfxId"] = trackId;
            });
          else render();
        });
        return;
      }
      change("Chose " + KIND_LABEL[it.type].toLowerCase(), function () {
        it[it.type === "song" ? "songId" : "sfxId"] = t.value;
      });
    } else if (f === "char-actor") {
      var cid = t.getAttribute("data-char");
      change("Recast character", function (sh) {
        byId(sh.characters, cid).actorId = t.value || null;
      });
    }
  });
  $("#app").addEventListener("change", function (e) {
    if (e.target.id === "sceneJump") {
      var blk = document.getElementById("blk-" + e.target.value);
      if (blk) blk.scrollIntoView({ behavior: scrollBehaviour(), block: "start" });
    }
  });

  function newItem(kind) {
    var it = { id: uid("i"), type: kind };
    if (kind === "line") {
      it.characterId = "";
      it.note = "";
      it.text = "";
    } else if (kind === "direction") {
      it.label = "";
      it.text = "";
    } else if (kind === "song") {
      it.songId = S.show.songs.length ? S.show.songs[0].id : "";
      it.note = "";
    } else {
      it.sfxId = S.show.sfx.length ? S.show.sfx[0].id : "";
      it.note = "";
    }
    return it;
  }
  function insertItem(kind, sceneId, index) {
    var it = newItem(kind);
    change("Added " + KIND_LABEL[kind].toLowerCase(), function (sh) {
      var sc = byId(sh.scenes, sceneId);
      sc.items.splice(index == null ? sc.items.length : index, 0, it);
    });
    // put the user straight into the new thing
    var card = app.querySelector('.card[data-id="' + it.id + '"]');
    if (card) {
      card.scrollIntoView({ block: "center" });
      flash(it.id);
      var target =
        kind === "line"
          ? card.querySelector("select")
          : kind === "direction"
            ? card.querySelector(".rich")
            : card.querySelector("select") || card.querySelector(".link-btn");
      if (target) target.focus();
    }
  }

  function onAction(act, b) {
    var itemId = b.getAttribute("data-item");
    var sceneId = b.getAttribute("data-scene");
    var f;
    switch (act) {
      case "add":
        insertItem(b.getAttribute("data-kind"), sceneId, null);
        break;
      case "insert":
        f = findItem(itemId);
        showMenu(b, [
          {
            label: "Line",
            dot: "var(--ink)",
            onClick: function () {
              insertItem("line", f.scene.id, f.index);
            },
          },
          {
            label: "Stage direction",
            dot: "var(--muted)",
            onClick: function () {
              insertItem("direction", f.scene.id, f.index);
            },
          },
          {
            label: "Song",
            dot: "var(--teal)",
            onClick: function () {
              insertItem("song", f.scene.id, f.index);
            },
          },
          {
            label: "Sound effect",
            dot: "var(--magenta)",
            onClick: function () {
              insertItem("sfx", f.scene.id, f.index);
            },
          },
        ]);
        break;
      case "delete":
        deleteItem(itemId);
        break;
      case "optional":
        change("Changed optional mark", function () {
          var it = findItem(itemId).item;
          if (it.optional) delete it.optional;
          else it.optional = true;
        });
        break;
      case "item-menu":
        itemMenu(b, itemId);
        break;
      case "toggle-details":
        S.detailsOpen[sceneId] = !S.detailsOpen[sceneId];
        render();
        break;
      case "scene-menu":
        sceneMenu(b, sceneId);
        break;
      case "add-scene":
        addScene();
        break;
      case "play":
        playFile(b.getAttribute("data-file"), b);
        break;
      case "upload":
        uploadFlow(b.getAttribute("data-kind"));
        break;
      case "upload-for":
        f = findItem(itemId);
        uploadFlow(f.item.type).then(function (tid) {
          if (tid)
            change(
              "Chose " + KIND_LABEL[f.item.type].toLowerCase(),
              function () {
                var x = findItem(itemId).item;
                x[x.type === "song" ? "songId" : "sfxId"] = tid;
              },
            );
        });
        break;
      case "replace-file":
        replaceFileFlow(
          b.getAttribute("data-kind"),
          b.getAttribute("data-track"),
        );
        break;
      case "remove-track":
        removeTrack(b.getAttribute("data-kind"), b.getAttribute("data-track"));
        break;
      case "add-actor":
        addActor();
        break;
      case "remove-actor":
        removeActor(b.getAttribute("data-actor"));
        break;
      case "add-character":
        newCharacterFlow();
        break;
      case "remove-character":
        removeCharacter(b.getAttribute("data-char"));
        break;
    }
  }

  function describe(it) {
    if (it.type === "line") {
      var c = byId(S.show.characters, it.characterId);
      return c ? c.name + "’s line" : "Line";
    }
    return KIND_LABEL[it.type];
  }
  // For screen readers: which card a control belongs to, e.g.
  // "Raj’s line, “Shukriya Shethji. Kal se…”".
  function cardName(it) {
    var words = "";
    if (it.type === "song" || it.type === "sfx") {
      var t = byId(it.type === "song" ? S.show.songs : S.show.sfx, it.type === "song" ? it.songId : it.sfxId);
      words = t ? t.title : "";
    } else {
      words = plainOf(it.text).split(" ").slice(0, 5).join(" ");
    }
    return describe(it) + (words ? ", “" + words + "…”" : "");
  }
  function deleteItem(itemId) {
    var f = findItem(itemId);
    if (!f) return;
    var what = describe(f.item);
    change(
      "Deleted " + (f.item.type === "line" ? what : what.toLowerCase()),
      function () {
        var g = findItem(itemId);
        g.scene.items.splice(g.index, 1);
      },
      // same words as the undo label, so the toast and "Undone: …" agree
      { toast: "Deleted " + (f.item.type === "line" ? what : what.toLowerCase()) + "." },
    );
  }

  function itemMenu(anchor, itemId) {
    var f = findItem(itemId);
    var entries = [
      {
        label: "Move up",
        onClick: function () {
          stepItem(itemId, -1);
        },
      },
      {
        label: "Move down",
        onClick: function () {
          stepItem(itemId, 1);
        },
      },
      {
        label: "Move to another scene…",
        onClick: function () {
          moveToSceneFlow(itemId);
        },
      },
      "-",
      {
        label: "Duplicate",
        onClick: function () {
          var copy = clone(f.item);
          copy.id = uid("i");
          change(
            "Duplicated " + KIND_LABEL[f.item.type].toLowerCase(),
            function () {
              var g = findItem(itemId);
              g.scene.items.splice(g.index + 1, 0, copy);
            },
          );
          flash(copy.id);
        },
      },
    ];
    if (f.item.type === "line" || f.item.type === "direction") {
      entries.push({
        label:
          f.item.type === "line"
            ? "Turn into a stage direction"
            : "Turn into a spoken line",
        onClick: function () {
          change("Changed type", function () {
            var it = findItem(itemId).item;
            if (it.type === "line") {
              it.type = "direction";
              it.label = "";
              delete it.characterId;
              delete it.note;
            } else {
              it.type = "line";
              it.characterId = "";
              it.note = it.label || "";
              delete it.label;
            }
          });
        },
      });
    }
    entries.push("-", {
      label: "Delete",
      danger: true,
      onClick: function () {
        deleteItem(itemId);
      },
    });
    showMenu(anchor, entries);
  }

  function moveToSceneFlow(itemId) {
    var f = findItem(itemId);
    var body = el(
      '<label class="field"><span class="field-label">Scene</span><select class="select" id="mvScene">' +
        S.show.scenes
          .map(function (sc, i) {
            return (
              '<option value="' +
              esc(sc.id) +
              '"' +
              (sc.id === f.scene.id ? " selected" : "") +
              ">" +
              two(i + 1) +
              " " +
              esc(sc.title) +
              "</option>"
            );
          })
          .join("") +
        '</select></label><label class="field"><span class="field-label">Where in that scene</span><select class="select" id="mvWhere"><option value="end">At the end</option><option value="start">At the start</option></select></label>',
    );
    ask({
      title: "Move to another scene",
      body: body,
      buttons: [
        { label: "Cancel", value: null },
        { label: "Move", value: "ok", primary: true },
      ],
    }).then(function (v) {
      if (v !== "ok") return;
      var sid = $("#mvScene", body).value;
      var sc = byId(S.show.scenes, sid);
      moveItem(
        itemId,
        sid,
        $("#mvWhere", body).value === "start" ? 0 : sc.items.length + 1,
      );
      var c = app.querySelector('.card[data-id="' + itemId + '"]');
      if (c) c.scrollIntoView({ block: "center" });
    });
  }

  function sceneMenu(anchor, sceneId) {
    var i = S.show.scenes.indexOf(byId(S.show.scenes, sceneId));
    var entries = [];
    if (i > 0)
      entries.push({
        label: "Move scene earlier",
        onClick: function () {
          change("Moved scene", function (sh) {
            var sc = sh.scenes.splice(i, 1)[0];
            sh.scenes.splice(i - 1, 0, sc);
          });
        },
      });
    if (i < S.show.scenes.length - 1)
      entries.push({
        label: "Move scene later",
        onClick: function () {
          change("Moved scene", function (sh) {
            var sc = sh.scenes.splice(i, 1)[0];
            sh.scenes.splice(i + 1, 0, sc);
          });
        },
      });
    entries.push({
      label: "Add a new scene after this one",
      onClick: function () {
        addScene(i + 1);
      },
    });
    entries.push("-", {
      label: "Delete scene",
      danger: true,
      onClick: function () {
        var sc = S.show.scenes[i];
        var n = sc.items.length;
        var go = function () {
          change(
            "Deleted scene",
            function (sh) {
              sh.scenes.splice(i, 1);
            },
            { toast: "Scene “" + (sc.title || "Untitled") + "” deleted." },
          );
        };
        if (!n) return go();
        ask({
          title: "Delete “" + (sc.title || "Untitled scene") + "”?",
          body:
            "<p>This removes the scene and everything in it (" +
            esc(plural(n, "item")) +
            "). You can undo this afterwards.</p>",
          buttons: [
            { label: "Cancel", value: null },
            { label: "Delete scene", value: "ok", danger: true, primary: true },
          ],
        }).then(function (v) {
          if (v === "ok") go();
        });
      },
    });
    showMenu(anchor, entries);
  }

  function addScene(at) {
    var sc = {
      id: uid("scene"),
      title: "New scene",
      location: "",
      props: "",
      notes: "",
      items: [],
    };
    change("Added scene", function (sh) {
      sh.scenes.splice(at == null ? sh.scenes.length : at, 0, sc);
    });
    var t = app.querySelector('[data-key="st-' + sc.id + '"]');
    if (t) {
      t.scrollIntoView({ block: "center" });
      t.focus();
      t.select();
    }
  }

  // ----- cast flows -----
  function addActor() {
    var a = { id: uid("actor"), name: "New actor" };
    change("Added actor", function (sh) {
      sh.actors.push(a);
    });
    var t = app.querySelector('[data-key="an-' + a.id + '"]');
    if (t) {
      t.focus();
      t.select();
    }
  }
  function removeActor(actorId) {
    var sh = S.show;
    var a = byId(sh.actors, actorId);
    var plays = sh.characters.filter(function (c) {
      return c.actorId === actorId;
    });
    var go = function (replacement) {
      change(
        "Removed actor",
        function (s) {
          s.characters.forEach(function (c) {
            if (c.actorId === actorId) c.actorId = replacement || null;
          });
          s.actors.splice(s.actors.indexOf(byId(s.actors, actorId)), 1);
        },
        { toast: a.name + " removed." },
      );
    };
    if (!plays.length) return go(null);
    var body = el(
      "<p>" +
        esc(a.name) +
        " plays " +
        plays
          .map(function (c) {
            return "<strong>" + esc(c.name) + "</strong>";
          })
          .join(", ") +
        ". Who should play " +
        (plays.length === 1 ? "this character" : "them") +
        ' instead?</p><label class="field"><span class="field-label">New actor</span><select class="select" id="rmActorTo"><option value="">Not cast yet</option>' +
        sh.actors
          .filter(function (x) {
            return x.id !== actorId;
          })
          .map(function (x) {
            return (
              '<option value="' + esc(x.id) + '">' + esc(x.name) + "</option>"
            );
          })
          .join("") +
        "</select></label>",
    );
    ask({
      title: "Remove " + a.name + "?",
      body: body,
      buttons: [
        { label: "Cancel", value: null },
        { label: "Remove " + a.name, value: "ok", danger: true, primary: true },
      ],
    }).then(function (v) {
      if (v === "ok") go($("#rmActorTo", body).value);
    });
  }
  // Resolves with the new character's id, or null if cancelled.
  function newCharacterFlow() {
    var sh = S.show;
    var body = el(
      '<label class="field"><span class="field-label">Name, as it appears beside each line</span><input class="text-input" id="ncName" placeholder="e.g. Dadi" /></label>' +
        '<label class="field"><span class="field-label">Role (optional)</span><input class="text-input" id="ncRole" placeholder="e.g. Grandmother" /></label>' +
        '<label class="field"><span class="field-label">Played by</span><select class="select" id="ncActor">' +
        actorOptions(null) +
        '</select></label><p class="field-error" id="ncErr" hidden>Please give the character a name.</p>',
    );
    return ask({
      title: "New character",
      body: body,
      buttons: [
        { label: "Cancel", value: null },
        {
          label: "Add character",
          value: "ok",
          primary: true,
          validate: function () {
            var ok = !!$("#ncName", body).value.trim();
            $("#ncErr", body).hidden = ok;
            return ok;
          },
        },
      ],
    }).then(function (v) {
      if (v !== "ok") return null;
      var c = {
        id: uid("char"),
        name: $("#ncName", body).value.trim(),
        role: $("#ncRole", body).value.trim(),
        actorId: $("#ncActor", body).value || null,
      };
      change("Added character", function (s) {
        s.characters.push(c);
      });
      return c.id;
    });
  }
  function removeCharacter(charId) {
    var sh = S.show;
    var c = byId(sh.characters, charId);
    var uses = usesOf("character", charId);
    var go = function (to) {
      change(
        "Removed character",
        function (s) {
          if (to === "__delete") {
            s.scenes.forEach(function (sc) {
              sc.items = sc.items.filter(function (it) {
                return !(it.type === "line" && it.characterId === charId);
              });
            });
          } else {
            s.scenes.forEach(function (sc) {
              sc.items.forEach(function (it) {
                if (it.type === "line" && it.characterId === charId)
                  it.characterId = to;
              });
            });
          }
          renameInCast(s, c.name, "");
          s.characters.splice(
            s.characters.indexOf(byId(s.characters, charId)),
            1,
          );
        },
        { toast: c.name + " removed." },
      );
    };
    if (!uses.length) return go("");
    var others = sh.characters.filter(function (x) {
      return x.id !== charId;
    });
    var body = el(
      "<p><strong>" +
        esc(c.name) +
        "</strong> speaks " +
        esc(plural(uses.length, "line")) +
        " (" +
        esc(sceneList(uses)) +
        '). What should happen to them?</p><label class="field"><span class="field-label">Their lines</span><select class="select" id="rcTo">' +
        others
          .map(function (x) {
            return (
              '<option value="' +
              esc(x.id) +
              '">Give them to ' +
              esc(x.name) +
              "</option>"
            );
          })
          .join("") +
        '<option value="__delete">Delete those lines</option></select></label>',
    );
    ask({
      title: "Remove " + c.name + "?",
      body: body,
      buttons: [
        { label: "Cancel", value: null },
        { label: "Remove " + c.name, value: "ok", danger: true, primary: true },
      ],
    }).then(function (v) {
      if (v === "ok") go($("#rcTo", body).value);
    });
  }

  // ----- sound flows -----
  function removeTrack(kind, trackId) {
    var list = kind === "song" ? S.show.songs : S.show.sfx;
    var t = byId(list, trackId);
    var uses = usesOf(kind, trackId);
    var go = function () {
      change(
        "Removed " + (kind === "song" ? "song" : "sound effect"),
        function (s) {
          var l = kind === "song" ? s.songs : s.sfx;
          l.splice(l.indexOf(byId(l, trackId)), 1);
          s.scenes.forEach(function (sc) {
            sc.items = sc.items.filter(function (it) {
              return !(
                it.type === kind &&
                (kind === "song" ? it.songId : it.sfxId) === trackId
              );
            });
          });
        },
        { toast: "“" + t.title + "” removed." },
      );
    };
    if (!uses.length) return go();
    ask({
      title: "Remove “" + t.title + "”?",
      body:
        "<p>It is placed in the script " +
        esc(plural(uses.length, "time")) +
        " (" +
        esc(sceneList(uses)) +
        "). Removing it also takes " +
        (uses.length === 1 ? "that cue" : "those cues") +
        " out of the script. You can undo this afterwards.</p>",
      buttons: [
        { label: "Cancel", value: null },
        {
          label: "Remove “" + t.title + "”",
          value: "ok",
          danger: true,
          primary: true,
        },
      ],
    }).then(function (v) {
      if (v === "ok") go();
    });
  }

  // ------------------------------------------------------------------
  // audio preview
  // ------------------------------------------------------------------
  var player = null;
  var playingBtn = null;
  function playFile(file, btn) {
    if (player && playingBtn === btn) {
      stopPlaying();
      return;
    }
    stopPlaying();
    player = new Audio();
    playingBtn = btn;
    btn.classList.add("is-playing");
    btn.innerHTML = ICONS.stop;
    var triedRaw = false;
    player.addEventListener("ended", stopPlaying);
    player.addEventListener("error", function () {
      // Just uploaded: GitHub Pages may not have it yet. Try the copy in
      // the repository before giving up.
      var st = settings();
      if (!triedRaw && st.repo) {
        triedRaw = true;
        player.src = rawUrl(file);
        player.play().catch(function () {});
        return;
      }
      stopPlaying();
      toast(
        "That file could not be played here. It may still be uploading.",
        false,
        true,
      );
    });
    player.src = encodeURI(file);
    player.play().catch(function () {});
  }
  function stopPlaying() {
    if (player) {
      player.pause();
      player = null;
    }
    if (playingBtn) {
      playingBtn.classList.remove("is-playing");
      playingBtn.innerHTML = ICONS.play;
      playingBtn = null;
    }
  }

  // ------------------------------------------------------------------
  // GitHub
  // ------------------------------------------------------------------
  function settings() {
    return readJson(SETTINGS_KEY) || { repo: "", branch: "main", token: "" };
  }
  function connected() {
    var s = settings();
    return !!(s.repo && s.token);
  }
  function encodePath(p) {
    return p.split("/").map(encodeURIComponent).join("/");
  }
  function rawUrl(path) {
    var s = settings();
    return (
      "https://raw.githubusercontent.com/" +
      s.repo +
      "/" +
      encodeURIComponent(s.branch || "main") +
      "/" +
      encodePath(path)
    );
  }
  function gh(method, path, body) {
    var s = settings();
    return fetch("https://api.github.com/repos/" + s.repo + path, {
      method: method,
      cache: "no-store",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: "Bearer " + s.token,
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    }).then(function (res) {
      return res.text().then(function (txt) {
        var data = null;
        try {
          data = txt ? JSON.parse(txt) : null;
        } catch (e) {
          data = null;
        }
        if (!res.ok) {
          var err = new Error((data && data.message) || "HTTP " + res.status);
          err.status = res.status;
          throw err;
        }
        return data;
      });
    });
  }
  function explain(err) {
    if (!err) return "Something went wrong.";
    if (err.status === 401)
      return "GitHub did not accept the access key. Check it in Settings.";
    if (err.status === 403)
      return "The access key is not allowed to change this repository. It needs Contents: Read and write.";
    if (err.status === 404)
      return "Repository or file not found. Check the repository name and branch in Settings.";
    if (err.status === 409 || err.status === 422)
      return "Someone else published at the same moment. Try Publish again.";
    if (err instanceof TypeError)
      return "No connection to GitHub. Check your internet connection.";
    return err.message || "Something went wrong.";
  }
  function b64FromText(str) {
    var bytes = new TextEncoder().encode(str);
    return b64FromBytes(bytes);
  }
  function b64FromBytes(bytes) {
    var bin = "";
    for (var i = 0; i < bytes.length; i += 0x8000) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return btoa(bin);
  }
  function textFromB64(b64) {
    var bin = atob(b64.replace(/\s/g, ""));
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }
  function branchQ() {
    return "?ref=" + encodeURIComponent(settings().branch || "main");
  }
  function fetchPublished() {
    return gh("GET", "/contents/" + encodePath(SHOW_PATH) + branchQ()).then(
      function (d) {
        return { sha: d.sha, show: JSON.parse(textFromB64(d.content)) };
      },
    );
  }
  function serialise(show) {
    return JSON.stringify(show, null, 1) + "\n";
  }

  function publish() {
    if (!connected()) {
      openSettings(
        "Connect to GitHub to publish. You only need to do this once in each browser.",
      );
      return;
    }
    saveDraftNow();
    var btn = $("#publishBtn");
    btn.disabled = true;
    btn.textContent = "Publishing…";
    var done = function () {
      btn.textContent = "Publish";
      syncStatus();
    };
    fetchPublished()
      .then(function (remote) {
        var theirs = JSON.stringify(remote.show);
        var changedUnderUs = S.baseSha
          ? remote.sha !== S.baseSha
          : theirs !== S.baseJson;
        if (changedUnderUs && theirs !== S.baseJson) {
          return ask({
            title: "Someone else published first",
            body:
              "<p>The script was changed and published by someone else after you started editing. Publishing now would replace their changes with yours.</p>" +
              "<p>To keep both, choose <strong>Load their version</strong>, then make your changes again.</p>",
            buttons: [
              { label: "Cancel", value: null },
              { label: "Load their version", value: "theirs" },
              {
                label: "Publish mine anyway",
                value: "mine",
                danger: true,
                primary: true,
              },
            ],
          }).then(function (v) {
            if (v === "theirs") {
              loadPublished(
                remote,
                "Loaded the latest published script. Your draft was replaced; Undo brings it back.",
              );
              return null;
            }
            if (v !== "mine") return null;
            return put(remote.sha);
          });
        }
        return put(remote.sha);
      })
      .then(done, function (err) {
        done();
        toast("Not published. " + explain(err), false, true);
      });
  }
  function put(sha) {
    var json = serialise(S.show);
    return gh("PUT", "/contents/" + encodePath(SHOW_PATH), {
      message: "Script updated in the editor",
      content: b64FromText(json),
      sha: sha,
      branch: settings().branch || "main",
    }).then(function (res) {
      // What was sent is what is now published. Anything typed while the
      // request was in flight stays unpublished.
      S.baseSha = res.content.sha;
      S.baseJson = JSON.stringify(JSON.parse(json));
      saveDraftNow();
      toast(
        "Published. The cast will see it within a couple of minutes (they may need to refresh).",
        false,
      );
    });
  }
  // Replace the working copy with a published version, keeping undo so the
  // previous draft can be got back.
  function loadPublished(remote, msg) {
    var snap = JSON.stringify(S.show);
    S.show = normalise(remote.show);
    S.baseSha = remote.sha;
    S.baseJson = JSON.stringify(S.show);
    if (snap !== S.baseJson) pushUndo(snap, "Loaded published version");
    saveDraftNow();
    render();
    if (msg) toast(msg, false);
  }

  // Upload an MP3 into the repository. Resolves with the new track id.
  var fileInput = document.getElementById("fileInput");
  function pickFile() {
    return new Promise(function (resolve) {
      fileInput.value = "";
      var onChange = function () {
        fileInput.removeEventListener("change", onChange);
        resolve(
          fileInput.files && fileInput.files[0] ? fileInput.files[0] : null,
        );
      };
      fileInput.addEventListener("change", onChange);
      fileInput.click();
    });
  }
  function uploadFile(kind, file) {
    // Stored as .mp3 and served as audio/mpeg, and MP3 is what every phone
    // at rehearsal plays, so nothing else is accepted.
    if (!/\.mp3$/i.test(file.name) && file.type !== "audio/mpeg") {
      return Promise.reject(
        new Error(
          "“" + file.name + "” is not an MP3. Please convert it to MP3 first.",
        ),
      );
    }
    if (file.size > 20 * 1024 * 1024) {
      return Promise.reject(
        new Error(
          "That file is over 20 MB. Please use a shorter or more compressed MP3.",
        ),
      );
    }
    var folder = kind === "song" ? "Audio files/songs/" : "Audio files/sfx/";
    var path =
      folder + slug(file.name) + "-" + Date.now().toString(36) + ".mp3";
    toast("Uploading “" + file.name + "”…", false);
    return file.arrayBuffer().then(function (buf) {
      return gh("PUT", "/contents/" + encodePath(path), {
        message:
          "Add " +
          (kind === "song" ? "song" : "sound effect") +
          ": " +
          file.name,
        content: b64FromBytes(new Uint8Array(buf)),
        branch: settings().branch || "main",
      }).then(function () {
        return path;
      });
    });
  }
  function uploadFlow(kind) {
    if (!connected()) {
      openSettings(
        "Connect to GitHub first, so uploaded files can be stored with the site.",
      );
      return Promise.resolve(null);
    }
    return pickFile().then(function (file) {
      if (!file) return null;
      return uploadFile(kind, file).then(
        function (path) {
          var t = {
            id: uid(kind === "song" ? "song" : "sfx"),
            title: titleFromFile(file.name),
            file: path,
          };
          change(
            "Uploaded " + (kind === "song" ? "song" : "sound effect"),
            function (s) {
              (kind === "song" ? s.songs : s.sfx).push(t);
            },
          );
          toast(
            "Uploaded “" +
              t.title +
              "”. You can rename it in Songs & sound effects.",
            false,
          );
          return t.id;
        },
        function (err) {
          toast("Upload failed. " + explain(err), false, true);
          return null;
        },
      );
    });
  }
  function replaceFileFlow(kind, trackId) {
    if (!connected()) {
      openSettings(
        "Connect to GitHub first, so uploaded files can be stored with the site.",
      );
      return;
    }
    pickFile().then(function (file) {
      if (!file) return;
      uploadFile(kind, file).then(
        function (path) {
          change("Replaced audio file", function (s) {
            byId(kind === "song" ? s.songs : s.sfx, trackId).file = path;
          });
          toast("File replaced. Publish to send it to the cast.", false);
        },
        function (err) {
          toast("Upload failed. " + explain(err), false, true);
        },
      );
    });
  }

  // ------------------------------------------------------------------
  // settings
  // ------------------------------------------------------------------
  function openSettings(reason) {
    var s = settings();
    var body = el(
      (reason ? "<p><strong>" + esc(reason) + "</strong></p>" : "") +
        '<label class="field"><span class="field-label">Repository (owner/name)</span><input class="text-input" id="setRepo" placeholder="e.g. yourname/mein_hu_hero" value="' +
        esc(s.repo) +
        '" autocomplete="off" spellcheck="false" /></label>' +
        '<label class="field"><span class="field-label">Branch</span><input class="text-input" id="setBranch" value="' +
        esc(s.branch || "main") +
        '" autocomplete="off" spellcheck="false" /></label>' +
        '<label class="field"><span class="field-label">Access key (GitHub token)</span><input class="text-input" id="setToken" type="password" value="' +
        esc(s.token) +
        '" autocomplete="off" spellcheck="false" placeholder="github_pat_…" /></label>' +
        '<p class="meta">Ask the site owner for the access key. It is kept only in this browser. On a shared computer, press <strong>Forget</strong> when you are done.</p>' +
        '<p class="field-error" id="setErr" hidden></p>',
    );
    var test = function () {
      var repo = $("#setRepo", body)
        .value.trim()
        .replace(/^https?:\/\/github\.com\//, "")
        .replace(/\.git$/, "")
        .replace(/\/$/, "");
      var next = {
        repo: repo,
        branch: $("#setBranch", body).value.trim() || "main",
        token: $("#setToken", body).value.trim(),
      };
      writeJson(SETTINGS_KEY, next);
      return next;
    };
    ask({
      title: "Settings",
      body: body,
      buttons: [
        { label: "Forget", value: "forget", danger: true },
        { label: "Cancel", value: null },
        { label: "Save", value: "save", primary: true },
      ],
    }).then(function (v) {
      if (v === "forget") {
        try {
          localStorage.removeItem(SETTINGS_KEY);
        } catch (e) {
          /* nothing stored */
        }
        toast("Access key removed from this browser.", false);
      } else if (v === "save") {
        test();
        if (!connected()) return;
        gh("GET", "/contents/" + encodePath(SHOW_PATH) + branchQ())
          .then(function (d) {
            toast("Connected to GitHub.", false);
            if (!S.baseSha) {
              var remote = {
                sha: d.sha,
                show: JSON.parse(textFromB64(d.content)),
              };
              if (JSON.stringify(normalise(remote.show)) === S.baseJson)
                S.baseSha = remote.sha;
              saveDraftNow();
            }
          })
          .catch(function (err) {
            toast("Saved, but could not connect. " + explain(err), false, true);
          });
      }
    });
  }

  // ------------------------------------------------------------------
  // top bar
  // ------------------------------------------------------------------
  $all(".tab").forEach(function (t) {
    t.addEventListener("click", function () {
      if (document.activeElement && document.activeElement.blur)
        document.activeElement.blur();
      S.tab = t.getAttribute("data-tab");
      render();
      window.scrollTo(0, 0);
    });
  });
  undoBtn.addEventListener("click", undo);
  redoBtn.addEventListener("click", redo);
  $("#publishBtn").addEventListener("click", function () {
    if (document.activeElement && document.activeElement.blur)
      document.activeElement.blur();
    publish();
  });
  $("#previewBtn").addEventListener("click", function () {
    if (document.activeElement && document.activeElement.blur)
      document.activeElement.blur();
    saveDraftNow();
    window.open("index.html?draft", "mhh-preview");
  });
  $("#menuBtn").addEventListener("click", function (e) {
    var b = e.currentTarget;
    showMenu(b, [
      {
        label: "Preview the site with my changes",
        onClick: function () {
          $("#previewBtn").click();
        },
      },
      {
        label: "Open the live site",
        onClick: function () {
          window.open("index.html", "mhh-live");
        },
      },
      "-",
      {
        label: "Get the latest published version",
        onClick: function () {
          if (!connected())
            return openSettings(
              "Connect to GitHub to fetch the latest version.",
            );
          var go = function () {
            fetchPublished().then(
              function (remote) {
                loadPublished(remote, "Loaded the latest published script.");
              },
              function (err) {
                toast(explain(err), false, true);
              },
            );
          };
          if (!isDirty()) return go();
          ask({
            title: "Replace your draft?",
            body: "<p>You have unpublished changes. Loading the published version replaces them. Undo can bring them back while this tab stays open.</p>",
            buttons: [
              { label: "Cancel", value: null },
              {
                label: "Load published version",
                value: "ok",
                danger: true,
                primary: true,
              },
            ],
          }).then(function (v) {
            if (v === "ok") go();
          });
        },
      },
      {
        label: "Discard my unpublished changes",
        danger: true,
        onClick: function () {
          if (!isDirty())
            return toast("There are no unpublished changes.", false);
          ask({
            title: "Discard your changes?",
            body: "<p>This goes back to the last published script. Undo can bring your changes back while this tab stays open.</p>",
            buttons: [
              { label: "Cancel", value: null },
              { label: "Discard changes", value: "ok", danger: true, primary: true },
            ],
          }).then(function (v) {
            if (v !== "ok") return;
            var snap = JSON.stringify(S.show);
            S.show = JSON.parse(S.baseJson);
            pushUndo(snap, "Discarded changes");
            saveDraftNow();
            render();
            toast("Changes discarded.", true);
          });
        },
      },
      "-",
      {
        label: "Settings (GitHub connection)",
        onClick: function () {
          openSettings();
        },
      },
      {
        label: "Show the how-to tip again",
        onClick: function () {
          try {
            localStorage.removeItem(HINT_KEY);
          } catch (e) {
            /* ignore */
          }
          S.tab = "script";
          render();
          window.scrollTo(0, 0);
        },
      },
    ]);
  });

  document.addEventListener("keydown", function (e) {
    var mod = e.metaKey || e.ctrlKey;
    if (!mod || e.key.toLowerCase() !== "z" || dialog.open) return;
    var t = e.target;
    // inside a text field the browser's own undo handles the typing
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA)$/.test(t.tagName)))
      return;
    e.preventDefault();
    if (e.shiftKey) redo();
    else undo();
  });
  document.addEventListener("keydown", function (e) {
    if (
      (e.metaKey || e.ctrlKey) &&
      e.key.toLowerCase() === "y" &&
      !dialog.open
    ) {
      var t = e.target;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA)$/.test(t.tagName)))
        return;
      e.preventDefault();
      redo();
    }
  });
  window.addEventListener("pagehide", saveDraftNow);

  // The scene being worked on is marked in the sidebar (and chosen in the
  // phone's "Jump to scene" list): the last scene whose heading has
  // scrolled up to just under the top bar.
  var currentTicking = false;
  function markCurrentScene() {
    currentTicking = false;
    if (S.tab !== "script") return;
    var blocks = $all(".scene-block", app);
    if (!blocks.length) return;
    var line = document.querySelector(".topbar").getBoundingClientRect().bottom + 80;
    var cur = blocks[0];
    blocks.forEach(function (b) {
      if (b.getBoundingClientRect().top <= line) cur = b;
    });
    var id = cur.getAttribute("data-scene-id");
    $all(".scene-index-item", app).forEach(function (li) {
      var on = li.getAttribute("data-scene-id") === id;
      li.classList.toggle("is-current", on);
      var a = li.querySelector("a");
      if (on) a.setAttribute("aria-current", "location");
      else a.removeAttribute("aria-current");
    });
    var jump = document.getElementById("sceneJump");
    if (jump && document.activeElement !== jump) jump.value = id;
  }
  window.addEventListener(
    "scroll",
    function () {
      if (!currentTicking) {
        currentTicking = true;
        requestAnimationFrame(markCurrentScene);
      }
    },
    { passive: true },
  );

  // ------------------------------------------------------------------
  // load
  // ------------------------------------------------------------------
  // Fills in anything an older or hand-edited show.json lacks, so the rest
  // of the editor can rely on every list being there.
  function normalise(show) {
    show = show || {};
    show.format = show.format || 1;
    ["actors", "characters", "songs", "sfx", "scenes"].forEach(function (k) {
      if (!Array.isArray(show[k])) show[k] = [];
    });
    show.scenes.forEach(function (sc) {
      if (!sc.id) sc.id = uid("scene");
      if (!Array.isArray(sc.items)) sc.items = [];
      sc.items.forEach(function (it) {
        if (!it.id) it.id = uid("i");
      });
    });
    return show;
  }

  function start(show, sha, draft) {
    var published = normalise(show);
    S.baseJson = JSON.stringify(published);
    S.baseSha = sha;
    S.show = published;
    if (draft && draft.show) {
      S.show = normalise(draft.show);
      if (draft.baseJson && draft.baseJson !== S.baseJson) {
        // the draft was started from an older published version
        S.baseJson = draft.baseJson;
        S.baseSha = draft.baseSha || null;
        if (JSON.stringify(S.show) !== S.baseJson)
          setTimeout(function () {
            toast(
              "Your unpublished draft was restored. The published script has changed since you started it; Publish will ask what to do.",
              false,
            );
          }, 300);
      } else if (JSON.stringify(S.show) !== S.baseJson) {
        setTimeout(function () {
          toast("Your unpublished draft was restored.", false);
        }, 300);
      }
    }
    saveDraftNow();
    render();
  }

  function boot() {
    var draft = readJson(DRAFT_KEY);
    var fromSite = function () {
      return fetch(SHOW_PATH, { cache: "no-cache" }).then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      });
    };
    var p = connected()
      ? fetchPublished().then(
          function (remote) {
            return { show: remote.show, sha: remote.sha };
          },
          function (err) {
            toast(
              "Could not reach GitHub, working from the site’s copy. " +
                explain(err),
              false,
              true,
            );
            return fromSite().then(function (show) {
              return { show: show, sha: null };
            });
          },
        )
      : fromSite().then(function (show) {
          return { show: show, sha: null };
        });
    p.then(
      function (r) {
        start(r.show, r.sha, draft);
      },
      function () {
        if (draft && draft.show) {
          start(
            JSON.parse(draft.baseJson || "{}"),
            draft.baseSha || null,
            draft,
          );
          return;
        }
        app.innerHTML =
          '<p class="loading">The script could not be loaded. Check your connection and reload the page.</p>';
      },
    );
  }

  boot();
})();
