function parseUrl(url) {
  const m = url.match(/^(socks[45h]?|https?):\/\/([^:\/]+):(\d+)$/);
  if (!m) return null;
  let scheme = m[1];
  if (scheme === "socks5h" || scheme === "socks") scheme = "socks5";
  return { scheme, host: m[2], port: parseInt(m[3]) };
}

function parseDomains(str) {
  return str ? str.split(",").map((d) => d.trim()).filter(Boolean) : [];
}

function buildCondition(domains, useRegex) {
  if (useRegex) return domains.map((d) => `(/${d}/.test(host))`).join(" || ");
  return domains.map((d) => {
    const suffix = d.startsWith("*.") ? d.slice(1) : "." + d;
    return `(host === "${d.replace(/^\*\./, "")}" || dnsDomainIs(host, "${suffix}"))`;
  }).join(" || ");
}

function getStorage(keys) {
  return new Promise((r) => chrome.storage.local.get(keys, r));
}

function setIcon(state) {
  const tag = state === null ? "off" : state ? "on" : "down";
  chrome.action.setIcon({ path: { "16": `icon-${tag}-16.png`, "32": `icon-${tag}-32.png`, "48": `icon-${tag}-48.png`, "128": `icon-${tag}-128.png` } });
}

function applyProxy(proxy) {
  const parsed = parseUrl(proxy.url);
  if (!parsed) return;
  const domains = parseDomains(proxy.domains);
  const autoDomains = parseDomains(proxy.autoDomains || "");
  const proxyStr = `${parsed.scheme.toUpperCase()} ${parsed.host}:${parsed.port}`;
  const useRegex = proxy.match === "regex";
  let pac;
  if (proxy.mode === "whitelist" || proxy.mode === "auto") {
    const allDomains = [...domains, ...autoDomains];
    if (allDomains.length === 0) {
      chrome.proxy.settings.set({ value: { mode: "direct" }, scope: "regular" });
      return;
    }
    const condition = buildCondition(allDomains, useRegex && proxy.mode !== "auto");
    pac = `function FindProxyForURL(url, host) {\n  if (${condition}) return "${proxyStr}";\n  return "DIRECT";\n}`;
  } else {
    const bypass = ["localhost", "127.0.0.1"];
    let condition;
    if (domains.length > 0 && useRegex) {
      const patterns = domains.map((d) => `(/${d}/.test(host))`);
      const bypassCond = bypass.map((d) => `host === "${d}"`);
      condition = [...bypassCond, ...patterns].join(" || ");
    } else {
      if (domains.length > 0) domains.forEach((d) => bypass.push(d));
      condition = buildCondition(bypass, false);
    }
    pac = `function FindProxyForURL(url, host) {\n  if (${condition}) return "DIRECT";\n  return "${proxyStr}";\n}`;
  }
  chrome.proxy.settings.set({ value: { mode: "pac_script", pacScript: { data: pac } }, scope: "regular" });
}

async function checkProxy(proxy) {
  const parsed = parseUrl(proxy.url);
  if (!parsed) return false;
  await new Promise((r) => chrome.proxy.settings.set({
    value: { mode: "fixed_servers", rules: { singleProxy: { scheme: parsed.scheme, host: parsed.host, port: parsed.port } } },
    scope: "regular"
  }, r));
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    const resp = await fetch("https://www.google.com/generate_204", { signal: ctrl.signal });
    clearTimeout(timer);
    return resp.status === 204;
  } catch {
    return false;
  }
}

let pollTimer = null;

async function runCheck() {
  const data = await getStorage(["proxies", "activeId"]);
  if (!data.activeId) return;
  const proxy = (data.proxies || []).find((p) => p.id === data.activeId);
  if (!proxy) return;
  const ok = await checkProxy(proxy);
  chrome.storage.local.set({ proxyOk: ok });
  applyProxy(proxy);
  setIcon(ok);
}

