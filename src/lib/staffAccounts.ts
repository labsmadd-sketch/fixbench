import { deleteApp, initializeApp } from 'firebase/app';
import {
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  inMemoryPersistence,
  initializeAuth,
  signOut,
} from 'firebase/auth';
import { firebaseApp, usingEmulators } from './firebase';

// No ambiguous characters (0/O, 1/l/I) so the password can be read out or written down.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';

export function temporaryPassword(length = 10): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
}

/**
 * Create a staff sign-in from the owner's browser (Spark plan: no Cloud Functions).
 * Uses a separate, throwaway Firebase app so the owner stays signed in.
 * The caller then writes /users/{uid}; security rules allow that for the owner only.
 */
export async function createStaffLogin(email: string, password: string): Promise<string> {
  const app = initializeApp(firebaseApp.options, `staff-${Date.now()}`);
  try {
    const auth = initializeAuth(app, { persistence: inMemoryPersistence });
    if (usingEmulators) connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await signOut(auth);
    return cred.user.uid;
  } finally {
    await deleteApp(app);
  }
}

export function staffLoginError(code: string | undefined): string {
  switch (code) {
    case 'auth/email-already-in-use':
      return 'That email already has a sign-in. Use a different email, or turn the existing person back on in Settings.';
    case 'auth/invalid-email':
      return 'That email address does not look right.';
    case 'auth/weak-password':
      return 'The password must be at least 6 characters.';
    case 'auth/network-request-failed':
      return 'No connection. Adding staff needs the internet.';
    case 'auth/operation-not-allowed':
      return 'Email/Password sign-in is turned off for this Firebase project.';
    default:
      return 'Could not add this person. Try again.';
  }
}
