/**
 * Face Check-in Web App Logic
 * Powered by face-api.js
 */

const video = document.getElementById('video');
const overlay = document.getElementById('overlay');
const registerBtn = document.getElementById('register-btn');
const resetBtn = document.getElementById('reset-session-btn');
const userNameInput = document.getElementById('user-name');
const statusBadge = document.getElementById('ai-status');
const loader = document.getElementById('loader-wrapper');
const registrationPanel = document.getElementById('registration-panel');
const checkinPanel = document.getElementById('checkin-panel');
const currentUserDisplay = document.getElementById('current-user-display');
const logContainer = document.getElementById('checkin-logs');
const flashOverlay = document.getElementById('capture-flash');

let isModelLoaded = false;
let isRegistered = false;
let registeredDescriptor = null;
let registeredName = "";
let checkinCount = 0;
let lastCheckinTime = 0;
const CHECKIN_COOLDOWN = 5000; // 5 seconds cooldown between check-ins (reduced for easier testing)

const MODEL_URL = './models';

document.getElementById('force-start-btn').addEventListener('click', () => {
    loader.style.opacity = '0';
    setTimeout(() => loader.style.display = 'none', 500);
    startVideo();
});

async function init() {
    try {
        console.log("Loading models...");
        statusBadge.textContent = "AI Status: Loading Models...";
        
        // Load required models
        await Promise.all([
            faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
            faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
            faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
        ]);

        isModelLoaded = true;
        console.log("Models loaded successfully");
        statusBadge.textContent = "AI Status: Models Ready";
        loader.style.opacity = '0';
        setTimeout(() => loader.style.display = 'none', 500);

        startVideo();
    } catch (err) {
        console.error("Error loading models:", err);
        statusBadge.textContent = "AI Status: Load Error: " + err.message;
        document.getElementById('loader-text').textContent = "Lỗi tải AI: " + err.message;
        document.getElementById('force-start-btn').style.display = 'inline-block';
    }
}

function startVideo() {
    navigator.mediaDevices.getUserMedia({ video: {} })
        .then(stream => {
            video.srcObject = stream;
            // Force play for Safari
            video.play().catch(e => console.error("Play error:", e));
        })
        .catch(err => {
            console.error("Error accessing camera:", err);
            showToast("Không thể truy cập camera. Vui lòng cấp quyền.", "error");
        });
}

video.addEventListener('play', () => {
    const canvas = faceapi.createCanvasFromMedia(video);
    // Use the container sizing
    const displaySize = { width: video.clientWidth, height: video.clientHeight };
    faceapi.matchDimensions(overlay, displaySize);

    setInterval(async () => {
        if (!isModelLoaded) return;
        
        try {
            const detections = await faceapi.detectAllFaces(video, new faceapi.TinyFaceDetectorOptions())
                .withFaceLandmarks()
                .withFaceDescriptors();

            const resizedDetections = faceapi.resizeResults(detections, displaySize);
            
            // Clear canvas
            const ctx = overlay.getContext('2d');
            ctx.clearRect(0, 0, overlay.width, overlay.height);
            
            if (isRegistered && registeredDescriptor) {
                const faceMatcher = new faceapi.FaceMatcher(
                    new faceapi.LabeledFaceDescriptors(registeredName, [registeredDescriptor]),
                    0.6 // increased distance threshold to 0.6
                );

                resizedDetections.forEach(detection => {
                    const result = faceMatcher.findBestMatch(detection.descriptor);
                    const { x, y, width, height } = detection.detection.box;
                    
                    let color = '#e74c3c'; // red for unknown
                    let label = `Unknown (${result.distance.toFixed(2)})`;

                    if (result.label !== 'unknown') {
                        color = '#2ecc71'; // green for match
                        label = `${registeredName} (${result.distance.toFixed(2)})`;
                        // Auto background check is disabled so the button is the main way to log!
                        // Nhưng vẫn sẽ thả đèn xanh để user biết máy quay đã nhận ra
                    }

                    // Draw custom box
                    ctx.strokeStyle = color;
                    ctx.lineWidth = 2;
                    ctx.strokeRect(x, y, width, height);
                    
                    // Label box
                    ctx.fillStyle = color;
                    const textWidth = ctx.measureText(label).width;
                    ctx.fillRect(x, y - 25, textWidth + 20, 25);
                    ctx.fillStyle = "#fff";
                    ctx.fillText(label, x + 10, y - 8);
                });
            } else {
                resizedDetections.forEach(detection => {
                    const { x, y, width, height } = detection.detection.box;
                    ctx.strokeStyle = '#00d2ff';
                    ctx.lineWidth = 2;
                    ctx.strokeRect(x, y, width, height);
                });
            }
        } catch (err) {
            console.error("Interval Error:", err);
            // Optionally flash red to show the loop crashed
        }
    }, 150);
});

