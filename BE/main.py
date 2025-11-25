from pathlib import Path
from datetime import datetime
import math
from functools import partial
from fastapi import FastAPI, UploadFile, File, Form, Body
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
import os, asyncio, json, shutil
import numpy as np

from video_analyzer import analyze_video, set_progress, get_progress
from stt_processor import (
    extract_audio,
    whisper_transcribe,
    process_single_video,
    get_stt_progress,
    analyze_voice_rhythm_and_patterns,
)

from combined_feedback_generator import generate_combined_feedback_report
from result_summary_api import router as summary_router

# Firebase (Firestore)
import firebase_admin
from firebase_admin import credentials, firestore

FIREBASE_CRED_PATH = os.getenv("FIREBASE_CRED_PATH", "serviceAccountKey.json")
FIREBASE_PROJECT_ID = os.getenv("FIREBASE_PROJECT_ID")


def _init_firestore():
    if not firebase_admin._apps:
        cred = credentials.Certificate(FIREBASE_CRED_PATH)
        options = {"projectId": FIREBASE_PROJECT_ID} if FIREBASE_PROJECT_ID else None
        firebase_admin.initialize_app(cred, options)
    return firestore.client()


db = _init_firestore()

app = FastAPI()
app.include_router(summary_router)

ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "*")
origin_list = [o.strip() for o in ALLOWED_ORIGINS.split(",") if o.strip()] if ALLOWED_ORIGINS else []
# 와일드카드(*)일 때는 allow_credentials=False 이어야 CORS 에러를 피할 수 있음
allow_credentials = "*" not in origin_list
if not origin_list:
    origin_list = ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origin_list,
    allow_credentials=allow_credentials,
    allow_methods=["*"],
    allow_headers=["*"],
)


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


def _presentation_doc(user_id: str, presentation_id: str):
    return (
        db.collection("users")
        .document(user_id)
        .collection("presentations")
        .document(presentation_id)
    )


def _feedback_doc(user_id: str, project_id: str, feedback_id: str):
    return (
        db.collection("users")
        .document(user_id)
        .collection("projects")
        .document(project_id)
        .collection("feedback")
        .document(feedback_id)
    )


def _sanitize_for_firestore(obj):
    """Firestore가 허용하는 기본 타입으로 변환."""
    if obj is None:
        return None
    # numpy scalar
    if hasattr(np, "generic") and isinstance(obj, np.generic):
        return _sanitize_for_firestore(obj.item())
    if isinstance(obj, (np.floating, np.float32, np.float64)):
        val = float(obj)
        return val if math.isfinite(val) else None
    if isinstance(obj, (np.integer,)):
        return int(obj)
    if isinstance(obj, (np.bool_)):
        return bool(obj)
    if isinstance(obj, float):
        return obj if math.isfinite(obj) else None
    if isinstance(obj, int):
        return obj
    # pathlib
    if isinstance(obj, Path):
        return str(obj)
    # numpy array
    if hasattr(obj, "shape") and hasattr(obj, "tolist"):
        try:
            return obj.tolist()
        except Exception:
            pass
    # 리스트/튜플
    if isinstance(obj, (list, tuple)):
        return [_sanitize_for_firestore(v) for v in obj]
    # dict
    if isinstance(obj, dict):
        return {k: _sanitize_for_firestore(v) for k, v in obj.items()}
    # 기본 타입은 그대로
    # Firestore는 binary 등 일부 타입을 허용하지 않으므로 문자열 변환
    try:
        json.dumps(obj)  # 직렬화 가능 여부 체크
        return obj
    except Exception:
        return str(obj)


