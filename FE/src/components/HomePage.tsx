import { motion } from 'motion/react';
import { Mic, Brain, TrendingUp, Sparkles } from 'lucide-react';
import { Button } from './ui/button';

type Page = 'home' | 'record' | 'results' | 'mypage' | 'scriptupload';

interface HomePageProps {
  onNavigate: (page: Page) => void;
}

export function HomePage({ onNavigate }: HomePageProps) {
  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Animated Gradient Background */}
      <div className="absolute inset-0 -z-10">
        <motion.div
          className="absolute inset-0 opacity-60"
          animate={{
            background: [
              'radial-gradient(circle at 20% 50%, #3b82f6 0%, transparent 50%), radial-gradient(circle at 80% 80%, #10b981 0%, transparent 50%), radial-gradient(circle at 40% 20%, #06b6d4 0%, transparent 50%)',
              'radial-gradient(circle at 60% 70%, #3b82f6 0%, transparent 50%), radial-gradient(circle at 20% 20%, #10b981 0%, transparent 50%), radial-gradient(circle at 80% 50%, #06b6d4 0%, transparent 50%)',
              'radial-gradient(circle at 40% 40%, #3b82f6 0%, transparent 50%), radial-gradient(circle at 70% 60%, #10b981 0%, transparent 50%), radial-gradient(circle at 30% 80%, #06b6d4 0%, transparent 50%)',
              'radial-gradient(circle at 20% 50%, #3b82f6 0%, transparent 50%), radial-gradient(circle at 80% 80%, #10b981 0%, transparent 50%), radial-gradient(circle at 40% 20%, #06b6d4 0%, transparent 50%)',
            ],
          }}
          transition={{
            duration: 20,
            repeat: Infinity,
            ease: 'linear',
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-slate-950 via-slate-900/95 to-slate-950" />
      </div>

      {/* Floating Orbs */}
      <motion.div
        className="absolute top-20 left-10 w-72 h-72 bg-blue-500/20 rounded-full blur-3xl"
        animate={{
          x: [0, 100, 0],
          y: [0, 50, 0],
          scale: [1, 1.2, 1],
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
          scale: [1, 1.3, 1],
        }}
        transition={{
          duration: 18,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />

      {/* Content */}
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="text-center mb-20"
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-blue-500/20 to-green-500/20 border border-white/10 mb-8"
          >
            <Sparkles className="w-4 h-4 text-blue-400" />
            <span className="text-sm text-white/80">AI 기반 발표 분석</span>
          </motion.div>

          <h1 className="text-6xl md:text-7xl mb-6 text-white">
            발표의 새로운 기준
            <br />
            <span className="bg-gradient-to-r from-blue-400 via-cyan-400 to-green-400 bg-clip-text text-transparent">
              SpeakFlow
            </span>
          </h1>
          
          <p className="text-xl text-white/70 mb-12 max-w-2xl mx-auto">
            AI가 실시간으로 분석하고 피드백하는 스마트한 발표 코칭 플랫폼
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button
              onClick={() => onNavigate('scriptupload')}
              size="lg"
              className="bg-gradient-to-r from-blue-500 to-green-500 hover:from-blue-600 hover:to-green-600 text-white border-0 px-8 py-6"
            >
              <Mic className="w-5 h-5 mr-2" />
              지금 시작하기
            </Button>
            <Button
              onClick={() => onNavigate('mypage')}
              size="lg"
              className="bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white border-0 px-8 py-6"
            >
              내 발표 보기
            </Button>
          </div>
        </motion.div>

        {/* Features */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.8 }}
          className="grid md:grid-cols-3 gap-8 mt-20"
        >
          <motion.div
            whileHover={{ scale: 1.05 }}
            className="p-8 rounded-2xl bg-white/5 backdrop-blur-sm border border-white/10 hover:border-blue-500/50 transition-all"
          >
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center mb-4">
              <Brain className="w-6 h-6 text-white" />
            </div>
            <h3 className="text-xl mb-3 text-white">AI 분석</h3>
            <p className="text-white/60">
              음성, 표정, 제스처를 분석하여 즉각적인 피드백을 제공합니다
            </p>
          </motion.div>

          <motion.div
            whileHover={{ scale: 1.05 }}
            className="p-8 rounded-2xl bg-white/5 backdrop-blur-sm border border-white/10 hover:border-green-500/50 transition-all"
          >
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center mb-4">
              <TrendingUp className="w-6 h-6 text-white" />
            </div>
            <h3 className="text-xl mb-3 text-white">성장 추적</h3>
            <p className="text-white/60">
              발표 실력의 향상을 데이터로 확인하고 약점을 개선해보세요
            </p>
          </motion.div>

          <motion.div
            whileHover={{ scale: 1.05 }}
            className="p-8 rounded-2xl bg-white/5 backdrop-blur-sm border border-white/10 hover:border-cyan-500/50 transition-all"
          >
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center mb-4">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <h3 className="text-xl mb-3 text-white">맞춤형 코칭</h3>
            <p className="text-white/60">
              개인의 발표 스타일에 맞춘 구체적이고 실용적인 조언을 받아보세요
            </p>
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}