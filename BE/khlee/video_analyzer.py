import os
import cv2
import mediapipe as mp
import numpy as np
import math
import sys
import time

# ============================
# 진행률 상태 관리용 (공유 변수)
# ============================
_progress = 0

def set_progress(value: int):
    global _progress
    _progress = max(0, min(100, value))

def get_progress():
    return _progress


# ============================
# MediaPipe 초기화
# ============================
mp_face = mp.solutions.face_mesh
mp_pose = mp.solutions.pose
mp_hands = mp.solutions.hands


def analyze_video(video_path: str):
    """
    발표 영상의 시선·자세·몸짓·손동작·머리방향을 분석하는 함수
    진행률(%) 실시간 업데이트 포함
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
    gaze_movements = 0

    shoulder_xs, shoulder_ys = [], []
    posture_stability_values = []
    motion_energy_values = []
    hand_visible_frames = 0
    hand_movement_values = []
    head_rolls, head_yaws = [] , []

    prev_pose_coords = None
    prev_eye_center = None

    # ============================
    # MediaPipe 객체 초기화
    # ============================
    face_mesh = mp_face.FaceMesh(refine_landmarks=True, min_detection_confidence=0.4)
    pose = mp_pose.Pose(min_detection_confidence=0.4)
    hands = mp_hands.Hands(max_num_hands=2, min_detection_confidence=0.4)

    print(f"🎥 분석 시작: {video_path}")
    start_time = time.time()
    last_print = 0

    # ============================
    # 프레임 단위 분석
    # ============================
    while True:
        success, frame = cap.read()
        if not success:
            break
        total_frames += 1

        # --- 진행률 표시 (터미널용) ---
        if frame_count > 0:
            progress = int((total_frames / frame_count) * 100)
            set_progress(progress)
            if progress % 5 == 0 and progress != last_print:
                elapsed = time.time() - start_time
                sys.stdout.write(f"\r⏳ 진행률: {progress}%  (경과 {elapsed:.1f}s)")
                sys.stdout.flush()
                last_print = progress

        frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        h, w, _ = frame.shape

        face_result = face_mesh.process(frame_rgb)
        pose_result = pose.process(frame_rgb)
        hands_result = hands.process(frame_rgb)

        # ========= 시선(Gaze) 분석 =========
        if face_result.multi_face_landmarks:
            lm = face_result.multi_face_landmarks[0].landmark
            left_eye = lm[33]; right_eye = lm[263]
            eye_center_x = (left_eye.x + right_eye.x) / 2
            eye_center_y = (left_eye.y + right_eye.y) / 2
            gaze_trace.append([eye_center_x, eye_center_y])

            if abs(eye_center_x - 0.5) < 0.25 and abs(eye_center_y - 0.5) < 0.25:
                gaze_center_hits += 1
            if eye_center_x < 0.33: left_count += 1
            elif eye_center_x < 0.66: center_count += 1
            else: right_count += 1

            if prev_eye_center is not None:
                dx, dy = abs(eye_center_x - prev_eye_center[0]), abs(eye_center_y - prev_eye_center[1])
                if dx > 0.05 or dy > 0.05:
                    gaze_movements += 1
            prev_eye_center = (eye_center_x, eye_center_y)

            # 얼굴 방향
            nose = np.array([lm[1].x, lm[1].y])
            dx_eye = right_eye.x - left_eye.x
            dy_eye = right_eye.y - left_eye.y
            roll = np.degrees(np.arctan2(dy_eye, dx_eye))
            head_rolls.append(abs(roll))
            yaw = np.degrees(np.arctan2(nose[0] - 0.5, 0.5))
            head_yaws.append(abs(yaw))

        # ========= 자세(Posture) 분석 =========
        if pose_result.pose_landmarks:
            lm = pose_result.pose_landmarks.landmark
            left_shoulder = lm[mp_pose.PoseLandmark.LEFT_SHOULDER]
            right_shoulder = lm[mp_pose.PoseLandmark.RIGHT_SHOULDER]
            center_x = (left_shoulder.x + right_shoulder.x) / 2
            center_y = (left_shoulder.y + right_shoulder.y) / 2
            shoulder_xs.append(center_x)
            shoulder_ys.append(center_y)

            dx, dy = right_shoulder.x - left_shoulder.x, right_shoulder.y - left_shoulder.y
            roll_angle = math.degrees(math.atan2(dy, dx))
            if roll_angle > 90: roll_angle -= 180
            elif roll_angle < -90: roll_angle += 180
            posture_stability_values.append(abs(roll_angle))

            current_pose = np.array([[p.x, p.y] for p in pose_result.pose_landmarks.landmark])
            if prev_pose_coords is not None:
                diff = np.linalg.norm(current_pose - prev_pose_coords)
                motion_energy_values.append(diff)
            prev_pose_coords = current_pose

        # ========= 손(Hand) 분석 =========
        if hands_result.multi_hand_landmarks:
            hand_visible_frames += 1
            centers = []
            for hand in hands_result.multi_hand_landmarks:
                cx = np.mean([lm.x for lm in hand.landmark])
                cy = np.mean([lm.y for lm in hand.landmark])
                centers.append((cx, cy))
            if len(centers) == 2:
                dist = np.linalg.norm(np.array(centers[0]) - np.array(centers[1]))
                hand_movement_values.append(dist)

    cap.release()
    print("\n✅ 영상 분석 완료!\n")
    set_progress(100)

    # ============================
    # 결과 계산
    # ============================
    gaze_center_ratio = gaze_center_hits / total_frames if total_frames > 0 else 0
    sigma_x = np.std(shoulder_xs) if shoulder_xs else 0
    sigma_y = np.std(shoulder_ys) if shoulder_ys else 0
    mean_roll = np.mean(posture_stability_values) if posture_stability_values else 0
    posture_stability = max(0, 1 - (sigma_x + sigma_y + abs(mean_roll) / 45))

    total_gaze_points = left_count + center_count + right_count
    if total_gaze_points > 0:
        gaze_distribution = {
            "left": round(left_count / total_gaze_points, 3),
            "center": round(center_count / total_gaze_points, 3),
            "right": round(right_count / total_gaze_points, 3)
        }
    else:
        gaze_distribution = {"left": 0, "center": 0, "right": 0}

    gaze_movement_rate = round((gaze_movements / duration_sec), 2) if duration_sec > 0 else 0

    # 추가 분석 항목 평균값
    motion_energy_mean = float(np.mean(motion_energy_values)) if motion_energy_values else 0
    hand_visibility_ratio = hand_visible_frames / total_frames if total_frames else 0
    hand_movement_mean = float(np.mean(hand_movement_values)) if hand_movement_values else 0
    head_roll_mean = float(np.mean(head_rolls)) if head_rolls else 0
    head_yaw_mean = float(np.mean(head_yaws)) if head_yaws else 0

    # 평가 기준 (emoji 제거)
    gesture_eval = "적정" if 0.15 <= motion_energy_mean <= 0.35 else "조정 필요"
    hand_eval = "균형" if 0.4 <= hand_visibility_ratio <= 0.9 else "부족/과다"
    head_eval = "안정적" if head_roll_mean < 5 and head_yaw_mean < 15 else "불균형"

    # ============================
    # 결과 구조화
    # ============================
    results = {
        "metadata": {
            "filename": os.path.basename(video_path),
            "fps": round(fps, 2),
            "resolution": [width, height],
            "duration_sec": round(duration_sec, 2),
            "frame_count": total_frames
        },
        "gaze": {
            "center_ratio": round(gaze_center_ratio, 3),
            "distribution": gaze_distribution,
            "movement_rate_per_sec": gaze_movement_rate,
            "trace_sample": gaze_trace[::max(1, len(gaze_trace)//20)],
            "interpretation": (
                "정면 응시율이 낮으나 청중 중심 발표로 해석 가능"
                if gaze_center_ratio < 0.15 else
                "정면 응시율이 높아 온라인 프레젠테이션에 적합"
            )
        },
        "posture": {
            "stability": round(posture_stability, 3),
            "sigma": {"x": round(sigma_x, 4), "y": round(sigma_y, 4)},
            "roll_mean": round(mean_roll, 3),
            "interpretation": (
                "자세 안정성이 높고 상체 균형이 유지됨"
                if posture_stability > 0.7 else
                "자세 흔들림이 커 보임"
            )
        },
        "gesture": {
            "motion_energy": round(motion_energy_mean, 4),
            "evaluation": gesture_eval,
            "interpretation": "0.15~0.35면 자연스러운 제스처 빈도 (Mehrabian, 1972)"
        },
        "hand": {
            "visibility_ratio": round(hand_visibility_ratio, 3),
            "movement": round(hand_movement_mean, 4),
            "evaluation": hand_eval,
            "interpretation": "손동작 비율 40~90%가 이상적 (Pease & Pease, 2006)"
        },
        "head_pose": {
            "roll_mean": round(head_roll_mean, 3),
            "yaw_mean": round(head_yaw_mean, 3),
            "evaluation": head_eval,
            "interpretation": "Roll<5°, Yaw<15°면 시선 분배 안정적"
        }
    }

    return results
