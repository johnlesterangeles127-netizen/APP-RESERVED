// storage.js — Supabase CRUD for RESERVE
// All field names match exactly what app.js uses.
// Includes connection test on boot to catch issues early.

(function () {

  // ── CACHE ──────────────────────────────────────────────────────────────────
  const cache = {
    inventory:       [],
    sales:           [],
    expenses:        [],
    monthlyTopItems: [],
    staff:           [],
    payroll:         [],
    stockLog:        [],
    menuProducts:    []
  };

  // ── SETTINGS (localStorage) ────────────────────────────────────────────────
  const SK = 'reserve_settings';
  function readLocal(k)    { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } }
  function writeLocal(k,v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch(e) { console.error(e); } }
  function getSettings()   { return readLocal(SK) || {}; }
  function saveSettings(s) { writeLocal(SK, s); }

  // ── UID ────────────────────────────────────────────────────────────────────
  function uid(prefix = 'id') {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`;
  }

  // ── BOOT ───────────────────────────────────────────────────────────────────
  async function ensureDefaults() {
    // Merge settings defaults
    const defaults = {
      currency: '₱', theme: 'light', lowStockThreshold: 10,
      categories: ['STARTERS','CHICKEN WINGS','PASTA','ALL-DAY BREAKFAST','JAPAN & KOREAN','BURGERS & SANDWICHES'],
      suppliers: ['Default Supplier']
    };
    const ex = getSettings();
    if (!ex || !ex.currency) {
      writeLocal(SK, { ...defaults, ...ex });
    } else {
      let changed = false;
      if (!ex.currency)          { ex.currency = defaults.currency; changed = true; }
      if (!ex.lowStockThreshold) { ex.lowStockThreshold = 10;       changed = true; }
      if (!ex.theme)             { ex.theme = defaults.theme;        changed = true; }
      if (!Array.isArray(ex.categories)) ex.categories = [];
      const bad = new Set(['food','beverage','supplies']);
      const mc = Array.from(new Set([...defaults.categories,...ex.categories])).filter(c=>!bad.has((c||'').toLowerCase()));
      if (mc.join()!==ex.categories.join()) { ex.categories=mc; changed=true; }
      if (!Array.isArray(ex.suppliers)) ex.suppliers=[];
      const ms = Array.from(new Set([...defaults.suppliers,...ex.suppliers]));
      if (ms.length!==ex.suppliers.length) { ex.suppliers=ms; changed=true; }
      if (changed) writeLocal(SK, ex);
    }

    // Test connection first
    const ok = await _testConnection();
    if (!ok) {
      console.error('⛔ RESERVE: Cannot connect to Supabase. Check your URL and ANON KEY in supabase.js');
      return;
    }
    console.log('✅ RESERVE: Supabase connected');

    // Load all 8 tables in parallel
    await Promise.all([
      _loadTable('inventory',        'name',   true),
      _loadTable('sales',            'date',   false),
      _loadTable('expenses',         'date',   false),
      _loadTable('monthly_top_items','month',  false),
      _loadTable('staff',            'name',   true),
      _loadTable('payroll',          'period', false),
      _loadTable('stock_log',        'date',   false, 500),
      _loadTable('menu_products',    'category', true)
    ]);

    console.log('✅ RESERVE: All data loaded —',
      `inventory:${cache.inventory.length}`,
      `sales:${cache.sales.length}`,
      `expenses:${cache.expenses.length}`,
      `staff:${cache.staff.length}`,
      `payroll:${cache.payroll.length}`,
      `stockLog:${cache.stockLog.length}`
    );
  }

  async function _testConnection() {
    try {
      const { error } = await db.from('inventory').select('id').limit(1);
      return !error;
    } catch { return false; }
  }

  async function _loadTable(table, orderCol, ascending, limit = null) {
    try {
      let q = db.from(table).select('*').order(orderCol, { ascending });
      if (limit) q = q.limit(limit);
      const { data, error } = await q;
      if (error) throw error;
      const rows = data || [];

      switch(table) {
        case 'inventory':
          cache.inventory = rows; break;
        case 'sales':
          cache.sales = rows.map(s => ({ ...s, lines: _parseJ(s.lines, []) })); break;
        case 'expenses':
          cache.expenses = rows; break;
        case 'monthly_top_items':
          cache.monthlyTopItems = rows.map(r => ({ ...r, items: _parseJ(r.items, []) })); break;
        case 'staff':
          cache.staff = rows; break;
        case 'payroll':
          cache.payroll = rows; break;
        case 'stock_log':
          cache.stockLog = rows; break;
        case 'menu_products':
          cache.menuProducts = rows; break;
      }
    } catch(e) {
      console.error(`❌ Failed to load ${table}:`, e.message || e);
    }
  }

  function _parseJ(val, fallback) {
    if (Array.isArray(val) || (val && typeof val === 'object')) return val;
    try { return JSON.parse(val); } catch { return fallback; }
  }

  // Fire-and-forget Supabase write — logs errors without blocking UI
  async function _save(label, promise) {
    try {
      const { error } = await Promise.resolve(promise);
      if (error) console.error(`❌ ${label}:`, error.message || error);
      else console.log(`✅ ${label}: saved`);
    } catch(e) {
      console.error(`❌ ${label} exception:`, e.message || e);
    }
  }

  // ── INVENTORY ──────────────────────────────────────────────────────────────
  function getInventory()  { return cache.inventory; }
  function getItemById(id) { return cache.inventory.find(i => i.id === id) || null; }

  function upsertItem(item) {
    const idx = cache.inventory.findIndex(i => i.id === item.id);
    if (idx >= 0) cache.inventory[idx] = item; else cache.inventory.push(item);
    _save(`upsert inventory [${item.name}]`, db.from('inventory').upsert(item, { onConflict: 'id' }));
    return item;
  }

  function saveInventory(items) {
    cache.inventory = items;
    items.forEach(it => _save(`upsert inventory [${it.name}]`, db.from('inventory').upsert(it, { onConflict: 'id' })));
  }

  function deleteItem(id) {
    const name = getItemById(id)?.name || id;
    cache.inventory = cache.inventory.filter(i => i.id !== id);
    _save(`delete inventory [${name}]`, db.from('inventory').delete().eq('id', id));
  }

  // ── SALES ──────────────────────────────────────────────────────────────────
  function getSales()   { return cache.sales; }
  function saveSales(s) { cache.sales = s; }

  function addSale(sale) {
    cache.sales.unshift(sale);
    _save(`insert sale [${sale.id}]`, db.from('sales').insert([{ ...sale, lines: JSON.stringify(sale.lines) }]));
    return sale;
  }

  function deleteSale(id) {
    cache.sales = cache.sales.filter(s => s.id !== id);
    _save(`delete sale [${id}]`, db.from('sales').delete().eq('id', id));
  }

  // ── EXPENSES ───────────────────────────────────────────────────────────────
  // app.js saves: id, date, account_type, category, tin, amount, note
  function getExpenses()     { return cache.expenses; }
  function saveExpenses(exp) { cache.expenses = exp; }

  function addExpense(expense) {
    cache.expenses.unshift(expense);
    _save(`insert expense [${expense.id}]`, db.from('expenses').insert([expense]));
    return expense;
  }

  function deleteExpense(id) {
    cache.expenses = cache.expenses.filter(e => e.id !== id);
    _save(`delete expense [${id}]`, db.from('expenses').delete().eq('id', id));
  }

  // ── STOCK LOG ──────────────────────────────────────────────────────────────
  // app.js calls addStockLog({ item_id, item_name, type, qty, balance, note, date })
  function getStockLog() { return cache.stockLog; }

  function addStockLog(entry) {
    const row = { id: uid('log'), ...entry };
    cache.stockLog.unshift(row);
    _save(`insert stock_log [${entry.item_name}]`, db.from('stock_log').insert([row]));
  }

  // ── STAFF ──────────────────────────────────────────────────────────────────
  // app.js saves: id, name, position, employment_type, salary, hourly_rate, contact, hire_date
  function getStaff()       { return cache.staff; }
  function getStaffById(id) { return cache.staff.find(s => s.id === id) || null; }

  function upsertStaff(staff) {
    const idx = cache.staff.findIndex(s => s.id === staff.id);
    if (idx >= 0) cache.staff[idx] = staff; else cache.staff.push(staff);
    _save(`upsert staff [${staff.name}]`, db.from('staff').upsert(staff, { onConflict: 'id' }));
    return staff;
  }

  function deleteStaff(id) {
    cache.staff = cache.staff.filter(s => s.id !== id);
    _save(`delete staff [${id}]`, db.from('staff').delete().eq('id', id));
  }

  // ── PAYROLL ────────────────────────────────────────────────────────────────
  // app.js saves: id, staff_id, period, hours_worked, base_pay,
  //               overtime, allowance, deductions, net_pay
  function getPayroll() { return cache.payroll; }

  function upsertPayroll(entry) {
    const idx = cache.payroll.findIndex(p => p.id === entry.id);
    if (idx >= 0) cache.payroll[idx] = entry; else cache.payroll.unshift(entry);
    _save(`upsert payroll [${entry.id}]`, db.from('payroll').upsert(entry, { onConflict: 'id' }));
    return entry;
  }

  function deletePayroll(id) {
    cache.payroll = cache.payroll.filter(p => p.id !== id);
    _save(`delete payroll [${id}]`, db.from('payroll').delete().eq('id', id));
  }

  // ── MONTHLY TOP ITEMS ──────────────────────────────────────────────────────
  function getMonthlyTopItems()      { return cache.monthlyTopItems; }
  function saveMonthlyTopItems(recs) { cache.monthlyTopItems = recs; }

  function saveMonthlyTopRecord(month, items) {
    const rec = { month, saved_at: new Date().toISOString(), items };
    const idx = cache.monthlyTopItems.findIndex(r => r.month === month);
    if (idx >= 0) cache.monthlyTopItems[idx] = rec; else cache.monthlyTopItems.unshift(rec);
    _save(`upsert monthly_top_items [${month}]`,
      db.from('monthly_top_items').upsert(
        { month, saved_at: rec.saved_at, items: JSON.stringify(items) },
        { onConflict: 'month' }
      )
    );
    return rec;
  }

  function getMonthlyRecord(month) { return cache.monthlyTopItems.find(r => r.month === month) || null; }
  function getCurrentMonthKey() {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}`;
  }

  // ── BACKUP / RESTORE ───────────────────────────────────────────────────────
  function exportJSON() {
    const blob = new Blob([JSON.stringify({
      inventory: getInventory(), sales: getSales(), expenses: getExpenses(),
      staff: getStaff(), payroll: getPayroll(), settings: getSettings()
    }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'reserve_backup.json'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function importJSON(file, onDone) {
    const reader = new FileReader();
    reader.onload = async e => {
      try {
        const data = JSON.parse(e.target.result);
        if (data.inventory) { cache.inventory = data.inventory; for (const it of data.inventory) await db.from('inventory').upsert(it, { onConflict:'id' }); }
        if (data.sales)     { cache.sales = data.sales; for (const s of data.sales) await db.from('sales').upsert({...s, lines:JSON.stringify(s.lines)},{onConflict:'id'}); }
        if (data.expenses)  { cache.expenses = data.expenses; for (const ex of data.expenses) await db.from('expenses').upsert(ex, {onConflict:'id'}); }
        if (data.staff)     { cache.staff = data.staff; for (const st of data.staff) await db.from('staff').upsert(st, {onConflict:'id'}); }
        if (data.payroll)   { cache.payroll = data.payroll; for (const p of data.payroll) await db.from('payroll').upsert(p, {onConflict:'id'}); }
        if (data.settings)  { writeLocal(SK, data.settings); }
        onDone && onDone(true);
      } catch(err) { console.error(err); onDone && onDone(false); }
    };
    reader.readAsText(file);
  }

  // ── CSV ────────────────────────────────────────────────────────────────────
  function toCSV(rows) {
    if (!rows || !rows.length) return '';
    const headers = Object.keys(rows[0]);
    const esc = v => { if (v==null) return ''; const s=String(v); return /[",\n]/.test(s)?`"${s.replace(/"/g,'""')}"`  :s; };
    return [headers.join(','), ...rows.map(r => headers.map(h => esc(r[h])).join(','))].join('\n');
  }
  function downloadCSV(filename, rows) {
    if (!rows || !rows.length) return;
    const blob = new Blob([toCSV(rows)], { type:'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  function parseCSV(text) {
    const lines = text.trim().split(/\r?\n/);
    const headers = lines.shift().split(',').map(h => h.trim());
    return lines.map(line => {
      const cols = line.split(',').map(c => c.trim());
      const obj = {}; headers.forEach((h,i) => obj[h] = cols[i]); return obj;
    });
  }

  // ── MENU PRODUCTS ──────────────────────────────────────────────────────────
  // Columns: id, name, category, price, description, is_available, created_at, updated_at
  function getMenuProducts()      { return cache.menuProducts; }
  function getMenuProductById(id) { return cache.menuProducts.find(p => p.id === id) || null; }

  function upsertMenuProduct(product) {
    const idx = cache.menuProducts.findIndex(p => p.id === product.id);
    if (idx >= 0) cache.menuProducts[idx] = product; else cache.menuProducts.push(product);
    _save(`upsert menu_products [${product.name}]`,
      db.from('menu_products').upsert(product, { onConflict: 'id' })
    );
    return product;
  }

  function deleteMenuProduct(id) {
    const name = getMenuProductById(id)?.name || id;
    cache.menuProducts = cache.menuProducts.filter(p => p.id !== id);
    _save(`delete menu_products [${name}]`, db.from('menu_products').delete().eq('id', id));
  }

  // ── EXPOSE ─────────────────────────────────────────────────────────────────
  window.StorageAPI = {
    ensureDefaults, uid,
    getInventory, saveInventory, upsertItem, deleteItem, getItemById,
    getSales, saveSales, addSale, deleteSale,
    getExpenses, saveExpenses, addExpense, deleteExpense,
    getStockLog, addStockLog,
    getStaff, getStaffById, upsertStaff, deleteStaff,
    getPayroll, upsertPayroll, deletePayroll,
    getSettings, saveSettings,
    exportJSON, importJSON,
    toCSV, downloadCSV, parseCSV,
    getMonthlyTopItems, saveMonthlyTopItems, saveMonthlyTopRecord,
    getMonthlyRecord, getCurrentMonthKey,
    getMenuProducts, getMenuProductById, upsertMenuProduct, deleteMenuProduct
  };
})();