let isExamActive = false;
let isAuthorizedExit = false;
let currentZoom = 1.0;
let frontStream = null;
let qrStream = null;
let qrScanInterval = null;
let sharedAudioCtx = null;

// --- 1. INISIALISASI & PENGUNCI VOLUME MAKSIMAL ---
function aktifkanAudioContext() {
  try {
    if (!sharedAudioCtx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      sharedAudioCtx = new AudioCtx();
    }
    if (sharedAudioCtx.state === "suspended") {
      sharedAudioCtx.resume();
    }
  } catch (_) {}
}

function paksaVolumeMaksimal() {
  if (isAuthorizedExit) return;

  // 1. Kirim perintah ke background.js untuk mengunci hardware volume Chromebook ke 100%
  try {
    if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage({ action: "LOCK_MAX_VOLUME" }).catch(() => {});
    }
  } catch (_) {}

  // 2. Paksa langsung dari sisi halaman jika API tersedia
  try {
    if (typeof chrome !== "undefined" && chrome.audio) {
      chrome.audio.setMute("OUTPUT", false, () => {});
      chrome.audio.getDevices({ streamTypes: ["OUTPUT"] }, (devices) => {
        if (chrome.runtime.lastError || !devices) return;
        devices.forEach((dev) => {
          if (dev.level !== 100) {
            chrome.audio.setProperties(dev.id, { level: 100 }, () => {});
          }
        });
      });
    }
  } catch (_) {}

  // 3. Kunci seluruh elemen audio/video halaman pada volume 1.0 (100%)
  try {
    document.querySelectorAll("audio, video").forEach((el) => {
      if (el.id !== "frontCameraVideo" && el.id !== "qrScannerVideo") {
        el.muted = false;
        el.volume = 1.0;
      }
    });
  } catch (_) {}
}

// Buka kunci audio pada setiap interaksi klik/sentuhan pertama siswa
document.addEventListener("click", () => {
  aktifkanAudioContext();
  paksaVolumeMaksimal();
}, true);

// Interval pengunci volume setiap 400ms
setInterval(() => {
  if (!isAuthorizedExit) {
    paksaVolumeMaksimal();
  }
}, 400);

// --- 2. GENERATOR ALARM PERINGATAN (VOLUME MAKSIMAL + PENGUAT GAIN) ---
function bunyikanAlarm() {
  aktifkanAudioContext();
  paksaVolumeMaksimal();
  try {
    if (!sharedAudioCtx) return;
    const now = sharedAudioCtx.currentTime;
    const osc = sharedAudioCtx.createOscillator();
    const gain = sharedAudioCtx.createGain();
    const compressor = sharedAudioCtx.createDynamicsCompressor();

    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(920, now);
    osc.frequency.exponentialRampToValueAtTime(480, now + 0.35);
    osc.frequency.exponentialRampToValueAtTime(980, now + 0.7);
    osc.frequency.exponentialRampToValueAtTime(520, now + 1.0);

    // Penguat suara maksimal
    gain.gain.setValueAtTime(3.0, now);
    osc.connect(gain);
    gain.connect(compressor);
    compressor.connect(sharedAudioCtx.destination);

    osc.start(now);
    osc.stop(now + 1.05);
  } catch (e) {
    console.warn("Audio alarm gagal diputar:", e);
  }
}

paksaVolumeMaksimal();

// --- 3. INDIKATOR JAM, BATERAI & JARINGAN ---
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

// --- 4. NAVIGASI MENU UTAMA ---
const modalInputLink = document.getElementById("modalInputLink");
const inputExamUrl = document.getElementById("inputExamUrl");

document.getElementById("btnMenuInputLink").addEventListener("click", () => {
  aktifkanAudioContext();
  paksaVolumeMaksimal();
  inputExamUrl.value = "";
  modalInputLink.classList.remove("hidden");
  inputExamUrl.focus();
});

document.getElementById("btnCancelLink").addEventListener("click", () => {
  inputExamUrl.value = "";
  modalInputLink.classList.add("hidden");
});

document.getElementById("btnSubmitLink").addEventListener("click", () => {
  let url = inputExamUrl.value.trim();
  inputExamUrl.value = "";
  if (!url) return alert("Link ujian tidak boleh kosong!");
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    url = "https://" + url;
  }
  modalInputLink.classList.add("hidden");
  mulaiUjian(url);
});

const modalBantuan = document.getElementById("modalBantuan");
document.getElementById("btnMenuBantuan").addEventListener("click", () => {
  modalBantuan.classList.remove("hidden");
});
document.getElementById("btnCloseBantuan").addEventListener("click", () => {
  modalBantuan.classList.add("hidden");
});

