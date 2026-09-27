"""Round 12: apply the house style (STYLE.md) to show.json.

Every change is written out here by hand: the new running order of each
scene, row by row, and the new wording of the scene details. Nothing is
inferred at run time, so the edit can be read, reviewed and reverted.

The edit was reviewed against the script as published in BASE_COMMIT.
The script only applies it to a show.json whose script still matches that
version: if anyone has published a change since, it stops and lists what
differs, so a later edit is never silently overwritten. Fold such changes
into this file (or into the published script afterwards) and run again.

Rows that survive keep their id; new rows get an id starting "i-hs-".
Review-only fields (starting "_") go into review/review.json, which the
review page is built from, and never into show.json.

    python3 tools/restyle.py            # writes show.json and review/review.json
    python3 tools/restyle.py --check    # only reports, writes nothing
"""

import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SHOW = ROOT / "show.json"
REVIEW = ROOT / "review" / "review.json"
BASE_COMMIT = "e13a3d8"  # the published script the edit was reviewed against

GAG = "Raj puts his hand to his forehead."
FAIL = "sfx-muij4o9zev8y"  # "Fail 2"


def html(text):
    """Script text to show.json markup.

    Paragraphs are separated by a blank line. *(note)* is a delivery note
    (italic). [song:Title] is a song named in a direction.
    """
    out = []
    for para in text.strip().split("\n\n"):
        p = para.strip().replace("&", "&amp;")
        p = re.sub(r"\*\((.+?)\)\*", r"<i>(\1)</i>", p)
        p = re.sub(r"\[song:(.+?)\]", r"<mark>‘\1’</mark>", p)
        out.append("<p>" + p + "</p>")
    return "".join(out)


def _meta(why, rules, src, new, query):
    return {
        "_why": why,
        "_rules": list(rules),
        "_from": src,
        "_new": new,
        "_query": query,
    }


def L(id, who, text, why="", rules=("7",), src=None, new=False, query=None):
    return {
        "id": id,
        "type": "line",
        "characterId": who,
        "note": "",
        "text": html(text),
        **_meta(why, rules, src, new, query),
    }


def D(id, text, why="", rules=("3",), src=None, new=False, query=None, label=""):
    return {
        "id": id,
        "type": "direction",
        "label": label,
        "text": html(text),
        **_meta(why, rules, src, new, query),
    }


def SET(id, text, why="", rules=("1", "3"), src=None, new=False, query=None):
    return D(id, text, why, rules, src, new, query, label="Setting")


def CUE(id, why="", rules=()):
    """An existing song or sound-effect row, kept as it is (moved at most)."""
    return {"id": id, "_keep": True, **_meta(why, rules, None, False, None)}


def REQ(id, request, why="", rules=("5",), src=None, new=False):
    return {
        "id": id,
        "type": "song",
        "request": request,
        "note": "",
        **_meta(why, rules, src, new, None),
    }


def gag(n, src=None):
    """The running gag: the same direction and the same sound every time."""
    return [
        D(
            "i-hs-gag-%d" % n,
            GAG,
            "The running gag, worded the same every time.",
            ("8",),
            src=src,
        ),
        {
            "id": "i-hs-fail-%d" % n,
            "type": "sfx",
            "sfxId": FAIL,
            "note": "",
            **_meta(
                "The gag’s sound effect, so the audience learns the beat.",
                ("8",),
                None,
                True,
                None,
            ),
        },
    ]


# ----------------------------------------------------------------------
# The new running order
# ----------------------------------------------------------------------
SCENES = {}

