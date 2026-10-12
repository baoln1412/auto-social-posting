# Reel rules

Rules for anything that draws on the reel: `deploy/make-reel.py`'s output, the overlay pass
beside it, and the stills that claim to preview both.

Each entry is a **rule** (one sentence you can act on), the **case** that bought it, and a
**check** you can actually run. A rule with no case is marked `inherited`. It came from
reading someone else's work; we have not paid for it ourselves yet.

Numbers are permanent. Append, never renumber, never reuse. Breaking a rule on purpose is
allowed and has to be written down next to the code that breaks it, naming the number.

Prefixes: **N** nhịp (timing), **H** hình (picture), **C** chữ (Vietnamese type),
**Â** âm (sound), **Q** quy trình (how to work on this).

---

## N · Timing

### N1. Nothing in the middle band opens before the inset has left
**Rule:** every overlay scheduled into the middle of the frame starts at or after
`INSET_SEC`.
**Case:** the inset card spans roughly 106 to 942px until 11s. A figure placed under it is a
figure nobody sees, so `sceneWindow` floors every window at `INSET_SEC` rather than trusting
the scene's own start time.
**Check:** for each timed overlay, is the `enable` start ≥ `INSET_SEC`, or does it belong to
a window that provably cannot overlap the inset's?

### N2. A layer that cannot finish arriving is dropped, not squeezed
**Rule:** a timed overlay holds for at least `MIN_HOLD` (1.5s), and a staggered layer is
only emitted while `delay + MIDDLE_RISE < room`.
**Case:** 2026-10-12. A three-box chain in a 0.6s window put box two on screen 0.1s before
the window shut. That is a flicker, not a box. `flowBeats(room)` now returns one beat there.
**Check:** `until − from ≥ MIN_HOLD` for every window, and every stagger has room to land.

### N3. One tenant in the middle band, scheduled in sequence
**Rule:** the figure, the quote and the chain are scheduled one after another, each starting
no earlier than the last one ended, never computed independently.
**Case:** 2026-10-12. Two scenes that both end before 11s both clamp to `INSET_SEC`, so
independent windows put two objects on the same pixels. `fillWindows` carries a floor
forward for exactly this.
**Check:** sort the windows by `from`. Does any `from` precede the previous `until`?

### N4. Motion is eased, and a batch accelerates
**Rule:** nothing appears instantaneously and nothing moves at constant speed; a group of
similar elements enters on beats that get shorter.
**Case:** 2026-10-12, caught against `video-shotcraft`'s own case file. Six separate rounds
of user feedback there said *slow down* and not one said *too fast*, and constant-velocity
motion is logged as the tell of a composited frame. Our quote and chain cards popped in
until that was read.
**Check:** does any overlay's position jump, or move linearly? Does a staggered group use an
even cadence?

### N5. Whole-frame beat impacts are rationed (`inherited`)
**Rule:** if the reel ever beat-syncs its bed, impacts on the whole frame (scale pumps,
shakes, flash frames) stay ≤3 per reel and ≥16 beats apart; everything else on a beat moves
only the element layer.
**Case:** none here; we do not beat-sync. Taken from `video-shotcraft` R4, where mapping
every kick onto the camera layer read as the picture shaking.
**Check:** n/a until a bed drives anything visual.

---

## H · Picture

### H1. Geometry has one home
**Rule:** every position an overlay uses is defined in `lib/studio/steps/filters.ts` and
read from there by both the ffmpeg chain and the still renderer.
**Case:** `cardBox` is read by `layoutAt` (ffmpeg), `scenePlate` (sharp) and the fidelity
gate. The drag handles land on the card because they read those same numbers.
**Check:** does any new overlay compute a coordinate outside `filters.ts`?

### H2. The pen scales with the frame
**Rule:** the brand's 2.5px outline and `4px 4px 0` shadow are CSS pixels. On a 1080-wide
frame shown at roughly 390pt, multiply by about 2.8: `PEN_W = 7`, `DROP = 11`.
**Case:** 2026-10-12. The first quote and chain cards used the literal brand values and
rendered as flat white rectangles, which is the "flat admin theme" the brand file
warns against.
**Check:** view the frame at phone size. Is the outline visible? Is the shadow a solid
displaced copy, or a hairline?

