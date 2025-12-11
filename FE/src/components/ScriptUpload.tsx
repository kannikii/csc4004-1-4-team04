import { useEffect, useState } from "react";
import { db } from "../lib/firebase";
import {
  collection,
  addDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  doc,
  Timestamp,
} from "firebase/firestore";
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

  // 수정 모달 상태
  const [showEditModal, setShowEditModal] = useState(false);
  const [editProject, setEditProject] = useState<any>(null);

  // 🔵 프로젝트 불러오기
  useEffect(() => {
    const fetchProjects = async () => {
      const snap = await getDocs(collection(db, "users", user.uid, "projects"));
      const list = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      setProjects(list);
    };
    fetchProjects();
  }, [user.uid]);

  // 🔵 새 프로젝트 생성
  const handleCreateProject = async () => {
    if (!title.trim() || !scriptText.trim()) {
      alert("제목과 대본을 모두 입력해주세요.");
      return;
    }

    const docRef = await addDoc(
      collection(db, "users", user.uid, "projects"),
      {
        title,
        scriptText,
        userId: user.uid,
        createdAt: Timestamp.now(),
      }
    );

    setProjects((prev) => [...prev, { id: docRef.id, title, scriptText }]);
    setShowNewForm(false);
    setTitle("");
    setScriptText("");
  };

  // 🔵 삭제
  const handleDeleteProject = async (projectId: string) => {
    const ok = confirm("정말 삭제할까요?");
    if (!ok) return;

    await deleteDoc(doc(db, "users", user.uid, "projects", projectId));
    setProjects((prev) => prev.filter((p) => p.id !== projectId));
  };

  // 🔵 수정 모달 열기
  const openEditModal = (p: any) => {
    setEditProject(p);
    setTitle(p.title);
    setScriptText(p.scriptText);
    setShowEditModal(true);
  };

  // 🔵 수정 저장
  const handleUpdateProject = async () => {
    if (!editProject) return;

    const ref = doc(db, "users", user.uid, "projects", editProject.id);
    await updateDoc(ref, {
      title,
      scriptText,
      updatedAt: Timestamp.now(),
    });

    setProjects((prev) =>
      prev.map((p) =>
        p.id === editProject.id ? { ...p, title, scriptText } : p
      )
    );

    setShowEditModal(false);
    setEditProject(null);
  };

  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* 배경 */}
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950" />

      <div className="relative z-10 mx-auto max-w-3xl px-4 py-16">
        <h1 className="text-4xl mb-10 font-medium text-white">발표 자료 업로드</h1>

        {/* ===================== */}
        {/* 🔵 프로젝트 카드 목록 */}
        {/* ===================== */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
          {projects.map((p) => (
            <div
              key={p.id}
              onClick={() => {
                setSelectedProject(p.id);
                onSelectProject(p.id); // 🔵 카드 클릭 → 녹화 페이지 이동
              }}
              className="
                group relative cursor-pointer p-6 rounded-xl border
                bg-white/5 backdrop-blur 
                hover:scale-105 hover:shadow-xl hover:border-blue-400
                transition-all duration-200 border-white/10
              "
            >
              <h3 className="text-white text-lg font-semibold mb-2">{p.title}</h3>

              {/* 앞 3줄만 표시 */}
              <p className="text-white/60 text-sm line-clamp-3 leading-relaxed pr-12">
                {p.scriptText}
              </p>

              {/* 수정/삭제 버튼 */}
              <div
                className="
                  absolute top-3 right-3 flex gap-2
                  opacity-0 group-hover:opacity-100
                  transition-opacity duration-200
                "
              >
                <button
                  onClick={(e) => {
                    e.stopPropagation(); // 🔴 카드 클릭 막기
                    openEditModal(p);
                  }}
                  className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-md"
                >
                  수정
                </button>

                <button
                  onClick={(e) => {
                    e.stopPropagation(); // 🔴 카드 클릭 막기
                    handleDeleteProject(p.id);
                  }}
                  className="px-3 py-1 text-xs bg-red-600 hover:bg-red-700 text-white rounded-md"
                >
                  삭제
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* ===================== */}
        {/* 🔵 새 프로젝트 폼 */}
        {/* ===================== */}
        <Button
          onClick={() => setShowNewForm(!showNewForm)}
          className="w-full bg-gradient-to-r from-blue-500 to-green-500 text-white py-3 rounded-lg mb-6"
        >
          {showNewForm ? "폼 닫기" : "새 프로젝트 만들기"}
        </Button>

        {showNewForm && (
          <div className="p-6 rounded-xl bg-white/5 border border-white/10">
            <label className="block mb-2 text-white/90">제목</label>
            <input
              className="w-full mb-4 p-3 rounded-md bg-slate-800 text-white"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />

            <label className="block mb-2 text-white/90">대본</label>
            <textarea
              className="w-full h-40 p-3 rounded-md bg-slate-800 text-white"
              value={scriptText}
              onChange={(e) => setScriptText(e.target.value)}
            />

            <Button
              onClick={handleCreateProject}
              className="w-full bg-gradient-to-r from-blue-500 to-green-500 py-3 text-white rounded-lg"
            >
              저장하기
            </Button>
          </div>
        )}
      </div>

      {/* ===================== */}
      {/* 🔵 수정 모달 */}
      {/* ===================== */}
      {showEditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="bg-slate-900 text-white rounded-2xl max-w-lg w-full p-6 border border-white/10">

            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">프로젝트 수정</h2>
              <button onClick={() => setShowEditModal(false)}>✕</button>
            </div>

            <label className="block mb-2 text-white/90">제목</label>
            <input
              className="w-full mb-4 p-3 rounded-md bg-slate-800 border border-slate-700 text-white"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />

            <label className="block mb-2 text-white/90">대본 수정</label>
            <textarea
              className="w-full h-40 p-3 rounded-md bg-slate-800 border border-slate-700 text-white"
              value={scriptText}
              onChange={(e) => setScriptText(e.target.value)}
            />

            <Button
              onClick={handleUpdateProject}
              className="w-full bg-blue-600 hover:bg-blue-700 py-3 rounded-lg mt-4 text-white"
            >
              수정 내용 저장하기
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}