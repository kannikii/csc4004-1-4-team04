"""
간단 요약 API
- Firestore에 저장된 feedback 문서를 가져와 프론트에서 바로 쓰기 좋은 스키마로 반환
- 로컬 JSON 파일(예: *_combined.json) 경로를 주면 그 파일을 읽어 동일 스키마로 반환
"""

import json
import os

from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
OPENAI_BASE_URL = os.getenv("OPENAI_BASE_URL")  # None이면 기본 OpenAI 엔드포인트
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")

# (옵션) OpenRouter로 전환할 때 사용할 설정
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
OPENROUTER_BASE_URL = os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1")
OPENROUTER_MODEL = os.getenv("OPENROUTER_MODEL", "openai/gpt-4o-mini")
OPENROUTER_SITE = os.getenv("OPENROUTER_SITE_URL", "")
OPENROUTER_TITLE = os.getenv("OPENROUTER_TITLE", "result-summary")

_llm_headers = {}

if OPENAI_API_KEY:
    client = OpenAI(api_key=OPENAI_API_KEY, base_url=OPENAI_BASE_URL or None)
    LLM_MODEL = OPENAI_MODEL
elif OPENROUTER_API_KEY:
    if OPENROUTER_SITE:
        _llm_headers["HTTP-Referer"] = OPENROUTER_SITE
    if OPENROUTER_TITLE:
        _llm_headers["X-Title"] = OPENROUTER_TITLE
    client = OpenAI(api_key=OPENROUTER_API_KEY, base_url=OPENROUTER_BASE_URL)
    LLM_MODEL = OPENROUTER_MODEL
else:
    raise RuntimeError("OPENAI_API_KEY 또는 OPENROUTER_API_KEY가 필요합니다.")


from pathlib import Path
from typing import Any, Dict, Optional, Union, Tuple


from fastapi import APIRouter, HTTPException, Query
from difflib import SequenceMatcher

import firebase_admin
from firebase_admin import credentials, firestore

# Firebase 초기화 (main.py와 동일한 환경변수 사용)
FIREBASE_CRED_PATH = os.getenv("FIREBASE_CRED_PATH", "serviceAccountKey.json")
FIREBASE_PROJECT_ID = os.getenv("FIREBASE_PROJECT_ID")

if not firebase_admin._apps:
    cred = credentials.Certificate(FIREBASE_CRED_PATH)
    options = {"projectId": FIREBASE_PROJECT_ID} if FIREBASE_PROJECT_ID else None
    firebase_admin.initialize_app(cred, options)

db = firestore.client()

router = APIRouter(prefix="/feedback", tags=["feedback"])


def _to_number(val: Any) -> Optional[Union[int, float]]:
    if isinstance(val, (int, float)):
        return val
    if isinstance(val, str):
        try:
            n = float(val) if "." in val else int(val)
            return n
        except Exception:
            return None
    return None


def _as_list(val: Any) -> list:
    if val is None:
        return []
    if isinstance(val, list):
        return val
    return [val]


def _compute_script_similarity(script_text: Optional[str], spoken_text: Optional[str]):
    """대본과 발화 텍스트 유사도를 OpenAI LLM으로 계산."""
    if not script_text or not spoken_text:
        return None, []
    print("[_compute_script_similarity] LLM 호출 시작") 

    prompt = f"""
        당신은 발표 분석 전문가입니다. 
        주어진 script(대본)과 spoken(발화)를 비교하여 아래 항목을 JSON으로 출력하세요.

        필수 생성 요소:

        1. similarity : 
        - 0~100 사이 정수
        - 의미 기반(semantic) 유사도로 평가

        2. feedback_lines : 
        - 3~6개의 문장 리스트
        - 반드시 아래 내용을 포함해야 함:
            - 핵심 차이점 요약
            - 발표자가 개선해야 할 점
            - *유사하지 않은 부분을 직접 비교해서 보여주는 문장*, 예시:

            "발표 대본: '○○○'"
            "실제 발화: '△△△'"

            - 즉, script와 spoken 중 **일치하지 않는 부분을 발췌하여 나란히 보여주는 항목**을 포함해야 함.

        script:
        <<<SCRIPT>>>
        {script_text}
        <<<END_SCRIPT>>>

        spoken:
        <<<SPOKEN>>>
        {spoken_text}
        <<<END_SPOKEN>>>

        반드시 아래 정확한 JSON 형식을 따르세요:

        {{
        "similarity": 85,
        "feedback_lines": [
            "핵심 문장들이 대부분 일치합니다.",
            "대본의 '프로젝트 목표는 명확합니다' 부분이 실제 발화에서는 '목표가 좀 애매했던 것 같습니다'로 변경되었습니다.",
            "발표 대본: '프로젝트 목표는 명확합니다'"
            "실제 발화: '목표가 좀 애매했던 것 같습니다'",
            "마무리 문장의 논리 흐름이 일부 변경되었습니다."
        ]
        }}
        """
    
    try:
        resp = client.chat.completions.create(
            model=LLM_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.2,
            extra_headers=_llm_headers or None,
        )
        print("[_compute_script_similarity] LLM 응답 수신")

        content = resp.choices[0].message.content.strip()
        print("[_compute_script_similarity] raw content:", content)

        if content.startswith("```"):
            parts = content.split("```")
            if len(parts) > 1:
                content = parts[1].strip()
                if content.startswith("json"):
                    content = content[4:].strip()

        data = json.loads(content)

        similarity = data.get("similarity")
        feedback = data.get("feedback_lines", [])
        print("[_compute_script_similarity] parsed similarity:", similarity)

        return similarity, feedback

    except Exception as e:
        print("LLM 기반 스크립트 유사도 계산 실패:", e)
        return None, []