SCENES["scene-1"] = [
    L(
        "i1",
        "narrator",
        """
Namaste. Aaj hum milane ja rahe hain ek ajeeb-o-gareeb naujawan Raj se. Naam to suna hi hoga! Raj Hindi filmon se tang aa chuka hai. Nahi, nahi; use filmon se koi shikayat nahi, woh to kabhi kabhi ek-do picture bhi dekh leta hai. Use problem hai filmi fans se, jo uske jeevan mein bahut hain. Hamare is natak ka naam hai

‘Mein hu Hero’.

Aao dekhen, Raj Malhotra ke ghar mein kya scene hai.

Milate hain unke pita Dharamchand aur Mataji Sumitra Devi se.""",
        "Spelling only. The show title keeps its own spelling (see STYLE.md).",
    ),
    SET(
        "i2",
        "The Malhotras’ drawing room. Dharamchand sits reading the newspaper, his glasses on. Sumitra Devi is in the kitchen.",
        "The opening stage picture, labelled Setting; characters by name, not ‘Father’ and ‘Mum’.",
    ),
    L(
        "i3",
        "dharamchand",
        "*(puts the newspaper aside; loudly)* Arre Bhagwan, sunti ho!",
        "Two delivery notes in two styles become one note, where it applies.",
        ("2", "7"),
    ),
    D(
        "i-hs-1",
        "Sumitra Devi comes out of the kitchen, wiping her hands on her sari.",
        "Her nine-word entrance, moved out of her line.",
        ("2", "3"),
        src="i4",
    ),
    L(
        "i4",
        "sumitradevi",
        "Kya hai, Raj ke papa?",
        "Her entrance is now the direction above.",
        ("2", "7"),
    ),
    L("i5", "dharamchand", "Subah se rasoi mein kya kar rahi ho?"),
    L(
        "i6",
        "sumitradevi",
        "Aaj hamara beta Raj vilayat se aa raha hai na. Uski taiyari kar rahi thi.",
        "‘(vilaayat se)’ was part of what she says, so the brackets go and it joins the sentence.",
    ),
    L(
        "i7",
        "dharamchand",
        "Haan. Aaj teen saal baad apna beta vilayat se degree lekar aa raha hai. Woh bhi first class first number lekar. Baap-dadaon ka naam roshan kiya hai. Aakhir beta kiska hai?",
    ),
    L("i8", "sumitradevi", "Haan, aapka hi hai. Par aap use lene nahi gaye airport?"),
    L(
        "i9",
        "dharamchand",
        "Usne bola tha ki driver ke saath gaadi bhijwa do, woh khud aa jaayega. Aata hi hoga.",
    ),
    L(
        "i10",
        "sumitradevi",
        "*(loudly)* Ramu, kahan mar gaya? Aarti ki thali taiyaar rakhna.",
        "‘(Loud voice)’ mid-sentence becomes a delivery note where it applies.",
        ("2", "7"),
    ),
    L("i11", "ramu", "Taiyaar hai, Maaji. Yeh lijiye."),
    CUE(
        "i12-s1",
        "Now the only place this music is given: the direction that repeated it is removed.",
        ("4",),
    ),
    D(
        "i12b",
        "Sumitra Devi walks to the door and realises Raj has not arrived. She turns back, disheartened.",
        "The music change is the next cue row, so the direction no longer describes it.",
        ("3", "4"),
    ),
    CUE("i12-s2"),
    D(
        "i12c",
        "Raj enters. Sumitra Devi performs the aarti. Raj bends to touch his parents’ feet for their blessing.",
        "Brackets removed; ‘Mother’ becomes her name; ‘take Ashirwad’ said in English.",
    ),
    L("i13", "dharamchand", "Jao, aur pehle Dadaji ka aashirwad le lo."),
    D("i-muie1mmxbx49", "Raj walks to Dadaji’s photo and places his degree beside it."),
    L(
        "i14",
        "raj",
        "Dadaji, aaj main vilayat se degree lekar aaya hoon. Aapka sapna maine poora kiya hai. Mujhe aashirwad dijiye.",
    ),
    L("i15", "dharamchand", "Raj beta, tu ab kya karna chahega?"),
    L(
        "i16",
        "raj",
        "Maine ek company mein job ke liye apply kiya tha. Aaj hi interview ke liye jaana hai.",
    ),
    L(
        "i17",
        "raj",
        "*(to Sumitra Devi)* Maa, mujhe bahut bhookh lagi hai. Kuch khaane ko do na.",
        "The delivery note sits on the line, not in a paragraph of its own.",
        ("2", "7"),
    ),
    L(
        "i18",
        "sumitradevi",
        "Haan, laati hoon. *(loudly)* Ramu, kahan mar gaya? Khaana le aao.",
        "‘(Loud voice)’ mid-sentence becomes a delivery note where it applies.",
        ("2", "7"),
    ),
    D(
        "i19",
        "Ramu serves the food. Sumitra Devi brings Raj a bowl of gajar ka halwa and tries to feed him.",
    ),
    L(
        "i20",
        "raj",
        "Yeh kya, Maa? Gajar ka halwa? Aap bhool gayi kya, mujhe gajar pasand nahi hai.",
    ),
    L(
        "i21",
        "sumitradevi",
        "Par beta, har picture mein jab beta bahut dinon ke baad ghar lautta hai, to maa gajar ka halwa hi banati hai.",
    ),
    D(
        "i-muie73rialni",
        GAG,
        "The running gag. The sound-effect highlight was on an action, not a sound.",
        ("4", "8"),
    ),
    CUE("i-muiig5mobe3r", "The gag’s sound effect, already here.", ("8",)),
]