// --- 5. SCAN QR CODE UJIAN ---
const modalScanQr = document.getElementById("modalScanQr");
const qrVideo = document.getElementById("qrScannerVideo");
const qrStatus = document.getElementById("qrStatus");

document.getElementById("btnMenuScanQr").addEventListener("click", async () => {
  aktifkanAudioContext();
  paksaVolumeMaksimal();
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

// --- 6. MEMULAI HALAMAN UJIAN & KAMERA PENGAWAS ---
async function mulaiUjian(url) {
  isExamActive = true;
  aktifkanAudioContext();
  paksaVolumeMaksimal();
  document.getElementById("homeScreen").classList.remove("active");
  document.getElementById("examScreen").classList.add("active");
  document.getElementById("examFrame").src = url;

  paksaLayarPenuhDanDepan();

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

async function paksaLayarPenuhDanDepan() {
  if (isAuthorizedExit) return;
  try {
    window.focus();
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen();
    }
    if (chrome && chrome.windows) {
      chrome.windows.getCurrent((win) => {
        if (win) {
          chrome.windows.update(win.id, { focused: true, state: "fullscreen" });
        }
      });
    }
  } catch (_) {}
}

// --- 7. KONTROL REFRESH, ZOOM & KELUAR (PASSWORD: xyz) ---
document.getElementById("btnRefresh").addEventListener("click", () => {
  paksaVolumeMaksimal();
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

// --- 8. PROTEKSI ANTI KLIK KANAN, ANTI-MUTE/VOLUME DOWN, ANTI-RESIZE & SELALU DI DEPAN ---
document.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  e.stopPropagation();
  return false;
}, true);

document.addEventListener("mousedown", (e) => {
  if (e.button === 2) {
    e.preventDefault();
    e.stopPropagation();
    bunyikanAlarm();
  }
}, true);

document.addEventListener("copy", (e) => e.preventDefault());
document.addEventListener("cut", (e) => e.preventDefault());

document.addEventListener("keydown", (e) => {
  if (!isExamActive || isAuthorizedExit) return;

  if (
    e.key === "AudioVolumeDown" ||
    e.key === "AudioVolumeMute" ||
    e.key === "VolumeDown" ||
    e.key === "VolumeMute" ||
    e.key === "F8" ||
    e.key === "F9" ||
    e.key === "ContextMenu" ||
    e.key === "PrintScreen" ||
    e.key === "Escape" ||
    e.key === "F4" ||
    e.key === "F11" ||
    e.key === "F12" ||
    e.metaKey ||
    e.altKey ||
    (e.ctrlKey && ["c", "v", "x", "u", "s", "p", "n", "t", "w", "r", "-", "+", "="].includes(e.key.toLowerCase()))
  ) {
    e.preventDefault();
    paksaVolumeMaksimal();
    bunyikanAlarm();
  }
});

function tampilkanPelanggaran() {
  if (!isExamActive || isAuthorizedExit) return;
  paksaVolumeMaksimal();
  bunyikanAlarm();
  document.getElementById("violationOverlay").classList.remove("hidden");
  paksaLayarPenuhDanDepan();
}

window.addEventListener("resize", () => {
  if (!isExamActive || isAuthorizedExit) return;
  const isNotFullWidth = window.outerWidth < screen.availWidth - 10;
  const isNotFullHeight = window.outerHeight < screen.availHeight - 10;
  if (isNotFullWidth || isNotFullHeight) {
    tampilkanPelanggaran();
  }
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    tampilkanPelanggaran();
  }
});

window.addEventListener("blur", () => {
  if (!isExamActive || isAuthorizedExit) return;

  setTimeout(() => {
    const activeEl = document.activeElement;
    const examFrame = document.getElementById("examFrame");

    if (activeEl === examFrame || (activeEl && activeEl.tagName === "IFRAME")) {
      return;
    }

    if (!document.hasFocus()) {
      tampilkanPelanggaran();
    }
  }, 150);
});

document.addEventListener("fullscreenchange", () => {
  if (isExamActive && !isAuthorizedExit && !document.fullscreenElement) {
    tampilkanPelanggaran();
  }
});

setInterval(() => {
  if (!isAuthorizedExit && document.visibilityState === "visible") {
    if (!document.fullscreenElement && isExamActive) {
      paksaLayarPenuhDanDepan();
    }
  }
}, 700);

document.getElementById("btnResumeFullscreen").addEventListener("click", async () => {
  document.getElementById("violationOverlay").classList.add("hidden");
  paksaVolumeMaksimal();
  await paksaLayarPenuhDanDepan();
});
