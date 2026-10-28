# Unit 1A image prompts (layered), 2026-10-28

Jobs file: `assets/tools/jobs-unit1a-v1.json` (11 jobs). Run with `node assets/tools/generate-image.mjs assets/tools/jobs-unit1a-v1.json [jobId ...]`. Nothing has been generated yet.

## Prompting rules adopted

| Rule | Why / source |
| --- | --- |
| Labeled sections in a fixed order: REFERENCES → subject (JUAN) → MOMENT → EXPRESSION → HANDS → FRAMING → LIGHT → BACKGROUND | The guides recommend scene, subject, details, constraints in short labeled segments for complex requests ([Image prompting][ip], [Cookbook][cb]) |
| Give every input image a number and a role ("Image 1 is the identity reference… Image 2: ONLY light and colour; do not draw the kitchen") | "Identify each input by number and purpose" ([Image prompting][ip], [Cookbook][cb]) |
| Restate the full identity and outfit in every pose job; do not rely on "same as before" | The guides say restating the preserve list on every request reduces drift; the API guide lists recurring-character consistency as a known limitation ([Cookbook][cb], [Image generation][ig]) |
| Tell the model **not** to copy the reference's expression, and give the expression its own section with physical cues (eyelid height, brow height and evenness, mouth closed or open, teeth) plus explicit negatives ("NOT raised, no smirk") | Our own test: "sleepy" came out as the reference sheet's raised-eyebrow smirk. The guides give no special expression rule; this follows their advice to describe visible details and gaze explicitly |
| State gaze direction relative to the frame ("down toward the lower LEFT of the image, not at the viewer") | The Cookbook's gaze example ("looking down at…, not at the camera") |
| Edits: "CHANGE ONLY … / KEEP EXACTLY …" with a list of the objects to keep | The guides' "change only X, keep everything else the same" pattern ([Image prompting][ip], [Cookbook][cb]) |
| Cutouts: `background: "transparent"` + PNG, prompt "single isolated figure on a fully transparent background", and forbid floor, shadow, backdrop, glow, vignette and a drawn checkerboard | From both guides: "A drawn checkerboard is not transparency"; check the alpha at hair, glass and edges ([Image prompting][ip], [Cookbook][cb]) |
| Light on each layer is named by direction and colour (kitchen: sun from the viewer's LEFT; common room: from the viewer's RIGHT), and the background is passed as a ref "for light only" | "Match lighting, shadows, and color temperature" for composites ([Cookbook][cb]); our test pose was neutrally lit |
| One shared framing spec for all poses: waist-up, cut at the bottom edge at belt height, hair 8% from the top, head ≈ 1/5 of the height, nothing touches the side or top edges | Keeps scale identical between layers. The guides note that exact placement is a weakness ([Image generation][ig]), so the spec uses simple, checkable proportions |
| Keep hands to a minimum: the free arm hangs "with the hand below the frame" | Fewer visible hands means fewer hand errors; every prompt asks for five-finger hands in `shared` |
| Canonical props are defined once in `shared` (Juan's mug, coffee pot, sugar jar, bucket hat), and the kitchen image is a ref wherever the pot appears | The same description each time, plus a visual reference, keeps props consistent |
| Quality: `medium` for backgrounds, edits and the prop; `high` for Juan poses | The guides say to compare medium and high for close-up portraits and identity-sensitive work, and to use `xhigh`/`max` only if a need is still unmet ([Image prompting][ip], [Cookbook][cb]). The medium kitchen test was already good |
| No `input_fidelity` parameter | GPT Image 2-class models always process inputs at high fidelity ([Image prompting][ip]) |

Sources: [ip]: https://developers.openai.com/api/docs/guides/image-prompting · [cb]: https://developers.openai.com/cookbook/examples/multimodal/image-gen-models-prompting-guide · [ig]: https://developers.openai.com/api/docs/guides/image-generation

[ip]: https://developers.openai.com/api/docs/guides/image-prompting
[cb]: https://developers.openai.com/cookbook/examples/multimodal/image-gen-models-prompting-guide
[ig]: https://developers.openai.com/api/docs/guides/image-generation

## Assets

Existing and kept: `assets/backgrounds/hostel-kitchen-morning-v1.png` (canonical pot and sugar jar), `assets/characters/juan/scenes/unit1a-entry-hostel-v1.png`.
Replaced: both test poses (full body, neutral light, smirk instead of sleepy, and two different mugs). The replacements are `juan-sleepy-empty-mug-v2` and `juan-holds-out-mug-v2`.

| Job | Output | Quality |
| --- | --- | --- |
| bg-kitchen-counter-clear | `assets/backgrounds/hostel-kitchen-counter-clear-v1.png` | medium |
| bg-kitchen-table-nook | `assets/backgrounds/hostel-kitchen-table-nook-v1.png` | medium |
| prop-learner-hand-holds-pot | `assets/props/learner-hand-holds-pot-v1.png` | medium |
| juan-sleepy-empty-mug-v2 | `assets/characters/juan/poses/juan-sleepy-empty-mug-v2.png` | high |
| juan-holds-out-mug-v2 | `…/poses/juan-holds-out-mug-v2.png` | high |
| juan-full-mug-thanks | `…/poses/juan-full-mug-thanks-v1.png` | high |
| juan-seated-coffee | `…/poses/juan-seated-coffee-v1.png` | high |
| bg-common-room-empty | `assets/backgrounds/hostel-common-room-morning-v1.png` | medium |
| juan-offers-pot | `…/poses/juan-offers-pot-v1.png` | high |
| juan-wave-hola | `…/poses/juan-wave-hola-v1.png` | high |
| juan-returns-hat | `…/poses/juan-returns-hat-v1.png` | high |

## Composition per screen

Crops. Scenario poster: wide strip, about 345×110 pt (≈3.1:1). Vocabulary poster: 338×256 pt with "Hola" drawn at 104 pt across its middle (`vocabulary-card-screen.tsx`). Entry poster: 328×286 pt. The dialogue (86:1186), speak (87:1543) and arrange (88:1844) templates have **no image slot yet** (speak: "no scene picture until 07.5"), so the crops for those screens are only proposals.

Composition rules: a pose's bottom cut sits on the counter's far edge in the kitchen (about y≈800 of 1024) or on the table's far edge in the nook. In the common room it runs out of the bottom of the frame. **Never mirror a pose**, because the bracelet must stay on Juan's right wrist. For the 3.1:1 strip, crop a band of about 1536×490 from the background (about y 330–820 in the kitchen) so that it includes Juan's head and the counter top.

| Screen / node | Background | Pose | Prop / note | Crop |
| --- | --- | --- | --- | --- |
| `1a-ending-scenario` · greeting | kitchen-morning-v1 (pot on trivet, sugar jar) | sleepy-empty-mug-v2, centre-right | — | strip |
| · offer-coffee | kitchen-counter-clear-v1 | holds-out-mug-v2, gaze lower left | learner-hand-holds-pot, lower left, arm out of the bottom edge | strip |
| · coffee-answer | kitchen-morning-v1 (pot back, sugar jar "next to you") | full-mug-thanks | — | strip |
| · sugar-answer (end) | kitchen-table-nook-v1 (untouched sugar jar, learner's sage mug) | seated-coffee, on the empty chair, cut at the table edge | — | strip |
| `u1a-dialogue` | common-room-morning-v1 | offers-pot | — | slot not designed yet |
| `u1a-vocab-hola` | common-room-morning-v1 | wave-hola, low/right so "Hola" does not cover his face | — | 338×256 |
| `1a-arrange-greeting` | reuse the Hola composition (no new job) | wave-hola | — | slot not designed yet |
| `1a-speak-thanks` | common-room-morning-v1 | returns-hat | — | slot not designed yet |
| `u1a-speak-decline` | common-room-morning-v1 (the glazed mug on the lower-left table serves as "your" mug) | offers-pot (reuse) | — | slot not designed yet |
| `u1a-entry` | existing `unit1a-entry-hostel-v1.png` | — | — | 328×286 |
| `1a-review-si`, `1a-review-no` | none proposed | — | the listen poster has no picture slot, and a nodding or head-shaking Juan would give away the answer | — |

## Skipped

- `1a-review-greet` (approved): needs the new unnamed "other traveler", who has no image yet and must not be shown as Juan.
- Not approved (`needs_review`): vocabulary cards Buenos días, Gracias, Sí, No, Café, Azúcar; `u1a-explain-question`; `u1a-primer-listen`; `u1a-check-offer`; `u1a-practice-listen`; `1a-summary`. Likely reuse once approved: check-offer → offers-pot; Café/Gracias → full-mug-thanks; primer-listen → the Hola composition. The rest would need new poses.

## Cost estimate

Measured medium cost: about 2.4¢ per image. The API guide's earlier-model tables price high at about 4× medium, and refs add input tokens, so assume about 9¢ per high pose.
4 medium × ~2.5¢ + 7 high × ~9¢ ≈ **$0.75**, or about $1 with a single retry of 2–3 assets. Suggested order: run `juan-sleepy-empty-mug-v2` alone first, check its expression, light and edges, then run the rest.
