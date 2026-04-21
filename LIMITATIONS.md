# Known Limitations

This document tracks all known limitations of the parsing and ingestion pipeline.
Update this file whenever a limitation is discovered or resolved.

---

## URL Fetching

### SSRF (Server-Side Request Forgery)
Private RFC-1918 IP ranges (10.x, 172.16–31.x, 192.168.x) and localhost are
blocked. However, DNS rebinding attacks are not guarded against — a hostname
that initially resolves to a public IP could be remapped to a private one after
validation. **Mitigation required before multi-tenant production deployment.**

### JavaScript-rendered pages
The fetcher uses `fetch()` which does not execute JavaScript. Single-page apps
or recipe sites that hydrate content client-side will return an empty shell.
Schema.org data injected via JS (not in static HTML) will not be found.
**Affected sites**: many modern recipe aggregators.
**Resolution**: headless browser (Playwright/Puppeteer) or third-party scraping API.

### Auth-gated content
URLs behind login walls or paywalls will return login pages, not recipe content.
The parser will likely return low confidence with `URL_NO_STRUCTURED_DATA`.

### Cloudflare / bot protection
Sites with aggressive bot detection may return 403 or a challenge page.
The User-Agent header used (`MealPlannerBot/1.0`) may be blocked.

### Response size cap
Responses larger than 5 MB are truncated. Very long recipe pages or sites that
embed large images/base64 data inline may be cut off. A `URL_FETCH_PARTIAL`
warning is issued when truncation occurs.

### Redirects
`fetch()` follows up to 20 redirects by default. Redirect chains longer than
20 hops will fail. Short-URL services (bit.ly, etc.) are followed correctly.

### Non-English content
The ingredient and instruction parsers are designed for English. Fractional
representations, unit names, and section headers in other languages will not
be recognised. `SECTION_DETECTION_FAILED` and low confidence will result.

---

## Schema.org / Structured Data

### Non-standard schema
Some sites emit `@type: "Recipe"` but use non-standard property names or nest
data in ways not covered by the parser. Manual review is always recommended.

### Multiple recipes on one page
Only the first Recipe node found in the JSON-LD graph is used. Pages that list
multiple recipes (e.g., variations) will only import the first one.

### Missing `recipeYield`
Many sites omit `recipeYield` or set it to a string like "serves a crowd".
When the number cannot be extracted, servings defaults to 2 and a
`MISSING_SERVINGS` warning is issued.

### HowToSection grouping
The schema.org `HowToSection` type (nested step groups) is flattened — section
headers within the instruction sequence are dropped.

---

## Ingredient Parsing

### Ambiguous quantities
Ranges ("1–2 cups") always take the lower bound. The raw text is preserved so
the user can see the original range.

### No-quantity ingredients
"Salt to taste", "Fresh herbs for garnish" — no quantity is extracted. These get
`INGREDIENT_NO_QUANTITY` warning and `confidence: 0.55` (name still extracted).

### Quantity without unit
"2 eggs", "3 garlic cloves" — parsed as quantity + name with no `unit`. The UI
should treat these as count-based items.

### Compound ingredients
"1 can (15 oz) diced tomatoes" — the `notes` field captures the parenthetical
`15 oz`, but the primary quantity is `1` (can). The canonical unit is `can`.
Volume-level aggregation with other tomato ingredients is not possible.

### Non-Latin fractions
Unicode fractions (½, ¼, ¾, ⅓, ⅔) are not currently parsed — only ASCII
fractions (1/2, 1/4). Raw text is preserved.
**Status**: fix planned.

### Ingredient normalisation
`findIngredientByName()` does exact-match lookup against the canonical Ingredient
table. If the ingredient database is sparse, most lines will have
`ingredientId: null`. Shopping list aggregation falls back to rawText grouping
in this case, which is less reliable.

### Adjectives absorbed into name
"Fresh lemon juice" and "lemon juice" may be stored as different canonical
ingredients if the Ingredient table doesn't have an alias for "fresh lemon juice".

---

## Instruction Parsing

### Single-paragraph recipes
If the instructions are one long paragraph with no numbered steps and no double
newlines, the entire block becomes a single step (stepNumber: 1).
`STEP_TOO_SHORT` is not fired in this case since the single step is long enough.

### Embedded timers
`durationMins` is extracted heuristically from phrases like "cook for 20 minutes".
It does not handle:
- Time ranges ("15–20 minutes" → null)
- Compound times without the word "for" ("bake 350°F 30 min" → null)
- Non-English time phrasing

### Numbered steps with sub-steps
"Step 3a / Step 3b" style sub-steps are not recognised. Each lettered line is
treated as a new top-level step.

---

## Unit Conversion

### Volume ↔ Weight (density-based conversion)
Converting "1 cup flour" to grams requires knowing the density of flour
(~120 g/cup). This is **not implemented**. When a shopping list has both volume
and weight measurements of the same ingredient, `totalQuantity` is set to `null`
and sources are shown individually. A `UNIT_CONVERSION_IMPOSSIBLE` warning is
issued in this case.

### Precision
Unit conversion round-trips through floating-point arithmetic. Results are
rounded to 3 significant figures (`roundQty()`). For baking recipes where
precision matters, users should verify scaled quantities.

### Unrecognised units
Units not in the `UNIT_MAP` (e.g. "stick", "knob", "splash") are stored as-is
and cannot be converted. Two "sticks of butter" from different recipes will be
aggregated correctly (same string), but "1 stick" and "½ cup" of butter will
produce `totalQuantity: null`.

---

## Confidence Scoring

### Ceiling effect from extraction method
The `baseConfidence` from the extraction method acts as a ceiling on the final
score. Even a perfectly parsed schema.org recipe is capped at `0.95` (not 1.0)
to communicate that automated parsing always warrants review.

### Title length heuristic
Titles shorter than 3 characters or longer than 120 are penalised. Some
legitimate recipe titles fall outside this range.

### Step count heuristic
A recipe with 1 step scores `0.4` for steps regardless of whether it is a
genuinely one-step recipe (e.g. "Mix all ingredients and serve").

---

## Ingestion Lifecycle

### No raw content editing via API
`rawContent` (the full HTML or paste) is stored but cannot be edited via API.
To correct raw input, the user must discard and re-ingest.

### Re-parse limitations
`POST /api/ingest/:id/reparse` re-parses from the stored `rawIngredients` +
`rawInstructions` sections (not the full `rawContent`). If the sections were
extracted incorrectly from a URL, re-parsing will not improve them.

### Draft expiry
Drafts are never automatically expired. Storage will grow without a cleanup job.
**Resolution needed**: scheduled job to discard drafts older than 30 days.

### Concurrency
No optimistic locking on ingestion status transitions. In theory two simultaneous
confirm requests could both succeed. **Fix**: `WHERE status = 'draft'` check
inside the transaction.
