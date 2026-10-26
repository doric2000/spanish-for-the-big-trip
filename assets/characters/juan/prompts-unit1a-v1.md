# תמונות יחידה 1A — prompts לאפליקציית Gemini

## איך מריצים

1. פותחים צ'אט **חדש** ב-Gemini ובוחרים בכלי "Create image".
2. מעלים שתי תמונות: `assets/characters/juan/juan-reference-v1.png` ו-`assets/characters/juan/scenes/unit1a-entry-hostel-v1.png`. שולחים איתן את **הודעת הפתיחה** בלי לשנות אותה.
3. שולחים את ה-prompts אחד אחרי השני, באותו צ'אט, לפי הסדר. כך Gemini זוכר את חואן ואת הסגנון.
4. מורידים כל תמונה ושומרים אותה ב-`assets/characters/juan/scenes/` בשם שכתוב ליד ה-prompt.
5. אם בתמונה יש טקסט, אצבעות משובשות, אנשים נוספים או חואן שונה (שיער, זקן, חולצה, צמיד), כותבים בצ'אט "Regenerate: <מה לא בסדר>". אם גם הניסיון השני לא טוב, מדלגים וממשיכים. אני אבדוק כל תמונה מול הרפרנס.

התרחיש (06.5) ראשון, כי זה הכרטיס הפעיל. כל ה-prompts באנגלית, כי ככה מודלי תמונות שומרים על הזהות הכי טוב.

## הודעת הפתיחה

```text
Image 1 is the identity and style reference for Juan, a recurring character in a Spanish-for-travel learning app. Image 2 is an approved scene showing the style and the hostel common room. I will ask for a series of scenes, one per message. Every image must follow these rules:

Juan: the same man as Image 1. Approachable 28-year-old traveler, warm medium tan skin, brown eyes, thick gently curved eyebrows, softly squared face, medium-length dark brown wavy hair swept back with one loose curl above his forehead, short neat dark beard and mustache. Outfit, always the same: plain terracotta overshirt with rolled sleeves over a cream crew-neck T-shirt, deep olive trousers, worn off-white sneakers, a narrow ochre woven bracelet on his RIGHT wrist. His forest-green canvas backpack with ochre zipper pulls appears only when stated.

Style: premium stylized 3D story illustration exactly like Image 2. Tactile fabric, sculpted forms, natural adult proportions, subtle expressive faces, soft warm cinematic light. Color harmony: terracotta, sage green, cream, natural wood. Not photorealistic, not flat vector, not childish.

Places: (A) the hostel common room from Image 2: arched window, cream textured walls, natural wood, leafy plants, sage-green accents. (B) the hostel kitchen in the same building and style: wooden counter, open shelves with mugs, a window with morning light, a small round wooden table.

Framing: landscape 16:9, rendered to the edges. The camera is the learner's point of view; the learner is never shown except a hand or forearm when stated (neutral cream sleeve). Keep Juan's head, face and any important hands and objects inside the central horizontal band, so the image can be cropped to a wide strip.

Always: Juan is the only person unless stated. Natural five-finger hands. No text, letters, numbers, labels, speech bubbles, UI, logos or watermarks.

Reply "Ready" and wait for my first scene.
```

## התרחיש המסכם (06.5) — `1a-ending-scenario`

**1. `unit1a-scenario-greeting-v1.png`** — צומת `greeting`

```text
Scene 1. Place B, the next morning, early soft light. Juan has just walked into the kitchen, still sleepy: slightly tousled hair, heavy eyelids, a small sleepy smile, holding an EMPTY mug loosely in one hand. He greets us with a small nod. A full glass coffee pot sits on the counter in the foreground near the camera, steam rising. Medium shot, Juan from the knees up.
```

**2. `unit1a-scenario-offer-coffee-v1.png`** — צומת `offer-coffee` (בלי דיבור, התמונה מספרת)

```text
Scene 2. Place B, same moment. Our hand holds the full coffee pot in the lower foreground. Juan stands across the counter; his eyes move from the coffee pot to his empty mug, which he holds up slightly, a hopeful, slightly sheepish look. No one is speaking. Medium close shot, Juan from the waist up; the coffee pot and his empty mug are both clearly visible.
```

**3. `unit1a-scenario-coffee-answer-v1.png`** — צומת `coffee-answer`

```text
Scene 3. Place B. We are pouring coffee from the pot into Juan's mug, which he holds out; our hand and the pot are in the foreground. Juan smiles warmly, more awake now. On the counter right next to us stands a small glass sugar jar with a spoon. Medium close shot; the pouring, Juan's face and the sugar jar are all visible.
```

**4. `unit1a-scenario-sugar-answer-v1.png`** — צומת `sugar-answer` (סוף)

