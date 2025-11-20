import { ReactNode } from 'react';
import { motion } from 'motion/react';
import { Lock } from 'lucide-react';
import { Button } from './ui/button';

interface ProtectedLayoutProps {
  children: ReactNode;
  isAuthenticated: boolean;
  onNavigateToAuth: () => void;
}

export function ProtectedLayout({ children, isAuthenticated, onNavigateToAuth }: ProtectedLayoutProps) {
  if (!isAuthenticated) {
    return (
      <div className="relative min-h-screen overflow-hidden flex items-center justify-center">
        {/* Background */}
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
          <div className="absolute inset-0 opacity-30">
            <div className="absolute top-20 left-20 w-96 h-96 bg-blue-500/30 rounded-full blur-3xl" />
            <div className="absolute bottom-20 right-20 w-96 h-96 bg-green-500/30 rounded-full blur-3xl" />
          </div>
        </div>

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center max-w-md mx-4"
        >
          <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-blue-500 to-green-500 flex items-center justify-center">
            <Lock className="w-10 h-10 text-white" />
          </div>
          
          <h2 className="text-3xl mb-4 text-white">로그인이 필요합니다</h2>
          <p className="text-white/60 mb-8">
            이 페이지에 접근하려면 먼저 로그인해주세요
          </p>
          
          <Button
            onClick={onNavigateToAuth}
            className="bg-gradient-to-r from-blue-500 to-green-500 hover:from-blue-600 hover:to-green-600 text-white border-0 px-8"
          >
            로그인하기
          </Button>
        </motion.div>
      </div>
    );
  }

  return <>{children}</>;
}
