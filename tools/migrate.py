"""One-off migration: read the hand-authored scenes out of index.html and write
show.json, the single source of truth the site and the editor now share.

Run from the project folder:
    uv run --with beautifulsoup4 python tools/migrate.py index.backup-<ts>.html

Kept for the record. Once show.json exists the editor is the master and this
script should not be run again: it would overwrite every edit made since.
"""

import json
import re
import sys

from bs4 import BeautifulSoup, NavigableString, Tag

SRC = sys.argv[1] if len(sys.argv) > 1 else "index.html"

ACTORS = ["Madhuri", "Apurva", "Rajesh", "Harsh", "Aparna", "Shailendra",
          "Aneeta", "Maneesh", "Jayant"]

# One consistent name per character, in cast-list order.
CHARACTERS = [
    ("narrator", "Narrator", "Sutradhar", "Madhuri"),
    ("raj", "Raj", "Raj Malhotra, main protagonist", "Apurva"),
    ("dharamchand", "Dharamchand", "Father", "Rajesh"),
    ("sumitradevi", "Sumitradevi", "Mother", "Harsh"),
    ("simran", "Simran", "Girlfriend, later wife", "Aparna"),
    ("deendayal", "Deendayal", "Father-in-law", "Shailendra"),
    ("sharda", "Sharda Devi", "Mother-in-law", "Aneeta"),
    ("ramu", "Ramu Kaka", "Nauker", "Maneesh"),
    ("rocky", "Rocky", "Son", "Jayant"),
    ("receptionist", "Office Receptionist", "", "Aneeta"),
    ("man-office", "Man in office", "", "Maneesh"),
    ("bhairav", "Bhairav Baba", "Snake charmer", "Maneesh"),
    ("everyone", "Everyone", "Wedding scene and finale", "everyone"),
]

# Speaker label as written today -> (character id, per-line note)
LABELS = {
    "Narrator": ("narrator", ""),
    "Raj": ("raj", ""),
    "Raj (Old)": ("raj", "Old"),
    "Father (Dharamchand)": ("dharamchand", ""),
    "Dharamchand": ("dharamchand", ""),
    "Dharmachand": ("dharamchand", ""),
    "Mother (Sumitradevi)": ("sumitradevi", ""),
    "Sumitradevi": ("sumitradevi", ""),
    "SumitraDevi": ("sumitradevi", ""),
    "Deendayal (Simran’s father)": ("deendayal", "Simran’s father"),
    "Deendayal": ("deendayal", ""),
    "Simran": ("simran", ""),
    "Rocky": ("rocky", ""),
    "Rocky (now grown up)": ("rocky", "now grown up"),
    "Ramu": ("ramu", ""),
    "Ramu Kaka": ("ramu", ""),
    "Office Receptionist": ("receptionist", ""),
    "Man in office": ("man-office", ""),
    "Bhairav Baba": ("bhairav", ""),
    "Everyone": ("everyone", ""),
}

ALL_SONGS = [
    "01 - Kabhi Khushi - Sad.mp3", "02 - Kabhi Khushi - Happy.mp3",
    "03 - Are re are re.mp3", "04 - Ta thaiya.mp3", "05 - Le jayegne.mp3",
    "06 - Mein Nagin.mp3", "07 - Jab mein chota baccha.mp3",
    "08 - Ek Dusre se.mp3",
]


def ws(s):
    return re.sub(r"\s+", " ", s)


def esc(s):
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def inline(node, italic=False, music=False):
    """Serialise inline content to the stored subset: <i>, <mark>, <br>."""
    out = []
    for ch in node.children:
        if isinstance(ch, NavigableString):
            t = esc(ws(str(ch)))
            if not t:
                continue
            if music:
                t = "<mark>" + (("<i>" + t + "</i>") if italic else t) + "</mark>"
            elif italic:
                t = "<i>" + t + "</i>"
            out.append(t)
        elif isinstance(ch, Tag):
            cls = ch.get("class") or []
            if ch.name == "button":
                continue
            if ch.name == "br":
                out.append("<br>")
                continue
            out.append(inline(ch, italic or "is-italic" in cls,
                              music or "c-music" in cls))
    s = "".join(out)
    # adjacent runs of the same wrapper merge back into one
    s = s.replace("</i></mark><mark><i>", "").replace("</mark><mark>", "")
    s = s.replace("</i><i>", "")
    return s


