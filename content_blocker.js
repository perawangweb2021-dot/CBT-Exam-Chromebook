// Matikan klik kanan / ketuk 2 jari touchpad di seluruh halaman soal ujian
document.addEventListener("contextmenu", function (e) {
  e.preventDefault();
  e.stopPropagation();
  return false;
}, true);

// Matikan copy, cut, paste, dan drag teks
["copy", "cut", "paste", "selectstart", "dragstart"].forEach(function (evt) {
  document.addEventListener(evt, function (e) {
    e.preventDefault();
    e.stopPropagation();
    return false;
  }, true);
});

// Blokir tombol klik kanan pada mouse (button === 2)
document.addEventListener("mousedown", function (e) {
  if (e.button === 2) {
    e.preventDefault();
    e.stopPropagation();
    return false;
  }
}, true);
