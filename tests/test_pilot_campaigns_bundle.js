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

  // src/utils/b2bUtils.js
  var calculateDiscount, extractB2BMetadata, getCampaignStatus, generateCampaignCode, generateWhatsAppMessage;
  var init_b2bUtils = __esm({
    "src/utils/b2bUtils.js"() {
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
    if (true?.DEV && typeof window !== "undefined" && sessionStorage.getItem("kioscoprox_demo_active") === "true") {
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
    if (true?.DEV && typeof window !== "undefined" && sessionStorage.getItem("kioscoprox_demo_active") === "true") {
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
    if (true.DEV && typeof window !== "undefined" && sessionStorage.getItem("kioscoprox_demo_active") === "true") {
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

  // tests/test_pilot_campaigns_suite.js
  init_adSyncEngine();
  init_terminalIdentityService();
  init_b2bUtils();
  window.__RUN_PILOT_CAMPAIGNS_TEST = async function(pilotConfig) {
    const logs = [];
    function log(msg) {
      logs.push(msg);
      console.log("[PILOT_TEST]", msg);
    }
    const results = {
      step1_credentials_stored: false,
      step2_http_200_sync: false,
      step3_campaigns_valid: false,
      step3b_pilot_campaign_verified: false,
      step3b_pilot_campaign_excluded: null,
      step4_cache_updated: false,
      step5_offline_resilience: false,
      step6_legacy_reversion: false,
      details: {},
      sanitizedConfig: {
        installationId: pilotConfig.installationId,
        hasToken: Boolean(pilotConfig.terminalToken),
        useTerminalSyncCampaigns: true,
        expectExclusion: Boolean(pilotConfig.expectExclusion)
      }
    };
    const realFetch = window.fetch;
    let lastSyncUrl = null;
    let lastSyncHeaders = {};
    let lastRawSyncPayload = null;
    let lastSyncStatus = null;
    try {
      log("1. Inicializando interceptor DENY-BY-DEFAULT estricto...");
      window.XMLHttpRequest = function() {
        log("   [DENY-BY-DEFAULT] XMLHttpRequest no autorizado en el sandbox.");
        throw new TypeError("[DENY-BY-DEFAULT] XMLHttpRequest bloqueado por pol\xEDtica de seguridad");
      };
      if (typeof window.WebSocket !== "undefined") {
        window.WebSocket = function() {
          log("   [DENY-BY-DEFAULT] WebSocket no autorizado en el sandbox.");
          throw new TypeError("[DENY-BY-DEFAULT] WebSocket bloqueado por pol\xEDtica de seguridad");
        };
      }
      const ALLOWED_HOST = "qtixbiikhvhzwshfgyeo.supabase.co";
      const ALLOWED_EDGE_PATH = "/functions/v1/terminal-sync/campaigns";
      const ALLOWED_REST_PATH = "/rest/v1/campaigns";
      window.fetch = async (input, init) => {
        const urlStr = typeof input === "string" ? input : input && input.url ? input.url : String(input);
        const method = (init && init.method || input && input.method || "GET").toUpperCase();
        let parsedUrl;
        try {
          parsedUrl = new URL(urlStr, window.location.href);
        } catch (err) {
          log(`   [DENY-BY-DEFAULT] URL malformada bloqueada: ${urlStr}`);
          throw new TypeError(`[DENY-BY-DEFAULT] URL inv\xE1lida: ${urlStr}`);
        }
        if (parsedUrl.protocol === "file:") {
          return realFetch(input, init);
        }
        if (parsedUrl.protocol !== "https:") {
          log(`   [DENY-BY-DEFAULT] Protocolo inseguro bloqueado: ${parsedUrl.protocol} (${urlStr})`);
          throw new TypeError(`[DENY-BY-DEFAULT] Solo se permite HTTPS: ${urlStr}`);
        }
        if (parsedUrl.hostname !== ALLOWED_HOST) {
          log(`   [DENY-BY-DEFAULT] Host no autorizado bloqueado: ${parsedUrl.hostname}`);
          throw new TypeError(`[DENY-BY-DEFAULT] Host no autorizado: ${parsedUrl.hostname}`);
        }
        if (method !== "GET") {
          log(`   [DENY-BY-DEFAULT] M\xE9todo no autorizado bloqueado: ${method} en ${parsedUrl.pathname}`);
          throw new TypeError(`[DENY-BY-DEFAULT] M\xE9todo no autorizado: ${method}`);
        }
        const isAllowedEdge = parsedUrl.pathname === ALLOWED_EDGE_PATH;
        const isAllowedRest = parsedUrl.pathname === ALLOWED_REST_PATH;
        if (!isAllowedEdge && !isAllowedRest) {
          log(`   [DENY-BY-DEFAULT] Ruta no autorizada bloqueada: ${parsedUrl.pathname}`);
          throw new TypeError(`[DENY-BY-DEFAULT] Ruta no autorizada: ${parsedUrl.pathname}`);
        }
        lastSyncUrl = urlStr;
        lastSyncHeaders = init && init.headers || {};
        const strictInit = { ...init || {}, redirect: "error" };
        const resp = await realFetch(input, strictInit);
        if (isAllowedEdge) {
          lastSyncStatus = resp.status;
          if (resp.ok) {
            try {
              const clone = resp.clone();
              lastRawSyncPayload = await clone.json();
            } catch (e) {
            }
          }
        }
        return resp;
      };
      log("2. Inyectando credenciales y configuraci\xF3n en perfil aislado...");
      localStorage.setItem("kioscoprox_installation_id", pilotConfig.installationId);
      await storeTerminalToken(pilotConfig.terminalToken);
      setAdConfig({
        enabled: true,
        supabaseUrl: pilotConfig.supabaseUrl,
        supabaseKey: pilotConfig.supabaseKey,
        useTerminalSyncCampaigns: true
      });
      const storedToken = await getStoredTerminalToken();
      const isTokenStored = storedToken === pilotConfig.terminalToken;
      results.step1_credentials_stored = isTokenStored;
      log("   Credencial almacenada en perfil aislado: " + (isTokenStored ? "OK" : "ERROR"));
      log("3. Ejecutando syncCampaignsRemotely() autenticado contra terminal-sync/campaigns...");
      localStorage.removeItem("kioscoprox_offers_cache");
      const downloadedCampaigns = await syncCampaignsRemotely({
        installationId: pilotConfig.installationId
      });
      const isHttp200AndArray = Array.isArray(downloadedCampaigns) && lastSyncStatus === 200;
      results.step2_http_200_sync = Boolean(isHttp200AndArray && lastSyncUrl && lastSyncUrl.includes("/terminal-sync/campaigns"));
      const allActive = downloadedCampaigns.every((c) => {
        const st = getCampaignStatus(c);
        return st === "active";
      });
      results.step3_campaigns_valid = isHttp200AndArray && allActive;
      const expectExclusion = Boolean(pilotConfig.expectExclusion);
      const PILOT_UUID = "b2b00000-7e57-4000-8000-000000000001";
      const rawMatches = Array.isArray(lastRawSyncPayload) ? lastRawSyncPayload.filter((c) => c.id === PILOT_UUID) : [];
      const clientMatches = Array.isArray(downloadedCampaigns) ? downloadedCampaigns.filter((c) => c.id === PILOT_UUID) : [];
      const cachedCampaigns = getCachedCampaigns();
      const cacheMatches = Array.isArray(cachedCampaigns) ? cachedCampaigns.filter((c) => c.id === PILOT_UUID) : [];
      let isPilotConditionMet = false;
      if (expectExclusion) {
        log("3b. Verificando exclusi\xF3n estricta de campa\xF1a piloto por cupo agotado...");
        const rawExcluded = rawMatches.length === 0;
        const clientExcluded = clientMatches.length === 0;
        const cacheExcluded = cacheMatches.length === 0;
        const commercialPresent = downloadedCampaigns.length > 0 && allActive;
        isPilotConditionMet = isHttp200AndArray && rawExcluded && clientExcluded && cacheExcluded && commercialPresent;
        results.step3b_pilot_campaign_verified = isPilotConditionMet;
        results.step3b_pilot_campaign_excluded = isPilotConditionMet;
        log("   Campa\xF1a piloto excluida en red, cliente y cach\xE9: " + (isPilotConditionMet ? "OK" : "ERROR"));
        if (!rawExcluded) log("   [FALLO EXCLUSI\xD3N] Campa\xF1a piloto encontrada en payload crudo de red");
        if (!clientExcluded) log("   [FALLO EXCLUSI\xD3N] Campa\xF1a piloto encontrada en array procesado por el cliente");
        if (!cacheExcluded) log("   [FALLO EXCLUSI\xD3N] Campa\xF1a piloto encontrada en cach\xE9 local");
        if (!commercialPresent) log("   [FALLO EXCLUSI\xD3N] Campa\xF1as comerciales vigentes ausentes o inactivas");
        results.details.pilotCampaign = {
          id: PILOT_UUID,
          expectedExclusion: true,
          excludedFromRaw: rawExcluded,
          excludedFromClient: clientExcluded,
          excludedFromCache: cacheExcluded,
          commercialCampaignsActive: commercialPresent
        };
      } else {
        log("3b. Verificando presencia y configuraci\xF3n exacta de la campa\xF1a piloto con cupo...");
        const rawPilot = rawMatches.length === 1 ? rawMatches[0] : null;
        const clientPilot = clientMatches.length === 1 ? clientMatches[0] : null;
        const pilotPresent = rawPilot !== null && clientPilot !== null;
        const pilotStatusActive = (rawPilot?.status ?? clientPilot?.status) === "active";
        const rawDailyLimit = rawPilot?.daily_limit ?? rawPilot?.dailyLimit ?? clientPilot?.daily_limit ?? clientPilot?.dailyLimit;
        const pilotDailyLimitIs3 = Number(rawDailyLimit) === 3;
        const rawLimitEnabled = rawPilot?.is_daily_limit_enabled ?? rawPilot?.isDailyLimitEnabled ?? clientPilot?.is_daily_limit_enabled ?? clientPilot?.isDailyLimitEnabled;
        const pilotLimitEnabled = rawLimitEnabled === true;
        const pilotVigente = clientPilot ? getCampaignStatus(clientPilot) === "active" : false;
        isPilotConditionMet = pilotPresent && pilotStatusActive && pilotDailyLimitIs3 && pilotLimitEnabled && pilotVigente;
        results.step3b_pilot_campaign_verified = isPilotConditionMet;
        results.step3b_pilot_campaign_excluded = false;
        log("   Campa\xF1a piloto presente y verificada con cupo=3: " + (isPilotConditionMet ? "OK" : "ERROR"));
        results.details.pilotCampaign = rawPilot ? {
          id: rawPilot.id,
          title: rawPilot.title,
          daily_limit: rawPilot.daily_limit ?? rawPilot.dailyLimit,
          is_daily_limit_enabled: rawPilot.is_daily_limit_enabled ?? rawPilot.isDailyLimitEnabled,
          status: rawPilot.status,
          vigente: pilotVigente
        } : null;
      }
      log("4. Verificando persistencia en cach\xE9 local...");
      const isCacheConsistent = cachedCampaigns.length === downloadedCampaigns.length && JSON.stringify(cachedCampaigns.map((c) => c.id)) === JSON.stringify(downloadedCampaigns.map((c) => c.id));
      results.step4_cache_updated = isCacheConsistent;
      results.details.syncStats = {
        endpointCalled: lastSyncUrl,
        hasAuthHeaders: Boolean(lastSyncHeaders["x-terminal-id"] && lastSyncHeaders["x-terminal-token"]),
        downloadedCount: downloadedCampaigns.length,
        cachedCount: cachedCampaigns.length,
        allVigentes: allActive,
        pilotCampaignFound: !expectExclusion && isPilotConditionMet,
        pilotCampaignExcluded: expectExclusion && isPilotConditionMet
      };
      log("5. Ejecutando prueba de resiliencia Offline...");
      const originalOnLine = navigator.onLine;
      Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
      const offlineCampaigns = await syncCampaignsRemotely({
        installationId: pilotConfig.installationId
      });
      Object.defineProperty(navigator, "onLine", { value: originalOnLine, configurable: true });
      const isOfflinePreserved = offlineCampaigns.length === cachedCampaigns.length && offlineCampaigns.length > 0;
      const offlineExclusionPreserved = expectExclusion ? !offlineCampaigns.some((c) => c.id === PILOT_UUID) : true;
      results.step5_offline_resilience = isOfflinePreserved && offlineExclusionPreserved;
      log("   Cach\xE9 preservado en modo offline: " + (results.step5_offline_resilience ? "OK" : "ERROR"));
      if (expectExclusion && !offlineExclusionPreserved) {
        log("   [FALLO OFFLINE] Modo offline reintrodujo la campa\xF1a piloto");
      }
      log("6. Verificando reversi\xF3n limpia a modo legacy (useTerminalSyncCampaigns = false)...");
      setAdConfig({
        enabled: true,
        supabaseUrl: pilotConfig.supabaseUrl,
        supabaseKey: pilotConfig.supabaseKey,
        useTerminalSyncCampaigns: false
      });
      await syncCampaignsRemotely({ installationId: pilotConfig.installationId });
      const isRevertedToLegacy = lastSyncUrl && lastSyncUrl.includes("/rest/v1/campaigns");
      results.step6_legacy_reversion = Boolean(isRevertedToLegacy);
      log("   Ruta revertida a REST legacy: " + (isRevertedToLegacy ? "OK" : "ERROR"));
    } catch (err) {
      log("ERROR EN RUNNER SUITE: " + err.message);
      results.error = err.message;
    } finally {
      window.fetch = realFetch;
    }
    const allPassed = results.step1_credentials_stored && results.step2_http_200_sync && results.step3_campaigns_valid && results.step3b_pilot_campaign_verified && results.step4_cache_updated && results.step5_offline_resilience && results.step6_legacy_reversion;
    return {
      success: allPassed,
      results,
      logs
    };
  };
})();