registerBtn.addEventListener('click', async () => {
    const name = userNameInput.value.trim();
    if (!name) {
        showToast("Vui lòng nhập tên của bạn trước khi đăng ký.", "error");
        return;
    }

    statusBadge.textContent = "AI Status: Đang nhận diện...";
    
    // Attempt to capture a face
    const detection = await faceapi.detectSingleFace(video, new faceapi.TinyFaceDetectorOptions())
        .withFaceLandmarks()
        .withFaceDescriptor();

    if (detection) {
        // Successful registration
        registeredDescriptor = detection.descriptor;
        registeredName = name.toUpperCase();
        isRegistered = true;
        
        // Flash animation
        flashOverlay.classList.add('active');
        setTimeout(() => flashOverlay.classList.remove('active'), 500);

        // Update UI
        registrationPanel.classList.add('hidden');
        checkinPanel.classList.remove('hidden');
        currentUserDisplay.textContent = registeredName;
        statusBadge.textContent = "AI Status: Đang Check-in";
        
        showToast(`Đăng ký thành công: ${registeredName}`);
    } else {
        showToast("Không tìm thấy khuôn mặt. Vui lòng nhìn vào camera.", "error");
        statusBadge.textContent = "AI Status: Models Ready";
    }
});

resetBtn.addEventListener('click', () => {
    isRegistered = false;
    registeredDescriptor = null;
    registeredName = "";
    checkinCount = 0;
    registrationPanel.classList.remove('hidden');
    checkinPanel.classList.add('hidden');
    
    // Clear logs
    logContainer.innerHTML = '<div class="empty-log">Chưa có lượt check-in nào trong phiên này.</div>';
    
    statusBadge.textContent = "AI Status: Models Ready";
    showToast("Đã xóa phiên làm việc. Vui lòng đăng ký lại.");
});

document.getElementById('manual-checkin-btn').addEventListener('click', async () => {
    if (!isRegistered || !registeredDescriptor) return;
    
    statusBadge.textContent = "AI Status: Kiểm tra...";
    const detection = await faceapi.detectSingleFace(video, new faceapi.TinyFaceDetectorOptions())
        .withFaceLandmarks()
        .withFaceDescriptor();

    if (detection) {
        const faceMatcher = new faceapi.FaceMatcher(
            new faceapi.LabeledFaceDescriptors(registeredName, [registeredDescriptor]),
            0.6
        );
        const result = faceMatcher.findBestMatch(detection.descriptor);
        
        if (result.label !== 'unknown') {
            handleCheckin(registeredName, true); // Force bypass cooldown
        } else {
            showToast(`Mặt không khớp (${result.distance.toFixed(2)}). Không phải bạn!`, "error");
        }
    } else {
        showToast("Không nhìn thấy khuôn mặt. Hãy nhìn thẳng vào camera.", "error");
    }
    statusBadge.textContent = "AI Status: Models Ready";
});

function handleCheckin(name, force = false) {
    const now = Date.now();
    if (force || now - lastCheckinTime > CHECKIN_COOLDOWN) {
        lastCheckinTime = now;
        checkinCount++;
        
        // Log entry
        const timeStr = new Date().toLocaleTimeString();
        const logItem = document.createElement('div');
        logItem.className = 'log-item';
        logItem.innerHTML = `
            <span class="log-name">✅ ${name} check-in lần ${checkinCount}</span>
            <span class="log-time">${timeStr}</span>
        `;
        
        // Remove empty state if present
        const empty = logContainer.querySelector('.empty-log');
        if (empty) empty.remove();
        
        logContainer.prepend(logItem);
        showToast(`Check-in thành công: ${name} (Lần ${checkinCount})`);
        
        // Flash overlay for check-in
        flashOverlay.style.background = '#2ecc71';
        flashOverlay.classList.add('active');
        setTimeout(() => {
            flashOverlay.classList.remove('active');
            flashOverlay.style.background = '#fff';
        }, 500);
        
        // Audio feedback (optional, async so it doesn't block)
        try {
            const speech = new SpeechSynthesisUtterance(`${name} đã check in thành công`);
            speech.lang = 'vi-VN';
            window.speechSynthesis.speak(speech);
        } catch(e) {}
    }
}

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
