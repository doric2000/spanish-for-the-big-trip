# סקירת פרויקט — 16.10.2026

סקירה של כל תיקיית SpanishForTrip: הקוד, מסד הנתונים, התכנון ותיעוד העבודה. השוויתי מול מדריכים רשמיים (Expo, Supabase, Apple, OWASP) ומול שיטות עבודה מקובלות. המקורות מופיעים בסוף.

## 1. תמונת מצב במספרים

| מה | כמות |
| --- | --- |
| קוד אפליקציה אמיתי (`mobile/`) | כ־430 שורות: מסך פתיחה, מעבדת הקלטה וקובץ עיצוב |
| קוד מנוע תוכן (`content/src`) | כ־730 שורות TypeScript ו־Zod |
| מיגרציות SQL | 3: courses/chapters, units, unit_revisions |
| בדיקות | 57 בתוכן ו־6 במובייל, כולן עוברות. `tsc` נקי |
| commits ב־Git | 4. רוב העבודה מאז לא נשמרה: `content/`, `supabase/`, `assets/`, `mobile/src/` |
| תיעוד עבודה ב־`.codex-review/` | כ־760KB של JSON. יומן הלמידה לבד 246KB, `work-plan.json` 67KB |
| קובצי הוראות לסוכנים | 4 פעילים ו־4 עותקי ארכיון, רובם חוזרים על אותם כללים |

**המסקנה המרכזית:** יש הרבה יותר תכנון ותיעוד מאשר מוצר עובד. עדיין אין משתמש שנכנס לאפליקציה, ואין שרת או נתון שעובר מהמסד למסך. החלקים המסוכנים ביותר נדחו לסוף: כניסה עם Apple/Google, בנייה עצמאית ודרישות App Store.

## 2. מה נעשה טוב (חשוב לראיונות)

- **חוזה תוכן עם Zod:** סכמה קשיחה (`strictObject`), מזהים יציבים ובדיקות. זה בסיס נכון.
- **הפרדה בין נתוני הכתיבה לבין מה שנשלח ללומד:** `projectActivity` בונה רשימה מפורשת של שדות מותרים (allowlist), ולכן התשובות הנכונות לא דולפות ללקוח. זו חשיבה אבטחתית נכונה.
- **Idempotency:** הבקשה כוללת `requestId` ו־`expectedProgressVersion`. כך שליחה כפולה לא נספרת פעמיים, ועדכון מקביל לא דורס עדכון אחר.
- **המיגרציות סוגרות גישה כברירת מחדל:** `enable row level security`, ואחריו `revoke all from anon, authenticated`. זה בדיוק מה שהמדריך של Supabase דורש.
- **`.gitignore`:** מכסה קובצי `.env`, מפתחות חתימה (`.p8`, `.p12`) ו־`.temp` של Supabase.
- **מדיה:** רק קבצים במצב `approved` מוצגים.

כלומר, הבעיה איננה איכות הקוד שנכתב. הבעיה היא **סדר העבודה, החלקים החסרים והתקורה**.

## 3. לתקן עכשיו (P0, לפני כל צעד נוסף)

### 3.1 אין גיבוי ואין היסטוריה לרוב העבודה
- תיקיית העבודה `SpanishForTrip/` (כולל `.codex-review`, `AGENTS.md` ותוכנית הלימוד) **איננה מאגר Git בכלל**. במקום Git יש עותקי "archive" ידניים.
- למאגר המוצר אין remote. אם הדיסק נפגע, הכול אובד.
- מיגרציות שכבר הוחלו על מסד הענן לא נשמרו ב־Git. כלומר, מצב המסד בענן לא משוחזר מהקוד.

**תיקון:** לשמור את העבודה ב־commits קטנים ולפי נושא (תוכן, Supabase, מובייל, נכסים). אחר כך ליצור מאגר **פרטי** ב־GitHub ולדחוף אליו. בנוסף צריך להחליט איפה ישבו מסמכי התכנון: להעביר את החיוניים ל־`docs/` בתוך המאגר, או להפוך גם את תיקיית העבודה למאגר.

