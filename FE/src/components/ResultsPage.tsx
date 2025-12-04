import { motion } from "motion/react";
import { Mic, Brain, VideoIcon, FileText, Download } from "lucide-react";
import { Button } from "./ui/button";
import { useEffect, useState, useRef } from "react";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { getPresentationDetail } from "../lib/firestore";
import { fetchFeedbackSummary } from "../apis/feedbackSummary";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const sampleResult = {};

type Page = "home" | "record" | "results" | "mypage";

interface ResultsPageProps {
  user: { uid: string; email: string; name: string } | null;
  results: any;
  onNavigate: (page: Page) => void;
}

// =============================
// 🔧 normalizeData (UI 변경 X)
// =============================
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
  if (!normalized.stt_result && normalized.stt_analysis) {
    normalized.stt_result = normalized.stt_analysis;
    normalized.video_result = normalized.video_result || normalized.vision_analysis;
  }
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

  const videoGazeScore = scores.video_gaze ?? 0;
  const videoPostureScore = scores.video_posture ?? 0;
  const videoGestureScore = scores.video_gesture ?? 0;

  const voiceScore = scores.voice ?? 0;
  const logicScore = scores.logic ?? 20;
  const videoScore =
    scores.video && scores.video > 0
      ? scores.video
      : videoGazeScore + videoPostureScore + videoGestureScore;

  const overallScore =
    normalized.overallScore && normalized.overallScore > 0
      ? normalized.overallScore
      : voiceScore + videoScore + logicScore;

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
        avg_pause_duration:
          toNumber(voiceSource.avg_pause_duration) ??
          toNumber(stt.pauseDuration) ??
          0,
        pause_events: Array.isArray(pauseEvents) ? pauseEvents : [],
        hesitation_count:
          toNumber(voiceSource.hesitation_count) ??
          toNumber(stt.hesitationCount) ??
          0,
        filler_count:
          toNumber(voiceSource.filler_count) ??
          toNumber(stt.fillerCount) ??
          0,
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
    final_report_preview:
      normalized.final_report_preview || normalized.feedback_preview,
  };
}


// =========================
// 📌 시각화용 데이터 변환 헬퍼
// =========================

// 점수 → 라벨
function toGrade(score: number) {
  if (score >= 90) return "매우 좋음";
  if (score >= 75) return "좋음";
  if (score >= 60) return "보통";
  return "개선 필요";
}

// 소수 → 퍼센트
function toPercent(v: number | undefined) {
  if (!v && v !== 0) return "0%";
  return Math.round(v * 100) + "%";
}

// 소수 → 점수(0~100)
function toScore(v: number | undefined) {
  if (!v && v !== 0) return 0;
  return Math.round(v * 100);
}

// 각 지표 해석 문구
function interpretGaze(centerRatio: number) {
  const p = centerRatio * 100;
  if (p >= 90) return "정면 응시가 매우 뛰어나요!";
  if (p >= 70) return "정면 응시가 잘 유지되고 있어요.";
  if (p >= 50) return "정면 응시가 보통 수준입니다.";
  return "시선이 자주 흔들려 개선이 필요해요.";
}

function interpretPosture(score: number) {
  if (score >= 0.9) return "자세가 매우 안정적이에요!";
  if (score >= 0.75) return "자세가 비교적 안정적이에요.";
  if (score >= 0.5) return "약간의 흔들림이 있어요.";
  return "상당히 흔들립니다. 자세 안정이 필요해요.";
}

function interpretGesture(val: number) {
  const p = val * 100;
  if (p >= 40 && p <= 90) return "자연스러운 제스처 범위에 있어요.";
  if (p < 40) return "제스처가 너무 적어서 딱딱해 보여요.";
  return "제스처가 과도해 산만할 수 있어요.";
}

function interpretHead(yaw: number, roll: number) {
  if (yaw < 15 && roll < 5) return "머리 움직임이 안정적이에요.";
  if (yaw < 25) return "약간의 흔들림이 있어요.";
  return "머리 흔들림이 커서 집중도가 떨어질 수 있어요.";
}


