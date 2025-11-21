from pathlib import Path
from datetime import datetime
from functools import partial
from fastapi import FastAPI, UploadFile, File, Form, Body
from fastapi.responses import StreamingResponse
import os, asyncio, json, shutil

from video_analyzer import analyze_video, set_progress, get_progress
from stt_processor import (
    extract_audio,
    whisper_transcribe,
    process_single_video,
    get_stt_progress,
)
from feedback_api import router as voice_feedback_router, generate_combined_feedback_report

# Firebase (RTDB)
import firebase_admin
from firebase_admin import credentials, db

FIREBASE_DATABASE_URL = "https://csc4004-1-4-team04-default-rtdb.firebaseio.com/"
cred = credentials.Certificate("serviceAccountKey.json")

if not firebase_admin._apps:
    firebase_admin.initialize_app(cred, {'databaseURL': FIREBASE_DATABASE_URL})

app = FastAPI()
app.include_router(voice_feedback_router)


def save_video_analysis_file(result: dict, filename: str, output_dir: Path) -> str:
    """비디오 분석 결과를 지정한 디렉터리에 저장하고 경로를 반환합니다."""
    output_dir.mkdir(parents=True, exist_ok=True)
    stem = Path(filename).stem
    output_path = output_dir / f"{stem}_analysis.json"
    output_path.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    return str(output_path)


def save_combined_analysis_file(video_result: dict, stt_result: dict, filename: str, output_dir: Path) -> str:
    """영상+음성 결과를 하나의 JSON으로 묶어 저장."""
    output_dir.mkdir(parents=True, exist_ok=True)
    stem = Path(filename).stem
    output_path = output_dir / f"{stem}_combined.json"
    combined = {"video_result": video_result, "stt_result": stt_result}
    output_path.write_text(json.dumps(combined, ensure_ascii=False, indent=2), encoding="utf-8")
    return str(output_path)


def create_run_dirs(run_id: str):
    base = Path("results") / run_id
    video_dir = base / "video"
    audio_dir = base / "audio"
    combined_dir = base / "combined"
    for d in (video_dir, audio_dir, combined_dir):
        d.mkdir(parents=True, exist_ok=True)
    return base, video_dir, audio_dir, combined_dir


@app.get("/")
def root():
    return {"message": "🎥 Video Analysis API with Progress Stream"}


@app.post("/analyze/video")
async def analyze_video_api(
    user_id: str = Form(...),  # 로그인된 user ID를 받음
    file: UploadFile = File(...)):
    """
    업로드된 영상 파일을 분석하여 시선/자세 분석과 음성 분석을 실행하고,
    진행률은 /analyze/progress 에서 실시간 스트리밍됩니다.
    결과는 RTDB에 저장합니다.
    """
    base_name = os.path.splitext(file.filename)[0]
    temp_dir = f"temp_{user_id}_{base_name}"
    os.makedirs(temp_dir, exist_ok=True)

    temp_video_path = os.path.join(temp_dir, file.filename)
    temp_audio_path = os.path.join(temp_dir, f"{base_name}.wav")

    contents = await file.read()
    with open(temp_video_path, "wb") as f:
        f.write(contents)

    loop = asyncio.get_event_loop()

    try:
        gaze_task = loop.run_in_executor(None, analyze_video, temp_video_path)
        await loop.run_in_executor(None, extract_audio, temp_video_path, temp_audio_path)
        stt_task = loop.run_in_executor(None, whisper_transcribe, temp_audio_path)

        gaze_results = await gaze_task
        stt_results = await stt_task

        file_db_path = f'users/{user_id}/presentations/{base_name}'
        db.reference(f'{file_db_path}/stt_analysis').set(stt_results)
        db.reference(f'{file_db_path}/vision_analysis').set(gaze_results)

        return {
            "message": "시선/자세 및 STT 분석 완료. RTDB 저장 성공.",
            "user_id": user_id,
            "presentation_id": base_name  # 이 ID로 /feedback/full 호출
        }

    except Exception as e:
        return {"message": f"분석/저장 실패: {str(e)}"}

    finally:
        if os.path.exists(temp_dir):
            shutil.rmtree(temp_dir)


@app.post("/analyze/stt")
async def analyze_speech_api(file: UploadFile = File(...)):
    """
    업로드된 영상에서 오디오를 추출해 Whisper STT 결과를 반환합니다.
    """
    temp_path = Path(f"temp_stt_{file.filename}")
    contents = await file.read()
    temp_path.write_bytes(contents)

    loop = asyncio.get_event_loop()
    try:
        stt_result = await loop.run_in_executor(
            None,
            partial(process_single_video, temp_path, output_basename=Path(file.filename).stem)
        )
    finally:
        if temp_path.exists():
            temp_path.unlink()

    return {"message": f"✅ STT 완료: {file.filename}", "result": stt_result}