### 3.2 מיגרציית `unit_revisions`: תיקון לממצא
**עדכון באותו יום:** בזמן הסקירה הקובץ `supabase/migrations/20261016091112_create_unit_revisions.sql` היה ריק (0 בתים, 12:11). דקה אחר כך (12:12) הוא נכתב במלואו, יחד עם `checks/03_unit_revisions.sql`, כנראה בידי סוכן אחר שעבד במקביל. הממצא "מיגרציה ריקה" כבר לא נכון. המיגרציה עצמה כתובה היטב: RLS, `revoke`, טריגר שחוסם שינוי בגרסה שפורסמה, ופונקציה בסכמה `private` עם `search_path` ריק.

**מה כן נשאר:**
- לפני `db push` להריץ `npx supabase migration list`, כדי לוודא שההיסטוריה המקומית תואמת לענן.
- הלקח: שני סוכנים שעובדים במקביל על אותה תיקייה יוצרים מצבי ביניים. עובדים עם סוכן אחד בכל פעם, או בענפים נפרדים.

### 3.3 סתירות בהוראות (טופל בסקירה הזו, ראו סעיף 8)
לפי ההוראה בשורש, תוכנית הלימוד היא v4. לפי ההוראה במאגר היא v3. ב־`mobile/AGENTS.md` נכתב שיש להשתמש ב־Expo Router, בזמן ש־`toolchain.json` בחר React Navigation. באותו קובץ גם נשאר "שלב 02 מוכן לפתיחה". מקור הסתירות הוא סקריפטי Python (`adopt_*.py`) שמחליפים מחרוזות בכמה קבצים. כשמחרוזת לא נמצאת בקובץ אחד, הוא נשאר מאחור בשקט.

## 4. סדר הבנייה: מה השתבש

הסדר שנבחר הוא "שכבה אחרי שכבה":

```
01 סביבה → 02 תכנון ו־Figma → 03 חוזה תוכן → 04 מסד → 05 התחברות ושרת → 06 יחידה → 07 עיצוב → 08 פריסה → 09 משתמשים
```

זה מודל Waterfall. השיטה המקובלת היא **Walking Skeleton** (Cockburn, ובספר *Growing Object-Oriented Software*): קודם בונים את הפרוסה הדקה ביותר שעוברת **בכל השכבות** ונפרסת באמת, ורק אחר כך מעבים. הסיבה היא שרוב הכאב מגיע מנקודות החיבור: הרשאות, מפתחות, חתימה ורשת. כשמגלים אותן מוקדם, הן זולות לתיקון.

מה זה אומר אצלנו:

| מה נעשה מוקדם מדי | מה נדחה ומסוכן |
| --- | --- |
| חוזה עם 9 תבניות תרגיל, שערי פרסום לפרקים, manifests ו־digest. כל זה לפני שיש משתמש אחד | כניסה עם Apple/Google. דורשת Development Build, ולכן לא תעבוד ב־Expo Go |
| ניתוחי תוכנית לימוד, סימולציית מטייל, 57 יחידות במתווה | בנייה חתומה ב־EAS והתקנה על האייפון |
| Figma לכל מצב | פריסת שרת ובדיקת תנאי Vercel Hobby |
| ניסויי הערכת הגייה ב־Azure (נדחו בסוף) | דרישות App Store: מחיקת חשבון, מדיניות פרטיות, Privacy Manifest |

**הסדר המומלץ מכאן:**

1. **שלד מהלך (שבוע 1):** Development Build באייפון ← כניסה עם Apple ← session של Supabase שנשמר מאובטח ← קריאת שורה אחת מהמסד דרך RLS ← שמירת התקדמות של פעילות אחת ← הצגה במסך. גם אם המסך מכוער.
2. **צינור אוטומטי:** CI שמריץ typecheck, בדיקות ו־lint על כל push. תוך כדי, בנייה מסוג preview ב־EAS.
3. **רק אחר כך** מעבים: עוד סוגי תרגילים, ואז 1A מלאה, ואז פרק 1.
4. דרישות App Store נכנסות כבר בשלד: מחיקת חשבון, פרטיות ו־Google לצד Apple.

## 5. אבטחה: מה חסר

כל הסעיפים האלה **לא מופיעים בתכנון בכלל**. חיפשתי בכל קובצי `.codex-review` מחיקת חשבון, מדיניות פרטיות, SecureStore, rate limit, CI ו־lint. אין אף התאמה.

