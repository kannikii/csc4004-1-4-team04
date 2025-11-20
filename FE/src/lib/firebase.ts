import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage'; // ✅ 추가

const firebaseConfig = {
  apiKey: "AIzaSyBrYQhIUk_KkjDViOORGL9CDo-OOc-auEc",
  authDomain: "csc4004-1-4-team04.firebaseapp.com",
  projectId: "csc4004-1-4-team04",
  storageBucket: "csc4004-1-4-team04.firebasestorage.app", // ✅ Storage 버킷
  messagingSenderId: "195272516733",
  appId: "1:195272516733:web:5b008b9bd5f7c35462bd14"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app); // ✅ Storage 추가
export const googleProvider = new GoogleAuthProvider();

googleProvider.setCustomParameters({
  prompt: 'select_account'
});