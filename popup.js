const $ = (id) => document.getElementById(id);
const list = $("list");
let openId = null;

function esc(s) {
  const d = document.createElement("span");
  d.textContent = s || "";
  return d.innerHTML;
}

function send(msg, cb) {
  chrome.runtime.sendMessage(msg, cb);
}

function reload() {
  send({ action: "getState" }, (s) => render(s.proxies, s.activeId, s.proxyOk));
}

function render(proxies, activeId, proxyOk) {
  list.innerHTML = "";
  proxies.forEach((p) => {
    const isActive = activeId === p.id;
    const toggleClass = isActive ? (proxyOk === false ? "btn-fail" : "btn-on") : "";
    const isOpen = openId === p.id;
    const mode = p.mode || "whitelist";
    const isAuto = mode === "auto";
    const autoDomains = p.autoDomains || "";
    const prevMode = isAuto ? (p._prevMode || "whitelist") : mode;
    const div = document.createElement("div");
    div.className = "entry";
    div.innerHTML = `
      <div class="entry-row" data-id="${p.id}">
        ${isOpen ? `<span class="name"></span>` : `<span class="name">${esc(p.name || "New proxy")}</span>`}
        <button class="btn btn-toggle ${toggleClass}" data-toggle="${p.id}">${isActive ? "ON" : "OFF"}</button>
      </div>
      <div class="entry-edit ${isOpen ? "open" : ""}" data-edit="${p.id}">
        <input class="f-name" value="${esc(p.name)}" placeholder="Name" data-id="${p.id}" data-field="name">
        <input class="f-url" value="${esc(p.url)}" placeholder="socks5://host:port" spellcheck="false" data-id="${p.id}" data-field="url">
        <div class="filter-row">
          <button class="btn ${isAuto ? "btn-active" : "btn-inactive"}" data-auto="${p.id}">AUTO</button>
          <button class="btn ${isAuto ? "btn-inactive" : "btn-active"}" data-mode="${p.id}">${prevMode === "blacklist" ? "EXCEPT" : "ONLY"}</button>
          <button class="btn ${isAuto ? "btn-inactive" : "btn-active"}" data-match="${p.id}">${(p.match || "domain") === "domain" ? "DOMAINS" : "REGEX"}</button>
        </div>
        ${isAuto ? "" : `<input class="f-domains" value="${esc(p.domains || "")}" placeholder="${(p.match || "domain") === "domain" ? "sub.domain.ext, other.42" : "^(sub\\\\.)?(domain|other)\\\\.(ext|42)$"}" spellcheck="false" data-id="${p.id}" data-field="domains">`}
        ${isAuto && autoDomains ? `<div class="auto-domains">${esc(autoDomains)}</div><button class="btn btn-clear" data-clear="${p.id}">Clear learned</button>` : ""}
        <button class="btn btn-delete" data-delete="${p.id}">Delete</button>
      </div>
    `;
    list.appendChild(div);
  });
}

$("add").addEventListener("click", () => {
  send({ action: "save", id: null, name: "", url: "", mode: "auto", domains: "" }, (res) => {
    if (res && res.id) openId = res.id;
    reload();
  });
});

list.addEventListener("click", (e) => {
  const btn = e.target;
  if (btn.dataset.toggle) {
    e.stopPropagation();
    send({ action: "toggle", id: btn.dataset.toggle }, reload);
    return;
  }
  if (btn.dataset.delete) {
    openId = null;
    send({ action: "delete", id: btn.dataset.delete }, reload);
    return;
  }
  if (btn.dataset.clear) {
    send({ action: "clearAuto", id: btn.dataset.clear }, reload);
    return;
  }
  if (btn.dataset.auto) {
    send({ action: "getState" }, (s) => {
      const proxy = s.proxies.find((p) => p.id === btn.dataset.auto);
      if (!proxy) return;
      const newMode = proxy.mode === "auto" ? (proxy._prevMode || "whitelist") : "auto";
      const prevMode = proxy.mode !== "auto" ? proxy.mode : proxy._prevMode;
      send({ action: "save", id: proxy.id, name: proxy.name, url: proxy.url, mode: newMode, match: proxy.match || "domain", domains: proxy.domains, _prevMode: prevMode }, reload);
    });
    return;
  }
  if (btn.dataset.mode) {
    send({ action: "getState" }, (s) => {
      const proxy = s.proxies.find((p) => p.id === btn.dataset.mode);
      if (!proxy) return;
      const newMode = proxy.mode === "auto" ? (proxy._prevMode || "whitelist") : proxy.mode === "whitelist" ? "blacklist" : "whitelist";
      send({ action: "save", id: proxy.id, name: proxy.name, url: proxy.url, mode: newMode, match: proxy.match || "domain", domains: proxy.domains }, reload);
    });
    return;
  }
  if (btn.dataset.match) {
    send({ action: "getState" }, (s) => {
      const proxy = s.proxies.find((p) => p.id === btn.dataset.match);
      if (!proxy) return;
      if (proxy.mode === "auto") {
        const restored = proxy._prevMode || "whitelist";
        send({ action: "save", id: proxy.id, name: proxy.name, url: proxy.url, mode: restored, match: proxy.match || "domain", domains: proxy.domains }, reload);
      } else {
        const newMatch = (proxy.match || "domain") === "domain" ? "regex" : "domain";
        send({ action: "save", id: proxy.id, name: proxy.name, url: proxy.url, mode: proxy.mode, match: newMatch, domains: proxy.domains }, reload);
      }
    });
    return;
  }
  const row = btn.closest("[data-id]");
  if (row && row.classList.contains("entry-row")) {
    openId = openId === row.dataset.id ? null : row.dataset.id;
    reload();
  }
});

list.addEventListener("input", (e) => {
  const { id, field } = e.target.dataset;
  if (!id || !field) return;
  const edit = e.target.closest(".entry-edit");
  const name = edit.querySelector("[data-field='name']").value.trim();
  const url = edit.querySelector("[data-field='url']").value.trim();
  const domainsEl = edit.querySelector("[data-field='domains']");
  const domains = domainsEl ? domainsEl.value.trim() : "";
  const modeBtn = edit.querySelector("[data-mode]");
  const autoBtn = edit.querySelector("[data-auto]");
  const isAuto = autoBtn && autoBtn.classList.contains("btn-active") && autoBtn.textContent === "AUTO";
  const mode = isAuto ? "auto" : (modeBtn.textContent === "EXCEPT" ? "blacklist" : "whitelist");
  const matchBtn = edit.querySelector("[data-match]");
  const match = matchBtn ? (matchBtn.textContent === "DOMAINS" ? "domain" : "regex") : "domain";
  send({ action: "save", id, name, url, mode, match, domains });
});

reload();
