import os
import datetime
from openai import OpenAI
from dotenv import load_dotenv

# ============================
# 🔐 환경변수 로드 및 클라이언트 설정
# ============================
load_dotenv()
api_key = os.getenv("OPENROUTER_API_KEY")

if not api_key:
    raise ValueError("❌ OPENROUTER_API_KEY가 설정되어 있지 않습니다. .env를 확인하세요.")

client = OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=api_key,
)

# ============================
# 🧠 GPT 기반 피드백 리포트 생성 함수
# ============================
def generate_feedback_from_analysis(analysis_data: dict) -> str:
    """
    video_analyzer 결과(JSON 전체)를 기반으로 발표 리포트 생성.
    시선·자세·몸짓·손동작·머리방향을 종합 분석.
    생성된 리포트를 'YYYYMMDD_HHMM_feedback.md'로 저장.
    """

    try:
        result = analysis_data["result"]
        meta = result.get("metadata", {})
        gaze = result.get("gaze", {})
        posture = result.get("posture", {})
        gesture = result.get("gesture", {})
        hand = result.get("hand", {})
        head = result.get("head_pose", {})

        # ============================
        # 🧾 GPT 입력 프롬프트 구성
        # ============================
        prompt = f"""
        당신은 발표 분석 전문가이며, 아래는 발표자의 영상 분석 결과 데이터입니다.
        데이터를 기반으로 전문가 보고서 형식의 리포트를 작성하세요.

        --- 🔍 분석 데이터 요약 ---
        🎬 [영상 메타데이터]
        • FPS: {meta.get('fps')}
        • Duration: {meta.get('duration_sec')}초
        • Resolution: {meta.get('resolution')}
        • Frame count: {meta.get('frame_count')}

        👁️ [시선(Gaze)]
        • 정면 응시율(center_ratio): {gaze.get('center_ratio')}
        • 시선 분포(distribution): {gaze.get('distribution')}
        • 시선 이동 빈도(movement_rate_per_sec): {gaze.get('movement_rate_per_sec')}
        • 해석: {gaze.get('interpretation')}

        🧍 [자세(Posture)]
        • 안정성(stability): {posture.get('stability')}
        • 어깨 σx, σy: {posture.get('sigma', {}).get('x')}, {posture.get('sigma', {}).get('y')}
        • 평균 기울기(roll_mean): {posture.get('roll_mean')}
        • 해석: {posture.get('interpretation')}

        💫 [몸짓(Gesture)]
        • 움직임 에너지(motion_energy): {gesture.get('motion_energy')}
        • 평가: {gesture.get('evaluation')}
        • 해석: {gesture.get('interpretation')}

        ✋ [손동작(Hand)]
        • 손 인식 비율(visibility_ratio): {hand.get('visibility_ratio')}
        • 손 움직임 정도(movement): {hand.get('movement')}
        • 평가: {hand.get('evaluation')}
        • 해석: {hand.get('interpretation')}

        🧠 [머리 방향(Head Pose)]
        • Roll 평균(roll_mean): {head.get('roll_mean')}
        • Yaw 평균(yaw_mean): {head.get('yaw_mean')}
        • 평가: {head.get('evaluation')}
        • 해석: {head.get('interpretation')}

        --- 작성 규칙 ---
        1. 아래의 섹션 순서로 작성하세요:
           🎬 영상 기본 정보 → 👁️ 시선 분석 → 🧍 자세 분석 → 💫 몸짓 → ✋ 손동작 → 🧠 머리 방향 → 📊 종합 평가표 → 💬 총평
        2. 각 섹션은 Markdown 표 형식과 서술식 해석을 포함해야 합니다.
        3. 각 항목별로 수치, 기준, 평가 수준, 개선점 요약을 반드시 기술하세요.
        4. 전문가 보고서 어조로, 발표 코칭 리포트처럼 작성하세요.
        5. 분량은 최소 400~600 단어로 자세히 작성하세요.
        6. 수치 기준 근거(예: Mehrabian(1972), Pease & Pease(2006))를 그대로 반영하세요.

        예시 형식:
        🎬 영상 기본 정보  
        | 항목 | 값 | 설명 |
        |------|----|------|
        | FPS | 29.97 | 표준 프레임 속도 |
        | 길이 | 481.6초 | 약 8분 |
        ...
        """

        # ============================
        # 🔗 GPT 요청
        # ============================
        response = client.chat.completions.create(
            model="openai/gpt-oss-20b:free",
            messages=[
                {"role": "system", "content": "당신은 발표 영상 분석 전문가입니다."},
                {"role": "user", "content": prompt}
            ],
            extra_headers={
                "HTTP-Referer": "http://localhost:8000",
                "X-Title": "Presentation Coach",
            },
            temperature=0.6,
        )

        report_text = response.choices[0].message.content.strip()

        # ============================
        # 🗂️ 리포트 저장
        # ============================
        output_dir = "feedback_reports"
        os.makedirs(output_dir, exist_ok=True)

        timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M")
        filename = f"{timestamp}_feedback.md"
        output_path = os.path.join(output_dir, filename)

        with open(output_path, "w", encoding="utf-8") as f:
            f.write(report_text)

        print(f"✅ 리포트 저장 완료: {output_path}")

        return report_text

    except Exception as e:
        return f"⚠️ 리포트 생성 중 오류 발생: {e}"
