const STORAGE_KEY = "simpleInventoryApp_v1";
const USERS_KEY = "inventory_users";
const SESSION_KEY = "inventory_session";
const SESSION_HOURS = 8;
const INITIAL_ADMIN_USERNAME = "admin";
const INITIAL_ADMIN_PASSWORD = "Admin@1234";
const DEFAULT_CODE_SETTINGS = { prefix: "ITEM", digits: 4, nextNumber: 1, counters: {} };

const initialProducts = [
  { id: "p-001", code: "A-001", name: "コピー用紙 A4", location: "倉庫A 棚1", quantity: 120, reorderPoint: 30 },
  { id: "p-002", code: "B-010", name: "ボールペン 黒", location: "事務所 棚2", quantity: 18, reorderPoint: 20 },
  { id: "p-003", code: "C-204", name: "段ボール 120サイズ", location: "倉庫B 棚3", quantity: 0, reorderPoint: 10 }
];

const initialHistory = [
  { id: "h-001", date: "2026-08-12T09:00:00.000Z", productId: "p-001", type: "入庫", quantity: 120, operator: "初期登録", note: "初期データ" },
  { id: "h-002", date: "2026-08-12T09:00:00.000Z", productId: "p-002", type: "入庫", quantity: 18, operator: "初期登録", note: "初期データ" },
  { id: "h-003", date: "2026-08-12T09:00:00.000Z", productId: "p-003", type: "入庫", quantity: 0, operator: "初期登録", note: "初期データ" }
];

let state = loadState();
let users = [];
let currentUser = null;

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && Array.isArray(saved.products) && Array.isArray(saved.history)) {
      saved.codeSettings = { ...DEFAULT_CODE_SETTINGS, ...(saved.codeSettings || {}) };
      return saved;
    }
  } catch (error) {
    console.warn("保存データの読み込みに失敗しました", error);
  }
  return {
    products: structuredClone(initialProducts),
    history: structuredClone(initialHistory),
    codeSettings: { ...DEFAULT_CODE_SETTINGS }
  };
}

function loadUsers() {
  try {
    const saved = JSON.parse(localStorage.getItem(USERS_KEY));
    return Array.isArray(saved) ? saved : [];
  } catch (error) {
    console.warn("ユーザー情報の読み込みに失敗しました", error);
    return [];
  }
}

function saveUsers() {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

function randomSalt() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
}

