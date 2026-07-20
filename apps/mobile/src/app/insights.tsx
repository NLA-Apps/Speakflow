import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AppScaffold } from '@/components/AppScaffold';
import { useVocabulary } from '@/state/vocabulary';
import { useActivity } from '@/state/activity';
import { useConversation } from '@/state/conversation';
import { colors, radius, spacing, typography } from '@/theme';

export default function InsightsScreen() {
  const { words } = useVocabulary();
  const activity = useActivity();
  const conversation = useConversation();
  const today = new Date().toDateString();
  const newToday = words.filter((word) => new Date(word.savedAt).toDateString() === today).length;
  const displayedWords = conversation.userWords || activity.totalUserWords;
  return (
    <AppScaffold active="insights">
      <View style={styles.titleRow}>
        <Ionicons name="sparkles" size={24} color={colors.warning} />
        <Text style={styles.pageTitle}>תובנות בזמן אמת</Text>
      </View>
      <View style={styles.levelCard}>
        <Text style={styles.cardLabel}>רמת האנגלית המשוערת</Text>
        <View style={styles.levels}>
          {['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].map((level) => (
            <Text
              key={level}
              style={[
                styles.levelText,
                activity.assessment?.level === level && styles.activeLevel,
              ]}
            >
              {level}
            </Text>
          ))}
        </View>
        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressFill,
              {
                width: activity.assessment
                  ? `${((['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].indexOf(activity.assessment.level) + 1) / 6) * 100}%`
                  : '0%',
              },
            ]}
          />
        </View>
        <Text style={styles.helper}>
          {activity.assessment
            ? `${activity.assessment.summary} · ביטחון ${Math.round(activity.assessment.confidence * 100)}%`
            : 'נדרשות לפחות 20 מילים באנגלית בשיחה כדי לבצע הערכת רמה אמיתית'}
        </Text>
      </View>
      <View style={styles.stats}>
        <Stat value={String(displayedWords)} label={conversation.userWords ? 'מילים בשיחה' : 'מילים בכל השיחות'} />
        <Stat value={String(conversation.wordsPerMinute)} label="מילים בדקה בשיחה הנוכחית" />
        <Stat value={String(words.length)} label="מילים באוצר" />
        <Stat value={String(newToday)} label="מילים חדשות היום" accent />
      </View>
      <View style={styles.goal}>
        <Text style={styles.goalTitle}>🎯 היעד היומי שלך</Text>
        <Text style={styles.goalValue}>{words.length} / 30 מילים</Text>
        <View style={styles.goalTrack}>
          <View style={[styles.goalFill, { width: `${Math.min(100, (words.length / 30) * 100)}%` }]} />
        </View>
      </View>
      <Pressable style={styles.vocabButton} onPress={() => router.push('/vocabulary')}>
        <Ionicons name="book" size={28} color={colors.text} />
        <View style={styles.vocabText}>
          <Text style={styles.vocabTitle}>אוצר המילים שלי</Text>
          <Text style={styles.vocabSubtitle}>מילים, משפטים ומשחקים</Text>
        </View>
        <Ionicons name="arrow-back" size={22} color={colors.text} />
      </Pressable>
    </AppScaffold>
  );
}

function Stat({ value, label, accent = false }: { value: string; label: string; accent?: boolean }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, accent && { color: colors.success }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm },
  pageTitle: { ...typography.heading, color: colors.text },
  levelCard: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardLabel: { color: colors.primaryLight, textAlign: 'right' },
  levels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.md },
  levelText: { color: colors.subtle },
  activeLevel: { color: colors.text, fontWeight: '900' },
  progressTrack: { height: 8, borderRadius: 4, backgroundColor: colors.surfaceRaised, marginTop: 8 },
  progressFill: { width: '18%', height: '100%', borderRadius: 4, backgroundColor: colors.primary },
  helper: { ...typography.caption, color: colors.muted, textAlign: 'right', marginTop: spacing.sm },
  stats: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  stat: {
    width: '48%',
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  statValue: { fontSize: 28, fontWeight: '900', color: colors.text },
  statLabel: { color: colors.primaryLight, marginTop: 3 },
  goal: {
    marginTop: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  goalTitle: { color: colors.primaryLight, textAlign: 'right' },
  goalValue: { ...typography.heading, color: colors.text, textAlign: 'right', marginTop: spacing.sm },
  goalTrack: { height: 10, borderRadius: 5, backgroundColor: colors.surfaceRaised, marginTop: spacing.md },
  goalFill: { height: '100%', borderRadius: 5, backgroundColor: colors.success },
  vocabButton: {
    marginTop: spacing.md,
    minHeight: 86,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.primary,
  },
  vocabText: { flex: 1 },
  vocabTitle: { ...typography.heading, color: colors.text, textAlign: 'right' },
  vocabSubtitle: { color: '#E5EEFF', textAlign: 'right' },
});
