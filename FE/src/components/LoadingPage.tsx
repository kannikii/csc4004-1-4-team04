import { motion } from 'motion/react';
import { Loader2 } from 'lucide-react';

export function LoadingPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-center">
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ repeat: Infinity, duration: 2, ease: 'linear' }}
      >
        <Loader2 className="w-16 h-16 text-blue-400 mb-8 animate-spin" />
      </motion.div>
      <h1 className="text-3xl text-white mb-2">AI가 발표 영상을 분석 중입니다...</h1>
      <p className="text-white/60">약 20~30초 정도 소요됩니다 ⏳</p>
    </div>
  );
}