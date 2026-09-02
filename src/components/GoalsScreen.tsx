import React, { useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { colors, contrastText, useAppTheme } from '../theme';
import { GoalKind, PlanSuggestion, StudentGoal, StudentWorkspace } from '../types';
import { goalSuggestions } from '../domain/optimizer';
import { applyMoves } from '../domain/planner';
import { aiOptimizerConfigured, requestAiSuggestions } from '../services/aiOptimizer';
import { EmptyState, PrimaryButton } from './ui';

const goalOptions: Array<{ kind: GoalKind; name: string; description: string; icon: string }> = [
  { kind: 'earliest_graduation', name: 'Earliest graduation', description: 'Find safe opportunities to pull prerequisite chains forward.', icon: '↗' },
  { kind: 'lighter_workload', name: 'Lighter workload', description: 'Spread heavy trimesters without creating invalid placements.', icon: '≋' },
  { kind: 'thesis_readiness', name: 'Thesis readiness', description: 'Prioritize the chain leading to thesis or capstone courses.', icon: '◎' },
  { kind: 'custom', name: 'Custom goal', description: 'Describe what matters to you in your own words.', icon: '✦' },
];

export function GoalsScreen({
  workspace,
  onChange,
}: {
  workspace: StudentWorkspace;
  onChange: (workspace: StudentWorkspace) => void;
}) {
  const theme = useAppTheme();
  const [customNotes, setCustomNotes] = useState(workspace.goal?.kind === 'custom' ? workspace.goal.notes : '');
  const [aiSuggestions, setAiSuggestions] = useState<PlanSuggestion[]>([]);
  const [loadingAi, setLoadingAi] = useState(false);
  const suggestions = useMemo(
    () => (aiSuggestions.length > 0 ? aiSuggestions : goalSuggestions(workspace, workspace.goal)),
    [aiSuggestions, workspace],
  );

  const chooseGoal = (kind: GoalKind) => {
    const option = goalOptions.find((candidate) => candidate.kind === kind) as (typeof goalOptions)[number];
    const goal: StudentGoal = {
      id: `${kind}-${Date.now()}`,
      kind,
      name: option.name,
      notes: kind === 'custom' ? customNotes : option.description,
      allowAiChanges: workspace.goal?.allowAiChanges ?? false,
    };
    setAiSuggestions([]);
    onChange({ ...workspace, goal, updatedAt: new Date().toISOString() });
  };

  const updateGoal = (patch: Partial<StudentGoal>) => {
    if (!workspace.goal) return;
    onChange({
      ...workspace,
      goal: { ...workspace.goal, ...patch },
      updatedAt: new Date().toISOString(),
    });
  };

  const askAi = async () => {
    if (!workspace.goal) return;
    setLoadingAi(true);
    try {
      const result = await requestAiSuggestions(workspace, workspace.goal);
      setAiSuggestions(result);
      if (result.length === 0) Alert.alert('No AI changes suggested', 'Your plan may already be close to this goal.');
    } catch (error) {
      Alert.alert('AI optimizer unavailable', String((error as Error).message));
    } finally {
      setLoadingAi(false);
    }
  };

  const apply = (suggestion: PlanSuggestion) => {
    if (!workspace.goal?.allowAiChanges) {
      Alert.alert('Review-only mode', 'Enable “Allow automatic plan changes” first.');
      return;
    }
    const result = applyMoves(workspace, suggestion.moves);
    if (!result.ok) {
      Alert.alert('Suggestion rejected by rule engine', result.violations.map((item) => item.message).join('\n\n'));
      return;
    }
    onChange(result.workspace);
    setAiSuggestions([]);
    Alert.alert('Plan updated', `${result.movedCodes.join(', ')} moved. You can still undo by moving the cards back.`);
  };

  return (
    <ScrollView contentContainerStyle={[styles.page, { backgroundColor: theme.canvas }]}>
      <Text style={[styles.eyebrow, { color: theme.green700 }]}>GOAL LAB</Text>
      <Text style={[styles.title, { color: theme.ink }]}>Plan toward an outcome</Text>
      <Text style={[styles.subtitle, { color: theme.muted }]}>Choose one optimization goal at a time. Hints come first and nothing changes unless you explicitly apply it.</Text>
      <View style={[styles.strictRule, { backgroundColor: theme.green100, borderColor: theme.green700 }]}><Text style={[styles.strictRuleText, { color: contrastText(theme.green100, '#FFFFFF', theme.green900) }]}>STRICT CURRICULUM MODE · Generated plans are discarded unless every prerequisite and corequisite remains valid.</Text></View>

      <View style={styles.options}>
        {goalOptions.map((option) => {
          const active = workspace.goal?.kind === option.kind;
          return (
            <Pressable key={option.kind} onPress={() => chooseGoal(option.kind)} style={[styles.option, { backgroundColor: theme.surface, borderColor: theme.border }, active && styles.optionActive, active && { backgroundColor: theme.green900, borderColor: theme.green900 }]}>
              <Text style={[styles.optionIcon, { backgroundColor: active ? theme.green800 : theme.green100, color: active ? contrastText(theme.green800) : contrastText(theme.green100, '#FFFFFF', theme.green900) }]}>{option.icon}</Text>
              <View style={styles.optionCopy}>
                <Text style={[styles.optionTitle, { color: active ? contrastText(theme.green900) : theme.ink }]}>{option.name}</Text>
                <Text style={[styles.optionDescription, { color: active ? contrastText(theme.green900) : theme.muted }]}>{option.description}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>

      {workspace.goal?.kind === 'custom' && (
        <View style={[styles.customCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[styles.label, { color: theme.ink }]}>What should the plan optimize for?</Text>
          <TextInput
            multiline
            onChangeText={(value) => {
              setCustomNotes(value);
              updateGoal({ notes: value });
            }}
            placeholder="Example: Keep Fridays light and protect the embedded-systems track..."
            placeholderTextColor={theme.muted}
            style={[styles.customInput, { backgroundColor: theme.canvas, borderColor: theme.border, color: theme.ink }]}
            value={customNotes}
          />
        </View>
      )}

      {workspace.goal && (
        <View style={[styles.controlCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={styles.controlCopy}>
            <Text style={[styles.controlTitle, { color: theme.ink }]}>Allow automatic plan changes</Text>
            <Text style={[styles.controlBody, { color: theme.muted }]}>Off means every optimizer stays in hint-only mode.</Text>
          </View>
          <Switch
            onValueChange={(allowAiChanges) => updateGoal({ allowAiChanges })}
            trackColor={{ false: theme.border, true: theme.green100 }}
            thumbColor={workspace.goal.allowAiChanges ? theme.green700 : theme.muted}
            value={workspace.goal.allowAiChanges}
          />
        </View>
      )}

      <View style={styles.suggestionHeader}>
        <View><Text style={[styles.suggestionTitle, { color: theme.ink }]}>Recommended next moves</Text><Text style={[styles.suggestionSub, { color: theme.muted }]}>All suggestions pass the local rule engine before they can apply.</Text></View>
      </View>

      {!workspace.goal ? (
        <EmptyState title="Choose a goal" body="Select one of the outcomes above to generate planning hints." />
      ) : suggestions.length === 0 ? (
        <EmptyState
          title={workspace.goal.kind === 'custom' ? 'Custom goals need the AI connector' : 'No safe move found'}
          body={workspace.goal.kind === 'custom' ? 'Connect an optimizer endpoint, then ask AI for a proposal.' : 'Try updating progress or selecting another goal.'}
        />
      ) : (
        suggestions.map((suggestion) => (
          <View key={suggestion.id} style={[styles.suggestion, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={[styles.hintLabel, { color: theme.green700 }]}>HINT</Text>
            <Text style={[styles.hintTitle, { color: theme.ink }]}>{suggestion.title}</Text>
            <Text style={[styles.hintDetail, { color: theme.muted }]}>{suggestion.detail}</Text>
            <Text style={[styles.impact, { color: theme.green700 }]}>{suggestion.impact}</Text>
            {suggestion.moves.length > 0 && (
              <PrimaryButton label="Apply this change" onPress={() => apply(suggestion)} tone="light" style={styles.applyButton} />
            )}
          </View>
        ))
      )}

      {workspace.goal && (
        <PrimaryButton
          label={aiOptimizerConfigured ? 'Ask AI for another plan' : 'AI connector not configured'}
          disabled={!aiOptimizerConfigured || !workspace.goal.notes.trim()}
          loading={loadingAi}
          onPress={askAi}
          style={styles.aiButton}
        />
      )}
      <Text style={[styles.aiNote, { color: theme.muted }]}>AI output is treated as a suggestion only. The app rejects any returned move that breaks prerequisite or corequisite rules.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 20, paddingBottom: 110, backgroundColor: colors.canvas },
  eyebrow: { color: colors.green700, fontSize: 10, fontWeight: '900', letterSpacing: 1.1 },
  title: { marginTop: 5, color: colors.ink, fontSize: 27, fontWeight: '900' },
  subtitle: { marginTop: 6, color: colors.muted, lineHeight: 20, fontSize: 13 },
  strictRule: { marginTop: 12, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, borderWidth: 1 },
  strictRuleText: { fontSize: 9, lineHeight: 14, fontWeight: '900', letterSpacing: 0.3 },
  options: { marginTop: 18, gap: 9 },
  option: { flexDirection: 'row', alignItems: 'center', padding: 14, backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border },
  optionActive: { backgroundColor: colors.green900, borderColor: colors.green900 },
  optionIcon: { width: 38, height: 38, textAlign: 'center', textAlignVertical: 'center', borderRadius: 12, backgroundColor: colors.green100, color: colors.green800, fontSize: 21, fontWeight: '900' },
  optionIconActive: { backgroundColor: '#275D48', color: colors.gold },
  optionCopy: { flex: 1, marginLeft: 12 },
  optionTitle: { color: colors.ink, fontWeight: '900', fontSize: 15 },
  optionTitleActive: { color: '#FFFFFF' },
  optionDescription: { marginTop: 3, color: colors.muted, fontSize: 11, lineHeight: 16 },
  optionDescriptionActive: { color: '#BDD7CA' },
  customCard: { marginTop: 12, padding: 15, backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border },
  label: { color: colors.ink, fontSize: 12, fontWeight: '800' },
  customInput: { marginTop: 8, minHeight: 92, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.canvas, padding: 12, textAlignVertical: 'top', color: colors.ink },
  controlCard: { marginTop: 12, padding: 15, backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center' },
  controlCopy: { flex: 1, paddingRight: 10 },
  controlTitle: { color: colors.ink, fontWeight: '900', fontSize: 13 },
  controlBody: { marginTop: 3, color: colors.muted, fontSize: 11, lineHeight: 15 },
  suggestionHeader: { marginTop: 23, marginBottom: 10 },
  suggestionTitle: { color: colors.ink, fontWeight: '900', fontSize: 19 },
  suggestionSub: { marginTop: 3, color: colors.muted, fontSize: 10 },
  suggestion: { backgroundColor: colors.surface, borderRadius: 17, padding: 16, marginBottom: 9, borderWidth: 1, borderColor: colors.border },
  hintLabel: { color: colors.green700, fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  hintTitle: { marginTop: 5, color: colors.ink, fontSize: 16, fontWeight: '900' },
  hintDetail: { marginTop: 5, color: colors.muted, fontSize: 12, lineHeight: 18 },
  impact: { marginTop: 9, color: colors.green800, fontSize: 11, fontWeight: '800' },
  applyButton: { marginTop: 13, minHeight: 43 },
  aiButton: { marginTop: 13 },
  aiNote: { marginTop: 9, textAlign: 'center', color: colors.muted, fontSize: 10, lineHeight: 15 },
});
