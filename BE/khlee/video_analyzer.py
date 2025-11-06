import cv2
import mediapipe as mp
import numpy as np
import math

mp_face = mp.solutions.face_mesh
mp_pose = mp.solutions.pose


def analyze_video(video_path: str):
    """
    발표 영상의 시선 및 자세를 분석하는 함수 (시선 분포 + 이동 빈도 확장 버전).
    - 시선 좌표 기반으로 왼/중앙/오른쪽 구역 체류 비율 계산
    - 프레임 간 Δx, Δy 변화를 이용해 시선 이동 빈도 계산
    """

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise ValueError(f"❌ 영상 파일을 열 수 없습니다: {video_path}")

    fps = cap.get(cv2.CAP_PROP_FPS)
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    duration_sec = frame_count / fps if fps > 0 else 0

    # ============================
    # 결과 저장용 변수
    # ============================
    gaze_trace = []
    gaze_center_hits = 0
    total_frames = 0
    left_count, center_count, right_count = 0, 0, 0
    gaze_movements = 0  # 시선 이동 횟수

    shoulder_xs, shoulder_ys = [], []
    posture_stability_values = []

    # ============================
    # MediaPipe 초기화
    # ============================
    face_mesh = mp_face.FaceMesh(
        static_image_mode=False,
        max_num_faces=1,
        refine_landmarks=True,
        min_detection_confidence=0.4,
        min_tracking_confidence=0.4
    )

    pose = mp_pose.Pose(
        static_image_mode=False,
        model_complexity=1,
        enable_segmentation=False,
        min_detection_confidence=0.4,
        min_tracking_confidence=0.4
    )

    prev_eye_center = None

    while True:
        success, frame = cap.read()
        if not success:
            break
        total_frames += 1

        frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        h, w, _ = frame.shape

        face_result = face_mesh.process(frame_rgb)
        pose_result = pose.process(frame_rgb)

        # ========= 시선 분석 =========
        if face_result.multi_face_landmarks:
            for face_landmarks in face_result.multi_face_landmarks:
                left_eye = face_landmarks.landmark[33]
                right_eye = face_landmarks.landmark[263]
                eye_center_x = (left_eye.x + right_eye.x) / 2
                eye_center_y = (left_eye.y + right_eye.y) / 2
                gaze_trace.append([eye_center_x, eye_center_y])

                # 정면 응시 여부
                if abs(eye_center_x - 0.5) < 0.25 and abs(eye_center_y - 0.5) < 0.25:
                    gaze_center_hits += 1

                # 🧭 시선 구역 분류 (왼/중앙/오른쪽)
                if eye_center_x < 0.33:
                    left_count += 1
                elif eye_center_x < 0.66:
                    center_count += 1
                else:
                    right_count += 1

                # 🔄 시선 이동 빈도 계산
                if prev_eye_center is not None:
                    dx = abs(eye_center_x - prev_eye_center[0])
                    dy = abs(eye_center_y - prev_eye_center[1])
                    if dx > 0.05 or dy > 0.05:  # 프레임 간 이동이 크면 이동으로 간주
                        gaze_movements += 1
                prev_eye_center = (eye_center_x, eye_center_y)

        # ========= 자세 분석 =========
        if pose_result.pose_landmarks:
            lm = pose_result.pose_landmarks.landmark
            left_shoulder = lm[mp_pose.PoseLandmark.LEFT_SHOULDER]
            right_shoulder = lm[mp_pose.PoseLandmark.RIGHT_SHOULDER]

            center_x = (left_shoulder.x + right_shoulder.x) / 2
            center_y = (left_shoulder.y + right_shoulder.y) / 2

            shoulder_xs.append(center_x)
            shoulder_ys.append(center_y)

            dx = right_shoulder.x - left_shoulder.x
            dy = right_shoulder.y - left_shoulder.y
            roll_angle = math.degrees(math.atan2(dy, dx))

            # 반전 교정
            if roll_angle > 90:
                roll_angle -= 180
            elif roll_angle < -90:
                roll_angle += 180

            posture_stability_values.append(abs(roll_angle))

    cap.release()

    # ============================
    # 결과 계산
    # ============================
    gaze_center_ratio = gaze_center_hits / total_frames if total_frames > 0 else 0
    sigma_x = np.std(shoulder_xs) if shoulder_xs else 0
    sigma_y = np.std(shoulder_ys) if shoulder_ys else 0
    mean_roll = np.mean(posture_stability_values) if posture_stability_values else 0

    posture_stability = max(0, 1 - (sigma_x + sigma_y + abs(mean_roll) / 45))

    # 시선 분포 비율 계산
    total_gaze_points = left_count + center_count + right_count
    if total_gaze_points > 0:
        gaze_distribution = {
            "left": round(left_count / total_gaze_points, 3),
            "center": round(center_count / total_gaze_points, 3),
            "right": round(right_count / total_gaze_points, 3)
        }
    else:
        gaze_distribution = {"left": 0, "center": 0, "right": 0}

    # 시선 이동 빈도 (초당 이동 횟수)
    gaze_movement_rate = round((gaze_movements / duration_sec), 2) if duration_sec > 0 else 0

    # ============================
    # 결과 구조화
    # ============================
    results = {
        "metadata": {
            "filename": video_path.split("/")[-1],
            "fps": round(fps, 2),
            "resolution": [width, height],
            "duration_sec": round(duration_sec, 2),
            "frame_count": total_frames
        },
        "gaze": {
            "center_ratio": round(gaze_center_ratio, 3),
            "distribution": gaze_distribution,
            "movement_rate_per_sec": gaze_movement_rate,
            "trace_sample": gaze_trace[::max(1, len(gaze_trace)//20)]
        },
        "posture": {
            "stability": round(posture_stability, 3),
            "sigma": {"x": round(sigma_x, 4), "y": round(sigma_y, 4)},
            "roll_mean": round(mean_roll, 3)
        }
    }

    return results
