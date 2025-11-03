from fastapi import FastAPI, UploadFile, File
import os
from video_analyzer import analyze_video

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
