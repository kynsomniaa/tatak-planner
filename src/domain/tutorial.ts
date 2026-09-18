import AsyncStorage from '@react-native-async-storage/async-storage';

export const TUTORIAL_VERSION = 1;

interface TutorialState {
  completedVersion?: number;
  pendingVersion?: number;
}

const tutorialKey = (accountId: string) => `tam-core:tutorial:${accountId}`;

async function readState(accountId: string): Promise<TutorialState> {
  try {
    const raw = await AsyncStorage.getItem(tutorialKey(accountId));
    return raw ? JSON.parse(raw) as TutorialState : {};
  } catch {
    return {};
  }
}

export async function markTutorialPending(accountId: string) {
  const state = await readState(accountId);
  await AsyncStorage.setItem(tutorialKey(accountId), JSON.stringify({
    ...state,
    pendingVersion: TUTORIAL_VERSION,
  } satisfies TutorialState));
}

export async function shouldResumeTutorial(accountId: string) {
  const state = await readState(accountId);
  return state.pendingVersion === TUTORIAL_VERSION && state.completedVersion !== TUTORIAL_VERSION;
}

export async function completeTutorial(accountId: string) {
  await AsyncStorage.setItem(tutorialKey(accountId), JSON.stringify({
    completedVersion: TUTORIAL_VERSION,
  } satisfies TutorialState));
}
