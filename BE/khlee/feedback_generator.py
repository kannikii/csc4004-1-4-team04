import os
from openai import OpenAI
from dotenv import load_dotenv

# 환경변수(.env)에서 API 키 불러오기
load_dotenv()
api_key = os.getenv("OPENAI_API_KEY")

client = OpenAI(api_key=api_key)

def generate_feedback(gaze_center_ratio: float, posture_stability: float) -> str:
    """
    시선/자세 분석 결과를 입력받아 GPT를 통해 자연어 피드백 생성
    """

    # 결과를 간단한 문장으로 요약할 프롬프트 작성
    prompt = f"""
    당신은 발표 코치입니다.
    아래는 발표자의 분석 결과입니다.
    - 정면 응시율: {gaze_center_ratio*100:.1f}%
    - 자세 안정성: {posture_stability*100:.1f}%

    위 수치를 바탕으로 발표 습관에 대한 짧은 피드백을 한국어로 작성하세요.
    2~3문장 정도로 작성하되, 부드럽고 개선 방향을 제시해주세요.
    """

    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": "당신은 발표 피드백 전문가입니다."},
            {"role": "user", "content": prompt}
        ],
        temperature=0.7,
    )

    feedback = response.choices[0].message.content.strip()
    return feedback
