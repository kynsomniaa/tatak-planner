import React, { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import { colors, contrastText, useAppTheme } from '../theme';

export function PrimaryButton({
  label,
  onPress,
  disabled = false,
  loading = false,
  tone = 'green',
  style,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  tone?: 'green' | 'light' | 'danger';
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useAppTheme();
  const buttonBackground = tone === 'light' ? theme.green100 : tone === 'danger' ? theme.danger : theme.green800;
  const buttonForeground = contrastText(buttonBackground);
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: buttonBackground },
        tone === 'light' && styles.buttonLight,
        tone === 'light' && { backgroundColor: theme.green100, borderColor: theme.border },
        tone === 'danger' && { backgroundColor: theme.danger },
        (disabled || loading) && styles.disabled,
        pressed && styles.pressed,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={buttonForeground} />
      ) : (
        <Text style={[styles.buttonText, { color: buttonForeground }]}> 
          {label}
        </Text>
      )}
    </Pressable>
  );
}

export function SectionTitle({ title, action }: { title: string; action?: ReactNode }) {
  const theme = useAppTheme();
  return (
    <View style={styles.sectionHeader}>
      <Text style={[styles.sectionTitle, { color: theme.ink }]}>{title}</Text>
      {action}
    </View>
  );
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  const theme = useAppTheme();
  return (
    <View style={[styles.empty, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <Text style={[styles.emptyIcon, { color: theme.green700 }]}>◇</Text>
      <Text style={[styles.emptyTitle, { color: theme.ink }]}>{title}</Text>
      <Text style={[styles.emptyBody, { color: theme.muted }]}>{body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 50,
    borderRadius: 14,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.green800,
  },
  buttonLight: {
    backgroundColor: colors.green100,
    borderWidth: 1,
    borderColor: '#B8DDC9',
  },
  buttonDanger: { backgroundColor: colors.danger },
  buttonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  buttonTextLight: { color: colors.green900 },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.78, transform: [{ scale: 0.99 }] },
  sectionHeader: {
    marginTop: 22,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: { fontSize: 19, fontWeight: '900', color: colors.ink },
  empty: {
    padding: 28,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    borderRadius: 18,
    alignItems: 'center',
    backgroundColor: colors.surface,
  },
  emptyIcon: { fontSize: 30, color: colors.green700 },
  emptyTitle: { marginTop: 8, fontSize: 16, fontWeight: '800', color: colors.ink },
  emptyBody: {
    marginTop: 5,
    textAlign: 'center',
    color: colors.muted,
    lineHeight: 20,
  },
});
