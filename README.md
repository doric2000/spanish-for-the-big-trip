# ספרדית לטיול הגדול

**לומדים מה שצריך לטיול, בתרגולים קצרים וממוקדים.**

אפליקציית אייפון לדוברי עברית, שמלמדת להבין ולענות בספרדית במצבים מעשיים בטיול. היעד הראשון הוא יחידה 1A מלאה. אחריה מגיע פרק 1 כולו, ואחריו פרק 2.

- **מצב נוכחי וצעד הבא:** [docs/planning/work-plan.json](docs/planning/work-plan.json), תחת `delivery`
- **דרך העבודה המשותפת:** [docs/DEVELOPMENT_GUIDE.md](docs/DEVELOPMENT_GUIDE.md)
- **הוראות לסוכנים:** [AGENTS.md](AGENTS.md)
- **כל התיעוד:** [docs/](docs/README.md)

## טכנולוגיות

| שכבה | בחירה |
| --- | --- |
| מובייל | React Native ‏0.86 עם Expo SDK 57, ‏TypeScript 6 |
| תוכן | JSON עם חוזה Zod ובדיקות Node |
| מסד, התחברות ואחסון | Supabase (PostgreSQL), עם כניסה דרך Google ו־Apple בלבד |
| שרת | NestJS. עוד לא הוקם |
| בנייה | EAS Build בענן (מתוכנן לשלב 04) |

## מבנה המאגר

```text
spanish-for-the-big-trip/
├── mobile/      אפליקציית Expo
├── content/     נתוני השיעורים, חוזה Zod ובדיקות
├── supabase/    תצורה, מיגרציות SQL ובדיקות SQL
├── assets/      דמויות, איורים ושמע מאושרים
└── docs/        תכנון, החלטות, תוכנית לימוד, יומן למידה וראיות
```

## הרצה מקומית

דרישות: Node.js 22 ומעלה, ו־Expo Go באייפון. כל הפקודות נכתבו ל־PowerShell ורצות מתוך תיקיית המאגר.

הפעלת האפליקציה (מציגה QR לסריקה ב־Expo Go):

```powershell
npm.cmd --prefix mobile start -- --go
```

בדיקות:

```powershell
npm.cmd --prefix content test
npm.cmd --prefix content run validate
npm.cmd --prefix mobile run typecheck
npm.cmd --prefix mobile test
```

אותן בדיקות רצות אוטומטית ב־GitHub Actions ([.github/workflows/ci.yml](.github/workflows/ci.yml)) בכל push ל־`main` ובכל pull request. באותה הרצה gitleaks סורק את כל ההיסטוריה ומחפש סודות שנכנסו בטעות.

כלי Supabase מותקן כתלות פיתוח בשורש. אחרי `npm.cmd install` בודקים אותו עם `npx.cmd supabase --version`. פרטי המיגרציות נמצאים ב־[supabase/README.md](supabase/README.md).

## עבודה עם Git

- `main` הוא הענף הראשי, ו־`origin` הוא מאגר פרטי ב־GitHub.
- שומרים שינויים קטנים, כל אחד בנושא אחד, אחרי שנבדקו.
- סודות לא נכנסים ל־Git: `.gitignore` חוסם קובצי `.env` ומפתחות חתימה.
- ההיסטוריה המלאה של הפרויקט, כולל הסיפור של כל שלב, נמצאת ב־`git log` וב־[יומן הלמידה](docs/learning/development-learning-log.json).
