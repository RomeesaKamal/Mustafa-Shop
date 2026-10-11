// Connects the app to your Firebase project (Google login + cloud database).
//
// HOW TO FILL THIS IN:
// Firebase console -> your project -> Project settings (gear icon) -> scroll to
// "Your apps" -> the web app (</>) -> "SDK setup and configuration" -> "Config".
// Copy the object it shows you and paste the values below.

import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyB-FO2jpC8WUQeUODrMMoPEr3jgsUuSE1s",
  authDomain: "mustafas-shop.firebaseapp.com",
  projectId: "mustafas-shop",
  storageBucket: "mustafas-shop.firebasestorage.app",
  messagingSenderId: "217719246542",
  appId: "1:217719246542:web:f9869f7b4e0dc81d714a9f",
};

// True once real values have been pasted in above. Used to show a helpful
// setup message instead of a crash if someone forgets this step.
export const firebaseConfigured = !Object.values(firebaseConfig).some((v) =>
  String(v).startsWith("PASTE_")
);

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();