SCENES["scene-2"] = (
    [
        L(
            "i23",
            "narrator",
            "Raj apne interview ke liye Deendayal Sethji ke office pahunch gaya hai. Chaliye, dekhte hain wahan kya hota hai.",
        ),
        SET(
            "i24",
            "The waiting area outside Deendayal’s office. The Receptionist is in her seat. Raj waits beside Kaalia, another candidate.",
            "‘Office scene’ was a note, not a direction. Now the opening stage picture, saying who is on.",
        ),
        L("i25", "receptionist", "Raj Malhotra, aapko Sethji ne andar bulaya hai."),
        D(
            "i26",
            "Raj gets up and walks towards Deendayal’s door. Kaalia steps in front of him.",
        ),
        L(
            "i27",
            "raj",
            "Kya kar rahe ho? Mujhe bulaya hai. Aap mere baad jaana.",
            "Stray italics on spoken words removed.",
            ("2", "7"),
        ),
        L(
            "i28",
            "man-office",
            "Hum jahan khade hote hain, wahin se line shuru hoti hai.",
        ),
        L(
            "i29",
            "receptionist",
            "Chal hat. Kahan kahan se aa jaate hain Amitabh.",
            "The push and Raj’s reaction were inside her line; both are now directions.",
            ("2", "7"),
        ),
        D(
            "i-hs-2",
            "The Receptionist pushes Kaalia aside.",
            "Her business involves another character, so it moves out of her line. Kaalia’s hook step starts as he is pushed (your decision).",
            ("2", "3"),
            src="i29",
        ),
        REQ(
            "i-mujpsvzptwrm",
            "‘Jahan teri yeh nazar hai’: just the music for Amitabh’s hook step. Reference: https://www.youtube.com/watch?v=BXaqBNTl7zI",
            "The reference link was in the note, which the cast sees. It belongs in the request, for the audio maker.",
        ),
        D(
            "i-hs-3",
            "As the music plays, Kaalia does Amitabh’s hook step.",
            "New: what the hook-step music is for, as you confirmed.",
            new=True,
        ),
    ]
    + gag(2, src="i29")
    + [
        SET(
            "i30",
            "Inside Deendayal’s office. Raj enters. The Receptionist and Kaalia can walk off, so the focus moves to the office.",
            "A change of place, labelled Setting. The blocking note from the start of Deendayal’s line joins it.",
            ("2", "3"),
            src="i31",
        ),
        L(
            "i31",
            "deendayal",
            "Aao, barkhurdar. Tum vilayat se first class first lekar aaye ho. Yeh manager ka job tumhara hai. Bahar jaakar Munimji se apna appointment letter le lo. Kab join karna chahoge?",
            "Blocking note moved out. ‘(Simran’s father)’ removed from the speaker: the cast list says it.",
            ("2", "7"),
        ),
        L("i32", "raj", "Shukriya, Sethji. Kal se hi join karunga."),
        D(
            "i33",
            "Raj shakes Deendayal’s hand and walks to the door, where he collides with Simran. They gaze into each other’s eyes.",
            "Song highlight removed: the song is the next cue row.",
            ("3", "4"),
        ),
        CUE("i-muidte4s8o1c"),
        D(
            "i-muidu8an0fte",
            "Deendayal coughs loudly. Raj hurries out. Simran goes to her father.",
        ),
        L("i34", "simran", "Yeh kaun tha, Papa?"),
        L(
            "i35",
            "deendayal",
            "Woh Raj hai. Bahut honhaar naujawan hai. Vilayat se first class first lekar aaya hai. Kal se office join karega.",
            "‘(Simran’s father)’ removed from the speaker.",
            ("2", "7"),
        ),
        L("i36", "simran", "Papa, main shaadi isi se karungi."),
        L(
            "i37",
            "deendayal",
            "OK, beta. Jo tumhe pasand hai, usi se tumhari shaadi hogi.",
            "‘(Simran’s father)’ removed from the speaker.",
            ("2", "7"),
        ),
    ]
)

