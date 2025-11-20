// src/components/RecordPage.tsx
import { useState, useRef, useEffect } from 'react';
import { motion } from 'motion/react';
import { Video, Square, Play, Mic, MicOff, Camera, CameraOff } from 'lucide-react';
import { Button } from './ui/button';
import { Progress } from './ui/progress';
import { analyzePresentation } from '../apis/analyze'; // 🔹 백엔드 API 호출 모듈


type Page = 'home' | 'record' | 'results' | 'mypage' | 'loading';

interface RecordPageProps {
  user: any;
  selectedProjectId: string; 
  onNavigate: (page: Page) => void;
  onComplete: (results: any) => void;
}

export function RecordPage({ user, selectedProjectId, onNavigate, onComplete }: RecordPageProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isPreparing, setIsPreparing] = useState(false);
  const [isRecorded, setIsRecorded] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const recordedBlobRef = useRef<Blob | null>(null);

  // 🔹 비디오 스트림 연결
  useEffect(() => {
    if (videoRef.current && stream) videoRef.current.srcObject = stream;
  }, [stream]);

  // 🔹 카메라 시작
  const startPreview = async () => {
    try {
      setIsPreparing(true);
      const mediaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setStream(mediaStream);
      if (videoRef.current) videoRef.current.srcObject = mediaStream;
    } catch (err: any) {
      console.error(err);
      setError('카메라 또는 마이크 접근이 차단되어 있습니다.');
    } finally {
      setIsPreparing(false);
    }
  };

  // 🔹 오디오/비디오 토글
  const toggleAudio = () => {
    if (stream) {
      stream.getAudioTracks().forEach((t) => (t.enabled = !audioEnabled));
      setAudioEnabled(!audioEnabled);
    }
  };

  const toggleVideo = () => {
    if (stream) {
      stream.getVideoTracks().forEach((t) => (t.enabled = !videoEnabled));
      setVideoEnabled(!videoEnabled);
    }
  };

  // 🔹 녹화 시작
  const startRecording = () => {
    if (!stream) return;
    const mediaRecorder = new MediaRecorder(stream);
    const chunks: Blob[] = [];

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    mediaRecorder.onstop = () => {
      const blob = new Blob(chunks, { type: 'video/webm' });
      recordedBlobRef.current = blob;
      setIsRecorded(true);
      console.log('🎥 녹화 완료:', blob);
    };

    mediaRecorderRef.current = mediaRecorder;
    mediaRecorder.start();
    setIsRecording(true);
    setRecordingTime(0);

    timerRef.current = setInterval(() => setRecordingTime((prev) => prev + 1), 1000);
  };

  // 🔹 녹화 중지
  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  //========================================================//
  // 🔹 발표 분석 요청
