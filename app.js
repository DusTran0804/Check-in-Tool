/**
 * Face Check-in Web App Logic (Backend Driven API Version)
 */

const video = document.getElementById('video');
const overlay = document.getElementById('overlay');
const registerBtn = document.getElementById('register-btn');
const resetBtn = document.getElementById('reset-session-btn');
const manualCheckinBtn = document.getElementById('manual-checkin-btn');
const userNameInput = document.getElementById('user-name');
const statusBadge = document.getElementById('ai-status');
const loader = document.getElementById('loader-wrapper');
const registrationPanel = document.getElementById('registration-panel');
const checkinPanel = document.getElementById('checkin-panel');
const currentUserDisplay = document.getElementById('current-user-display');
const logContainer = document.getElementById('checkin-logs');
const flashOverlay = document.getElementById('capture-flash');
const forceStartBtn = document.getElementById('force-start-btn');

let backendUrl = "https://face-checkin-backend.onrender.com/api"; 
// LOCAL DEV: let backendUrl = "http://localhost:8000/api";
let currentSessionId = null;
let currentRegisteredName = "";
let checkinCount = 0;
let checkinCooldown = false;

// Remove logic related to models
forceStartBtn.addEventListener('click', () => {
    loader.style.opacity = '0';
    setTimeout(() => loader.style.display = 'none', 500);
    startVideo();
});

// Start immediately without waiting for models
function init() {
    console.log("Khởi động Camera (Backend Mode)...");
    loader.style.opacity = '0';
    setTimeout(() => loader.style.display = 'none', 500);
    statusBadge.textContent = "AI Status: Kết nối máy chủ...";
    startVideo();
}

function startVideo() {
    navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 } })
        .then(stream => {
            video.srcObject = stream;
            video.play().catch(e => console.error("Play error:", e));
            statusBadge.textContent = "AI Status: Camera Sẵn sàng";
        })
        .catch(err => {
            console.error("Error accessing camera:", err);
            showToast("Không thể truy cập camera. Vui lòng cấp quyền.", "error");
        });
}

function captureFrame() {
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.8);
}

function clearOverlay() {
    const ctx = overlay.getContext('2d');
    ctx.clearRect(0, 0, overlay.width, overlay.height);
}

video.addEventListener('play', () => {
    // Match overlay dimensions
    overlay.width = video.videoWidth;
    overlay.height = video.videoHeight;
    
    // Setup matching window dimensions based on CSS display size later
    setInterval(async () => {
        if (!currentSessionId) {
            clearOverlay();
            return;
        }

        const base64Img = captureFrame();
        try {
            const resp = await fetch(`${backendUrl}/checkin`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    session_id: currentSessionId,
                    image_base64: base64Img
                })
            });

            if (!resp.ok) {
                if (resp.status === 401) {
                    showToast("Phiên làm việc hết hạn máy chủ. Xin đăng ký lại", "error");
                    resetSession();
                }
                return;
            }

            const data = await resp.json();
            const ctx = overlay.getContext('2d');
            ctx.clearRect(0, 0, overlay.width, overlay.height);

            // Tỷ lệ scale:
            const displaySize = { width: video.clientWidth, height: video.clientHeight };
            const scaleX = displaySize.width / video.videoWidth;
            const scaleY = displaySize.height / video.videoHeight;

            data.faces.forEach(face => {
                const x = face.box.x * scaleX;
                const y = face.box.y * scaleY;
                const w = face.box.width * scaleX;
                const h = face.box.height * scaleY;

                let color = face.match ? '#2ecc71' : '#e74c3c';
                let label = `${face.label} (${face.distance.toFixed(2)})`;

                // Draw custom box
                ctx.strokeStyle = color;
                ctx.lineWidth = 2;
                ctx.strokeRect(x, y, w, h);
                
                // Label box
                ctx.fillStyle = color;
                const textWidth = ctx.measureText(label).width;
                ctx.fillRect(x, y - 25, textWidth + 20, 25);
                ctx.fillStyle = "#fff";
                ctx.fillText(label, x + 10, y - 8);
            });

        } catch (error) {
            console.error("Lỗi giao tiếp máy chủ:", error);
        }
    }, 1000); 
});

