// Mengatur User-Agent khusus: 10403445@ untuk seluruh request ujian
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

// Buka halaman CBT Exam dalam mode layar penuh (Fullscreen) saat ikon diklik
chrome.action.onClicked.addListener(() => {
  chrome.windows.create({
    url: chrome.runtime.getURL("exam.html"),
    type: "popup",
    state: "fullscreen"
  });
});
