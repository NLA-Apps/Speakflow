import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import type { TranslationResponse } from '@speakingflow/shared';
import { pronounceText } from '@/services/pronunciation';
import { useSettings } from '@/state/settings';
import { useVocabulary } from '@/state/vocabulary';
import { colors, radius, shadow, spacing, typography } from '@/theme';

export function TranslationPopover({
  visible,
  loading,
  translation,
  anchor,
  onClose,
  onRetry,
}: {
  visible: boolean;
  loading: boolean;
  translation: TranslationResponse | null;
  anchor: { x: number; y: number } | null;
  onClose: () => void;
  onRetry: () => void;
}) {
  const window = useWindowDimensions();
  const vocabulary = useVocabulary();
  const { settings } = useSettings();
  const saved = translation ? vocabulary.isSaved(translation.source) : false;
  const anchored = anchor;
  const popoverWidth = Math.min(228, window.width - 24);
  const anchorStyle = anchored
    ? {
        position: 'absolute' as const,
        width: popoverWidth,
        left: Math.max(12, Math.min(anchor.x - popoverWidth / 2, window.width - popoverWidth - 12)),
        top: Math.max(70, Math.min(anchor.y - 165, window.height - 245)),
      }
    : undefined;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={[styles.backdrop, anchored && styles.clearBackdrop]} onPress={onClose}>
        <Pressable style={[styles.card, anchored && styles.wordCard, anchorStyle]} onPress={(event) => event.stopPropagation()}>
          {loading ? (
            <View style={styles.loading}>
              <ActivityIndicator color={colors.primary} />
              <Text style={styles.muted}>מתרגם…</Text>
            </View>
          ) : translation ? (
            <>
              <View style={styles.header}>
                <Pressable style={styles.iconButton} onPress={onClose}>
                  <Ionicons name="close" size={20} color={colors.muted} />
                </Pressable>
                <View style={styles.wordBlock}>
                  <Text style={styles.source}>{translation.source}</Text>
                  {!!translation.transliteration && (
                    <Text style={styles.transliteration}>{translation.transliteration}</Text>
                  )}
                </View>
                {!anchored && <View style={styles.badge}>
                  <Text style={styles.badgeText}>EN → HE</Text>
                </View>}
              </View>
              <Text style={styles.translation}>{translation.translation}</Text>
              {!!translation.example && !anchored && <Text style={styles.example}>{translation.example}</Text>}
              <View style={styles.actions}>
                <Pressable
                  style={styles.action}
                  onPress={() =>
                    void pronounceText(translation.source, {
                      voice: settings.voice,
                      speed: settings.speakingSpeed,
                    })
                  }
                >
                  <Ionicons name="volume-high" size={20} color={colors.primary} />
                  <Text style={styles.actionText}>הגייה</Text>
                </Pressable>
                <Pressable
                  style={[styles.action, saved && styles.savedAction]}
                  onPress={() => vocabulary.toggle(translation)}
                >
                  <Ionicons
                    name={saved ? 'bookmark' : 'bookmark-outline'}
                    size={20}
                    color={saved ? colors.success : colors.primary}
                  />
                  <Text style={styles.actionText}>{saved ? 'נשמר' : 'שמור מילה'}</Text>
                </Pressable>
              </View>
            </>
          ) : (
            <View style={styles.loading}>
              <Text style={styles.error}>לא הצלחנו לתרגם כרגע.</Text>
              <Pressable style={styles.retry} onPress={onRetry}>
                <Ionicons name="refresh" size={17} color={colors.text} />
                <Text style={styles.retryText}>נסה שוב</Text>
              </Pressable>
            </View>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(1, 6, 16, 0.68)',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  clearBackdrop: { backgroundColor: 'transparent' },
  card: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    ...shadow,
  },
  wordCard: { padding: spacing.sm, borderRadius: 16 },
  loading: { minHeight: 92, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  muted: { color: colors.muted },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  iconButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wordBlock: { flex: 1 },
  source: { ...typography.heading, color: colors.text, textAlign: 'left' },
  transliteration: { ...typography.caption, color: colors.muted, textAlign: 'left' },
  badge: { backgroundColor: colors.primarySoft, paddingHorizontal: 9, paddingVertical: 6, borderRadius: radius.pill },
  badgeText: { color: colors.primaryLight, fontSize: 11, fontWeight: '800' },
  translation: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'right',
    marginTop: spacing.sm,
  },
  example: {
    ...typography.body,
    color: colors.muted,
    textAlign: 'right',
    marginTop: spacing.sm,
  },
  actions: { flexDirection: 'row-reverse', gap: 6, marginTop: spacing.sm },
  action: {
    flex: 1,
    minHeight: 38,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row-reverse',
    gap: spacing.sm,
  },
  savedAction: { borderColor: colors.successBorder },
  actionText: { color: colors.text, fontWeight: '700', fontSize: 11 },
  error: { ...typography.body, color: colors.danger, textAlign: 'center' },
  retry: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, backgroundColor: colors.primary, paddingHorizontal: spacing.md, paddingVertical: 9, borderRadius: radius.pill },
  retryText: { color: colors.text, fontWeight: '800' },
});