async function hashPassword(password, salt) {
  const data = new TextEncoder().encode(`${salt}:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

function isAdmin() {
  return currentUser?.role === "admin";
}

function requireLogin() {
  if (currentUser) return true;
  showToast("ログインしてください");
  showLogin();
  return false;
}

function requireAdmin() {
  if (!requireLogin()) return false;
  if (isAdmin()) return true;
  showToast("この操作は管理者のみ実行できます");
  return false;
}

function setSyncStatus(message, className = "") {
  const element = document.getElementById("syncStatus");
  if (!element) return;
  element.textContent = message;
  element.className = `sync-status ${className}`.trim();
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  if (window.inventoryStorage?.isRemote()) {
    setSyncStatus("共有DBへ保存中…", "syncing");
    window.inventoryStorage.save(state).then(() => {
      setSyncStatus(`共有DB同期済み ${formatDate(new Date().toISOString())}`, "connected");
    });
  }
}

function ensureCodeSettings() {
  state.codeSettings = { ...DEFAULT_CODE_SETTINGS, ...(state.codeSettings || {}) };
  state.codeSettings.counters = { ...(state.codeSettings.counters || {}) };
  state.codeSettings.prefix = String(state.codeSettings.prefix || DEFAULT_CODE_SETTINGS.prefix)
    .replace(/[^A-Za-z0-9_-]/g, "")
    .slice(0, 10) || DEFAULT_CODE_SETTINGS.prefix;
  state.codeSettings.digits = Math.min(6, Math.max(3, Number(state.codeSettings.digits) || DEFAULT_CODE_SETTINGS.digits));
  state.codeSettings.nextNumber = Math.max(1, Number(state.codeSettings.nextNumber) || 1);
  return state.codeSettings;
}

function createId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function generateProductCode(prefix, digits) {
  const settings = ensureCodeSettings();
  const safePrefix = String(prefix || settings.prefix)
    .replace(/[^A-Za-z0-9_-]/g, "")
    .slice(0, 10) || DEFAULT_CODE_SETTINGS.prefix;
  const safeDigits = Math.min(6, Math.max(3, Number(digits) || settings.digits));
  const usedCodes = new Set(state.products.map(product => String(product.code || "").toUpperCase()));
  const counterKey = safePrefix.toUpperCase();
  let nextNumber = Math.max(1, Number(settings.counters[counterKey]) || 1);

  // 既存データを走査し、同じ接頭辞の最大番号より小さくならないようにする
  state.products.forEach(product => {
    const parts = String(product.code || "").split("-");
    if (parts.length === 2 && parts[0].toUpperCase() === safePrefix.toUpperCase() && /^\d+$/.test(parts[1])) {
      nextNumber = Math.max(nextNumber, Number(parts[1]) + 1);
    }
  });

  let code;
  do {
    code = `${safePrefix}-${String(nextNumber).padStart(safeDigits, "0")}`;
    nextNumber += 1;
  } while (usedCodes.has(code.toUpperCase()));

  settings.prefix = safePrefix;
  settings.digits = safeDigits;
  settings.counters[counterKey] = nextNumber;
  settings.nextNumber = nextNumber;
  return code;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;"
  }[char]));
}

function productById(id) {
  return state.products.find(product => product.id === id);
}

function statusFor(product) {
  if (product.quantity === 0) return ["欠品", "out"];
  if (product.quantity <= product.reorderPoint) return ["要補充", "low"];
  return ["適正在庫", "ok"];
}

function formatDate(iso) {
  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(iso));
}

function showToast(message) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2500);
}

function render() {
  renderSummary();
  renderInventoryFilters();
  renderInventory();
  renderReorder();
  renderProductSelect();
  renderHistory();
  renderUsers();
}

function renderSummary() {
  document.getElementById("totalProducts").textContent = state.products.length;
  document.getElementById("totalQuantity").textContent = state.products.reduce((sum, product) => sum + product.quantity, 0);
  document.getElementById("lowStockCount").textContent = state.products.filter(product => product.quantity <= product.reorderPoint).length;
  document.getElementById("historyCount").textContent = state.history.length;
}

function renderInventoryFilters() {
  const select = document.getElementById("inventoryLocationFilter");
  const current = select.value;
  const locations = [...new Set(state.products.map(product => product.location).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ja"));
  select.innerHTML = '<option value="">保管場所：すべて</option>' + locations.map(location => `<option value="${escapeHtml(location)}">保管場所：${escapeHtml(location)}</option>`).join("");
  if (locations.includes(current)) select.value = current;
}

function renderInventory() {
  const query = document.getElementById("inventorySearch").value.trim().toLowerCase();
  const location = document.getElementById("inventoryLocationFilter").value;
  const status = document.getElementById("inventoryStatusFilter").value;
  const products = state.products.filter(product => {
    const matchesQuery = [product.code, product.name, product.location].some(value => String(value ?? "").toLowerCase().includes(query));
    const matchesLocation = !location || product.location === location;
    const matchesStatus = !status || statusFor(product)[1] === status;
    return matchesQuery && matchesLocation && matchesStatus;
  });
  document.getElementById("inventoryResultCount").textContent = `${products.length} / ${state.products.length} 件`;
  document.getElementById("inventoryBody").innerHTML = products.length ? products.map(product => {
    const [label, className] = statusFor(product);
    return `<tr><td>${escapeHtml(product.code)}</td><td><strong>${escapeHtml(product.name)}</strong></td><td>${escapeHtml(product.location)}</td><td class="quantity">${product.quantity}</td><td>${product.reorderPoint}</td><td><span class="status ${className}">${label}</span></td><td><button class="table-action edit-product" data-id="${product.id}">編集</button><button class="table-action delete-product" data-id="${product.id}">削除</button></td></tr>`;
  }).join("") : `<tr><td colspan="7" class="empty">該当する商品がありません。</td></tr>`;
}

function renderReorder() {
  const products = state.products.filter(product => product.quantity <= product.reorderPoint);
  document.getElementById("reorderBody").innerHTML = products.length ? products.map(product => `<tr><td>${escapeHtml(product.code)}</td><td><strong>${escapeHtml(product.name)}</strong></td><td>${escapeHtml(product.location)}</td><td class="quantity">${product.quantity}</td><td>${product.reorderPoint}</td><td class="status low">あと ${Math.max(product.reorderPoint - product.quantity, 0)} 個</td><td><button class="table-action start-transaction" data-id="${product.id}">入出庫登録</button></td></tr>`).join("") : `<tr><td colspan="7" class="empty">要補充の商品はありません。適正在庫です。</td></tr>`;
}

function renderProductSelect() {
  const select = document.getElementById("productSelect");
  const previous = select.value;
  select.innerHTML = state.products.length ? state.products.map(product => `<option value="${product.id}">${escapeHtml(product.code)}：${escapeHtml(product.name)}（現在庫 ${product.quantity}）</option>`).join("") : `<option value="">商品を先に登録してください</option>`;
  if (state.products.some(product => product.id === previous)) select.value = previous;
}

function renderHistory() {
  const query = document.getElementById("historySearch").value.trim().toLowerCase();
  const histories = [...state.history].sort((a, b) => new Date(b.date) - new Date(a.date)).filter(item => {
    const product = productById(item.productId);
    return [item.operator, item.note, product?.code, product?.name].some(value => String(value ?? "").toLowerCase().includes(query));
  });
  document.getElementById("historyResultCount").textContent = `${histories.length} / ${state.history.length} 件`;
  document.getElementById("historyBody").innerHTML = histories.length ? histories.map(item => {
    const product = productById(item.productId);
    return `<tr><td>${formatDate(item.date)}</td><td>${escapeHtml(product?.code || "削除済み")}</td><td>${escapeHtml(product?.name || "")}</td><td><span class="status ${item.type === "入庫" ? "ok" : "low"}">${item.type}</span></td><td class="quantity">${item.type === "入庫" ? "+" : "-"}${item.quantity}</td><td>${escapeHtml(item.operator)}</td><td>${escapeHtml(item.note)}</td></tr>`;
  }).join("") : `<tr><td colspan="7" class="empty">履歴がありません。</td></tr>`;
}

function renderUsers() {
  const body = document.getElementById("usersBody");
  if (!body) return;
  body.innerHTML = users.length ? users.map(user => `<tr><td><strong>${escapeHtml(user.username)}</strong></td><td><span class="role-badge ${user.role}">${user.role === "admin" ? "管理者" : "一般"}</span></td><td>${user.mustChangePassword ? "未変更" : "変更済み"}</td><td>${user.lastLogin ? formatDate(user.lastLogin) : "未ログイン"}</td><td><button class="table-action change-role" data-username="${escapeHtml(user.username)}">権限変更</button><button class="table-action delete-user" data-username="${escapeHtml(user.username)}">削除</button></td></tr>`).join("") : `<tr><td colspan="5" class="empty">ユーザーがありません。</td></tr>`;
  document.querySelectorAll(".admin-only").forEach(element => element.hidden = !isAdmin());
}

function toggleCodeInput() {
  const auto = document.getElementById("autoCodeMode").checked;
  const codeInput = document.getElementById("productCode");
  codeInput.readOnly = auto;
  codeInput.placeholder = auto ? "自動生成されます" : "例：A-001";
}

function applyAutoCode() {
  if (!document.getElementById("autoCodeMode").checked) return;
  const prefix = document.getElementById("codePrefix").value.trim();
  const digits = Number(document.getElementById("codeDigits").value);
  document.getElementById("productCode").value = generateProductCode(prefix, digits);
  saveState();
}

function openProductDialog(product = null) {
  const dialog = document.getElementById("productDialog");
  const settings = ensureCodeSettings();
  document.getElementById("dialogTitle").textContent = product ? "商品を編集" : "商品を追加";
  document.getElementById("editingProductId").value = product?.id || "";
  document.getElementById("autoCodeMode").checked = !product;
  document.getElementById("codePrefix").value = settings.prefix;
  document.getElementById("codeDigits").value = String(settings.digits);
  document.getElementById("productCode").value = product?.code || generateProductCode(settings.prefix, settings.digits);
  toggleCodeInput();
  document.getElementById("productName").value = product?.name || "";
  document.getElementById("storageLocation").value = product?.location || "";
  document.getElementById("productQuantity").value = product?.quantity ?? 0;
  document.getElementById("reorderPoint").value = product?.reorderPoint ?? 0;
  dialog.showModal();
}

function switchTab(tabName) {
  document.querySelectorAll(".tab").forEach(tab => tab.classList.toggle("active", tab.dataset.tab === tabName));
  document.querySelectorAll(".panel").forEach(panel => panel.classList.toggle("active-panel", panel.id === tabName));
}

document.querySelectorAll(".tab").forEach(tab => tab.addEventListener("click", () => {
  if (tab.dataset.tab === "users" && !requireAdmin()) return;
  if (requireLogin()) switchTab(tab.dataset.tab);
}));
document.getElementById("autoCodeMode").addEventListener("change", () => {
  toggleCodeInput();
  if (document.getElementById("autoCodeMode").checked && !document.getElementById("editingProductId").value) applyAutoCode();
});
document.getElementById("codePrefix").addEventListener("input", () => {
  if (document.getElementById("autoCodeMode").checked && !document.getElementById("editingProductId").value) applyAutoCode();
});
document.getElementById("codeDigits").addEventListener("change", () => {
  if (document.getElementById("autoCodeMode").checked && !document.getElementById("editingProductId").value) applyAutoCode();
});
document.getElementById("inventorySearch").addEventListener("input", renderInventory);
document.getElementById("inventoryLocationFilter").addEventListener("change", renderInventory);
document.getElementById("inventoryStatusFilter").addEventListener("change", renderInventory);
document.getElementById("clearInventoryFilters").addEventListener("click", () => {
  document.getElementById("inventorySearch").value = "";
  document.getElementById("inventoryLocationFilter").value = "";
  document.getElementById("inventoryStatusFilter").value = "";
  renderInventory();
});
document.getElementById("historySearch").addEventListener("input", renderHistory);
document.getElementById("addProductBtn").addEventListener("click", () => { if (requireAdmin()) openProductDialog(); });
document.getElementById("clearAllBtn").addEventListener("click", () => {
  if (!requireAdmin()) return;
  if (!state.products.length) {
    showToast("削除する商品がありません");
    return;
  }
  if (!confirm(`登録されている${state.products.length}品目と関連する履歴をすべて削除しますか？`)) return;
  state.products = [];
  state.history = [];
  state.codeSettings = { ...DEFAULT_CODE_SETTINGS, counters: {} };
  saveState();
  render();
  showToast("全商品を削除しました");
});
document.getElementById("closeDialogBtn").addEventListener("click", () => document.getElementById("productDialog").close());
document.getElementById("cancelDialogBtn").addEventListener("click", () => document.getElementById("productDialog").close());
document.addEventListener("click", event => {
  const edit = event.target.closest(".edit-product");
  if (edit && requireAdmin()) openProductDialog(productById(edit.dataset.id));
  const deleteButton = event.target.closest(".delete-product");
  if (deleteButton) {
    if (!requireAdmin()) return;
    const product = productById(deleteButton.dataset.id);
    if (!product) return;
    if (!confirm(`「${product.name}（${product.code}）」を削除しますか？\nこの商品の入出庫履歴も削除されます。`)) return;
    state.products = state.products.filter(item => item.id !== product.id);
    state.history = state.history.filter(item => item.productId !== product.id);
    saveState();
    render();
    showToast(`${product.name}を削除しました`);
    return;
  }
  const start = event.target.closest(".start-transaction");
  if (start) {
    switchTab("transaction");
    document.getElementById("productSelect").value = start.dataset.id;
    document.getElementById("transactionQuantity").focus();
  }
});

document.getElementById("productForm").addEventListener("submit", event => {
  event.preventDefault();
  if (!requireAdmin()) return;
  const id = document.getElementById("editingProductId").value;
  const code = document.getElementById("productCode").value.trim();
  const data = {
    code,
    name: document.getElementById("productName").value.trim(),
    location: document.getElementById("storageLocation").value.trim(),
    quantity: Number(document.getElementById("productQuantity").value),
    reorderPoint: Number(document.getElementById("reorderPoint").value)
  };
  if (!data.code) {
    showToast("品番を入力するか、自動採番を有効にしてください");
    return;
  }
  if (state.products.some(product => product.code.toUpperCase() === data.code.toUpperCase() && product.id !== id)) {
    showToast("同じ品番がすでに登録されています");
    return;
  }
  if (id) Object.assign(productById(id), data);
  else state.products.push({ id: createId("p"), ...data });
  ensureCodeSettings();
  saveState();
  render();
  document.getElementById("productDialog").close();
  showToast(id ? "商品を更新しました" : "商品を追加しました");
});

document.getElementById("transactionForm").addEventListener("submit", event => {
  event.preventDefault();
  if (!requireLogin()) return;
  const product = productById(document.getElementById("productSelect").value);
  const type = document.getElementById("transactionType").value;
  const quantity = Number(document.getElementById("transactionQuantity").value);
  const operator = document.getElementById("operator").value.trim();
  const note = document.getElementById("note").value.trim();
  const message = document.getElementById("transactionMessage");
  if (!product || !Number.isInteger(quantity) || quantity < 1 || !operator) {
    message.textContent = "商品、数量（1以上の整数）、担当者を入力してください。";
    message.className = "message error";
    return;
  }
  if (type === "出庫" && quantity > product.quantity) {
    message.textContent = `出庫できません。現在庫は ${product.quantity} 個です。`;
    message.className = "message error";
    return;
  }
  product.quantity += type === "入庫" ? quantity : -quantity;
  state.history.push({ id: createId("h"), date: new Date().toISOString(), productId: product.id, type, quantity, operator, note });
  saveState();
  render();
  event.target.reset();
  message.textContent = `${product.name}の${type}を登録しました。現在庫は ${product.quantity} 個です。`;
  message.className = "message success";
});

document.getElementById("exportCsvBtn").addEventListener("click", () => {
  if (!requireLogin()) return;
  const rows = [["record_type", "id", "code", "name", "location", "quantity", "reorder_point", "date", "transaction_type", "operator", "note"]];
  state.products.forEach(product => rows.push(["product", product.id, product.code, product.name, product.location, product.quantity, product.reorderPoint, "", "", "", ""]));
  state.history.forEach(history => {
    const product = productById(history.productId) || {};
    rows.push(["history", history.id, product.code || "", product.name || "", "", history.quantity, "", history.date, history.type, history.operator, history.note]);
  });
  const csv = "\ufeff" + rows.map(row => row.map(value => `"${String(value ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `inventory-${new Date().toISOString().slice(0, 10)}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
});

