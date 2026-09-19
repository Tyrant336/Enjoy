"""Generate docs/presentation/enjoy-pitch.pptx — the 2-minute hackathon deck.

Run:  Backend/.venv/Scripts/python.exe docs/presentation/make_pptx.py
Re-run any time after editing; the .pptx is overwritten.

Design law: the locked palette (cream/navy/teal/soft-amber), NO red,
no dashboards, no pressure mechanics. Big text — this is read on video.
"""

from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN
from pptx.util import Emu, Inches, Pt

# Locked palette (frontend/lib/theme.ts)
CREAM = RGBColor(0xED, 0xED, 0xDD)
NAVY = RGBColor(0x1A, 0x20, 0x3B)
TEAL = RGBColor(0x2E, 0x8C, 0x8C)
DEEP_TEAL = RGBColor(0x0F, 0x4C, 0x5C)
SOFT_AMBER = RGBColor(0xE8, 0xB4, 0x6A)
WHITE = RGBColor(0xF7, 0xF7, 0xF0)

FONT = "Segoe UI"

prs = Presentation()
prs.slide_width = Inches(13.333)  # 16:9
prs.slide_height = Inches(7.5)
BLANK = prs.slide_layouts[6]


def slide(bg: RGBColor) -> object:
    s = prs.slides.add_slide(BLANK)
    s.background.fill.solid()
    s.background.fill.fore_color.rgb = bg
    return s


def text(s, left, top, width, height, lines, *, align=PP_ALIGN.CENTER):
    """lines: list of (text, size_pt, color, bold)."""
    box = s.shapes.add_textbox(Inches(left), Inches(top), Inches(width), Inches(height))
    tf = box.text_frame
    tf.word_wrap = True
    for i, (t, size, color, bold) in enumerate(lines):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.alignment = align
        p.space_after = Pt(10)
        run = p.add_run()
        run.text = t
        run.font.name = FONT
        run.font.size = Pt(size)
        run.font.color.rgb = color
        run.font.bold = bold
    return box


def notes(s, text_: str) -> None:
    s.notes_slide.notes_text_frame.text = text_


def bar(s, color, left, top, width, height):
    from pptx.enum.shapes import MSO_SHAPE

    sh = s.shapes.add_shape(
        MSO_SHAPE.RECTANGLE, Inches(left), Inches(top), Inches(width), Inches(height)
    )
    sh.fill.solid()
    sh.fill.fore_color.rgb = color
    sh.line.fill.background()
    sh.shadow.inherit = False
    return sh


# ── Slide 1 · Title ─────────────────────────────────────────────────────────
s = slide(NAVY)
bar(s, TEAL, 0, 5.9, 13.333, 0.12)
text(s, 1, 2.1, 11.333, 2.6, [
    ("enjoy", 96, WHITE, True),
    ("the Harbour of Learning", 36, SOFT_AMBER, False),
])
text(s, 1, 5.0, 11.333, 0.8, [
    ("A cozy ocean world that automates studying.", 24, CREAM, False),
])
notes(s, "0:00-0:10 — Say: 'This is enjoy — a calm ocean world that does the "
         "busywork of studying for you.' Then cut straight to the problem.")

# ── Slide 2 · Problem ───────────────────────────────────────────────────────
s = slide(CREAM)
text(s, 1, 0.8, 11.333, 1.0, [("Students don't drown in learning.", 40, NAVY, True)])
text(s, 1.6, 2.2, 10.1, 3.6, [
    ("They drown in the work AROUND it:", 26, DEEP_TEAL, False),
    ("planning what to study   ·   formatting flashcards", 24, NAVY, False),
    ("scheduling reviews   ·   tracking progress", 24, NAVY, False),
    ("That's extraneous load — and it eats the evening.", 24, SOFT_AMBER, True),
])
notes(s, "0:10-0:25 — Pain first, one breath per bullet. Land on: 'none of "
         "that is learning — it's overhead.'")

# ── Slide 3 · The idea ──────────────────────────────────────────────────────
s = slide(DEEP_TEAL)
text(s, 1, 1.6, 11.333, 3.6, [
    ("What if your study plan were a harbour?", 40, WHITE, True),
    ("tasks are boats   ·   reviews are a short sail", 26, CREAM, False),
    ("finished decks rest at the lamp   ·   knowledge grows as a reef below", 26, CREAM, False),
])
notes(s, "0:25-0:40 — The metaphor in one breath. 'No streaks, no guilt — "
         "the lamp only records victories.' Then: 'let me show you.'")

