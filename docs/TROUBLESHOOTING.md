# Troubleshooting

- **השרת לא מוכן:** בדוק `/health`, את `EXPO_PUBLIC_API_BASE_URL`, אותה רשת Wi‑Fi וחומת אש. אין להשתמש ב־localhost מה־iPhone.
- **מיקרופון חסום:** Settings → Privacy & Security → Microphone → SpeakingFlow, או כפתור "פתח הגדרות" באפליקציה.
- **401/403:** בדוק שהמפתח נמצא רק ב־`apps/server/.env`, פעיל ובעל גישה ל־Realtime.
- **429/billing:** בדוק limits ו־billing בפרויקט OpenAI. ה־UI מציג הודעה בטוחה והפרטים הטכניים ב־Diagnostics.
- **WebRTC negotiation:** ודא שהותקן Development Build חדש לאחר שינוי native dependencies; Expo Go אינו נתמך.
- **אין שמע/Bluetooth:** נתק וחבר מחדש AirPods, סיים את השיחה והתחל מחדש. iOS מנהל route changes; Diagnostics מציג כרגע route ברמת system default.
- **שיחה הסתיימה ברקע/שיחה נכנסת:** זו התנהגות מכוונת ב־v1 כדי למנוע microphone session תלוי. חזור לאפליקציה והתחל מחדש.