function startPolling() {
  stopPolling();
  pollTimer = setInterval(runCheck, 5000);
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

async function activate(proxy) {
  const ok = await checkProxy(proxy);
  chrome.storage.local.set({ activeId: proxy.id, proxyOk: ok });
  applyProxy(proxy);
  setIcon(ok);
  startPolling();
}

function deactivate() {
  stopPolling();
  chrome.storage.local.set({ activeId: null, proxyOk: null });
  chrome.proxy.settings.set({ value: { mode: "direct" }, scope: "regular" });
  setIcon(null);
}

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

chrome.runtime.onInstalled.addListener(async () => {
  const data = await getStorage("proxies");
  if (!data.proxies) chrome.storage.local.set({ proxies: [], activeId: null });
});

(async () => {
  const data = await getStorage(["proxies", "activeId"]);
  if (!data.activeId) return;
  const proxy = (data.proxies || []).find((p) => p.id === data.activeId);
  if (proxy) await activate(proxy);
})();

chrome.webNavigation.onErrorOccurred.addListener((details) => {
  if (details.frameId !== 0) return;
  if (!details.error.includes("net::ERR_NAME_NOT_RESOLVED")) return;
  chrome.storage.local.get(["proxies", "activeId"], (data) => {
    if (!data.activeId) return;
    const proxies = data.proxies || [];
    const proxy = proxies.find((p) => p.id === data.activeId);
    if (!proxy || proxy.mode !== "auto") return;
    let hostname;
    try { hostname = new URL(details.url).hostname; } catch { return; }
    const existing = parseDomains(proxy.autoDomains || "");
    if (existing.some((d) => hostname === d || hostname.endsWith("." + d))) return;
    existing.push(hostname);
    proxy.autoDomains = existing.join(", ");
    chrome.storage.local.set({ proxies }, () => {
      applyProxy(proxy);
      chrome.tabs.reload(details.tabId);
    });
  });
});

const handlers = {
  async getState(msg, sendResponse) {
    const data = await getStorage(["proxies", "activeId", "proxyOk"]);
    sendResponse({ proxies: data.proxies || [], activeId: data.activeId || null, proxyOk: data.proxyOk ?? null });
  },
  async save(msg, sendResponse) {
    const data = await getStorage(["proxies", "activeId"]);
    const proxies = data.proxies || [];
    if (msg.id) {
      const idx = proxies.findIndex((p) => p.id === msg.id);
      if (idx !== -1) {
        proxies[idx] = { ...proxies[idx], name: msg.name, url: msg.url, mode: msg.mode, match: msg.match, domains: msg.domains };
        if (msg._prevMode !== undefined) proxies[idx]._prevMode = msg._prevMode;
        if (msg.autoDomains !== undefined) proxies[idx].autoDomains = msg.autoDomains;
        chrome.storage.local.set({ proxies });
        if (data.activeId === msg.id) applyProxy(proxies[idx]);
      }
    } else {
      const entry = { id: genId(), name: msg.name, url: msg.url, mode: msg.mode, match: msg.match, domains: msg.domains, autoDomains: "" };
      proxies.push(entry);
      chrome.storage.local.set({ proxies });
      sendResponse({ ok: true, id: entry.id });
      return;
    }
    sendResponse({ ok: true });
  },
  async delete(msg, sendResponse) {
    const data = await getStorage(["proxies", "activeId"]);
    const proxies = (data.proxies || []).filter((p) => p.id !== msg.id);
    const activeId = data.activeId === msg.id ? null : data.activeId;
    if (data.activeId === msg.id) deactivate();
    chrome.storage.local.set({ proxies, activeId });
    sendResponse({ ok: true });
  },
  async clearAuto(msg, sendResponse) {
    const data = await getStorage(["proxies", "activeId"]);
    const proxies = data.proxies || [];
    const proxy = proxies.find((p) => p.id === msg.id);
    if (proxy) {
      proxy.autoDomains = "";
      chrome.storage.local.set({ proxies });
      if (data.activeId === msg.id) applyProxy(proxy);
    }
    sendResponse({ ok: true });
  },
  async toggle(msg, sendResponse) {
    const data = await getStorage(["proxies", "activeId"]);
    if (data.activeId === msg.id) {
      deactivate();
    } else {
      const proxy = (data.proxies || []).find((p) => p.id === msg.id);
      if (proxy) await activate(proxy);
    }
    sendResponse({ ok: true });
  }
};

chrome.runtime.onMessage.addListener((msg, _, sendResponse) => {
  const handler = handlers[msg.action];
  if (handler) {
    handler(msg, sendResponse);
    return true;
  }
});