# ── Slide 4 · Demo beat: chat -> plan ───────────────────────────────────────
s = slide(NAVY)
text(s, 1, 0.9, 11.333, 1.4, [("One sentence becomes a plan.", 44, WHITE, True)])
text(s, 1, 2.4, 11.333, 1.6, [
    ('"I have a thermodynamics exam Friday"  ->  roadmap, tasks, and boats on the water', 24, CREAM, False),
])
text(s, 1, 4.6, 11.333, 1.2, [
    (">>> GAMEPLAY: type in chat, tour offer appears, boats spawn <<<", 20, SOFT_AMBER, True),
])
notes(s, "0:40-1:05 — CUT TO GAMEPLAY here. Type the sentence live, let the "
         "tour offer and boat spawn play. Voiceover: 'The orchestrator routes "
         "it, the planner templates it, the world shows it.'")

# ── Slide 5 · Demo beat: review loop ────────────────────────────────────────
s = slide(TEAL)
text(s, 1, 0.9, 11.333, 1.4, [("Flashcards are a short sail.", 44, WHITE, True)])
text(s, 1, 2.4, 11.333, 2.0, [
    ("board the boat  ->  question  ->  reveal  ->  four grade boats", 24, WHITE, False),
    ("finish the deck and it docks at the lamp — glowing a little brighter", 24, CREAM, False),
])
text(s, 1, 4.9, 11.333, 1.2, [
    (">>> GAMEPLAY: full 3-card review, keyboard only, dock + lamp glow <<<", 20, NAVY, True),
])
notes(s, "1:05-1:30 — CUT TO GAMEPLAY. Play the recorded review loop. "
         "Voiceover: 'Real retrieval practice — the AI never answers for you, "
         "it just removes everything else.'")

# ── Slide 6 · Demo beat: underwater atlas ───────────────────────────────────
s = slide(NAVY)
text(s, 1, 0.9, 11.333, 1.4, [("Knowledge grows beneath the sea.", 44, WHITE, True)])
text(s, 1, 2.4, 11.333, 1.6, [
    ("dive down: every concept you study joins a living atlas", 24, CREAM, False),
])
text(s, 1, 4.6, 11.333, 1.2, [
    (">>> GAMEPLAY: dive transition, atlas nodes, click a node <<<", 20, SOFT_AMBER, True),
])
notes(s, "1:30-1:45 — CUT TO GAMEPLAY: dive, pan the atlas, open one node. "
         "Voiceover: 'Your portfolio isn't a chart — it's a place.'")

# ── Slide 7 · Under the hood ────────────────────────────────────────────────
s = slide(CREAM)
text(s, 1, 0.8, 11.333, 1.0, [("Under the hood", 40, NAVY, True)])
text(s, 1.4, 2.1, 10.5, 4.2, [
    ("FastAPI + agent orchestrator  ->  planner, flashcards, knowledge graph", 24, NAVY, False),
    ("Postgres + one ordered event stream  ->  the world can never drift", 24, NAVY, False),
    ("Next.js + three.js  ->  one runtime path, no mock modes", 24, NAVY, False),
    ("AI absorbs the overhead — never the thinking.", 26, DEEP_TEAL, True),
], align=PP_ALIGN.LEFT)
notes(s, "1:45-1:55 — Technical credibility in ten seconds. Don't read the "
         "bullets; say: 'agents do the plumbing, Postgres is the single truth, "
         "and the AI never studies FOR you.'")

# ── Slide 8 · Closing ───────────────────────────────────────────────────────
s = slide(NAVY)
bar(s, SOFT_AMBER, 0, 3.6, 13.333, 0.06)
text(s, 1, 2.3, 11.333, 2.4, [
    ("The lamp records victories only.", 48, WHITE, True),
    ("enjoy — come back to a harbour, never a bill.", 26, SOFT_AMBER, False),
])
notes(s, "1:55-2:00 — Slow down. One line: 'A returning student is welcomed, "
         "never billed for absence. Thank you.' End on the lamp shot if you "
         "have one.")

prs.save("docs/presentation/enjoy-pitch.pptx")
print(f"OK — {len(prs.slides.slides if hasattr(prs.slides, 'slides') else prs.slides._sldIdLst)} slides")  # noqa: E501
