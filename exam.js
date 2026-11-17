let isExamActive = false;
let isAuthorizedExit = false;
let currentZoom = 1.0;
let frontStream = null;
let qrStream = null;
let qrScanInterval = null;

// --- 1. GENERATOR ALARM PERINGATAN (WEB AUDIO API) ---
function bunyikanAlarm() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.4);
    osc.frequency.exponentialRampToValueAtTime(920, ctx.currentTime + 0.8);

    gain.gain.setValueAtTime(1.0, ctx.currentTime); // Volume maksimal
    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.9);
  } catch (e) {
    console.warn("Audio alarm gagal diputar:", e);
  }
}

// --- 2. INDIKATOR JAM, BATERAI & JARINGAN ---
function updateClock() {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  document.getElementById("txtClock").textContent = `${hh}:${mm}`;
}
setInterval(updateClock, 1000);
updateClock();

if ("getBattery" in navigator) {
  navigator.getBattery().then((battery) => {
    const updateBat = () => {
      const pct = Math.round(battery.level * 100);
      document.getElementById("txtBattery").textContent = `${pct}%`;
      const svg = document.getElementById("iconBatterySvg");
      svg.setAttribute("fill", pct <= 20 ? "#FF5252" : "#A5D6A7");
    };
    updateBat();
    battery.addEventListener("levelchange", updateBat);
  });
}

function updateNetworkIcon() {
  const online = navigator.onLine;
  document.getElementById("iconNetOnline").style.display = online ? "inline" : "none";
  document.getElementById("iconNetOffline").style.display = online ? "none" : "inline";
}
window.addEventListener("online", updateNetworkIcon);
window.addEventListener("offline", updateNetworkIcon);
updateNetworkIcon();

// --- 3. NAVIGASI MENU UTAMA ---
const modalInputLink = document.getElementById("modalInputLink");
const inputExamUrl = document.getElementById("inputExamUrl");

document.getElementById("btnMenuInputLink").addEventListener("click", () => {
  inputExamUrl.value = ""; // Selalu kosongkan history ketikan
  modalInputLink.classList.remove("hidden");
  inputExamUrl.focus();
});

document.getElementById("btnCancelLink").addEventListener("click", () => {
  inputExamUrl.value = "";
  modalInputLink.classList.add("hidden");
});

document.getElementById("btnSubmitLink").addEventListener("click", () => {
  let url = inputExamUrl.value.trim();
  inputExamUrl.value = ""; // Hapus ketikan
  if (!url) return alert("Link ujian tidak boleh kosong!");
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    url = "https://" + url;
  }
  modalInputLink.classList.add("hidden");
  mulaiUjian(url);
});

// Bantuan
const modalBantuan = document.getElementById("modalBantuan");
document.getElementById("btnMenuBantuan").addEventListener("click", () => {
  modalBantuan.classList.remove("hidden");
});
document.getElementById("btnCloseBantuan").addEventListener("click", () => {
  modalBantuan.classList.add("hidden");
});

// --- 4. SCAN QR CODE UJIAN (MENGGUNAKAN BARCODEDETECTOR CHROMEOS) ---
const modalScanQr = document.getElementById("modalScanQr");
const qrVideo = document.getElementById("qrScannerVideo");
const qrStatus = document.getElementById("qrStatus");

document.getElementById("btnMenuScanQr").addEventListener("click", async () => {
  modalScanQr.classList.remove("hidden");
  qrStatus.textContent = "Membuka kamera Chromebook...";
  try {
    qrStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
    qrVideo.srcObject = qrStream;

    if ("BarcodeDetector" in window) {
      const detector = new BarcodeDetector({ formats: ["qr_code"] });
      qrStatus.textContent = "Arahkan QR Code Ujian ke kamera...";
      qrScanInterval = setInterval(async () => {
        try {
          const barcodes = await detector.detect(qrVideo);
          if (barcodes.length > 0) {
            const scannedUrl = barcodes[0].rawValue.trim();
            hentikanQrScanner();
            modalScanQr.classList.add("hidden");
            mulaiUjian(scannedUrl);
          }
        } catch (_) {}
      }, 400);
    } else {
      qrStatus.textContent = "Browser tidak mendukung QR detector otomatis. Gunakan menu Masukkan Link Ujian.";
    }
  } catch (err) {
    qrStatus.textContent = "Izin kamera ditolak atau kamera tidak tersedia.";
  }
});

function hentikanQrScanner() {
  if (qrScanInterval) clearInterval(qrScanInterval);
  if (qrStream) {
    qrStream.getTracks().forEach((t) => t.stop());
    qrStream = null;
  }
}

