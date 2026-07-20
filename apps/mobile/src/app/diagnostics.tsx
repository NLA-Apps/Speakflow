import * as Application from 'expo-application';
import * as Clipboard from 'expo-clipboard';
import Constants from 'expo-constants';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { Card } from '@/components/Card';
import { AppButton } from '@/components/AppButton';
import { useDiagnostics } from '@/state/diagnostics';
import { apiBaseUrl } from '@/services/api';
import { colors, spacing, typography } from '@/theme';
import { formatLatency } from '@/utils/latency';
function hideUrl(value: string) {
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.hostname}${url.port ? `:${url.port}` : ''}`;
  } catch {
    return 'לא הוגדרה';
  }
}
export default function DiagnosticsScreen() {
  const { data, clear } = useDiagnostics();
  const rn = Platform.constants?.reactNativeVersion;
  const rnVersion = rn ? `${rn.major}.${rn.minor}.${rn.patch}` : 'Web';
  const rows: [string, string][] = [
    ['גרסת אפליקציה', Application.nativeApplicationVersion ?? '1.0.0'],
    ['מספר build', Application.nativeBuildVersion ?? '1'],
    ['Expo SDK', Constants.expoConfig?.sdkVersion ?? '56'],
    ['React Native', rnVersion],
    ['WebRTC', Platform.OS === 'web' ? 'Browser WebRTC' : 'react-native-webrtc 124.0.7'],
    ['שרת', hideUrl(apiBaseUrl())],
    ['מודל OpenAI', data.model],
    ['חיבור', data.connectionState],
    ['ICE', data.iceState],
    ['Signaling', data.signalingState],
    ['הרשאת מיקרופון', data.microphonePermission],
    ['נתיב שמע', data.audioRoute],
    ['קבלת token', formatLatency(data.tokenLatencyMs)],
    ['חיבור WebRTC', formatLatency(data.connectLatencyMs)],
    ['אודיו ראשון', formatLatency(data.firstAudioLatencyMs)],
    ['תמלול ראשון', formatLatency(data.firstTranscriptLatencyMs)],
    ['חיבורים מחדש', String(data.reconnectCount)],
    ['שגיאה אחרונה', data.lastError ?? '—'],
  ];
  const text = rows.map(([key, value]) => `${key}: ${value}`).join('\n');
  return (
    <Screen scroll style={styles.screen}>
      <Text style={styles.intro}>המידע מסונן ואינו כולל מפתחות, tokens או כותרות הרשאה.</Text>
      <Card>
        {rows.map(([key, value]) => (
          <View key={key} style={styles.row}>
            <Text selectable style={styles.value}>
              {value}
            </Text>
            <Text style={styles.key}>{key}</Text>
          </View>
        ))}
      </Card>
      <AppButton title="העתק מידע אבחוני" onPress={() => void Clipboard.setStringAsync(text)} />
      <AppButton title="נקה מדדים" variant="danger" onPress={clear} />
    </Screen>
  );
}
const styles = StyleSheet.create({
  screen: { gap: spacing.md },
  intro: { ...typography.body, color: colors.muted, textAlign: 'right', writingDirection: 'rtl' },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  key: { color: colors.text, textAlign: 'right', writingDirection: 'rtl', flex: 1 },
  value: { color: colors.primary, flex: 1.2 },
});