def paragraphs(content):
    ps = []
    for p in content.find_all("p", recursive=False):
        s = inline(p).strip()
        s = re.sub(r"^(<br>\s*)+", "", s)  # leading <br> was spacing only
        # drop a wrapper that holds only whitespace
        s = re.sub(r"<mark>\s*</mark>", " ", s)
        s = re.sub(r"<i>\s*</i>", " ", s)
        s = re.sub(r" {2,}", " ", s).strip()
        if s:
            ps.append("<p>" + s + "</p>")
    return "".join(ps)


def main():
    soup = BeautifulSoup(open(SRC, encoding="utf-8").read(), "html.parser")
    songs = []
    by_file = {}
    for i, f in enumerate(ALL_SONGS, 1):
        sid = "song-%02d" % i
        title = re.sub(r"^\d+ - ", "", f[:-4])
        songs.append({"id": sid, "title": title, "file": "Audio files/" + f})
        by_file["Audio files/" + f] = sid

    scenes = []
    n = 0
    for sec in soup.select("section.scene"):
        meta = {"cast": "", "location": "", "props": "", "notes": ""}
        for mi in sec.select(".meta-item"):
            label = mi.select_one(".meta-label").get_text().strip().upper()
            val = ws(mi.select_one(".meta-value").get_text()).strip()
            if label == "CAST":
                meta["cast"] = val
            elif label == "LOCATION":
                meta["location"] = val
            elif label in ("PROPERTY", "PROPS"):
                meta["props"] = val
        notes = [ws(x.get_text()).strip() for x in sec.select(".meta-note")]
        meta["notes"] = " ".join(notes)
        items = []
        for ln in sec.select(".dialogue > .line"):
            n += 1
            cls = ln.get("class") or []
            content = ln.select_one(".content")
            text = paragraphs(content)
            label = ln.select_one(".speaker").get_text().strip()
            optional = "is-cut" in cls
            if "no-speaker" in cls or (not ln.get("data-actor") and label != "Everyone"):
                item = {"id": "i%d" % n, "type": "direction", "label": label,
                        "text": text}
            else:
                cid, note = LABELS[label]
                item = {"id": "i%d" % n, "type": "line", "characterId": cid,
                        "note": note, "text": text}
            if optional:
                item["optional"] = True
            items.append(item)
            for k, b in enumerate(content.select("button.cue-play")):
                items.append({"id": "i%d-s%d" % (n, k + 1), "type": "song",
                              "songId": by_file[b["data-audio"]], "note": ""})
                # the cue name on the button is the better title
                for s in songs:
                    if s["id"] == by_file[b["data-audio"]]:
                        s["title"] = b.get("data-cue") or s["title"]
        scenes.append({"id": "scene-%s" % sec["data-scene"],
                       "title": sec.h2.get_text().strip(), **meta,
                       "items": items})

    show = {
        "format": 1,
        "actors": [{"id": a, "name": a} for a in ACTORS],
        "characters": [{"id": c, "name": nm, "role": r, "actorId": a}
                       for c, nm, r, a in CHARACTERS],
        "songs": songs,
        "sfx": [],
        "scenes": scenes,
    }
    with open("show.json", "w", encoding="utf-8") as f:
        json.dump(show, f, ensure_ascii=False, indent=1)
        f.write("\n")
    print("scenes", len(scenes), "source lines", n,
          "items", sum(len(s["items"]) for s in scenes))


main()
