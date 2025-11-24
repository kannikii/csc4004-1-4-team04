import { motion } from "motion/react";
import { Mic, Brain, VideoIcon, FileText } from "lucide-react";
import { Button } from "./ui/button";
import sampleResult from "../mocks/sampleResult.json";
import { useEffect, useState } from "react";
import { getPresentationDetail } from "../lib/firestore";
import { fetchFeedbackSummary } from "../apis/feedbackSummary";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type Page = "home" | "record" | "results" | "mypage";

interface ResultsPageProps {
  user: { uid: string; email: string; name: string } | null;
  results: any;
  onNavigate: (page: Page) => void;
}

// 백엔드/Firestore 응답을 UI 스키마로 변환
function normalizeData(raw: any) {
  if (!raw) return sampleResult;

  const normalized = { ...raw };
  const toNumber = (val: any) => {
    if (typeof val === "number") return val;
    if (typeof val === "string") {
      const n = Number(val);
      return Number.isFinite(n) ? n : undefined;
    }
    return undefined;
  };

  // Firestore 문서 형태(stt_analysis/vision_analysis) → 변환
  if (!normalized.stt_result && normalized.stt_analysis) {
    normalized.stt_result = normalized.stt_analysis;
    normalized.video_result = normalized.video_result || normalized.vision_analysis;
  }

  // 이미 UI 형태라면 그대로
  if (normalized.analysis && normalized.analysis.voice) return normalized;

  const stt = normalized.stt_result || {};
  const videoResult = normalized.video_result || normalized.vision_analysis || {};
  const voiceSource = stt.voice_analysis ?? stt.voiceAnalysis ?? stt.voice ?? {};
  const metadata = videoResult.metadata || {};

  const durationSec =
    toNumber(stt.duration_sec) ??
    toNumber(stt.duration) ??
    toNumber(videoResult?.metadata?.duration_sec) ??
    toNumber(normalized.duration_sec) ??
    toNumber(normalized.duration) ??
    0;
  const duration = Math.round(durationSec || 0);

  const pauseEvents = (voiceSource.pause_events ?? stt.pause_events ?? stt.words) || [];
  const wordCount = toNumber(stt.word_count);
  const computedWpm =
    toNumber(voiceSource.wpm) ??
    toNumber(stt.wordsPerMinute) ??
    toNumber(stt.wpm) ??
    (typeof wordCount === "number" && durationSec
      ? Math.round((wordCount / durationSec) * 60)
      : undefined) ??
    (Array.isArray(stt.words) && durationSec ? Math.round((stt.words.length / durationSec) * 60) : undefined);

  const logicBlock = normalized.analysis?.logic || stt.logic || normalized.logic || {};
  const resolvedLogicSimilarity =
    toNumber(logicBlock.similarity) ??
    toNumber(stt.logic_similarity) ??
    toNumber(normalized.logic_similarity) ??
    null;
  const logicFeedbackRaw =
    logicBlock.similarity_analysis ??
    logicBlock.feedback ??
    stt.logic_feedback ??
    normalized.logic_feedback ??
    [];
  const logicFeedback = Array.isArray(logicFeedbackRaw)
    ? logicFeedbackRaw
    : logicFeedbackRaw
      ? [logicFeedbackRaw]
      : [];

  const videoPreview =
    normalized.feedback_preview ||
    videoResult?.gaze?.interpretation ||
    videoResult?.posture?.interpretation ||
    videoResult?.gesture?.interpretation ||
    videoResult?.hand?.interpretation ||
    videoResult?.head_pose?.interpretation ||
    "영상 분석 결과 요약이 없습니다.";

  const combinedVideoFeedback =
    [
      videoResult?.gaze?.interpretation,
      videoResult?.posture?.interpretation,
      videoResult?.gesture?.interpretation,
      videoResult?.hand?.interpretation,
      videoResult?.head_pose?.interpretation,
    ]
      .filter(Boolean)
      .join(" / ") || videoPreview;

  const scores = normalized.scores || {};

  // 세부 점수 매핑
  const videoGazeScore = scores.video_gaze ?? 0;
  const videoPostureScore = scores.video_posture ?? 0;
  const videoGestureScore = scores.video_gesture ?? 0;

  // 총점 계산 (값이 없으면 합산)
  const voiceScore = scores.voice ?? 0;
  const logicScore = scores.logic ?? 20;
  const videoScore = (scores.video && scores.video > 0)
    ? scores.video
    : (videoGazeScore + videoPostureScore + videoGestureScore);

  // 전체 총점 (값이 없으면 합산)
  const overallScore = (normalized.overallScore && normalized.overallScore > 0)
    ? normalized.overallScore
    : (voiceScore + videoScore + logicScore);

  return {
    overallScore: overallScore,
    scores: {
      voice: voiceScore,
      video: videoScore,
      logic: logicScore,
      video_gaze: videoGazeScore,
      video_posture: videoPostureScore,
      video_gesture: videoGestureScore,
    },
    duration,
    analysis: {
      voice: {
        wpm: computedWpm ?? 0,
        long_pause_count:
          toNumber(voiceSource.long_pause_count) ??
          toNumber(stt.long_pause_count) ??
          (Array.isArray(pauseEvents) ? pauseEvents.length : undefined) ??
          0,
        avg_pause_duration: toNumber(voiceSource.avg_pause_duration) ?? toNumber(stt.pauseDuration) ?? 0,
        pause_events: Array.isArray(pauseEvents) ? pauseEvents : [],
        hesitation_count: toNumber(voiceSource.hesitation_count) ?? toNumber(stt.hesitationCount) ?? 0,
        filler_count: toNumber(voiceSource.filler_count) ?? toNumber(stt.fillerCount) ?? 0,
        hesitation_list: voiceSource.hesitation_list ?? [],
        filler_list: voiceSource.filler_list ?? [],
      },
      logic: {
        similarity: resolvedLogicSimilarity,
        similarity_analysis: logicFeedback,
      },
      video: {
        feedback_preview: combinedVideoFeedback,
        metadata,
        gaze: videoResult.gaze || {},
        posture: videoResult.posture || {},
        gesture: videoResult.gesture || {},
        hand: videoResult.hand || {},
        head: videoResult.head_pose || videoResult.head || {},
      },
    },
    final_report: normalized.final_report,
    final_report_preview: normalized.final_report_preview || normalized.feedback_preview,
  };
}

