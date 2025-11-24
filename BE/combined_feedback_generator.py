"""
통합 피드백 생성기
- 입력: video_result, stt_result (각각 영상 분석 JSON, STT/voice 분석 JSON)
- 출력: Markdown 보고서 문자열과 저장 파일 경로
기존 영상 전용(gpt.py/feedback_generator)과 음성/통합(feedback_api) 프롬프트 요소를 합쳐 두 파트를 모두 다룹니다.
"""

import os
import json
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, Optional

from dotenv import load_dotenv
from openai import OpenAI
from stt_processor import analyze_voice_rhythm_and_patterns

load_dotenv()

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
OPENROUTER_BASE_URL = os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1")
OPENROUTER_MODEL = os.getenv("OPENROUTER_MODEL", "openai/gpt-4o-mini")
OPENROUTER_SITE = os.getenv("OPENROUTER_SITE_URL", "")
OPENROUTER_TITLE = os.getenv("OPENROUTER_TITLE", "combined-feedback")

_client: Optional[OpenAI] = None
if OPENROUTER_API_KEY:
    _client = OpenAI(base_url=OPENROUTER_BASE_URL, api_key=OPENROUTER_API_KEY)


def _ensure_voice_analysis(stt_result: Dict[str, Any]) -> Dict[str, Any]:
    """voice_analysis가 없으면 생성하여 반환."""
    if "voice_analysis" in stt_result:
        return stt_result
    stt_result = dict(stt_result)
    try:
        stt_result["voice_analysis"] = analyze_voice_rhythm_and_patterns(stt_result)
    except Exception as e:
        print(f"⚠️ voice_analysis 생성 실패: {e}")
    return stt_result


