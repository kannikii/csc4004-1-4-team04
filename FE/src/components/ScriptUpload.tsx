import { useEffect, useState } from "react";
import { db } from "../lib/firebase";
import { collection, addDoc, getDocs, Timestamp } from "firebase/firestore";
import { Button } from "./ui/button";

interface ScriptUploadProps {
  user: any;
  onSelectProject: (projectId: string) => void; 
}

export function ScriptUpload({ user, onSelectProject }: ScriptUploadProps) {
  const [showNewForm, setShowNewForm] = useState(false);
  const [title, setTitle] = useState("");
  const [scriptText, setScriptText] = useState("");
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedProject, setSelectedProject] = useState("");

  // 기존 프로젝트 불러오기
  useEffect(() => {
    const fetchProjects = async () => {
      const snap = await getDocs(collection(db, `presentations/${user.uid}/projects`));
      const list = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      setProjects(list);
    };
    fetchProjects();
  }, [user.uid]);

  // 새 프로젝트 생성
  const handleCreateProject = async () => {
    if (!title.trim() || !scriptText.trim()) {
      alert("제목과 대본을 모두 입력해주세요.");
      return;
    }

    const docRef = await addDoc(collection(db, `presentations/${user.uid}/projects`), {
      title,
      scriptText,
      userId: user.uid,
      createdAt: Timestamp.now(),
    });

    alert("새 프로젝트가 생성되었습니다!");

    setProjects((prev) => [...prev, { id: docRef.id, title, scriptText }]);
    setTitle("");
    setScriptText("");
    setShowNewForm(false);

    setSelectedProject(docRef.id);
    onSelectProject(docRef.id);
  };

  const handleSelect = (e: any) => {
    const id = e.target.value;
    setSelectedProject(id);
    onSelectProject(id);
  };

  return (
    <div className="relative min-h-screen overflow-hidden">
      
      {/* 💫 배경 */}
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
        <div className="absolute inset-0 opacity-30">
          <div className="absolute top-20 left-20 w-80 h-80 bg-blue-500/30 rounded-full blur-3xl" />
          <div className="absolute bottom-20 right-20 w-80 h-80 bg-green-500/30 rounded-full blur-3xl" />
        </div>
      </div>

      {/* 페이지 콘텐츠 */}
      <div className="relative z-10 mx-auto max-w-2xl px-4 py-16">
        
        {/* Title */}
        <br></br>
        <br></br>
        <h1 className="text-4xl mb-8 font-medium text-white text-left">
          발표 자료 업로드
        </h1>

        {/* 메인 카드 */}
        <div className="p-8 rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 shadow-2xl text-white">

          {/* 프로젝트 선택 */}
          <label className="block mb-2 text-lg">기존 프로젝트 선택</label>
          <select
            value={selectedProject}
            onChange={handleSelect}
            className="w-full p-3 mb-6 rounded-md bg-slate-800 border border-slate-600 text-white"
          >
            <option value="">-- 프로젝트 선택 --</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.title}</option>
            ))}
          </select>

          {/* 새 프로젝트 버튼 */}
          <Button
            onClick={() => setShowNewForm(!showNewForm)}
            className="w-full bg-gradient-to-r from-blue-500 to-green-500 text-white font-medium py-3 rounded-lg mb-4"
          >
            새 프로젝트 만들기
          </Button>

          {/* 새 프로젝트 폼 */}
          {showNewForm && (
            <div className="mt-4 p-6 rounded-xl bg-slate-900/60 border border-slate-700">
              <label className="block mb-2 text-lg">프로젝트 제목</label>
              <input
                className="w-full mb-4 p-3 rounded-md bg-slate-800 border border-slate-700 text-white"
                placeholder="예: 자기 소개 발표"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />

              <label className="block mb-2 text-lg">발표 자료 텍스트</label>
              <textarea
                className="w-full h-40 p-3 rounded-md bg-slate-800 border border-slate-700 text-white leading-relaxed"
                placeholder="발표 자료 텍스트를 입력하거나 붙여넣으세요."
                value={scriptText}
                onChange={(e) => setScriptText(e.target.value)}
              />

              <Button
                onClick={handleCreateProject}
                className="w-full bg-gradient-to-r from-blue-500 to-green-500 text-white font-medium py-3 rounded-lg mb-4"
              >
                저장하기
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}