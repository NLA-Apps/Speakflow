import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { AppScaffold } from '@/components/AppScaffold';
import { AppButton } from '@/components/AppButton';
import { TranscriptBubble } from '@/components/TranscriptBubble';
import { ThinkingBubble } from '@/components/ThinkingBubble';
import { useConversation } from '@/state/conversation';
import { useSettings } from '@/state/settings';
import { colors, radius, spacing, typography } from '@/theme';
import type { ConversationScenario } from '@speakingflow/shared';

const labels: Record<string, string> = {
  idle: 'מוכן', requesting_permission: 'מבקש הרשאה', fetching_token: 'מכין שיחה',
  connecting: 'מתחבר', connected: 'מחובר', listening: 'מקשיב',
  user_speaking: 'אתה מדבר', waiting_for_response: 'Sky חושבת',
  assistant_speaking: 'Sky מדברת', interrupting: 'עוצר', reconnecting: 'מתחבר מחדש',
  disconnecting: 'מסיים', error: 'שגיאה',
};
const scenarioLabels = {
  free: 'שיחה חופשית',
  job_interview: 'ראיון עבודה',
  restaurant: 'במסעדה',
} as const;
const scenarioOptions: { id: ConversationScenario; icon: keyof typeof Ionicons.glyphMap; description: string }[] = [
  { id: 'free', icon: 'chatbubble-ellipses', description: 'שיחה טבעית על כל נושא שמעניין אותך' },
  { id: 'job_interview', icon: 'briefcase', description: 'סימולציית ראיון עם שאלות ומשוב' },
  { id: 'restaurant', icon: 'restaurant', description: 'תרגול הזמנה ושיחה עם מלצר' },
];
export default function ConversationScreen() {
  const conversation = useConversation();
  const { settings } = useSettings();
  const list = useRef<FlatList>(null);
  const [scenarioOpen, setScenarioOpen] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const { start } = conversation;
  useEffect(() => { void start(); }, [start]);
  const minutes = String(Math.floor(conversation.elapsed / 60)).padStart(2, '0');
  const seconds = String(conversation.elapsed % 60).padStart(2, '0');
  const active = ['user_speaking', 'assistant_speaking', 'listening'].includes(conversation.phase);
  const visibleTranscripts = useMemo(
    () => conversation.transcripts.filter((item) => !(item.role === 'assistant' && item.partial)),
    [conversation.transcripts],
  );
  const latestCompleteTranscript = [...visibleTranscripts]
    .reverse()
    .find((item) => !item.partial && item.role !== 'system');
  const skyIsThinking =
    conversation.phase === 'waiting_for_response' ||
    conversation.transcripts.some((item) => item.role === 'assistant' && item.partial) ||
    (!conversation.error &&
      conversation.muted &&
      latestCompleteTranscript?.role === 'user' &&
      conversation.phase !== 'user_speaking');
  const statusLabel = conversation.voicePreview
    ? 'מתמלל בזמן אמת'
    : labels[conversation.phase];
  return (
    <AppScaffold active="chat" scroll={false} contentStyle={styles.content}>
      <View style={styles.sessionHeader}>
        <View style={styles.status}>
          <View style={[styles.dot, { backgroundColor: conversation.phase === 'error' ? colors.danger : active ? colors.success : colors.warning }]} />
          <Text style={styles.statusText}>{statusLabel}</Text>
        </View>
        <Pressable
          style={styles.modeBadge}
          onPress={() => setScenarioOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="בחירת תרחיש שיחה"
        >
          <Ionicons
            name={conversation.scenario === 'job_interview' ? 'briefcase' : conversation.scenario === 'restaurant' ? 'restaurant' : 'chatbubble-ellipses'}
            size={14}
            color={colors.primaryLight}
          />
          <Text style={styles.modeText}>{scenarioLabels[conversation.scenario]}</Text>
          <Ionicons name="chevron-down" size={13} color={colors.muted} />
        </Pressable>
        <Text style={styles.timer}>{minutes}:{seconds}</Text>
        <Pressable
          style={styles.clearButton}
          onPress={() => setClearOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="נקה שיחה"
        >
          <Ionicons name="trash-outline" size={17} color={colors.muted} />
        </Pressable>
      </View>
      <FlatList
        ref={list}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        data={settings.showTranscript ? visibleTranscripts : []}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <TranscriptBubble item={item} />}
        onContentSizeChange={() => list.current?.scrollToEnd({ animated: false })}
        ListEmptyComponent={
          <View style={styles.empty}>
            <View style={styles.avatar}><Ionicons name="sparkles" size={28} color={colors.warning} /></View>
            <Text style={styles.emptyTitle}>השיחה שלך עם Sky</Text>
            <Text style={styles.emptyText}>התחל לדבר באנגלית. כל תשובה תופיע כאן, ותוכל ללחוץ על כל מילה לתרגום.</Text>
          </View>
        }
        ListFooterComponent={settings.showTranscript && skyIsThinking ? <ThinkingBubble /> : null}
      />
      {conversation.voicePreview && (
        <View style={styles.voicePreview} accessibilityLabel="תצוגה מקדימה של התמלול">
          <View style={styles.voicePreviewTop}>
            <View style={styles.liveStatus}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>
                מתמלל בזמן אמת
              </Text>
            </View>
            <Pressable
              style={styles.cancelPreview}
              onPress={conversation.cancelVoicePreview}
              accessibilityRole="button"
              accessibilityLabel="בטל את ההודעה"
            >
              <Ionicons name="close" size={16} color={colors.danger} />
              <Text style={styles.cancelPreviewText}>בטל</Text>
            </Pressable>
          </View>
          <Text style={styles.voicePreviewText}>
            {conversation.voicePreview.text || 'אני מקשיבה…'}
          </Text>
        </View>
      )}
      {conversation.error && (
        <View style={styles.error}>
          <Ionicons name="alert-circle" size={20} color={colors.danger} />
          <Text style={styles.errorText}>{conversation.error}</Text>
          <AppButton title="נסה שוב" onPress={() => void conversation.start()} />
        </View>
      )}
      <Modal
        visible={clearOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setClearOpen(false)}
      >
        <Pressable style={styles.modalBackdropCenter} onPress={() => setClearOpen(false)}>
          <Pressable style={styles.clearCard} onPress={(event) => event.stopPropagation()}>
            <View style={styles.clearIcon}>
              <Ionicons name="trash-outline" size={25} color={colors.danger} />
            </View>
            <Text style={styles.clearTitle}>לנקות את השיחה?</Text>
            <Text style={styles.clearDescription}>
              ההודעות וההקשר של Sky יימחקו ותתחיל שיחה חדשה. ההתקדמות ואוצר המילים שלך יישמרו.
            </Text>
            <View style={styles.clearActions}>
              <Pressable style={styles.cancelClearButton} onPress={() => setClearOpen(false)}>
                <Text style={styles.cancelClearText}>ביטול</Text>
              </Pressable>
              <Pressable
                style={styles.confirmClearButton}
                onPress={() => {
                  setClearOpen(false);
                  void conversation.clearConversation();
                }}
              >
                <Ionicons name="trash-outline" size={17} color={colors.text} />
                <Text style={styles.confirmClearText}>נקה שיחה</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
      <Modal
        visible={scenarioOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setScenarioOpen(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setScenarioOpen(false)}>
          <Pressable style={styles.scenarioCard} onPress={(event) => event.stopPropagation()}>
            <View style={styles.scenarioHeader}>
              <Pressable onPress={() => setScenarioOpen(false)} accessibilityLabel="סגור">
                <Ionicons name="close" size={23} color={colors.muted} />
              </Pressable>
              <View>
                <Text style={styles.scenarioTitle}>בחר תרחיש שיחה</Text>
                <Text style={styles.scenarioSubtitle}>ההיסטוריה הקיימת תישמר</Text>
              </View>
              <Ionicons name="compass" size={23} color={colors.primaryLight} />
            </View>
            {scenarioOptions.map((option) => {
              const selected = conversation.scenario === option.id;
              return (
                <Pressable
                  key={option.id}
                  style={[styles.scenarioChoice, selected && styles.scenarioChoiceSelected]}
                  accessibilityRole="button"
                  accessibilityLabel={`תרחיש ${scenarioLabels[option.id]}`}
                  onPress={() => {
                    setScenarioOpen(false);
                    void conversation.startScenario(option.id);
                  }}
                >
                  <Ionicons name={option.icon} size={22} color={selected ? colors.text : colors.primaryLight} />
                  <View style={styles.scenarioCopy}>
                    <Text style={styles.scenarioChoiceTitle}>{scenarioLabels[option.id]}</Text>
                    <Text style={styles.scenarioDescription}>{option.description}</Text>
                  </View>
                  {selected && <Ionicons name="checkmark-circle" size={21} color={colors.success} />}
                </Pressable>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>
    </AppScaffold>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: spacing.sm, paddingBottom: spacing.sm },
  sessionHeader: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm },
  status: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 }, statusText: { color: colors.text, fontWeight: '800' },
  modeBadge: { flex: 1, flexDirection: 'row-reverse', justifyContent: 'center', alignItems: 'center', gap: 5 },
  modeText: { color: colors.primaryLight, fontSize: 12 }, timer: { color: colors.muted, fontVariant: ['tabular-nums'] },
  clearButton: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  list: { flex: 1, marginTop: 4 }, listContent: { flexGrow: 1, paddingVertical: 6 },
  empty: { flex: 1, minHeight: 250, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  avatar: { width: 62, height: 62, borderRadius: 31, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentSoft },
  emptyTitle: { ...typography.heading, color: colors.text, marginTop: spacing.md },
  emptyText: { ...typography.body, color: colors.muted, textAlign: 'center', marginTop: spacing.sm },
  error: { padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.danger, backgroundColor: '#321523', gap: spacing.sm },
  errorText: { color: colors.text, textAlign: 'right' },
  voicePreview: { marginTop: spacing.sm, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.success, backgroundColor: '#0C2B2A', gap: spacing.sm },
  voicePreviewTop: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  liveStatus: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.success },
  liveText: { color: colors.success, fontSize: 12, fontWeight: '800' },
  cancelPreview: { minHeight: 32, paddingHorizontal: 10, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.danger, flexDirection: 'row', alignItems: 'center', gap: 4 },
  cancelPreviewText: { color: colors.danger, fontSize: 12, fontWeight: '800' },
  voicePreviewText: { color: colors.text, fontSize: 16, lineHeight: 23, textAlign: 'left', writingDirection: 'auto' },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', padding: spacing.md, backgroundColor: 'rgba(1, 6, 16, 0.76)' },
  modalBackdropCenter: { flex: 1, justifyContent: 'center', padding: spacing.lg, backgroundColor: 'rgba(1, 6, 16, 0.82)' },
  clearCard: { width: '100%', maxWidth: 390, alignSelf: 'center', alignItems: 'center', padding: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.border },
  clearIcon: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', backgroundColor: '#321523' },
  clearTitle: { ...typography.heading, color: colors.text, marginTop: spacing.md },
  clearDescription: { ...typography.body, color: colors.muted, textAlign: 'center', marginTop: spacing.sm },
  clearActions: { width: '100%', flexDirection: 'row-reverse', gap: spacing.sm, marginTop: spacing.lg },
  confirmClearButton: { flex: 1, minHeight: 48, borderRadius: radius.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: colors.danger },
  confirmClearText: { color: colors.text, fontWeight: '900' },
  cancelClearButton: { flex: 1, minHeight: 48, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  cancelClearText: { color: colors.text, fontWeight: '800' },
  scenarioCard: { width: '100%', maxWidth: 460, alignSelf: 'center', padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.primaryBorder, gap: spacing.sm },
  scenarioHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.xs },
  scenarioTitle: { color: colors.text, textAlign: 'center', fontSize: 19, fontWeight: '900' },
  scenarioSubtitle: { color: colors.muted, textAlign: 'center', fontSize: 12, marginTop: 3 },
  scenarioChoice: { minHeight: 70, paddingHorizontal: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm },
  scenarioChoiceSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  scenarioCopy: { flex: 1 },
  scenarioChoiceTitle: { color: colors.text, textAlign: 'right', fontWeight: '900', fontSize: 15 },
  scenarioDescription: { color: colors.muted, textAlign: 'right', fontSize: 12, marginTop: 4 },
});
