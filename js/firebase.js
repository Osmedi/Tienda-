import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, signOut } from 'https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js';
import { getFirestore, doc, getDocFromServer } from 'https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey: "AIzaSyD-A7N0uUdVqKNPaFtwRgNa7MmSysQVx5o",
  authDomain: "stylehn-oficial.firebaseapp.com",
  projectId: "stylehn-oficial",
  storageBucket: "stylehn-oficial.firebasestorage.app",
  messagingSenderId: "520311802687",
  appId: "1:520311802687:web:c9d185e2d54e52e79ea18a"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();

// Auth helpers
export const loginWithGoogle = () => {
    // Prefer Popup as it is more reliable for session persistence in many modern browsers
    return signInWithPopup(auth, googleProvider).catch(error => {
        // Fallback to redirect only if popup is blocked or fails
        if (error.code === 'auth/popup-blocked' || error.code === 'auth/cancelled-popup-request') {
            return signInWithRedirect(auth, googleProvider);
        }
        console.error("Error en inicio de sesión:", error);
        alert("Error de Google Auth: " + error.message);
        throw error;
    });
};

export { getRedirectResult };
export const logout = () => signOut(auth);

// Connection test
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error && error.message && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration.");
    }
  }
}
testConnection();

// Error handler
export const OperationType = {
  CREATE: 'create',
  UPDATE: 'update',
  DELETE: 'delete',
  LIST: 'list',
  GET: 'get',
  WRITE: 'write',
};

export function handleFirestoreError(error, operationType, path) {
  const errInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));

  const errorOverlay = document.getElementById('error-overlay');
  const errorMessage = document.getElementById('error-message');
  if (errorOverlay && errorMessage) {
    errorMessage.textContent = `Error en ${operationType} (${path}): ${errInfo.error}`;
    errorOverlay.classList.remove('hidden');
  }

  throw new Error(JSON.stringify(errInfo));
}
