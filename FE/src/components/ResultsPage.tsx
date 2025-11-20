import { motion } from "motion/react";
import { Mic, Brain, VideoIcon } from "lucide-react";
import { Button } from "./ui/button";
import sampleResult from "../mocks/sampleResult.json";

type Page = "home" | "record" | "results" | "mypage";

interface ResultsPageProps {
  user: { uid: string; email: string; name: string } | null;
  results: any;
  onNavigate: (page: Page) => void;
}

export function ResultsPage({ user, results, onNavigate }: ResultsPageProps) {
  // 🔥 실제 API 결과 또는 mock
  const data = results || sampleResult;

  // 데이터 불러오기
  const voice = data.analysis.voice;
  const logic = data.analysis.logic;
  const video = data.analysis.video;

  // 발표 시간 포맷터
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}분 ${secs}초`;
  };

  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* 배경 */}
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
        <div className="absolute inset-0 opacity-30">
          <div className="absolute top-20 left-20 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl" />
          <div className="absolute bottom-20 right-20 w-96 h-96 bg-green-500/20 rounded-full blur-3xl" />
        </div>
      </div>

      <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* 🔥 최상단 요약 섹션 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center mb-12"
        >
          {/* 동그란 총점 뱃지 */}
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 220, delay: 0.1 }}
            className="w-32 h-32 mx-auto mb-6 rounded-full bg-white flex flex-col items-center justify-center shadow-[0_20px_40px_rgba(0,0,0,0.35)] border-4 border-blue-200"
          >
            <span className="text-xs font-semibold text-slate-500 mb-1">
              종합 점수
            </span>
            <span className="text-5xl font-extrabold text-slate-900 leading-none">
              {data.overallScore}
            </span>
            <span className="text-[10px] text-slate-400 mt-1">/ 100</span>
          </motion.div>

          {/* “OO분 OO초 분석했습니다!” */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="text-white/80 text-lg"
          >
            {formatDuration(data.duration)}간의 발표를 분석했습니다!
          </motion.p>
        </motion.div>

        {/* 헤더 제목 */}
        <div className="text-center mb-10">
          <h1 className="text-4xl font-extrabold tracking-tight text-white mb-3">
            발표 분석 결과
          </h1>
          <p className="text-white/70 text-sm">
            AI가 분석한 발표 내용을 한눈에 확인해보세요.
          </p>
        </div>

        {/* ===================== 1. 음성 분석 ===================== */}
<section className="mb-12">
  <div className="p-8 rounded-2xl  shadow-xl  backdrop-blur">
    <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-2">
      <Mic className="text-white" />
      <span>음성 분석</span>
    </h2>

    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* 1 */}
      <div className="p-6 rounded-xl bg-[#f0f9ff] border border-[#6ee7b7] shadow-lg">
        <h3 className="text-slate-900 text-lg font-semibold mb-2">불필요한 음성</h3>
        <p className="text-sky-600 text-3xl font-bold mb-2">{voice.filler_count}회</p>

        {voice.filler_list?.length > 0 && (
          <div className="text-slate-600 text-sm space-y-1 mt-2">
            {voice.filler_list.map((item: string, idx: number) => (
              <p key={idx}>• {item}</p>
            ))}
          </div>
        )}
      </div>

      {/* 2 */}
      <div className="p-6 rounded-xl bg-white shadow-md border border-slate-200">
        <h3 className="text-slate-900 text-lg font-semibold mb-2">말하기 속도 (WPM)</h3>
        <p className="text-sky-600 text-3xl font-bold">{voice.wpm} wpm</p>
        <p className="text-slate-600 text-sm mt-2">권장 속도: 140~160 wpm</p>
      </div>

      {/* 3 */}
      <div className="p-6 rounded-xl bg-white shadow-md border border-slate-200">
        <h3 className="text-slate-900 text-lg font-semibold mb-2">말 사이 공백</h3>
        <p className="text-sky-600 text-3xl font-bold">{voice.long_pause_count}회</p>
      </div>

      {/* 4 */}
      <div className="p-6 rounded-xl bg-white shadow-md border border-slate-200">
        <h3 className="text-slate-900 text-lg font-semibold mb-2">말끝 흐림</h3>
        <p className="text-sky-600 text-3xl font-bold mb-2">{voice.hesitation_count}회</p>

        {voice.hesitation_list?.length > 0 && (
          <div className="text-slate-600 text-sm space-y-1 mt-2">
            {voice.hesitation_list.map((item: string, idx: number) => (
              <p key={idx}>• {item}</p>
            ))}
          </div>
        )}
      </div>
    </div>
  </div>
</section>

        {/* 줄바꿈 느낌 주는 구분선 */}
        <div className="h-px w-full bg-white/10 mb-10" />

        {/* ===================== 2. 내용 / 논리 분석 ===================== */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-white mb-4 flex items-center gap-2">
            <Brain className="text-lime-300" />
            <span>내용 · 논리 분석</span>
          </h2>

          <div className="p-6 rounded-xl bg-lime-50 border border-lime-200 shadow-sm">
            <h3 className="text-slate-900 text-lg font-semibold mb-2">
              대본 유사도
            </h3>
            <p className="text-lime-600 text-3xl font-bold mb-4">
              {logic.similarity}%
            </p>

            <h4 className="text-slate-900 font-semibold mb-2">
              실제 발화 내용과 다른 부분
            </h4>
            <div className="flex flex-col gap-2 mb-2">
              {logic.similarity_analysis?.map(
                (item: string, idx: number) => (
                  <p
                    key={idx}
                    className="text-slate-700 text-sm leading-relaxed whitespace-pre-line"
                  >
                    • {item}
                  </p>
                )
              )}
            </div>
            <p className="text-slate-700 text-xs mt-3">
              대본에 없는 표현이 많아지면 핵심 메시지가 흐려질 수 있어요. 중요한
              문장은 대본과 일치하도록 연습해보세요.
            </p>
          </div>
        </section>

        <div className="h-px w-full bg-white/10 mb-10" />

        {/* ===================== 3. 영상 분석 ===================== */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-white mb-4 flex items-center gap-2">
            <VideoIcon className="text-sky-300" />
            <span>영상 분석</span>
          </h2>

          <div className="p-6 rounded-xl bg-sky-50 border border-sky-200 shadow-sm">
            <h3 className="text-slate-900 text-lg font-semibold mb-3">
              영상 기반 피드백
            </h3>
            <p className="text-slate-800 whitespace-pre-line leading-relaxed text-sm">
              {video.feedback_preview}
            </p>
          </div>
        </section>

        {/* 버튼 */}
        <div className="flex justify-between mt-4 mb-4 gap-4">
          <Button
            onClick={() => onNavigate("record")}
            className="flex-1 bg-gradient-to-r from-blue-500 to-green-500 text-white h-12"
          >
            다시 녹화하기
          </Button>

          <Button
            onClick={() => onNavigate("mypage")}
            className="flex-1 bg-gradient-to-r from-purple-500 to-pink-500 text-white h-12"
          >
            내 발표 보러가기
          </Button>
        </div>
      </div>
    </div>
  );
}