def _build_combined_prompt(video_result: Dict[str, Any], stt_result: Dict[str, Any]) -> str:
    # Video Data
    video_meta = video_result.get("metadata", {})
    gaze = video_result.get("gaze") or {}
    posture = video_result.get("posture") or {}
    gesture = video_result.get("gesture") or {}
    hand = video_result.get("hand") or {}
    head = video_result.get("head_pose") or {}

    # Audio Data
    stt_result = _ensure_voice_analysis(stt_result)
    voice_analysis = stt_result.get("voice_analysis") or {}
    
    # Voice Metrics
    wpm = voice_analysis.get("wpm") or stt_result.get("wordsPerMinute")
    avg_pause = voice_analysis.get("avg_pause_duration") or stt_result.get("pauseDuration")
    long_pause_count = voice_analysis.get("long_pause_count")
    hesitation = voice_analysis.get("hesitation_count") or stt_result.get("hesitationCount")
    filler = voice_analysis.get("filler_count") or stt_result.get("fillerCount")
    
    summary_script = (
        stt_result.get("full_text")
        or stt_result.get("scriptRecognized")
        or stt_result.get("text_for_logic_analysis")
        or voice_analysis.get("text_for_logic_analysis")
        or ""
    )[:700]

    return f"""
    당신은 발표 분석 전문가이며, 아래는 발표자의 영상 및 음성 분석 결과 데이터입니다.
    데이터를 기반으로 전문가 보고서 형식의 리포트를 작성하세요.

    --- 🔍 분석 데이터 요약 ---
    🎬 [영상 메타데이터]
    • FPS: {video_meta.get('fps')}
    • Duration: {video_meta.get('duration_sec')}초
    • Resolution: {video_meta.get('resolution')}

    👁️ [시선(Gaze)]
    • 정면 응시율(center_ratio): {gaze.get('center_ratio')}
    • 시선 분포(distribution): {gaze.get('distribution')}
    • 해석: {gaze.get('interpretation')}

    🧍 [자세(Posture)]
    • 안정성(stability): {posture.get('stability')}
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

    🎙️ [음성(Voice)]
    • 말하기 속도(WPM): {wpm} (권장: 140~160)
    • 평균 휴지기(Pause): {avg_pause}초
    • 긴 침묵 횟수: {long_pause_count}회
    • 주저함(Hesitation): {hesitation}회
    • 군더더기 말(Filler): {filler}회
    • 발화 요약: {summary_script}...

    --- 작성 규칙 ---
    1. **반드시 JSON 형식으로만 응답하세요.**
    2. JSON 구조는 다음과 같아야 합니다:
       {{
         "voice_score": 0~40 사이 정수,
         "video_gaze_score": 0~15 사이 정수,
         "video_posture_score": 0~15 사이 정수,
         "video_gesture_score": 0~10 사이 정수,
         "video_score": 0~40 사이 정수 (위 3개 합산),
         "logic_score": 20,  // (고정값)
         "content": "Markdown 형식의 전체 보고서 내용..."
       }}
    3. **점수 산정 기준 (엄격 준수)**:
       - **영상 점수 (총 40점 만점)**:
         - 시선 처리 (Gaze): 최대 15점
         - 자세 안정성 (Posture): 최대 15점
         - 몸짓/손동작 (Gesture): 최대 10점
         - *위 3개 항목의 합계를 `video_score`로 기입하세요.*
       - **음성 점수 (총 40점 만점)**:
         - 말하기 속도, 발음, 휴지기, 유창성을 종합하여 평가.
    4. `content` 필드 내부에는 아래 섹션 순서로 Markdown 보고서를 작성하세요:
       🎬 영상 기본 정보 → 👁️ 시선 분석 → 🧍 자세 분석 → 💫 몸짓/손동작 → 🎙️ 음성/전달력 → 📊 종합 평가표 → 💬 총평 및 개선점
    5. **종합 평가표 작성 시 반드시 아래 표 형식을 따르세요 (Regex 파싱용):**
       | 항목 | 점수 | 기준 | 평가 수준 |
       |---|---|---|---|
       | 영상(시선) | OO | 0~15 | ... |
       | 영상(자세) | OO | 0~15 | ... |
       | 영상(몸짓) | OO | 0~10 | ... |
       | 음성 | OO | 0~40 | ... |
       | 논리 | 20 | 0~20 | ... |
    6. 각 섹션은 Markdown 표 형식과 서술식 해석을 포함해야 합니다.
    7. 각 항목별로 수치, 기준, 평가 수준, 개선점 요약을 반드시 기술하세요.
    8. 전문가 보고서 어조로, 발표 코칭 리포트처럼 작성하세요.
    9. 수치 기준 근거(예: Mehrabian(1972) 등)를 적절히 인용하면 좋습니다.
    """


def _extract_scores_from_markdown(md_text: str) -> Dict[str, int]:
    """Markdown 텍스트에서 정규식으로 점수를 추출합니다 (Fallback)."""
    import re
    scores = {
        "voice": 0, 
        "video": 0, 
        "logic": 20,
        "video_gaze": 0,
        "video_posture": 0,
        "video_gesture": 0
    }
    
    # 예: | 음성 | 36 | ...
    voice_pattern = re.search(r"\|\s*음성(?: 점수)?\s*\|\s*(\d+)", md_text)
    if voice_pattern:
        try:
            scores["voice"] = int(voice_pattern.group(1))
        except:
            pass

    # 세부 항목 추출
    gaze_pattern = re.search(r"\|\s*영상\(?시선\)?\s*\|\s*(\d+)", md_text)
    posture_pattern = re.search(r"\|\s*영상\(?자세\)?\s*\|\s*(\d+)", md_text)
    gesture_pattern = re.search(r"\|\s*영상\(?몸짓\)?\s*\|\s*(\d+)", md_text)

    if gaze_pattern:
        scores["video_gaze"] = int(gaze_pattern.group(1))
    if posture_pattern:
        scores["video_posture"] = int(posture_pattern.group(1))
    if gesture_pattern:
        scores["video_gesture"] = int(gesture_pattern.group(1))
        
    # 합산
    scores["video"] = scores["video_gaze"] + scores["video_posture"] + scores["video_gesture"]
    
    # 만약 합산이 0인데 '영상' 총점이 따로 있다면?
    if scores["video"] == 0:
        video_total_pattern = re.search(r"\|\s*영상(?: 점수)?\s*\|\s*(\d+)", md_text)
        if video_total_pattern:
             scores["video"] = int(video_total_pattern.group(1))

    return scores


