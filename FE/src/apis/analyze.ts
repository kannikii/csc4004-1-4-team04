import axios from "axios";

export async function analyzePresentation(userId: string, projectId: string, file: File) {
  const API_URL = import.meta.env.VITE_API_URL; 
  const formData = new FormData();

  formData.append("userId", userId);
  formData.append("projectId", projectId);
  formData.append("file", file);


   const res = await axios.post(`${API_URL}/analyze/video`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });

  return res.data; // 백엔드에서 주는 분석 결과 JSON
}