SCENES["scene-3"] = (
    [
        L(
            "i38",
            "narrator",
            "Raj aur Simran aksar ek dusre se milne lage hain.",
            "The entrance note inside the Narrator’s line is now the Setting.",
            ("2", "7"),
        ),
        SET(
            "i-hs-4",
            "A park bench. Raj and Simran walk in while the Narrator speaks.",
            "Built from the entrance note in the Narrator’s line.",
            src="i38",
        ),
        REQ(
            "i-mujpfognltzz",
            "The opening dings of ‘Naino mein sapna’.",
            "‘coming soon…’ in the note repeated what a request already says.",
        ),
        D(
            "i39",
            "Raj sits on the bench.",
            "One long direction held the dance, the gag and the exit. Split, with each cue where its music starts.",
            ("3", "4"),
        ),
        CUE("i39-s1", "Placed where the music starts, before the dance.", ("4",)),
        D(
            "i-hs-5",
            "Simran dances around him.",
            "The dance, from the long direction; the song is the cue above.",
            ("3", "4"),
            src="i39",
        ),
    ]
    + gag(3, src="i39")
    + [
        REQ(
            "i-mujpg3q74f4w",
            "The rest of ‘Naino mein sapna’, closing with ‘Ek main aur ek tu’.",
            "Placed where the music starts, as they leave. ‘coming soon…’ note removed.",
        ),
        D(
            "i-hs-6",
            "Simran pulls Raj away and they leave together. As they exit, a person crosses the stage with two roses, which meet behind the couple rather than in front of their faces, so the children in the audience have no questions.",
            "The exit, from the long direction, with its reason kept.",
            ("3",),
            src="i39",
        ),
    ]
)

SCENES["scene-4"] = [
    L(
        "i40",
        "narrator",
        "Deendayal, Sharda Devi aur Simran shaadi ki baat pakki karne Raj ke ghar gaye.",
    ),
    SET(
        "i-hs-7",
        "The Malhotras’ drawing room. Dharamchand, Sumitra Devi and Raj welcome Deendayal, Sharda Devi and Simran.",
        "New: the scene had no opening stage picture.",
        new=True,

    ),
    L(
        "i41",
        "sumitradevi",
        "Ramu, kahan mar gaya? Mehmaan aa gaye. Chai-nashta le aana.",
    ),
    L("i42", "ramu", "Ji, Maaji, abhi laaya."),
    L("i43", "dharamchand", "Aaiye, aaiye. Baithiye."),
    D(
        "i44",
        "Simran touches Sumitra Devi’s feet for her blessing.",
        "Was a ‘line’ with no words; it is a direction.",
        ("2", "3"),
    ),
    L(
        "i45",
        "sumitradevi",
        "Kitni sundar bahu dhoondhi hai hamare Raj ne. Kitni sanskari bhi hai. Main diya lekar dhoondhne jaati, tab bhi aisi sundar bahu nahi milti.",
        "Her last paragraph was a direction written in Hindi; it follows in English.",
        ("2", "7"),
    ),
    D(
        "i-hs-8",
        "Simran blushes, then winks at Raj.",
        "Moved out of Sumitra Devi’s line.",
        ("2", "3"),
        src="i45",
    ),
    L("i46", "deendayal", "Hum yeh shaadi dhoom-dhaam se manaayenge."),
    D(
        "i-hs-9",
        "Sumitra Devi nudges Dharamchand.",
        "Moved out of Dharamchand’s line.",
        ("2", "3"),
        src="i47",
    ),
    L(
        "i47",
        "dharamchand",
        "Thehro. Ek baat to main bolna bhool hi gaya.",
        "His speech is split around the direction that interrupts it.",
        ("2", "7"),
    ),
    D(
        "i-hs-10",
        "Deendayal looks worried.",
        "Moved out of Dharamchand’s line.",
        ("2", "3"),
        src="i47",
    ),
    L(
        "i-hs-11",
        "dharamchand",
        "Ghabrao nahi, Sambandhiji. Hamari koi paison ki maang nahi hai. Lekin *(long pause)* hum chahte hain ki baraatiyon ka swagat Pan Parag se kiya jaaye.",
        "The second half of his speech. ‘Pan Parag’ is the brand the joke quotes.",
        ("2", "7"),
        src="i47",
    ),
    D(
        "i48",
        "Everyone laughs.",
        "Raj’s reaction follows as the running gag.",
        ("3", "8"),
    ),
] + gag(4, src="i48")

SCENES["scene-5"] = [
    SET(
        "i49",
        "The wedding reception. Raj and Simran sit on their chairs. All the characters so far are guests, arriving and making small talk for about 30 seconds.",
        "One long paragraph split into the stage picture, the music cue and the dance.",
        ("1", "3"),
    ),
    CUE("i49-s1", "Moved to where the music starts, before the dance.", ("4",)),
    D(
        "i-hs-12",
        "Suddenly Dharamchand and Sumitra Devi break into a dance, and the guests join them in a circle. Simran gets up. Raj tries to hold her back, but she joins in too.",
        "The dance, from the long paragraph; song highlight and brackets removed.",
        ("3", "4"),
        src="i49",
    ),
] + gag(5, src="i49")

