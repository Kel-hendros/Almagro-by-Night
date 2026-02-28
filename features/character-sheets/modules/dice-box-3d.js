(function initABNSheetDiceBox3D(global) {
  const CDN_PKG =
    "https://cdn.jsdelivr.net/npm/@3d-dice/dice-box@1.1.4/dist/";
  const CDN_URL = CDN_PKG + "dice-box.es.min.js";
  const CDN_ASSETS = CDN_PKG + "assets/";

  let enabled = false;
  let diceBox = null;
  let loading = false;
  let container = null;

  function isEnabled() {
    return enabled;
  }

  function setEnabled(val) {
    enabled = !!val;
  }

  function ensureContainer() {
    if (container) return container;
    container = document.createElement("div");
    container.id = "dice-box-3d-container";
    document.body.appendChild(container);
    return container;
  }

  async function loadDiceBox() {
    if (diceBox) return diceBox;
    if (loading) {
      return new Promise((resolve) => {
        const check = setInterval(() => {
          if (diceBox) {
            clearInterval(check);
            resolve(diceBox);
          }
        }, 100);
      });
    }

    loading = true;
    try {
      ensureContainer();
      const mod = await import(CDN_URL);
      const DiceBox = mod.default || mod.DiceBox;
      diceBox = new DiceBox({
        container: "#dice-box-3d-container",
        assetPath: CDN_ASSETS,
        origin: "",
        themeColor: "#C62828",
        scale: 4,
        settleTimeout: 5000,
        gravity: 2,
        startingHeight: 12,
        spinForce: 6,
        throwForce: 5,
        lightIntensity: 1,
      });
      await diceBox.init();
      loading = false;
      return diceBox;
    } catch (e) {
      console.error("[DiceBox3D] Failed to load:", e);
      loading = false;
      diceBox = null;
      return null;
    }
  }

  async function rollD10s(count) {
    if (!enabled || count <= 0) return null;
    try {
      const box = await loadDiceBox();
      if (!box) return null;

      ensureContainer();
      container.classList.add("dice-box-3d-active");

      const result = await box.roll(`${count}d10`);

      setTimeout(() => {
        box.clear();
        container.classList.remove("dice-box-3d-active");
      }, 1500);

      // Read values from 3D dice result.
      // d10 in dice-box returns 0-9; convert 0 → 10 for VtM (1-10).
      if (Array.isArray(result) && result.length === count) {
        const values = result.map((r) => {
          const v = r?.value;
          if (typeof v === "number" && v >= 0 && v <= 10) return v === 0 ? 10 : v;
          return null;
        });
        if (values.every((v) => v !== null)) return values;
      }

      return null;
    } catch (e) {
      console.error("[DiceBox3D] Roll failed:", e);
      if (container) container.classList.remove("dice-box-3d-active");
      return null;
    }
  }

  function loadFromCharacterData(data) {
    if (data && typeof data.diceBox3dEnabled === "boolean") {
      enabled = data.diceBox3dEnabled;
    } else {
      enabled = false;
    }
    const toggle = document.getElementById("dice-box-3d-toggle");
    if (toggle) toggle.checked = enabled;
  }

  function getSettingForSave() {
    return enabled;
  }

  global.ABNSheetDiceBox3D = {
    isEnabled,
    setEnabled,
    rollD10s,
    loadFromCharacterData,
    getSettingForSave,
  };
})(window);