def _normalize_payload(raw: Dict[str, Any]) -> Dict[str, Any]:
    """프론트 ResultsPage와 동일한 구조로 변환."""
    data = dict(raw)

    # stt / video 필드 정규화
    stt = data.get("stt_result") or data.get("stt_analysis") or {}
    video = data.get("video_result") or data.get("vision_analysis") or {}

    voice = stt.get("voice_analysis") or stt.get("voiceAnalysis") or stt.get("voice") or {}

    duration_sec = (
        _to_number(stt.get("duration_sec"))
        or _to_number(stt.get("duration"))
        or _to_number(video.get("metadata", {}).get("duration_sec"))
        or _to_number(data.get("duration_sec"))
        or _to_number(data.get("duration"))
        or 0
    )
    pause_events = voice.get("pause_events") or stt.get("pause_events") or stt.get("words") or []
    word_count = _to_number(stt.get("word_count"))
    computed_wpm = (
        _to_number(voice.get("wpm"))
        or _to_number(stt.get("wordsPerMinute"))
        or _to_number(stt.get("wpm"))
        or (word_count and duration_sec and round((word_count / duration_sec) * 60))
        or (isinstance(stt.get("words"), list) and duration_sec and round((len(stt["words"]) / duration_sec) * 60))
        or 0
    )

    logic_block = data.get("analysis", {}).get("logic", {}) or stt.get("logic") or data.get("logic") or {}
    logic_similarity = (
        _to_number(logic_block.get("similarity"))
        or _to_number(stt.get("logic_similarity"))
        or _to_number(data.get("logic_similarity"))
    )
    logic_feedback_raw = (
        logic_block.get("similarity_analysis")
        or logic_block.get("feedback")
        or stt.get("logic_feedback")
        or data.get("logic_feedback")
        or []
    )

    video_preview = (
        data.get("feedback_preview")
        or video.get("gaze", {}).get("interpretation")
        or video.get("posture", {}).get("interpretation")
        or video.get("gesture", {}).get("interpretation")
        or video.get("hand", {}).get("interpretation")
        or video.get("head_pose", {}).get("interpretation")
        or "영상 분석 결과 요약이 없습니다."
    )

    combined_video_feedback = " / ".join(
        [
            v
            for v in [
                video.get("gaze", {}).get("interpretation"),
                video.get("posture", {}).get("interpretation"),
                video.get("gesture", {}).get("interpretation"),
                video.get("hand", {}).get("interpretation"),
                video.get("head_pose", {}).get("interpretation"),
            ]
            if v
        ]
    ) or video_preview

    return {
        "scores": data.get("scores", {}),
        "overallScore": data.get("overallScore") or data.get("score") or 80,
        "duration": round(duration_sec) if duration_sec else 0,
        "analysis": {
            "voice": {
                "wpm": computed_wpm,
                "long_pause_count": (
                    _to_number(voice.get("long_pause_count"))
                    or _to_number(stt.get("long_pause_count"))
                    or (len(pause_events) if isinstance(pause_events, list) else 0)
                ),
                "avg_pause_duration": _to_number(voice.get("avg_pause_duration")) or _to_number(stt.get("pauseDuration")) or 0,
                "pause_events": pause_events if isinstance(pause_events, list) else [],
                "hesitation_count": _to_number(voice.get("hesitation_count")) or _to_number(stt.get("hesitationCount")) or 0,
                "filler_count": _to_number(voice.get("filler_count")) or _to_number(stt.get("fillerCount")) or 0,
                "hesitation_list": voice.get("hesitation_list") or [],
                "filler_list": voice.get("filler_list") or [],
            },
            "logic": {
                "similarity": logic_similarity,
                "similarity_analysis": _as_list(logic_feedback_raw),
            },
            "video": {
                "feedback_preview": combined_video_feedback,
                "metadata": video.get("metadata", {}),
                "gaze": video.get("gaze", {}),
                "posture": video.get("posture", {}),
                "gesture": video.get("gesture", {}),
                "hand": video.get("hand", {}),
                "head": video.get("head_pose", {}) or video.get("head", {}),
            },
        },
        "final_report": data.get("final_report"),
        "final_report_preview": data.get("final_report_preview") or data.get("feedback_preview"),
        "raw": {
            "stt_result": stt,
            "video_result": video,
        },
    }


