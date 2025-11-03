from fastapi import FastAPI, UploadFile, File
import os
from video_analyzer import analyze_video
from feedback_generator import generate_feedback

app = FastAPI()

@app.get("/")
def root():
    return {"message": "🎥 Video Analysis API by khlee"}

@app.post("/analyze/video")
async def analyze_video_api(file: UploadFile = File(...)):
    """
    업로드된 영상 파일을 임시 저장 후 분석하고 결과를 반환합니다.
    """
    temp_path = f"temp_{file.filename}"
    contents = await file.read()

    # 파일 임시 저장
    with open(temp_path, "wb") as f:
        f.write(contents)

    # 영상 분석 실행
    result = analyze_video(temp_path)

    # 임시 파일 삭제
    os.remove(temp_path)

    return {"filename": file.filename, "result": result}

@app.post("/feedback/gpt")
def feedback_api(data: dict):
    """
    시선/자세 분석 결과(JSON)를 입력받아 GPT 피드백 생성
    """
    gaze = data.get("gaze_center_ratio", 0.0)
    posture = data.get("posture_stability", 0.0)
    feedback = generate_feedback(gaze, posture)
    return {"feedback": feedback}