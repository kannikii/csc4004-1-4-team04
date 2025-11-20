import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  query,
  orderBy,
  limit,
  serverTimestamp,
  Timestamp,
  addDoc,
} from 'firebase/firestore';

import { ref, uploadBytes, getDownloadURL, getStorage } from 'firebase/storage';
import { db, storage } from './firebase';
import axios from 'axios';




// =============================
// 🔹 인터페이스 정의
// =============================
export interface PresentationData {
  id?: string;
  userId: string;
  title: string;
  videoURL: string;
  feedbackFile?: string;
  feedbackPreview?: string;
  overallScore: number;
  duration: number;
  metrics: {
    clarity: number;
    pace: number;
    confidence: number;
    engagement: number;
  };
  insights: string[];
  timestamp: Timestamp | Date;
  createdAt: any;
  updatedAt?: any;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  createdAt: any;
  updatedAt: any;
}

// =============================
// 🔹 사용자 프로필
// =============================
export async function createOrUpdateUserProfile(
  uid: string,
  data: Partial<UserProfile>
): Promise<void> {
  const userRef = doc(db, 'users', uid);
  const userDoc = await getDoc(userRef);

  if (!userDoc.exists()) {
    await setDoc(userRef, {
      ...data,
      uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } else {
    await setDoc(
      userRef,
      {
        ...data,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  }
}

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const userRef = doc(db, 'users', uid);
  const userDoc = await getDoc(userRef);
  return userDoc.exists() ? (userDoc.data() as UserProfile) : null;
}

// =============================
// 🔹 발표 데이터 업로드 + 분석 저장
// =============================

const BASE_URL = 'http://127.0.0.1:8000'; 

export async function uploadAndAnalyzePresentation(
  uid: string,
  file: Blob,
  title: string
): Promise<string> {
  try {
    // 1️⃣ Firebase Storage 업로드
    const fileName = `presentation_${Date.now()}.webm`;
    const storageRef = ref(storage, `users/${uid}/videos/${fileName}`);
    await uploadBytes(storageRef, file, {
      contentType: 'video/webm',
    });
    const videoURL = await getDownloadURL(storageRef);

    // 2️⃣ FastAPI에 분석 요청
    const formData = new FormData();
    formData.append('file', file);

    const analysisRes = await axios.post(`${BASE_URL}/analyze/video`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });

    const analysisData = analysisRes.data || {};

    // 3️⃣ GPT 피드백 생성
    let feedbackFile = null;
    let feedbackPreview = null;

    try {
      const feedbackRes = await axios.post(`${BASE_URL}/feedback/full`, analysisData, {
        headers: { 'Content-Type': 'application/json' },
      });
      const feedbackData = feedbackRes.data;
      feedbackFile = feedbackData?.file_path || null;
      feedbackPreview = feedbackData?.feedback_preview || null;
    } catch (feedbackErr) {
      console.warn('⚠️ 피드백 생성 실패:', feedbackErr);
    }

    // 4️⃣ Firestore 저장용 객체 생성
    const newPresentation: Omit<PresentationData, 'id'> = {
      userId: uid,
      title,
      videoURL,
      feedbackFile,
      feedbackPreview,
      overallScore: Math.floor(Math.random() * 20) + 75,
      duration: Number(analysisData?.result?.metadata?.duration_sec || 0),
      metrics: {
        clarity: Math.floor(Math.random() * 15) + 80,
        pace: Math.floor(Math.random() * 15) + 80,
        confidence: Math.floor(Math.random() * 15) + 80,
        engagement: Math.floor(Math.random() * 15) + 80,
      },
      insights: [
        '발표 속도가 적절하여 청중이 이해하기 좋습니다',
        '목소리 톤이 안정적이고 자신감이 느껴집니다',
        '시선 처리와 제스처를 조금 더 활용하면 좋겠습니다',
      ],
      timestamp: Timestamp.now(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    // 5️⃣ Firestore에 추가
    const presentationsRef = collection(db, 'users', uid, 'presentations');
    const docRef = await addDoc(presentationsRef, newPresentation);

    console.log('✅ Firestore 저장 완료:', docRef.id);
    return docRef.id;
  } catch (error) {
    console.error('❌ 발표 데이터 업로드 실패:', error);
    throw error;
  }
}
// =============================
// 🔹 Firestore 데이터 조회 함수
// =============================

export async function getUserPresentations(
  userId: string,
  limitCount: number = 10
): Promise<PresentationData[]> {
  const presentationsRef = collection(db, 'users', userId, 'presentations');
  const q = query(presentationsRef, orderBy('createdAt', 'desc'), limit(limitCount));
  const querySnapshot = await getDocs(q);
  const presentations: PresentationData[] = [];

  querySnapshot.forEach((doc) => {
    presentations.push({ id: doc.id, ...(doc.data() as PresentationData) });
  });

  return presentations;
}

export async function getPresentationById(
  userId: string,
  presentationId: string
): Promise<PresentationData | null> {
  const refDoc = doc(db, 'users', userId, 'presentations', presentationId);
  const snapshot = await getDoc(refDoc);
  return snapshot.exists() ? ({ id: snapshot.id, ...snapshot.data() } as PresentationData) : null;
}

// =============================
// 🔹 통계 계산
// =============================
export async function getUserStats(userId: string) {
  const presentations = await getUserPresentations(userId, 100);
  if (presentations.length === 0) {
    return {
      totalPresentations: 0,
      averageScore: 0,
      improvement: 0,
      skillProgress: {
        clarity: 0,
        pace: 0,
        confidence: 0,
        engagement: 0,
      },
    };
  }

  const totalScore = presentations.reduce((sum, p) => sum + p.overallScore, 0);
  const averageScore = Math.round(totalScore / presentations.length);

  const recent = presentations.slice(0, 5);
  const older = presentations.slice(5, 10);

  let improvement = 0;
  if (older.length > 0) {
    const rAvg = recent.reduce((s, p) => s + p.overallScore, 0) / recent.length;
    const oAvg = older.reduce((s, p) => s + p.overallScore, 0) / older.length;
    improvement = Math.round(((rAvg - oAvg) / oAvg) * 100);
  }

  const skillProgress = {
    clarity: Math.round(presentations.reduce((s, p) => s + p.metrics.clarity, 0) / presentations.length),
    pace: Math.round(presentations.reduce((s, p) => s + p.metrics.pace, 0) / presentations.length),
    confidence: Math.round(presentations.reduce((s, p) => s + p.metrics.confidence, 0) / presentations.length),
    engagement: Math.round(presentations.reduce((s, p) => s + p.metrics.engagement, 0) / presentations.length),
  };

  return { totalPresentations: presentations.length, averageScore, improvement, skillProgress };
}