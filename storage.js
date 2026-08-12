(() => {
  const localKey = "simpleInventoryApp_v1";
  const config = window.INVENTORY_CONFIG || {};
  const remoteEnabled = Boolean(config.supabaseUrl && config.supabaseAnonKey && window.supabase);
  let client = null;
  let channel = null;
  let saveQueue = Promise.resolve();

  function getClient() {
    if (!client && remoteEnabled) client = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
    return client;
  }

  function isRemote() {
    return remoteEnabled;
  }

  function saveLocal(state) {
    localStorage.setItem(localKey, JSON.stringify(state));
  }

  async function loadRemote() {
    const db = getClient();
    const [productsResult, historyResult, settingsResult] = await Promise.all([
      db.from("inventory_products").select("id,code,name,location,quantity,reorder_point,updated_at"),
      db.from("inventory_history").select("id,product_id,date,type,quantity,operator,note,updated_at"),
      db.from("inventory_settings").select("id,prefix,digits,next_number,counters,updated_at").eq("id", "main").maybeSingle()
    ]);
    if (productsResult.error) throw productsResult.error;
    if (historyResult.error) throw historyResult.error;
    if (settingsResult.error) throw settingsResult.error;
    const products = productsResult.data || [];
    const history = historyResult.data || [];
    if (!products.length && !history.length && !settingsResult.data) return null;
    return {
      products: products.map(row => ({ id: row.id, code: row.code, name: row.name, location: row.location, quantity: row.quantity, reorderPoint: row.reorder_point })),
      history: history.map(row => ({ id: row.id, productId: row.product_id, date: row.date, type: row.type, quantity: row.quantity, operator: row.operator, note: row.note })),
      codeSettings: settingsResult.data ? { prefix: settingsResult.data.prefix, digits: settingsResult.data.digits, nextNumber: settingsResult.data.next_number, counters: settingsResult.data.counters || {} } : undefined
    };
  }

  async function saveRemote(state) {
    const db = getClient();
    const now = new Date().toISOString();
    const products = state.products.map(product => ({ id: product.id, code: product.code, name: product.name, location: product.location, quantity: product.quantity, reorder_point: product.reorderPoint, updated_at: now }));
    const history = state.history.map(item => ({ id: item.id, product_id: item.productId, date: item.date, type: item.type, quantity: item.quantity, operator: item.operator, note: item.note || "", updated_at: now }));
    const settings = { id: "main", prefix: state.codeSettings?.prefix || "ITEM", digits: state.codeSettings?.digits || 4, next_number: state.codeSettings?.nextNumber || 1, counters: state.codeSettings?.counters || {}, updated_at: now };
    const productIds = products.map(row => row.id);
    const historyIds = history.map(row => row.id);
    const productDelete = productIds.length ? db.from("inventory_products").delete().not("id", "in", `(${productIds.join(",")})`) : db.from("inventory_products").delete().neq("id", "__none__");
    const historyDelete = historyIds.length ? db.from("inventory_history").delete().not("id", "in", `(${historyIds.join(",")})`) : db.from("inventory_history").delete().neq("id", "__none__");
    const results = await Promise.all([
      productDelete,
      historyDelete,
      products.length ? db.from("inventory_products").upsert(products) : Promise.resolve({ error: null }),
      history.length ? db.from("inventory_history").upsert(history) : Promise.resolve({ error: null }),
      db.from("inventory_settings").upsert(settings)
    ]);
    const error = results.find(result => result.error)?.error;
    if (error) throw error;
  }

  function save(state) {
    saveLocal(state);
    if (!remoteEnabled) return Promise.resolve();
    saveQueue = saveQueue.then(() => saveRemote(state)).catch(error => {
      console.error("Supabaseへの保存に失敗しました", error);
      window.dispatchEvent(new CustomEvent("inventory-sync-error", { detail: error }));
    });
    return saveQueue;
  }

  function subscribe(onChange) {
    if (!remoteEnabled || !config.enableRealtime) return () => {};
    const db = getClient();
    channel = db.channel("inventory-live-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "inventory_products" }, onChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "inventory_history" }, onChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "inventory_settings" }, onChange)
      .subscribe();
    return () => { if (channel) db.removeChannel(channel); };
  }

  window.inventoryStorage = { isRemote, loadRemote, save, subscribe };
})();