export function ResultsPage({ user, results, onNavigate }: ResultsPageProps) {
  const [showModal, setShowModal] = useState(false);
  const [detail, setDetail] = useState<any>(null);
  const [summary, setSummary] = useState<any>(null);

  // 부족한 데이터면 Firestore에서 상세 재조회
  useEffect(() => {
    const loadDetail = async () => {
      if (!results) return;
      if (results.stt_result || results.stt_analysis) return;
      const uid = results.user_id || results.userId || user?.uid;
      const projectId = results.project_id || results.projectId;
      const presId = results.presentation_id || results.id || results.title;
      if (!(uid && projectId && presId)) return;
      const fetched = await getPresentationDetail(uid, projectId, presId);
      if (fetched) setDetail(fetched);
    };
    loadDetail();
  }, [results, user]);

  // 백엔드 요약 API로 정규화된 데이터 가져오기 (가능하면 사용)
  useEffect(() => {
    const loadSummary = async () => {
      const effectiveData = detail || results;
      if (!effectiveData) return;
      const uid = effectiveData.user_id || effectiveData.userId || user?.uid;
      const projectId = effectiveData.project_id || effectiveData.projectId;
      const presId = effectiveData.presentation_id || effectiveData.id || effectiveData.title;
      if (!(uid && projectId && presId)) return;
      try {
        const s = await fetchFeedbackSummary({ userId: uid, projectId, presentationId: presId });
        setSummary(s);
      } catch (err) {
        console.warn("요약 API 호출 실패, 로컬 normalize 사용:", err);
      }
    };
    loadSummary();
  }, [results, detail, user]);

  const effective = detail || results;
  if (typeof window !== "undefined") {
    console.log("ResultsPage raw results:", results);
    console.log("ResultsPage effective:", effective);
    if (summary) console.log("ResultsPage summary:", summary);
  }
  const data = summary ? normalizeData(summary) : normalizeData(effective);
  const voice = data.analysis.voice;
  const logic = data.analysis.logic;
  const video = data.analysis.video;

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}분 ${secs}초`;
  };

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
        <div className="absolute inset-0 opacity-30">
          <div className="absolute top-20 left-20 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl" />
          <div className="absolute bottom-20 right-20 w-96 h-96 bg-green-500/20 rounded-full blur-3xl" />
        </div>
      </div>

      <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="text-center mb-12">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 220, delay: 0.1 }}
            className="w-32 h-32 mx-auto mb-6 rounded-full bg-white flex flex-col items-center justify-center shadow-[0_20px_40px_rgba(0,0,0,0.35)] border-4 border-blue-200"
          >
            <span className="text-xs font-semibold text-slate-500 mb-1">종합 점수</span>
            <span className="text-5xl font-extrabold text-slate-900 leading-none">{data.overallScore}</span>
            <span className="text-[10px] text-slate-400 mt-1">/ 100</span>
          </motion.div>

          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }} className="text-white/80 text-lg">
            {formatDuration(data.duration)}간의 발표를 분석했습니다!
          </motion.p>
        </motion.div>

        <div className="text-center mb-10">
          <h1 className="text-4xl font-extrabold tracking-tight text-white mb-3">발표 분석 결과</h1>
          <p className="text-white/70 text-sm">AI가 분석한 발표 내용을 한눈에 확인해보세요.</p>
        </div>

        {/* 음성 분석 */}
        <section className="mb-12">
          <div className="p-8 rounded-2xl shadow-xl backdrop-blur bg-white/5 border border-white/10">
            <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-2">
              <Mic className="text-white" />
              <span>음성 분석</span>
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="p-6 rounded-xl bg-[#f0f9ff] border border-[#6ee7b7] shadow-lg">
                <h3 className="text-slate-900 text-lg font-semibold mb-2">불필요한 음성</h3>
                <p className="text-sky-600 text-3xl font-bold mb-2">{voice.filler_count}회</p>
                {voice.filler_list?.length > 0 && (
                  <div className="text-slate-600 text-sm space-y-1 mt-2">
                    {voice.filler_list.map((item: string, idx: number) => (
                      <p key={idx}>- {item}</p>
                    ))}
                  </div>
                )}
              </div>

              <div className="p-6 rounded-xl bg-white shadow-md border border-slate-200">
                <h3 className="text-slate-900 text-lg font-semibold mb-2">말하기 속도 (WPM)</h3>
                <p className="text-sky-600 text-3xl font-bold">{voice.wpm} wpm</p>
                <p className="text-slate-600 text-sm mt-2">권장 속도: 140~160 wpm</p>
              </div>

              <div className="p-6 rounded-xl bg-white shadow-md border border-slate-200">
                <h3 className="text-slate-900 text-lg font-semibold mb-2">말 사이 공백</h3>
                <p className="text-sky-600 text-3xl font-bold">{voice.long_pause_count}회</p>
              </div>

              <div className="p-6 rounded-xl bg-white shadow-md border border-slate-200">
                <h3 className="text-slate-900 text-lg font-semibold mb-2">말끝 흐림</h3>
                <p className="text-sky-600 text-3xl font-bold mb-2">{voice.hesitation_count}회</p>
                {voice.hesitation_list?.length > 0 && (
                  <div className="text-slate-600 text-sm space-y-1 mt-2">
                    {voice.hesitation_list.map((item: string, idx: number) => (
                      <p key={idx}>- {item}</p>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        <div className="h-px w-full bg-white/10 mb-10" />

        {/* 논리 분석 */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-white mb-4 flex items-center gap-2">
            <Brain className="text-lime-300" />
            <span>내용 / 논리 분석</span>
          </h2>

          <div className="p-6 rounded-xl bg-lime-50 border border-lime-200 shadow-sm">
            <h3 className="text-slate-900 text-lg font-semibold mb-2">대본 유사도</h3>
            <p className="text-lime-600 text-3xl font-bold mb-4">
              {logic.similarity !== null ? `${logic.similarity}%` : "데이터 없음"}
            </p>

            <h4 className="text-slate-900 font-semibold mb-2">실제 발화 내용과 다른 부분</h4>
            <div className="flex flex-col gap-2 mb-2">
              {logic.similarity_analysis?.length ? (
                logic.similarity_analysis.map((item: string, idx: number) => (
                  <p key={idx} className="text-slate-700 text-sm leading-relaxed whitespace-pre-line">
                    - {item}
                  </p>
                ))
              ) : (
                <p className="text-slate-700 text-sm leading-relaxed whitespace-pre-line">
                  - 논리/대본 분석 결과 없음
                </p>
              )}
            </div>
            <p className="text-slate-700 text-xs mt-3">
              대본에 없는 표현이 많아지면 핵심 메시지가 흐려질 수 있어요. 중요한 문장은 대본과 일치하도록 연습해보세요.
            </p>
          </div>
        </section>

        <div className="h-px w-full bg-white/10 mb-10" />

        {/* 영상 분석 */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-white mb-6 flex items-center gap-2">
            <VideoIcon className="text-sky-300" />
            <span>영상 분석</span>
          </h2>

          <div className="p-8 rounded-2xl shadow-xl backdrop-blur bg-white/5 border border-white/10">
            <div className="mb-8 p-6 rounded-xl bg-sky-50 border border-sky-200 shadow-sm">
              <h3 className="text-slate-900 text-lg font-semibold mb-3">영상 기반 피드백 요약</h3>
              <p className="text-slate-800 whitespace-pre-line leading-relaxed text-sm">
                {video.feedback_preview}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {/* 영상 점수 카드 추가 */}
              <div className="p-6 rounded-xl bg-white shadow-md border border-slate-200">
                <h3 className="text-slate-900 text-lg font-semibold mb-2">영상 점수</h3>
                <p className="text-sky-600 text-3xl font-bold">{data.scores?.video ?? 0} / 40</p>
                <p className="text-slate-500 text-sm mt-1">AI 평가 점수</p>
              </div>

              {/* 시선 분포 */}
              <div className="p-6 rounded-xl bg-white shadow-md border border-slate-200">
                <h3 className="text-slate-900 text-lg font-semibold mb-2">시선 분포</h3>
                <div className="text-sm text-slate-600 space-y-1">
                  <p>정면 응시율: <span className="font-bold text-sky-600">{(video.gaze?.center_ratio ?? 0).toFixed(2)}</span></p>
                  <p>좌/중/우: {video.gaze?.distribution?.left ?? 0} / {video.gaze?.distribution?.center ?? 0} / {video.gaze?.distribution?.right ?? 0}</p>
                </div>
                {video.gaze?.interpretation && (
                  <p className="mt-3 text-xs text-slate-500 bg-slate-50 p-2 rounded">
                    {video.gaze.interpretation}
                  </p>
                )}
              </div>

              {/* 자세 안정성 */}
              <div className="p-6 rounded-xl bg-white shadow-md border border-slate-200">
                <h3 className="text-slate-900 text-lg font-semibold mb-2">자세 안정성</h3>
                <div className="text-sm text-slate-600 space-y-1">
                  <p>안정성 점수: <span className="font-bold text-sky-600">{(video.posture?.stability ?? 0).toFixed(3)}</span></p>
                  <p>기울기(Roll): {video.posture?.roll_mean ?? 0}</p>
                </div>
                {video.posture?.interpretation && (
                  <p className="mt-3 text-xs text-slate-500 bg-slate-50 p-2 rounded">
                    {video.posture.interpretation}
                  </p>
                )}
              </div>

              {/* 제스처/손동작 */}
              <div className="p-6 rounded-xl bg-white shadow-md border border-slate-200">
                <h3 className="text-slate-900 text-lg font-semibold mb-2">제스처/손동작</h3>
                <div className="text-sm text-slate-600 space-y-1">
                  <p>움직임 에너지: <span className="font-bold text-sky-600">{video.gesture?.motion_energy ?? 0}</span></p>
                  <p>손 노출 비율: {(video.hand?.visibility_ratio ?? 0).toFixed(3)}</p>
                </div>
                {video.gesture?.interpretation && (
                  <p className="mt-3 text-xs text-slate-500 bg-slate-50 p-2 rounded">
                    {video.gesture.interpretation}
                  </p>
                )}
              </div>

              {/* 머리 방향 */}
              <div className="p-6 rounded-xl bg-white shadow-md border border-slate-200">
                <h3 className="text-slate-900 text-lg font-semibold mb-2">머리 방향</h3>
                <div className="text-sm text-slate-600 space-y-1">
                  <p>좌우 회전(Yaw): {video.head?.yaw_mean ?? 0}</p>
                  <p>기울기(Roll): {video.head?.roll_mean ?? 0}</p>
                </div>
                {video.head?.interpretation && (
                  <p className="mt-3 text-xs text-slate-500 bg-slate-50 p-2 rounded">
                    {video.head.interpretation}
                  </p>
                )}
              </div>

              {/* 메타데이터 */}
              <div className="p-6 rounded-xl bg-white shadow-md border border-slate-200">
                <h3 className="text-slate-900 text-lg font-semibold mb-2">영상 정보</h3>
                <div className="text-sm text-slate-600 space-y-1">
                  <p>재생 시간: {(video.metadata?.duration_sec ?? 0).toFixed(1)}초</p>
                  <p>FPS: {video.metadata?.fps ?? 0}</p>
                  <p>해상도: {video.metadata?.resolution?.[0] ?? "-"} x {video.metadata?.resolution?.[1] ?? "-"}</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 최종 리포트 (LLM) */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-white mb-4 flex items-center gap-2">
            <FileText className="text-amber-300" />
            <span>최종 피드백</span>
          </h2>
          <div className="p-8 rounded-xl bg-amber-50 border border-amber-200 shadow-sm flex flex-col items-center justify-center text-center">

            {/* 점수 요약 표시 */}
            <div className="grid grid-cols-3 gap-4 w-full max-w-lg mb-8">
              <div className="bg-white p-4 rounded-lg border border-amber-100 shadow-sm">
                <div className="text-sm text-slate-500 mb-1">음성 점수</div>
                <div className="text-xl font-bold text-slate-800">{data.scores?.voice ?? 0} <span className="text-xs text-slate-400">/ 40</span></div>
              </div>
              <div className="bg-white p-4 rounded-lg border border-amber-100 shadow-sm">
                <div className="text-sm text-slate-500 mb-1">논리 점수</div>
                <div className="text-xl font-bold text-slate-800">{data.scores?.logic ?? 20} <span className="text-xs text-slate-400">/ 20</span></div>
              </div>
              <div className="bg-white p-4 rounded-lg border border-amber-100 shadow-sm">
                <div className="text-sm text-slate-500 mb-1">영상 점수</div>
                <div className="text-xl font-bold text-slate-800">{data.scores?.video ?? 0} <span className="text-xs text-slate-400">/ 40</span></div>
              </div>
            </div>

            <p className="text-slate-700 mb-6 text-lg">
              AI가 분석한 종합 피드백 보고서가 준비되었습니다.
            </p>
            <Button
              onClick={() => setShowModal(true)}
              className="bg-amber-500 hover:bg-amber-600 text-white border-0 px-8 py-3 text-lg h-auto rounded-full shadow-lg transition-transform hover:scale-105"
              disabled={!data.final_report && !data.final_report_preview}
            >
              AI 피드백 전체 보기
            </Button>
          </div>
        </section>

        {/* 버튼 */}
        <div className="flex justify-between mt-4 mb-4 gap-4">
          <Button onClick={() => onNavigate("record")} className="flex-1 bg-gradient-to-r from-blue-500 to-green-500 text-white h-12">
            다시 녹화하기
          </Button>
          <Button onClick={() => onNavigate("mypage")} className="flex-1 bg-gradient-to-r from-purple-500 to-pink-500 text-white h-12">
            내 발표 보러가기
          </Button>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[80vh] overflow-auto shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <div className="flex items-center gap-2 text-slate-900">
                <FileText className="w-5 h-5" />
                <span className="font-semibold">AI 피드백</span>
              </div>
              <button onClick={() => setShowModal(false)} className="text-slate-500 hover:text-slate-800">
                닫기
              </button>
            </div>
            <div className="p-6">
              <article className="prose prose-sm max-w-none prose-slate">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {data.final_report || data.final_report_preview || ""}
                </ReactMarkdown>
              </article>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
