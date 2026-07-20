import { Ionicons } from '@expo/vector-icons';
import { router, type Href, usePathname } from 'expo-router';
import { useState } from 'react';
import type { RecognitionLanguage } from '@speakingflow/shared';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useConversation } from '@/state/conversation';
import { useSettings } from '@/state/settings';
import { colors, radius, spacing } from '@/theme';

type Section = 'chat' | 'practice' | 'insights' | 'progress';
const items: {
  id: Section;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  route: Href;
}[] = [
  { id: 'progress', label: 'התקדמות', icon: 'stats-chart', route: '/progress' as Href },
  { id: 'practice', label: 'תרגול', icon: 'disc-outline', route: '/practice' as Href },
  { id: 'insights', label: 'תובנות', icon: 'sparkles', route: '/insights' as Href },
  { id: 'chat', label: 'שיחה', icon: 'chatbubble', route: '/conversation' as Href },
];

const languageLabels: Record<'he' | 'en', string> = { he: 'עברית', en: 'English' };

export function BottomDock({ active }: { active: Section }) {
  const conversation = useConversation();
  const pathname = usePathname();
  const { settings, update } = useSettings();
  const [text, setText] = useState('');
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [languageOpen, setLanguageOpen] = useState(false);

  const submit = (value = text) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    setText('');
    setSuggestionsOpen(false);
    router.push('/conversation');
    void conversation.sendText(trimmed);
  };

  const openSuggestions = () => {
    setSuggestionsOpen(true);
    void conversation.loadSuggestions();
  };

  return (
    <>
      <View style={styles.dock}>
      <View style={styles.composer}>
        <Pressable
          style={styles.magic}
          onPress={openSuggestions}
          accessibilityRole="button"
          accessibilityLabel="הצעות לתשובה"
        >
          <Ionicons name="sparkles" size={19} color={colors.warning} />
        </Pressable>
        <Pressable
          style={[styles.sound, conversation.outputMuted && styles.soundMuted]}
          onPress={conversation.toggleOutputMute}
          accessibilityRole="button"
          accessibilityLabel={conversation.outputMuted ? 'הפעל קול' : 'השתק קול'}
        >
          <Ionicons
            name={conversation.outputMuted ? 'volume-mute' : 'volume-high'}
            size={20}
            color={conversation.outputMuted ? colors.danger : colors.primaryLight}
          />
        </Pressable>
        <View style={styles.inputWrap}>
          <Pressable
            onPress={() => submit()}
            disabled={!text.trim()}
            accessibilityRole="button"
            accessibilityLabel="שלח הודעה"
          >
            <Ionicons name="paper-plane-outline" size={19} color={colors.primary} />
          </Pressable>
          <TextInput
            style={styles.input}
            placeholder="…or type in English"
            placeholderTextColor={colors.subtle}
            value={text}
            onChangeText={setText}
            onSubmitEditing={() => submit()}
            returnKeyType="send"
          />
        </View>
        {conversation.muted ? (
          <Pressable
            style={styles.language}
            onPress={() => setLanguageOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="בחירת שפת דיבור"
          >
            <Text style={styles.languageText}>{settings.recognitionLanguage === 'he' ? 'עב' : 'EN'}</Text>
          </Pressable>
        ) : (
          <Pressable
            style={styles.cancelRecording}
            onPress={conversation.cancelRecording}
            accessibilityRole="button"
            accessibilityLabel="בטל הקלטה בלי לשלוח"
          >
            <Ionicons name="close" size={21} color={colors.danger} />
          </Pressable>
        )}
        <Pressable
          style={[
            styles.mic,
            !conversation.muted && styles.micRecording,
            conversation.muted && conversation.voicePreview && styles.micDisabled,
          ]}
          disabled={Boolean(conversation.muted && conversation.voicePreview)}
          onPress={() => {
            if (pathname !== '/conversation') router.push('/conversation');
            void conversation.toggleRecording();
          }}
          accessibilityRole="button"
          accessibilityLabel={conversation.muted ? 'התחל להקליט' : 'עצור הקלטה'}
        >
          <Ionicons name={conversation.muted ? 'mic' : 'stop'} size={23} color={colors.text} />
        </Pressable>
      </View>
      <View style={styles.nav}>
        {items.map((item) => {
          const selected = item.id === active;
          return (
            <Pressable
              key={item.id}
              style={styles.navItem}
              onPress={() => {
                router.push(item.route);
                if (item.id === 'chat' && conversation.transcripts.length === 0)
                  void conversation.startScenario('free');
              }}
            >
              <Ionicons
                name={item.icon}
                size={20}
                color={selected ? colors.primary : colors.muted}
              />
              <Text style={[styles.navLabel, selected && styles.navLabelActive]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>
      </View>
      <Modal
        visible={suggestionsOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setSuggestionsOpen(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setSuggestionsOpen(false)}>
          <Pressable style={styles.suggestionsCard} onPress={(event) => event.stopPropagation()}>
            <View style={styles.suggestionsHeader}>
              <Pressable onPress={() => setSuggestionsOpen(false)}>
                <Ionicons name="close" size={22} color={colors.muted} />
              </Pressable>
              <Text style={styles.suggestionsTitle}>מה אפשר לענות?</Text>
              <Ionicons name="sparkles" size={21} color={colors.warning} />
            </View>
            {conversation.suggestionsLoading ? (
              <View style={styles.suggestionsLoading}>
                <ActivityIndicator color={colors.primary} />
                <Text style={styles.suggestionsHint}>מכין הצעות לפי השיחה…</Text>
              </View>
            ) : conversation.suggestions.length > 0 ? (
              conversation.suggestions.map((suggestion) => (
                <Pressable
                  key={suggestion}
                  style={styles.suggestion}
                  onPress={() => submit(suggestion)}
                >
                  <Ionicons name="paper-plane" size={17} color={colors.primary} />
                  <Text style={styles.suggestionText}>{suggestion}</Text>
                </Pressable>
              ))
            ) : (
              <View style={styles.suggestionsLoading}>
                <Text style={styles.suggestionsHint}>לא הצלחנו להכין הצעות. ודא שהשרת פעיל ונסה שוב.</Text>
                <Pressable style={styles.retry} onPress={() => void conversation.loadSuggestions()}>
                  <Text style={styles.retryText}>נסה שוב</Text>
                </Pressable>
              </View>
            )}
          </Pressable>
        </Pressable>
      </Modal>
      <Modal
        visible={languageOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setLanguageOpen(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setLanguageOpen(false)}>
          <Pressable style={styles.languageCard} onPress={(event) => event.stopPropagation()}>
            <View style={styles.suggestionsHeader}>
              <Pressable onPress={() => setLanguageOpen(false)}>
                <Ionicons name="close" size={22} color={colors.muted} />
              </Pressable>
              <Text style={styles.suggestionsTitle}>באיזו שפה אתה מדבר עכשיו?</Text>
              <Ionicons name="language" size={21} color={colors.primaryLight} />
            </View>
            {(['he', 'en'] as const).map((language) => {
              const selected = settings.recognitionLanguage === language;
              return (
                <Pressable
                  key={language}
                  style={[styles.languageChoice, selected && styles.languageChoiceSelected]}
                  onPress={() => {
                    update({ recognitionLanguage: language as RecognitionLanguage });
                    conversation.setRecognitionLanguage(language);
                    setLanguageOpen(false);
                  }}
                >
                  <Ionicons
                    name={language === 'he' ? 'language-outline' : 'chatbubble-ellipses-outline'}
                    size={20}
                    color={selected ? colors.text : colors.primaryLight}
                  />
                  <Text style={[styles.languageChoiceText, selected && styles.languageChoiceTextSelected]}>
                    {languageLabels[language]}
                  </Text>
                  {selected && <Ionicons name="checkmark-circle" size={20} color={colors.text} />}
                </Pressable>
              );
            })}
            <Text style={styles.languageHint}>בחר שפה לפני הלחיצה על המיקרופון. השיחה הקיימת נשמרת.</Text>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  dock: { backgroundColor: colors.background, borderTopWidth: 1, borderTopColor: colors.border },
  composer: {
    minHeight: 66,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  magic: {
    width: 38,
    height: 42,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sound: {
    width: 42,
    height: 42,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  soundMuted: { borderColor: colors.danger },
  inputWrap: {
    flex: 1,
    minHeight: 44,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  input: { flex: 1, color: colors.text, textAlign: 'left', outlineStyle: 'none' } as never,
  mic: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },
  micRecording: { backgroundColor: colors.danger },
  micDisabled: { opacity: 0.45 },
  language: {
    minWidth: 42,
    height: 42,
    paddingHorizontal: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  languageText: { color: colors.primaryLight, fontSize: 12, fontWeight: '900' },
  cancelRecording: {
    width: 42,
    height: 42,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.danger,
    backgroundColor: '#321523',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nav: {
    height: 64,
    paddingHorizontal: spacing.sm,
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  navItem: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4 },
  navLabel: { color: colors.muted, fontSize: 11 },
  navLabelActive: { color: colors.primary, fontWeight: '800' },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    padding: spacing.md,
    backgroundColor: 'rgba(1, 6, 16, 0.72)',
  },
  suggestionsCard: {
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    gap: spacing.sm,
  },
  suggestionsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  suggestionsTitle: { color: colors.text, fontSize: 18, fontWeight: '900' },
  suggestionsLoading: { minHeight: 120, alignItems: 'center', justifyContent: 'center', gap: 10 },
  suggestionsHint: { color: colors.muted, textAlign: 'center' },
  suggestion: {
    minHeight: 52,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  suggestionText: { flex: 1, color: colors.text, fontSize: 15, textAlign: 'left' },
  retry: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.md, backgroundColor: colors.primary },
  retryText: { color: colors.text, fontWeight: '800' },
  languageCard: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    gap: spacing.sm,
  },
  languageChoice: {
    minHeight: 54,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: spacing.sm,
  },
  languageChoiceSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  languageChoiceText: { flex: 1, color: colors.text, textAlign: 'right', fontWeight: '800' },
  languageChoiceTextSelected: { color: '#ffffff' },
  languageHint: { color: colors.muted, textAlign: 'right', fontSize: 12 },
});