@app.post("/analyze/video")
async def analyze_video_api(
    user_id: str = Form(...),  # 로그인된 user ID를 받음
    project_id: str = Form(...),  # 선택된 프로젝트 ID
    file: UploadFile = File(...)):
    """
    업로드된 영상 파일을 분석하여 시선/자세 분석과 음성 분석을 실행하고,
    진행률은 /analyze/progress 에서 실시간 스트리밍됩니다.
    결과는 Firestore에 저장합니다. 저장 위치:
    users/{user_id}/projects/{project_id}/feedback/{presentation_id}
    """
    base_name = os.path.splitext(file.filename)[0]
    temp_dir = f"temp_{user_id}_{base_name}"
    os.makedirs(temp_dir, exist_ok=True)

    temp_video_path = os.path.join(temp_dir, file.filename)
    temp_audio_path = os.path.join(temp_dir, f"{base_name}.wav")

    contents = await file.read()
    with open(temp_video_path, "wb") as f:
        f.write(contents)

    print(f"[analyze_video] user_id={user_id}, project_id={project_id}, file={file.filename}")

    loop = asyncio.get_event_loop()

    try:
        gaze_task = loop.run_in_executor(None, analyze_video, temp_video_path)
        await loop.run_in_executor(None, extract_audio, temp_video_path, temp_audio_path)
        stt_task = loop.run_in_executor(None, whisper_transcribe, temp_audio_path)

        gaze_results = await gaze_task
        stt_results = await stt_task

        # 추가 음성 분석(WPM, pause 등) 계산
        try:
            voice_analysis = analyze_voice_rhythm_and_patterns(stt_results)
            stt_results["voice_analysis"] = voice_analysis
        except Exception as e:
            print(f"⚠️ voice_analysis 계산 실패: {e}")

        # 저장용으로 간소화/정제 (Firestore 호환)
        if isinstance(gaze_results, dict) and "gaze" in gaze_results:
            # trace_sample은 길고 array 타입이 많아 문제가 될 수 있어 제거
            gaze_results = dict(gaze_results)
            if isinstance(gaze_results.get("gaze"), dict) and "trace_sample" in gaze_results["gaze"]:
                gaze_results["gaze"] = dict(gaze_results["gaze"])
                gaze_results["gaze"].pop("trace_sample", None)

        gaze_results = _sanitize_for_firestore(gaze_results)
        stt_results = _sanitize_for_firestore(stt_results)

        # ---------------------------------------------------------
        # 3. AI 피드백 생성 (OpenRouter LLM)
        # ---------------------------------------------------------
        feedback_data = {}
        try:
            print(f"[analyze_video] AI 피드백 생성 시작...")
            feedback_data = generate_combined_feedback_report(
                video_result=gaze_results,
                stt_result=stt_results,
                user_id=user_id,
                run_id=base_name,
                original_filename=file.filename
            )
            print(f"[analyze_video] AI 피드백 생성 완료")
        except Exception as e:
            print(f"⚠️ AI 피드백 생성 실패: {e}")

        # ---------------------------------------------------------
        # 4. Firestore 저장
        # ---------------------------------------------------------
        feedback_doc = _feedback_doc(user_id, project_id, base_name)
        existing = feedback_doc.get()
        existing_data = existing.to_dict() if existing.exists else {}
        created_at_value = existing_data.get("created_at") or firestore.SERVER_TIMESTAMP

        payload = {
            "stt_analysis": stt_results,
            "vision_analysis": gaze_results,
            "original_filename": file.filename,
            "project_id": project_id,
            "user_id": user_id,
            "presentation_id": base_name,
            "duration_sec": gaze_results.get("metadata", {}).get("duration_sec") or stt_results.get("duration_sec"),
            
            # AI Feedback 추가
            "final_report": feedback_data.get("content"),
            "final_report_preview": feedback_data.get("feedback_preview"),
            "feedback_file": feedback_data.get("file_path"),
            
            # 점수 저장 (세부 항목 포함)
            "scores": feedback_data.get("scores", {}),
            "overallScore": (
                feedback_data.get("scores", {}).get("voice", 0) + 
                feedback_data.get("scores", {}).get("video", 0) + 
                feedback_data.get("scores", {}).get("logic", 20)
            ),
            
            "created_at": created_at_value,
            "updated_at": firestore.SERVER_TIMESTAMP,
        }
        try:
            feedback_doc.set(payload, merge=True)
            print(f"[analyze_video] Firestore 저장 완료 -> users/{user_id}/projects/{project_id}/feedback/{base_name}")
        except Exception as e:
            print(f"❌ Firestore 업로드 실패: {e}")
            print(f"payload keys: {list(payload.keys())}")

        return {
            "message": "시선/자세 및 STT 분석 완료. Firestore 저장 성공.",
            "user_id": user_id,
            "project_id": project_id,
            "presentation_id": base_name,
            "video_result": gaze_results,
            "stt_result": stt_results,
            # 프론트엔드 즉시 반영을 위해 피드백 데이터 포함
            "final_report": feedback_data.get("content"),
            "final_report_preview": feedback_data.get("feedback_preview"),
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
        project_id = data.get("project_id") or data.get("projectId")

        if not (user_id and project_id and presentation_id):
            return {"message": "❌ 'user_id', 'project_id', 'presentation_id'가 필요합니다."}

        doc_ref = _feedback_doc(user_id, project_id, presentation_id)
        snapshot = doc_ref.get()
        data_in_db = snapshot.to_dict() if snapshot.exists else {}

        gaze_data = data_in_db.get("vision_analysis") if data_in_db else None
        stt_data = data_in_db.get("stt_analysis") if data_in_db else None

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

        doc_ref.set(
            {
                "final_report": feedback_payload["content"],
                "final_report_preview": feedback_payload["feedback_preview"],
                "feedback_file": feedback_payload["file_path"],
                "updated_at": datetime.utcnow().isoformat(),
            },
            merge=True,
        )

        return {
            "message": "✅ 영상+음성 통합 Feedback report generated and saved to Firestore.",
            "document_id": f"{user_id}/{project_id}/{presentation_id}",
            "feedback_preview": feedback_payload["feedback_preview"],
            "feedback_file": feedback_payload["file_path"],
        }
    except Exception as e:
        return {"message": f"레포트 생성/저장 실패: {str(e)}"}
