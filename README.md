# 2025-2-CSC4004-1-4-Team04

## 👨‍💻 팀원 소개

<table>
  <tr>
    <td align="center" width="150px">
      <img src="https://github.com/kelly0819.png" width="100px;" style="border-radius:50%;"/><br/>
      <sub><b>한지예</b></sub><br/>
      <a href="https://github.com/kelly0819">@kelly0819</a>
    </td>
    <td align="center" width="150px">
      <img src="https://github.com/kannikii.png" width="100px;" style="border-radius:50%;"/><br/>
      <sub><b>이권형</b></sub><br/>
      <a href="https://github.com/kannikii">@kannikii</a>
    </td>
    <td align="center" width="150px">
      <img src="https://github.com/pjh21028.png" width="100px;" style="border-radius:50%;"/><br/>
      <sub><b>박중헌</b></sub><br/>
      <a href="https://github.com/pjh21028">@pjh21028</a>
    </td>
    <td align="center" width="150px">
      <img src="https://github.com/rlfqls.png" width="100px;" style="border-radius:50%;"/><br/>
      <sub><b>장길빈</b></sub><br/>
      <a href="https://github.com/rlfqls">@rlfqls</a>
    </td>
    <td align="center" width="150px">
      <img src="https://avatars.githubusercontent.com/u/0?v=4" width="100px;" style="border-radius:50%; opacity:0.4;"/><br/>
      <sub><b>스팡위</b></sub><br/>
      <span style="color: gray;">No GitHub</span>
    </td>
  </tr>
</table>
<hr/>
<br>
<br>

<h1 align="center">🎤 SpeakFlow – AI 발표 코치</h1>

<p align="center">
  AI 기반 발표 분석 플랫폼<br/>
  음성 · 내용 · 영상 데이터를 실시간 분석하여 피드백 제공
</p>


https://speakflows.vercel.app/


## 🛠 Tech Stack
### Frontend
<p>
  <img src="https://img.shields.io/badge/React-61DAFB?style=for-the-badge&logo=React&logoColor=black"/>
  <img src="https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=Vite&logoColor=white"/>
  <img src="https://img.shields.io/badge/TailwindCSS-38B2AC?style=for-the-badge&logo=TailwindCSS&logoColor=white"/>
  <img src="https://img.shields.io/badge/Firebase-FFCA28?style=for-the-badge&logo=Firebase&logoColor=black"/>
  <img src="https://img.shields.io/badge/FramerMotion-0055FF?style=for-the-badge&logo=Framer&logoColor=white"/>
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=TypeScript&logoColor=white"/>
</p>


### Backend 
<p>
  <img src="https://img.shields.io/badge/FastAPI-009688?style=for-the-badge&logo=FastAPI&logoColor=white"/>
  <img src="https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=Python&logoColor=white"/>
  <img src="https://img.shields.io/badge/MediaPipe-FF5722?style=for-the-badge&logo=Google&logoColor=white"/>
  <img src="https://img.shields.io/badge/PyTorch-EE4C2C?style=for-the-badge&logo=PyTorch&logoColor=white"/>
  <img src="https://img.shields.io/badge/Firebase-FFCA28?style=for-the-badge&logo=Firebase&logoColor=black"/>
  <img src="https://img.shields.io/badge/Vercel-000000?style=for-the-badge&logo=Vercel&logoColor=white"/>
</p>

## 🚀 실행 방법 (로컬)
1) 코드 받기  
```bash
git clone <repo-url>
cd 2025-2-CSC4004-1-4-Team04
```

2) 백엔드 준비  
```bash
cd BE
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
# 환경변수: FIREBASE_CRED_PATH, FIREBASE_PROJECT_ID, OPENAI_API_KEY 등 .env에 설정
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

3) 프론트 준비  
```bash
cd FE
npm install
# vite용 .env에 VITE_API_URL=http://localhost:8000 등 설정
npm run dev -- --host 0.0.0.0 --port 5173
```

4) 브라우저 접속  
- 백엔드 Swagger: http://localhost:8000/docs  
- 프론트: http://localhost:5173

프론트로 접속해서 테스트 가능
