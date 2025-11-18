import os
import json
import whisper
from moviepy.editor import VideoFileClip
from firebase_admin import credentials, db
import firebase_admin
from openai import OpenAI
from typing import Optional, Dict, Any, List
import warnings
warnings.filterwarnings("ignore")

# -----------------------------------------------------------------
# 📌 프로젝트별 설정값 (수정 필수)
# -----------------------------------------------------------------
PROJECT_NAME = "P-CSC4004-C1-T4"
API_KEY = "sk-..." 
FIREBASE_DATABASE_URL = "https://csc4004-1-4-team04-default-rtdb.firebaseio.com/"
USER_ID = "2021111985_JungHyeon"
CREDENTIAL_PATH = "/content/drive/MyDrive/AI_Coach_Data/Firebase_Keys/csc4004-1-4-team04-adminsdk.json"
INPUT_VIDEO_DIR = "/content/drive/MyDrive/AI_Coach_Data/videos"
OUTPUT_AUDIO_DIR = "/content/drive/MyDrive/AI_Coach_Data/results/audio_wav"
OUTPUT_JSON_DIR = "/content/drive/MyDrive/AI_Coach_Data/results/stt_json"
WHISPER_MODEL_SIZE = "small"
PAUSE_THRESHOLD_SEC = 2.0

# 📌 GPT 분석 기준 목록
HESITATION_PATTERNS = ["~했는데", "~같아요", "~말이죠", "~라든지", "~입니다만", "약간", "왠지"]
FILLER_WORDS = ["음", "어", "아", "저", "그니까", "그러니까", "뭐", "사실"]
HESITATION_LIST = ", ".join(HESITATION_PATTERNS)
FILLER_LIST = ", ".join(FILLER_WORDS)

# 📌 OpenAI 클라이언트 초기화
try:
    client = OpenAI(api_key= API_KEY)
except Exception as e:
    print(f"❌ OpenAI 클라이언트 초기화 문제: {e}")

# -----------------------------------------------------------------
# 1. Firebase 및 보조 함수 정의
# -----------------------------------------------------------------
def initialize_firebase() -> bool:
    """Firebase Admin SDK를 초기화합니다."""
    try:
        if not firebase_admin._apps:
            cred = credentials.Certificate(CREDENTIAL_PATH)
            firebase_admin.initialize_app(cred, {'databaseURL': FIREBASE_DATABASE_URL})
        print("✅ Firebase Admin SDK 초기화 완료.")
        return True
    except Exception as e:
        print(f"❌ Firebase 초기화 실패: 오류: {e}")
        return False

def upload_to_firebase_analysis(user_id: str, file_name: str, analysis_result: Dict) -> None:
    """WPM 분석 결과만 Firebase의 voice_analysis 경로에 업로드합니다."""
    ref_path_analysis = f'users/{user_id}/presentations/{file_name}/voice_analysis'
    try:
        analysis_data_to_save = analysis_result.copy()
        analysis_data_to_save.pop('raw_text_for_gpt', None)
        analysis_data_to_save.pop('text_for_logic_analysis', None)

        db.reference(ref_path_analysis).set(analysis_data_to_save)
        print(f"    -> [DB] WPM/추임새 분석 결과 업로드 완료.")

    except Exception as e:
        print(f"    -> [DB] Firebase 업로드 실패. 오류: {e}")

def extract_audio(video_path: str, output_audio_path: str) -> bool:
    """영상 파일에서 오디오를 추출하여 WAV 파일로 저장합니다."""
    try:
        with VideoFileClip(video_path) as video_clip:
            audio_clip = video_clip.audio
            audio_clip.write_audiofile(
                output_audio_path,
                codec='pcm_s16le',
                fps=16000,
                verbose=False,
                logger=None
            )
        return True
    except Exception as e:
        print(f"  ❌ 오디오 추출 실패: {e}")
        return False

def whisper_transcribe(audio_path: str) -> Optional[Dict]:
    """Whisper를 사용하여 STT 전사 및 단어별 타임스탬프를 추출합니다."""
    print(f"  -> [STT] Whisper {WHISPER_MODEL_SIZE} 모델 로딩 및 전사 중...")
    try:
        model = whisper.load_model(WHISPER_MODEL_SIZE)
        result = model.transcribe(audio_path, language="ko", word_timestamps=True)

        full_text = result.get('text', '').strip()
        word_timestamps = []
        for segment in result.get('segments', []):
            if 'words' in segment:
                word_timestamps.extend(segment['words'])

        duration_sec = word_timestamps[-1].get('end', 0.0) if word_timestamps else 0.0

        return {
            "full_text": full_text, "words": word_timestamps,
            "duration_sec": duration_sec, "word_count": len(word_timestamps)
        }

    except Exception as e:
        print(f"  ❌ Whisper 전사 실패: {e}")
        return None

# -----------------------------------------------------------------
# 2. GPT 기반 언어 습관 분석 로직 
# -----------------------------------------------------------------
def analyze_speech_patterns_with_gpt(full_text: str) -> Optional[Dict[str, Any]]:
    """GPT API를 호출하여 말끝 흐림과 추임새를 탐지하고 정제 텍스트를 반환합니다."""
    if not full_text: return {}

    system_prompt = (
        "당신은 발표자의 언어 습관 분석 전문가입니다. 다음 텍스트에서 '말끝 흐림'과 '추임새'를 탐지하고, "
        "JSON 형식으로만 반환하세요. 탐지 후, 탐지된 모든 요소를 제거한 정제 텍스트를 반드시 포함하세요."
        f"탐지 기준: 말끝 흐림 ({HESITATION_LIST}), 추임새 ({FILLER_LIST})."
    )

    try:
        completion = client.chat.completions.create(
            model="gpt-3.5-turbo-1106",
            response_format={"type": "json_object"},
            messages=[{"role": "system", "content": system_prompt}, {"role": "user", "content": full_text}]
        )
        return json.loads(completion.choices[0].message.content)

    except Exception as e:
        print(f"❌ GPT API 호출 (언어 습관) 실패: {e}")
        return {}


