# 🚀 백엔드 배포 가이드 (Railway / Render)

이 프로젝트는 **영상 분석(MediaPipe)**과 **음성 인식(Whisper)**을 수행하므로, 실행 시간이 길고 무거운 라이브러리를 사용합니다. 따라서 Vercel 같은 Serverless 환경보다는 **Docker 컨테이너 기반**의 호스팅 서비스가 적합합니다.

추천 서비스: **Railway** (설정 간편, 초기 크레딧 제공) 또는 **Render** (무료 티어 존재).

---

## 1. 준비 사항

### 1-1. `serviceAccountKey.json` 처리 (중요 🔐)
Firebase 인증 키 파일은 보안상 Git에 올리면 안 됩니다. 배포 서버에 안전하게 전달하는 두 가지 방법이 있습니다.

#### 방법 A: Base64 인코딩하여 환경 변수로 등록 (추천)
1.  로컬 터미널에서 `serviceAccountKey.json` 파일을 Base64 문자열로 변환합니다.
    *   **Mac/Linux**: `base64 -i serviceAccountKey.json | pbcopy` (클립보드 복사)
    *   **Windows**: `certutil -encode serviceAccountKey.json tmp.b64 && type tmp.b64`
2.  이 긴 문자열을 배포 서비스의 환경 변수 `FIREBASE_CRED_BASE64` 값으로 등록합니다.
3.  **코드 수정 필요**: `main.py`에서 이 환경 변수를 읽어 파일로 복원하거나 직접 로드하도록 수정해야 합니다. (아래 '코드 수정 가이드' 참고)

#### 방법 B: Secret File 업로드 (Render 등 지원 시)
1.  Render의 'Secret Files' 기능 등을 이용해 `serviceAccountKey.json` 파일을 직접 업로드합니다.
2.  업로드된 경로(예: `/etc/secrets/serviceAccountKey.json`)를 `FIREBASE_CRED_PATH` 환경 변수로 지정합니다.

---

## 2. 배포 설정 (Railway 기준)

1.  [Railway](https://railway.app/) 가입 및 로그인.
2.  **New Project** -> **Deploy from GitHub repo** 선택.
3.  이 프로젝트 리포지토리 선택.
4.  **Variables** 탭으로 이동하여 다음 환경 변수들을 추가합니다.

| 변수명 | 값 예시 | 설명 |
|---|---|---|
| `OPENAI_API_KEY` | `sk-...` | AI 피드백 생성용 키 (기본) |
| `OPENAI_MODEL` | `gpt-4o-mini` | 사용할 OpenAI 모델 (선택) |
| `OPENROUTER_API_KEY` | *(옵션)* | 필요 시 OpenRouter로 전환할 때 사용 |
| `FIREBASE_PROJECT_ID` | `my-project-id` | 파이어베이스 프로젝트 ID |
| `ALLOWED_ORIGINS` | `https://my-frontend.vercel.app` | 배포된 프론트엔드 주소 (CORS 허용) |
| `FIREBASE_CRED_PATH` | `serviceAccountKey.json` | (방법 B 사용 시 경로 지정) |

5.  (방법 A 사용 시) `main.py`를 수정하여 Base64 환경 변수를 디코딩하는 로직을 추가하고 배포합니다.

---

## 3. 코드 수정 가이드 (Base64 환경 변수 사용 시)

`main.py`의 `_init_firestore` 함수 부분을 아래와 같이 수정하면, 파일이 없어도 환경 변수에서 키를 읽어올 수 있습니다.

```python
import base64
import json

def _init_firestore():
    if not firebase_admin._apps:
        cred = None
        
        # 1. 환경 변수에서 Base64 문자열 확인
        firebase_b64 = os.getenv("FIREBASE_CRED_BASE64")
        if firebase_b64:
            try:
                # Base64 디코딩 -> JSON 파싱 -> dict
                cred_json = json.loads(base64.b64decode(firebase_b64).decode('utf-8'))
                cred = credentials.Certificate(cred_json)
                print("✅ Loaded Firebase credentials from env var.")
            except Exception as e:
                print(f"⚠️ Failed to load credentials from env var: {e}")

        # 2. 파일 경로에서 확인 (로컬 개발용)
        if not cred:
            cred_path = os.getenv("FIREBASE_CRED_PATH", "serviceAccountKey.json")
            if os.path.exists(cred_path):
                cred = credentials.Certificate(cred_path)
                print(f"✅ Loaded Firebase credentials from file: {cred_path}")
            else:
                print("❌ No Firebase credentials found!")
                return None

        options = {"projectId": FIREBASE_PROJECT_ID} if FIREBASE_PROJECT_ID else None
        firebase_admin.initialize_app(cred, options)
        
    return firestore.client()
```

---

## 4. 프론트엔드 연결

1.  백엔드 배포가 완료되면 제공되는 도메인(예: `https://web-production-xxxx.up.railway.app`)을 복사합니다.
2.  프론트엔드 프로젝트(Vercel)의 환경 변수 `VITE_API_BASE_URL` (또는 코드 내 API 주소)을 이 백엔드 주소로 업데이트합니다.
3.  프론트엔드를 재배포합니다.

## 5. 주의 사항

*   **Cold Start**: Render 무료 티어는 15분간 요청이 없으면 서버가 잠들며, 깨어나는 데 30초 이상 걸릴 수 있습니다.
*   **파일 저장**: 현재 코드는 분석 결과 파일을 로컬(`results/`)에 저장합니다. 컨테이너가 재시작되면 이 파일들은 사라집니다. 영구 보관이 필요하다면 **Firebase Storage**나 **AWS S3** 연동 코드를 추가해야 합니다.