document.getElementById("importCsvInput").addEventListener("change", event => {
  if (!requireAdmin()) { event.target.value = ""; return; }
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const lines = reader.result.replace(/^\ufeff/, "").split(/\r?\n/).filter(Boolean);
      const records = lines.slice(1).map(parseCsvLine);
      const importedProducts = records.filter(row => row[0] === "product").map(row => ({ id: row[1] || createId("p"), code: row[2] || "", name: row[3], location: row[4], quantity: Number(row[5]), reorderPoint: Number(row[6]) }));
      if (!importedProducts.length) throw new Error("商品データがありません");
      state = { products: [], history: [], codeSettings: { ...DEFAULT_CODE_SETTINGS, counters: {} } };
      importedProducts.forEach(product => {
        if (!product.code || state.products.some(existing => existing.code.toUpperCase() === product.code.toUpperCase())) {
          product.code = generateProductCode(state.codeSettings.prefix, state.codeSettings.digits);
        }
        state.products.push(product);
      });
      state.history = records.filter(row => row[0] === "history").map(row => ({ id: row[1] || createId("h"), productId: state.products.find(product => product.code === row[2])?.id || "", date: row[7] || new Date().toISOString(), type: row[8], quantity: Number(row[5] || 0), operator: row[9], note: row[10] }));
      saveState();
      render();
      showToast(`${state.products.length}品目をインポートしました`);
    } catch (error) {
      showToast("CSVを読み込めませんでした。形式を確認してください");
    }
    event.target.value = "";
  };
  reader.readAsText(file, "UTF-8");
});