# -----------------------------------------------------------------
# 3. WPM, 무음 구간 및 언어 습관 분석 통합 로직
# -----------------------------------------------------------------
def analyze_voice_rhythm_and_patterns(stt_result_data: dict) -> dict:
    """WPM, 무음 구간 탐지 및 GPT 기반 추임새/말끝 흐림 분석을 통합 수행합니다."""

    # 2-1. WPM 및 무음 구간 분석 
    words = stt_result_data.get('words', [])
    total_duration = stt_result_data.get('duration_sec', 0.0)
    word_count = len(words)
    wpm = round((word_count / total_duration) * 60) if total_duration > 0 else 0

    pause_events: List[Dict] = []
    all_pause_durations: List[float] = []

    for i in range(len(words) - 1):
        current_word_end = words[i].get('end', 0.0)
        next_word_start = words[i+1].get('start', 0.0)
        gap_duration = next_word_start - current_word_end
        if gap_duration > 0: all_pause_durations.append(gap_duration)
        if gap_duration >= PAUSE_THRESHOLD_SEC:
            pause_events.append({
                "start_sec": round(current_word_end, 2), "end_sec": round(next_word_start, 2),
                "duration": round(gap_duration, 2)
            })

    total_pause_count = len(all_pause_durations)
    avg_pause_duration = round(sum(all_pause_durations) / total_pause_count, 2) if total_pause_count > 0 else 0.0
    long_pause_count = len(pause_events)
    full_text = stt_result_data.get('full_text', '')


    # 2-2. GPT 기반 추임새/말끝 흐림 분석 
    speech_patterns_result = analyze_speech_patterns_with_gpt(full_text)

    # 2-3. 최종 통합 결과 구성
    return {
        "raw_text_for_gpt": full_text,

        "wpm": wpm,
        "pause_events": pause_events,
        "avg_pause_duration": avg_pause_duration,
        "long_pause_count": long_pause_count,

        "hesitation_count": speech_patterns_result.get('hesitation_count', 0),
        "filler_count": speech_patterns_result.get('filler_count', 0),
        "hesitation_list": speech_patterns_result.get('hesitation_list', []),
        "filler_list": speech_patterns_result.get('filler_list', []),
        "text_for_logic_analysis": speech_patterns_result.get('text_for_logic_analysis', full_text),
    }

# -----------------------------------------------------------------
# 4. 통합 배치 처리 함수 (메인 로직)
# -----------------------------------------------------------------
def process_multiple_videos(input_dir: str, output_dir_audio: str, output_dir_json: str, user_id: str) -> None:

    is_firebase_ok = initialize_firebase()

    os.makedirs(output_dir_audio, exist_ok=True)
    os.makedirs(output_dir_json, exist_ok=True)
    video_files = [f for f in os.listdir(input_dir) if f.endswith('.mp4')]

    if not video_files:
        print(f"경고: '{input_dir}'에서 처리할 MP4 영상 파일을 찾을 수 없습니다.")
        return

    print(f"총 {len(video_files)}개의 영상을 처리합니다. 사용자 ID: {user_id}")

    for i, video_file in enumerate(video_files):
        print(f"\n--- [{i+1}/{len(video_files)}] {video_file} 처리 시작 ---")

        video_path = os.path.join(input_dir, video_file)
        base_name = os.path.splitext(video_file)[0]
        audio_path = os.path.join(output_dir_audio, f"{base_name}.wav")
        full_text_txt_path = os.path.join(output_dir_json, f"{base_name}_fulltext.txt")
        json_path = os.path.join(output_dir_json, f"{base_name}_analysis_data.json")

        # 1. 오디오 추출
        if not extract_audio(video_path, audio_path):
             continue

        # 2. Whisper STT 전사
        stt_data = whisper_transcribe(audio_path)

        if stt_data:
            # 3. WPM, 무음, 추임새, 말끝 흐림 분석 통합 수행
            print("  WPM 및 언어 습관 분석 수행 중...")
            voice_analysis_result = analyze_voice_rhythm_and_patterns(stt_data)
            try:
                full_text_content = voice_analysis_result['raw_text_for_gpt']
                with open(full_text_txt_path, 'w', encoding='utf-8') as f:
                    f.write(full_text_content)
                print(f"  ✅ Full Text TXT 파일 저장 완료: {full_text_txt_path}")
            except Exception as e:
                print(f"  ❌ Full Text TXT 저장 실패: {e}")
            # 4. 로컬 JSON 파일 저장 (WPM 분석 결과 포함)
            final_analysis_data = {
                "stt_raw": stt_data,
                "voice_analysis": voice_analysis_result
            }
            with open(json_path, 'w', encoding='utf-8') as f:
                json.dump(final_analysis_data, f, ensure_ascii=False, indent=4)
            print(f"  ✅ 최종 분석 자료 JSON 저장 완료: {json_path}")

            # 5. Firebase DB에 WPM 분석 결과 업로드
            if is_firebase_ok:
                print("  Firebase DB에 분석 결과 업로드 중...")
                upload_to_firebase_analysis(user_id, base_name, voice_analysis_result)

# --- 최종 실행 ---
# 이 부분을 실행하는 셀이 위 모든 함수 정의 셀보다 나중에 실행되어야 합니다.
process_multiple_videos(INPUT_VIDEO_DIR, OUTPUT_AUDIO_DIR, OUTPUT_JSON_DIR, USER_ID)