@router.get("/summary")
def get_feedback_summary(
    user_id: Optional[str] = Query(None),
    project_id: Optional[str] = Query(None),
    presentation_id: Optional[str] = Query(None),
    json_path: Optional[str] = Query(None, description="로컬 JSON 파일 경로(선택)"),
):
    """
    - Firestore feedback 문서를 받아 프론트 전용 요약 스키마로 반환
    - json_path가 주어지면 로컬 JSON을 읽어 같은 형식으로 반환
    """
    # 1) 로컬 JSON 파일 사용 시
    if json_path:
        path = Path(json_path)
        if not path.exists():
            raise HTTPException(status_code=404, detail="json_path 파일을 찾을 수 없습니다.")
        with path.open(encoding="utf-8") as f:
            raw = json.load(f)
        # combined 파일 형태면 평탄화
        if "video_result" in raw or "stt_result" in raw:
            merged = raw
        else:
            merged = raw
        return _normalize_payload(merged)

    # 2) Firestore 조회
    if not (user_id and presentation_id):
        raise HTTPException(status_code=400, detail="user_id와 presentation_id는 필수입니다. project_id는 없으면 자동 탐색합니다.")

    def _find_feedback_doc(u: str, p: Optional[str], pres: str):
        # 우선 주어진 project_id로
        if p:
            doc_ref = (
                db.collection("users")
                .document(u)
                .collection("projects")
                .document(p)
                .collection("feedback")
                .document(pres)
            )
            snap_local = doc_ref.get()
            if snap_local.exists:
                return p, snap_local
        # 못 찾으면 모든 프로젝트 순회
        projects = (
            db.collection("users")
            .document(u)
            .collection("projects")
            .stream()
        )
        for proj in projects:
            doc_ref = proj.reference.collection("feedback").document(pres)
            snap_local = doc_ref.get()
            if snap_local.exists:
                return proj.id, snap_local
        return None, None

    found_project_id, snap = _find_feedback_doc(user_id, project_id, presentation_id)
    if not snap:
        raise HTTPException(status_code=404, detail="해당 feedback 문서를 찾을 수 없습니다. project_id를 확인해주세요.")

    payload = snap.to_dict() or {}

    # 대본 텍스트 불러오기 (있을 때만)
    project_ref = (
        db.collection("users")
        .document(user_id)
        .collection("projects")
        .document(found_project_id)
    )
    project_snap = project_ref.get()
    project_data = project_snap.to_dict() or {}
    script_text = project_data.get("scriptText") or project_data.get("script") or None

    # STT 텍스트 추출
    stt = payload.get("stt_analysis") or payload.get("stt_result") or {}
    spoken_text = (
        stt.get("full_text")
        or stt.get("text_for_logic_analysis")
        or stt.get("scriptRecognized")
        or ""
    )

    # 유사도 미존재 시 간단 계산
    if not (
        _to_number(payload.get("logic_similarity"))
        or _to_number(stt.get("logic_similarity"))
        or payload.get("analysis", {}).get("logic", {})
    ):
        similarity, feedback_lines = _compute_script_similarity(script_text, spoken_text)
        if similarity is not None:
            payload["logic_similarity"] = similarity
            payload["logic_feedback"] = feedback_lines

    return _normalize_payload(payload)
