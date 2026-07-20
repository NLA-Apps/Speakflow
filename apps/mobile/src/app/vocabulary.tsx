import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { pronounceText } from '@/services/pronunciation';
import { useSettings } from '@/state/settings';
import { useVocabulary } from '@/state/vocabulary';
import { colors, radius, spacing, typography } from '@/theme';

export default function VocabularyScreen() {
  const vocabulary = useVocabulary();
  const { settings } = useSettings();
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable style={styles.back} onPress={() => router.back()}>
          <Ionicons name="arrow-forward" size={22} color={colors.text} />
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.title}>אוצר המילים שלי</Text>
          <Text style={styles.subtitle}>{vocabulary.words.length} מילים שמורות</Text>
        </View>
        <View style={styles.bookIcon}>
          <Ionicons name="book" size={22} color={colors.primaryLight} />
        </View>
      </View>
      <View style={styles.content}>
        {vocabulary.words.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="bookmark-outline" size={48} color={colors.subtle} />
            <Text style={styles.emptyTitle}>עדיין לא שמרת מילים</Text>
            <Text style={styles.emptyText}>
              בזמן שיחה לחץ על מילה של Sky, קבל תרגום ושמור אותה כאן לתרגול חוזר.
            </Text>
          </View>
        ) : (
          vocabulary.words.map((word) => (
            <View key={word.id} style={styles.wordCard}>
              <Pressable
                style={styles.speaker}
                onPress={() =>
                  void pronounceText(word.source, {
                    voice: settings.voice,
                    speed: settings.speakingSpeed,
                  })
                }
              >
                <Ionicons name="volume-high" size={20} color={colors.primaryLight} />
              </Pressable>
              <View style={styles.wordText}>
                <Text style={styles.source}>{word.source}</Text>
                <Text style={styles.translation}>{word.translation}</Text>
                {!!word.example && <Text style={styles.example}>{word.example}</Text>}
              </View>
              <Pressable onPress={() => vocabulary.toggle(word)}>
                <Ionicons name="bookmark" size={22} color={colors.success} />
              </Pressable>
            </View>
          ))
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    minHeight: 70,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: spacing.md,
  },
  back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerText: { flex: 1 },
  title: { ...typography.heading, color: colors.text, textAlign: 'right' },
  subtitle: { color: colors.muted, textAlign: 'right' },
  bookIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { flex: 1, padding: spacing.md, gap: spacing.sm },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  emptyTitle: { ...typography.heading, color: colors.text, marginTop: spacing.md },
  emptyText: { ...typography.body, color: colors.muted, textAlign: 'center', marginTop: spacing.sm },
  wordCard: {
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  speaker: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wordText: { flex: 1 },
  source: { fontSize: 20, fontWeight: '800', color: colors.text },
  translation: { fontSize: 17, color: colors.primaryLight, textAlign: 'right' },
  example: { ...typography.caption, color: colors.muted, marginTop: 4 },
});