### H3. Measure the shipped art, never hand-measure a constant
**Rule:** a geometry constant taken from an image is derived by a script that reads that
image, and the script is committed.
**Case:** commit `fd45d6f` redrew the mascot and moved the badge to (848, 29) 203×177. A
hand-measured constant still pointed at the old spot and nothing failed.
`deploy/split-card-overlay.py` derives it now, and a test measures the shipped file.
**Check:** could this number go stale if someone redrew the art, with no test going red?

### H4. One figure per reel
**Rule:** at most one big-number card, chosen across the whole script by weight rather than
taken from the first line that has a digit.
**Case:** measured off `ainius-2.mp4`, which shows exactly one. A reel that opens "3 hiệp
hội cảnh báo" and later says "12.000 đô một tấn" has to show the second.
**Check:** does the script's heaviest figure win, or the earliest?

### H5. Refuse rather than show something clumsy
**Rule:** every extractor returns null liberally. A gate that fires on a third of scripts
and is always right beats one that fires always and is sometimes embarrassing.
**Case:** `weigh()` rejects a figure five different ways; `boxLabel` refuses a clause over
40 characters instead of truncating it mid-meaning.
**Check:** for each new extractor, what is the worst thing it can put on screen, and is
there a gate that stops it?

### H6. No article photo means blur the card, not fill with colour
**Rule:** the bed always comes from a picture. With no article photo, blur the card.
**Case:** `backdrop()`. A flat colour behind the typography is the one thing that looks
worse than a blurred photo.
**Check:** is there any path where the bed is a solid fill?

### H7. `alpha` is not an expression; x and y are
**Rule:** fade an overlay by putting a `fade` filter on the image's own timeline. To move
one, write an expression into `overlay`'s x or y.
**Case:** ffmpeg rejects `alpha='min(…)'` outright. `outroAt` documents this and is a
hard cut because of it. `stickerAt` and `middleAt` both ease position instead.
**Check:** is this effect reachable through position? If it needs opacity, it needs a second
filter and a looped input.

### H8. Objects that take turns in one place wear one look
**Rule:** overlays that share a band share their construction: the same pen, the same hard
shadow, the same corner radius family.
**Case:** 2026-10-12. The figure card shipped as a flat yellow rectangle while the quote and
the chain carried the pen outline and offset shadow. Taking turns in the same band, they
read as two different products rather than two beats of one.
**Check:** put every tenant of a band side by side. Could a viewer tell they came from the
same tool?

---

## C · Vietnamese type

### C1. The separators are inverted
**Rule:** a dot is thousands and a comma is decimals. `29.710` and `6,92` must survive in
both directions, including through a regex and an SVG.
**Case:** `lib/studio/steps/numbers.ts`. Normalising either one to the English convention
changes what the figure means.
**Check:** round-trip a figure with each separator through the renderer.

### C2. Magnitude is a word, not zeros
**Rule:** `nghìn`, `ngàn`, `triệu`, `tỷ`, `tỉ` stay attached to the figure, and weighing a
figure multiplies by them.
**Case:** `SCALE` in `numbers.ts`. "6 tỷ" sorted as 6 loses to "500" without this.
**Check:** does the comparison treat a magnitude word as part of the number?

### C3. A bare four-digit number is a date
**Rule:** an unqualified 19xx/20xx is rejected, and so is any bare integer under 1000.
**Case:** `weigh()` returns −1 for both. "có hiệu lực từ năm 2026" is not a headline figure
and "3 hiệp hội" is a detail of a sentence.
**Check:** feed the extractor a sentence containing only a year. Does it stay quiet?

### C4. Never split on `nên`
**Rule:** `nên` is excluded from the causal connectives. So is `buộc`.
**Case:** 2026-10-12. `nên` is "therefore" and "should" in the same three letters, so
"Bạn nên kiểm tra lại hồ sơ" would be diagrammed as a cause and an effect.
**Check:** for each connective added, is there a common sentence where it means something
else?

### C5. A pull-quote needs a speaker
**Rule:** quoted text is only lifted onto a card when an attribution can be found before or
after it.
**Case:** 2026-10-12. `Họ gọi đó là "giải pháp"` is a scare quote. The rule has a second
job: the attribution is the information the karaoke band does not carry, so requiring it is
what stops the card being the caption set twice.
**Check:** would this card tell the viewer anything the caption does not?