SCENES["scene-6"] = [
    L(
        "i50",
        "narrator",
        "Aise hi hanste-khelte Raj ki zindagi beet rahi hai. Idhar ghar waale aur bhi filmi hote ja rahe the. Is beech Sridevi ki naagin picture release ho gayi. Iska Raj ke ghar mein kya asar hua, yeh dekhte hain.",
    ),
    SET(
        "i51",
        "The Malhotras’ drawing room. Sumitra Devi is at home. Raj comes back from the office and loosens his tie.",
        "The opening stage picture, labelled Setting, saying who is on.",
    ),
    L(
        "i52",
        "sumitradevi",
        "Aaj hamare ghar ek bahut bade Baba aa rahe hain.",
        "Bhairav Baba’s entrance was inside her line; it now splits it.",
        ("2", "7"),
    ),
    D(
        "i-hs-13",
        "Bhairav Baba arrives.",
        "Moved out of Sumitra Devi’s line.",
        ("2", "3"),
        src="i52",
    ),
    L(
        "i-hs-14",
        "sumitradevi",
        "Bhairav Baba ki jai! Lagta hai aapko pehle bhi kabhi dekha hai.",
        "The second half of her line.",
        ("2", "7"),
        src="i52",
    ),
    L(
        "i53",
        "bhairav",
        "Mumkin hai, kyunki is skit mein mera triple role hai. Shayad aapko main Amitabh ke jaisa lag raha hoon.",
        "‘tripe role’ corrected to ‘triple role’: the actor plays three parts.",
    ),
    L("i54", "sumitradevi", "Baba, mujhe lagta hai meri bahu, Simran, ek naagin hai."),
    L(
        "i55",
        "bhairav",
        "Aap ghabrao nahi, Maaji. In naaginon ko nachaana mujhe achchhi tarah aata hai.",
        "His whole line was set as a direction. Now only his words; the action follows.",
        ("2", "7"),
    ),
    D(
        "i-hs-15",
        "Bhairav Baba starts playing his pungi.",
        "Moved out of his line; ‘been’ called ‘pungi’ as in the props list.",
        ("2", "3"),
        src="i55",
    ),
    CUE("i55-s1", "Placed where the music starts, before Simran’s dance.", ("4",)),
    D(
        "i-hs-16",
        "Simran comes down the stairs and dances, tongue out, hissing like a snake.",
        "Moved out of Bhairav Baba’s line; the song is the cue above.",
        ("2", "3", "4"),
        src="i55",
    ),
] + gag(6, src="i55")

SCENES["scene-7"] = [
    L(
        "i56",
        "narrator",
        "Ghabrao nahi. Simran sach-much ki naagin nahi thi. Picture cinema theatre se jaate hi, Raj ke ghar se bhi yeh naagin ka bhoot utar gaya. Aur Sumitra Devi bhi khush thi, kyunki ek nanha Raj ghar mein aa gaya tha. Naam rakha Rocky. Yeh Rocky bhi kuch kam filmi nahi tha. Aao, dekhte hain Rocky ki ek jhalak.",
    ),
    SET(
        "i-hs-17",
        "Some years later. The Malhotras’ drawing room. Raj is at home. Rocky, now about 16, comes in with his report card.",
        "New: the scene had no opening stage picture, and time has passed.",
        new=True,

    ),
    L("i57", "raj", "Rocky, kahan se aa rahe ho? Tumhara result aaya kya?"),
    L(
        "i58",
        "rocky",
        "Hey Dad! Chill. Result lene hi gaya tha. *(presents it proudly)* Yeh dekhiye, mera report card.",
        "Delivery note moved to where it applies.",
        ("2", "7"),
    ),
    L("i59", "raj", "Yeh kya? Sab mein fail! Heart fail ho jaayega mera."),
    L(
        "i60",
        "rocky",
        "*(like Aamir Khan in ‘3 Idiots’)* Chill, Dad. Just say ‘All is well’, ‘All is well’.",
        "Delivery note moved to the start, where it applies.",
        ("2", "7"),
    ),
    L(
        "i61",
        "rocky",
        "Dad, kya main Bade Dadaji ki photo ke saamne yeh report card rakhoon?",
    ),
    L(
        "i62",
        "raj",
        "*(raises his hand to slap him)* Ek khaayega mujhse.",
        "Delivery note moved to where it applies, said in English.",
        ("2", "7"),
    ),
    D(
        "i-hs-18",
        "Sumitra Devi comes out of the kitchen, exactly as in scene 1.",
        "Her entrance was inside her line.",
        ("2", "3"),
        src="i63",
    ),
    L(
        "i63",
        "sumitradevi",
        "Rocky beta, main tere liye gajar ka halwa lekar aati hoon.",
        "Her entrance is now the direction above.",
        ("2", "7"),
    ),
    D(
        "i64",
        GAG,
        "Was a ‘line’ with no words; now the running gag in its standard form.",
        ("2", "8"),
    ),
    gag(7)[1],
]