### אחסון והתחברות במובייל (OWASP MASVS-STORAGE / MASVS-AUTH)
- **אחסון session:** טוקנים לא נשמרים ב־AsyncStorage, כי זה קובץ לא מוצפן. צריך להשתמש ב־`expo-secure-store` (Keychain), או בשיטה שהמדריך של Expo ו־Supabase ממליץ עליה, ולוודא שהיא מוצפנת.
- **כניסה עם Apple:** משתמשים ב־`expo-apple-authentication` וב־`signInWithIdToken`, עם **nonce** (מחרוזת אקראית חד־פעמית שמונעת שימוש חוזר בטוקן).
- **כניסה עם Google:** ספרייה נייטיבית, ולכן היא דורשת Development Build. זה עוד נימוק להקדים את הבנייה.
- **מחיקת חשבון בתוך האפליקציה:** חובה לפי Apple, סעיף 5.1.1(v). למשתמשי Apple צריך גם לבטל את הטוקן מול Apple בעת המחיקה. בתכנון המסד זה אומר שכל טבלת משתמש מוגדרת עם `on delete cascade` מ־`auth.users`.
- **הלוגים:** לא כותבים ללוג טוקנים או מידע אישי. ב־`audio-lab.tsx` יש היום `console.warn` עם השגיאה, וזה בסדר. צריך כלל שמונע כתיבה של טוקנים ומידע אישי בהמשך.

### Supabase
- לעבור למפתחות החדשים, **publishable/secret**, ולמפתחות חתימה אסימטריים (JWT Signing Keys). המפתחות הישנים (`anon`/`service_role`) תקפים ל־10 שנים, וקשה לסובב אותם.
- **השרת (NestJS) מאמת את ה־JWT מול JWKS**. הוא לא מקבל `userId` מגוף הבקשה. החוזה הנוכחי כבר מנוסח כך, וזה טוב.
- **הגנה בשכבות:** ש־NestJS משתמש ב־`service_role` זה עוקף את RLS. אז כל ההרשאות תלויות בקוד השרת. גם כשהשרת הוא הדרך הראשית, כדאי לכתוב מדיניות RLS לטבלאות משתמש (`user_id = auth.uid()`). ככה באג בשרת לא חושף נתונים של משתמשים אחרים.
- להריץ את **Security Advisor** בדשבורד אחרי כל מיגרציה, ולהפעיל MFA בחשבונות Supabase, Expo, Apple ו־GitHub.
- להפריד בין פרויקט dev לפרויקט prod (Expo ממליצה על פרויקט Supabase נפרד לכל סביבה).

### שרת API (כשייבנה)
- הגבלת קצב (`@nestjs/throttler`), `helmet` והגבלת גודל גוף הבקשה.
- תשובות שגיאה בלי stack trace.
- אימות קלט עם אותן סכמות Zod.
- לוגים מובנים בלי מידע אישי.

### שרשרת אספקה וסודות
- Dependabot או Renovate, ו־`npm audit` ב־CI. ההתראות על `braces`, `node-forge` ו־`uuid` משנת 14.10 נבדקו פעם אחת בלבד.
- Secret scanning ו־push protection ב־GitHub, ואפשר להוסיף gitleaks כ־pre-commit.
- `EXPO_PUBLIC_*` גלוי לכל מי שמוריד את האפליקציה. מותר לשים בו רק URL ומפתח publishable.

### App Store ופרטיות
- כתובת מדיניות פרטיות, ותוויות App Privacy ב־App Store Connect.
- הגדרת `privacyManifests` ב־`app.json`.
- `supportsTablet: true` מחייב צילומי מסך ל־iPad ובדיקת התנהגות ב־iPad. כדאי לשקול `false` לגרסה הראשונה.

## 6. ארכיטקטורה: שאלות שכדאי להכריע עכשיו

1. **NestJS וגם Supabase, שני Backends.** Supabase כבר נותן התחברות, מסד, RLS ופונקציות. לגרסה ראשונה אפשר לוותר על השרת: האפליקציה מדברת ישירות עם Supabase, ההרשאות ב־RLS, ולוגיקת ההתקדמות בפונקציית Postgres (RPC).
   - **בעד NestJS:** ערך לראיונות, ושליטה בלוגיקה.
   - **נגד:** עוד שכבה לפרוס, לאבטח ולתחזק, ועוד cold starts ב־Vercel.
   - **ההמלצה שלי:** אם הלמידה של NestJS חשובה לדור, להשאיר אותו **דק**: נקודת קצה אחת ל־`attempt`, אימות JWKS, וגם RLS כהגנה. אחרת, לוותר עליו בגרסה הראשונה.