registerBtn.addEventListener('click', async () => {
    const name = userNameInput.value.trim();
    if (!name) {
        showToast("Vui lòng nhập tên của bạn trước khi đăng ký.", "error");
        return;
    }

    statusBadge.textContent = "AI Status: Đang mã hóa...";
    const base64Img = captureFrame();

    try {
        const resp = await fetch(`${backendUrl}/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                name: name,
                image_base64: base64Img
            })
        });

        const data = await resp.json();
        
        if (resp.ok) {
            currentSessionId = data.session_id;
            currentRegisteredName = data.name;
            
            // Flash animation
            flashOverlay.classList.add('active');
            setTimeout(() => flashOverlay.classList.remove('active'), 500);

            // Update UI
            registrationPanel.classList.add('hidden');
            checkinPanel.classList.remove('hidden');
            currentUserDisplay.textContent = currentRegisteredName;
            statusBadge.textContent = "AI Status: Máy chủ đang theo dõi";
            
            showToast(`Đăng ký trên máy chủ thành công: ${currentRegisteredName}`);
        } else {
            showToast(data.detail || "Lỗi khi đăng ký.", "error");
            statusBadge.textContent = "AI Status: Camera Sẵn sàng";
        }
    } catch (error) {
        showToast("Không thể kết nối máy chủ Python.", "error");
        statusBadge.textContent = "AI Status: Camera Sẵn sàng";
    }
});

manualCheckinBtn.addEventListener('click', async () => {
    if (!currentSessionId) return;
    
    if (checkinCooldown) {
        showToast("Vui lòng đợi vài giây để checkin lại", "error");
        return;
    }

    statusBadge.textContent = "AI Status: Xác thực thủ công...";
    const base64Img = captureFrame();

    try {
        const resp = await fetch(`${backendUrl}/checkin`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                session_id: currentSessionId,
                image_base64: base64Img
            })
        });

        const data = await resp.json();
        
        if (resp.ok && data.faces && data.faces.length > 0) {
            // Find if any face matches
            const matchFace = data.faces.find(f => f.match);
            if (matchFace) {
                checkinCount++;
        
                const timeStr = new Date().toLocaleTimeString();
                const logItem = document.createElement('div');
                logItem.className = 'log-item';
                logItem.innerHTML = `
                    <span class="log-name">✅ ${matchFace.label} check-in lần ${checkinCount} (Server)</span>
                    <span class="log-time">${timeStr}</span>
                `;
                
                const empty = logContainer.querySelector('.empty-log');
                if (empty) empty.remove();
                
                logContainer.prepend(logItem);
                showToast(`Check-in thành công: ${matchFace.label} (Lần ${checkinCount})`);
                
                flashOverlay.style.background = '#2ecc71';
                flashOverlay.classList.add('active');
                setTimeout(() => {
                    flashOverlay.classList.remove('active');
                    flashOverlay.style.background = '#fff';
                }, 500);

                try {
                    const speech = new SpeechSynthesisUtterance(`${matchFace.label} đã check in thành công`);
                    speech.lang = 'vi-VN';
                    window.speechSynthesis.speak(speech);
                } catch(e) {}
                
                checkinCooldown = true;
                setTimeout(() => checkinCooldown = false, 3000);

            } else {
                showToast(`Mặt không khớp. Không phải bạn!`, "error");
            }
        } else {
            showToast("Máy chủ không tìm thấy khuôn mặt trong Camera.", "error");
        }
    } catch(err) {
        showToast("API Checkin lỗi: " + err, "error");
    }
    statusBadge.textContent = "AI Status: Máy chủ đang theo dõi";
});

function resetSession() {
    currentSessionId = null;
    currentRegisteredName = "";
    checkinCount = 0;
    registrationPanel.classList.remove('hidden');
    checkinPanel.classList.add('hidden');
    
    logContainer.innerHTML = '<div class="empty-log">Chưa có lượt check-in nào trong phiên này.</div>';
    statusBadge.textContent = "AI Status: Camera Sẵn sàng";
    clearOverlay();
}

resetBtn.addEventListener('click', () => {
    resetSession();
    showToast("Đã xóa phiên làm việc khỏi Web. Đang đợi đăng ký lại.");
});

function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    
    const container = document.getElementById('toast-container');
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(20px)';
        setTimeout(() => toast.remove(), 500);
    }, 3000);
}

// Start the app
init();
