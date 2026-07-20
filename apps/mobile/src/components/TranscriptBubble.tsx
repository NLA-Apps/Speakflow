import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useState } from 'react';
import type { TranslationResponse } from '@speakingflow/shared';
import type { Transcript } from '@/state/conversation';
import { getTextDirection } from '@/utils/textDirection';
import { translateText } from '@/services/api';
import { pronounceText } from '@/services/pronunciation';
import { useSettings } from '@/state/settings';
import { TranslationPopover } from '@/components/TranslationPopover';
import { colors, radius, spacing, typography } from '@/theme';

const englishWord = /[A-Za-z][A-Za-z'-]*/;

export function TranscriptBubble({ item }: { item: Transcript }) {
  const { settings } = useSettings();
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [translation, setTranslation] = useState<TranslationResponse | null>(null);
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);
  const [requestedText, setRequestedText] = useState('');
  const [sentenceLoading, setSentenceLoading] = useState(false);
  const [sentenceTranslation, setSentenceTranslation] = useState<TranslationResponse | null>(null);
  const [sentenceError, setSentenceError] = useState(false);
  const direction = getTextDirection(item.text);

  const requestTranslation = async (
    text: string,
    nextAnchor: { x: number; y: number } | null = null,
  ) => {
    setAnchor(nextAnchor);
    setRequestedText(text);
    setVisible(true);
    setLoading(true);
    setTranslation(null);
    try {
      setTranslation(await translateText({ text, kind: 'word' }));
    } catch {
      setTranslation(null);
    } finally {
      setLoading(false);
    }
  };

  const requestSentenceTranslation = async () => {
    setSentenceLoading(true);
    setSentenceError(false);
    try {
      setSentenceTranslation(await translateText({ text: item.text, kind: 'sentence' }));
    } catch {
      setSentenceError(true);
    } finally {
      setSentenceLoading(false);
    }
  };

  const parts = item.text.split(/(\s+)/);
  return (
    <>
      <View
        style={[
          styles.row,
          item.role === 'user'
            ? styles.userRow
            : item.role === 'assistant'
              ? styles.assistantRow
              : styles.systemRow,
        ]}
      >
        <View
          style={[
            styles.bubble,
            item.role === 'user'
              ? styles.user
              : item.role === 'assistant'
                ? styles.assistant
                : styles.system,
          ]}
        >
          {item.role === 'assistant' && (
            <View style={styles.coachLabel}>
              <View style={styles.coachDot} />
              <Text style={styles.coachText}>Sky · המאמן שלך</Text>
            </View>
          )}
          <Text
            style={[
              styles.text,
              { writingDirection: direction, textAlign: direction === 'rtl' ? 'right' : 'left' },
            ]}
          >
            {parts.map((part, index) => {
              const match = item.role === 'assistant' ? part.match(englishWord)?.[0] : undefined;
              return match ? (
                <Text
                  key={`${part}-${index}`}
                  style={styles.word}
                  onPress={(event) =>
                    void requestTranslation(match, {
                      x: event.nativeEvent.pageX,
                      y: event.nativeEvent.pageY,
                    })
                  }
                >
                  {part}
                </Text>
              ) : (
                <Text key={`${part}-${index}`}>{part || '…'}</Text>
              );
            })}
          </Text>
          {item.role === 'assistant' && sentenceLoading && (
            <View style={styles.inlineTranslation}>
              <Text style={styles.inlineHint}>מתרגם…</Text>
            </View>
          )}
          {item.role === 'assistant' && sentenceTranslation && !sentenceLoading && (
            <View style={styles.inlineTranslation}>
              <View style={styles.inlineTranslationHeader}>
                <Ionicons name="language-outline" size={14} color={colors.primaryLight} />
                <Text style={styles.inlineHint}>תרגום לעברית</Text>
              </View>
              <Text style={styles.inlineTranslationText}>{sentenceTranslation.translation}</Text>
            </View>
          )}
          {item.role === 'assistant' && sentenceError && !sentenceLoading && (
            <Pressable style={styles.inlineError} onPress={() => void requestSentenceTranslation()}>
              <Ionicons name="refresh" size={14} color={colors.danger} />
              <Text style={styles.inlineErrorText}>התרגום נכשל — נסה שוב</Text>
            </Pressable>
          )}
          <View style={styles.metaRow}>
            {item.role === 'assistant' && !item.partial && (
              <Pressable
                style={styles.translateSentence}
                onPress={() => void requestSentenceTranslation()}
                accessibilityRole="button"
                accessibilityLabel="תרגם את תשובת Sky"
              >
                <Ionicons name="language" size={15} color={colors.primaryLight} />
                <Text style={styles.translateText}>תרגם משפט</Text>
              </Pressable>
            )}
            {item.role === 'assistant' && !item.partial && (
              <Pressable
                style={styles.replay}
                onPress={() =>
                  void pronounceText(item.text, {
                    voice: settings.voice,
                    speed: settings.speakingSpeed,
                  })
                }
                accessibilityRole="button"
                accessibilityLabel="השמע שוב את תשובת Sky"
              >
                <Ionicons name="volume-high" size={16} color={colors.primaryLight} />
              </Pressable>
            )}
            <Text style={styles.time}>
              {new Date(item.timestamp).toLocaleTimeString('he-IL', {
                hour: '2-digit',
                minute: '2-digit',
              })}
              {item.partial ? ' · מקליד…' : ''}
            </Text>
          </View>
        </View>
      </View>
      <TranslationPopover
        visible={visible}
        loading={loading}
        translation={translation}
        anchor={anchor}
        onClose={() => setVisible(false)}
        onRetry={() =>
          void requestTranslation(requestedText, anchor)
        }
      />
    </>
  );
}

const styles = StyleSheet.create({
  row: { width: '100%', marginBottom: spacing.md },
  userRow: { alignItems: 'flex-end' },
  assistantRow: { alignItems: 'flex-start' },
  systemRow: { alignItems: 'center' },
  bubble: { maxWidth: '91%', padding: spacing.md, borderRadius: 20 },
  user: { backgroundColor: colors.user, borderBottomRightRadius: 6 },
  assistant: {
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
    borderBottomLeftRadius: 6,
  },
  system: { backgroundColor: colors.primarySoft },
  coachLabel: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: spacing.sm },
  coachDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent },
  coachText: { ...typography.caption, color: colors.primaryLight, fontWeight: '700' },
  text: { ...typography.body, color: colors.text },
  word: {
    color: colors.text,
    textDecorationLine: 'underline',
    textDecorationStyle: 'dotted',
    textDecorationColor: colors.primaryLight,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  translateSentence: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
  },
  translateText: { color: colors.primaryLight, fontSize: 12, fontWeight: '700' },
  replay: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  inlineTranslation: { marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, gap: 4 },
  inlineTranslationHeader: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'flex-start', gap: 5 },
  inlineHint: { color: colors.primaryLight, fontSize: 11, fontWeight: '700', textAlign: 'right' },
  inlineTranslationText: { color: colors.text, fontSize: 15, lineHeight: 22, textAlign: 'right', writingDirection: 'rtl' },
  inlineError: { marginTop: spacing.sm, flexDirection: 'row-reverse', alignItems: 'center', gap: 5 },
  inlineErrorText: { color: colors.danger, fontSize: 11, fontWeight: '700' },
  time: { ...typography.caption, color: colors.muted },
});