@app.post("/analyze/upload-feedback")
async def analyze_upload_feedback_api(file: UploadFile = File(...)):
    """
    영상·음성 동시 분석 후 OpenRouter LLM으로 통합 피드백까지 생성합니다.
    """
    original_filename = file.filename
    run_id = datetime.now().strftime("%Y%m%d_%H%M%S")
    base_dir, video_dir, audio_dir, combined_dir = create_run_dirs(run_id)
    temp_path = Path(f"temp_full_{original_filename}")
    temp_path.write_bytes(await file.read())

    loop = asyncio.get_event_loop()
    stt_callable = partial(
        process_single_video,
        temp_path,
        output_basename=Path(original_filename).stem,
        output_audio_dir=audio_dir,
        output_json_dir=audio_dir,
        upload_to_firebase=False,  # 통합 API에서는 바로 피드백만 반환
    )

    try:
        video_task = loop.run_in_executor(None, analyze_video, str(temp_path))
        stt_task = loop.run_in_executor(None, stt_callable)
        video_result, stt_result = await asyncio.gather(video_task, stt_task)
    finally:
        if temp_path.exists():
            temp_path.unlink()

    video_file_path = save_video_analysis_file(video_result, original_filename, video_dir)

    feedback_payload = generate_combined_feedback_report(
        video_result=video_result,
        stt_result=stt_result,
        user_id=user_id,
        run_id=run_id,
        original_filename=original_filename,
    )
    combined_file_path = save_combined_analysis_file(video_result, stt_result, original_filename, combined_dir)

    return {
        "message": f"✅ 영상·음성 분석 및 피드백 생성 완료: {original_filename}",
        "run_id": run_id,
        "video_result": video_result,
        "stt_result": stt_result,
        "video_analysis_file": video_file_path,
        "stt_output_dir": str(audio_dir),
        "combined_analysis_file": combined_file_path,
        "feedback_file": feedback_payload["file_path"],
        "feedback_preview": feedback_payload["feedback_preview"],
    }


@app.get("/analyze/stt/progress")
def stt_progress_api():
    """STT 처리 단계 및 진행률 조회."""
    return get_stt_progress()


@app.get("/analyze/progress")
async def get_progress_stream():
    """
    실시간 진행률을 SSE(Server-Sent Events)로 스트리밍합니다.
    """
    async def event_generator():
        while True:
            progress = get_progress()
            data = json.dumps({"progress": progress})
            yield f"data: {data}\n\n"
            await asyncio.sleep(1)
            if progress >= 100:
                break

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@app.post("/feedback/from-db")
def feedback_from_db_api(data: dict = Body(...)):
    """
    user_id와 presentation_id를 받아 RTDB에서 모든 분석 데이터를 조회,
    LLM 레포트를 생성한 뒤, 다시 RTDB에 업데이트합니다.
    """
    try:
        user_id = data.get("user_id")
        presentation_id = data.get("presentation_id")

        if not (user_id and presentation_id):
            return {"message": "❌ 'user_id'와 'presentation_id'가 필요합니다."}

        db_path = f'users/{user_id}/presentations/{presentation_id}'

        gaze_data = db.reference(f'{db_path}/vision_analysis').get()
        stt_data = db.reference(f'{db_path}/stt_analysis').get()

        if not gaze_data:
            return {"message": "❌ 시선/자세 분석 데이터를 찾을 수 없습니다."}
        if not stt_data:
            return {"message": "❌ 음성/STT 분석 데이터를 찾을 수 없습니다."}

        feedback_payload = generate_combined_feedback_report(
            video_result=gaze_data,
            stt_result=stt_data,
            user_id=user_id,
            run_id=presentation_id,
            original_filename=presentation_id,
        )

        db.reference(f'{db_path}/final_report').set(feedback_payload["content"])

        return {
            "message": "✅ 영상+음성 통합 Feedback report generated and saved to RTDB.",
            "document_id": f"{user_id}/{presentation_id}",
            "feedback_preview": feedback_payload["feedback_preview"],
            "feedback_file": feedback_payload["file_path"],
        }
    except Exception as e:
        return {"message": f"레포트 생성/저장 실패: {str(e)}"}