```text
Scene 4. Place B. Juan sits relaxed at the small round wooden table with his mug of black coffee, the sugar jar untouched on the counter in the background. He has just politely declined sugar: one hand raised slightly, palm out, with a friendly smile, and he gestures with the mug toward the empty chair beside him, inviting us to sit. Warm, calm ending mood. Medium shot.
```

## השיחה עם חואן (06.2) — `u1a-dialogue`

**5. `unit1a-dialogue-greeting-v1.png`** — שורות 1–2

```text
Scene 5. Place A, first morning. Juan stands near the arched window and greets us with a warm smile and a small open-palm wave; his backpack is on his back. Medium shot from the waist up.
```

**6. `unit1a-dialogue-coffee-v1.png`** — שורות 3–4

```text
Scene 6. Place A, first morning, near a small coffee corner. Juan holds a glass coffee pot in one hand and an empty mug in the other, lifting the pot slightly toward us with raised eyebrows, offering coffee. No backpack. Medium shot from the waist up.
```

**7. `unit1a-dialogue-sugar-v1.png`** — שורות 5–6

```text
Scene 7. Place A. Juan holds a small glass sugar jar toward us with a spoon in it, eyebrows raised in an offering question. A full mug of coffee he just poured for us sits on a wooden table in the foreground. Medium shot from the waist up.
```

## כרטיסי המילים — `u1a-vocab-*`

לכל הכרטיסים: אותה מסגרת, כדי שייראו כמו סדרה.

**8. `unit1a-vocab-hola-v1.png`**

```text
Scene 8, vocabulary card series: plain warm ivory background with a soft shadow, Juan from the waist up, centered. Juan waves hello with a friendly open palm and a bright smile.
```

**9. `unit1a-vocab-buenos-dias-v1.png`**

```text
Scene 9, same vocabulary card framing as scene 8. Juan stretches one arm and smiles a fresh good-morning smile, holding a steaming mug; soft golden sunrise light on one side of the ivory background.
```

**10. `unit1a-vocab-gracias-v1.png`**

```text
Scene 10, same vocabulary card framing. Juan places his right hand on his chest and gives a small grateful nod with a warm smile; the bracelet is visible.
```

**11. `unit1a-vocab-si-v1.png`**

```text
Scene 11, same vocabulary card framing. Juan nods yes with a clear, happy smile and a thumbs-up.
```

**12. `unit1a-vocab-no-v1.png`**

```text
Scene 12, same vocabulary card framing. Juan politely says no: a gentle head shake, one hand raised with the palm out, a kind smile, not rude.
```

**13. `unit1a-vocab-cafe-v1.png`**

```text
Scene 13, same vocabulary card framing. Juan holds a steaming terracotta mug of coffee with both hands and enjoys the aroma, eyes half closed.
```

**14. `unit1a-vocab-azucar-v1.png`**

```text
Scene 14, same vocabulary card framing. Juan holds a small glass sugar jar and lifts a spoonful of white sugar, looking at it with a curious smile.
```

## הסבר ותרגולים

**15. `unit1a-explain-question-v1.png`** — `u1a-explain-question` (שאלה במילה אחת)

```text
Scene 15. Place A. Juan holds up the coffee pot in one hand and the sugar jar in the other, head tilted, eyebrows raised in a clearly questioning, inviting expression. Medium shot from the waist up.
```

**16. `unit1a-practice-sugar-decline-v1.png`** — `u1a-practice-listen` (מציעים לחואן סוכר)

```text
Scene 16. Place A. Our hand in the foreground offers Juan a sugar jar; Juan, holding his coffee mug, declines politely with a small raised palm and a friendly smile. Medium shot.
```

**17. `unit1a-speak-thanks-hat-v1.png`** — `1a-speak-thanks` (הכובע נופל)

```text
Scene 17. Place A. Juan bends slightly forward and hands us back a sage-green bucket hat that just fell, holding it out toward the camera with a helpful smile. Medium shot.
```

**18. `unit1a-speak-decline-more-coffee-v1.png`** — `u1a-speak-decline` (עוד קפה)

```text
Scene 18. Place A. Our nearly empty mug sits on the wooden table in the foreground. Juan stands holding the coffee pot, offering to pour a second cup, with a friendly questioning look. Medium shot.
```

## בלי תמונה חדשה

אלה משתמשים בתמונות מהרשימה, ואין צורך להריץ עבורם כלום:

| מסך | תמונה |
| --- | --- |
| `u1a-primer-listen` | `unit1a-vocab-hola-v1.png` |
| `u1a-check-offer` | `unit1a-dialogue-coffee-v1.png` |
| `1a-arrange-greeting` | `unit1a-dialogue-greeting-v1.png` |
| `1a-review-si`, `1a-review-no` | כרטיסי Sí ו-No |

`1a-review-greet` מדבר על "עוד מטייל". מטייל כזה הוא דמות חדשה, ולכן הוא יחכה להחלטה נפרדת.