const handleAnalyze = async () => {
  if (!recordedBlobRef.current) {
    alert("녹화된 영상이 없습니다.");
    return;
  }

  try {
    onNavigate("loading");

      // ------------- 🔥 MOCK 사용 구간 -------------
      const mock = await import("../mocks/sampleResult.json");

      onComplete(mock.default);
      onNavigate("results");
      return;
  // ---------------------------------------------
  
    /*
    // 🔥 Blob을 File 객체로 변환 (백엔드에서 File 필요)
    const file = new File([recordedBlobRef.current], "presentation.webm", {
      type: "video/webm",
    });

    // 로딩 페이지로 이동 (선택)
    onNavigate("loading");

    // 🔥 백엔드 API 호출
    const result = await analyzePresentation(user.uid, selectedProjectId, file);

    console.log("백엔드 분석 결과:", result);

    // 🔥 결과 페이지로 전달
    onComplete(result);

    // 🔥 페이지 이동
    onNavigate("results");
*/
  } catch (err) {
    console.error(err);
    alert("발표 분석 중 오류가 발생했습니다.");
  }
  
};

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* 배경 */}
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
        <div className="absolute inset-0 opacity-30">
          <div className="absolute top-20 left-20 w-96 h-96 bg-blue-500/30 rounded-full blur-3xl" />
          <div className="absolute bottom-20 right-20 w-96 h-96 bg-green-500/30 rounded-full blur-3xl" />
        </div>
      </div>

      <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <h1 className="text-4xl mb-2 text-white">발표 녹화하기</h1>
          <p className="text-white/60">AI가 당신의 발표를 분석하고 개선점을 제안합니다</p>
        </motion.div>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* 🎥 비디오 미리보기 */}
          <div className="lg:col-span-2">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="relative aspect-video bg-slate-800/50 rounded-2xl overflow-hidden border border-white/10"
            >
              {!stream ? (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center px-6">
                    <Camera className="w-16 h-16 text-white/40 mx-auto mb-4" />
                    {error ? (
                      <p className="text-red-400 mb-4">{error}</p>
                    ) : (
                      <p className="text-white/60 mb-4">카메라를 활성화하여 시작하세요</p>
                    )}
                    <Button
                      onClick={startPreview}
                      disabled={isPreparing}
                      className="bg-gradient-to-r from-blue-500 to-green-500 text-white border-0"
                    >
                      {isPreparing ? '준비 중...' : '카메라 시작'}
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover"
                  />

                  {/* 🔴 REC 표시 */}
                  {isRecording && (
                    <motion.div
                      animate={{ opacity: [1, 0.5, 1] }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                      className="absolute top-4 left-4 flex items-center gap-2 px-4 py-2 rounded-full bg-red-500/90"
                    >
                      <div className="w-3 h-3 rounded-full bg-white" />
                      <span className="text-white">REC</span>
                    </motion.div>
                  )}

                  {/* 🎛 하단 컨트롤 */}
                  <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Button
                        onClick={toggleAudio}
                        size="sm"
                        variant="outline"
                        className="bg-black/50 border-white/20 text-white hover:bg-black/70"
                      >
                        {audioEnabled ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
                      </Button>
                      <Button
                        onClick={toggleVideo}
                        size="sm"
                        variant="outline"
                        className="bg-black/50 border-white/20 text-white hover:bg-black/70"
                      >
                        {videoEnabled ? <Camera className="w-4 h-4" /> : <CameraOff className="w-4 h-4" />}
                      </Button>
                    </div>

                    {isRecording && (
                      <div className="px-4 py-2 rounded-lg bg-black/50 text-white">
                        {formatTime(recordingTime)}
                      </div>
                    )}
                  </div>
                </>
              )}
            </motion.div>

            {/* 🎬 녹화 버튼 */}
            {stream && !isRecorded && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-6 flex items-center justify-center gap-4"
              >
                {!isRecording ? (
                  <Button
                    onClick={startRecording}
                    size="lg"
                    className="bg-gradient-to-r from-blue-500 to-green-500 text-white border-0 px-8"
                  >
                    <Play className="w-5 h-5 mr-2" />
                    녹화 시작
                  </Button>
                ) : (
                  <Button
                    onClick={stopRecording}
                    size="lg"
                    className="bg-red-500 hover:bg-red-600 text-white border-0 px-8"
                  >
                    <Square className="w-5 h-5 mr-2" />
                    녹화 중지
                  </Button>
                )}
              </motion.div>
            )}

            {/* ✅ 녹화 완료 후 */}
            {isRecorded && !isRecording && (
              <div className="mt-6 flex items-center justify-center gap-6">
                <Button
                  onClick={() => {
                    setIsRecorded(false);
                    recordedBlobRef.current = null;
                  }}
                  className="bg-slate-600 hover:bg-slate-700 text-white border-0 px-6"
                >
                  다시 녹화하기
                </Button>
                <Button
                  onClick={handleAnalyze}
                  className="bg-gradient-to-r from-blue-500 to-green-500 text-white border-0 px-6"
                >
                  내 발표 분석하기
                </Button>
              </div>
            )}
          </div>

          {/* 💡 팁 섹션 */}
          <div className="lg:col-span-1">
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="p-6 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm"
            >
              <h3 className="text-xl mb-4 text-white">녹화 팁</h3>
              <ul className="space-y-3 text-white/70 text-sm">
                <li>💡 밝은 조명에서 촬영하세요</li>
                <li>🎤 마이크와 적절한 거리를 유지하세요</li>
                <li>📷 카메라는 눈높이에 맞추세요</li>
              </ul>
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
}