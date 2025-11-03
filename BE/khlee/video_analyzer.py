import cv2
import mediapipe as mp

def analyze_video(video_path: str):
    """
    입력된 영상 파일 경로를 받아서 시선 비율과 자세 안정성을 간단히 분석합니다.
    반환값: {"gaze_center_ratio": float, "posture_stability": float}
    """

    mp_face = mp.solutions.face_mesh
    mp_pose = mp.solutions.pose

    face = mp_face.FaceMesh(static_image_mode=False, max_num_faces=1)
    pose = mp_pose.Pose(static_image_mode=False)

    cap = cv2.VideoCapture(video_path)
    frame_count = 0
    gaze_center_count = 0
    posture_unstable_count = 0

    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break
        frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

        # 얼굴 (시선 방향 분석)
        face_result = face.process(frame_rgb)
        if face_result.multi_face_landmarks:
            landmarks = face_result.multi_face_landmarks[0]
            left_eye = landmarks.landmark[33]
            right_eye = landmarks.landmark[263]
            eye_center_x = (left_eye.x + right_eye.x) / 2
            if 0.4 < eye_center_x < 0.6:
                gaze_center_count += 1

        # 자세 (어깨 좌표 기반)
        pose_result = pose.process(frame_rgb)
        if pose_result.pose_landmarks:
            left_shoulder = pose_result.pose_landmarks.landmark[11]
            right_shoulder = pose_result.pose_landmarks.landmark[12]
            diff_x = abs(left_shoulder.x - right_shoulder.x)
            if diff_x > 0.15:  # 기울기 기준
                posture_unstable_count += 1

        frame_count += 1

    cap.release()

    if frame_count == 0:
        return {"error": "No frames processed"}

    gaze_ratio = gaze_center_count / frame_count
    posture_ratio = 1 - (posture_unstable_count / frame_count)

    return {
        "gaze_center_ratio": round(gaze_ratio, 2),
        "posture_stability": round(posture_ratio, 2)
    }
