# BE/gpt.py
from fastapi import APIRouter
from pydantic import BaseModel
from openai import OpenAI
import os
from dotenv import load_dotenv

# 🔹 .env 불러오기
load_dotenv()

router = APIRouter()

# 🔹 환경변수에서 API KEY 가져오기
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))


class AnalysisData(BaseModel):
    video: dict
    voice: dict
    script: dict
    combinedScore: float


@router.post("/gpt/insights")
async def generate_insights(data: AnalysisData):
    prompt = f"""
다음 발표 분석 데이터를 기반으로 발표자에게 도움이 될만한
3~5개의 개선 피드백을 작성하세요.

[영상 분석]
명확성: {data.video.get('clarity')}
발표 속도: {data.video.get('pace')}
자신감: {data.video.get('confidence')}
몰입도: {data.video.get('engagement')}

[음성 분석]
군더더기 말 횟수: {data.voice.get('fillerCount')}
WPM(분당 단어 수): {data.voice.get('wordsPerMinute')}
공백 시간: {data.voice.get('pauseDuration')}초
실제 발화 내용(STT): {data.voice.get('scriptRecognized')}

[대본 비교]
작성한 대본: {data.script.get('scriptUser')}
유사도: {data.script.get('scriptSimilarity')}%

종합 점수: {data.combinedScore}

발표자의 감정을 상하게 하지 않도록
친절하고 부드러운 톤으로 작성해주세요.
"""

    # 🔹 OpenAI API 호출 (새 SDK 방식)
    completion = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.7
    )

    # 🔹 결과 텍스트 꺼내기
    text = completion.choices[0].message.content

    # 🔹 줄 단위로 쪼개기 (불필요한 공백 제거)
    insights = [line.strip() for line in text.split("\n") if line.strip()]

    return {"insights": insights}