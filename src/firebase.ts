import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { doc, getDocFromServer, getFirestore } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import { type FirestoreErrorInfo, OperationType } from './types';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export const BOOTSTRAPPED_ADMIN_EMAIL = 'rohantmr.lover@gmail.com';
export const ADMIN_EMAIL_PATTERN = /^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$/;

export function normalizeAdminEmail(email: string): string {
  return email.trim().toLowerCase();
}

export interface AuthErrorDetails {
  code: string;
  title: string;
  message: string;
  helpSteps?: string[];
}

export function formatFirebaseAuthError(error: unknown): AuthErrorDetails {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: unknown }).code || '')
      : '';
  const rawMessage =
    error instanceof Error ? error.message : 'Authentication failed.';

  switch (code) {
    case 'auth/unauthorized-domain': {
      const host =
        typeof window !== 'undefined' && window.location.hostname
          ? window.location.hostname
          : 'this domain';
      return {
        code,
        title: 'Domain Not Authorized for Sign-In',
        message: `Firebase Authentication blocked sign-in from "${host}" because it is not in your project's Authorized Domains allowlist.`,
        helpSteps: [
          `Open Firebase Console → Authentication → Settings → Authorized domains (Project: ${firebaseConfig.projectId}).`,
          `Click "Add domain" and add "${host}".`,
          'Save your changes, then refresh this page and sign in again.',
        ],
      };
    }
    case 'auth/popup-blocked':
      return {
        code,
        title: 'Sign-In Popup Blocked',
        message:
          'Your browser blocked the Google Sign-In popup window. Allow popups for this site and click Sign in with Google again.',
      };
    case 'auth/popup-closed-by-user':
      return {
        code,
        title: 'Sign-In Window Closed',
        message:
          'The Google Sign-In popup was closed before sign-in finished. Please try again.',
      };
    case 'auth/cancelled-popup-request':
      return {
        code,
        title: 'Sign-In Interrupted',
        message:
          'A previous sign-in request was cancelled because another popup was opened. Please try again.',
      };
    case 'auth/account-exists-with-different-credential':
      return {
        code,
        title: 'Account Sign-In Method Conflict',
        message:
          'An account already exists with this email address using a different sign-in provider. Sign in with the Google account registered for administration.',
      };
    case 'auth/user-disabled':
      return {
        code,
        title: 'Administrator Account Disabled',
        message:
          'This Google account has been disabled in Firebase Authentication. Re-enable it in Firebase Console or sign in with another administrator account.',
      };
    case 'auth/user-not-found':
    case 'auth/invalid-credential':
    case 'auth/user-token-expired':
      return {
        code,
        title: 'Account Verification Error',
        message:
          'Your Google account credentials could not be verified or your session expired. Please sign in again.',
      };
    case 'auth/operation-not-allowed':
      return {
        code,
        title: 'Google Sign-In Provider Disabled',
        message:
          'Google Sign-In is currently disabled in Firebase Authentication. Enable the Google provider in Firebase Console → Authentication → Sign-in method.',
      };
    case 'auth/network-request-failed':
      return {
        code,
        title: 'Network Connection Error',
        message:
          'Unable to reach Firebase Authentication. Check your internet connection and try again.',
      };
    case 'auth/too-many-requests':
      return {
        code,
        title: 'Too Many Sign-In Attempts',
        message:
          'Too many sign-in attempts occurred in a short period. Please wait a moment and try again.',
      };
    case 'auth/web-storage-unsupported':
      return {
        code,
        title: 'Browser Storage Blocked',
        message:
          'Browser cookies or web storage are disabled, which prevents Google Sign-In from completing. Enable site storage and try again.',
      };
    default:
      return {
        code: code || 'auth/unknown',
        title: 'Sign-In Failed',
        message: rawMessage,
      };
  }
}

export function extractFirebaseErrorDetails(error: unknown): {
  code: string;
  message: string;
} {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: unknown }).code || '')
      : '';
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
      ? error
      : 'Unknown Firestore error';
  return { code, message };
}

export function reportFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): FirestoreErrorInfo & { code: string } {
  const { code, message } = extractFirebaseErrorDetails(error);
  const errInfo: FirestoreErrorInfo = {
    error: message,
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify({ code, ...errInfo }));
  return { code, ...errInfo };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const info = reportFirestoreError(error, operationType, path);
  throw new Error(JSON.stringify(info));
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'branding', 'default'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

void testConnection();
