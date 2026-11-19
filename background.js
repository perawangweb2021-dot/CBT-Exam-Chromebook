let examWindowId = null;

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

// 2. Buka halaman CBT Exam dalam mode Fullscreen Terkunci (Tanpa Resize)
chrome.action.onClicked.addListener(() => {
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
      }
    }
  );
}

// 3. PAKSA SELALU DI DEPAN: Jika jendela lain mencoba naik ke depan, tarik kembali CBT Exam ke depan
chrome.windows.onFocusChanged.addListener((focusedWindowId) => {
  if (
    examWindowId !== null &&
    focusedWindowId !== chrome.windows.WINDOW_ID_NONE &&
    focusedWindowId !== examWindowId
  ) {
    chrome.windows.update(examWindowId, {
      focused: true,
      state: "fullscreen"
    }).catch(() => {});
  }
});

// 4. CEGAH RESIZE / MINIMIZE: Kembalikan otomatis ke Fullscreen jika ukuran jendela berubah
chrome.windows.onBoundsChanged.addListener((win) => {
  if (examWindowId !== null && win.id === examWindowId && win.state !== "fullscreen") {
    chrome.windows.update(examWindowId, {
      focused: true,
      state: "fullscreen"
    }).catch(() => {});
  }
});

// Reset ID jendela jika ditutup resmi oleh pengawas (password xyz)
chrome.windows.onRemoved.addListener((closedWindowId) => {
  if (closedWindowId === examWindowId) {
    examWindowId = null;
  }
});
