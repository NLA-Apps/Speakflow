import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { AppScaffold } from '@/components/AppScaffold';
import { useConversation } from '@/state/conversation';
import { colors, radius, spacing, typography } from '@/theme';

const exercises = [
  {
    title: 'כרטיסיות חזרה',
    description: 'מילים ומשפטים ששמרת, בחזרה חכמה ומרווחת.',
    icon: 'albums-outline' as const,
    action: 'התחל',
    prompt: null,
  },
  {
    title: 'תרגול הגייה',
    description: 'שמע משפט, חזור אחריו וקבל משוב על הקצב והבהירות.',
    icon: 'mic-outline' as const,
    action: 'התחל',
    prompt: 'Please start a pronunciation exercise. Give me one short useful English sentence, ask me to repeat it, and then give concise feedback on what you heard.',
  },
  {
    title: 'משפטים שימושיים',
    description: 'תרגול קצר למצבים אמיתיים: עבודה, נסיעות וחיי יום־יום.',
    icon: 'chatbubbles-outline' as const,
    action: 'גלה',
    prompt: 'Please start a practical English role-play for a real-life situation. Pick one situation, explain my role briefly in Hebrew, and begin with one short English sentence.',
  },
];

export default function PracticeScreen() {
  const conversation = useConversation();
  const startExercise = (prompt: string | null) => {
    if (!prompt) {
      router.push('/vocabulary');
      return;
    }
    router.push('/conversation');
    void conversation.sendText(prompt);
  };
  return (
    <AppScaffold active="practice">
      <View style={styles.titleRow}>
        <Ionicons name="disc-outline" size={24} color={colors.primary} />
        <Text style={styles.pageTitle}>תרגול</Text>
      </View>
      <Text style={styles.subtitle}>כמה דקות ביום שומרות את האנגלית חדה ובטוחה</Text>
      <View style={styles.cards}>
        {exercises.map((exercise, index) => (
          <View key={exercise.title} style={styles.card}>
            <View style={[styles.icon, index === 1 && styles.iconAccent]}>
              <Ionicons name={exercise.icon} size={27} color={index === 1 ? colors.accent : colors.primary} />
            </View>
            <View style={styles.cardBody}>
              <Text style={styles.cardTitle}>{exercise.title}</Text>
              <Text style={styles.cardText}>{exercise.description}</Text>
              <Pressable style={styles.link} onPress={() => startExercise(exercise.prompt)}>
                <Text style={styles.linkText}>{exercise.action}</Text>
                <Ionicons name="arrow-back" size={15} color={colors.primaryLight} />
              </Pressable>
            </View>
          </View>
        ))}
      </View>
    </AppScaffold>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm },
  pageTitle: { ...typography.title, color: colors.text },
  subtitle: { ...typography.body, color: colors.muted, textAlign: 'right', marginTop: 4 },
  cards: { gap: spacing.md, marginTop: spacing.lg },
  card: {
    flexDirection: 'row-reverse',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  icon: {
    width: 54,
    height: 54,
    borderRadius: 17,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconAccent: { backgroundColor: colors.accentSoft },
  cardBody: { flex: 1 },
  cardTitle: { ...typography.heading, color: colors.text, textAlign: 'right' },
  cardText: { ...typography.body, color: colors.muted, textAlign: 'right', marginTop: 4 },
  link: { flexDirection: 'row-reverse', gap: 5, alignItems: 'center', marginTop: spacing.sm },
  linkText: { color: colors.primaryLight, fontWeight: '800' },
});
