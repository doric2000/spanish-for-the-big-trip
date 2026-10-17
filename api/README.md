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

ערכים מקומיים, כמו המפתח הסודי של Supabase, נכנסים לקובץ `api/.env`. Git מתעלם מהקובץ, ואת הערכים לא מדביקים בצ'אט או במסמכים.

## מבנה

- `src/main.ts`: נקודת הכניסה. יוצרת את האפליקציה ומאזינה לפורט.
- `src/app.module.ts`: המודול הראשי, שבו נרשמים ה-Controllers וה-Services.
- Controller מקבל את בקשת ה-HTTP. Service מכיל את הלוגיקה ואת הגישה ל-Supabase, ו-NestJS מזריק אותו ל-Controller.
