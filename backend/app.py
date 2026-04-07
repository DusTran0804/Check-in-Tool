import cv2
import base64
import numpy as np
import uuid
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import face_recognition

app = FastAPI()

# Bật tính năng CORS để web app có thể truyền ảnh sang
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Bộ nhớ tạm lưu lại face_encoding theo ID Session người dùng
# Có cấu trúc: { "session_id": { "name": "...", "encoding": [...] } }
sessions = {}

def decode_base64_img(base64_str):
    if "," in base64_str:
        base64_str = base64_str.split(",")[1]
    img_data = base64.b64decode(base64_str)
    nparr = np.frombuffer(img_data, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    rgb_img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    return rgb_img

class RegisterRequest(BaseModel):
    name: str
    image_base64: str

class CheckinRequest(BaseModel):
    session_id: str
    image_base64: str

@app.post("/api/register")
def register_face(req: RegisterRequest):
    img = decode_base64_img(req.image_base64)
    encodings = face_recognition.face_encodings(img)
    
    if len(encodings) == 0:
        raise HTTPException(status_code=400, detail="Không tìm thấy khuôn mặt.")
    
    session_id = str(uuid.uuid4())
    sessions[session_id] = {
        "name": req.name.upper(),
        "encoding": encodings[0].tolist() 
    }
    
    print(f"[Đăng ký] Thành công người dùng: {req.name.upper()} - Session ID: {session_id}")
    return {"status": "success", "session_id": session_id, "name": req.name.upper()}

@app.post("/api/checkin")
def checkin_face(req: CheckinRequest):
    if req.session_id not in sessions:
        raise HTTPException(status_code=401, detail="Session hết hạn hoặc không tồn tại. Vui lòng đăng ký lại.")
    
    stored_encoding = np.array(sessions[req.session_id]["encoding"])
    stored_name = sessions[req.session_id]["name"]
    
    img = decode_base64_img(req.image_base64)
    # Thu nhỏ 1/4 để xử lý siêu tốc độ giống code gốc của bạn
    small_img = cv2.resize(img, (0, 0), fx=0.25, fy=0.25)
    
    face_locations = face_recognition.face_locations(small_img)
    face_encodings = face_recognition.face_encodings(small_img, face_locations)
    
    results = []
    for (top, right, bottom, left), face_encoding in zip(face_locations, face_encodings):
        # Trả tọa độ về tỷ lệ ban đầu
        top, right, bottom, left = top*4, right*4, bottom*4, left*4
        
        matches = face_recognition.compare_faces([stored_encoding], face_encoding, tolerance=0.5)
        face_distances = face_recognition.face_distance([stored_encoding], face_encoding)
        
        best_match_index = np.argmin(face_distances)
        distance = face_distances[best_match_index]
        match_status = bool(matches[best_match_index])
        
        results.append({
            "box": {"y": top, "x": left, "width": right - left, "height": bottom - top},
            "distance": float(distance),
            "match": match_status,
            "label": stored_name if match_status else "Unknown"
        })
        
    return {"status": "success", "faces": results}

if __name__ == "__main__":
    import uvicorn
    # Mở port 8000
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)
