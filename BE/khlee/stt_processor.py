import os
import json
import whisper
from moviepy.editor import VideoFileClip
from firebase_admin import credentials, db
import firebase_admin

# ------------------------------------
# 📌 프로젝트별 설정값
# ------------------------------------
# Firebase Project ID: csc4004-1-4-team04 에 기반하여 Realtime DB URL 설정
FIREBASE_DATABASE_URL = "https://csc4004-1-4-team04-default-rtdb.firebaseio.com/"
USER_ID = "2021111985_JungHyeon" #이용자 아이디, 이름

# Firebase 서비스 계정 키 경로
CREDENTIAL_PATH = "/content/drive/MyDrive/AI_Coach_Data/Firebase_Keys/csc4004-1-4-team04-adminsdk.json"

# 영상 파일 경로 설정 (구글 드라이브 폴더 경로)
# 코랩에서 작성해서 다음과 같이 설정 변경 가능
INPUT_VIDEO_DIR = "/content/drive/MyDrive/AI_Coach_Data/videos"
OUTPUT_AUDIO_DIR = "/content/drive/MyDrive/AI_Coach_Data/results/audio_wav"
OUTPUT_JSON_DIR = "/content/drive/MyDrive/AI_Coach_Data/results/stt_json"

WHISPER_MODEL_SIZE = "small" # 'base', 'small', 'medium' 등 선택

# ------------------------------------
# 1. Firebase 초기화 및 DB 함수
# ------------------------------------
def initialize_firebase():
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

def upload_to_firebase_text(user_id, file_name, stt_data):
    """STT 전사 결과 중 'full_text'만 DB의 stt_raw 경로에 업로드합니다."""
    ref_path_text = f'users/{user_id}/presentations/{file_name}/stt_raw/full_text'
    ref_path_timestamps = f'users/{user_id}/presentations/{file_name}/stt_raw/timestamps'

    try:
        # 1. full_text 저장
        db.reference(ref_path_text).set(stt_data['full_text'])
        # 2. 단어별 타임스탬프 저장
        db.reference(ref_path_timestamps).set(stt_data['words'])
        print(f"    -> [DB] 텍스트 및 타임스탬프 업로드 완료.")
        
    except Exception as e:
        print(f"    -> [DB] Firebase 업로드 실패. 오류: {e}")

# ------------------------------------
# 2. 오디오 추출 함수
# ------------------------------------
def extract_audio(video_path, output_audio_path):
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

# ------------------------------------
# 3. Whisper STT 전사 및 분석 자료 생성 함수
# ------------------------------------
def whisper_transcribe(audio_path):
    print(f"  -> [STT] Whisper {WHISPER_MODEL_SIZE} 모델 로딩 및 전사 중...")
    try:
        model = whisper.load_model(WHISPER_MODEL_SIZE)
        result = model.transcribe(
            audio_path,
            language="ko",
            word_timestamps=True
        )

        full_text = result.get('text', '').strip()
        word_timestamps = []
        duration_sec = 0.0

        for segment in result.get('segments', []):
            if 'words' in segment:
                word_timestamps.extend(segment['words'])

        if word_timestamps:
            duration_sec = word_timestamps[-1].get('end', 0.0)

        analysis_data = {
            "full_text": full_text,
            "words": word_timestamps,
            "duration_sec": duration_sec,
            "word_count": len(word_timestamps)
        }

        print("  ✅ STT 전사 완료.")
        return analysis_data

    except Exception as e:
        print(f"  ❌ Whisper 전사 실패: {e}")
        return None

# ------------------------------------
# 4. 통합 배치 처리 함수
# ------------------------------------
def process_multiple_videos(input_dir, output_dir_audio, output_dir_json, user_id):

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
        txt_path = os.path.join(output_dir_json, f"{base_name}_text.txt")
        json_path = os.path.join(output_dir_json, f"{base_name}_analysis.json")

        # 1. 오디오 추출
        if not extract_audio(video_path, audio_path):
             continue

        # 2. Whisper STT 전사 및 분석 자료 생성
        stt_result = whisper_transcribe(audio_path)

        if stt_result:
            # 3-1. full_text만 TXT 파일로 저장
            try:
                with open(txt_path, 'w', encoding='utf-8') as f:
                    f.write(stt_result['full_text'])
                print(f"  ✅ 텍스트 파일 저장 완료: {txt_path}")
            except Exception as e:
                print(f"  ❌ TXT 파일 저장 실패: {e}")

            # 3-2. 분석 자료 전체를 JSON 파일로 저장
            try:
                with open(json_path, 'w', encoding='utf-8') as f:
                    json.dump(stt_result, f, ensure_ascii=False, indent=4)
                print(f"  ✅ 분석 자료 JSON 저장 완료: {json_path}")
            except Exception as e:
                print(f"  ❌ JSON 파일 저장 실패: {e}")

            # 4. Firebase DB에 텍스트 및 타임스탬프 업로드
            if is_firebase_ok:
                print("  [Step 4/4] Firebase DB에 텍스트 업로드 중...")
                upload_to_firebase_text(user_id, base_name, stt_result)
# --- 최종 실행 ---
process_multiple_videos(INPUT_VIDEO_DIR, OUTPUT_AUDIO_DIR, OUTPUT_JSON_DIR, USER_ID)
