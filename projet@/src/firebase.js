import { initializeApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";
import {
  getFirestore, doc, setDoc, collection, onSnapshot,
} from "firebase/firestore";
import { getStorage } from "firebase/storage";
import {
  getAuth, GoogleAuthProvider, GithubAuthProvider, FacebookAuthProvider, onAuthStateChanged
} from "firebase/auth";
import {
  getDatabase, ref as rtdbRef, set as rtdbSet, onDisconnect,
  serverTimestamp as rtdbServerTimestamp, onValue as rtdbOnValue,
} from "firebase/database";

// --- Configuration ---
const firebaseConfig = {
  apiKey: "AIzaSyDjqmrv78ju0bmrxBBrLPh3KuBl7CIRFDg",
  authDomain: "exammisession-4919a.firebaseapp.com",
  projectId: "exammisession-4919a",
  storageBucket: "gs://exammisession-4919a.firebasestorage.app",
  messagingSenderId: "64207295911",
  appId: "1:64207295911:web:68ec666c1d5fac5ab61282",
};

// --- Initialisation ---
const app = initializeApp(firebaseConfig);

// --- App Check (protection reCAPTCHA) ---
const appCheck = initializeAppCheck(app, {
  provider: new ReCaptchaV3Provider("6Ld0TgksAAAAAB1G8-KCo757emaI8SsHrrdxlKWu"), // Replace with your reCAPTCHA site key
  isTokenAutoRefreshEnabled: true,
});
window.firebaseApp = app;

// --- Services Firebase ---
export const firestore = getFirestore(app);
export const storage = getStorage(app);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const githubProvider = new GithubAuthProvider();
export const facebookProvider = new FacebookAuthProvider();
export const rtdb = getDatabase(app);
// Alias used by some components
export const db = firestore;

// --- Example Export ---
export const initPresenceWatcher = () => {
  console.log("Presence watcher initialized");
};

// ... (reste du code identique)
