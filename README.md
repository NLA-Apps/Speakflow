# SpeakingFlow

SpeakingFlow הוא אב־טיפוס production-oriented ל־iPhone: מאמן דיבור באנגלית לדוברי עברית, עם שיחת audio דו־כיוונית ישירה ב־WebRTC מול OpenAI Realtime, תמלול חי, interruption ומדדי latency אמיתיים.

## מבנה

- `apps/mobile` — Expo SDK 56, Expo Router ו־React Native 0.85. האפליקציה דורשת Development Build ואינה פועלת ב־Expo Go.
- `apps/server` — Fastify שמנפיק client secret קצר־חיים. המפתח הקבוע נשאר כאן בלבד.
- `packages/shared` — טיפוסים והוראות המאמן.
- `docs` — ארכיטקטורה, אבטחה, Realtime, iOS ופתרון תקלות.

## התחלה מהירה

1. התקן Node.js 20.19 ומעלה והריץ `npm install`.
2. העתק `apps/server/.env.example` אל `apps/server/.env` והכנס שם בלבד `OPENAI_API_KEY`.
3. העתק `apps/mobile/.env.example` אל `apps/mobile/.env.local` ועדכן כתובת LAN/tunnel של השרת.
4. הרץ `npm run server`, ובחלון נוסף `npm run mobile`.
5. בנה Development Build באמצעות EAS; Expo Go אינו כולל את WebRTC native module.

בדיקות מלאות: `npm run check`.

## אבטחה

האפליקציה מקבלת מהשרת רק `clientSecret`, זמן תפוגה ושם מודל. אין מפתח OpenAI בקוד המובייל, ב־Expo config או במשתני `EXPO_PUBLIC_*`. השרת מחיל ולידציה, timeout, rate limit, CORS allowlist, redaction ומזהה בטיחות מגובב.

## היקף נוכחי

כלולים: Welcome, שיחה, Settings, Diagnostics, VAD אוטומטי, push-to-talk, תמלול session-only, mute, cancel ו־cleanup. לא כלולים עדיין: חשבון משתמש, תשלומים, שמירת שיחות, דוחות לימוד או TestFlight automation.

ראו [SETUP_WINDOWS.md](SETUP_WINDOWS.md) להוראות PowerShell מלאות.
