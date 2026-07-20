import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { LanguageMode, ResponseLength, VoicePreference } from '@speakingflow/shared';
import { useSettings } from '@/state/settings';
import { colors, radius, spacing, typography } from '@/theme';

function Choice<T extends string>({
  label, value, current, onChange, icon,
}: {
  label: string; value: T; current: T; onChange: (value: T) => void;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  const selected = value === current;
  return (
    <Pressable style={[styles.choice, selected && styles.choiceSelected]} onPress={() => onChange(value)}>
      {icon && <Ionicons name={icon} size={19} color={selected ? colors.text : colors.muted} />}
      <Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>{label}</Text>
      {selected && <Ionicons name="checkmark-circle" size={19} color={colors.text} />}
    </Pressable>
  );
}

export default function SettingsScreen() {
  const { settings, update, reset } = useSettings();
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable style={styles.back} onPress={() => router.back()}>
          <Ionicons name="arrow-forward" size={22} color={colors.text} />
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.title}>הגדרות</Text>
          <Text style={styles.subtitle}>התאם את Sky לסגנון הלמידה שלך</Text>
        </View>
        <View style={styles.headerIcon}><Ionicons name="options" size={22} color={colors.primaryLight} /></View>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <Section title="הקול של Sky" subtitle="שינוי הקול חל מיד על התשובה הבאה, גם באמצע שיחה">
          <View style={styles.row}>
            <Choice label="קול נשי" icon="woman" value={'female' satisfies VoicePreference} current={settings.voice} onChange={(voice) => update({ voice })} />
            <Choice label="קול גברי" icon="man" value={'male' satisfies VoicePreference} current={settings.voice} onChange={(voice) => update({ voice })} />
          </View>
        </Section>
        <Section title="מצב שפה">
          <View style={styles.stack}>
            <Choice label="אנגלית עם עזרה בעברית" value={'english_hebrew_help' satisfies LanguageMode} current={settings.languageMode} onChange={(languageMode) => update({ languageMode })} />
            <Choice label="עברית ואנגלית חופשי" value={'mixed' satisfies LanguageMode} current={settings.languageMode} onChange={(languageMode) => update({ languageMode })} />
            <Choice label="אנגלית בלבד" value={'english_only' satisfies LanguageMode} current={settings.languageMode} onChange={(languageMode) => update({ languageMode })} />
            <Choice label="הדרכה בעברית למתחילים" value={'beginner' satisfies LanguageMode} current={settings.languageMode} onChange={(languageMode) => update({ languageMode })} />
          </View>
        </Section>
        <Section title="אורך תשובה">
          <View style={styles.row}>
            <Choice label="קצר" value={'short' satisfies ResponseLength} current={settings.responseLength} onChange={(responseLength) => update({ responseLength })} />
            <Choice label="רגיל" value={'normal' satisfies ResponseLength} current={settings.responseLength} onChange={(responseLength) => update({ responseLength })} />
          </View>
        </Section>
        <Section title="מהירות דיבור">
          <View style={styles.row}>
            {([0.85, 1, 1.15] as const).map((speed) => (
              <Pressable key={speed} style={[styles.speed, settings.speakingSpeed === speed && styles.choiceSelected]} onPress={() => update({ speakingSpeed: speed })}>
                <Text style={[styles.speedText, settings.speakingSpeed === speed && { color: colors.text }]}>{speed}×</Text>
              </Pressable>
            ))}
          </View>
        </Section>
        <View style={styles.switchCard}>
          <Toggle label="הצג תמלול חי" value={settings.showTranscript} onChange={(showTranscript) => update({ showTranscript })} />
          <View style={styles.divider} />
          <Toggle label="נגן דרך הרמקול" value={settings.speaker} onChange={(speaker) => update({ speaker })} />
        </View>
        <Pressable style={styles.systemLink} onPress={() => router.push('/diagnostics')}>
          <Ionicons name="hardware-chip-outline" size={20} color={colors.primaryLight} />
          <Text style={styles.systemText}>בדיקת מערכת וחיבור</Text>
          <Ionicons name="chevron-back" size={18} color={colors.muted} />
        </Pressable>
        <Pressable style={styles.reset} onPress={reset}>
          <Ionicons name="refresh" size={18} color={colors.danger} />
          <Text style={styles.resetText}>איפוס הגדרות</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ children, title, subtitle }: React.PropsWithChildren<{ title: string; subtitle?: string }>) {
  return <View style={styles.section}><Text style={styles.sectionTitle}>{title}</Text>{subtitle && <Text style={styles.sectionSubtitle}>{subtitle}</Text>}<View style={styles.sectionBody}>{children}</View></View>;
}
function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) {
  return <View style={styles.toggle}><Switch value={value} onValueChange={onChange} trackColor={{ false: colors.surfaceRaised, true: colors.primary }} /><Text style={styles.toggleLabel}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: { minHeight: 74, paddingHorizontal: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border, flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.md },
  back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerText: { flex: 1 }, title: { ...typography.heading, color: colors.text, textAlign: 'right' }, subtitle: { color: colors.muted, textAlign: 'right', fontSize: 12 },
  headerIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl },
  section: { gap: 4 }, sectionTitle: { ...typography.heading, color: colors.text, textAlign: 'right' }, sectionSubtitle: { color: colors.muted, textAlign: 'right', fontSize: 12 }, sectionBody: { marginTop: spacing.sm },
  row: { flexDirection: 'row-reverse', gap: spacing.sm }, stack: { gap: spacing.sm },
  choice: { flex: 1, minHeight: 50, paddingHorizontal: spacing.md, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 7 },
  choiceSelected: { backgroundColor: colors.primary, borderColor: colors.primary }, choiceText: { color: colors.muted, fontWeight: '700', textAlign: 'center' }, choiceTextSelected: { color: colors.text, fontWeight: '900' },
  speed: { flex: 1, minHeight: 50, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }, speedText: { color: colors.muted, fontSize: 17, fontWeight: '800' },
  switchCard: { paddingHorizontal: spacing.md, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  toggle: { minHeight: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, toggleLabel: { ...typography.body, color: colors.text, textAlign: 'right' }, divider: { height: 1, backgroundColor: colors.border },
  systemLink: { minHeight: 56, paddingHorizontal: spacing.md, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm }, systemText: { flex: 1, color: colors.text, fontWeight: '700', textAlign: 'right' },
  reset: { minHeight: 52, borderRadius: radius.md, backgroundColor: '#2B1520', flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: spacing.sm }, resetText: { color: colors.danger, fontWeight: '800' },
});
