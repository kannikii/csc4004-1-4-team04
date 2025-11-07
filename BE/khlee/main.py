from fastapi import FastAPI, UploadFile, File, Body
from fastapi.responses import StreamingResponse
import os, asyncio, json
from video_analyzer import analyze_video, set_progress, get_progress
from feedback_generator import generate_feedback_from_analysis

app = FastAPI()


@app.get("/")
def root():
    return {"message": "🎥 Video Analysis API with Progress Stream"}


@app.post("/analyze/video")
async def analyze_video_api(file: UploadFile = File(...)):
    """
    업로드된 영상 파일을 분석하고, 진행률은 /analyze/progress 에서 실시간 스트리밍됩니다.
    """
    temp_path = f"temp_{file.filename}"
    contents = await file.read()

    with open(temp_path, "wb") as f:
        f.write(contents)

    # 비동기로 분석 실행
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, analyze_video, temp_path)

    os.remove(temp_path)
    return {"message": f"✅ 분석 완료: {file.filename}"}


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


@app.post("/feedback/full")
def feedback_full_api(analysis_data: dict = Body(...)):
    feedback = generate_feedback_from_analysis(analysis_data)
    os.makedirs("feedback_reports", exist_ok=True)
    output_path = os.path.join("feedback_reports", "feedback.md")

    with open(output_path, "w", encoding="utf-8") as f:
        f.write(feedback)

    return {
        "message": "✅ Feedback report successfully generated.",
        "file_path": output_path,
        "feedback_preview": feedback[:300] + "..."
    }
