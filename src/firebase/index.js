import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";
import { getFirestore, doc, setDoc, onSnapshot, collection, addDoc, getDocs, query, orderBy, limit, enableIndexedDbPersistence } from "firebase/firestore";

const envConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};
function getFirebaseConfig() {
  const hasEnv = Object.values(envConfig).every((v) => typeof v === "string" && v?.length > 0);
  if (hasEnv) return { ...envConfig };
  try { const raw = localStorage.getItem("budget-fbconfig"); if (raw) return JSON.parse(raw); } catch {}
  return null;
}

export {
  initializeApp, getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged,
  getFirestore, doc, setDoc, onSnapshot, collection, addDoc, getDocs, query, orderBy, limit, enableIndexedDbPersistence,
  envConfig, getFirebaseConfig
};