### C6. Probe every font file for Vietnamese
**Rule:** before a face ships, render `ễệờựỹĐđắẳộ` with it and check the glyphs exist.
**Case:** Bebas Neue and Archivo Black were dropped for having no Vietnamese. Nothing errors
when a glyph is missing; PIL draws `.notdef`. Fredoka, the logo face, falls back on `Ổ`.
**Check:** does `deploy/fetch-fonts.py` probe this file?

### C7. Fetch fonts from the repo, and instance the variable ones
**Rule:** pull faces from `github.com/google/fonts`, and run a variable file through
`instancer.instantiateVariableFont` for the weight you want.
**Case:** `fonts.google.com` serves woff2 to every user agent, which fails as
"bad sfntVersion". A variable file used as-is renders Regular, so the mark came out Light.
**Check:** is the shipped file static, and at the intended weight?

---

## Â · Sound

### Â1. One `amix`, never two
**Rule:** the bed and the transition sounds join the narration in a single mix stage.
**Case:** `buildChain`. A second `amix` re-levels the first one's output, so the voice ducks
under its own whooshes.
**Check:** count the `amix` filters in the graph.

### Â2. A bed never starts at full level
**Rule:** fade in and out over `min(2, duration / 4)` seconds.
**Case:** `musicLeg`. Full level on frame one reads as a mistake, and the fade has to shorten
on a short reel or it never reaches level at all.
**Check:** is the fade shorter than a quarter of the reel?

---

## Q · Working on this

### Q1. `deploy/make-reel.py` is not edited
**Rule:** everything new is composited beside it, in the overlay pass.
**Case:** it is the measured $0 path (local edge-tts, local whisper, local ffmpeg) and
`tests/unit/overlay.test.ts` pins its hash. *That guard is currently red:* commit `7619e69`
changed the file without updating the hash.
**Check:** does the hash test pass? If not, was the change deliberate and reviewed?

### Q2. A preview that lies is worse than no preview
**Rule:** the still composes **around** `make-reel.py`'s own caption PNG, never beside it,
and reads its overlay geometry from `filters.ts`.
**Case:** from the renderer's own docstring, "if this ever forks into its own drawing code, the
preview starts lying". The route is imported in-process rather than fetched over HTTP, which
also removes a base-URL guess and a Cloudflare Access page.
**Check:** is anything in the still drawn by code the reel does not use?

### Q3. Assert the filter string; prove the new expression once
**Rule:** `filters.ts` is pure so a filter can be asserted without rendering. Any *new*
expression syntax gets one real ffmpeg render proving the parser accepts it.
**Case:** a three-minute render is not a debugging tool, which is why the module was written
pure. But a typo in an expression only surfaces at render time, so the eased overlay has a
real render behind it.
**Check:** is this filter asserted as a string, and has ffmpeg been shown to parse it?

### Q4. A circular import surfaces as a wrong message, not a stack trace
**Rule:** keep leaf predicates in leaf modules.
**Case:** `demo/steps → reel → image → registry → demo/steps` reported "Bước image chưa có
engine cho kênh này" on channels that plainly had one. Fixed by extracting
`lib/studio/steps/is-demo.ts`.
**Check:** does this import pull a registry into a module the registry imports?

### Q5. An overlay failure never takes the run down
**Rule:** the overlay pass and the motion draft log and swallow.
**Case:** if the pass fails, the reel is still a finished reel. Losing a three-minute render
to a decoration is the wrong trade.
**Check:** can this throw past the caller?

### Q6. The owner sees timing before paying for it
**Rule:** anything whose correctness is a question about *when* gets a motion draft, not a
still.
**Case:** 2026-10-12. The still could not answer "does the card arrive too early" or "does
the quote collide with the figure", so timing mistakes survived several full renders.
`motionDraft` runs one ffmpeg pass over a still bed in seconds.
**Check:** is this control's effect visible in a still? If not, is it visible in the draft?

### Q7. A control shows its own range
**Rule:** a control that steps through a variable number of states says how many there are,
and does nothing visible when there is only one.
**Case:** 2026-10-12. The `Nền chữ` chip cycles through whatever the script put in the
middle band. The demo narration supplies one tenant, so every click after the first was a
silent no-op, indistinguishable from a broken button. `middleFills` is pure, so the browser
counts them itself and the chip reads `2/3` only when there is more than one.
**Check:** click this control twice on the quietest input you have. Can you tell the
difference between "nothing to change" and "broken"?