2. **Vercel Hobby** מיועד לשימוש **לא מסחרי**. אפליקציה ציבורית ב־App Store היא שטח אפור. צריך לבדוק לפני השקה, או לשקול Supabase Edge Functions.
3. **Monorepo בלי workspaces:** המובייל מייבא `../../../content/...` עם הגדרת Metro ידנית, ויש שלושה קובצי lock נפרדים. Expo תומכת ב־npm workspaces ומגדירה את Metro לבד. **המלצה:** `workspaces: ["mobile", "content"]` בשורש, ו־import לפי שם חבילה.
4. **מדיה מקודדת ידנית:** `opening-preview.tsx` מכיל `require` קבוע לתמונה אחת ולשמע אחד. הוא לא נבנה מתוך הנתונים, ויישבר בתרגיל השני. **המלצה:** manifest נכסים שנוצר אוטומטית מתוך `media[]`. בפרודקשן אלה יהיו URLs חתומים מ־Supabase Storage.
5. **ניווט:** עדיין לא נבחר. צריך להכריע לפני המסך השני. Expo Router הוא ברירת המחדל של Expo היום.

## 7. הנדסה בסיסית שחסרה

| חסר | למה חשוב | פעולה |
| --- | --- | --- |
| ESLint ו־Prettier | אחידות ותפיסת באגים | `npx expo lint` |
| CI (GitHub Actions) | אף שינוי לא נכנס שבור | typecheck, test ו־lint על כל push |
| סקריפט בדיקות במובייל | היום צריך לזכור `node --test tests/*.cjs` | `"test"` ב־`package.json` |
| jest-expo ו־RNTL | בדיקות רכיבים במקום טריק `vm` | בצעד המסכים הבא |
| Error Boundary וניטור קריסות (Sentry) | לדעת כשמשהו נשבר אצל משתמש | לפני פיילוט |
| תצורת סביבות (`app.config.ts`, dev/preview/prod) | בלי סודות בקוד ובלי ערבוב סביבות | עם חיבור Supabase |
| עבודה בענפים ו־PR, גם לבד | היסטוריה נקייה, סקירה, CI | מהיום |

## 8. תקורת התיעוד: הלקח הגדול לפעם הבאה

- **README שמספר היסטוריה:** "דור שינה את הרקע לוורוד…", "הניסיון הראשון נעצר בגלל indent-string…". README צריך לענות על שלוש שאלות: מה זה, איך מריצים, ואיך זה בנוי. היסטוריה שייכת ל־Git וליומן.
- **אותו פסקה בכמה קבצים:** הסקשן "Sequential complete opening chapters" הודבק זהה לשני קובצי AGENTS, ו־`DEVELOPMENT_GUIDE.md` קיים בשני עותקים כמעט זהים. כל שינוי דורש לעדכן כמה מקומות, ובפועל זה מייצר סתירות.
- **ארכיונים ידניים במקום Git:** חמש תיקיות `archive/before-…` עם עותקי מסמכים.
- **מסמכי סטטוס ענקיים:** 67KB של `work-plan.json` ו־246KB יומן. סוכן חדש צריך לקרוא מאות KB לפני שהוא כותב שורת קוד, וזה מאט כל צ'אט.

**מה עושים במקום:**
- **החלטות כ־ADR:** קובץ markdown קצר לכל החלטה ב־`docs/adr/0001-supabase.md`, עם הקשר, החלטה וחלופות. זה פורמט מוכר בראיונות.
- **סטטוס במקום אחד בלבד:** GitHub Issues/Projects, או `STATUS.md` קצר.
- **יומן למידה:** markdown תמציתי לכל יום, עם מה עשיתי, מה למדתי ומה לא ברור, ובלי ציטוטי פלט ארוכים.
- **לבטל את סקריפטי ה־adopt:** עורכים קובץ אחד ישירות.

**מה כבר תיקנתי בסקירה הזו:**
- `../AGENTS.md` הוא עכשיו **מקור יחיד**. הכללים קובצו והוסרו מהם כפילויות, סתירת v3/v4 תוקנה, והוא מנוסח לכל סוכן (Codex/Claude).
- הוספתי ל־`../AGENTS.md` סעיף אבטחה קצר. הוא חדש ודורש את אישור דור: RLS בכל טבלה חדשה, מפתחות ציבוריים בלבד באפליקציה, ומשתמש מזוהה לפי הטוקן.
- `AGENTS.md` במאגר הפך למצביע קצר.
- `mobile/AGENTS.md` מכיל עכשיו רק כללים טכניים. הסטטוס הישן הוסר, וסתירת הניווט מסומנת כהחלטה פתוחה.
- גיבוי של שלושת הקבצים הקודמים נשמר ב־`../.codex-review/archive/before-agents-consolidation-2026-10-16/`.

