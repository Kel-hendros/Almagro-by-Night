// js/shared-picker.js

(function () {
  console.log("Shared Picker: Initializing...");

  let picker = null;
  let pickerOverlay = null;
  let currentCallback = null;

  function initPicker() {
    if (document.getElementById("ae-picker")) {
      // Re-bind if existing
      picker = document.getElementById("ae-picker");
      pickerOverlay = document.querySelector(".ae-stat-picker-overlay");
      return;
    }

    // Create Overlay
    pickerOverlay = document.createElement("div");
    pickerOverlay.className = "ae-stat-picker-overlay";
    // Force high z-index via JS as backup, though CSS handles it
    pickerOverlay.style.zIndex = "20000";
    document.body.appendChild(pickerOverlay);

    // Create Picker
    picker = document.createElement("div");
    picker.id = "ae-picker";
    picker.className = "ae-stat-picker";
    picker.style.zIndex = "20001";
    document.body.appendChild(picker);

    // Populate 0-10
    for (let i = 0; i <= 10; i++) {
      const btn = document.createElement("button");
      btn.className = "ae-picker-btn";
      btn.textContent = i;
      btn.addEventListener("click", () => {
        if (currentCallback) currentCallback(i);
        closePicker();
      });
      picker.appendChild(btn);
    }

    // Close events
    pickerOverlay.addEventListener("click", closePicker);
  }

  function openPicker(targetEl, currentVal, callback) {
    if (!picker) initPicker();

    currentCallback = callback;
    pickerOverlay.style.display = "block";
    picker.style.display = "grid"; // Grid for keypad

    // Position logic
    const rect = targetEl.getBoundingClientRect();
    let top = rect.bottom + 5;
    let left = rect.left;

    // Boundary checks
    // Approx dimensions: width 140, height 220
    if (left + 160 > window.innerWidth) left = window.innerWidth - 170;
    if (top + 230 > window.innerHeight) top = rect.top - 240; // Flip up

    picker.style.top = `${top}px`;
    picker.style.left = `${left}px`;

    // Highlight current
    const btns = picker.querySelectorAll(".ae-picker-btn");
    btns.forEach((b) => {
      if (parseInt(b.textContent) === currentVal) b.classList.add("active");
      else b.classList.remove("active");
    });
  }

  function closePicker() {
    if (pickerOverlay) pickerOverlay.style.display = "none";
    if (picker) picker.style.display = "none";
    currentCallback = null;
  }

  // Expose globally
  window.AE_Picker = {
    open: openPicker,
    close: closePicker,
    init: initPicker,
  };

  // Auto-init helps ensure elements exist early
  // initPicker();
})();
