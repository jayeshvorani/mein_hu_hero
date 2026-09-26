"""One-off migration: show.json format 1 to format 2.

Format 2 makes every piece of show content an entity:
  - show:      title, tagline, photo, picker prompt, footer (was in index.html)
  - legend:    the "How this script is marked up" rows (was in index.html)
  - crew:      people who are not actors (new, starts empty)
  - locations: shared places; each scene picks one plus its own note
  - props:     shared props; each scene ticks the ones it needs, with notes
  - per scene: onStage (character ids), locationId, locationNote,
               props [{propId, note}], setChanges [{id, text, assigneeId}]

The scene details used to be free text. They are split here by hand,
keeping the original wording, so the result can be checked line by line
against the old text. Run once, from the project folder:

    python3 tools/migrate_v2.py

Kept for the record. Do not run it again once the editor has been used on
format 2: it would overwrite those edits.
"""

import json

SRC = "show.json"

LOCATIONS = [
    ("home", "Drawing room at home", ""),
    ("office", "Office space", ""),
    ("park", "Park", ""),
    ("wedding", "Wedding reception", ""),
]

PROPS = [
    ("five-chairs", "Five chairs"),
    ("sheet", "Light colored sheet"),
    ("dadaji-photo", "Dadaji’s photo"),
    ("degree", "Degree"),
    ("napkin", "Napkin"),
    ("aarati-thali", "Aarati thali"),
    ("food-plate", "Food plate"),
    ("office-table", "Office table"),
    ("vase", "Vase with flowers"),
    ("roses", "Roses"),
    ("red-covers", "Red cover for chairs"),
    ("petals", "Petals"),
    ("scarves", "Scarves"),
    ("briefcase", "Briefcase"),
    ("tie", "Tie"),
    ("pungi", "Pungi"),
    ("saffron-shawl", "Saffron shawl"),
    ("result-sheet", "Result sheet"),
    ("cap-jacket", "Cap/jacket"),
    ("small-lamp", "Small lamp"),
    ("walking-stick", "Walking stick"),
]

# scene id -> (onStage, locationId, locationNote, [(propId, note)], [set-change text])
SCENES = {
    "scene-1": (
        ["dharamchand", "sumitradevi", "ramu", "raj"],
        "home",
        "",
        [
            ("five-chairs", ""),
            ("sheet", "neutral sheet to cover three chairs"),
            ("dadaji-photo", ""),
            ("degree", "Rolled paper can be tied with a ribbon"),
            ("napkin", "for Ramu kaka"),
            ("aarati-thali", ""),
            ("food-plate", "(tbd) with a bowl for gajar halwaa"),
        ],
        [],
    ),
    "scene-2": (
        ["receptionist", "raj", "man-office", "deendayal", "simran"],
        "office",
        "Place a table in front of the chair. This chair should be on one "
        "side of the three home chairs. Chair to be places from the beginning "
        "and table to be placed just before the scene. Receptionist chair on "
        "the other side of home chairs, opposite to office chair. This will "
        "also be placed from beginning.",
        [("office-table", ""), ("vase", "")],
        [
            "After scene 1 remove cover from home chairs.",
            "Place a table in front of office chair.",
            "Receptionist chair can have a vase next to it though not necessary.",
            "Raj and man in office sit on two of the three chairs that were home earlier.",
        ],
    ),
    "scene-3": (
        ["raj", "simran"],
        "park",
        "Place vases or plant pots besides the chair. This chair is same a s "
        "receptionist chair.",
        [("vase", "vases with flowers/Plant pots"), ("roses", "2 roses")],
        ["After scene 2 place vases/plant pots beside the chair."],
    ),
    "scene-4": (
        ["raj", "dharamchand", "sumitradevi", "deendayal", "simran"],
        "home",
        "",
        [],
        [
            "After scene 3 place back covers on central chairs.",
            "Office chair can move next to park space chair so Simran and dad "
            "can sit there and Raj and parents in central 3 chairs.",
        ],
    ),
    "scene-5": (
        "everyone",
        "wedding",
        "All 5 chairs. Central chairs to have red cover, can possibly have petals.",
        [
            ("red-covers", ""),
            ("petals", ""),
            (
                "scarves",
                "for Dulha Dulhan and possibly others as well. Raj and Simran "
                "can have some nice scarves on their dress. All can choose to "
                "have scarves not a must.",
            ),
        ],
        [],
    ),
    "scene-6": (
        ["raj", "sumitradevi", "bhairav"],
        "home", "",
        [("briefcase", ""), ("tie", ""), ("pungi", ""), ("saffron-shawl", "for baba")],
        ["Location Home same as scene 1 so should have same set up as scene 1."],
    ),
    "scene-7": (
        ["raj", "rocky", "sumitradevi"],
        "home",
        "",
        [
            ("result-sheet", ""),
            ("dadaji-photo", ""),
            (
                "cap-jacket",
                "a prop to show young Rocky, since in later scene he needs to look old.",
            ),
        ],
        [],
    ),
    "scene-8": (
        ["raj", "rocky", "simran"],
        "home",
        "",
        [("small-lamp", ""), ("walking-stick", "")],
        [],
    ),
}

