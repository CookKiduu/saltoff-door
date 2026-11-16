/* Blue Tide cloud settings.
   The app works fully WITHOUT this (everything stays on your phone).
   To turn on sync + notifications, follow the setup guide:
   1. Replace null below with the firebaseConfig object from the Firebase console
      (the part from { to }, including the curly braces).
   2. VAPID_PUBLIC_KEY gets filled in automatically by "node setup-keys.js".
   These values are safe to be public. Your data is protected by firestore.rules. */

window.FIREBASE_CONFIG = null;

window.VAPID_PUBLIC_KEY = "";
