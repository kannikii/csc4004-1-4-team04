import { useState } from 'react';
import { motion } from 'motion/react';
import { LogIn, AlertCircle } from 'lucide-react';
import { Button } from './ui/button';
import { signInWithPopup, signOut } from 'firebase/auth';
import { auth, googleProvider } from '../lib/firebase';
import { createOrUpdateUserProfile } from '../lib/firestore';

interface AuthPageProps {
  onLogin: (user: { uid: string; email: string; name: string; photoURL?: string }) => void;
  onCancel: () => void;
}

export function AuthPage({ onLogin, onCancel }: AuthPageProps) {
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleGoogleSignIn = async () => {
    try {
      setIsLoading(true);
      setError('');
      
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;
      
      // Firestore에 사용자 프로필 생성/업데이트
      await createOrUpdateUserProfile(user.uid, {
        uid: user.uid,
        email: user.email || '',
        displayName: user.displayName || '',
        photoURL: user.photoURL || undefined,
        createdAt: null,
        updatedAt: null
      });
      
      onLogin({
        uid: user.uid,
        email: user.email || '',
        name: user.displayName || '',
        photoURL: user.photoURL || undefined
      });
      
    } catch (err: any) {
      console.error('Google Sign-In Error:', err);
      
      if (err.code === 'auth/popup-closed-by-user') {
        setError('로그인 창이 닫혔습니다. 다시 시도해주세요.');
      } else if (err.code === 'auth/popup-blocked') {
        setError('팝업이 차단되었습니다. 브라우저 설정에서 팝업을 허용해주세요.');
      } else if (err.code === 'auth/network-request-failed') {
        setError('네트워크 오류가 발생했습니다. 인터넷 연결을 확인해주세요.');
      } else if (err.code === 'auth/configuration-not-found' || err.message.includes('apiKey')) {
        setError('Firebase 설정이 필요합니다. /lib/firebase.ts 파일에서 Firebase 설정 정보를 입력해주세요.');
      } else {
        setError('로그인 중 오류가 발생했습니다. 다시 시도해주세요.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden flex items-center justify-center">
      {/* Background */}
      <div className="absolute inset-0 -z-10">
        <motion.div
          className="absolute inset-0 opacity-60"
          animate={{
            background: [
              'radial-gradient(circle at 20% 50%, #3b82f6 0%, transparent 50%), radial-gradient(circle at 80% 80%, #10b981 0%, transparent 50%)',
              'radial-gradient(circle at 60% 70%, #3b82f6 0%, transparent 50%), radial-gradient(circle at 20% 20%, #10b981 0%, transparent 50%)',
              'radial-gradient(circle at 20% 50%, #3b82f6 0%, transparent 50%), radial-gradient(circle at 80% 80%, #10b981 0%, transparent 50%)',
            ],
          }}
          transition={{
            duration: 15,
            repeat: Infinity,
            ease: 'linear',
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-slate-950 via-slate-900/95 to-slate-950" />
      </div>

      <motion.div
        className="absolute top-20 left-10 w-72 h-72 bg-blue-500/20 rounded-full blur-3xl"
        animate={{
          x: [0, 100, 0],
          y: [0, 50, 0],
        }}
        transition={{
          duration: 15,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />
      <motion.div
        className="absolute bottom-20 right-10 w-96 h-96 bg-green-500/20 rounded-full blur-3xl"
        animate={{
          x: [0, -80, 0],
          y: [0, -60, 0],
        }}
        transition={{
          duration: 18,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />

      {/* Auth Card */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="relative z-10 w-full max-w-md mx-4"
      >
        <div className="p-8 rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10">
          <div className="text-center mb-8">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-blue-500 to-green-500 flex items-center justify-center">
              <LogIn className="w-8 h-8 text-white" />
            </div>
            <h2 className="text-3xl mb-2 text-white">로그인</h2>
            <p className="text-white/60">
              Google 계정으로 간편하게 시작하세요
            </p>
          </div>

          <div className="space-y-4">
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-4 rounded-xl bg-red-500/10 border border-red-500/30"
              >
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm text-red-400 mb-1">로그인 오류</p>
                    <p className="text-sm text-white/80">{error}</p>
                  </div>
                </div>
              </motion.div>
            )}

            <Button
              onClick={handleGoogleSignIn}
              disabled={isLoading}
              className="w-full bg-white hover:bg-gray-100 text-gray-900 border-0 h-12 gap-3"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              {isLoading ? '로그인 중...' : 'Google로 시작하기'}
            </Button>
          </div>

          <div className="mt-6 text-center">
            <button
              onClick={onCancel}
              className="text-sm text-white/40 hover:text-white/60 transition-colors"
            >
              홈으로 돌아가기
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}