SHOW = {
    "title": "Mein hu",
    "titleAccent": "Hero",
    "eyebrow": "Rehearsal Companion",
    "tagline": (
        "A fun stage skit inspired by classic Bollywood traditions and iconic "
        "scenes. Pick your character below to rehearse your lines, or read "
        "the whole thing through."
    ),
    "photo": {
        "file": "Apurva-Aparna.webp",
        "fallback": "Apurva Aparna.png",
        "alt": "Apurva and Aparna as Raj and Simran",
        "width": 1672,
        "height": 941,
    },
    "pickerPrompt": "Pick your character to start rehearsing",
    "footer": "Mein hu Hero · rehearsal companion",
}

# style picks the sample's look; sample and meaning are the words shown.
# **bold** in a meaning is shown bold.
LEGEND = [
    (
        "optional",
        "Optional line",
        "Highlighted sections in yellow can be deleted if the play becomes very lengthy.",
    ),
    (
        "song",
        "Song",
        "A song, or words describing music. The play button beside a song plays the track.",
    ),
    ("sfx", "Sound effect", "A sound effect (SFX), with its own play button."),
    (
        "songBadge",
        "Song",
        "A note badge marks every line with a song, for the sound operator.",
    ),
    (
        "sfxBadge",
        "SFX",
        "A speaker badge marks every sound effect. Turn on **Sound cues only** to "
        "see just the songs and sound effects, for the sound operator.",
    ),
    (
        "direction",
        "(stage direction)",
        "What happens on stage. Directions are labelled **Stage direction**, in "
        "grey italics with a dashed edge.",
    ),
]


def main():
    d = json.load(open(SRC, encoding="utf-8"))
    assert d.get("format") == 1, "show.json is not format 1; nothing to do"
    d["format"] = 2
    d["show"] = SHOW
    d["legend"] = [{"style": s, "sample": a, "meaning": m} for s, a, m in LEGEND]
    d["crew"] = []
    d["locations"] = [{"id": i, "name": n, "description": ds} for i, n, ds in LOCATIONS]
    d["props"] = [{"id": i, "name": n, "description": ""} for i, n in PROPS]
    for sc in d["scenes"]:
        on, loc, note, props, steps = SCENES[sc["id"]]
        for k in ("cast", "location", "props", "notes"):
            sc.pop(k, None)
        sc["onStage"] = on
        sc["locationId"] = loc
        sc["locationNote"] = note
        sc["props"] = [{"propId": p, "note": n} for p, n in props]
        sc["setChanges"] = [
            {"id": "%s-sc%d" % (sc["id"], i + 1), "text": t, "assigneeId": ""}
            for i, t in enumerate(steps)
        ]
    # key order: keep the script last so the file reads top-down
    order = [
        "format",
        "show",
        "legend",
        "actors",
        "characters",
        "crew",
        "locations",
        "props",
        "songs",
        "sfx",
        "scenes",
    ]
    out = {k: d[k] for k in order}
    with open(SRC, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
        f.write("\n")
    print(
        "format 2 written:",
        len(out["locations"]),
        "locations,",
        len(out["props"]),
        "props,",
        sum(len(s["setChanges"]) for s in out["scenes"]),
        "set changes",
    )


main()
