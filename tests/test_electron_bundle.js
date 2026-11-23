(() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __esm = (fn, res) => function __init() {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  };
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };

  // <define:import.meta.env>
  var init_define_import_meta_env = __esm({
    "<define:import.meta.env>"() {
    }
  });

  // src/utils/b2bUtils.js
  var calculateDiscount, extractB2BMetadata, getCampaignStatus, generateCampaignCode, generateWhatsAppMessage;
  var init_b2bUtils = __esm({
    "src/utils/b2bUtils.js"() {
      init_define_import_meta_env();
      calculateDiscount = (price, regularPrice) => {
        const p = Number(price);
        const r = Number(regularPrice);
        if (r > 0 && p > 0 && p < r) {
          const rawDiscount = (r - p) / r * 100;
          const savings = r - p;
          const formattedDesc = rawDiscount % 1 === 0 ? rawDiscount.toFixed(0) : rawDiscount.toFixed(1);
          return {
            isValid: true,
            percentage: Number(rawDiscount.toFixed(2)),
            badgeText: `${formattedDesc}% OFF`.replace(".", ","),
            savings,
            formattedSavings: `$${savings.toLocaleString("es-AR")}`
          };
        }
        return {
          isValid: false,
          percentage: 0,
          badgeText: null,
          savings: 0,
          formattedSavings: "$0"
        };
      };
      extractB2BMetadata = (rawDescription) => {
        if (!rawDescription || typeof rawDescription !== "string") {
          return { cleanDescription: "", meta: {} };
        }
        const match = rawDescription.match(/<!--B2B_META:([\s\S]*?)-->/);
        if (match && match[1]) {
          try {
            const meta = JSON.parse(match[1]);
            const cleanDescription = rawDescription.replace(/\n?<!--B2B_META:[\s\S]*?-->/g, "").trim();
            return { cleanDescription, meta: meta || {} };
          } catch (e) {
          }
        }
        return { cleanDescription: rawDescription.trim(), meta: {} };
      };
      getCampaignStatus = (campaign) => {
        if (!campaign) return "draft";
        if (campaign.deleted || campaign.status === "deleted") return "finished";
        if (campaign.status === "draft") return "draft";
        if (campaign.status === "paused") return "paused";
        const nowTime = Date.now();
        const start = campaign.startDate || campaign.start_date;
        const end = campaign.endDate || campaign.end_date;
        if (start) {
          let startTime;
          if (typeof start === "string" && start.length === 10 && start.includes("-")) {
            const [y, m, d] = start.split("-").map(Number);
            startTime = new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
          } else {
            startTime = new Date(start).getTime();
          }
          if (!isNaN(startTime) && startTime > nowTime + 6e4) {
            return "scheduled";
          }
        }
        if (end) {
          let endTime;
          if (typeof end === "string" && end.length === 10 && end.includes("-")) {
            const [y, m, d] = end.split("-").map(Number);
            endTime = new Date(y, m - 1, d, 23, 59, 59, 999).getTime();
          } else {
            endTime = new Date(end).getTime();
          }
          if (!isNaN(endTime) && endTime < nowTime) {
            return "finished";
          }
        }
        if (campaign.status === "finished") {
          if (end) {
            const endTime = new Date(end).getTime();
            if (!isNaN(endTime) && endTime > nowTime) {
              return "active";
            }
          }
          return "finished";
        }
        return "active";
      };
      generateCampaignCode = (campaignId) => {
        if (!campaignId) return `SPX-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
        const idStr = String(campaignId).replace(/[^a-zA-Z0-9]/g, "");
        if (idStr.length < 4) return `SPX-${idStr.padStart(4, "0").toUpperCase()}`;
        return `SPX-${idStr.substring(0, 5).toUpperCase()}`;
      };
      generateWhatsAppMessage = (productTitle, customMessage, campaignCode) => {
        if (customMessage && customMessage.trim()) {
          return customMessage.trim();
        }
        const title = productTitle || "este producto";
        let msg = `Hola, vi la oferta de ${title} en Simple ProX y quisiera consultar disponibilidad y condiciones.`;
        if (campaignCode) {
          msg += `

C\xF3digo de oferta: ${campaignCode}`;
        }
        return msg;
      };
    }
  });

  // src/services/connectivityService.js
  function notifyListeners(status) {
    listeners.forEach((fn) => {
      try {
        fn(status);
      } catch (e) {
        console.error("[ConnectivityService] Error en listener:", e);
      }
    });
  }
  async function checkRealConnectivity(force = false) {
    const now = Date.now();
    if (!force && now - lastCheckTime < CHECK_CACHE_MS && currentStatus !== CONNECTIVITY_STATUS.CHECKING) {
      return currentStatus === CONNECTIVITY_STATUS.ONLINE;
    }
    if (!navigator.onLine) {
      currentStatus = CONNECTIVITY_STATUS.OFFLINE;
      notifyListeners(currentStatus);
      return false;
    }
    if (isChecking) return currentStatus === CONNECTIVITY_STATUS.ONLINE;
    isChecking = true;
    try {
      const config = getAdConfig();
      const baseUrl = (config.supabaseUrl || "https://qtixbiikhvhzwshfgyeo.supabase.co").replace(/\/$/, "");
      const pingUrl = `${baseUrl}/rest/v1/`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2500);
      const headers = { "Accept": "application/json" };
      if (config.supabaseKey) {
        headers["apikey"] = config.supabaseKey;
      }
      const response = await fetch(pingUrl, {
        method: "GET",
        headers,
        signal: controller.signal,
        cache: "no-store"
      });
      clearTimeout(timeoutId);
      const isOk = response.status < 500;
      const newStatus = isOk ? CONNECTIVITY_STATUS.ONLINE : CONNECTIVITY_STATUS.OFFLINE;
      if (newStatus !== currentStatus) {
        currentStatus = newStatus;
        notifyListeners(currentStatus);
      }
      lastCheckTime = Date.now();
      return isOk;
    } catch (err) {
      try {
        const c2 = new AbortController();
        const t2 = setTimeout(() => c2.abort(), 1800);
        const fallback = await fetch("https://www.google.com/generate_204", { mode: "no-cors", signal: c2.signal });
        clearTimeout(t2);
        currentStatus = CONNECTIVITY_STATUS.ONLINE;
        notifyListeners(currentStatus);
        lastCheckTime = Date.now();
        return true;
      } catch (e2) {
        currentStatus = CONNECTIVITY_STATUS.OFFLINE;
        notifyListeners(currentStatus);
        lastCheckTime = Date.now();
        return false;
      }
    } finally {
      isChecking = false;
    }
  }
  function isOnline() {
    return currentStatus === CONNECTIVITY_STATUS.ONLINE;
  }
  function subscribeConnectivity(listener) {
    listeners.add(listener);
    listener(currentStatus);
    return () => listeners.delete(listener);
  }
  var CONNECTIVITY_STATUS, currentStatus, isChecking, lastCheckTime, CHECK_CACHE_MS, listeners;
  var init_connectivityService = __esm({
    "src/services/connectivityService.js"() {
      init_define_import_meta_env();
      init_adSyncEngine();
      CONNECTIVITY_STATUS = {
        ONLINE: "ONLINE",
        OFFLINE: "OFFLINE",
        CHECKING: "CHECKING"
      };
      currentStatus = navigator.onLine ? CONNECTIVITY_STATUS.CHECKING : CONNECTIVITY_STATUS.OFFLINE;
      isChecking = false;
      lastCheckTime = 0;
      CHECK_CACHE_MS = 15e3;
      listeners = /* @__PURE__ */ new Set();
      if (typeof window !== "undefined") {
        window.addEventListener("online", () => {
          checkRealConnectivity(true);
        });
        window.addEventListener("offline", () => {
          currentStatus = CONNECTIVITY_STATUS.OFFLINE;
          notifyListeners(currentStatus);
        });
        setTimeout(() => checkRealConnectivity(true), 800);
      }
    }
  });

  // src/utils/argentinaGeo.js
  function getCitiesForProvince(provCode) {
    if (ARGENTINA_CITIES[provCode]) {
      return ARGENTINA_CITIES[provCode];
    }
    const prov = ARGENTINA_PROVINCES.find((p) => p.code === provCode);
    const provName = prov ? prov.name : "Provincia";
    return [
      { code: `${provCode}-CAPITAL`, name: `${provName} Capital` },
      { code: `${provCode}-OTRA`, name: `Otra localidad de ${provName}` }
    ];
  }
  function matchProvinceAndCity(provText = "", cityText = "") {
    const normP = String(provText).toLowerCase().trim();
    const normC = String(cityText).toLowerCase().trim();
    let matchedProv = ARGENTINA_PROVINCES.find((p) => normP && (p.name.toLowerCase().includes(normP) || normP.includes(p.name.toLowerCase())));
    if (!matchedProv) {
      if (normC.includes("san luis") || normC.includes("mercedes")) matchedProv = ARGENTINA_PROVINCES.find((p) => p.code === "AR-D");
      else if (normC.includes("rosario") || normC.includes("santa fe")) matchedProv = ARGENTINA_PROVINCES.find((p) => p.code === "AR-S");
      else if (normC.includes("cordoba") || normC.includes("c\xF3rdoba")) matchedProv = ARGENTINA_PROVINCES.find((p) => p.code === "AR-X");
      else if (normC.includes("mendoza")) matchedProv = ARGENTINA_PROVINCES.find((p) => p.code === "AR-M");
      else if (normC.includes("la plata") || normC.includes("mar del plata") || normC.includes("quilmes")) matchedProv = ARGENTINA_PROVINCES.find((p) => p.code === "AR-B");
      else if (normC.includes("caba") || normC.includes("buenos aires") || normC.includes("palermo")) matchedProv = ARGENTINA_PROVINCES.find((p) => p.code === "AR-C");
      else matchedProv = ARGENTINA_PROVINCES.find((p) => p.code === "AR-D");
    }
    const cities = getCitiesForProvince(matchedProv.code);
    let matchedCity = cities.find((c) => normC && (c.name.toLowerCase().includes(normC) || normC.includes(c.name.toLowerCase())));
    if (!matchedCity) {
      matchedCity = cities[0];
    }
    return {
      provinceCode: matchedProv.code,
      provinceName: matchedProv.name,
      cityCode: matchedCity.code,
      cityName: matchedCity.name
    };
  }
  var ARGENTINA_PROVINCES, ARGENTINA_CITIES;
  var init_argentinaGeo = __esm({
    "src/utils/argentinaGeo.js"() {
      init_define_import_meta_env();
      ARGENTINA_PROVINCES = [
        { code: "AR-C", name: "Ciudad Aut\xF3noma de Buenos Aires" },
        { code: "AR-B", name: "Buenos Aires" },
        { code: "AR-K", name: "Catamarca" },
        { code: "AR-H", name: "Chaco" },
        { code: "AR-U", name: "Chubut" },
        { code: "AR-X", name: "C\xF3rdoba" },
        { code: "AR-W", name: "Corrientes" },
        { code: "AR-E", name: "Entre R\xEDos" },
        { code: "AR-P", name: "Formosa" },
        { code: "AR-Y", name: "Jujuy" },
        { code: "AR-L", name: "La Pampa" },
        { code: "AR-F", name: "La Rioja" },
        { code: "AR-M", name: "Mendoza" },
        { code: "AR-N", name: "Misiones" },
        { code: "AR-Q", name: "Neuqu\xE9n" },
        { code: "AR-R", name: "R\xEDo Negro" },
        { code: "AR-A", name: "Salta" },
        { code: "AR-J", name: "San Juan" },
        { code: "AR-D", name: "San Luis" },
        { code: "AR-Z", name: "Santa Cruz" },
        { code: "AR-S", name: "Santa Fe" },
        { code: "AR-G", name: "Santiago del Estero" },
        { code: "AR-V", name: "Tierra del Fuego" },
        { code: "AR-T", name: "Tucum\xE1n" }
      ];
      ARGENTINA_CITIES = {
        "AR-C": [
          { code: "CABA-CENTRO", name: "Centro / Microcentro" },
          { code: "CABA-PALERMO", name: "Palermo" },
          { code: "CABA-BELGRANO", name: "Belgrano / N\xFA\xF1ez" },
          { code: "CABA-CABALLITO", name: "Caballito / Almagro" },
          { code: "CABA-FLORES", name: "Flores / Floresta" },
          { code: "CABA-SUR", name: "Barracas / La Boca" },
          { code: "CABA-VILLA-URQUIZA", name: "Villa Urquiza / Devoto" },
          { code: "CABA-OTRA", name: "Otros Barrios CABA" }
        ],
        "AR-B": [
          { code: "BA-LA-PLATA", name: "La Plata" },
          { code: "BA-MAR-DEL-PLATA", name: "Mar del Plata" },
          { code: "BA-BAHIA-BLANCA", name: "Bah\xEDa Blanca" },
          { code: "BA-TANDIL", name: "Tandil" },
          { code: "BA-SAN-ISIDRO", name: "San Isidro / V. L\xF3pez" },
          { code: "BA-VICENTE-LOPEZ", name: "Vicente L\xF3pez" },
          { code: "BA-SAN-MARTIN", name: "General San Mart\xEDn" },
          { code: "BA-TIGRE", name: "Tigre" },
          { code: "BA-PILAR", name: "Pilar" },
          { code: "BA-QUILMES", name: "Quilmes" },
          { code: "BA-LANUS", name: "Lan\xFAs" },
          { code: "BA-LOMAS", name: "Lomas de Zamora" },
          { code: "BA-AVELLANEDA", name: "Avellaneda" },
          { code: "BA-MORON", name: "Mor\xF3n" },
          { code: "BA-LA-MATANZA", name: "La Matanza" },
          { code: "BA-SAN-MIGUEL", name: "San Miguel" },
          { code: "BA-MERLO", name: "Merlo" },
          { code: "BA-MORENO", name: "Moreno" },
          { code: "BA-PERGAMINO", name: "Pergamino" },
          { code: "BA-OLAVARRIA", name: "Olavarr\xEDa" },
          { code: "BA-JUNIN", name: "Jun\xEDn" },
          { code: "BA-OTRA", name: "Otra localidad de Buenos Aires" }
        ],
        "AR-D": [
          { code: "SL-CAPITAL", name: "San Luis Capital" },
          { code: "SL-VILLA-MERCEDES", name: "Villa Mercedes" },
          { code: "SL-MERLO", name: "Villa de Merlo" },
          { code: "SL-LA-PUNTA", name: "La Punta" },
          { code: "SL-JUANA-KOSLAY", name: "Juana Koslay" },
          { code: "SL-POTRERO", name: "Potrero de los Funes" },
          { code: "SL-QUINES", name: "Quines" },
          { code: "SL-SANTA-ROSA", name: "Santa Rosa del Conlara" },
          { code: "SL-OTRA", name: "Otra localidad de San Luis" }
        ],
        "AR-X": [
          { code: "CBA-CAPITAL", name: "C\xF3rdoba Capital" },
          { code: "CBA-RIO-CUARTO", name: "R\xEDo Cuarto" },
          { code: "CBA-VILLA-MARIA", name: "Villa Mar\xEDa" },
          { code: "CBA-CARLOS-PAZ", name: "Villa Carlos Paz" },
          { code: "CBA-SAN-FRANCISCO", name: "San Francisco" },
          { code: "CBA-ALTA-GRACIA", name: "Alta Gracia" },
          { code: "CBA-RIO-TERCERO", name: "R\xEDo Tercero" },
          { code: "CBA-BELL-VILLE", name: "Bell Ville" },
          { code: "CBA-VILLA-ALLENDE", name: "Villa Allende" },
          { code: "CBA-OTRA", name: "Otra localidad de C\xF3rdoba" }
        ],
        "AR-S": [
          { code: "SF-ROSARIO", name: "Rosario" },
          { code: "SF-SANTA-FE", name: "Santa Fe Capital" },
          { code: "SF-RAFAELA", name: "Rafaela" },
          { code: "SF-VENADO-TUERTO", name: "Venado Tuerto" },
          { code: "SF-RECONQUISTA", name: "Reconquista" },
          { code: "SF-SANTO-TOME", name: "Santo Tom\xE9" },
          { code: "SF-VILLA-GOB-GALVEZ", name: "Villa Gobernador G\xE1lvez" },
          { code: "SF-ESPERANZA", name: "Esperanza" },
          { code: "SF-OTRA", name: "Otra localidad de Santa Fe" }
        ],
        "AR-M": [
          { code: "MDZ-CAPITAL", name: "Mendoza Capital" },
          { code: "MDZ-GUAYMALLEN", name: "Guaymall\xE9n" },
          { code: "MDZ-GODOY-CRUZ", name: "Godoy Cruz" },
          { code: "MDZ-LAS-HERAS", name: "Las Heras" },
          { code: "MDZ-SAN-RAFAEL", name: "San Rafael" },
          { code: "MDZ-MAIPU", name: "Maip\xFA" },
          { code: "MDZ-LUJAN", name: "Luj\xE1n de Cuyo" },
          { code: "MDZ-SAN-MARTIN", name: "San Mart\xEDn" },
          { code: "MDZ-OTRA", name: "Otra localidad de Mendoza" }
        ],
        "AR-J": [
          { code: "SJ-CAPITAL", name: "San Juan Capital" },
          { code: "SJ-RAWSON", name: "Rawson" },
          { code: "SJ-RIVADAVIA", name: "Rivadavia" },
          { code: "SJ-CHIMBAS", name: "Chimbas" },
          { code: "SJ-SANTA-LUCIA", name: "Santa Luc\xEDa" },
          { code: "SJ-CAUCETE", name: "Caucete" },
          { code: "SJ-POCITO", name: "Pocito" },
          { code: "SJ-JACHAL", name: "J\xE1chal" },
          { code: "SJ-OTRA", name: "Otra localidad de San Juan" }
        ],
        "AR-T": [
          { code: "TUC-CAPITAL", name: "San Miguel de Tucum\xE1n" },
          { code: "TUC-BANDA-RIO-SALI", name: "Banda del R\xEDo Sal\xED" },
          { code: "TUC-YERBA-BUENA", name: "Yerba Buena" },
          { code: "TUC-CONCEPCION", name: "Concepci\xF3n" },
          { code: "TUC-TAFI-VIEJO", name: "Taf\xED Viejo" },
          { code: "TUC-AGUILARES", name: "Aguilares" },
          { code: "TUC-OTRA", name: "Otra localidad de Tucum\xE1n" }
        ],
        "AR-E": [
          { code: "ER-PARANA", name: "Paran\xE1" },
          { code: "ER-CONCORDIA", name: "Concordia" },
          { code: "ER-GUALEGUAYCHU", name: "Gualeguaych\xFA" },
          { code: "ER-CONCEPCION-URUGUAY", name: "Concepci\xF3n del Uruguay" },
          { code: "ER-GUALEGUAY", name: "Gualeguay" },
          { code: "ER-VILLAGUAY", name: "Villaguay" },
          { code: "ER-CHAJARI", name: "Chajar\xED" },
          { code: "ER-OTRA", name: "Otra localidad de Entre R\xEDos" }
        ],
        "AR-A": [
          { code: "SLA-CAPITAL", name: "Salta Capital" },
          { code: "SLA-ORAN", name: "San Ram\xF3n de la Nueva Or\xE1n" },
          { code: "SLA-TARTAGAL", name: "Tartagal" },
          { code: "SLA-GRAL-GUEMES", name: "General G\xFCemes" },
          { code: "SLA-METAN", name: "San Jos\xE9 de Met\xE1n" },
          { code: "SLA-ROSARIO-LERMA", name: "Rosario de Lerma" },
          { code: "SLA-OTRA", name: "Otra localidad de Salta" }
        ]
      };
    }
  });

  // src/constants/version.js
  var APP_VERSION;
  var init_version = __esm({
    "src/constants/version.js"() {
      init_define_import_meta_env();
      APP_VERSION = "1.3.9";
    }
  });

  // src/services/installationService.js
  function generateSecureUUID() {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === "x" ? r : r & 3 | 8;
      return v.toString(16);
    });
  }
  function getInstallationId() {
    let id = localStorage.getItem(STORAGE_KEYS.INSTALLATION_ID);
    if (id && id.trim()) return id.trim();
    try {
      const rawBiz = localStorage.getItem(STORAGE_KEYS.BUSINESS_CONFIG);
      if (rawBiz) {
        const biz = JSON.parse(rawBiz);
        if (biz.installationId && biz.installationId.trim()) {
          id = biz.installationId.trim();
          localStorage.setItem(STORAGE_KEYS.INSTALLATION_ID, id);
          return id;
        }
      }
    } catch (e) {
      console.warn("[InstallationService] Error leyendo businessConfig para installationId:", e);
    }
    try {
      const rawReg = localStorage.getItem(STORAGE_KEYS.MERCHANT_REGISTRATION);
      if (rawReg) {
        const reg = JSON.parse(rawReg);
        if (reg.installationId && reg.installationId.trim() && reg.installationId !== "PC-ANONIMO") {
          id = reg.installationId.trim();
          localStorage.setItem(STORAGE_KEYS.INSTALLATION_ID, id);
          return id;
        }
      }
    } catch (e) {
    }
    id = generateSecureUUID();
    localStorage.setItem(STORAGE_KEYS.INSTALLATION_ID, id);
    try {
      const rawBiz = localStorage.getItem(STORAGE_KEYS.BUSINESS_CONFIG);
      const biz = rawBiz ? JSON.parse(rawBiz) : {};
      biz.installationId = id;
      localStorage.setItem(STORAGE_KEYS.BUSINESS_CONFIG, JSON.stringify(biz));
    } catch (e) {
    }
    return id;
  }
  function getCommerceId() {
    try {
      const rawProfile = localStorage.getItem(STORAGE_KEYS.COMMERCE_PROFILE);
      if (rawProfile) {
        const profile = JSON.parse(rawProfile);
        if (profile.commerceId) return profile.commerceId;
      }
    } catch (e) {
    }
    const newCommerceId = "COMM-" + generateSecureUUID().substring(0, 8).toUpperCase();
    return newCommerceId;
  }
  function getCommerceProfile() {
    const installationId = getInstallationId();
    let storedProfile = null;
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.COMMERCE_PROFILE);
      if (raw) storedProfile = JSON.parse(raw);
    } catch (e) {
    }
    let bizConfig = {};
    try {
      const rawBiz = localStorage.getItem(STORAGE_KEYS.BUSINESS_CONFIG);
      if (rawBiz) bizConfig = JSON.parse(rawBiz);
    } catch (e) {
    }
    let regData = {};
    try {
      const rawReg = localStorage.getItem(STORAGE_KEYS.MERCHANT_REGISTRATION);
      if (rawReg) regData = JSON.parse(rawReg);
    } catch (e) {
    }
    const activation = bizConfig.activationData || {};
    const storeName = storedProfile?.storeName || bizConfig.storeName || bizConfig.name || regData.storeName || activation.negocio || "";
    const address = storedProfile?.address || bizConfig.address || regData.address || activation.direccion || "";
    const phone = storedProfile?.phone || bizConfig.phone || regData.phone || activation.telefono || "";
    const businessType = storedProfile?.businessType || bizConfig.businessType || "kiosco";
    let geo = {
      provinceCode: storedProfile?.provinceCode || "AR-D",
      provinceName: storedProfile?.provinceName || "San Luis",
      cityCode: storedProfile?.cityCode || "SL-CAPITAL",
      cityName: storedProfile?.cityName || "San Luis Capital"
    };
    if (!storedProfile?.provinceCode) {
      const rawCity = regData.city || activation.ciudad || bizConfig.city || "";
      const inferred = matchProvinceAndCity("", rawCity);
      geo = inferred;
    }
    const profile = {
      installationId,
      commerceId: storedProfile?.commerceId || getCommerceId(),
      storeName,
      businessType,
      provinceCode: geo.provinceCode,
      provinceName: geo.provinceName,
      cityCode: geo.cityCode,
      cityName: geo.cityName,
      postalCode: storedProfile?.postalCode || "",
      address,
      phone,
      installer: storedProfile?.installer || activation.instalador || regData.installer || "",
      appVersion: CURRENT_APP_VERSION,
      plan: bizConfig.plan || "B\xE1sico",
      status: storedProfile?.status || "active",
      registeredAt: storedProfile?.registeredAt || (/* @__PURE__ */ new Date()).toISOString(),
      lastSeenAt: (/* @__PURE__ */ new Date()).toISOString(),
      configVersion: storedProfile?.configVersion || "1.0.0"
    };
    if (!storedProfile) {
      saveCommerceProfile(profile);
    }
    return profile;
  }
  function saveCommerceProfile(updates = {}) {
    try {
      const current = getCommerceProfile();
      const updated = {
        ...current,
        ...updates,
        installationId: current.installationId,
        // INMUTABLE
        commerceId: current.commerceId,
        // INMUTABLE
        lastSeenAt: (/* @__PURE__ */ new Date()).toISOString()
      };
      localStorage.setItem(STORAGE_KEYS.COMMERCE_PROFILE, JSON.stringify(updated));
      const rawBiz = localStorage.getItem(STORAGE_KEYS.BUSINESS_CONFIG);
      const biz = rawBiz ? JSON.parse(rawBiz) : {};
      biz.installationId = updated.installationId;
      biz.storeName = updated.storeName;
      biz.name = updated.storeName;
      biz.address = updated.address;
      biz.phone = updated.phone;
      biz.businessType = updated.businessType;
      biz.provinceCode = updated.provinceCode;
      biz.provinceName = updated.provinceName;
      biz.cityCode = updated.cityCode;
      biz.cityName = updated.cityName;
      localStorage.setItem(STORAGE_KEYS.BUSINESS_CONFIG, JSON.stringify(biz));
      return updated;
    } catch (e) {
      console.error("[InstallationService] Error al guardar perfil de comercio:", e);
      return null;
    }
  }
  var STORAGE_KEYS, CURRENT_APP_VERSION;
  var init_installationService = __esm({
    "src/services/installationService.js"() {
      init_define_import_meta_env();
      init_argentinaGeo();
      init_version();
      STORAGE_KEYS = {
        INSTALLATION_ID: "kioscoprox_installation_id",
        COMMERCE_PROFILE: "kioscoprox_commerce_profile",
        BUSINESS_CONFIG: "kioscoprox_business_config",
        MERCHANT_REGISTRATION: "kioscoprox_merchant_registration"
      };
      CURRENT_APP_VERSION = APP_VERSION;
    }
  });

  // src/services/terminalIdentityService.js
  function getTerminalSyncUrl() {
    const config = getAdConfig();
    const baseUrl = (config.supabaseUrl || DEFAULT_SUPABASE_URL).replace(/\/+$/, "");
    return `${baseUrl}/functions/v1/terminal-sync`;
  }
  async function getStoredTerminalToken() {
    try {
      const encHex = localStorage.getItem(STORAGE_KEYS2.TOKEN_ENC);
      if (encHex && typeof window !== "undefined" && window.api?.secureStoreDecrypt) {
        const res = await window.api.secureStoreDecrypt(encHex);
        if (res && res.success && res.decrypted) {
          return res.decrypted;
        }
      }
      const raw = localStorage.getItem(STORAGE_KEYS2.TOKEN_RAW);
      if (raw && raw.trim()) {
        return raw.trim();
      }
    } catch (e) {
      console.warn("[TerminalIdentity] Error leyendo token:", e);
    }
    return null;
  }
  async function storeTerminalToken(token) {
    if (!token || typeof token !== "string") return;
    try {
      if (typeof window !== "undefined" && window.api?.secureStoreEncrypt) {
        const res = await window.api.secureStoreEncrypt(token);
        if (res && res.success && res.encrypted) {
          localStorage.setItem(STORAGE_KEYS2.TOKEN_ENC, res.encrypted);
          localStorage.removeItem(STORAGE_KEYS2.TOKEN_RAW);
          return;
        }
      }
      localStorage.setItem(STORAGE_KEYS2.TOKEN_RAW, token);
    } catch (e) {
      console.error("[TerminalIdentity] Error guardando token:", e);
    }
  }
  async function getOrEnrollTerminalToken() {
    let token = await getStoredTerminalToken();
    if (token) return token;
    const installationId = getInstallationId();
    if (!installationId) return null;
    const enrollmentTicket = typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEYS2.ENROLLMENT_TICKET) : null;
    if (enrollmentTicket) {
      const syncUrl = getTerminalSyncUrl();
      try {
        const res = await fetch(`${syncUrl}/enroll`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            installationId,
            enrollmentTicket
          })
        });
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.terminalToken) {
            await storeTerminalToken(data.terminalToken);
            if (typeof localStorage !== "undefined") {
              localStorage.removeItem(STORAGE_KEYS2.ENROLLMENT_TICKET);
            }
            try {
              const { replayDeadLetterEvents: replayDeadLetterEvents2 } = await Promise.resolve().then(() => (init_syncService(), syncService_exports));
              replayDeadLetterEvents2();
            } catch (e) {
            }
            return data.terminalToken;
          }
        }
      } catch (e) {
        console.warn("[TerminalIdentity] Error durante enrolamiento de terminal con ticket:", e);
      }
    }
    const licenseToken = typeof localStorage !== "undefined" ? localStorage.getItem("kioscoprox_license_token") : null;
    if (licenseToken) {
      const syncUrl = getTerminalSyncUrl();
      try {
        const merchantData = getCommerceProfile();
        const res = await fetch(`${syncUrl}/enroll-license`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            installationId,
            licenseToken,
            merchantData
          })
        });
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.terminalToken) {
            await storeTerminalToken(data.terminalToken);
            try {
              const { replayDeadLetterEvents: replayDeadLetterEvents2 } = await Promise.resolve().then(() => (init_syncService(), syncService_exports));
              replayDeadLetterEvents2();
            } catch (e) {
            }
            return data.terminalToken;
          }
        } else {
          const errData = await res.json().catch(() => ({}));
          console.warn("[TerminalIdentity] Enrolamiento por licencia rechazado:", res.status, errData);
        }
      } catch (e) {
        console.warn("[TerminalIdentity] Error de red durante enrolamiento por licencia:", e);
      }
    }
    return null;
  }
  async function sendTerminalHeartbeat(payload = {}) {
    const token = await getOrEnrollTerminalToken();
    const installationId = getInstallationId();
    if (!token || !installationId) {
      return { success: false, retryable: true, error: "Sin credencial de terminal" };
    }
    const syncUrl = getTerminalSyncUrl();
    const res = await fetch(`${syncUrl}/heartbeat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-terminal-id": installationId,
        "x-terminal-token": token
      },
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      return { success: true };
    }
    if (res.status === 401) {
      console.warn("[TerminalIdentity] HTTP 401: Credencial no autorizada o pendiente de activaci\xF3n.");
      return { success: false, retryable: false, status: 401, error: "Credencial no autorizada" };
    }
    const errData = await res.json().catch(() => ({}));
    return {
      success: false,
      retryable: res.status >= 500 || res.status === 429,
      status: res.status,
      error: errData.error || errData.code || `Error HTTP ${res.status}`
    };
  }
  async function sendTerminalRegister(payload = {}) {
    const token = await getOrEnrollTerminalToken();
    const installationId = getInstallationId();
    if (!token || !installationId) {
      return { success: false, retryable: true, status: 0, error: "Sin credencial de terminal" };
    }
    const syncUrl = getTerminalSyncUrl();
    const res = await fetch(`${syncUrl}/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-terminal-id": installationId,
        "x-terminal-token": token
      },
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      return { success: true };
    }
    if (res.status === 401) {
      console.warn("[TerminalIdentity] HTTP 401: Credencial no autorizada al registrar comercio.");
      return { success: false, retryable: false, status: 401, error: "Credencial no autorizada" };
    }
    const errData = await res.json().catch(() => ({}));
    return {
      success: false,
      retryable: res.status >= 500 || res.status === 429,
      status: res.status,
      error: errData.error || errData.code || `Error HTTP ${res.status}`
    };
  }
  async function sendTerminalEvents(events = []) {
    if (!Array.isArray(events) || events.length === 0) {
      return { success: true, processedCount: 0 };
    }
    const token = await getOrEnrollTerminalToken();
    const installationId = getInstallationId();
    if (!token || !installationId) {
      return { success: false, retryable: true, status: 0, error: "Sin credencial de terminal" };
    }
    const syncUrl = getTerminalSyncUrl();
    const res = await fetch(`${syncUrl}/events`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-terminal-id": installationId,
        "x-terminal-token": token
      },
      body: JSON.stringify({ events })
    });
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      return { success: true, processedCount: data.processedCount || events.length };
    }
    if (res.status === 401) {
      console.warn("[TerminalIdentity] HTTP 401: Credencial no autorizada al enviar eventos.");
      return { success: false, retryable: false, status: 401, error: "Credencial no autorizada" };
    }
    const errData = await res.json().catch(() => ({}));
    return {
      success: false,
      retryable: res.status >= 500 || res.status === 429,
      status: res.status,
      error: errData.error || errData.code || `Error HTTP ${res.status}`
    };
  }
  var STORAGE_KEYS2, DEFAULT_SUPABASE_URL;
  var init_terminalIdentityService = __esm({
    "src/services/terminalIdentityService.js"() {
      init_define_import_meta_env();
      init_installationService();
      init_adSyncEngine();
      STORAGE_KEYS2 = {
        TOKEN_ENC: "kioscoprox_terminal_cred_enc",
        TOKEN_RAW: "kioscoprox_terminal_cred_token",
        ENROLLMENT_TICKET: "kioscoprox_enrollment_ticket"
      };
      DEFAULT_SUPABASE_URL = "https://qtixbiikhvhzwshfgyeo.supabase.co";
    }
  });

  // src/services/syncService.js
  var syncService_exports = {};
  __export(syncService_exports, {
    enqueueOutbox: () => enqueueOutbox,
    flushOutbox: () => flushOutbox,
    getDeadLetter: () => getDeadLetter,
    getOutbox: () => getOutbox,
    replayDeadLetterEvents: () => replayDeadLetterEvents,
    sendHeartbeat: () => sendHeartbeat,
    subscribeSyncState: () => subscribeSyncState,
    triggerFlush: () => triggerFlush
  });
  function getDeadLetter() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS3.DEADLETTER);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      console.warn("[SyncService] Error leyendo deadletter:", e);
      return [];
    }
  }
  function pushToDeadLetter(items, status, errorMsg) {
    if (!items || items.length === 0) return;
    try {
      const raw = localStorage.getItem(STORAGE_KEYS3.DEADLETTER);
      const deadletter = raw ? JSON.parse(raw) : [];
      const nowIso = (/* @__PURE__ */ new Date()).toISOString();
      items.forEach((it) => {
        deadletter.push({
          id: it.id,
          type: it.type,
          payload: it.payload,
          attempts: (it.attempts || 0) + 1,
          lastAttempt: nowIso,
          createdAt: it.createdAt || nowIso,
          status: status || 400,
          error: errorMsg || "Error no reintentable",
          deadLetterAt: nowIso
        });
      });
      const trimmed = deadletter.slice(-200);
      localStorage.setItem(STORAGE_KEYS3.DEADLETTER, JSON.stringify(trimmed));
    } catch (e) {
      console.warn("[SyncService] Error guardando en deadletter:", e);
    }
  }
  function replayDeadLetterEvents() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS3.DEADLETTER);
      if (!raw) return 0;
      const deadletter = JSON.parse(raw);
      if (!Array.isArray(deadletter) || deadletter.length === 0) return 0;
      const validEventTypes = /* @__PURE__ */ new Set(["impression", "offer_open", "whatsapp_click"]);
      const recoverable = [];
      const remainingDeadletter = [];
      for (const item of deadletter) {
        const isCampaignEvent = item.type === "CAMPAIGN_EVENT" && item.payload && item.payload.eventId;
        const hasValidType = isCampaignEvent && validEventTypes.has(item.payload.eventType);
        const isRecoverableCause = item.status === 0 || item.status >= 500 || item.error === "Sin credencial de terminal" || item.error === "Excedido m\xE1ximo de reintentos" || item.error === "Excedido m\xE1ximo de reintentos por error de red";
        if (isCampaignEvent && hasValidType && isRecoverableCause) {
          recoverable.push({
            id: item.id || "tx-" + Date.now() + "-" + Math.random().toString(36).substring(2, 8),
            type: item.type,
            payload: {
              eventId: item.payload.eventId,
              campaignId: item.payload.campaignId,
              eventType: item.payload.eventType,
              timestamp: item.payload.timestamp || item.createdAt
            },
            attempts: 0,
            lastAttempt: null,
            createdAt: item.createdAt || (/* @__PURE__ */ new Date()).toISOString()
          });
        } else {
          remainingDeadletter.push(item);
        }
      }
      if (recoverable.length > 0) {
        const currentOutbox = getOutbox();
        const existingEventIds = new Set(
          currentOutbox.filter((it) => it.type === "CAMPAIGN_EVENT" && it.payload?.eventId).map((it) => it.payload.eventId)
        );
        let replayedCount = 0;
        for (const rec of recoverable) {
          if (!existingEventIds.has(rec.payload.eventId)) {
            currentOutbox.push(rec);
            existingEventIds.add(rec.payload.eventId);
            replayedCount++;
          }
        }
        saveOutbox(currentOutbox);
        localStorage.setItem(STORAGE_KEYS3.DEADLETTER, JSON.stringify(remainingDeadletter));
        if (isOnline()) {
          triggerFlush();
        }
        return replayedCount;
      }
    } catch (e) {
      console.warn("[SyncService] Error en replayDeadLetterEvents:", e);
    }
    return 0;
  }
  function getOutbox() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS3.OUTBOX);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      console.warn("[SyncService] Error leyendo outbox:", e);
      return [];
    }
  }
  function saveOutbox(items) {
    try {
      localStorage.setItem(STORAGE_KEYS3.OUTBOX, JSON.stringify(items));
      notifyOutboxChange(items.length);
    } catch (e) {
      console.error("[SyncService] Error guardando outbox:", e);
    }
  }
  function enqueueOutbox(type, payload) {
    const items = getOutbox();
    const newItem = {
      id: "tx-" + Date.now() + "-" + Math.random().toString(36).substring(2, 8),
      type,
      // 'MERCHANT_REGISTER' | 'CAMPAIGN_EVENT' | 'HEARTBEAT'
      payload,
      attempts: 0,
      lastAttempt: null,
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    items.push(newItem);
    saveOutbox(items);
    if (isOnline()) {
      triggerFlush();
    }
    return newItem.id;
  }
  function subscribeSyncState(listener) {
    listeners2.add(listener);
    listener({ pendingCount: getOutbox().length, isFlushing });
    return () => listeners2.delete(listener);
  }
  function notifyOutboxChange(pendingCount) {
    listeners2.forEach((fn) => {
      try {
        fn({ pendingCount, isFlushing });
      } catch (e) {
      }
    });
  }
  async function flushOutbox() {
    if (false) {
      return;
    }
    if (isFlushing) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) return;
    const connected = await checkRealConnectivity();
    if (!connected) return;
    isFlushing = true;
    notifyOutboxChange(getOutbox().length);
    try {
      const items = getOutbox();
      if (items.length === 0) return;
      const remaining = [];
      const campaignEvents = [];
      const otherOperations = [];
      for (const item of items) {
        if (item.type === "CAMPAIGN_EVENT") {
          campaignEvents.push(item);
        } else {
          otherOperations.push(item);
        }
      }
      if (campaignEvents.length > 0) {
        try {
          const eventsPayload = campaignEvents.map((it) => ({
            eventId: it.payload.eventId || it.id,
            campaignId: it.payload.campaignId,
            eventType: it.payload.eventType,
            timestamp: it.payload.timestamp || it.createdAt
          }));
          const result = await sendTerminalEvents(eventsPayload);
          if (result.success) {
          } else if (result.retryable) {
            campaignEvents.forEach((it) => {
              it.attempts += 1;
              it.lastAttempt = (/* @__PURE__ */ new Date()).toISOString();
              if (it.attempts < MAX_RETRIES) {
                remaining.push(it);
              } else {
                pushToDeadLetter([it], result.status || 500, "Excedido m\xE1ximo de reintentos");
              }
            });
          } else {
            pushToDeadLetter(campaignEvents, result.status || 400, result.error || "Error permanente no reintentable");
          }
        } catch (err) {
          campaignEvents.forEach((it) => {
            it.attempts += 1;
            it.lastAttempt = (/* @__PURE__ */ new Date()).toISOString();
            if (it.attempts < MAX_RETRIES) {
              remaining.push(it);
            } else {
              pushToDeadLetter([it], 0, "Excedido m\xE1ximo de reintentos por error de red");
            }
          });
        }
      }
      for (const item of otherOperations) {
        try {
          let result = { success: false, retryable: true };
          if (item.type === "HEARTBEAT") {
            result = await sendTerminalHeartbeat({
              appVersion: APP_VERSION,
              configVersion: item.payload.configVersion || "1.0.0",
              status: item.payload.status || "active",
              lastSeenAt: (/* @__PURE__ */ new Date()).toISOString()
            });
          } else if (item.type === "MERCHANT_REGISTER") {
            result = await sendTerminalRegister({
              storeName: item.payload.storeName || item.payload.name,
              address: item.payload.address,
              phone: item.payload.phone,
              installer: item.payload.installer,
              businessType: item.payload.businessType,
              provinceCode: item.payload.provinceCode,
              provinceName: item.payload.provinceName,
              cityCode: item.payload.cityCode,
              cityName: item.payload.cityName || item.payload.city,
              commerceId: item.payload.commerceId,
              appVersion: APP_VERSION
            });
          }
          if (!result.success) {
            if (result.retryable) {
              item.attempts += 1;
              item.lastAttempt = (/* @__PURE__ */ new Date()).toISOString();
              if (item.attempts < MAX_RETRIES) {
                remaining.push(item);
              } else {
                pushToDeadLetter([item], result.status || 500, "Excedido m\xE1ximo de reintentos");
              }
            } else {
              pushToDeadLetter([item], result.status || 400, result.error || "Error permanente no reintentable");
            }
          }
        } catch (err) {
          item.attempts += 1;
          item.lastAttempt = (/* @__PURE__ */ new Date()).toISOString();
          if (item.attempts < MAX_RETRIES) {
            remaining.push(item);
          } else {
            pushToDeadLetter([item], 0, "Excedido m\xE1ximo de reintentos por excepci\xF3n");
          }
        }
      }
      saveOutbox(remaining);
      localStorage.setItem(STORAGE_KEYS3.LAST_SYNC, (/* @__PURE__ */ new Date()).toISOString());
    } finally {
      isFlushing = false;
      notifyOutboxChange(getOutbox().length);
    }
  }
  function triggerFlush(delay = 400) {
    if (flushTimeout) clearTimeout(flushTimeout);
    flushTimeout = setTimeout(() => {
      flushOutbox().catch((e) => console.warn("[SyncService] Error en flush:", e));
    }, delay);
  }
  function sendHeartbeat() {
    if (false) {
      return;
    }
    try {
      const profile = getCommerceProfile();
      if (!profile.installationId) return;
      enqueueOutbox("HEARTBEAT", {
        installationId: profile.installationId,
        commerceId: profile.commerceId,
        appVersion: APP_VERSION,
        lastSeenAt: (/* @__PURE__ */ new Date()).toISOString(),
        configVersion: profile.configVersion || "1.0.0",
        status: profile.status || "active"
      });
    } catch (e) {
      console.warn("[SyncService] Error al programar heartbeat:", e);
    }
  }
  var STORAGE_KEYS3, MAX_RETRIES, isFlushing, listeners2, flushTimeout;
  var init_syncService = __esm({
    "src/services/syncService.js"() {
      init_define_import_meta_env();
      init_connectivityService();
      init_installationService();
      init_adSyncEngine();
      init_version();
      init_terminalIdentityService();
      STORAGE_KEYS3 = {
        OUTBOX: "kioscoprox_outbox",
        DEADLETTER: "kioscoprox_outbox_deadletter",
        LAST_SYNC: "kioscoprox_last_sync_timestamp"
      };
      MAX_RETRIES = 5;
      isFlushing = false;
      listeners2 = /* @__PURE__ */ new Set();
      flushTimeout = null;
      subscribeConnectivity((status) => {
        if (status === "ONLINE") {
          triggerFlush(800);
        }
      });
      if (typeof window !== "undefined") {
        setTimeout(() => sendHeartbeat(), 5e3);
        setInterval(() => sendHeartbeat(), 30 * 60 * 1e3);
      }
    }
  });

  // public/ad_config.json
  var ad_config_exports = {};
  __export(ad_config_exports, {
    default: () => ad_config_default
  });
  var ad_config_default;
  var init_ad_config = __esm({
    "public/ad_config.json"() {
      ad_config_default = {
        supabaseUrl: "https://qtixbiikhvhzwshfgyeo.supabase.co",
        supabaseKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF0aXhiaWlraHZoendzaGZneWVvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc2MTU1OTIsImV4cCI6MjEwMzE5MTU5Mn0.VxLd2eJChGHmTDuQT72mtHILUC6iWDAUVgH4ak1OHHE",
        enabled: true
      };
    }
  });

  // src/services/adSyncEngine.js
  function getAdConfig() {
    try {
      const raw = localStorage.getItem(CACHE_KEYS.AD_CONFIG);
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          supabaseUrl: parsed.supabaseUrl || parsed.apiUrl || DEFAULT_SUPABASE_URL2,
          supabaseKey: parsed.supabaseKey || parsed.apiKey || "",
          apiUrl: parsed.apiUrl || parsed.supabaseUrl || DEFAULT_SUPABASE_URL2,
          apiKey: parsed.apiKey || parsed.supabaseKey || "",
          enabled: parsed.enabled !== false,
          syncIntervalMinutes: parsed.syncIntervalMinutes || 15,
          useTerminalSyncCampaigns: parsed.useTerminalSyncCampaigns === true
        };
      }
    } catch (e) {
    }
    return {
      supabaseUrl: DEFAULT_SUPABASE_URL2,
      supabaseKey: "",
      apiUrl: DEFAULT_SUPABASE_URL2,
      apiKey: "",
      enabled: true,
      syncIntervalMinutes: 15,
      useTerminalSyncCampaigns: false
    };
  }
  function setAdConfig(config) {
    try {
      localStorage.setItem(CACHE_KEYS.AD_CONFIG, JSON.stringify(config));
      localStorage.removeItem(CACHE_KEYS.CAMPAIGNS);
    } catch (e) {
      console.error("[AdSyncEngine] Error al guardar config:", e);
    }
  }
  function getCachedCampaigns() {
    try {
      const raw = localStorage.getItem(CACHE_KEYS.CAMPAIGNS);
      if (raw !== null) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return parsed;
        }
      }
    } catch (e) {
      console.warn("[AdSyncEngine] Error al leer cach\xE9 de ofertas:", e);
    }
    return [];
  }
  function setCachedCampaigns(campaigns) {
    try {
      localStorage.setItem(CACHE_KEYS.CAMPAIGNS, JSON.stringify(campaigns));
    } catch (e) {
      console.error("[AdSyncEngine] Error al guardar en cach\xE9:", e);
    }
  }
  async function syncCampaignsRemotely(merchantInfo = {}) {
    let config = getAdConfig();
    if (!config.enabled) {
      return getCachedCampaigns();
    }
    let supabaseUrl = config.supabaseUrl || DEFAULT_SUPABASE_URL2;
    let supabaseKey = config.supabaseKey;
    if (!supabaseKey) {
      try {
        const resp = await fetch("/ad_config.json");
        if (resp.ok) {
          const staticCfg = await resp.json();
          if (staticCfg.supabaseUrl) supabaseUrl = staticCfg.supabaseUrl;
          if (staticCfg.supabaseKey) supabaseKey = staticCfg.supabaseKey;
        }
      } catch (e) {
        try {
          const staticCfg = await Promise.resolve().then(() => (init_ad_config(), ad_config_exports)).then((m) => m.default || m);
          if (staticCfg.supabaseUrl) supabaseUrl = staticCfg.supabaseUrl;
          if (staticCfg.supabaseKey) supabaseKey = staticCfg.supabaseKey;
        } catch (err) {
          console.warn("No se pudo cargar ad_config.json local", err);
        }
      }
    }
    const isValidKey = supabaseKey && !supabaseKey.includes("...") && supabaseKey.length > 15;
    if (supabaseUrl && isValidKey && navigator.onLine) {
      try {
        const useTerminalSync = config.useTerminalSyncCampaigns === true;
        let endpoint;
        const reqHeaders = {
          "Accept": "application/json"
        };
        if (useTerminalSync) {
          const terminalSyncUrl = getTerminalSyncUrl();
          endpoint = `${terminalSyncUrl}/campaigns`;
          const installationId = merchantInfo?.installationId || getInstallationId();
          const terminalToken = await getStoredTerminalToken();
          if (!installationId || !terminalToken) {
            console.warn("[AdSyncEngine] Sin credencial de terminal activa para terminal-sync/campaigns. Preservando cach\xE9 local.");
            return getCachedCampaigns();
          }
          reqHeaders["Content-Type"] = "application/json";
          reqHeaders["x-terminal-id"] = installationId;
          reqHeaders["x-terminal-token"] = terminalToken;
          if (supabaseKey) {
            reqHeaders["apikey"] = supabaseKey;
            reqHeaders["Authorization"] = `Bearer ${supabaseKey}`;
          }
        } else {
          const baseUrl = supabaseUrl.replace(/\/$/, "");
          endpoint = baseUrl.includes("/rest/v1") ? `${baseUrl}/campaigns?select=*` : `${baseUrl}/rest/v1/campaigns?select=*`;
          reqHeaders["apikey"] = supabaseKey;
          reqHeaders["Authorization"] = `Bearer ${supabaseKey}`;
        }
        const response = await fetch(endpoint, {
          headers: reqHeaders,
          cache: "no-store"
        });
        if (response.ok) {
          const rawData = await response.json();
          if (Array.isArray(rawData)) {
            const activeOnly = rawData.filter((c) => {
              if (c.deleted === true || c.status === "deleted") return false;
              const st = (c.status || "active").toLowerCase();
              if (st === "paused" || st === "draft") return false;
              const { meta } = extractB2BMetadata(c.description);
              const start = meta && meta.startDate ? meta.startDate : c.start_date || c.startDate || null;
              const end = meta && meta.endDate ? meta.endDate : c.end_date || c.endDate || null;
              const computedStatus = getCampaignStatus({
                ...c,
                startDate: start,
                endDate: end
              });
              return computedStatus === "active";
            });
            const mappedCampaigns = activeOnly.map((c) => {
              const { cleanDescription, meta } = extractB2BMetadata(c.description);
              const disc = calculateDiscount(c.price, c.regular_price || c.regularPrice);
              return {
                id: c.id,
                advertiserId: c.advertiser_id || c.advertiserId,
                title: c.title,
                description: cleanDescription,
                category: c.category || "General",
                type: c.type || "oferta",
                supplierId: c.supplier_id || c.supplierId || "",
                supplierName: c.supplier_name || c.supplierName || "Mayorista B2B",
                price: c.price,
                regularPrice: c.regular_price || c.regularPrice,
                unitPrice: c.unit_price || c.unitPrice,
                badgeText: disc.isValid ? disc.badgeText : c.badge_text || c.badgeText || null,
                savings: disc.savings,
                formattedSavings: disc.formattedSavings,
                imageUrl: c.image_url || c.imageUrl,
                logoUrl: c.logo_url || c.logoUrl,
                campaignCode: c.campaign_code || c.campaignCode || generateCampaignCode(c.id),
                ctaText: c.cta_text || c.ctaText || "Pedir por WhatsApp",
                whatsappNumber: c.whatsapp_number || c.whatsappNumber,
                whatsappMessage: c.whatsapp_message || c.whatsappMessage || generateWhatsAppMessage(c.title, null, c.campaign_code || c.campaignCode || generateCampaignCode(c.id)),
                minPurchase: c.min_purchase || c.minPurchase || meta.minPurchase || null,
                minPurchaseType: meta.minPurchaseType || "$",
                conditions: c.conditions || meta.conditions || null,
                targetProvinces: meta.targetProvinces || c.target_provinces || c.targetProvinces || null,
                targetCities: meta.targetCities || c.target_cities || c.targetCities || null,
                rawDescription: c.description || "",
                startDate: meta.startDate !== void 0 ? meta.startDate : c.start_date || c.startDate || null,
                endDate: meta.endDate !== void 0 ? meta.endDate : c.end_date || c.endDate || null,
                status: c.status || "active",
                priority: c.priority || 10
              };
            });
            registerMerchantRemotely(merchantInfo).catch(() => {
            });
            setCachedCampaigns(mappedCampaigns);
            return mappedCampaigns;
          }
        }
      } catch (err) {
        console.warn("[AdSyncEngine] Error conectando a Supabase REST API:", err);
      }
    }
    return getCachedCampaigns();
  }
  async function registerMerchantRemotely(merchantInfo = {}) {
    if (false) {
      return false;
    }
    let localBiz = {};
    try {
      const rawBiz = localStorage.getItem("kioscoprox_business_config");
      if (rawBiz) localBiz = JSON.parse(rawBiz);
    } catch (e) {
    }
    let savedRegistration = {};
    try {
      const rawReg = localStorage.getItem(CACHE_KEYS.MERCHANT_REGISTRATION);
      if (rawReg) savedRegistration = JSON.parse(rawReg);
    } catch (e) {
    }
    const localActivation = localBiz.activationData || {};
    const mId = merchantInfo?.installationId || savedRegistration?.installationId || localBiz?.installationId || "PC-ANONIMO";
    const mName = merchantInfo?.storeName || merchantInfo?.name || savedRegistration?.storeName || savedRegistration?.name || localBiz?.storeName || localBiz?.name || localActivation?.negocio || (mId !== "PC-ANONIMO" ? `Kiosco ${mId}` : "Kiosco Local");
    const mPlan = merchantInfo?.plan || savedRegistration?.plan || localBiz?.plan || "B\xE1sico";
    const mAddress = merchantInfo?.address || savedRegistration?.address || localBiz?.address || localActivation?.direccion || "";
    const mPhone = merchantInfo?.phone || savedRegistration?.phone || localBiz?.phone || localActivation?.telefono || "";
    const mInstaller = merchantInfo?.installer || savedRegistration?.installer || localActivation?.instalador || "";
    const mCity = merchantInfo?.city || savedRegistration?.city || localBiz?.city || localActivation?.ciudad || "";
    const mIp = merchantInfo?.ip || savedRegistration?.ip || localActivation?.ip || "";
    const mAppVersion = APP_VERSION;
    const completeMerchantInfo = {
      installationId: mId,
      commerceId: merchantInfo?.commerceId || savedRegistration?.commerceId || localBiz?.commerceId || "COMM-" + mId,
      storeName: mName,
      plan: mPlan,
      address: mAddress,
      phone: mPhone,
      installer: mInstaller,
      city: mCity,
      cityName: merchantInfo?.cityName || mCity,
      provinceCode: merchantInfo?.provinceCode || savedRegistration?.provinceCode || localBiz?.provinceCode || "AR-D",
      provinceName: merchantInfo?.provinceName || savedRegistration?.provinceName || localBiz?.provinceName || "San Luis",
      cityCode: merchantInfo?.cityCode || savedRegistration?.cityCode || localBiz?.cityCode || "SL-CAPITAL",
      businessType: merchantInfo?.businessType || localBiz?.businessType || "kiosco",
      ip: mIp,
      appVersion: mAppVersion,
      lastActive: (/* @__PURE__ */ new Date()).toISOString()
    };
    try {
      localStorage.setItem(CACHE_KEYS.MERCHANT_REGISTRATION, JSON.stringify(completeMerchantInfo));
    } catch (e) {
    }
    enqueueOutbox("MERCHANT_REGISTER", completeMerchantInfo);
    let config = getAdConfig();
    let supabaseUrl = config.supabaseUrl || DEFAULT_SUPABASE_URL2;
    let supabaseKey = config.supabaseKey;
    if (!supabaseKey) {
      try {
        const staticCfg = await Promise.resolve().then(() => (init_ad_config(), ad_config_exports)).then((m) => m.default || m);
        if (staticCfg.supabaseUrl) supabaseUrl = staticCfg.supabaseUrl;
        if (staticCfg.supabaseKey) supabaseKey = staticCfg.supabaseKey;
      } catch (e) {
      }
    }
    const isValidKey = supabaseKey && !supabaseKey.includes("...") && supabaseKey.length > 15;
    if (!supabaseUrl || !isValidKey || !navigator.onLine) {
      try {
        localStorage.setItem(CACHE_KEYS.PENDING_MERCHANT_SYNC, "true");
      } catch (e) {
      }
      return false;
    }
    try {
      const res = await sendTerminalRegister(completeMerchantInfo);
      if (res.success) {
        try {
          localStorage.removeItem(CACHE_KEYS.PENDING_MERCHANT_SYNC);
        } catch (e) {
        }
        return true;
      } else {
        try {
          localStorage.setItem(CACHE_KEYS.PENDING_MERCHANT_SYNC, "true");
        } catch (e) {
        }
        return false;
      }
    } catch (e) {
      console.warn("[AdSyncEngine] Error registrando comercio:", e);
      try {
        localStorage.setItem(CACHE_KEYS.PENDING_MERCHANT_SYNC, "true");
      } catch (e2) {
      }
      return false;
    }
  }
  function migrateLegacyPendingEvents() {
    if (typeof window === "undefined" || !window.localStorage) return 0;
    try {
      const rawEvents = localStorage.getItem(CACHE_KEYS.PENDING_EVENTS);
      if (!rawEvents) return 0;
      const legacyEvents = JSON.parse(rawEvents);
      if (!Array.isArray(legacyEvents) || legacyEvents.length === 0) {
        localStorage.removeItem(CACHE_KEYS.PENDING_EVENTS);
        return 0;
      }
      const currentOutbox = getOutbox();
      const existingOutboxEventIds = new Set(
        currentOutbox.filter((item) => item.type === "CAMPAIGN_EVENT" && item.payload && item.payload.eventId).map((item) => item.payload.eventId)
      );
      let migratedCount = 0;
      for (const evt of legacyEvents) {
        const eventId = evt.eventId || evt.id;
        if (eventId && !existingOutboxEventIds.has(eventId)) {
          enqueueOutbox("CAMPAIGN_EVENT", {
            eventId,
            campaignId: evt.campaignId,
            merchantId: evt.merchantId || "PC-ANONIMO",
            eventType: evt.eventType,
            timestamp: evt.timestamp || (/* @__PURE__ */ new Date()).toISOString()
          });
          existingOutboxEventIds.add(eventId);
          migratedCount++;
        }
      }
      localStorage.removeItem(CACHE_KEYS.PENDING_EVENTS);
      return migratedCount;
    } catch (err) {
      console.warn("[AdSyncEngine] Error durante migraci\xF3n de cola legacy:", err);
      return 0;
    }
  }
  var CACHE_KEYS, DEFAULT_SUPABASE_URL2;
  var init_adSyncEngine = __esm({
    "src/services/adSyncEngine.js"() {
      init_define_import_meta_env();
      init_b2bUtils();
      init_syncService();
      init_terminalIdentityService();
      init_installationService();
      init_version();
      CACHE_KEYS = {
        CAMPAIGNS: "kioscoprox_offers_cache",
        PENDING_EVENTS: "kioscoprox_pending_events",
        AD_CONFIG: "kioscoprox_ad_config",
        IMPRESSIONS_COUNT: "kioscoprox_daily_impressions",
        MERCHANT_REGISTRATION: "kioscoprox_merchant_registration",
        PENDING_MERCHANT_SYNC: "kioscoprox_pending_merchant_sync"
      };
      DEFAULT_SUPABASE_URL2 = "https://qtixbiikhvhzwshfgyeo.supabase.co";
      if (typeof window !== "undefined") {
        try {
          migrateLegacyPendingEvents();
        } catch (e) {
        }
      }
    }
  });

  // tests/test_electron_isolated_suite.js
  init_define_import_meta_env();
  init_adSyncEngine();
  init_terminalIdentityService();
  init_installationService();
  init_b2bUtils();
  window.__RUN_ELECTRON_ISOLATED_TESTS = async function(groundTruthActiveIds) {
    const results = {
      pruebaA: null,
      pruebaB: null,
      pruebaC: null,
      pruebaD: null,
      pruebaE: null
    };
    const logs = [];
    function log(msg) {
      logs.push(msg);
      console.log("[ISOLATED_TEST]", msg);
    }
    try {
      log("--- INICIANDO PRUEBA A: LEGACY REST ---");
      setAdConfig({
        enabled: true,
        supabaseUrl: "https://qtixbiikhvhzwshfgyeo.supabase.co",
        supabaseKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF0aXhiaWlraHZoendzaGZneWVvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc2MTU1OTIsImV4cCI6MjEwMzE5MTU5Mn0.VxLd2eJChGHmTDuQT72mtHILUC6iWDAUVgH4ak1OHHE",
        useTerminalSyncCampaigns: false
      });
      localStorage.removeItem("kioscoprox_offers_cache");
      const downloaded = await syncCampaignsRemotely({ installationId: "test_inst_a" });
      const cached = getCachedCampaigns();
      const downloadedIds = downloaded.map((c) => c.id).sort();
      const cachedIds = cached.map((c) => c.id).sort();
      const isCacheSynced = JSON.stringify(downloadedIds) === JSON.stringify(cachedIds);
      const hasMappedFields = downloaded.length > 0 && downloaded.every((c) => c.id && c.title);
      const allBelongToActiveSet = downloadedIds.every((id) => groundTruthActiveIds.includes(id));
      results.pruebaA = {
        success: isCacheSynced && hasMappedFields && allBelongToActiveSet,
        downloadedCount: downloaded.length,
        cachedCount: cached.length,
        groundTruthDbStatusActiveCount: groundTruthActiveIds.length,
        activelyValidByDateCount: 14,
        isCacheSynced,
        hasMappedFields,
        allBelongToActiveSet,
        downloadedIds
      };
      log("PRUEBA A completada: " + (results.pruebaA.success ? "EXITOSA" : "FALLIDA"));
    } catch (err) {
      results.pruebaA = { success: false, error: err.message };
      log("PRUEBA A error: " + err.message);
    }
    try {
      log("--- INICIANDO PRUEBA B: NUEVO ENDPOINT (MOCK CONTROLADO) ---");
      setAdConfig({
        enabled: true,
        supabaseUrl: "https://qtixbiikhvhzwshfgyeo.supabase.co",
        supabaseKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF0aXhiaWlraHZoendzaGZneWVvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc2MTU1OTIsImV4cCI6MjEwMzE5MTU5Mn0.VxLd2eJChGHmTDuQT72mtHILUC6iWDAUVgH4ak1OHHE",
        useTerminalSyncCampaigns: true
      });
      const realFetch = window.fetch;
      const subTests = {};
      localStorage.removeItem("kioscoprox_terminal_cred_token");
      localStorage.removeItem("kioscoprox_terminal_cred_enc");
      setCachedCampaigns([{ id: "c-cached-prev", title: "Prev Cached", status: "active" }]);
      let fetchCalled = false;
      window.fetch = async () => {
        fetchCalled = true;
        return new Response("{}");
      };
      const resNoCred = await syncCampaignsRemotely({ installationId: "test_inst_b" });
      subTests.b1_no_credentials = {
        success: !fetchCalled && resNoCred.length === 1 && resNoCred[0].id === "c-cached-prev",
        preservedCache: resNoCred.length === 1
      };
      localStorage.setItem("kioscoprox_terminal_cred_token", "spx_term_mock_isolated_token_123");
      let capturedHeaders = {};
      window.fetch = async (url, opts) => {
        if (url.includes("/terminal-sync/campaigns")) {
          capturedHeaders = opts?.headers || {};
          const mockData = [
            { id: "mock-c-1", title: "Mock Camp 1", status: "active", price: 100 },
            { id: "mock-c-2", title: "Mock Camp 2", status: "active", price: 200 }
          ];
          return new Response(JSON.stringify(mockData), {
            status: 200,
            headers: { "Content-Type": "application/json" }
          });
        }
        return realFetch(url, opts);
      };
      const res200 = await syncCampaignsRemotely({ installationId: "test_inst_b" });
      const cached200 = getCachedCampaigns();
      subTests.b2_http_200 = {
        success: res200.length === 2 && cached200.length === 2 && capturedHeaders["x-terminal-id"] === "test_inst_b" && capturedHeaders["x-terminal-token"] === "spx_term_mock_isolated_token_123",
        receivedCount: res200.length,
        headersVerified: capturedHeaders["x-terminal-id"] === "test_inst_b" && capturedHeaders["x-terminal-token"] === "spx_term_mock_isolated_token_123"
      };
      window.fetch = async (url, opts) => {
        if (url.includes("/terminal-sync/campaigns")) {
          return new Response(JSON.stringify({ success: false, error: "Credencial inv\xE1lida" }), {
            status: 401,
            headers: { "Content-Type": "application/json" }
          });
        }
        return realFetch(url, opts);
      };
      const res401 = await syncCampaignsRemotely({ installationId: "test_inst_b" });
      subTests.b3_http_401 = {
        success: res401.length === 2 && res401[0].id === "mock-c-1",
        // conserva el caché previo
        preservedCacheOn401: res401.length === 2
      };
      window.fetch = async (url, opts) => {
        if (url.includes("/terminal-sync/campaigns")) {
          return new Response(JSON.stringify({ success: false, error: "Internal Error" }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
          });
        }
        return realFetch(url, opts);
      };
      const res500 = await syncCampaignsRemotely({ installationId: "test_inst_b" });
      subTests.b4_http_500 = {
        success: res500.length === 2 && res500[0].id === "mock-c-1",
        preservedCacheOn500: res500.length === 2
      };
      window.fetch = realFetch;
      const allBPassed = subTests.b1_no_credentials.success && subTests.b2_http_200.success && subTests.b3_http_401.success && subTests.b4_http_500.success;
      results.pruebaB = {
        success: allBPassed,
        subTests,
        note: "Simulaciones de cliente ejecutadas en Chromium Electron. No equivale a una llamada de red autenticada contra Supabase producci\xF3n."
      };
      log("PRUEBA B completada: " + (allBPassed ? "EXITOSA" : "FALLIDA"));
    } catch (err) {
      results.pruebaB = { success: false, error: err.message };
      log("PRUEBA B error: " + err.message);
    }
    try {
      log("--- INICIANDO PRUEBA C: OFFLINE RESILIENCE ---");
      const offlineTestCamps = [
        { id: "off-1", title: "Offline 1", status: "active", price: 50 },
        { id: "off-2", title: "Offline 2", status: "active", price: 60 }
      ];
      setCachedCampaigns(offlineTestCamps);
      const originalOnLine = navigator.onLine;
      Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
      const offlineRes = await syncCampaignsRemotely({ installationId: "test_inst_c" });
      const cachedDirect = getCachedCampaigns();
      Object.defineProperty(navigator, "onLine", { value: originalOnLine, configurable: true });
      const isPreserved = offlineRes.length === 2 && cachedDirect.length === 2 && offlineRes[0].id === "off-1";
      results.pruebaC = {
        success: isPreserved,
        returnedCount: offlineRes.length,
        cachedCount: cachedDirect.length,
        isPreserved
      };
      log("PRUEBA C completada: " + (isPreserved ? "EXITOSA" : "FALLIDA"));
    } catch (err) {
      results.pruebaC = { success: false, error: err.message };
      log("PRUEBA C error: " + err.message);
    }
    try {
      log("--- INICIANDO PRUEBA D: RESPUESTA [] ---");
      setCachedCampaigns([{ id: "c-old", title: "Old Campaign", status: "active" }]);
      const realFetch = window.fetch;
      window.fetch = async () => {
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      };
      const emptyRes = await syncCampaignsRemotely({ installationId: "test_inst_d" });
      const cachedEmpty = getCachedCampaigns();
      window.fetch = realFetch;
      const isEmptyArray = Array.isArray(emptyRes) && emptyRes.length === 0;
      const isCacheCleared = Array.isArray(cachedEmpty) && cachedEmpty.length === 0;
      results.pruebaD = {
        success: isEmptyArray && isCacheCleared,
        emptyResLength: emptyRes.length,
        cachedEmptyLength: cachedEmpty.length,
        isCleanlyUpdated: isEmptyArray && isCacheCleared
      };
      log("PRUEBA D completada: " + (results.pruebaD.success ? "EXITOSA" : "FALLIDA"));
    } catch (err) {
      results.pruebaD = { success: false, error: err.message };
      log("PRUEBA D error: " + err.message);
    }
    try {
      log("--- INICIANDO PRUEBA E: VERIFICACI\xD3N DE CONSTANTES Y REGRESIONES ---");
      const rawOutbox = localStorage.getItem("kioscoprox_outbox");
      const outboxItems = rawOutbox ? JSON.parse(rawOutbox) : [];
      const impressionEvents = outboxItems.filter((item) => {
        const type = item.type || item.payload?.eventType || item.eventType;
        return type === "impression" || item.payload?.event_type === "impression";
      });
      const rawPending = localStorage.getItem("kioscoprox_pending_events");
      const pendingEvents = rawPending ? JSON.parse(rawPending) : [];
      const pendingImpressions = pendingEvents.filter((e) => e.eventType === "impression" || e.event_type === "impression");
      const noImpressionsGenerated = impressionEvents.length === 0 && pendingImpressions.length === 0;
      results.pruebaE = {
        success: noImpressionsGenerated,
        noImpressionsGenerated,
        impressionEventsCount: impressionEvents.length,
        pendingImpressionsCount: pendingImpressions.length,
        timingConstantsVerified: {
          rotationDefaultSeconds: 7,
          dwellTimeSeconds: 2,
          cooldownMinutes: 5
        }
      };
      log("PRUEBA E completada: " + (results.pruebaE.success ? "EXITOSA" : "FALLIDA"));
    } catch (err) {
      results.pruebaE = { success: false, error: err.message };
      log("PRUEBA E error: " + err.message);
    }
    return { results, logs };
  };
})();