SCENES["scene-8"] = [
    SET(
        "i-hs-19",
        "Many years later, at the Malhotras’ home. Raj, now old, walks with a stick. Simran and a grown-up Rocky are with him.",
        "‘(Old)’ and ‘(now grown up)’ were beside the speakers’ names; time passing belongs in the Setting.",
        ("1", "2"),
        src="i65",
    ),
    CUE("i65-s1", "Moved to where the music starts.", ("4",)),
    D(
        "i65",
        "Raj sings along to the old Bajaj jingle, then starts coughing.",
        "Was a ‘line’ holding only a description of the song and an action.",
        ("2", "3", "4"),
    ),
    L(
        "i66",
        "rocky",
        "Dad, aapko letna chahiye.",
        "‘(now grown up)’ removed from the speaker. ‘chaliye’ read as a typing slip for ‘chahiye’.",
        ("2", "7"),
    ),
    D(
        "i67",
        "Simran and Rocky get Raj to lie down on the bed. They light a small lamp.",
    ),
    L("i68", "raj", "Yeh kis liye? Electricity chali gayi kya?"),
    L(
        "i69",
        "simran",
        "Nahi!!! Is samay par aisa hi karte hain.",
        "‘Sasurji’ removed: Simran is Raj’s wife (your decision).",

    ),
    L(
        "i70",
        "raj",
        "*(confused)* Aisa samay?",
        "Delivery note moved to the start.",
        ("2", "7"),
    ),
    D("i71", "The lamp flickers and goes out."),
    L("i72", "everyone", "Nahiii!"),
    D(
        "i-hs-20",
        "Simran tries to break her bangles, but fails.",
        "Seven-word business moved out of her line.",
        ("2", "3"),
        src="i73",
    ),
    L(
        "i73",
        "simran",
        "Mujhe chhodkar kyun chale gaye?",
        "Her business is now the direction above.",
        ("2", "7"),
    ),
    D(
        "i-hs-21",
        "Raj gets up and starts beating everyone with his stick.",
        "Moved out of Raj’s line.",
        ("2", "3"),
        src="i74",
    ),
    L(
        "i74",
        "raj",
        "Chup karo, sab log! Diya bujh gaya. Main abhi bhi zinda hoon.",
        "His line also held a direction and a song request; both are now their own rows.",
        ("2", "7"),
    ),
    D(
        "i-hs-22",
        "Raj’s hand starts towards his forehead, but he shrugs it off.",
        "The gag’s payoff: he breaks the habit, so no ‘Fail’ sound here.",
        ("3", "8"),
        src="i74",
    ),
    REQ(
        "i-hs-23",
        "An ‘I’m back’ song with attitude: don’t worry, just live and have fun.",
        "Was buried as highlighted text in Raj’s line; now a proper request on the audio list.",
        ("4", "5"),
        src="i74",
    ),
    D(
        "i-hs-24",
        "Raj breaks into a dance and invites the family to join him.",
        "Moved out of Raj’s line.",
        ("2", "3"),
        src="i74",
    ),
    CUE("i75-s1", "Moved to where the music starts.", ("4",)),
    D(
        "i75",
        "Everyone dances. The audience is invited to join in.",
        "Was a ‘line’ for Everyone holding only directions.",
        ("2", "3"),
    ),
    D(
        "i-hs-25",
        "The End.",
        "The show’s last row, as its own direction.",
        ("1",),
        src="i75",
    ),
]

# Rows taken out, with the reason shown on the review page
DROPPED = {"i12": "It only repeated the song cue that follows it (rule 4)."}