def generate_combined_feedback_report(
    video_result: Dict[str, Any],
    stt_result: Dict[str, Any],
    output_name: Optional[str] = None,
    user_id: Optional[str] = None,
    run_id: Optional[str] = None,
    original_filename: Optional[str] = None,
) -> Dict[str, Any]:
    """영상+음성 통합 LLM 리포트 생성 및 저장 (점수 포함)."""
    if not _client:
        raise RuntimeError("OPENROUTER_API_KEY가 설정되지 않았습니다.")

    stt_result = _ensure_voice_analysis(stt_result)
    prompt = _build_combined_prompt(video_result, stt_result)

    completion = _client.chat.completions.create(
        model=OPENROUTER_MODEL,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": "당신은 발표 영상+음성 피드백을 작성하는 전문가입니다. 반드시 JSON 형식으로 응답하세요."},
            {"role": "user", "content": prompt},
        ],
        extra_headers={
            "HTTP-Referer": OPENROUTER_SITE,
            "X-Title": OPENROUTER_TITLE,
        },
    )

    raw_response = completion.choices[0].message.content
    
    # 기본값
    voice_score = 0
    video_score = 0
    logic_score = 20
    video_gaze = 0
    video_posture = 0
    video_gesture = 0
    feedback_md = ""

    try:
        parsed_response = json.loads(raw_response)
        feedback_md = parsed_response.get("content", "")
        voice_score = parsed_response.get("voice_score", 0)
        video_score = parsed_response.get("video_score", 0)
        logic_score = parsed_response.get("logic_score", 20)
        
        video_gaze = parsed_response.get("video_gaze_score", 0)
        video_posture = parsed_response.get("video_posture_score", 0)
        video_gesture = parsed_response.get("video_gesture_score", 0)
        
    except json.JSONDecodeError:
        print("⚠️ LLM 응답이 JSON 형식이 아닙니다. Raw text로 처리합니다.")
        feedback_md = raw_response

    # Fallback: JSON 점수가 0이면 Markdown에서 추출 시도
    if voice_score == 0 and video_score == 0:
        print("⚠️ JSON 점수가 0입니다. Markdown에서 추출을 시도합니다.")
        extracted = _extract_scores_from_markdown(feedback_md)
        if extracted["voice"] > 0:
            voice_score = extracted["voice"]
        if extracted["video"] > 0:
            video_score = extracted["video"]
            video_gaze = extracted["video_gaze"]
            video_posture = extracted["video_posture"]
            video_gesture = extracted["video_gesture"]

    output_dir = Path("feedback_reports")
    output_dir.mkdir(exist_ok=True)
    # 파일명: userID가 있으면 포함, run_id/원본파일명도 붙여 추적 가능하도록 지정
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    base_name = (
        output_name
        or f"full_feedback_{user_id or 'nouser'}_{run_id or ts}_{Path(original_filename or 'upload').stem}.md"
    )
    safe_name = base_name
    output_path = output_dir / safe_name
    output_path.write_text(feedback_md, encoding="utf-8")

    return {
        "message": "✅ 영상+음성 통합 피드백 생성 완료",
        "file_path": str(output_path),
        "feedback_preview": feedback_md[:400] + ("..." if len(feedback_md) > 400 else ""),
        "content": feedback_md,
        "scores": {
            "voice": voice_score,
            "video": video_score,
            "logic": logic_score,
            "video_gaze": video_gaze,
            "video_posture": video_posture,
            "video_gesture": video_gesture,
        }
    }
