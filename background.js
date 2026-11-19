let examWindowId = null;

// --- PENGUNCI VOLUME SISTEM CHROMEOS (100% & ANTI-MUTE) ---
function kunciVolumeSistem() {
  try {
    if (chrome.audio) {
      // Pastikan output audio tidak dalam kondisi mute
      chrome.audio.setMute("OUTPUT", false, () => {
        if (chrome.runtime.lastError) { /* Abaikan jika bukan sesi kiosk */ }
      });

      // Setel semua speaker/headphone output ke level 100%
      chrome.audio.getDevices({ streamTypes: ["OUTPUT"] }, (devices) => {
        if (chrome.runtime.lastError || !devices) return;
        for (const device of devices) {
          if (device.level !== 100) {
            chrome.audio.setProperties(device.id, { level: 100 }, () => {});
          }
        }
      });
    }
  } catch (_) {}
}

// Dengarkan setiap kali volume diubah atau di-mute oleh siswa, lalu kembalikan ke 100%
if (chrome.audio) {
  chrome.audio.onLevelChanged.addListener(() => {
    if (examWindowId !== null) kunciVolumeSistem();
  });

  chrome.audio.onMuteChanged.addListener((event) => {
    if (examWindowId !== null && event.isMuted) kunciVolumeSistem();
  });

  chrome.audio.onDeviceListChanged.addListener(() => {
    if (examWindowId !== null) kunciVolumeSistem();
  });
}

// 1. Atur User-Agent khusus: 10403445@ untuk seluruh request ujian
chrome.runtime.onInstalled.addListener(() => {
  chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [1],
    addRules: [
      {
        id: 1,
        priority: 1,
        action: {
          type: "modifyHeaders",
          requestHeaders: [
            {
              header: "User-Agent",
              operation: "set",
              value: "10403445@"
            }
          ]
        },
        condition: {
          urlFilter: "*",
          resourceTypes: ["main_frame", "sub_frame", "xmlhttprequest"]
        }
      }
    ]
  });
});

// 2. Buka halaman CBT Exam dalam mode Fullscreen Terkunci
chrome.action.onClicked.addListener(() => {
  kunciVolumeSistem();
  if (examWindowId !== null) {
    chrome.windows.update(examWindowId, { focused: true, state: "fullscreen" }, () => {
      if (chrome.runtime.lastError) {
        buatJendelaUjian();
      }
    });
  } else {
    buatJendelaUjian();
  }
});

function buatJendelaUjian() {
  chrome.windows.create(
    {
      url: chrome.runtime.getURL("exam.html"),
      type: "popup",
      state: "fullscreen",
      focused: true
    },
    (win) => {
      if (win) {
        examWindowId = win.id;
        kunciVolumeSistem();
      }
    }
  );
}

// Terima perintah penguncian volume dari exam.js
chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.action === "LOCK_MAX_VOLUME") {
    kunciVolumeSistem();
  }
});

// 3. PAKSA SELALU DI DEPAN
chrome.windows.onFocusChanged.addListener((focusedWindowId) => {
  if (
    examWindowId !== null &&
    focusedWindowId !== chrome.windows.WINDOW_ID_NONE &&
    focusedWindowId !== examWindowId
  ) {
    kunciVolumeSistem();
    chrome.windows.update(examWindowId, {
      focused: true,
      state: "fullscreen"
    }).catch(() => {});
  }
});

// 4. CEGAH RESIZE / MINIMIZE
chrome.windows.onBoundsChanged.addListener((win) => {
  if (examWindowId !== null && win.id === examWindowId && win.state !== "fullscreen") {
    chrome.windows.update(examWindowId, {
      focused: true,
      state: "fullscreen"
    }).catch(() => {});
  }
});

chrome.windows.onRemoved.addListener((closedWindowId) => {
  if (closedWindowId === examWindowId) {
    examWindowId = null;
  }
});
