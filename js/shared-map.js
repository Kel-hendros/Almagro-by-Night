(function initABNSharedMap(global) {
  const ns = (global.ABNSharedMap = global.ABNSharedMap || {});
  const LIGHT_THEME_NAMES = new Set(["light", "camarilla"]);
  const MAP_STYLE_LIGHT =
    "https://api.maptiler.com/maps/basic-v2/style.json?key=3BYctVRw6IwXUy2XDK2b";
  const MAP_STYLE_DARK =
    "https://api.maptiler.com/maps/streets-v2-dark/style.json?key=3BYctVRw6IwXUy2XDK2b";

  function getCurrentThemeName() {
    return (
      String(document.documentElement.getAttribute("data-app-theme") || "dark").toLowerCase()
    );
  }

  function getThemeMapMode(themeName) {
    const normalized = String(themeName || "").toLowerCase();
    return LIGHT_THEME_NAMES.has(normalized) ? "light" : "dark";
  }

  function getStyleUrlForTheme(themeName) {
    return getThemeMapMode(themeName) === "light" ? MAP_STYLE_LIGHT : MAP_STYLE_DARK;
  }

  function buildZoneGeometryMap(dataset) {
    if (!dataset?.features) return {};
    const map = {};
    dataset.features.forEach((feat) => {
      if (feat?.properties?.type !== "zone" || !feat.geometry) return;
      map[feat.properties.feature_id] = feat.geometry;
    });
    return map;
  }

  function buildLocationZoneMap(dataset) {
    if (!dataset?.features) return {};
    const map = {};
    dataset.features.forEach((feat) => {
      if (feat?.properties?.type !== "location") return;
      const locId = feat.properties.feature_id;
      const zoneId = feat.properties.zone_id || feat.properties.zoneId;
      if (locId && zoneId) {
        map[locId] = zoneId;
      }
    });
    return map;
  }

  function polygonCentroid(coords) {
    if (!coords?.length) return null;
    const ring = coords[0];
    let area = 0;
    let cx = 0;
    let cy = 0;
    for (let i = 0; i < ring.length - 1; i += 1) {
      const [x0, y0] = ring[i];
      const [x1, y1] = ring[i + 1];
      const f = x0 * y1 - x1 * y0;
      area += f;
      cx += (x0 + x1) * f;
      cy += (y0 + y1) * f;
    }
    area *= 0.5;
    if (area === 0) {
      const [x, y] = ring[0] || [0, 0];
      return { lng: x, lat: y };
    }
    cx /= 6 * area;
    cy /= 6 * area;
    return { lng: cx, lat: cy };
  }

  function geometryCentroid(geometry) {
    if (!geometry) return null;
    if (geometry.type === "Polygon") {
      return polygonCentroid(geometry.coordinates);
    }
    if (geometry.type === "MultiPolygon") {
      let best = null;
      let maxArea = -Infinity;
      (geometry.coordinates || []).forEach((poly) => {
        const ring = poly?.[0];
        if (!ring) return;
        let area = 0;
        for (let i = 0; i < ring.length - 1; i += 1) {
          const [x0, y0] = ring[i];
          const [x1, y1] = ring[i + 1];
          area += x0 * y1 - x1 * y0;
        }
        const centroid = polygonCentroid(poly);
        if (!centroid) return;
        const absArea = Math.abs(area);
        if (absArea > maxArea) {
          maxArea = absArea;
          best = centroid;
        }
      });
      return best;
    }
    if (geometry.type === "Point") {
      const [lng, lat] = geometry.coordinates;
      return { lng, lat };
    }
    return null;
  }

  async function fetchGeoJson(url, options = {}) {
    const cacheBust = options.cacheBust !== false;
    const resolvedUrl = cacheBust
      ? url.includes("?")
        ? `${url}&_ts=${Date.now()}`
        : `${url}?_ts=${Date.now()}`
      : url;
    const response = await fetch(resolvedUrl, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`No se pudo cargar el mapa (${response.status})`);
    }
    return response.json();
  }

  function createMap(options = {}) {
    const {
      container,
      center = [-58.3816, -34.6037],
      zoom = 11,
      styleUrl = getStyleUrlForTheme(getCurrentThemeName()),
    } = options;

    return new maplibregl.Map({
      container,
      style: styleUrl,
      center,
      zoom,
    });
  }

  function ensureGeoJsonSource(map, sourceId, data) {
    if (!map.getSource(sourceId)) {
      map.addSource(sourceId, {
        type: "geojson",
        data: data || { type: "FeatureCollection", features: [] },
      });
      return map.getSource(sourceId);
    }
    if (data) {
      map.getSource(sourceId).setData(data);
    }
    return map.getSource(sourceId);
  }

  function addDatasetLayers(map, options = {}) {
    const sourceId = options.sourceId || "zones";
    const data = options.data || { type: "FeatureCollection", features: [] };
    const zoneFillId = options.zoneFillId || `${sourceId}-zones-fill`;
    const zoneOutlineId = options.zoneOutlineId || `${sourceId}-zones-outline`;
    const locationCircleId = options.locationCircleId || `${sourceId}-locations-circle`;
    const zoneHighlightId = options.zoneHighlightId || `${sourceId}-zones-highlight`;
    const locationHighlightId =
      options.locationHighlightId || `${sourceId}-locations-highlight`;

    ensureGeoJsonSource(map, sourceId, data);

    if (!map.getLayer(zoneFillId)) {
      map.addLayer({
        id: zoneFillId,
        type: "fill",
        source: sourceId,
        filter: ["==", ["get", "type"], "zone"],
        paint: {
          "fill-color": options.zoneFillColor || "#929292",
          "fill-opacity": options.zoneFillOpacity ?? 0.5,
        },
      });
    }

    if (!map.getLayer(zoneOutlineId)) {
      map.addLayer({
        id: zoneOutlineId,
        type: "line",
        source: sourceId,
        filter: ["==", ["get", "type"], "zone"],
        paint: {
          "line-color": options.zoneOutlineColor || "#000000",
          "line-width": options.zoneOutlineWidth ?? 2,
        },
      });
    }

    if (!map.getLayer(locationCircleId)) {
      map.addLayer({
        id: locationCircleId,
        type: "circle",
        source: sourceId,
        filter: ["==", ["get", "type"], "location"],
        paint: {
          "circle-radius": options.locationRadius ?? 6,
          "circle-color": options.locationFillColor || "#d6c5b4",
          "circle-stroke-color": options.locationStrokeColor || "#3a2921",
          "circle-stroke-width": options.locationStrokeWidth ?? 2,
        },
      });
    }

    if (!map.getLayer(zoneHighlightId)) {
      map.addLayer({
        id: zoneHighlightId,
        type: "line",
        source: sourceId,
        filter: ["==", ["get", "feature_id"], ""],
        paint: {
          "line-color": options.highlightLineColor || "#FFFFFF",
          "line-width": options.highlightLineWidth ?? 4,
        },
      });
    }

    if (!map.getLayer(locationHighlightId)) {
      map.addLayer({
        id: locationHighlightId,
        type: "circle",
        source: sourceId,
        filter: ["==", ["get", "feature_id"], ""],
        paint: {
          "circle-radius": options.highlightCircleRadius ?? 10,
          "circle-color": options.highlightCircleColor || "#000000",
          "circle-opacity": options.highlightCircleOpacity ?? 1,
        },
      });
    }

    return {
      sourceId,
      zoneFillId,
      zoneOutlineId,
      locationCircleId,
      zoneHighlightId,
      locationHighlightId,
    };
  }

  function setGeoJsonData(map, sourceId, data) {
    const source = map?.getSource?.(sourceId);
    if (source?.setData) {
      source.setData(data);
    }
  }

  function highlightFeature(map, options = {}) {
    if (!map) return;
    const {
      type,
      id,
      zoneHighlightId = "zones-highlight",
      locationHighlightId = "locations-highlight",
    } = options;

    if (type === "zone") {
      map.setFilter(zoneHighlightId, ["==", ["get", "feature_id"], id || ""]);
      map.setFilter(locationHighlightId, ["==", ["get", "feature_id"], ""]);
      return;
    }

    if (type === "location") {
      map.setFilter(locationHighlightId, ["==", ["get", "feature_id"], id || ""]);
      map.setFilter(zoneHighlightId, ["==", ["get", "feature_id"], ""]);
      return;
    }

    map.setFilter(zoneHighlightId, ["==", ["get", "feature_id"], ""]);
    map.setFilter(locationHighlightId, ["==", ["get", "feature_id"], ""]);
  }

  function fitMapToGeoJson(map, data, options = {}) {
    if (!map || !data?.features?.length || !maplibregl?.LngLatBounds) return false;
    const bounds = new maplibregl.LngLatBounds();
    let hasPoints = false;

    function extendCoords(coords) {
      if (!Array.isArray(coords)) return;
      if (typeof coords[0] === "number" && typeof coords[1] === "number") {
        bounds.extend(coords);
        hasPoints = true;
        return;
      }
      coords.forEach(extendCoords);
    }

    data.features.forEach((feature) => {
      extendCoords(feature?.geometry?.coordinates);
    });

    if (!hasPoints) return false;

    map.fitBounds(bounds, {
      padding: options.padding ?? 40,
      maxZoom: options.maxZoom ?? 13,
      duration: options.duration ?? 0,
    });
    return true;
  }

  function bindThemeSync(map, options = {}) {
    if (!map || typeof window === "undefined") {
      return function noop() {};
    }

    const onStyleReload =
      typeof options.onStyleReload === "function" ? options.onStyleReload : function noop() {};
    let currentMode = getThemeMapMode(getCurrentThemeName());

    function handleThemeChange(event) {
      const nextTheme = event?.detail?.theme || getCurrentThemeName();
      const nextMode = getThemeMapMode(nextTheme);
      if (nextMode === currentMode) return;
      currentMode = nextMode;

      const center = map.getCenter?.();
      const zoom = map.getZoom?.();
      const bearing = map.getBearing?.();
      const pitch = map.getPitch?.();

      map.once("style.load", () => {
        if (center && Number.isFinite(center.lng) && Number.isFinite(center.lat)) {
          map.jumpTo({
            center: [center.lng, center.lat],
            zoom,
            bearing,
            pitch,
          });
        }
        onStyleReload();
      });

      map.setStyle(getStyleUrlForTheme(nextTheme));
    }

    window.addEventListener("abn-theme-font-changed", handleThemeChange);

    return function cleanup() {
      window.removeEventListener("abn-theme-font-changed", handleThemeChange);
    };
  }

  ns.buildZoneGeometryMap = buildZoneGeometryMap;
  ns.buildLocationZoneMap = buildLocationZoneMap;
  ns.geometryCentroid = geometryCentroid;
  ns.getCurrentThemeName = getCurrentThemeName;
  ns.getThemeMapMode = getThemeMapMode;
  ns.getStyleUrlForTheme = getStyleUrlForTheme;
  ns.fetchGeoJson = fetchGeoJson;
  ns.createMap = createMap;
  ns.ensureGeoJsonSource = ensureGeoJsonSource;
  ns.addDatasetLayers = addDatasetLayers;
  ns.setGeoJsonData = setGeoJsonData;
  ns.highlightFeature = highlightFeature;
  ns.fitMapToGeoJson = fitMapToGeoJson;
  ns.bindThemeSync = bindThemeSync;
})(window);
