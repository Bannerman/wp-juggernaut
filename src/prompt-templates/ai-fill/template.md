Please provide content for a resource titled "{{title}}". Use the EXACT format below with the field markers — output ONLY the section markers and your filled-in values, in the same order.

---TITLE---
{{title}}

---INTRO_TEXT---
{{intro_text}}

---TEXT_CONTENT---
{{text_content}}

---FEATURES---
{{features}}

---TAXONOMIES---

# Classification rules — read carefully, these override your default tendencies
- Pick the FEWEST terms that accurately classify this post. Quality over quantity.
- LEAVE A TAXONOMY EMPTY if no listed term clearly applies. Empty is a valid answer.
- Use ONLY the EXACT term names from the available lists — no inventing, no synonyms.
- Do NOT pick a term just because its name appears in the title or content.
- Each taxonomy has a strict pick count — never exceed it. Pick fewer when in doubt.

## Q1: FORMAT — what is the user actually getting? (resource-type, pick exactly 1)
Available: {{terms_resource-type}}

Decision rules:
- Bracket = a tournament/competition structure
- Tracker = ongoing data entry over time (workout log, expense tracker, draft tracker)
- Calculator = formula-driven output (mortgage calc, calorie calc)
- Checklist = a task list with checkboxes
- Spreadsheet = one-time data organization or reference (NOT ongoing tracking)
- Slide Deck = a presentation file
- Poster = a printable reference or wall display
- Document = a fillable form, contract, or long-form text
- Worksheet = a single-use activity sheet (especially for students)
- Lesson Plan = a teaching resource with activities

## Q2: DOMAIN — what would someone search for? (topic, pick 1-3, primary first)
Available: {{terms_topic}}

The first term you list is treated as the primary topic (used in URL/breadcrumb). For sports posts, the primary should usually be the sport itself (Football, Basketball, etc.); add Sports as secondary only if useful. Drill down to the most specific applicable term — don't pick both a parent and a child unless both add information.

## Q3: LEAGUE — only if the post is tied to a specific pro league (leagues, pick 0-2)
Available: {{terms_leagues}}

LEAVE EMPTY for generic brackets (any-league templates), multi-sport events (Olympics), or non-sports posts.

## Q4: INTENT — what job is the user trying to accomplish? (intent, pick 1-3)
Available: {{terms_intent}}

Definitions:
- Plan = prepare, schedule, or organize future activities
- Track = record and monitor ongoing data
- Compete = run or participate in competitions
- Manage = oversee operations, teams, or projects
- Analyze = review data, calculate, or evaluate
- Learn = understand concepts or acquire skills

## Q5: AUDIENCE — only if specifically designed for a professional role (audience, pick 0-2, DEFAULT EMPTY)
Available: {{terms_audience}}

Pick a term ONLY if the resource is explicitly built for that role's professional workflow — not just because the role might use it. Most resources are general-consumer; for those, output empty. Examples where audience IS appropriate: a Lesson Plan for `teachers`, a Tournament Director Run-of-Show for `tournament-directors`. Examples where audience is NOT appropriate: a generic NFL Draft Tracker (sports fans, not professionals).

## Q6: BRACKET SIZE — only if the resource-type is Bracket (bracket-size, pick exactly 1 if applicable)
Available: {{terms_bracket-size}}

Empty if the post is not a bracket.

## Q7: COMPETITION FORMAT — only if the post organizes a tournament (competition_format, pick exactly 1 if applicable)
Available: {{terms_competition_format}}

Empty if the post does not organize a competition.

# Output format

Output one line per taxonomy below. If nothing fits a taxonomy, output the slug followed by a colon and nothing else. Use the slugs exactly as written:

resource-type:
topic:
leagues:
intent:
audience:
bracket-size:
competition_format:

---TIMER---
timer_enabled: {{timer_enabled}}
timer_title: {{timer_title}}
timer_datetime: {{timer_datetime}}

---DOWNLOADS---
Use this EXACT format for each download section. The first section heading MUST follow the pattern "Download the [Post Title]".
Multiple sections are separated by a blank line. Each link is on its own line starting with "- ".

Format per section:
section: [Section Heading]
color: [hex color, e.g., #6366f1]
archive: yes|no
links:
- text: [Link Text] | format: [File Format] | type: link | url: [URL]

**Link text rule (default):** keep link text formulaic — `Download the [Format] version` (e.g. `Download the Google Sheet version`, `Download the Excel version`, `Download the PDF version`). Do NOT invent custom marketing copy. Custom link text is OPTIONAL — only use a custom phrase if the existing data already has one and you're preserving it. When in doubt, use the formulaic default.

Current data:
{{downloads}}

---CHANGELOG---
Use this EXACT format for changelog entries. Multiple entries are separated by a blank line.
Format per entry:
version: [version number]
date: [YYYY-MM-DD]
notes:
- [change description]

Current data:
{{changelog}}

---SEO---
seo_title: {{seo_title}}
seo_description: {{seo_description}}
seo_keywords: {{seo_keywords}}

---SOCIAL---
og_title: {{og_title}}
og_description: {{og_description}}
twitter_title: {{twitter_title}}
twitter_description: {{twitter_description}}

---END---
