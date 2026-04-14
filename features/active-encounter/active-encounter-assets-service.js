(function initAEEncounterAssetsModule(global) {
  function createService(ctx) {
    const {
      state,
      supabase,
      normalizeMapLayerData,
      render,
      saveEncounter,
      canEditEncounter,
      onBusyChange,
    } = ctx;
    const CHRONICLE_STORAGE_LIMIT_REACHED_MESSAGE =
      "Has alcanzado el límite de almacenamiento de esta Crónica.\nPuedes borrar elementos que ya no utilices para liberar espacio o pasar a un plan superior para aumentar tu límite.";

    async function runWithBusy(message, task) {
      if (typeof onBusyChange === "function") onBusyChange(true, message);
      try {
        return await task();
      } finally {
        if (typeof onBusyChange === "function") onBusyChange(false);
      }
    }

    async function loadDesignAssets(category) {
      if (typeof canEditEncounter === "function" && !canEditEncounter()) {
        state.designAssets = [];
        return [];
      }

      const chronicleId = state.encounter?.chronicle_id || null;
      let data = [];
      let error = null;

      function applyCategory(query) {
        return category ? query.eq("category", category) : query;
      }

      if (chronicleId) {
        const scoped = await applyCategory(
          supabase
            .from("encounter_design_assets")
            .select("*")
            .eq("chronicle_id", chronicleId)
        ).order("created_at", { ascending: false });
        if (scoped.error) {
          error = scoped.error;
        } else {
          data = scoped.data || [];
        }

        if (!error && state.user?.id) {
          const legacy = await applyCategory(
            supabase
              .from("encounter_design_assets")
              .select("*")
              .is("chronicle_id", null)
              .eq("owner_user_id", state.user.id)
          ).order("created_at", { ascending: false });
          if (!legacy.error && Array.isArray(legacy.data) && legacy.data.length) {
            data = [...data, ...legacy.data];
          }
        }

        // System shared assets (no chronicle, shared flag)
        if (!error) {
          const system = await applyCategory(
            supabase
              .from("encounter_design_assets")
              .select("*")
              .is("chronicle_id", null)
              .eq("is_shared", true)
          ).order("created_at", { ascending: false });
          if (!system.error && Array.isArray(system.data) && system.data.length) {
            const existingIds = new Set(data.map((d) => d.id));
            system.data.forEach((item) => {
              if (!existingIds.has(item.id)) data.push(item);
            });
          }
        }
      } else {
        const all = await applyCategory(
          supabase
            .from("encounter_design_assets")
            .select("*")
        ).order("created_at", { ascending: false });
        data = all.data || [];
        error = all.error || null;
      }

      if (error) {
        console.warn("No se pudieron cargar assets de diseno:", error.message);
        state.designAssets = [];
        return [];
      }

      state.designAssets = data || [];
      return state.designAssets;
    }

    function getEncounterAssetPublicUrl(path) {
      if (!path) return "";
      const {
        data: { publicUrl },
      } = supabase.storage.from("encounter-assets").getPublicUrl(path);
      return publicUrl || "";
    }

    function getEncounterBackgroundPublicUrl(path) {
      if (!path) return "";
      const {
        data: { publicUrl },
      } = supabase.storage.from("encounter-backgrounds").getPublicUrl(path);
      return publicUrl || "";
    }

    function parseTagList(rawTags) {
      if (Array.isArray(rawTags)) {
        return [
          ...new Set(rawTags.map((t) => String(t || "").trim()).filter(Boolean)),
        ];
      }

      return [
        ...new Set(
          String(rawTags || "")
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean),
        ),
      ];
    }

    function buildUploadKey(prefix, filename) {
      const cleanName = String(filename || "asset")
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");
      return `${prefix}/${Date.now()}-${cleanName}`;
    }

    async function showStorageLimitReachedModal() {
      const showModal = global.ABNShared?.modal?.showChronicleStorageLimitReached;
      if (typeof showModal === "function") {
        await showModal();
        return;
      }
      alert(CHRONICLE_STORAGE_LIMIT_REACHED_MESSAGE);
    }

    async function ensureChronicleQuota(chronicleId, incomingBytes) {
      if (!chronicleId) {
        return {
          ok: false,
          reason: "missing_chronicle",
          message: "No hay crónica asociada para este upload.",
        };
      }
      const { data, error } = await supabase.rpc("check_chronicle_storage_quota", {
        p_chronicle_id: chronicleId,
        p_incoming_bytes: Number(incomingBytes || 0),
      });
      if (error) {
        return {
          ok: false,
          reason: "quota_check_failed",
          message: `No se pudo validar cuota: ${error.message}`,
        };
      }
      if (data?.error) {
        if (data.error === "not_authorized") {
          return {
            ok: false,
            reason: "not_authorized",
            message: "No tenés permisos en esta crónica para subir archivos.",
          };
        }
        return {
          ok: false,
          reason: "quota_check_failed",
          message: `No se pudo validar cuota (${data.error}).`,
        };
      }
      if (data && data.allowed === false) {
        return {
          ok: false,
          reason: "limit_reached",
          message: CHRONICLE_STORAGE_LIMIT_REACHED_MESSAGE,
        };
      }
      return { ok: true, reason: null, message: "" };
    }

    function readImageDimensions(file) {
      return new Promise((resolve, reject) => {
        const objectUrl = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
          const width = img.naturalWidth || 0;
          const height = img.naturalHeight || 0;
          URL.revokeObjectURL(objectUrl);
          resolve({ width, height });
        };
        img.onerror = () => {
          URL.revokeObjectURL(objectUrl);
          reject(new Error("No se pudo leer el tamaño de la imagen"));
        };
        img.src = objectUrl;
      });
    }

    function readImageDimensionsFromUrl(url) {
      return new Promise((resolve, reject) => {
        if (!url) {
          reject(new Error("URL inválida"));
          return;
        }
        const img = new Image();
        img.crossOrigin = "Anonymous";
        img.onload = () => {
          resolve({
            width: img.naturalWidth || 0,
            height: img.naturalHeight || 0,
          });
        };
        img.onerror = () => reject(new Error("No se pudo leer el asset"));
        img.src = url;
      });
    }

    function getMapCenterGridPosition() {
      if (!state.map || !state.map.canvas) {
        return { x: 0, y: 0 };
      }

      const worldX =
        (-state.map.offsetX + state.map.canvas.width / 2) / state.map.scale;
      const worldY =
        (-state.map.offsetY + state.map.canvas.height / 2) / state.map.scale;

      return {
        x: Math.round(worldX / state.map.gridSize),
        y: Math.round(worldY / state.map.gridSize),
      };
    }

    async function uploadEncounterBackground(file) {
      if (!state.encounter || !file) return false;
      return runWithBusy("Subiendo fondo...", async () => {
        const chronicleId = state.encounter.chronicle_id || null;
        if (!chronicleId) {
          alert("No hay crónica activa para guardar el fondo.");
          return false;
        }
        const quota = await ensureChronicleQuota(chronicleId, file.size);
        if (!quota.ok) {
          if (quota.reason === "limit_reached") {
            await showStorageLimitReachedModal();
            return false;
          }
          alert(quota.message);
          return false;
        }
        const filePath = buildUploadKey(
          `chronicle/${chronicleId}/encounter-backgrounds/${state.encounterId}`,
          file.name,
        );

        let dims = null;
        try {
          dims = await readImageDimensions(file);
        } catch (error) {
          console.warn("No se pudieron obtener dimensiones del fondo:", error);
        }

        const { error: uploadError } = await supabase.storage
          .from("encounter-backgrounds")
          .upload(filePath, file, { upsert: false });

        if (uploadError) {
          alert(`Error subiendo fondo: ${uploadError.message}`);
          return false;
        }

        const currentPath = state.encounter?.data?.map?.backgroundPath;
        if (currentPath) {
          await supabase.storage
            .from("encounter-backgrounds")
            .remove([currentPath]);
        }

        const nextMap = normalizeMapLayerData(state.encounter.data.map);
        nextMap.backgroundPath = filePath;
        nextMap.backgroundUrl = getEncounterBackgroundPublicUrl(filePath);
        nextMap.preserveAspect = true;
        if (dims && dims.width > 0 && dims.height > 0) {
          const gridSize = Math.max(1, state.map?.gridSize || 50);
          nextMap.widthCells = dims.width / gridSize;
          nextMap.heightCells = dims.height / gridSize;
        }
        state.encounter.data.map = nextMap;

        if (typeof render === "function") render();
        if (typeof saveEncounter === "function") await saveEncounter();
        return true;
      });
    }

    async function removeEncounterBackground() {
      if (!state.encounter?.data?.map) return false;
      const currentPath = state.encounter.data.map.backgroundPath;
      if (!currentPath && !state.encounter.data.map.backgroundUrl) return false;

      const ok = await ABNShared.modal.confirm("¿Quitar fondo del encuentro actual?");
      if (!ok) return false;

      if (currentPath) {
        await supabase.storage.from("encounter-backgrounds").remove([currentPath]);
      }

      const nextMap = normalizeMapLayerData(state.encounter.data.map);
      nextMap.backgroundPath = null;
      nextMap.backgroundUrl = "";
      state.encounter.data.map = nextMap;

      if (typeof render === "function") render();
      if (typeof saveEncounter === "function") await saveEncounter();
      return true;
    }

    async function uploadDesignAsset(file, onAfterUpload, options) {
      if (!file || !state.user?.id) return false;
      const chronicleId = state.encounter?.chronicle_id || null;
      if (!chronicleId) {
        alert("No hay crónica activa para guardar este asset.");
        return false;
      }
      const rawName = prompt(
        "Nombre del asset",
        file.name.replace(/\.[a-z0-9]+$/i, ""),
      );
      if (rawName === null) return false;
      const name = rawName.trim() || "Asset";

      const assetCategory = options?.category || "decor";
      const defaultTags = assetCategory === "prop" ? "prop" : "decoracion, mapa";
      const rawTags = prompt("Tags (separados por coma)", defaultTags);
      if (rawTags === null) return false;
      const tags = parseTagList(rawTags);

      return runWithBusy("Subiendo asset...", async () => {
        const quota = await ensureChronicleQuota(chronicleId, file.size);
        if (!quota.ok) {
          if (quota.reason === "limit_reached") {
            await showStorageLimitReachedModal();
            return false;
          }
          alert(quota.message);
          return false;
        }

        const filePath = buildUploadKey(
          `chronicle/${chronicleId}/encounter-assets`,
          file.name,
        );
        const { error: uploadError } = await supabase.storage
          .from("encounter-assets")
          .upload(filePath, file, { upsert: false });

        if (uploadError) {
          alert(`Error subiendo asset: ${uploadError.message}`);
          return false;
        }

        const payload = {
          owner_user_id: state.user.id,
          chronicle_id: chronicleId,
          name,
          image_path: filePath,
          tags,
          is_shared: false,
          category: assetCategory,
        };
        const { error: insertError } = await supabase
          .from("encounter_design_assets")
          .insert(payload);

        if (insertError) {
          alert(`Error guardando asset: ${insertError.message}`);
          return false;
        }

        await loadDesignAssets();
        if (typeof onAfterUpload === "function") onAfterUpload();
        return true;
      });
    }

    async function addDesignTokenFromAsset(assetId) {
      if (!state.encounter?.data || !assetId) return false;
      const asset = state.designAssets.find((item) => item.id === assetId);
      if (!asset) return false;

      const { x, y } = getMapCenterGridPosition();
      const imgUrl = getEncounterAssetPublicUrl(asset.image_path);
      const gridSize = Math.max(1, state.map?.gridSize || 50);
      let widthCells = 1;
      let heightCells = 1;

      try {
        const dims = await readImageDimensionsFromUrl(imgUrl);
        if (dims.width > 0 && dims.height > 0) {
          widthCells = Math.max(0.2, dims.width / gridSize);
          heightCells = Math.max(0.2, dims.height / gridSize);
        }
      } catch (error) {
        console.warn("No se pudieron leer dimensiones del decorado:", error);
      }

      const token = {
        id: `dtoken_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        assetId: asset.id,
        name: asset.name || "Decoracion",
        x,
        y,
        size: 1,
        widthCells,
        heightCells,
        rotationDeg: 0,
        layer: "underlay",
        zIndex: 0,
        opacity: 1,
        tags: Array.isArray(asset.tags) ? asset.tags : [],
        imgUrl,
      };

      state.encounter.data.designTokens = [
        ...(state.encounter.data.designTokens || []),
        token,
      ];

      if (typeof render === "function") render();
      if (typeof saveEncounter === "function") saveEncounter();
      return true;
    }

    async function addPropFromAsset(assetId) {
      if (!state.encounter?.data || !assetId) return false;
      const asset = state.designAssets.find((item) => item.id === assetId);
      if (!asset) return false;

      const { x, y } = getMapCenterGridPosition();
      const imgUrl = getEncounterAssetPublicUrl(asset.image_path);
      // Default: 1 cell wide, maintain aspect ratio from image
      const DEFAULT_WIDTH_CELLS = 1;
      let widthCells = DEFAULT_WIDTH_CELLS;
      let heightCells = DEFAULT_WIDTH_CELLS;

      try {
        const dims = await readImageDimensionsFromUrl(imgUrl);
        if (dims.width > 0 && dims.height > 0) {
          const aspect = dims.height / dims.width;
          widthCells = DEFAULT_WIDTH_CELLS;
          heightCells = Math.max(0.2, DEFAULT_WIDTH_CELLS * aspect);
        }
      } catch (error) {
        console.warn("No se pudieron leer dimensiones del prop:", error);
      }

      const prop = {
        id: `prop_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        assetId: asset.id,
        name: asset.name || "Prop",
        x,
        y,
        widthCells,
        heightCells,
        rotationDeg: 0,
        opacity: 1,
        tags: Array.isArray(asset.tags) ? asset.tags : [],
        imgUrl,
      };

      state.encounter.data.props = [
        ...(state.encounter.data.props || []),
        prop,
      ];

      if (typeof render === "function") render();
      if (typeof saveEncounter === "function") saveEncounter();
      return true;
    }

    return {
      loadDesignAssets,
      getEncounterAssetPublicUrl,
      getEncounterBackgroundPublicUrl,
      uploadEncounterBackground,
      removeEncounterBackground,
      uploadDesignAsset,
      addDesignTokenFromAsset,
      addPropFromAsset,
    };
  }

  global.AEEncounterAssets = { createService };
})(window);
