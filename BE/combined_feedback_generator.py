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
    video_meta = video_result.get("metadata", {})
    gaze = video_result.get("gaze") or {}
    posture = video_result.get("posture") or {}
    gesture = video_result.get("gesture") or {}
    hand = video_result.get("hand") or {}
    head = video_result.get("head_pose") or {}

    stt_result = _ensure_voice_analysis(stt_result)
    voice_analysis = stt_result.get("voice_analysis") or {}
    pause_events = voice_analysis.get("pause_events") or []
    pause_example = pause_events[:5] if pause_events else []
    summary_script = (
        stt_result.get("full_text")
        or stt_result.get("scriptRecognized")
        or stt_result.get("text_for_logic_analysis")
        or voice_analysis.get("text_for_logic_analysis")
        or ""
    )[:700]

    wpm = voice_analysis.get("wpm") or stt_result.get("wordsPerMinute")
    avg_pause = voice_analysis.get("avg_pause_duration") or stt_result.get("pauseDuration")
    long_pause_count = voice_analysis.get("long_pause_count")
    hesitation = voice_analysis.get("hesitation_count") or stt_result.get("hesitationCount")
    filler = voice_analysis.get("filler_count") or stt_result.get("fillerCount")

    return (
        "You are a presentation coach. Generate a Korean Markdown report (no code fences). "
        "Split the report into two major parts: 🎙 음성(STT) & 전달 / 🎥 동작·영상 분석. "
        "Keep 기존 평가 척도(시선·자세·몸짓·손동작·머리방향 등)는 유지하면서 필요하면 세부 항목을 보완하세요. "
        "Use concise tables with 기준/평가/수치/개선점, then short narratives. "
        "Voice section must include: WPM, 평균/긴 정지 구간, pause 예시, filler/hesitation 빈도, 발화 명료도·리듬·억양 평가, 스크립트 요약/대표 구절. "
        "종합 평가표(10점 만점)와 총평, 개선 제안 3가지를 포함하세요.\n\n"
        "Video meta:\n"
        f"{json.dumps(video_meta, ensure_ascii=False)}\n\n"
        "Video analysis blocks:\n"
        f"gaze={json.dumps(gaze, ensure_ascii=False)}\n"
        f"posture={json.dumps(posture, ensure_ascii=False)}\n"
        f"gesture={json.dumps(gesture, ensure_ascii=False)}\n"
        f"hand={json.dumps(hand, ensure_ascii=False)}\n"
        f"head_pose={json.dumps(head, ensure_ascii=False)}\n\n"
        "Voice analysis:\n"
        f"{json.dumps(voice_analysis, ensure_ascii=False)}\n"
        f"pause_examples={json.dumps(pause_example, ensure_ascii=False)}\n"
        f"wpm={wpm}, avg_pause={avg_pause}, long_pause_count={long_pause_count}, hesitation={hesitation}, filler={filler}\n"
        f"Raw STT meta: duration_sec={stt_result.get('duration_sec')}, word_count={stt_result.get('word_count')}\n"
        f"script_snippet={json.dumps(summary_script, ensure_ascii=False)}\n"
    )


def generate_combined_feedback_report(
    video_result: Dict[str, Any],
    stt_result: Dict[str, Any],
    output_name: Optional[str] = None,
    user_id: Optional[str] = None,
    run_id: Optional[str] = None,
    original_filename: Optional[str] = None,
) -> Dict[str, Any]:
    """영상+음성 통합 LLM 리포트 생성 및 저장."""
    if not _client:
        raise RuntimeError("OPENROUTER_API_KEY가 설정되지 않았습니다.")

    stt_result = _ensure_voice_analysis(stt_result)
    prompt = _build_combined_prompt(video_result, stt_result)

    completion = _client.chat.completions.create(
        model=OPENROUTER_MODEL,
        messages=[
            {"role": "system", "content": "당신은 발표 영상+음성 피드백을 작성하는 전문가입니다."},
            {"role": "user", "content": prompt},
        ],
        extra_headers={
            "HTTP-Referer": OPENROUTER_SITE,
            "X-Title": OPENROUTER_TITLE,
        },
    )

    feedback_md = completion.choices[0].message.content

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
    }