document.getElementById("btnCancelQr").addEventListener("click", () => {
  hentikanQrScanner();
  modalScanQr.classList.add("hidden");
});

// --- 5. MEMULAI HALAMAN UJIAN & KAMERA PENGAWAS ---
async function mulaiUjian(url) {
  isExamActive = true;
  document.getElementById("homeScreen").classList.remove("active");
  document.getElementById("examScreen").classList.add("active");
  document.getElementById("examFrame").src = url;

  // Masuk mode layar penuh (Fullscreen)
  try {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen();
    }
  } catch (_) {}

  // Aktifkan Live Kamera Depan Pengawas
  try {
    frontStream = await navigator.mediaDevices.getUserMedia({
      video: { width: 320, height: 240, facingMode: "user" },
      audio: false
    });
    document.getElementById("frontCameraVideo").srcObject = frontStream;
  } catch (e) {
    document.getElementById("cameraWidget").style.display = "none";
  }
}

// --- 6. KONTROL REFRESH, ZOOM & KELUAR (PASSWORD: xyz) ---
document.getElementById("btnRefresh").addEventListener("click", () => {
  const frame = document.getElementById("examFrame");
  frame.src = frame.src;
});

document.getElementById("btnZoomIn").addEventListener("click", () => {
  if (currentZoom < 2.0) {
    currentZoom = +(currentZoom + 0.1).toFixed(1);
    terapkanZoom();
  }
});

document.getElementById("btnZoomOut").addEventListener("click", () => {
  if (currentZoom > 0.6) {
    currentZoom = +(currentZoom - 0.1).toFixed(1);
    terapkanZoom();
  }
});

function terapkanZoom() {
  const frame = document.getElementById("examFrame");
  frame.style.transform = `scale(${currentZoom})`;
  frame.style.width = `${100 / currentZoom}%`;
  frame.style.height = `${100 / currentZoom}%`;
}

const modalExitPassword = document.getElementById("modalExitPassword");
const inputExitPass = document.getElementById("inputExitPass");
const passError = document.getElementById("passError");

document.getElementById("btnExit").addEventListener("click", () => {
  bunyikanAlarm();
  inputExitPass.value = "";
  passError.classList.add("hidden");
  modalExitPassword.classList.remove("hidden");
  inputExitPass.focus();
});

document.getElementById("btnCancelExit").addEventListener("click", () => {
  modalExitPassword.classList.add("hidden");
});

document.getElementById("btnConfirmExit").addEventListener("click", () => {
  if (inputExitPass.value.trim() === "xyz") {
    isAuthorizedExit = true;
    isExamActive = false;
    if (frontStream) frontStream.getTracks().forEach((t) => t.stop());
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    window.close();
  } else {
    bunyikanAlarm();
    passError.classList.remove("hidden");
  }
});

// --- 7. PROTEKSI ANTI-COPY, ANTI-SCREENSHOT & DETEKSI PINDAH JENDELA ---
document.addEventListener("contextmenu", (e) => e.preventDefault());
document.addEventListener("copy", (e) => e.preventDefault());
document.addEventListener("cut", (e) => e.preventDefault());

document.addEventListener("keydown", (e) => {
  if (!isExamActive || isAuthorizedExit) return;

  // Blokir tombol fungsi, PrintScreen, Ctrl+C/V/U/I/N/T/W, Alt, Meta (tombol Search Chromebook)
  if (
    e.key === "PrintScreen" ||
    e.key === "Escape" ||
    e.key === "F11" ||
    e.key === "F12" ||
    e.metaKey ||
    e.altKey ||
    (e.ctrlKey && ["c", "v", "x", "u", "s", "p", "n", "t", "w", "r"].includes(e.key.toLowerCase()))
  ) {
    e.preventDefault();
    bunyikanAlarm();
  }
});

// Deteksi jika siswa keluar fullscreen atau berpindah aplikasi/jendela
window.addEventListener("blur", () => {
  if (isExamActive && !isAuthorizedExit) {
    bunyikanAlarm();
    document.getElementById("violationOverlay").classList.remove("hidden");
  }
});

document.addEventListener("fullscreenchange", () => {
  if (isExamActive && !isAuthorizedExit && !document.fullscreenElement) {
    bunyikanAlarm();
    document.getElementById("violationOverlay").classList.remove("hidden");
  }
});

document.getElementById("btnResumeFullscreen").addEventListener("click", async () => {
  document.getElementById("violationOverlay").classList.add("hidden");
  try {
    await document.documentElement.requestFullscreen();
  } catch (_) {}
});
