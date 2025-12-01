// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyCIfFeagVSWT3TXKhOR7jLGeFRaX3gC8eE",
  authDomain: "hs-money-tracker.firebaseapp.com",
  projectId: "hs-money-tracker",
  storageBucket: "hs-money-tracker.firebasestorage.app",
  messagingSenderId: "795242966045",
  appId: "1:795242966045:web:a07bc1bfb43571570c6af4",
  measurementId: "G-ZRFZHSGZVG"
};

// 파이어베이스 초기화
// (여기가 중요합니다! 변수명을 정확히 firebaseConfig로 넣어야 합니다.)
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);