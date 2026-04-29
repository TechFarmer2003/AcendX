export const firebaseConfig = {
  apiKey: "AIzaSyCrVEiKj2X7uUS8ZNnLyaiv-Qqr3Zw6IHk",
  authDomain: "ascendx-6a3ea.firebaseapp.com",
  projectId: "ascendx-6a3ea",
  storageBucket: "ascendx-6a3ea.firebasestorage.app",
  messagingSenderId: "198193639442",
  appId: "1:198193639442:web:6a5dae82d4c949b5c668cb",
  measurementId: "G-7186C90RC1"
};

export function hasFirebaseConfig() {
  return !Object.values(firebaseConfig).some(value => value.startsWith("PASTE_"));
}