function parseCsvLine(line) {
  const result = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"' && line[i + 1] === '"') { current += '"'; i++; }
    else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) { result.push(current); current = ""; }
    else current += char;
  }
  result.push(current);
  return result;
}

document.getElementById("resetBtn").addEventListener("click", () => {
  if (confirm("保存した商品・履歴を初期データに戻しますか？")) {
    state = { products: structuredClone(initialProducts), history: structuredClone(initialHistory), codeSettings: { ...DEFAULT_CODE_SETTINGS, counters: {} } };
    saveState();
    render();
    showToast("初期データに戻しました");
  }
});

async function initializeRemoteSync() {
  if (!window.inventoryStorage?.isRemote()) {
    setSyncStatus("ローカル保存（共有DB未設定）", "local");
    return;
  }
  setSyncStatus("共有DBへ接続中…", "syncing");
  try {
    const remoteState = await window.inventoryStorage.loadRemote();
    if (remoteState) {
      state = remoteState;
      ensureCodeSettings();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      render();
    } else {
      await window.inventoryStorage.save(state);
    }
    setSyncStatus(`共有DB同期済み ${formatDate(new Date().toISOString())}`, "connected");
    window.inventoryStorage.subscribe(async () => {
      try {
        const latest = await window.inventoryStorage.loadRemote();
        if (latest) {
          state = latest;
          ensureCodeSettings();
          localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
          render();
          setSyncStatus(`他ユーザーの更新を反映 ${formatDate(new Date().toISOString())}`, "connected");
        }
      } catch (error) {
        console.error("共有DBの更新取得に失敗しました", error);
        setSyncStatus("共有DBの更新取得に失敗", "error");
      }
    });
  } catch (error) {
    console.error("Supabase接続に失敗しました", error);
    setSyncStatus("接続失敗：ローカル保存を使用中", "error");
    showToast("Supabaseに接続できないため、ローカル保存で動作しています");
  }
}

window.addEventListener("inventory-sync-error", () => {
  setSyncStatus("保存失敗：ローカル保存を使用中", "error");
  showToast("共有DBへの保存に失敗しました。設定を確認してください");
});

ensureCodeSettings();
render();
initializeRemoteSync();