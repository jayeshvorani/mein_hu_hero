// ============================================================
// Mein hu Hero · script export.
//
// Builds the full script from show.json (or the editor's draft with
// "?draft") as print markup, then Paged.js lays it out as A4 pages on
// screen. "Save as PDF" is the browser's own print window, so text stays
// sharp and searchable and the site's fonts are embedded.
//
// The reading rules (rich text, who is on stage, props, set changes)
// mirror the renderer in index.html, so the PDF and the site always agree.
// Keep the two in step when either changes.
// ============================================================
(function () {
  "use strict";

  var DRAFT_KEY = "mhh-editor-draft";
  // the show.json layout this page knows how to read
  var SHOW_FORMAT = 2;

  var bar = document.getElementById("bar");
  var barTitle = document.getElementById("barTitle");
  var barNote = document.getElementById("barNote");
  var saveBtn = document.getElementById("saveBtn");
  var barTip = document.getElementById("barTip");
  var pages = document.getElementById("pages");

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function two(n) {
    return (n < 10 ? "0" : "") + n;
  }

  // Stored text is a tiny HTML subset: <p>, <i> (stage business), <mark>
  // (song words), <mark class="sfx"> (sound-effect words), <br>. Anything
  // else is dropped to its text. Same rules as index.html.
  function rich(src) {
    var tpl = document.createElement("template");
    tpl.innerHTML = src || "";
    var paras = [];
    var cur = null;
    function open() {
      if (!cur) {
        cur = { html: "" };
        paras.push(cur);
      }
    }
    function walk(node, it, mu, top) {
      Array.prototype.forEach.call(node.childNodes, function (n) {
        if (n.nodeType === 3) {
          if (top && !n.nodeValue.trim()) return;
          open();
          var t = esc(n.nodeValue.replace(/\s+/g, " "));
          var cls = [];
          if (mu) cls.push(mu === "sfx" ? "w-sfx" : "w-song");
          if (it) cls.push("w-italic");
          cur.html += cls.length
            ? '<span class="' + cls.join(" ") + '">' + t + "</span>"
            : t;
        } else if (n.nodeType === 1) {
          var tag = n.tagName;
          if (tag === "BR") {
            open();
            cur.html += "<br />";
          } else if (tag === "P" || tag === "DIV") {
            cur = null;
            open();
            walk(n, it, mu, false);
            cur = null;
          } else {
            walk(
              n,
              it || tag === "I" || tag === "EM",
              mu ||
                (tag === "MARK"
                  ? n.classList.contains("sfx")
                    ? "sfx"
                    : "song"
                  : ""),
              false,
            );
          }
        }
      });
    }
    walk(tpl.content, false, "", true);
    return paras
      .filter(function (p) {
        return p.html.replace(/<br \/>/g, "").trim();
      })
      .map(function (p) {
        // Paged.js drops text that is only spaces, so a space between two
        // styled runs would vanish and glue the words. Keep it inside the
        // run before it.
        return "<p>" + p.html.trim().replace(/<\/span>(\s+)<span/g, "$1</span><span") + "</p>";
      })
      .join("");
  }

  function build(show, isDraft) {
    var info = show.show || {};
    var title = (info.title || "").trim();
    var accent = (info.titleAccent || "").trim();
    var full = [title, accent].filter(Boolean).join(" ") || "Script";
    var scenes = show.scenes || [];

    var actors = {};
    var chars = {};
    var songs = {};
    var sfx = {};
    var crew = {};
    var locations = {};
    var props = {};
    function index(list, into) {
      (list || []).forEach(function (x) {
        into[x.id] = x;
      });
    }
    index(show.actors, actors);
    index(show.characters, chars);
    index(show.songs, songs);
    index(show.sfx, sfx);
    index(show.crew, crew);
    index(show.locations, locations);
    index(show.props, props);
    function personName(id) {
      var who = actors[id] || crew[id];
      return who ? who.name : "";
    }
    function sub(note) {
      return note ? ' <span class="sub">' + esc(note) + "</span>" : "";
    }

    var h = "";

    // ---- title page ----
    // the site's introduction may point at things on screen; the PDF can
    // have its own
    var tagline = (info.printTagline || "").trim() || info.tagline || "";
    var ph = info.photo || {};
    // the web picture: a fraction of the size of the fallback in the PDF
    var photo = ph.file || ph.fallback;
    var today = new Date().toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    h +=
      '<section class="cover">' +
      '<span class="running-title">' +
      esc(full) +
      "</span>" +
      '<p class="cover-eyebrow">' +
      esc(info.eyebrow || "") +
      "</p>" +
      '<h1 class="cover-title">' +
      esc(title) +
      (accent ? ' <span class="cover-accent">' + esc(accent) + "</span>" : "") +
      "</h1>" +
      (tagline ? '<p class="cover-tagline">' + esc(tagline) + "</p>" : "") +
      (photo
        ? '<figure class="cover-photo"><img src="' +
          esc(photo) +
          '" alt="' +
          esc(ph.alt || "") +
          '" /></figure>'
        : "") +
      '<div class="cover-foot"><span>Full script</span><span>' +
      scenes.length +
      (scenes.length === 1 ? " scene" : " scenes") +
      "</span><span>" +
      (isDraft ? "Draft, not yet published · " : "") +
      "As of " +
      esc(today) +
      "</span></div>" +
      "</section>";

    // ---- company: cast, crew, key ----
    var castRows = (show.characters || [])
      .map(function (c) {
        var a = actors[c.actorId];
        return (
          '<tr><td class="t-strong">' +
          esc(c.name) +
          "</td><td>" +
          esc(c.role || "") +
          "</td><td>" +
          esc(
            a ? a.name : c.actorId === "everyone" ? "Everyone" : "Not cast yet",
          ) +
          "</td></tr>"
        );
      })
      .join("");
    var crewRows = (show.crew || [])
      .map(function (m) {
        return (
          '<tr><td class="t-strong">' +
          esc(m.name) +
          "</td><td>" +
          esc(m.role || "") +
          "</td></tr>"
        );
      })
      .join("");
    var KEY = {
      optional: '<span class="key-sample key-optional">',
      song: '<span class="key-sample key-song">',
      sfx: '<span class="key-sample key-sfx">',
      direction: '<span class="key-sample key-direction">',
    };
    var keyRows = (show.legend || [])
      .filter(function (row) {
        return KEY[row.style];
      })
      .map(function (row) {
        // the PDF has its own wording where the screen's mentions buttons
        var words = (row.printMeaning || "").trim() || row.meaning || "";
        return (
          "<tr><td>" +
          KEY[row.style] +
          esc(row.sample) +
          "</span></td><td>" +
          esc(words).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>") +
          "</td></tr>"
        );
      })
      .join("");
    h += '<section class="company"><h1 class="part-title running-part">Company</h1>';
    if (castRows)
      h +=
        '<h2 class="table-title">Cast</h2><table class="tbl"><thead><tr><th>Character</th><th>Role</th><th>Played by</th></tr></thead><tbody>' +
        castRows +
        "</tbody></table>";
    if (crewRows)
      h +=
        '<h2 class="table-title">Crew</h2><table class="tbl"><thead><tr><th>Name</th><th>Role</th></tr></thead><tbody>' +
        crewRows +
        "</tbody></table>";
    if (keyRows)
      h +=
        '<h2 class="table-title">How to read this script</h2><table class="tbl tbl-key"><tbody>' +
        keyRows +
        "</tbody></table>";
    h += "</section>";

    // ---- scenes ----
    function castOf(sc) {
      if (sc.onStage === "everyone") return "Whole company";
      var on = {};
      (sc.onStage || []).forEach(function (id) {
        on[id] = true;
      });
      (sc.items || []).forEach(function (it) {
        if (it.type === "line") on[it.characterId] = true;
      });
      return (show.characters || [])
        .filter(function (c) {
          return on[c.id];
        })
        .map(function (c) {
          return esc(c.name);
        })
        .join(", ");
    }
    function locationOf(sc) {
      var l = locations[sc.locationId];
      if (!l && !sc.locationNote) return "";
      return (
        (l ? '<span class="main">' + esc(l.name) + "</span>" : "") +
        sub(sc.locationNote)
      );
    }
    function propsOf(sc) {
      var rows = (sc.props || [])
        .filter(function (x) {
          return props[x.propId];
        })
        .map(function (x) {
          return "<li>" + esc(props[x.propId].name) + sub(x.note) + "</li>";
        });
      return rows.length ? "<ul>" + rows.join("") + "</ul>" : "";
    }
    function setChangesOf(sc) {
      var rows = (sc.setChanges || [])
        .filter(function (x) {
          return (x.text || "").trim();
        })
        .map(function (x) {
          var who = personName(x.assigneeId);
          return (
            "<li>" +
            esc(x.text) +
            (who ? ' <span class="who">' + esc(who) + "</span>" : "") +
            "</li>"
          );
        });
      return rows.length ? "<ol>" + rows.join("") + "</ol>" : "";
    }
    function meta(label, value) {
      return value
        ? '<div class="meta-item"><span class="label">' +
            label +
            '</span><div class="value">' +
            value +
            "</div></div>"
        : "";
    }
    function optionalTag(it) {
      return it.optional ? '<span class="opt-tag">Optional</span>' : "";
    }
    function itemHtml(it) {
      var cut = it.optional ? " is-optional" : "";
      if (it.type === "song" || it.type === "sfx") {
        var isSfx = it.type === "sfx";
        var track = (isSfx ? sfx : songs)[isSfx ? it.sfxId : it.songId];
        var what = isSfx ? "Sound effect" : "Song";
        var body;
        if (track)
          body =
            '<p><span class="cue-title">' + esc(track.title) + "</span></p>";
        else {
          var want = String(it.request || "").trim();
          body =
            '<p class="cue-pending">Coming soon' +
            (want ? ": " + esc(want) : "") +
            "</p>";
        }
        if (it.note) body += '<p class="cue-note">' + esc(it.note) + "</p>";
        return (
          '<div class="row cue ' +
          (isSfx ? "cue-sfx" : "cue-song") +
          (track ? "" : " is-pending") +
          '"><div class="who">' +
          what +
          '</div><div class="text">' +
          body +
          "</div></div>"
        );
      }
      if (it.type === "direction") {
        return (
          '<div class="row direction' +
          (/^setting$/i.test(String(it.label || "").trim()) ? " is-setting" : "") +
          cut +
          '"><div class="who">' +
          esc(it.label || "Stage direction") +
          optionalTag(it) +
          '</div><div class="text">' +
          rich(it.text) +
          "</div></div>"
        );
      }
      var c = chars[it.characterId] || { name: "Unassigned" };
      return (
        '<div class="row line' +
        cut +
        '"><div class="who">' +
        esc(c.name) +
        (it.note
          ? '<span class="who-note">(' + esc(it.note) + ")</span>"
          : "") +
        optionalTag(it) +
        '</div><div class="text">' +
        rich(it.text) +
        "</div></div>"
      );
    }
    scenes.forEach(function (sc, i) {
      // two columns that keep each item in the same place in every scene:
      // who and what on the left, where and what changes on the right
      var left = meta("On stage", castOf(sc)) + meta("Props", propsOf(sc));
      var right =
        meta("Location", locationOf(sc)) + meta("Set changes", setChangesOf(sc));
      var metaHtml =
        left || right
          ? '<div class="meta-col">' +
            left +
            '</div><div class="meta-col">' +
            right +
            "</div>"
          : "";
      h +=
        '<section class="scene"><header class="scene-head"><span class="scene-num"><span>Scene</span> ' +
        two(i + 1) +
        '</span><h1 class="scene-title running-part">' +
        esc(sc.title) +
        "</h1></header>" +
        (metaHtml ? '<div class="meta">' + metaHtml + "</div>" : "") +
        '<div class="dialogue">' +
        (sc.items || []).map(itemHtml).join("") +
        "</div></section>";
    });

    // ---- appendix: crew prop checklist ----
    var propScenes = {};
    scenes.forEach(function (sc, i) {
      (sc.props || []).forEach(function (x) {
        if (!props[x.propId]) return;
        (propScenes[x.propId] = propScenes[x.propId] || []).push(
          "Scene " + (i + 1) + (x.note ? ": " + x.note : ""),
        );
      });
    });
    // in running order: by the first scene that needs each prop
    var firstScene = {};
    scenes.forEach(function (sc, i) {
      (sc.props || []).forEach(function (x) {
        if (props[x.propId] && !(x.propId in firstScene)) firstScene[x.propId] = i;
      });
    });
    var propRows = (show.props || [])
      .filter(function (pr) {
        return propScenes[pr.id];
      })
      .map(function (pr, i) {
        return { pr: pr, i: i };
      })
      .sort(function (a, b) {
        return firstScene[a.pr.id] - firstScene[b.pr.id] || a.i - b.i;
      })
      .map(function (x) {
        var pr = x.pr;
        return (
          '<tr><td class="tick" aria-hidden="true"></td><td><strong>' +
          esc(pr.name) +
          "</strong>" +
          (pr.description
            ? '<span class="sub sub-block">' + esc(pr.description) + "</span>"
            : "") +
          "</td><td>" +
          esc(propScenes[pr.id].join("; ")) +
          "</td></tr>"
        );
      })
      .join("");
    if (propRows)
      h +=
        '<section class="appendix"><h1 class="part-title running-part">Crew checklist</h1><p class="appendix-intro">Every prop the script uses, with the scenes that need it.</p><table class="tbl tbl-check"><thead><tr><th></th><th>Prop</th><th>Needed in</th></tr></thead><tbody>' +
        propRows +
        "</tbody></table></section>";

    return { html: h, title: full };
  }

  function fail(msg) {
    barTitle.textContent = "The script could not be prepared";
    barNote.textContent = msg;
    bar.classList.add("is-error");
    document.getElementById("barText").setAttribute("role", "alert");
  }

  function lay(show, isDraft) {
    var built = build(show, isDraft);
    document.title = "Script · " + built.title + (isDraft ? " (draft)" : "");
    var source = document.createElement("div");
    source.innerHTML = built.html;
    // Pictures must be loaded before the pages are measured, or the title
    // page is laid out with an empty photo box.
    var imgs = Array.prototype.slice.call(source.querySelectorAll("img"));
    var ready = Promise.all(
      imgs.map(function (img) {
        return img.decode ? img.decode().catch(function () {}) : null;
      }),
    ).then(function () {
      return document.fonts && document.fonts.ready;
    });
    return ready.then(function () {
      var previewer = new window.PagedModule.Previewer();
      return previewer
        .preview(source, ["script-print.css"], pages)
        .then(function (flow) {
          var n = flow.total || pages.querySelectorAll(".pagedjs_page").length;
          barTitle.textContent =
            (isDraft ? "Draft script, " : "Script, ") +
            n +
            (n === 1 ? " page" : " pages");
          barNote.textContent = isDraft
            ? "Includes unpublished edits from the editor."
            : "Check it below, then save it.";
          saveBtn.disabled = false;
          barTip.hidden = false;
          fit();
          window.addEventListener("resize", fit);
        });
    });
  }

  // An A4 sheet is about 794px wide. On a phone the preview is shrunk to
  // fit the screen; printing always uses the real size (script.css).
  function fit() {
    var avail = document.documentElement.clientWidth - 32;
    pages.style.zoom = avail < 794 ? String(Math.max(avail, 200) / 794) : "";
  }

  function start(show, isDraft) {
    if ((show.format || 1) > SHOW_FORMAT) {
      fail(
        "This page is out of date. Reload it (Cmd+Shift+R or Ctrl+Shift+R).",
      );
      return;
    }
    if (!window.PagedModule) {
      fail(
        "The page layout tool did not load. Check your connection and reload.",
      );
      return;
    }
    lay(show, isDraft).catch(function (err) {
      if (window.console) console.error(err);
      fail(
        "Something went wrong while laying out the pages. Reload to try again.",
      );
    });
  }

  saveBtn.addEventListener("click", function () {
    window.print();
  });

  if (/[?&]draft\b/.test(location.search)) {
    try {
      var d = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null");
      if (d && d.show && d.show.format >= 2) {
        start(d.show, true);
        return;
      }
    } catch (e) {
      /* no readable draft: fall through to the published script */
    }
  }
  fetch("show.json", { cache: "no-cache" })
    .then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    })
    .then(function (show) {
      start(show, false);
    })
    .catch(function (err) {
      if (window.console) console.error(err);
      fail("Check your connection, then reload the page.");
    });
})();