# ----------------------------------------------------------------------
# Scene details, cast list, library and show text
# ----------------------------------------------------------------------
SCENE_DETAILS = {
    "scene-1": {
        "props": {
            "sheet": "to cover three of the chairs",
            "degree": "rolled paper tied with a ribbon",
            "napkin": "for Ramu Kaka",
            "food-plate": "with a bowl of gajar ka halwa (to be decided)",
        },
        "setChanges": [
            (
                "scene-1-sc1",
                "Before the show, place the office chair to one side of the three home chairs, and the Receptionist’s chair on the other side, opposite it. Both stay in place all show.",
            )
        ],
    },
    "scene-2": {
        "locationNote": "",
        "setChanges": [
            ("scene-2-sc1", "Take the covers off the home chairs."),
            ("scene-2-sc2", "Place the office table in front of the office chair."),
            (
                "scene-2-sc3",
                "If you like, place a vase beside the Receptionist’s chair.",
            ),
            (
                "scene-2-sc4",
                "Leave two of the three home chairs free for Raj and Kaalia.",
            ),
        ],
    },
    "scene-3": {
        "locationNote": "The Receptionist’s chair from scene 2 is the park bench.",
        "props": {"vase": "vases of flowers or plant pots", "roses": "two roses"},
        "setChanges": [
            (
                "scene-3-sc1",
                "Place vases or plant pots beside the Receptionist’s chair.",
            )
        ],
    },
    "scene-4": {
        "setChanges": [
            ("scene-4-sc1", "Put the covers back on the three central chairs."),
            (
                "scene-4-sc2",
                "Move the office chair next to the Receptionist’s chair, for Deendayal and Sharda Devi. Simran stands beside them. Raj and his parents sit on the three central chairs.",
            ),
        ]
    },
    "scene-5": {
        "locationNote": "All five chairs, the central ones with red covers and perhaps petals.",
        "props": {
            "scarves": "for the bride and groom, and anyone else who likes; not a must"
        },
    },
    "scene-6": {
        "setChanges": [("scene-6-sc1", "Set the drawing room as in scene 1.")],
        "props": {"saffron-shawl": "for Bhairav Baba"},
    },
    "scene-7": {
        "props": {"cap-jacket": "to make Rocky look young; he is grown up in scene 8"}
    },
}
ON_STAGE_ADD = {"scene-4": ["sharda", "ramu"], "scene-6": ["simran"]}
CHAR_NAMES = {"man-office": "Kaalia", "receptionist": "Receptionist", "sumitradevi": "Sumitra Devi"}
LOCATIONS = {"home": "The Malhotras’ home", "office": "Deendayal’s office"}
PROPS = {
    "sheet": "Light-coloured sheet",
    "aarati-thali": "Aarti thali",
    "result-sheet": "Report card",
    "cap-jacket": "Cap and jacket",
}
CHAR_ROLES = {
    "raj": "Raj Malhotra, the hero",
    "ramu": "Household help",
    "man-office": "Another interview candidate",
    "receptionist": "At Deendayal’s office",
}
SONG_TITLES = {"song-muidty0wkpj2": "Tujhe dekha", "song-04": "Naino mein sapna"}
LEGEND = {
    "optional": {
        "meaning": "Lines and directions marked in yellow can be cut if the show runs long.",
        "printMeaning": "Lines and directions with a gold edge can be cut if the show runs long.",
    },
    "song": {
        "meaning": "A song, with its play button and a teal edge. Teal words in a direction name the music.",
        "printMeaning": "A song cue, with a teal edge. Teal words in a direction name the music.",
    },
    "sfx": {
        "meaning": "A sound effect (SFX), with its play button and a magenta edge. Magenta words in a direction describe a sound. Turn on **Sound cues only** to see just the songs and sound effects, for the sound operator.",
        "printMeaning": "A sound-effect cue, with a magenta edge. Magenta words in a direction describe a sound.",
    },
    "direction": {
        "meaning": "What happens on stage, in grey italics with a dashed edge. The first one in each scene, labelled **Setting**, is the stage picture at lights up."
    },
}
SHOW_TEXT = {
    "printTagline": "A fun stage skit inspired by classic Bollywood traditions and iconic scenes."
}


def base_show():
    out = subprocess.run(
        ["git", "-C", str(ROOT), "show", BASE_COMMIT + ":show.json"],
        capture_output=True,
        text=True,
        check=True,
    ).stdout
    return json.loads(out)


