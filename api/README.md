# שרת ה-API

שרת NestJS קטן שיושב בין האפליקציה ל-Supabase. הוא מאמת את המשתמש לפי ה-token, קורא את תוכן היחידה עם המפתח הסודי, ומחזיר ללומד רק את מה שמותר לו לראות (`projectUnit` מתוך `../content/`). החוזה המלא נמצא ב-[content/api-contract.json](../content/api-contract.json), ומצב העבודה ב-[work-plan.json#delivery](../docs/planning/work-plan.json).

## הרצה

הפקודות רצות ב-PowerShell מתוך `api\`.

```powershell
npm.cmd ci
npm.cmd run start:dev
npm.cmd test
npm.cmd run test:e2e
npm.cmd run build
npm.cmd run lint
```

- `start:dev` מפעיל את השרת בכתובת `http://localhost:3000` ומפעיל אותו מחדש בכל שמירה.
- `test` מריץ בדיקות יחידה (`src/**/*.spec.ts`), ו-`test:e2e` שולח בקשות HTTP אמיתיות לאפליקציה שרצה בזיכרון (`test/*.e2e-spec.ts`).
- התקנה חדשה (`npm install` ולא `npm ci`) קורסת ב-npm 10 בגלל באג. במקרה כזה יש להריץ `npx.cmd npm@11.21.1 install`.

- כל סקריפט בונה קודם את `../content` (סקריפטי `pre*`), כדי שהשרת ישתמש תמיד ב-`projectUnit` העדכני.

ערכים מקומיים, כמו המפתח הסודי של Supabase, נכנסים לקובץ `api/.env`. Git מתעלם מהקובץ, ואת הערכים לא מדביקים בצ'אט או במסמכים. התבנית נמצאת ב-[.env.example](.env.example).

## מבנה

- `src/main.ts`: נקודת הכניסה. טוענת את `.env`, יוצרת את האפליקציה ומאזינה לפורט.
- `src/config.ts` ו-`src/core.module.ts`: ההגדרות ולקוח Supabase אחד בצד השרת, שזמינים לכל המודולים.
- `src/auth/auth.guard.ts`: ה-Guard. בודק את ה-token מול Supabase ומחזיר 401 לפני שהבקשה מגיעה לקוד של הנתיב.
- `src/units/`: נקודת הגישה `GET /v1/units/:unitId`. ה-Controller מקבל את הבקשה, ה-Service מחליט מה מחזירים, וה-Repository הוא הקוד היחיד שקורא את `unit_revisions`.
- `src/request-log.middleware.ts`: שורת לוג אחת לכל בקשה (שיטה, נתיב, סטטוס, זמן), בלי כותרות ובלי token.
- `test/`: בדיקות e2e שמחליפות את Supabase בגרסה מזויפת, כך שהן לא צריכות רשת או מפתחות.
