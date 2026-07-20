# התקנת SpeakingFlow ב־Windows 11

## 1. תוכנות נדרשות

התקן Node.js LTS (20.19 ומעלה), Git ו־npm. לאחר מכן פתח PowerShell:

```powershell
npm install --global eas-cli
node --version
npm --version
git --version
eas --version
```

## 2. התקנה וקישור Expo

```powershell
Set-Location 'C:\Users\Netanel\Desktop\SpeakingFlow'
npm install
eas login
Set-Location '.\apps\mobile'
eas init
```

ב־`eas init` בחר את הפרויקט הקיים `@speakingflow/speakingflow`. הפקודה תכניס `projectId` אמיתי; אין להמציא אותו ידנית.

## 3. השרת והמפתח

```powershell
Set-Location 'C:\Users\Netanel\Desktop\SpeakingFlow'
Copy-Item '.\apps\server\.env.example' '.\apps\server\.env'
notepad '.\apps\server\.env'
```

הכנס את המפתח רק בשורה `OPENAI_API_KEY=` בתוך `C:\Users\Netanel\Desktop\SpeakingFlow\apps\server\.env`. אין להכניס אותו לצ'אט, למובייל או ל־EAS public environment.

מצא את כתובת ה־IPv4 של המחשב:

```powershell
ipconfig
Copy-Item '.\apps\mobile\.env.example' '.\apps\mobile\.env.local'
notepad '.\apps\mobile\.env.local'
```

עדכן לדוגמה `EXPO_PUBLIC_API_BASE_URL=http://192.168.1.25:3001`. ה־iPhone והמחשב חייבים להיות באותה רשת, וחומת האש צריכה לאפשר TCP 3001. לחלופין השתמש ב־HTTPS tunnel או בשרת deployed. `localhost` ב־iPhone אינו המחשב.

## 4. הרצה

PowerShell ראשון:

```powershell
Set-Location 'C:\Users\Netanel\Desktop\SpeakingFlow'
npm run server
```

PowerShell שני:

```powershell
Set-Location 'C:\Users\Netanel\Desktop\SpeakingFlow'
npm run mobile
```

## 5. Development Build ראשון ל־iPhone

```powershell
Set-Location 'C:\Users\Netanel\Desktop\SpeakingFlow\apps\mobile'
eas device:create
eas build --platform ios --profile development
```

פתח ב־iPhone את קישור הרישום של `eas device:create`, אשר את הפרופיל, ואז התקן את קישור ה־build ש־EAS מחזיר. פתח את SpeakingFlow וסרוק/בחר את dev server. שינוי dependency או config plugin native דורש build חדש.

## 6. Preview ו־TestFlight

```powershell
eas build --platform ios --profile preview
eas build --platform ios --profile production
eas submit --platform ios --profile production
```

Production build מועלה ל־App Store Connect ומשם מפיצים ב־TestFlight. נדרשים חשבון Apple Developer, bundle id `com.netanelatia.speakingflow` וחתימה ש־EAS ינחה ליצור.
