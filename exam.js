let isExamActive = false;
let isAuthorizedExit = false;
let currentZoom = 1.0;
let frontStream = null;
let qrStream = null;
let qrScanInterval = null;

// --- 1. PENGUNCI VOLUME MAKSIMAL (100% & ANTI-MUTE) ---
function paksaVolumeMaksimal() {
  if (isAuthorizedExit) return;

  // A. Kunci Volume Sistem ChromeOS (Aktif pada Mode Kiosk / Managed Chromebook)
  try {
    if (typeof chrome !== "undefined" && chrome.audio) {
      chrome.audio.getDevices({ streamTypes: ["OUTPUT"] }, (devices) => {
        if (chrome.runtime.lastError || !devices) return;
        devices.forEach((dev) => {
          if (dev.isMuted) {
            chrome.audio.setMute("OUTPUT", false, () => {});
          }
          if (dev.level < 100) {
            chrome.audio.setProperties(dev.id, { level: 100 }, () => {});
          }
        });
      });
    }
  } catch (_) {}

  // B. Pastikan seluruh elemen audio/video di halaman tidak di-mute dan volume = 1.0 (100%)
  try {
    document.querySelectorAll("audio, video").forEach((el) => {
      if (el.id !== "frontCameraVideo" && el.id !== "qrScannerVideo") {
        el.muted = false;
        el.volume = 1.0;
      }
    });
  } catch (_) {}
}

// Pantau perubahan volume/mute sistem secara real-time dan kunci kembali ke 100%
try {
  if (typeof chrome !== "undefined" && chrome.audio) {
    chrome.audio.onLevelChanged.addListener(() => {
      if (!isAuthorizedExit) {
        paksaVolumeMaksimal();
        if (isExamActive) bunyikanAlarm();
      }
    });
    chrome.audio.onMuteChanged.addListener((evt) => {
      if (!isAuthorizedExit && evt.isMuted) {
        paksaVolumeMaksimal();
        if (isExamActive) bunyikanAlarm();
      }
    });
  }
} catch (_) {}

// Pengecekan berkala setiap 500ms agar volume selalu terkunci 100%
setInterval(() => {
  if (!isAuthorizedExit) {
    paksaVolumeMaksimal();
  }
}, 500);

// --- 2. GENERATOR ALARM PERINGATAN (VOLUME MAKSIMAL + PENGUAT GAIN) ---
function bunyikanAlarm() {
  paksaVolumeMaksimal();
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const compressor = ctx.createDynamicsCompressor();

    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(920, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(480, ctx.currentTime + 0.35);
    osc.frequency.exponentialRampToValueAtTime(980, ctx.currentTime + 0.7);
    osc.frequency.exponentialRampToValueAtTime(520, ctx.currentTime + 1.0);

    // Penguat suara maksimal dengan limiter agar tetap nyaring dan jelas
    gain.gain.setValueAtTime(3.0, ctx.currentTime);
    osc.connect(gain);
    gain.connect(compressor);
    compressor.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 1.1);
  } catch (e) {
    console.warn("Audio alarm gagal diputar:", e);
  }
}

// Jalankan penguncian volume segera saat halaman dimuat
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

  // Blokir tombol Volume Down, Mute (F8/F9 Chromebook), ContextMenu, Resize & Shortcut sistem
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

// 1. Cegah Resize Layar
window.addEventListener("resize", () => {
  if (!isExamActive || isAuthorizedExit) return;
  const isNotFullWidth = window.outerWidth < screen.availWidth - 10;
  const isNotFullHeight = window.outerHeight < screen.availHeight - 10;
  if (isNotFullWidth || isNotFullHeight) {
    tampilkanPelanggaran();
  }
});

// 2. Deteksi jika tab/jendela disembunyikan atau pindah aplikasi
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    tampilkanPelanggaran();
  }
});

// 3. Deteksi jika window kehilangan fokus (ABAIKAN jika fokus pindah ke dalam iframe soal/login)
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

// 4. Deteksi jika siswa keluar dari mode layar penuh (Fullscreen)
document.addEventListener("fullscreenchange", () => {
  if (isExamActive && !isAuthorizedExit && !document.fullscreenElement) {
    tampilkanPelanggaran();
  }
});

// 5. Penjaga berkala (setiap 700ms) memastikan jendela tetap di depan & fullscreen
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
