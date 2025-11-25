import { motion } from 'motion/react';
import { User, TrendingUp, Award, Calendar, BarChart3, AlertCircle } from 'lucide-react';
import { Button } from './ui/button';
import { Progress } from './ui/progress';
import { useState, useEffect } from 'react';
import { getUserPresentations, getUserStats, getPresentationDetail } from '../lib/firestore';
import type { PresentationData } from '../lib/firestore';

type Page = 'home' | 'record' | 'results' | 'mypage' | 'scriptupload';

interface MyPageProps {
  user: { uid: string; email: string; name: string; photoURL?: string } | null;
  onNavigate: (page: Page) => void;
  onSelectPresentation?: (p: PresentationData) => void;
}

export function MyPage({ user, onNavigate, onSelectPresentation }: MyPageProps) {
  const [presentations, setPresentations] = useState<PresentationData[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (user) {
      loadUserData();
    }
  }, [user]);

  const loadUserData = async () => {
    if (!user) return;
    
    try {
      setIsLoading(true);
      const [userPresentations, userStats] = await Promise.all([
        getUserPresentations(user.uid, 10),
        getUserStats(user.uid)
      ]);
      
      setPresentations(userPresentations);
      setStats(userStats);
    } catch (error) {
      console.error('사용자 데이터 로드 실패:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Mock user data (fallback when no data)
  const userData = {
    name: user?.name || '사용자',
    email: user?.email || '',
    photoURL: user?.photoURL,
    totalPresentations: stats?.totalPresentations || 0,
    averageScore: stats?.averageScore || 0,
    improvement: stats?.improvement || 0,
    recentPresentations:
      presentations.length > 0
        ? presentations.map((p) => {
            const dateVal =
              p.timestamp instanceof Date
                ? p.timestamp.toISOString()
                : p.timestamp?.toDate
                ? p.timestamp.toDate().toISOString()
                : new Date().toISOString();
            return { ...p, date: dateVal };
          })
        : [],
    // compute skill progress from recent presentations
    // similarity: average of available similarity (0-100)
    // pace: percent of presentations whose wpm is within recommended range (140-160)
    // gaze/posture: average percent (0-100)
    skillProgress: (() => {
      const recent = presentations.slice(0, 10);

      // similarity
      let sSum = 0, sCnt = 0;
      // pace (within range count)
      let paceIn = 0, paceCnt = 0;
      // gaze/posture
      let gSum = 0, gCnt = 0;
      let pSum = 0, pCnt = 0;

      recent.forEach((p) => {
        const pm = (p as any).progressMetrics;
        if (!pm) return;

        if (typeof pm.similarity === 'number') { sSum += pm.similarity; sCnt += 1; }

        const wpm = typeof pm.paceWpm === 'number' ? pm.paceWpm : (p.stt_analysis?.voice_analysis?.wpm ?? p.stt_analysis?.wpm ?? null);
        const wpmNum = typeof wpm === 'string' ? Number(wpm) : wpm;
        if (typeof wpmNum === 'number' && Number.isFinite(wpmNum)) {
          paceCnt += 1;
          if (wpmNum >= 140 && wpmNum <= 160) paceIn += 1;
        }

        if (typeof pm.gaze === 'number') { gSum += pm.gaze; gCnt += 1; }
        if (typeof pm.posture === 'number') { pSum += pm.posture; pCnt += 1; }
      });

      return {
        similarity: sCnt ? Math.round(sSum / sCnt) : 0,
        pace: paceCnt ? Math.round((paceIn / paceCnt) * 100) : 0,
        gaze: gCnt ? Math.round(gSum / gCnt) : 0,
        posture: pCnt ? Math.round(pSum / pCnt) : 0,
      };
    })(),
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    return `${mins}분`;
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-400';
    if (score >= 60) return 'text-blue-400';
    return 'text-orange-400';
  };

  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
        <div className="absolute inset-0 opacity-30">
          <div className="absolute top-20 left-20 w-96 h-96 bg-blue-500/30 rounded-full blur-3xl" />
          <div className="absolute bottom-20 right-20 w-96 h-96 bg-green-500/30 rounded-full blur-3xl" />
        </div>
      </div>

      <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <h1 className="text-4xl mb-2 text-white">마이페이지</h1>
          <p className="text-white/60">당신의 발표 성장 기록</p>
        </motion.div>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Profile & Stats */}
          <div className="lg:col-span-1 space-y-6">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="p-8 rounded-2xl bg-white/5 backdrop-blur-sm border border-white/10 text-center"
            >
              {userData.photoURL ? (
                <img 
                  src={userData.photoURL} 
                  alt={userData.name}
                  className="w-24 h-24 mx-auto mb-4 rounded-full object-cover"
                />
              ) : (
                <div className="w-24 h-24 mx-auto mb-4 rounded-full bg-gradient-to-br from-blue-500 to-green-500 flex items-center justify-center">
                  <User className="w-12 h-12 text-white" />
                </div>
              )}
              <h2 className="text-2xl text-white mb-2">{userData.name}</h2>
              <p className="text-white/60">발표 마스터를 향해</p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="grid grid-cols-2 gap-4"
            >
              <div className="p-6 rounded-xl bg-white/5 backdrop-blur-sm border border-white/10">
                <BarChart3 className="w-8 h-8 text-blue-400 mb-3" />
                <div className="text-3xl text-white mb-1">{userData.totalPresentations}</div>
                <div className="text-sm text-white/60">총 발표</div>
              </div>

              <div className="p-6 rounded-xl bg-white/5 backdrop-blur-sm border border-white/10">
                <Award className="w-8 h-8 text-green-400 mb-3" />
                <div className="text-3xl text-white mb-1">{userData.averageScore}</div>
                <div className="text-sm text-white/60">평균 점수</div>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="p-6 rounded-xl bg-gradient-to-br from-green-500/10 to-emerald-500/10 border border-green-500/20"
            >
              <div className="flex items-center gap-3 mb-3">
                <TrendingUp className="w-6 h-6 text-green-400" />
                <span className="text-white">최근 성장률</span>
              </div>
              <div className="text-4xl text-green-400 mb-2">+{userData.improvement}%</div>
              <p className="text-sm text-white/60">지난 달 대비 향상되었습니다</p>
            </motion.div>

            <Button
              onClick={() => onNavigate('scriptupload')}
              className="w-full bg-gradient-to-r from-blue-500 to-green-500 hover:from-blue-600 hover:to-green-600 text-white border-0"
            >
              새 발표 시작하기
            </Button>
          </div>

          {/* History & Skills */}
          <div className="lg:col-span-2 space-y-8">
            {/* Recent Presentations */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="p-8 rounded-2xl bg-white/5 backdrop-blur-sm border border-white/10"
            >
              <h2 className="text-2xl mb-6 text-white">최근 발표</h2>
              
              {userData.recentPresentations.length === 0 ? (
                <div className="text-center py-12">
                  <AlertCircle className="w-12 h-12 text-white/40 mx-auto mb-4" />
                  <p className="text-white/60 mb-4">아직 발표 기록이 없습니다</p>
                  <Button
                    onClick={() => onNavigate('scriptupload')}
                    className="bg-gradient-to-r from-blue-500 to-green-500 hover:from-blue-600 hover:to-green-600 text-white border-0"
                  >
                    첫 발표 시작하기
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  {userData.recentPresentations.map((presentation, index) => (
                    <motion.div
                      key={presentation.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.1 }}
                      className="p-4 rounded-xl bg-white/5 border border-white/10 hover:border-blue-500/50 transition-all cursor-pointer"
                      onClick={async () => {
                        if (onSelectPresentation) {
                          let picked = presentation;
                          if (presentation.projectId) {
                            const detail = await getPresentationDetail(
                              user?.uid || presentation.userId,
                              presentation.projectId,
                              presentation.id || presentation.title
                            );
                            if (detail) picked = { ...picked, ...detail };
                          }
                          onSelectPresentation(picked);
                          return;
                        }
                        onNavigate('record');
                      }}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <h3 className="text-white mb-1">{presentation.projectName || presentation.title}</h3>
                          <div className="flex items-center gap-3 text-sm text-white/60">
                            <div className="flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              <span>{formatDate(presentation.date)}</span>
                            </div>
                            <span>•</span>
                            <span>{formatDuration(presentation.duration)}</span>
                          </div>
                        </div>
                        <div className={`text-2xl ${getScoreColor(presentation.overallScore ?? 0)}`}> 
                          {presentation.overallScore ?? 0}
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>

            {/* Skill Progress */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 }}
              className="p-8 rounded-2xl bg-white/5 backdrop-blur-sm border border-white/10"
            >
              <h2 className="text-2xl mb-6 text-white">스킬 진행도</h2>
              
              <div className="space-y-6">
                {Object.entries(userData.skillProgress).map(([key, value], index) => {
                  const labels: Record<string, string> = {
                    similarity: '발표 자료 유사도',
                    pace: '발표 속도',
                    gaze: '시선 처리',
                    posture: '자세 안정성',
                  };

                  return (
                    <motion.div
                      key={key}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.3 + index * 0.1 }}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-white/80">{labels[key]}</span>
                        <span className="text-white">{value}/100</span>
                      </div>
                      <Progress value={value} className="h-2" />
                    </motion.div>
                  );
                })}
              </div>

              <div className="mt-6 pt-6 border-t border-white/10">
                <p className="text-sm text-white/60">
                  꾸준한 연습으로 모든 스킬을 향상시켜보세요! 🚀
                </p>
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
}
