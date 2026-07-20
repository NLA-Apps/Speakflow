import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { AppScaffold } from '@/components/AppScaffold';
import { useVocabulary } from '@/state/vocabulary';
import { useActivity } from '@/state/activity';
import { colors, radius, spacing, typography } from '@/theme';

const achievements = [
  ['trophy', 'חודש רצוף'],
  ['flash', 'שבוע שלם'],
  ['flame', '3 ימי רצף'],
  ['pricetag', '25 מילים שמורות'],
  ['chatbubble-ellipses', '300 מילים בשיחה'],
  ['albums', '100 מילים באוצר'],
] as const;

export default function ProgressScreen() {
  const { words } = useVocabulary();
  const activity = useActivity();
  const highestDailyWords = activity.sessions.reduce((best, session) => Math.max(best, session.userWords), 0);
  return (
    <AppScaffold active="progress">
      <View style={styles.titleRow}>
        <Ionicons name="stats-chart" size={25} color={colors.primary} />
        <Text style={styles.pageTitle}>ההתקדמות שלך</Text>
      </View>
      <View style={styles.summary}>
        <Summary value={String(activity.streak)} label="ימי רצף" icon="flame" />
        <Summary value={String(highestDailyWords)} label="שיא מילים בשיחה" icon="ribbon" />
        <Summary value={String(activity.practiceDays)} label="ימי תרגול סה״כ" icon="calendar" />
      </View>
      <View style={styles.achievementsCard}>
        <Text style={styles.sectionTitle}>🏆 הישגים</Text>
        <View style={styles.grid}>
          {achievements.map(([icon, label], index) => {
            const unlocked = [
              activity.streak >= 30,
              activity.streak >= 7,
              activity.streak >= 3,
              words.length >= 25,
              activity.totalUserWords >= 300,
              words.length >= 100,
            ][index];
            return (
            <View key={label} style={[styles.achievement, unlocked && styles.unlocked]}>
              <Ionicons name={icon} size={25} color={colors.subtle} />
              <Text style={styles.achievementText}>{label}</Text>
            </View>
          );})}
        </View>
      </View>
      <View style={styles.weekCard}>
        <Text style={styles.sectionTitle}>14 הימים האחרונים</Text>
        <View style={styles.chart}>
          {activity.last14Days.map((wordsOnDay, index) => (
            <View key={index} style={[styles.bar, { height: Math.max(3, Math.min(80, wordsOnDay)) }]} />
          ))}
        </View>
      </View>
    </AppScaffold>
  );
}

function Summary({
  value,
  label,
  icon,
}: {
  value: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <View style={styles.summaryCard}>
      <Ionicons name={icon} size={21} color={colors.warning} />
      <Text style={styles.summaryValue}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm },
  pageTitle: { ...typography.title, color: colors.text },
  summary: { flexDirection: 'row-reverse', gap: spacing.sm, marginTop: spacing.lg },
  summaryCard: {
    flex: 1,
    minHeight: 118,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryValue: { fontSize: 28, fontWeight: '900', color: colors.text, marginTop: 4 },
  summaryLabel: { color: colors.muted, textAlign: 'center', fontSize: 12 },
  achievementsCard: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sectionTitle: { ...typography.heading, color: colors.text, textAlign: 'right' },
  grid: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  achievement: {
    width: '31%',
    minHeight: 100,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceRaised,
    opacity: 0.48,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.sm,
  },
  unlocked: { opacity: 1, borderWidth: 1, borderColor: colors.successBorder },
  achievementText: { color: colors.muted, fontSize: 11, textAlign: 'center', marginTop: 7 },
  weekCard: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chart: { height: 90, flexDirection: 'row', alignItems: 'flex-end', gap: 7, marginTop: spacing.lg },
  bar: { flex: 1, borderRadius: 5, backgroundColor: colors.primary },
});