def main():
    check_only = "--check" in sys.argv
    base = base_show()
    current = json.loads(SHOW.read_text())

    # The edit may only land on the script it was reviewed against.
    problems = []
    for key in sorted((set(base) | set(current)) - {"scenes"}):
        if current.get(key) != base.get(key):
            problems.append("%s changed since the review" % key)
    base_rows = {it["id"]: it for sc in base["scenes"] for it in sc["items"]}
    cur_rows = {it["id"]: it for sc in current["scenes"] for it in sc["items"]}
    for rid in sorted(set(base_rows) | set(cur_rows)):
        if base_rows.get(rid) != cur_rows.get(rid):
            problems.append("script row %s changed since the review" % rid)
    for b, c in zip(base["scenes"], current["scenes"]):
        if {k: v for k, v in b.items() if k != "items"} != {
            k: v for k, v in c.items() if k != "items"
        }:
            problems.append("scene details of %s changed since the review" % b["id"])
    if len(base["scenes"]) != len(current["scenes"]):
        problems.append("scenes added or removed since the review")
    stale, problems = problems, []

    show = json.loads(json.dumps(base))
    used = set()
    review = {"scenes": []}
    for sc in show["scenes"]:
        new_items, notes = [], []
        for row in SCENES[sc["id"]]:
            rid = row["id"]
            old = base_rows.get(rid)
            if rid in used:
                problems.append("row used twice: " + rid)
            used.add(rid)
            if row.get("_keep"):
                if not old:
                    problems.append("cue missing: " + rid)
                    continue
                item = dict(old)
            else:
                if not rid.startswith("i-hs-") and not old:
                    problems.append("row missing: " + rid)
                if row.get("_from") and row["_from"] not in base_rows:
                    problems.append("source row missing: " + row["_from"])
                item = {k: v for k, v in row.items() if not k.startswith("_")}
            new_items.append(item)
            notes.append(
                {
                    k[1:]: row.get(k)
                    for k in ("_why", "_rules", "_from", "_new", "_query")
                }
            )
            notes[-1]["id"] = rid
        dropped = [it["id"] for it in sc["items"] if it["id"] not in used]
        for rid in dropped:
            if rid not in DROPPED:
                problems.append("row dropped without a reason: " + rid)
        review["scenes"].append(
            {
                "id": sc["id"],
                "title": sc["title"],
                "before": sc["items"],
                "after": new_items,
                "notes": notes,
                "dropped": {rid: DROPPED[rid] for rid in dropped if rid in DROPPED},
            }
        )
        sc["items"] = new_items

        det = SCENE_DETAILS.get(sc["id"], {})
        if "locationNote" in det:
            sc["locationNote"] = det["locationNote"]
        for pid, note in det.get("props", {}).items():
            hit = [p for p in sc["props"] if p["propId"] == pid]
            if not hit:
                problems.append("prop %s not in %s" % (pid, sc["id"]))
            for p in hit:
                p["note"] = note
        if "setChanges" in det:
            who = {x["id"]: x.get("assigneeId", "") for x in sc["setChanges"]}
            sc["setChanges"] = [
                {"id": i, "text": t, "assigneeId": who.get(i, "")}
                for i, t in det["setChanges"]
            ]
        if sc["onStage"] != "everyone":
            for cid in ON_STAGE_ADD.get(sc["id"], []):
                if cid not in sc["onStage"]:
                    sc["onStage"].append(cid)

    def rename(lst, table, key):
        for x in lst:
            if x["id"] in table:
                x[key] = table[x["id"]]

    rename(show["locations"], LOCATIONS, "name")
    rename(show["props"], PROPS, "name")
    rename(show["characters"], CHAR_NAMES, "name")
    rename(show["characters"], CHAR_ROLES, "role")
    rename(show["songs"], SONG_TITLES, "title")
    for row in show["legend"]:
        row.update(LEGEND.get(row["style"], {}))
    show["show"].update(SHOW_TEXT)

    keys = ("locations", "props", "characters", "songs", "legend", "show")
    detail_keys = ("id", "title", "onStage", "locationNote", "props", "setChanges")
    review["details"] = {
        "before": {k: base[k] for k in keys},
        "after": {k: show[k] for k in keys},
        "sceneBefore": [{k: s[k] for k in detail_keys} for s in base["scenes"]],
        "sceneAfter": [{k: s[k] for k in detail_keys} for s in show["scenes"]],
    }

    if stale:
        if current == show:
            print("Already applied: show.json is the restyled script. Nothing to do.")
            return
        print("Stopped. show.json is not the version this edit was reviewed against (%s)," % BASE_COMMIT)
        print("so applying it would overwrite later changes. First differences:")
        for p in stale[:12]:
            print("  -", p)
        if len(stale) > 12:
            print("  - and %d more" % (len(stale) - 12))
        print("Fold those changes into tools/restyle.py, then run it again.")
        sys.exit(1)
    if problems:
        print("Stopped. The edit list has problems:")
        for p in problems:
            print("  -", p)
        sys.exit(1)
    print(
        "OK: %d scenes, %d rows before, %d after."
        % (
            len(show["scenes"]),
            sum(len(s["before"]) for s in review["scenes"]),
            sum(len(s["after"]) for s in review["scenes"]),
        )
    )
    if check_only:
        return
    REVIEW.parent.mkdir(exist_ok=True)
    REVIEW.write_text(json.dumps(review, ensure_ascii=False, indent=1))
    SHOW.write_text(json.dumps(show, ensure_ascii=False, indent=1) + "\n")


if __name__ == "__main__":
    main()