// ================================
// ⚡ ResultsPage UI (리디자인)
// ================================
export function ResultsPage({ user, results, onNavigate }: ResultsPageProps) {
  const [showModal, setShowModal] = useState(false);
  const [detail, setDetail] = useState<any>(null);
  const [summary, setSummary] = useState<any>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  const handleDownloadPDF = async () => {
    if (!modalRef.current) return;

    try {
      const canvas = await html2canvas(modalRef.current, {
        scale: 2, // 고해상도
        useCORS: true,
        backgroundColor: "#ffffff",
      });

      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF("p", "mm", "a4");
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = pdfWidth;
      const imgHeight = (canvas.height * pdfWidth) / canvas.width;

      let heightLeft = imgHeight;
      let position = 0;

      // 첫 페이지
      pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
      heightLeft -= pdfHeight;

      // 내용이 길면 페이지 추가
      while (heightLeft > 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
        heightLeft -= pdfHeight;
      }

      pdf.save("AI_Feedback_Report.pdf");
    } catch (err) {
      console.error("PDF Download failed:", err);
    }
  };

  useEffect(() => {
    const loadDetail = async () => {
      if (!results) return;
      if (results.stt_result || results.stt_analysis) return;

      const uid = results.user_id || results.userId || user?.uid;
      const projectId = results.project_id || results.projectId;
      const presId =
        results.presentation_id || results.id || results.title;
      if (!(uid && projectId && presId)) return;

      const fetched = await getPresentationDetail(uid, projectId, presId);
      if (fetched) setDetail(fetched);
    };
    loadDetail();
  }, [results, user]);

  useEffect(() => {
    const loadSummary = async () => {
      const effectiveData = detail || results;
      if (!effectiveData) return;
      const uid = effectiveData.user_id || effectiveData.userId || user?.uid;
      const projectId =
        effectiveData.project_id || effectiveData.projectId;
      const presId =
        effectiveData.presentation_id ||
        effectiveData.id ||
        effectiveData.title;

      if (!(uid && projectId && presId)) return;
      try {
        const s = await fetchFeedbackSummary({
          userId: uid,
          projectId,
          presentationId: presId,
        });
        setSummary(s);
      } catch { }
    };
    loadSummary();
  }, [results, detail, user]);

  const data = summary
    ? normalizeData(summary)
    : normalizeData(detail || results);

  const voice = data.analysis.voice;
  const logic = data.analysis.logic;
  const video = data.analysis.video;

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}분 ${s}초`;
  };

  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* background */}
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
        <div className="absolute inset-0 opacity-30">
          <div className="absolute top-20 left-20 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl" />
          <div className="absolute bottom-20 right-20 w-96 h-96 bg-green-500/20 rounded-full blur-3xl" />
        </div>
      </div>

      <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* SCORE */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center mb-12"
        >
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
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="text-white/80 text-lg"
          >
            {formatDuration(data.duration)}간의 발표를 분석했습니다!
          </motion.p>
        </motion.div>

        <div className="text-center mb-10">
          <h1 className="text-4xl font-extrabold tracking-tight text-white mb-3">
            발표 분석 결과
          </h1>
          <p className="text-white/70 text-sm">
            AI가 분석한 발표 내용을 한눈에 확인해보세요.
          </p>
        </div>

        {/* ============================== */}
        {/*      🔊 음성 분석 (C 스타일)     */}
        {/* ============================== */}
        <section className="mb-12">
          <div className="p-8 rounded-2xl backdrop-blur bg-white/5 border border-white/10 shadow-xl">
            <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-2">
              <Mic className="text-white" />
              <span>음성 분석</span>
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* ⬇︎ 통일된 음성 분석 카드 */}
              {[
                {
                  title: "불필요한 음성",
                  value: `${voice.filler_count}회`,
                  list: voice.filler_list,
                },
                {
                  title: "말하기 속도 (WPM)",
                  value: `${voice.wpm} wpm`,
                },
                {
                  title: "말 사이 공백",
                  value: `${voice.long_pause_count}회`,
                },
                {
                  title: "말끝 흐림",
                  value: `${voice.hesitation_count}회`,
                  list: voice.hesitation_list,
                },
              ].map((item, idx) => (
                <div
                  key={idx}
                  className="p-6 rounded-xl bg-sky-50 border border-sky-200 shadow-md transition-transform hover:scale-105 hover:shadow-xl"
                >
                  <h3 className="text-slate-900 text-lg font-semibold mb-2">
                    {item.title}
                  </h3>
                  <p className="text-sky-700 text-3xl font-bold">{item.value}</p>

                  {item.list?.length > 0 && (
                    <div className="text-slate-600 text-sm space-y-1 mt-3">
                      {item.list.map((v: string, i: number) => (
                        <p key={i}>- {v}</p>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Divider */}
        <div className="h-px w-full bg-white/10 mb-10" />

        {/* ============================== */}
        {/*         🧠 논리 분석           */}
        {/* ============================== */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-white mb-4 flex items-center gap-2">
            <Brain className="text-lime-300" />
            <span>내용 / 논리 분석</span>
          </h2>

          <div className="p-6 rounded-xl bg-lime-50 border border-lime-200 shadow-md transition-transform hover:scale-105 hover:shadow-xl">
            <h3 className="text-slate-900 text-lg font-semibold mb-2">
              대본 유사도
            </h3>
            <p className="text-lime-600 text-3xl font-bold mb-4">
              {logic.similarity !== null
                ? `${logic.similarity}%`
                : "데이터 없음"}
            </p>

            <h4 className="text-slate-900 font-semibold mb-2">
              실제 발화와의 차이 분석
            </h4>

            {logic.similarity_analysis?.length ? (
              logic.similarity_analysis.map((item: string, idx: number) => (
                <p
                  key={idx}
                  className="text-slate-800 rounded-md p-2 border border-lime-100 text-sm mb-2"
                >
                  {item}
                </p>
              ))
            ) : (
              <p className="text-slate-700 text-sm">
                - 논리/대본 분석 결과 없음
              </p>
            )}
          </div>
        </section>

        {/* Divider */}
        <div className="h-px w-full bg-white/10 mb-10" />

        {/* ===================================== */}
        {/* 🔵 영상 분석 — 요소별 색상 리디자인 */}
        {/* ===================================== */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-white mb-6 flex items-center gap-2">
            <VideoIcon className="text-sky-300" />
            <span>영상 분석</span>
          </h2>

          <div className="p-8 rounded-2xl bg-white/5 border border-white/10 shadow-xl backdrop-blur">
            {/* 요약 */}
            <div className="mb-8 p-6 rounded-xl bg-sky-50 border border-sky-200 shadow-md transition-transform hover:scale-105 hover:shadow-xl">
              <h3 className="text-slate-900 text-lg font-semibold mb-3">
                영상 기반 피드백 요약
              </h3>
              <p className="text-slate-700 whitespace-pre-line">
                {video.feedback_preview}
              </p>
            </div>

            {/* 세부 분석 6개 카드 */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

              {/* 영상 점수 */}
              <div className="p-6 rounded-xl bg-indigo-50 border border-indigo-200 shadow-md transition-transform hover:scale-105 hover:shadow-xl">
                <h3 className="text-slate-900 text-lg font-semibold mb-2">
                  영상 점수
                </h3>
                <p className="text-indigo-600 text-3xl font-bold">
                  {data.scores.video} / 40
                </p>
              </div>

              {/* 시선 */}
              <div className="p-6 rounded-xl bg-sky-50 border border-sky-200 shadow-md hover:scale-105 transition">
                <h3 className="text-slate-900 text-lg font-semibold mb-2">시선 처리</h3>

                {/* 변환된 값 */}
                <p className="text-slate-800 text-xl font-bold">
                  {toPercent(video.gaze?.center_ratio)}
                </p>
                <p className="text-slate-600 mb-2 text-sm">
                  {interpretGaze(video.gaze?.center_ratio ?? 0)}
                </p>

                <p className="text-xs text-slate-500">
                  좌/정면/우 : {video.gaze?.distribution?.left ?? 0} /{" "}
                  {video.gaze?.distribution?.center ?? 0} /{" "}
                  {video.gaze?.distribution?.right ?? 0}
                </p>
              </div>

              {/* 자세 */}
              <div className="p-6 rounded-xl bg-emerald-50 border border-emerald-200 shadow-md hover:scale-105 transition">
                <h3 className="text-slate-900 text-lg font-semibold mb-2">자세 안정성</h3>

                <p className="text-emerald-700 text-xl font-bold">
                  {toScore(video.posture?.stability)}점
                </p>

                <p className="text-sm text-slate-600 mb-2">
                  {interpretPosture(video.posture?.stability ?? 0)}
                </p>

                <p className="text-xs text-slate-500">
                  Roll 평균 : {video.posture?.roll_mean?.toFixed(1) ?? "-"}°
                </p>
              </div>

              {/* 제스처 */}
              <div className="p-6 rounded-xl bg-amber-50 border border-amber-200 shadow-md hover:scale-105 transition">
                <h3 className="text-slate-900 text-lg font-semibold mb-2">제스처 / 손동작</h3>

                <p className="text-amber-700 text-xl font-bold">
                  {toPercent(video.gesture?.motion_energy)}
                </p>

                <p className="text-sm text-slate-600 mb-2">
                  {interpretGesture(video.gesture?.motion_energy ?? 0)}
                </p>

                <p className="text-xs text-slate-500">
                  손 노출 비율: {toPercent(video.hand?.visibility_ratio)}
                </p>
              </div>

              {/* 머리 방향 (등급 + 해석 추가 버전) */}
              <div className="p-6 rounded-xl bg-violet-50 border border-violet-200 shadow-md hover:scale-105 transition">
                <h3 className="text-slate-900 text-lg font-semibold mb-2">머리 방향</h3>

                {/* 계산 부분 */}
                {(() => {
                  const yaw = video.head?.yaw_mean ?? 0;
                  const roll = video.head?.roll_mean ?? 0;

                  const getGrade = (value: number, type: "yaw" | "roll") => {
                    if (type === "yaw") {
                      if (value < 5) return { label: "Excellent", color: "text-green-600", desc: "정면 유지가 매우 안정적이에요." };
                      if (value < 15) return { label: "Good", color: "text-blue-600", desc: "살짝 좌우로 움직였지만 자연스러운 범위예요." };
                      if (value < 25) return { label: "Warning", color: "text-amber-600", desc: "고개가 자주 돌아가 집중도가 떨어질 수 있어요." };
                      return { label: "Poor", color: "text-red-600", desc: "정면 유지가 어려워 시선 분산이 커요." };
                    } else {
                      if (value < 5) return { label: "Excellent", color: "text-green-600", desc: "상체 균형이 매우 안정적이에요." };
                      if (value < 10) return { label: "Good", color: "text-blue-600", desc: "약간의 기울기지만 발표에 큰 문제 없어요." };
                      if (value < 15) return { label: "Warning", color: "text-amber-600", desc: "기울어짐이 눈에 띄어 안정감이 떨어져요." };
                      return { label: "Poor", color: "text-red-600", desc: "기울기가 커서 자세 안정성이 낮아져요." };
                    }
                  };

                  const yawGrade = getGrade(yaw, "yaw");
                  const rollGrade = getGrade(roll, "roll");

                  return (
                    <div className="space-y-4">

                      {/* Yaw */}
                      <div>
                        <p className="text-slate-900 text-sm font-semibold mb-1">
                          좌우 회전(Yaw)
                        </p>
                        <p className="text-slate-700 text-sm">
                          평균 {yaw.toFixed(2)}°
                          <span className={`ml-2 font-bold ${yawGrade.color}`}>
                            ({yawGrade.label})
                          </span>
                        </p>
                        <p className="text-xs text-slate-600 mt-1">
                          {yawGrade.desc}
                        </p>
                      </div>

                      {/* Roll */}
                      <div>
                        <p className="text-slate-900 text-sm font-semibold mb-1">
                          기울기(Roll)
                        </p>
                        <p className="text-slate-700 text-sm">
                          평균 {roll.toFixed(2)}°
                          <span className={`ml-2 font-bold ${rollGrade.color}`}>
                            ({rollGrade.label})
                          </span>
                        </p>
                        <p className="text-xs text-slate-600 mt-1">
                          {rollGrade.desc}
                        </p>
                      </div>

                    </div>
                  );
                })()}
              </div>

              {/* 영상 정보 */}
              <div className="p-6 rounded-xl bg-slate-50 border border-slate-200 shadow-md hover:scale-105 transition">
                <h3 className="text-slate-900 text-lg font-semibold mb-3">영상 정보</h3>

                <div className="space-y-3">

                  {/* ⏱ 재생 시간 */}
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center">
                      ⏱
                    </div>
                    <div>
                      <p className="text-slate-900 text-sm font-semibold">재생 시간</p>
                      <p className="text-slate-700 text-sm">
                        {(video.metadata?.duration_sec ?? 0).toFixed(1)}초
                      </p>
                    </div>
                  </div>

                  {/* 🎥 FPS */}
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center">
                      🎥
                    </div>
                    <div>
                      <p className="text-slate-900 text-sm font-semibold">FPS(프레임)</p>
                      <p className="text-slate-700 text-sm">
                        {video.metadata?.fps ?? 0} fps
                      </p>
                      <p className="text-xs text-slate-500">
                        {video.metadata?.fps >= 30
                          ? "부드러운 영상 품질"
                          : "FPS가 낮아 분석 품질이 조금 떨어질 수 있어요"}
                      </p>
                    </div>
                  </div>

                  {/* 🖼 해상도 */}
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center">
                      🖼️
                    </div>
                    <div>
                      <p className="text-slate-900 text-sm font-semibold">해상도</p>
                      <p className="text-slate-700 text-sm">
                        {video.metadata?.resolution?.[0] ?? "-"} ×{" "}
                        {video.metadata?.resolution?.[1] ?? "-"}
                      </p>
                      <p className="text-xs text-slate-500">
                        {(() => {
                          const w = video.metadata?.resolution?.[0] ?? 0;
                          if (w >= 1920) return "고화질 영상으로 분석 정확도가 높습니다.";
                          if (w >= 1280) return "일반 화질 영상입니다.";
                          return "저화질 영상으로 분석 정확도가 떨어질 수 있어요.";
                        })()}
                      </p>
                    </div>
                  </div>

                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ================================ */}
        {/*       🟨 최종 리포트            */}
        {/* ================================ */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-white mb-4 flex items-center gap-2">
            <FileText className="text-amber-300" />
            <span>최종 피드백</span>
          </h2>

          <div className="p-8 rounded-xl bg-amber-50 border border-amber-200 shadow-md transition-transform hover:scale-105 hover:shadow-xl">
            <div className="grid grid-cols-3 gap-4 w-full max-w-lg mx-auto mb-8">
              {[
                { label: "음성 점수", value: data.scores.voice, outOf: 40 },
                { label: "논리 점수", value: data.scores.logic, outOf: 20 },
                { label: "영상 점수", value: data.scores.video, outOf: 40 },
              ].map((s, idx) => (
                <div
                  key={idx}
                  className="bg-white p-4 rounded-lg border border-amber-100 shadow-sm text-center"
                >
                  <div className="text-sm text-slate-500 mb-1">{s.label}</div>
                  <div className="text-xl font-bold">
                    {s.value}
                    <span className="text-xs text-slate-400 ml-1">
                      / {s.outOf}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <p className="text-slate-700 text-lg mb-6 text-center">
              AI가 분석한 종합 피드백 보고서가 준비되었습니다.
            </p>

            <div className="flex justify-center">
              <Button
                onClick={() => setShowModal(true)}
                className="bg-amber-500 hover:bg-amber-600 text-white px-8 py-3 text-lg rounded-full shadow-lg transition-transform hover:scale-105"
              >
                AI 피드백 전체 보기
              </Button>
            </div>
          </div>
        </section>

        {/* bottom buttons */}
        <div className="flex justify-between mt-4 mb-4 gap-4">
          <Button
            onClick={() => onNavigate("record")}
            className="flex-1 bg-gradient-to-r from-blue-500 to-green-500 text-white h-12 transition-transform hover:scale-105"
          >
            다시 녹화하기
          </Button>
          <Button
            onClick={() => onNavigate("mypage")}
            className="flex-1 bg-gradient-to-r from-purple-500 to-pink-500 text-white h-12 transition-transform hover:scale-105"
          >
            내 발표 보러가기
          </Button>
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[80vh] overflow-auto shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-white z-10">
              <div className="flex items-center gap-2 text-slate-900">
                <FileText className="w-5 h-5" />
                <span className="font-semibold">AI 피드백</span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDownloadPDF}
                  className="flex items-center gap-2 text-amber-600 border-amber-200 hover:bg-amber-50"
                >
                  <Download className="w-4 h-4" />
                  PDF 다운로드
                </Button>
                <button
                  onClick={() => setShowModal(false)}
                  className="text-slate-500 hover:text-slate-800 p-2"
                >
                  닫기
                </button>
              </div>
            </div>

            <div className="p-8" ref={modalRef} style={{ backgroundColor: "#ffffff", fontFamily: "sans-serif" }}>
              <div className="mb-6 text-center pb-6" style={{ borderBottom: "1px solid #e2e8f0" }}>
                <h2 className="text-3xl font-extrabold mb-2" style={{ color: "#0f172a" }}>발표 분석 보고서</h2>
                <p style={{ color: "#64748b" }}>AI Coach가 분석한 상세 피드백입니다.</p>
              </div>
              <article style={{ color: "#334155", fontSize: "0.875rem", lineHeight: "1.625" }}>
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    h1: ({ node, ...props }) => (
                      <h1
                        className="text-2xl font-bold mt-8 mb-4 pb-2"
                        style={{ color: "#0f172a", borderBottom: "1px solid #e2e8f0" }}
                        {...props}
                      />
                    ),
                    h2: ({ node, ...props }) => (
                      <h2
                        className="text-xl font-bold mt-8 mb-4 flex items-center gap-2 p-2 rounded-lg"
                        style={{ color: "#1e293b", backgroundColor: "#f8fafc", borderLeft: "4px solid #fbbf24" }}
                        {...props}
                      />
                    ),
                    h3: ({ node, ...props }) => (
                      <h3
                        className="text-lg font-semibold mt-6 mb-3"
                        style={{ color: "#1e293b" }}
                        {...props}
                      />
                    ),
                    p: ({ node, ...props }) => (
                      <p
                        className="mb-4"
                        style={{ color: "#475569", lineHeight: "1.625" }}
                        {...props}
                      />
                    ),
                    strong: ({ node, ...props }) => (
                      <strong style={{ color: "#0f172a", fontWeight: "600" }} {...props} />
                    ),
                    em: ({ node, ...props }) => (
                      <em style={{ fontStyle: "italic" }} {...props} />
                    ),
                    code: ({ node, ...props }) => (
                      <code style={{ backgroundColor: "#f1f5f9", padding: "0.2em 0.4em", borderRadius: "0.25rem", fontSize: "0.875em", fontFamily: "monospace", color: "#0f172a" }} {...props} />
                    ),
                    table: ({ node, ...props }) => (
                      <div className="overflow-x-auto my-6 rounded-lg shadow-sm" style={{ border: "1px solid #e2e8f0" }}>
                        <table className="w-full text-sm text-left" style={{ color: "#475569", borderCollapse: "collapse" }} {...props} />
                      </div>
                    ),
                    thead: ({ node, ...props }) => (
                      <thead className="text-xs uppercase" style={{ color: "#334155", backgroundColor: "#f8fafc", borderBottom: "1px solid #e2e8f0" }} {...props} />
                    ),
                    th: ({ node, ...props }) => (
                      <th className="px-6 py-3 font-bold" {...props} />
                    ),
                    td: ({ node, ...props }) => (
                      <td className="px-6 py-4" style={{ borderBottom: "1px solid #f1f5f9" }} {...props} />
                    ),
                    ul: ({ node, ...props }) => (
                      <ul className="list-disc list-outside ml-5 mb-4" style={{ color: "#475569" }} {...props} />
                    ),
                    ol: ({ node, ...props }) => (
                      <ol className="list-decimal list-outside ml-5 mb-4" style={{ color: "#475569" }} {...props} />
                    ),
                    li: ({ node, ...props }) => (
                      <li className="mb-1" {...props} />
                    ),
                    blockquote: ({ node, ...props }) => (
                      <blockquote className="pl-4 italic my-4" style={{ borderLeft: "4px solid #cbd5e1", color: "#64748b" }} {...props} />
                    ),
                    a: ({ node, ...props }) => (
                      <a style={{ color: "#2563eb", textDecoration: "underline" }} {...props} />
                    ),
                    hr: ({ node, ...props }) => (
                      <hr className="my-8" style={{ borderTop: "1px solid #e2e8f0" }} {...props} />
                    ),
                  }}
                >
                  {data.final_report ||
                    data.final_report_preview ||
                    ""}
                </ReactMarkdown>
              </article>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
