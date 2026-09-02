import React, { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { colors } from '../theme';
import { AppSession } from '../types';
import { signIn } from '../services/session';
import { cloudConfigured } from '../services/supabase';
import { PrimaryButton } from './ui';

export function AuthScreen({ onAuthenticated }: { onAuthenticated: (session: AppSession) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setLoading(true);
    try {
      const session = await signIn(username, password, creating);
      onAuthenticated(session);
    } catch (error) {
      Alert.alert(creating ? 'Could not create account' : 'Could not sign in', String((error as Error).message));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.page}
      >
        <View style={styles.brandMark}>
          <Text style={styles.brandLetters}>CP</Text>
        </View>
        <Text style={styles.eyebrow}>FEU TECH STUDENT PLANNER</Text>
        <Text style={styles.title}>Build the route to your degree.</Text>
        <Text style={styles.subtitle}>
          Import your SOLAR curriculum, plan each trimester, and keep every prerequisite chain valid.
        </Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{creating ? 'Create your account' : 'Welcome back'}</Text>
          <View style={styles.previewNote}>
            <Text style={styles.previewText}>
              {cloudConfigured
                ? 'Anonymous username account. No email is collected and forgotten passwords cannot be recovered.'
                : 'Local preview: connect Supabase to enable shared accounts, private cloud plans, and course ratings.'}
            </Text>
          </View>
          <Text style={styles.label}>Username</Text>
          <TextInput
            autoCapitalize="none"
            autoComplete="username"
            onChangeText={setUsername}
            placeholder="Choose a username"
            placeholderTextColor="#9AA49F"
            style={styles.input}
            value={username}
          />
          <Text style={styles.label}>Password</Text>
          <TextInput
            autoCapitalize="none"
            autoComplete={creating ? 'new-password' : 'current-password'}
            onChangeText={setPassword}
            placeholder="At least 6 characters"
            placeholderTextColor="#9AA49F"
            secureTextEntry
            style={styles.input}
            value={password}
          />
          <PrimaryButton
            label={creating ? 'Create account' : 'Sign in'}
            loading={loading}
            onPress={submit}
            style={styles.submit}
          />
          <PrimaryButton
            label={creating ? 'I already have an account' : 'Create a new account'}
            onPress={() => setCreating((value) => !value)}
            tone="light"
            style={styles.switch}
          />
        </View>
        <Text style={styles.disclaimer}>
          {cloudConfigured
            ? 'Your public identity is only your username. Operational service logs may still exist.'
            : 'Preview accounts stay in this browser or device until Supabase is connected.'}
        </Text>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.green900 },
  page: { flex: 1, paddingHorizontal: 24, paddingTop: 36, justifyContent: 'center' },
  brandMark: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  brandLetters: { color: colors.green900, fontWeight: '900', fontSize: 19 },
  eyebrow: { color: '#A8D5BF', fontSize: 12, fontWeight: '900', letterSpacing: 1.3 },
  title: { marginTop: 8, color: '#FFFFFF', fontSize: 34, lineHeight: 39, fontWeight: '900' },
  subtitle: { marginTop: 10, color: '#C8DDD3', fontSize: 15, lineHeight: 22 },
  card: { marginTop: 26, padding: 20, borderRadius: 22, backgroundColor: colors.surface },
  cardTitle: { fontSize: 20, fontWeight: '900', color: colors.ink, marginBottom: 6 },
  previewNote: { backgroundColor: colors.warningSoft, padding: 10, borderRadius: 10, marginBottom: 4 },
  previewText: { color: colors.warning, fontSize: 12, lineHeight: 17, fontWeight: '600' },
  label: { color: colors.ink, fontWeight: '800', fontSize: 13, marginTop: 13, marginBottom: 6 },
  input: {
    height: 50,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 13,
    paddingHorizontal: 14,
    color: colors.ink,
    backgroundColor: '#FBFCFB',
  },
  submit: { marginTop: 18 },
  switch: { marginTop: 9 },
  disclaimer: { color: '#9FC1B1', textAlign: 'center', fontSize: 11, marginTop: 18, lineHeight: 16 },
});
