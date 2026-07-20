# Security

המפתח הקבוע קיים רק ב־`apps/server/.env`, שנחסם ב־`.gitignore`. משתנה המובייל הציבורי מכיל URL בלבד. server logs מבצעים redaction ל־authorization, `value` ו־client secrets, וה־UI אינו מציג token.

ה־backend מגביל body, מאמת UUID והגדרות ב־Zod, מחיל CORS allowlist, Helmet, rate limiting, request timeout, safe errors ו־graceful shutdown. מזהה מקומי אקראי נשמר במכשיר; השרת מגבב אותו ב־SHA‑256 ושולח `OpenAI-Safety-Identifier` בלי PII.

לפני commit הרץ `npm run secret-scan`. אין לשמור transcripts בגרסה זו. בפריסה ציבורית יש להשתמש ב־HTTPS, allowlist מדויק, secret manager ו־WAF/rate limits ברמת התשתית.