**נשאר לטפל:** שני העותקים של `DEVELOPMENT_GUIDE.md`, ה־README הארוך, וסקריפטי ה־`adopt_*.py`. הסקריפטים מחפשים מחרוזות שכבר לא קיימות, ולכן הרצה חוזרת שלהם לא תעשה כלום.

## 9. תוכנית תיקון מוצעת

| # | פעולה | מי |
| --- | --- | --- |
| 1 | לשמור את כל העבודה ב־commits קטנים ולדחוף ל־GitHub פרטי | דור (Git), הסוכן מסביר |
| 2 | לבדוק `supabase migration list` מול הענן לפני `db push` | דור מריץ, הסוכן מסביר |
| 3 | להכריע: NestJS דק או Supabase ישיר; ניווט; workspaces | החלטה משותפת |
| 4 | ESLint, סקריפט test במובייל ו־CI ב־GitHub Actions | הסוכן כותב, דור מפעיל ב־GitHub |
| 5 | שלד מהלך: Development Build, Apple Sign-In, SecureStore, קריאה דרך RLS ושמירת התקדמות אחת | משותף |
| 6 | טבלאות משתמש עם RLS ו־cascade, ומסך מחיקת חשבון | הסוכן כותב, דור בודק במכשיר |
| 7 | Google Sign-In, מדיניות פרטיות ו־Privacy Manifest | משותף |
| 8 | רק אחר כך: להמשיך את 1A, ואז פרק 1 | לפי התוכנית הקיימת |

## 10. לפעם הבאה: עקרונות

1. **שלד מהלך לפני עובי:** פרוסה אחת מקצה לקצה, פרוסה ו־CI כבר בשבוע הראשון.
2. **הסיכון הגדול קודם:** התחברות, בנייה, חנות ותשלום מוקדם. תוכן והרחבות אחר כך.
3. **אבטחה כדרישה מהיום הראשון:** רשימה קצרה לפי MASVS ו־Supabase בתחילת הפרויקט, ולא בשלב 08.
4. **Git מהדקה הראשונה, עם remote.** Commit קטן אחרי כל צעד שעובד.
5. **תיעוד רזה:** README, ADRs ומקור אמת אחד לסטטוס. לא מעתיקים פסקאות.
6. **YAGNI (You Aren't Gonna Need It):** לא בונים שערי פרסום לפרקים לפני שיש משתמש ראשון.
7. **להשתמש ב־Skills רשמיים:** `expo/skills` (כבר מותקן חלקית) ו־Supabase. גם `/security-review` לפני כל merge.

## מקורות

- [Walking Skeleton — Matt Blodgett (מצטט את GOOS)](https://www.mattblodgett.com/2020/09/start-with-walking-skeleton.html), [Henrico Dolfing](https://henricodolfing.com/2018/04/start-your-project-with-walking-skeleton.html), [Xebia](https://xebia.com/blog/the-technical-walking-skeleton/)
- [Expo — Using Supabase](https://docs.expo.dev/guides/using-supabase/), [Expo — Environment variables](https://docs.expo.dev/guides/environment-variables/), [Expo — Monorepos](https://docs.expo.dev/guides/monorepos/), [Expo Skills](https://docs.expo.dev/skills/)
- [Supabase — Production Checklist](https://supabase.com/docs/guides/deployment/going-into-prod), [Supabase — Login with Apple](https://supabase.com/docs/guides/auth/social-login/auth-apple), [Supabase — Login with Google](https://supabase.com/docs/guides/auth/social-login/auth-google), [Supabase — JWT Signing Keys](https://supabase.com/docs/guides/auth/signing-keys), [Supabase — native mobile auth](https://supabase.com/blog/native-mobile-auth)
- [Apple — 5.1.1(v) Account deletion](https://developer.apple.com/help/app-review/guideline-reference/5-1-1-account-deletion)
- [OWASP MAS (MASVS/MASTG)](https://mas.owasp.org/)
- [Vercel — NestJS](https://vercel.com/docs/frameworks/backend/nestjs)
