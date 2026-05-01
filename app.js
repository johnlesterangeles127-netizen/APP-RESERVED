// app.js — RESERVE
(function () {
  'use strict';

  const $ = sel => document.querySelector(sel);
  const $$ = sel => Array.from(document.querySelectorAll(sel));

  // ── STATE ──────────────────────────────────────────────────────────────────
  const state = {
    inventoryType: 'kitchen',
    role: null,
    chart: null,
    booted: false
  };

  const USERS = [
    { username: 'owner', password: 'owner123', role: 'owner' },
    { username: 'staff', password: 'staff123', role: 'staff' }
  ];
  const OWNER_ONLY = ['dashboard', 'expenses', 'staff', 'reports', 'settings'];

  // ── HELPERS ────────────────────────────────────────────────────────────────
  function cur(n) {
    const s = StorageAPI.getSettings();
    return Calc.currency(n || 0, s.currency || '₱');
  }

  function today() { return new Date().toISOString().slice(0, 10); }

  function getWeekStart() {
    const d = new Date(), dow = d.getDay();
    const mon = new Date(d);
    mon.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
    return mon.toISOString().slice(0, 10);
  }

  function getMonthRange() {
    const d = new Date();
    const start = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);
    return { start, end };
  }

  function getYearRange() {
    const y = new Date().getFullYear();
    return { start: `${y}-01-01`, end: `${y}-12-31` };
  }

  function inRange(dateStr, start, end) {
    const d = dateStr.slice(0, 10);
    return (!start || d >= start) && (!end || d <= end);
  }

  function sumRevenue(sales, start, end) {
    return sales.filter(s => inRange(s.date, start, end))
      .reduce((sum, s) => sum + Calc.saleTotals(s).revenue, 0);
  }

  function sumGP(sales, start, end) {
    return sales.filter(s => inRange(s.date, start, end))
      .reduce((sum, s) => sum + Calc.saleTotals(s).gp, 0);
  }

  function sumExp(expenses, start, end) {
    return expenses.filter(e => inRange(e.date, start, end))
      .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  }

  // ── TOAST ──────────────────────────────────────────────────────────────────
  function toast(msg, type = 'info') {
    const el = document.createElement('div');
    el.className = `toast ${type === 'error' ? 'error' : type === 'success' ? 'success' : ''}`;
    el.innerHTML = `<span>${msg}</span><button class="btn btn-ghost btn-sm" style="padding:2px 6px;">✕</button>`;
    el.querySelector('button').onclick = () => el.remove();
    $('#toastContainer').appendChild(el);
    setTimeout(() => { if (el.parentNode) el.remove(); }, 4000);
  }

  // ── LOGIN ──────────────────────────────────────────────────────────────────
  function setupLogin() {
    $('#forgotPasswordLink').addEventListener('click', e => {
      e.preventDefault();
      alert('Please contact your administrator to reset your password.');
    });

    checkSession();

    $('#loginForm').addEventListener('submit', e => {
      e.preventDefault();
      const u = $('#loginUsername').value.trim();
      const p = $('#loginPassword').value;
      const rem = $('#loginRemember').checked;
      const matched = USERS.find(x => x.username === u && x.password === p);
      const err = $('#loginError');

      if (matched) {
        sessionStorage.setItem('r_in', '1');
        sessionStorage.setItem('r_role', matched.role);
        if (rem) { localStorage.setItem('r_rem', '1'); localStorage.setItem('r_role', matched.role); }
        state.role = matched.role;
        $('#loginScreen').classList.remove('active');
        $('#appMain').classList.remove('hidden');
        $('#loginForm').reset();
        err.style.display = 'none';
        boot();
      } else {
        err.textContent = 'Invalid username or password.';
        err.style.display = 'block';
        $('#loginPassword').value = '';
        $('#loginPassword').focus();
      }
    });

    $('#logoutBtn').addEventListener('click', () => {
      if (!confirm('Log out?')) return;
      ['r_in', 'r_role'].forEach(k => sessionStorage.removeItem(k));
      ['r_rem', 'r_role'].forEach(k => localStorage.removeItem(k));
      state.role = null; state.booted = false;
      const badge = $('#roleBadge'); if (badge) badge.remove();
      $('#appMain').classList.add('hidden');
      $('#loginScreen').classList.add('active');
      $('#loginForm').reset();
      $('#loginUsername').focus();
      $('#toastContainer').innerHTML = '';
    });
  }

  function checkSession() {
    const ok = sessionStorage.getItem('r_in') || localStorage.getItem('r_rem');
    const role = sessionStorage.getItem('r_role') || localStorage.getItem('r_role');
    if (ok && role) {
      state.role = role;
      $('#loginScreen').classList.remove('active');
      $('#appMain').classList.remove('hidden');
      boot();
    }
  }

  function isOwner() { return state.role === 'owner'; }

  function applyRoleUI() {
    $$('.nav-link').forEach(btn => {
      btn.style.display = (!isOwner() && OWNER_ONLY.includes(btn.dataset.section)) ? 'none' : '';
    });
    if (!isOwner() && !$('#roleBadge')) {
      const b = document.createElement('span');
      b.id = 'roleBadge';
      b.textContent = '👷 Staff Mode';
      b.style.cssText = 'font-size:12px;background:var(--green-bg);color:var(--green);padding:4px 10px;border-radius:20px;font-weight:600;border:1px solid #A5D6A7;';
      $('.header-actions').prepend(b);
    }
  }

  function guardSection(sec) {
    if (!isOwner() && OWNER_ONLY.includes(sec)) {
      $$('.section').forEach(s => s.classList.remove('active'));
      let el = $('#noAccess');
      if (!el) {
        el = document.createElement('div');
        el.id = 'noAccess';
        el.className = 'section active';
        el.style.cssText = 'display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:60vh;gap:16px;';
        el.innerHTML = '<div style="font-size:60px;">🔒</div><h2 style="color:var(--green)">Access Restricted</h2><p style="color:var(--muted);text-align:center;">This section is only visible to the owner.</p>';
        $('.content').appendChild(el);
      }
      el.style.display = 'flex';
      return true;
    }
    const el = $('#noAccess'); if (el) el.style.display = 'none';
    return false;
  }

  // ── THEME ──────────────────────────────────────────────────────────────────
  let _themeReady = false;
  function setupTheme() {
    const s = StorageAPI.getSettings();
    if (s.theme === 'contrast') document.documentElement.setAttribute('data-theme', 'contrast');
    if (!_themeReady) {
      _themeReady = true;
      $('#themeToggle').addEventListener('click', () => {
        const isC = document.documentElement.getAttribute('data-theme') === 'contrast';
        if (isC) { document.documentElement.removeAttribute('data-theme'); s.theme = 'light'; }
        else { document.documentElement.setAttribute('data-theme', 'contrast'); s.theme = 'contrast'; }
        StorageAPI.saveSettings(s);
      });
    }
  }

  // ── NAV ────────────────────────────────────────────────────────────────────
  let _navReady = false;
  function setupNav() {
    if (_navReady) return;
    _navReady = true;
    $$('.nav-link').forEach(btn => {
      btn.addEventListener('click', () => {
        const sec = btn.dataset.section;
        if (guardSection(sec)) return;

        $$('.nav-link').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        $$('.section').forEach(s => s.classList.remove('active'));
        $('#' + sec).classList.add('active');

        if (sec === 'inventory' && btn.dataset.type) {
          state.inventoryType = btn.dataset.type;
          renderInventory();
        }
        if (sec === 'menu')    renderMenu();
        if (sec === 'reports') renderReports();
        if (sec === 'staff') renderStaff();
      });
    });
  }

  // ── DATALISTS ──────────────────────────────────────────────────────────────
  function refreshDatalists() {
    const s = StorageAPI.getSettings() || {};
    const invCats = StorageAPI.getInventory().map(i => i.category).filter(Boolean);
    const cats = Array.from(new Set([...(s.categories || []), ...invCats])).sort();
    const sups = Array.from(new Set(s.suppliers || [])).sort();
    const catEl = $('#categoryList'); if (catEl) catEl.innerHTML = cats.map(c => `<option value="${c}">`).join('');
    const supEl = $('#supplierList'); if (supEl) supEl.innerHTML = sups.map(s => `<option value="${s}">`).join('');
  }

  // ── DASHBOARD ──────────────────────────────────────────────────────────────

  // Dashboard filter state
  const dashFilter = { preset: 'today', start: null, end: null };

  let _dashFilterReady = false;
  function setupDashboardFilter() {
    if (!_dashFilterReady) {
      _dashFilterReady = true;
      $('#dashFilterApply').addEventListener('click', () => {
      const s = $('#dashFilterStart').value;
      const e = $('#dashFilterEnd').value;
      if (!s && !e) { toast('Pick at least one date to filter', 'error'); return; }
      if (s && e && s > e) { toast('Start date must be before end date', 'error'); return; }
      dashFilter.start = s || null;
      dashFilter.end   = e || null;
      renderDashboard();
    });

    $('#dashFilterClear').addEventListener('click', () => {
      $('#dashFilterStart').value = '';
      $('#dashFilterEnd').value   = '';
      dashFilter.start = null;
      dashFilter.end   = null;
      $('#dashFilteredStrip').style.display = 'none';
      renderDashboard();
    });

    $('#dashPrintBtn').addEventListener('click', printDashboard);

    // Populate year selector + re-render chart on change
    const yearSel = $('#dashChartYear');
    if (yearSel) {
      const currentYear = new Date().getFullYear();
      const sales = StorageAPI.getSales();
      // Collect all years that have data + current year + 4 years back
      const yearSet = new Set([String(currentYear)]);
      for (let y = currentYear - 4; y < currentYear; y++) yearSet.add(String(y));
      sales.forEach(s => yearSet.add(s.date.slice(0, 4)));
      const sortedYears = Array.from(yearSet).sort((a, b) => b - a);
      yearSel.innerHTML = sortedYears
        .map(y => `<option value="${y}" ${y === String(currentYear) ? 'selected' : ''}>${y}</option>`)
        .join('');
      yearSel.addEventListener('change', renderDashboard);
    }
    } // end _dashFilterReady
  }

  function renderDashboard() {
    const items     = StorageAPI.getInventory();
    const sales     = StorageAPI.getSales();
    const expenses  = StorageAPI.getExpenses();
    const s         = StorageAPI.getSettings();
    const threshold = Number(s.lowStockThreshold) || 10;

    const td      = today();
    const wkStart = getWeekStart();
    const { start: mStart, end: mEnd } = getMonthRange();
    const { start: yStart, end: yEnd } = getYearRange();

    // Today's date label
    const dl = $('#dashDateLabel');
    if (dl) dl.textContent = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    // ── Always-visible KPI rows (fixed periods) ──
    $('#kpiTodaySales').textContent    = cur(sumRevenue(sales, td, td));
    $('#kpiTodayGP').textContent       = cur(sumGP(sales, td, td));
    $('#kpiWeekSales').textContent     = cur(sumRevenue(sales, wkStart, td));
    $('#kpiMonthSales').textContent    = cur(sumRevenue(sales, mStart, mEnd));
    $('#kpiYearSales').textContent     = cur(sumRevenue(sales, yStart, yEnd));

    const monthExp = sumExp(expenses, mStart, mEnd);
    const yearExp  = sumExp(expenses, yStart, yEnd);
    const monthNP  = sumGP(sales, mStart, mEnd) - monthExp;
    const yearNP   = sumGP(sales, yStart, yEnd) - yearExp;
    $('#kpiMonthExpenses').textContent = cur(monthExp);
    $('#kpiYearExpenses').textContent  = cur(yearExp);
    $('#kpiMonthNP').textContent       = cur(monthNP);
    $('#kpiYearNP').textContent        = cur(yearNP);
    $('#kpiMonthNP').style.color       = monthNP >= 0 ? 'var(--green)' : 'var(--red)';
    $('#kpiYearNP').style.color        = yearNP  >= 0 ? 'var(--green)' : 'var(--red)';
    $('#kpiStockValue').textContent    = cur(Calc.totalStockValue(items));

    // ── Filtered strip (shown when date filter is active) ──
    const fs    = dashFilter.start;
    const fe    = dashFilter.end;
    const strip = $('#dashFilteredStrip');

    if (fs || fe) {
      const fSales = sales.filter(s => inRange(s.date, fs, fe));
      const fExp   = expenses.filter(e => inRange(e.date, fs, fe));

      const rev = fSales.reduce((sum, s) => sum + Calc.saleTotals(s).revenue, 0);
      const gp  = fSales.reduce((sum, s) => sum + Calc.saleTotals(s).gp, 0);
      const exp = fExp.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
      const np  = gp - exp;

      const fromLbl = fs || '—';
      const toLbl   = fe || '—';
      $('#dashStripLabel').textContent = `📅 ${fromLbl}  →  ${toLbl}`;
      $('#stripRevenue').textContent   = cur(rev);
      $('#stripGP').textContent        = cur(gp);
      $('#stripExp').textContent       = cur(exp);
      $('#stripNP').textContent        = cur(np);
      $('#stripNP').style.color        = np >= 0 ? 'var(--green)' : 'var(--red)';
      $('#stripTxn').textContent       = fSales.length;
      strip.style.display              = 'block';

      // Update top items for the filtered period
      const topEl = $('#dashTopPeriodLabel');
      if (topEl) topEl.textContent = `${fromLbl} to ${toLbl}`;
      renderTopItemsFromSales(fSales, items);

    } else {
      strip.style.display = 'none';
      const topEl = $('#dashTopPeriodLabel');
      if (topEl) topEl.textContent = 'This Month';
      const topByCat = Calc.topSellingCurrentMonth(sales, items, 0, 5);
      renderTopItems(topByCat);
      saveMonthlySnapshot(topByCat);
    }

    // Chart — fixed Jan to Dec for selected year
    const chartYear = Number($('#dashChartYear').value) || new Date().getFullYear();
    const grouped   = Calc.groupByCalendarYear(sales, expenses, chartYear);
    $('#dashChartLabel').textContent = `Sales vs Expenses — Jan to Dec ${chartYear}`;
    renderDashChart(grouped);

    // Low stock alerts
    const low = items.filter(i => {
      const qty = Number(i.stock_qty) || 0;
      const rl  = Number(i.reorder_level) ?? threshold;
      return qty <= rl;
    });
    const alertList = $('#alertList');
    alertList.innerHTML = low.length
      ? low.map(i => `<li class="low">⚠️ <strong>${i.name}</strong> — ${i.stock_qty} ${i.unit || 'pcs'} remaining (alert ≤ ${Number(i.reorder_level) ?? threshold})</li>`).join('')
      : '<li class="ok">✅ All stock levels are good</li>';
  }

  function renderDashChart(grouped) {
    if (state.chart) state.chart.destroy();
    state.chart = new Chart($('#salesExpensesChart'), {
      type: 'line',
      data: {
        labels: grouped.labels,
        datasets: [
          { label: 'Sales Revenue', data: grouped.salesTotals, borderColor: '#2E7D32', backgroundColor: 'rgba(46,125,50,0.08)', fill: true, tension: 0.4, borderWidth: 2.5, pointRadius: 4, pointBackgroundColor: '#2E7D32', pointBorderColor: '#fff', pointBorderWidth: 2 },
          { label: 'Expenses',      data: grouped.expTotals,   borderColor: '#D32F2F', backgroundColor: 'rgba(211,47,47,0.08)',  fill: true, tension: 0.4, borderWidth: 2.5, pointRadius: 4, pointBackgroundColor: '#D32F2F', pointBorderColor: '#fff', pointBorderWidth: 2 }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: true, aspectRatio: 2.5,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'top', labels: { usePointStyle: true, font: { size: 12, weight: '600' }, padding: 16 } },
          tooltip: { backgroundColor: 'rgba(0,0,0,0.82)', titleFont: { size: 13 }, bodyFont: { size: 12 }, padding: 10 }
        },
        scales: {
          x: { ticks: { color: '#6B7280', font: { size: 11 } }, grid: { color: 'rgba(0,0,0,0.04)' } },
          y: { ticks: { color: '#6B7280', font: { size: 11 }, callback: v => cur(v) }, grid: { color: 'rgba(0,0,0,0.04)' } }
        }
      }
    });
  }

  function renderTopItemsFromSales(filteredSales, inventory) {
    const map = {};
    filteredSales.forEach(sale => sale.lines.forEach(l => {
      const key = l.item_id || l.item_name; if (!key) return;
      if (!map[key]) map[key] = { label: l.item_name || key, category: inventory.find(i => i.id === l.item_id)?.category || '—', qty: 0, gp: 0 };
      const t = Calc.lineTotals(l);
      map[key].qty += l.qty; map[key].gp += t.gp;
    }));
    const top = Object.values(map).sort((a, b) => b.qty - a.qty).slice(0, 10);
    const container = $('#topItemsContainer');
    if (!top.length) { container.innerHTML = '<div class="no-data-placeholder">No sales in this period</div>'; return; }
    container.innerHTML = '<div class="top-items-container" style="padding:8px;">' +
      top.map((it, i) => {
        const rank = i + 1;
        const cls = rank === 1 ? 'rank-1' : rank === 2 ? 'rank-2' : rank === 3 ? 'rank-3' : 'rank-other';
        return `<div class="ranking-item">
          <div class="ranking-badge ${cls}">${rank}</div>
          <div class="ranking-info">
            <div class="ranking-name">${it.label}</div>
            <div class="ranking-category">${it.category}</div>
          </div>
          <div class="ranking-metrics">
            <div class="metric-item"><div class="metric-label">Qty</div><div class="metric-value">${it.qty}</div></div>
            <div class="metric-item"><div class="metric-label">GP</div><div class="metric-value">${cur(it.gp)}</div></div>
          </div>
        </div>`;
      }).join('') + '</div>';
  }

  function renderTopItems(topByCat) {
    const container = $('#topItemsContainer');
    const all = [];
    Object.entries(topByCat).forEach(([cat, its]) => its.forEach(it => all.push({ ...it, category: cat })));
    all.sort((a, b) => b.qty - a.qty);
    const top = all.slice(0, 10);
    if (!top.length) { container.innerHTML = '<div class="no-data-placeholder">No sales recorded this month yet</div>'; return; }
    container.innerHTML = '<div class="top-items-container" style="padding:8px;">' + top.map((it, i) => {
      const rank = i + 1;
      const cls = rank === 1 ? 'rank-1' : rank === 2 ? 'rank-2' : rank === 3 ? 'rank-3' : 'rank-other';
      return `<div class="ranking-item">
        <div class="ranking-badge ${cls}">${rank}</div>
        <div class="ranking-info">
          <div class="ranking-name">${it.label || 'Unknown'}</div>
          <div class="ranking-category">${it.category || '—'}</div>
        </div>
        <div class="ranking-metrics">
          <div class="metric-item"><div class="metric-label">Qty</div><div class="metric-value">${it.qty}</div></div>
          <div class="metric-item"><div class="metric-label">GP</div><div class="metric-value">${cur(it.gp || 0)}</div></div>
        </div>
      </div>`;
    }).join('') + '</div>';
  }

  function saveMonthlySnapshot(topByCat) {
    const all = [];
    Object.entries(topByCat).forEach(([cat, its]) => its.forEach(it => all.push({ ...it, category: cat })));
    all.sort((a, b) => b.qty - a.qty);
    StorageAPI.saveMonthlyTopRecord(StorageAPI.getCurrentMonthKey(),
      all.slice(0, 20).map((it, i) => ({ rank: i + 1, label: it.label || 'Unknown', category: it.category, qty: it.qty, gp: it.gp || 0 }))
    );
  }

  // ── INVENTORY ──────────────────────────────────────────────────────────────
  function renderInventory() {
    const items = StorageAPI.getInventory();
    const s = StorageAPI.getSettings();
    const threshold = Number(s.lowStockThreshold) || 10;
    const type = state.inventoryType;
    const search = ($('#invSearch').value || '').toLowerCase();
    const cat = $('#invFilterCategory').value;
    const sup = $('#invFilterSupplier').value;
    const lowOnly = $('#invFilterLowStock').checked;

    const labels = { kitchen: '🍳 Kitchen Stock', beverage: '🥤 Beverage Stock', stockroom: '📦 Stock Room', pastry: '🥐 Pastry Stock', takeout: '🥡 Takeout Stock' };
    $('#inventoryTitle').textContent = labels[type] || 'Inventory';

    const filtered = items.filter(it => {
      if (it.inventory_type !== type) return false;
      if (search && !JSON.stringify(it).toLowerCase().includes(search)) return false;
      if (cat && it.category !== cat) return false;
      if (sup && it.supplier !== sup) return false;
      if (lowOnly) {
        const qty = Number(it.stock_qty) || 0;
        const rl  = Number(it.reorder_level) ?? threshold;
        if (qty > rl) return false;
      }
      return true;
    });

    $('#inventoryTbody').innerHTML = filtered.length ? filtered.map(it => {
      const qty = Number(it.stock_qty) || 0;
      const rl  = Number(it.reorder_level) ?? threshold;
      const isLow = qty <= rl;
      return `<tr style="${isLow ? 'background:#FFF5F5;' : ''}">
        <td><strong>${it.name}</strong>${isLow ? ' <span style="color:var(--red);font-size:11px;font-weight:700;">⚠ LOW</span>' : ''}</td>
        <td>${it.category || '—'}</td>
        <td>${it.unit || '—'}</td>
        <td>
          <div class="qty-cell">
            <span class="qty-display" data-id="${it.id}">${qty}</span>
            <div class="qty-controls">
              <div class="qty-row">
                <button class="btn btn-ghost btn-sm btn-icon qty-dec" data-id="${it.id}" title="Remove 1">−</button>
                <input  class="qty-input" type="number" min="0.01" step="0.01" placeholder="qty" data-id="${it.id}" data-dir="out" />
                <button class="btn qty-out-btn" data-id="${it.id}" title="Stock Out">Out</button>
              </div>
              <div class="qty-row">
                <button class="btn btn-ghost btn-sm btn-icon qty-inc" data-id="${it.id}" title="Add 1">+</button>
                <input  class="qty-input" type="number" min="0.01" step="0.01" placeholder="qty" data-id="${it.id}" data-dir="in" />
                <button class="btn qty-in-btn" data-id="${it.id}" title="Stock In">In</button>
              </div>
            </div>
          </div>
        </td>
        <td>${rl ?? '—'}</td>
        <td>${it.cost_price ? cur(it.cost_price) : '—'}</td>
        <td>${it.sell_price ? cur(it.sell_price) : '—'}</td>
        <td>${it.supplier || '—'}</td>
        <td>${it.supplier_use || '—'}</td>
        <td style="font-size:12px;color:var(--muted);">${it.updated_at ? new Date(it.updated_at).toLocaleString() : '—'}</td>
        <td style="white-space:nowrap;">
          <button class="btn btn-ghost btn-sm" data-act="edit" data-id="${it.id}">Edit</button>
          <button class="btn btn-secondary btn-sm" data-act="restock" data-id="${it.id}">Restock</button>
          <button class="btn btn-danger btn-sm" data-act="delete" data-id="${it.id}">Delete</button>
        </td>
      </tr>`;
    }).join('') : '<tr><td colspan="11" class="no-data-placeholder">No items found</td></tr>';

    // Populate filter dropdowns
    const typeItems = items.filter(i => i.inventory_type === type);
    const cats = Array.from(new Set(typeItems.map(i => i.category).filter(Boolean)));
    const sups = Array.from(new Set(typeItems.map(i => i.supplier).filter(Boolean))).sort();
    const pCat = $('#invFilterCategory').value, pSup = $('#invFilterSupplier').value;
    $('#invFilterCategory').innerHTML = '<option value="">All Categories</option>' + cats.map(c => `<option ${c === pCat ? 'selected' : ''}>${c}</option>`).join('');
    $('#invFilterSupplier').innerHTML = '<option value="">All Suppliers</option>' + sups.map(s => `<option ${s === pSup ? 'selected' : ''}>${s}</option>`).join('');

    // ±1 quick buttons
    $$('#inventoryTbody .qty-inc').forEach(btn => btn.addEventListener('click', () => adjustQty(btn.dataset.id,  1)));
    $$('#inventoryTbody .qty-dec').forEach(btn => btn.addEventListener('click', () => adjustQty(btn.dataset.id, -1)));

    // Bulk In — type a number then click In (or press Enter)
    $$('#inventoryTbody .qty-in-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const inp = btn.closest('.qty-row').querySelector('.qty-input');
        const val = Number(inp.value);
        if (!val || val <= 0) { toast('Enter a valid quantity to add', 'error'); inp.focus(); return; }
        adjustQty(btn.dataset.id, val); inp.value = '';
      });
    });

    // Bulk Out — type a number then click Out (or press Enter)
    $$('#inventoryTbody .qty-out-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const inp = btn.closest('.qty-row').querySelector('.qty-input');
        const val = Number(inp.value);
        if (!val || val <= 0) { toast('Enter a valid quantity to remove', 'error'); inp.focus(); return; }
        adjustQty(btn.dataset.id, -val); inp.value = '';
      });
    });

    // Enter key inside qty inputs fires the button
    $$('#inventoryTbody .qty-input').forEach(inp => {
      inp.addEventListener('keydown', e => {
        if (e.key !== 'Enter') return; e.preventDefault();
        inp.closest('.qty-row').querySelector(inp.dataset.dir === 'in' ? '.qty-in-btn' : '.qty-out-btn')?.click();
      });
    });

    $$('#inventoryTbody [data-act="edit"], #inventoryTbody [data-act="restock"], #inventoryTbody [data-act="delete"]').forEach(btn =>
      btn.addEventListener('click', onInvAction)
    );

    renderStockLog();
  }

  function adjustQty(id, delta) {
    const it = StorageAPI.getItemById(id); if (!it) return;
    const prev   = Number(it.stock_qty) || 0;
    const newQty = Math.max(0, prev + delta);
    it.stock_qty  = newQty;
    it.updated_at = new Date().toISOString();
    StorageAPI.upsertItem(it);

    const logEntry = { item_id: id, item_name: it.name, inventory_type: it.inventory_type,
      type: delta > 0 ? 'in' : 'out', qty: Math.abs(delta), balance: newQty,
      note: 'Manual adjustment', date: it.updated_at };
    StorageAPI.addStockLog(logEntry);

    // Update qty display inline — no full table rebuild
    const disp = document.querySelector(`#inventoryTbody .qty-display[data-id="${id}"]`);
    if (disp) disp.textContent = newQty;

    // Update low-stock row highlight + badge inline
    const s = StorageAPI.getSettings();
    const rl = Number(it.reorder_level) || Number(s.lowStockThreshold) || 10;
    const row = disp?.closest('tr');
    if (row) {
      row.style.background = newQty <= rl ? '#FFF5F5' : '';
      const badge = row.querySelector('.low-badge');
      if (newQty <= rl && !badge)
        row.querySelector('td strong')?.insertAdjacentHTML('afterend',
          ' <span class="low-badge" style="color:var(--red);font-size:11px;font-weight:700;">⚠ LOW</span>');
      else if (newQty > rl && badge) badge.remove();
    }

    // Inject log row live — no full log rebuild
    injectLogRow(logEntry);
    renderDashboard();
    toast(`${delta > 0 ? '+' : ''}${delta} ${it.unit || 'pcs'} — ${it.name} → ${newQty}`);
  }

  function onInvAction(e) {
    const id = e.currentTarget.dataset.id, act = e.currentTarget.dataset.act;
    if (act === 'edit')    openItemDialog(id);
    if (act === 'restock') openRestockDialog(id);
    if (act === 'delete') {
      if (!confirm(`Delete "${StorageAPI.getItemById(id)?.name}"? This cannot be undone.`)) return;
      StorageAPI.deleteItem(id);
      toast('Item deleted'); renderInventory(); renderDashboard();
    }
  }

  function renderStockLog() {
    const logs  = StorageAPI.getStockLog();
    const items = StorageAPI.getInventory();
    const fItem  = $('#logFilterItem').value;
    const fType  = $('#logFilterType').value;
    const fStart = $('#logFilterStart').value || null;
    const fEnd   = $('#logFilterEnd').value   || null;

    // Build item_id → inventory_type map for section scoping
    const itemTypeMap = {};
    items.forEach(it => { itemTypeMap[it.id] = it.inventory_type; });
    const currentType = state.inventoryType;

    // Item filter dropdown — only items from this section
    const sectionItems = items.filter(i => i.inventory_type === currentType);
    const pItem = fItem;
    $('#logFilterItem').innerHTML = '<option value="">All Items</option>' +
      sectionItems.map(it => `<option value="${it.id}" ${it.id === pItem ? 'selected' : ''}>${it.name}</option>`).join('');

    const filtered = logs.filter(l => {
      // Only show logs for items in the current inventory section
      const logType = itemTypeMap[l.item_id] || l.inventory_type;
      if (logType && logType !== currentType) return false;
      if (fItem && l.item_id !== fItem) return false;
      if (fType && l.type    !== fType)  return false;
      if (!inRange(l.date, fStart, fEnd)) return false;
      return true;
    }).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 300);

    // Group by day
    const grouped = {};
    filtered.forEach(l => {
      const dk = l.date.slice(0, 10);
      (grouped[dk] = grouped[dk] || []).push(l);
    });

    const icons = { in: '📥', out: '📤', sale: '🛒' };
    let html = '';
    const td = today();

    Object.keys(grouped).sort((a, b) => b.localeCompare(a)).forEach(dk => {
      const isToday = dk === td;
      const dayLogs = grouped[dk];
      const label = new Date(dk).toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });

      html += `<tr class="stock-date-header" data-dk="${dk}">
        <td colspan="6">
          <button class="stock-date-toggle">
            <span class="toggle-icon">▼</span>
            ${label}${isToday ? ' (Today)' : ''} — ${dayLogs.length} entry/entries
          </button>
        </td>
      </tr>`;

      const show = isToday ? 'table-row' : 'none';
      dayLogs.forEach(l => {
        html += `<tr class="stock-day-rows" style="display:${show};">
          <td style="font-size:12px;">${new Date(l.date).toLocaleTimeString()}</td>
          <td>${l.item_name || '—'}</td>
          <td>${icons[l.type] || ''} ${l.type}</td>
          <td style="font-weight:700;color:${l.type === 'in' ? 'var(--green)' : 'var(--red)'};">${l.type === 'in' ? '+' : '-'}${l.qty}</td>
          <td>${l.balance}</td>
          <td style="font-size:12px;color:var(--muted);">${l.note || ''}</td>
        </tr>`;
      });
    });

    if (!html) html = '<tr><td colspan="6" class="no-data-placeholder">No log entries</td></tr>';

    const tbody = $('#stockLogTbody');
    tbody.innerHTML = html;

    // Toggle rows
    tbody.querySelectorAll('.stock-date-toggle').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const icon = btn.querySelector('.toggle-icon');
        const expanded = icon.textContent === '▼';
        let row = btn.closest('tr').nextElementSibling;
        while (row && !row.classList.contains('stock-date-header')) {
          if (row.classList.contains('stock-day-rows')) row.style.display = expanded ? 'none' : 'table-row';
          row = row.nextElementSibling;
        }
        icon.textContent = expanded ? '▶' : '▼';
      });
    });

    $('#exportLogCsv').onclick = () => StorageAPI.downloadCSV('stock_log.csv', filtered);
  }


  // Live-inject a stock log entry at top of the log table without full rebuild
  function injectLogRow(entry) {
    const tbody = $('#stockLogTbody');
    if (!tbody) return;

    // Section scope check
    const itemTypeMap = {};
    StorageAPI.getInventory().forEach(it => { itemTypeMap[it.id] = it.inventory_type; });
    const currentType = state.inventoryType;
    const logType = itemTypeMap[entry.item_id] || entry.inventory_type;
    if (logType && logType !== currentType) return;

    // Filter scope check
    const fItem  = $('#logFilterItem').value;
    const fType  = $('#logFilterType').value;
    const fStart = $('#logFilterStart').value || null;
    const fEnd   = $('#logFilterEnd').value   || null;
    if (fItem && entry.item_id !== fItem) return;
    if (fType && entry.type    !== fType)  return;
    if (!inRange(entry.date, fStart, fEnd))  return;

    const icons   = { in: '📥', out: '📤', sale: '🛒' };
    const dk      = entry.date.slice(0, 10);
    const isToday = dk === today();

    // Build the data row
    const dataRow = document.createElement('tr');
    dataRow.className = 'stock-day-rows';
    dataRow.style.display = 'table-row';
    dataRow.innerHTML = `
      <td style="font-size:12px;">${new Date(entry.date).toLocaleTimeString()}</td>
      <td>${entry.item_name || '—'}</td>
      <td>${icons[entry.type] || ''} ${entry.type}</td>
      <td style="font-weight:700;color:${entry.type === 'in' ? 'var(--green)' : 'var(--red)'};">${entry.type === 'in' ? '+' : '-'}${entry.qty}</td>
      <td>${entry.balance}</td>
      <td style="font-size:12px;color:var(--muted);">${entry.note || ''}</td>
    `;

    const existingHeader = tbody.querySelector(`.stock-date-header[data-dk="${dk}"]`);
    if (existingHeader) {
      existingHeader.insertAdjacentElement('afterend', dataRow);
      const toggle = existingHeader.querySelector('.stock-date-toggle');
      if (toggle) toggle.innerHTML = toggle.innerHTML.replace(/(\d+) entry\/entries/, (_, n) => `${Number(n)+1} entry/entries`);
    } else {
      const label = new Date(dk).toLocaleDateString('en-US', { weekday:'short', year:'numeric', month:'short', day:'numeric' });
      const headerRow = document.createElement('tr');
      headerRow.className  = 'stock-date-header';
      headerRow.dataset.dk = dk;
      headerRow.innerHTML  = `<td colspan="6"><button class="stock-date-toggle"><span class="toggle-icon">▼</span> ${label}${isToday?' (Today)':''} — 1 entry/entries</button></td>`;
      headerRow.querySelector('.stock-date-toggle').addEventListener('click', ev => {
        ev.stopPropagation();
        const icon = headerRow.querySelector('.toggle-icon');
        const expanded = icon.textContent === '▼';
        let r = headerRow.nextElementSibling;
        while (r && !r.classList.contains('stock-date-header')) {
          if (r.classList.contains('stock-day-rows')) r.style.display = expanded ? 'none' : 'table-row';
          r = r.nextElementSibling;
        }
        icon.textContent = expanded ? '▶' : '▼';
      });
      tbody.querySelector('.no-data-placeholder')?.closest('tr')?.remove();
      tbody.insertBefore(dataRow,   tbody.firstChild);
      tbody.insertBefore(headerRow, dataRow);
    }
  }

  // ── ITEM DIALOG ────────────────────────────────────────────────────────────
  function openItemDialog(id = null) {
    refreshDatalists();
    if (id) {
      const it = StorageAPI.getItemById(id);
      $('#itemDialogTitle').textContent = 'Edit Item';
      $('#itemId').value = it.id;
      $('#itemInventoryType').value = it.inventory_type || 'kitchen';
      $('#itemName').value = it.name || '';
      $('#itemCategory').value = it.category || '';
      $('#itemUnit').value = it.unit || '';
      $('#itemQty').value = it.stock_qty ?? '';
      $('#itemCostPrice').value = it.cost_price || '';
      $('#itemSellPrice').value = it.sell_price || '';
      $('#itemReorderLevel').value = it.reorder_level || '';
      $('#itemSupplier').value = it.supplier || '';
      $('#itemSupplierUse').value = it.supplier_use || '';
      $('#itemExpiry').value = it.expiry_date || '';
    } else {
      $('#itemDialogTitle').textContent = 'Add Item';
      $('#itemForm').reset();
      $('#itemId').value = '';
      $('#itemInventoryType').value = state.inventoryType;
    }
    $('#itemDialog').showModal();
  }

  let _itemDialogReady = false;
  function setupItemDialog() {
    if (_itemDialogReady) return;
    _itemDialogReady = true;
    $('#addItemBtn').addEventListener('click', () => openItemDialog());
    $('#itemDialogCancel').addEventListener('click', () => $('#itemDialog').close());
    $('#itemForm').addEventListener('submit', e => {
      e.preventDefault();
      const isNew = !$('#itemId').value;
      const id = $('#itemId').value || StorageAPI.uid('item');
      const existing = isNew ? null : StorageAPI.getItemById(id);
      const now = new Date().toISOString();
      const newQty = Number($('#itemQty').value) || 0;
      const prevQty = existing ? (Number(existing.stock_qty) || 0) : 0;

      const item = {
        id,
        inventory_type: $('#itemInventoryType').value || 'kitchen',
        name:         $('#itemName').value.trim(),
        category:     $('#itemCategory').value.trim(),
        unit:         $('#itemUnit').value.trim(),
        stock_qty:    newQty,
        cost_price:   Number($('#itemCostPrice').value) || 0,
        sell_price:   Number($('#itemSellPrice').value) || 0,
        reorder_level: Number($('#itemReorderLevel').value) || 0,
        supplier:     $('#itemSupplier').value.trim(),
        supplier_use: $('#itemSupplierUse').value.trim(),
        expiry_date:  $('#itemExpiry').value || null,
        sku:          existing ? (existing.sku || '') : '',
        created_at:   existing ? existing.created_at : now,
        updated_at:   now
      };

      StorageAPI.upsertItem(item);

      if (isNew && newQty > 0) {
        StorageAPI.addStockLog({ item_id: id, item_name: item.name, inventory_type: item.inventory_type, type: 'in', qty: newQty, balance: newQty, note: 'Initial stock', date: now });
      } else if (!isNew && newQty !== prevQty) {
        const diff = newQty - prevQty;
        StorageAPI.addStockLog({ item_id: id, item_name: item.name, inventory_type: item.inventory_type, type: diff > 0 ? 'in' : 'out', qty: Math.abs(diff), balance: newQty, note: 'Edited via form', date: now });
      }

      $('#itemDialog').close();
      toast(isNew ? 'Item added ✓' : 'Item updated ✓', 'success');
      renderInventory(); renderDashboard(); refreshDatalists();
    });
  }

  // ── RESTOCK DIALOG ─────────────────────────────────────────────────────────
  function openRestockDialog(id) {
    const it = StorageAPI.getItemById(id);
    $('#restockItemId').value = id;
    $('#restockQty').value = '';
    $('#restockNote').value = '';
    $('#restockDialogTitle').textContent = `Restock: ${it ? it.name : ''}`;
    $('#restockDialog').showModal();
  }

  let _restockReady = false;
  function setupRestockDialog() {
    if (_restockReady) return;
    _restockReady = true;
    $('#restockDialogCancel').addEventListener('click', () => $('#restockDialog').close());
    $('#restockForm').addEventListener('submit', e => {
      e.preventDefault();
      const id  = $('#restockItemId').value;
      const qty = Number($('#restockQty').value) || 0;
      const note = $('#restockNote').value.trim();
      if (qty <= 0) { toast('Enter a valid quantity', 'error'); return; }
      const it = StorageAPI.getItemById(id); if (!it) return;
      it.stock_qty = (Number(it.stock_qty) || 0) + qty;
      it.updated_at = new Date().toISOString();
      StorageAPI.upsertItem(it);
      const restockEntry = { item_id: id, item_name: it.name, inventory_type: it.inventory_type,
        type: 'in', qty, balance: it.stock_qty, note: note || 'Restock', date: it.updated_at };
      StorageAPI.addStockLog(restockEntry);
      $('#restockDialog').close();
      toast(`${it.name} restocked +${qty} ✓`, 'success');
      // Update qty display inline
      const disp2 = document.querySelector(`#inventoryTbody .qty-display[data-id="${id}"]`);
      if (disp2) disp2.textContent = it.stock_qty;
      const s2 = StorageAPI.getSettings();
      const rl2 = Number(it.reorder_level) || Number(s2.lowStockThreshold) || 10;
      const row2 = disp2?.closest('tr');
      if (row2) {
        row2.style.background = it.stock_qty <= rl2 ? '#FFF5F5' : '';
        const b2 = row2.querySelector('.low-badge');
        if (it.stock_qty <= rl2 && !b2) row2.querySelector('td strong')?.insertAdjacentHTML('afterend', ' <span class="low-badge" style="color:var(--red);font-size:11px;font-weight:700;">⚠ LOW</span>');
        else if (it.stock_qty > rl2 && b2) b2.remove();
      }
      injectLogRow(restockEntry);
      renderDashboard();
    });
  }

  // ── INVENTORY CSV ──────────────────────────────────────────────────────────
  let _csvReady = false;
  function setupInventoryCsv() {
    if (_csvReady) return;
    _csvReady = true;
    $('#exportInventoryCsv').addEventListener('click', () => {
      StorageAPI.downloadCSV('reserve_inventory.csv', StorageAPI.getInventory().map(it => ({
        id: it.id, inventory_type: it.inventory_type, name: it.name,
        category: it.category, unit: it.unit, stock_qty: it.stock_qty,
        cost_price: it.cost_price, sell_price: it.sell_price,
        reorder_level: it.reorder_level, supplier: it.supplier,
        supplier_use: it.supplier_use, expiry_date: it.expiry_date || '',
        last_updated: it.updated_at || ''
      })));
      toast('Inventory exported ✓');
    });

    $('#importInventoryCsv').addEventListener('change', e => {
      const file = e.target.files[0]; if (!file) return;
      const reader = new FileReader();
      reader.onload = ev => {
        const rows = StorageAPI.parseCSV(ev.target.result);
        const existing = StorageAPI.getInventory();
        rows.forEach(r => {
          existing.push({
            id: r.id || StorageAPI.uid('item'),
            inventory_type: ['kitchen','beverage','stockroom','pastry','takeout'].includes((r.inventory_type||'').toLowerCase()) ? r.inventory_type.toLowerCase() : 'kitchen',
            name: r.name || '', category: r.category || '', unit: r.unit || '',
            stock_qty: Number(r.stock_qty) || 0, cost_price: Number(r.cost_price) || 0,
            sell_price: Number(r.sell_price) || 0, reorder_level: Number(r.reorder_level) || 0,
            supplier: r.supplier || '', supplier_use: r.supplier_use || '',
            expiry_date: r.expiry_date || null,
            created_at: new Date().toISOString(), updated_at: r.last_updated || new Date().toISOString()
          });
        });
        StorageAPI.saveInventory(existing);
        toast(`Imported ${rows.length} item(s) ✓`, 'success');
        renderInventory(); renderDashboard(); e.target.value = '';
      };
      reader.readAsText(file);
    });
  }

  // ── SALES ──────────────────────────────────────────────────────────────────
  function createSaleLine(initial = {}) {
    const s = StorageAPI.getSettings();
    const line = document.createElement('div');
    line.className = 'line-item';
    line.innerHTML = `
      <select class="li-cat"><option value="" disabled selected>Category…</option></select>
      <select class="li-item" disabled><option value="" disabled selected>Item…</option></select>
      <input type="number" step="1" min="1" class="li-qty" placeholder="Qty" value="${initial.qty || 1}" style="text-align:center;" />
      <input type="number" step="0.01" class="li-sell" placeholder="Sell ₱" value="${initial.sell_price || ''}" />
      <input type="number" step="0.01" class="li-cost" placeholder="Cost ₱" value="${initial.cost_price || ''}" />
      <div class="li-total">${cur(0)}</div>
      <button type="button" class="li-remove btn btn-ghost btn-sm btn-icon" title="Remove line">✕</button>`;

    const catSel  = line.querySelector('.li-cat');
    const itemSel = line.querySelector('.li-item');
    const qtyIn   = line.querySelector('.li-qty');
    const sellIn  = line.querySelector('.li-sell');
    const costIn  = line.querySelector('.li-cost');
    const totalEl = line.querySelector('.li-total');

    function refreshCats() {
      const inv  = StorageAPI.getInventory();
      const cats = Array.from(new Set(inv.map(i => i.category).filter(Boolean))).sort();
      const prev = catSel.value;
      catSel.innerHTML = '<option value="" disabled>Category…</option>' +
        cats.map(c => `<option value="${c}" ${c === prev ? 'selected' : ''}>${c}</option>`).join('');
    }
    refreshCats();
    catSel.addEventListener('focus', refreshCats);

    catSel.addEventListener('change', () => {
      const inv = StorageAPI.getInventory();
      const inCat = inv.filter(i => i.category === catSel.value);
      itemSel.innerHTML = '<option value="" disabled selected>Select item…</option>' +
        inCat.map(i => `<option value="${i.id}">${i.name}</option>`).join('');
      itemSel.disabled = false;
      sellIn.value = ''; costIn.value = ''; calc();
    });

    itemSel.addEventListener('change', () => {
      const item = StorageAPI.getInventory().find(i => i.id === itemSel.value);
      if (item) { sellIn.value = item.sell_price || ''; costIn.value = item.cost_price || ''; }
      calc();
    });

    if (initial.item_id) {
      const item = StorageAPI.getInventory().find(i => i.id === initial.item_id);
      if (item) {
        catSel.value = item.category;
        catSel.dispatchEvent(new Event('change'));
        setTimeout(() => { itemSel.value = initial.item_id; itemSel.dispatchEvent(new Event('change')); }, 0);
      }
    }

    function calc() {
      const qty  = Number(qtyIn.value)  || 0;
      const sell = Number(sellIn.value) || 0;
      totalEl.textContent = cur(qty * sell);
      renderSaleTotals();
    }
    [qtyIn, sellIn, costIn].forEach(i => i.addEventListener('input', calc));
    line.querySelector('.li-remove').addEventListener('click', () => { line.remove(); renderSaleTotals(); });
    calc();
    return line;
  }

  function renderSaleTotals() {
    const lines = $$('#saleLines .line-item');
    const totals = lines.reduce((acc, line) => {
      const t = Calc.lineTotals({
        qty:        Number(line.querySelector('.li-qty').value)  || 0,
        sell_price: Number(line.querySelector('.li-sell').value) || 0,
        cost_price: Number(line.querySelector('.li-cost').value) || 0
      });
      return { revenue: acc.revenue + t.revenue, cogs: acc.cogs + t.cogs, gp: acc.gp + t.gp };
    }, { revenue: 0, cogs: 0, gp: 0 });
    $('#saleRevenue').textContent = cur(totals.revenue);
    $('#saleCogs').textContent    = cur(totals.cogs);
    $('#saleGP').textContent      = cur(totals.gp);
  }

  function resetSaleForm() {
    const nowLocal = new Date();
    nowLocal.setMinutes(nowLocal.getMinutes() - nowLocal.getTimezoneOffset());
    $('#saleDate').value = nowLocal.toISOString().slice(0, 16);
    $('#saleLines').innerHTML = '';
    $('#saleLines').appendChild(createSaleLine());
    renderSaleTotals();
  }

  let _salesReady = false;
  function setupSales() {
    resetSaleForm();
    if (_salesReady) return;
    _salesReady = true;

    $('#addSaleLine').addEventListener('click', () => $('#saleLines').appendChild(createSaleLine()));
    $('#saleCancelBtn').addEventListener('click', resetSaleForm);

    $('#saleSubmitBtn').addEventListener('click', () => {
      const inv = StorageAPI.getInventory();
      const lines = $$('#saleLines .line-item').map(line => {
        const sel  = line.querySelector('.li-item');
        const item = inv.find(i => i.id === sel.value);
        return {
          item_id:    sel.value || undefined,
          item_name:  item ? item.name : '',
          qty:        Number(line.querySelector('.li-qty').value)  || 0,
          sell_price: Number(line.querySelector('.li-sell').value) || 0,
          cost_price: Number(line.querySelector('.li-cost').value) || 0
        };
      }).filter(l => l.qty > 0 && l.item_id);

      if (!lines.length) { toast('Please select at least one item', 'error'); return; }
      const noPrice = lines.find(l => !l.sell_price);
      if (noPrice) { toast(`Enter a sell price for "${noPrice.item_name}"`, 'error'); return; }

      const saleDate = $('#saleDate').value;
      if (!saleDate) { toast('Please set the sale date and time', 'error'); return; }

      const sale = {
        id:    StorageAPI.uid('sale'),
        date:  new Date(saleDate).toISOString(),
        lines,
        ...Calc.saleTotals({ lines })
      };

      // Deduct stock + log
      lines.forEach(l => {
        const item = StorageAPI.getItemById(l.item_id);
        if (item) {
          item.stock_qty = Math.max(0, (Number(item.stock_qty) || 0) - l.qty);
          item.updated_at = new Date().toISOString();
          StorageAPI.upsertItem(item);
          StorageAPI.addStockLog({ item_id: l.item_id, item_name: l.item_name, inventory_type: item.inventory_type, type: 'sale', qty: l.qty, balance: item.stock_qty, note: `Sale ${sale.id}`, date: sale.date });
        }
      });

      StorageAPI.addSale(sale);
      toast(`Sale of ${cur(sale.revenue)} recorded ✓`, 'success');
      resetSaleForm();
      renderDashboard(); renderInventory(); renderSalesHistory();
    });

    // Tabs
    $$('.tab-btn').forEach(btn => btn.addEventListener('click', () => {
      $$('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      $$('.tab-panel').forEach(p => p.classList.remove('active'));
      const panel = $('#' + btn.dataset.tab);
      if (panel) panel.classList.add('active');
      if (btn.dataset.tab === 'salesWeekly')  renderSalesWeekly();
      if (btn.dataset.tab === 'salesMonthly') renderSalesMonthly();
      if (btn.dataset.tab === 'salesYearly')  renderSalesYearly();
      if (btn.dataset.tab === 'salesPerItem') renderSalesPerItem();
    }));

    ['salesFilterStart', 'salesFilterEnd', 'salesFilterItem'].forEach(id =>
      $('#' + id).addEventListener('input', renderSalesHistory)
    );
    $('#perItemApply').addEventListener('click', renderSalesPerItem);
    $('#exportPerItemCsv').addEventListener('click', exportPerItemCsv);
  }

  function renderSalesHistory() {
    const sales  = StorageAPI.getSales();
    const start  = $('#salesFilterStart').value || null;
    const end    = $('#salesFilterEnd').value   || null;
    const term   = ($('#salesFilterItem').value || '').toLowerCase();
    const td     = today();

    const filtered = sales
      .filter(s => inRange(s.date, start, end))
      .filter(s => !term || s.lines.map(l => (l.item_name || '').toLowerCase()).join(' ').includes(term));

    const grouped = {};
    filtered.forEach(s => {
      const dk = s.date.slice(0, 10);
      (grouped[dk] = grouped[dk] || []).push(s);
    });

    let html = '';
    Object.keys(grouped).sort((a, b) => b.localeCompare(a)).forEach(dk => {
      const isToday  = dk === td;
      const daySales = grouped[dk];
      const dayRev   = daySales.reduce((sum, s) => sum + (s.revenue || 0), 0);
      const label    = new Date(dk).toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });

      html += `<tr class="sales-date-header" data-dk="${dk}">
        <td colspan="6">
          <button class="sales-date-toggle">
            <span class="toggle-icon">▼</span>
            ${label}${isToday ? ' (Today)' : ''} — ${daySales.length} sale(s) &nbsp;·&nbsp; ${cur(dayRev)}
          </button>
        </td>
      </tr>`;

      const show = isToday ? 'table-row' : 'none';
      daySales.forEach(sale => {
        const items = sale.lines.map(l => `${l.item_name} ×${l.qty}`).join(', ');
        html += `<tr class="sales-day-rows" style="display:${show};">
          <td style="font-size:12px;">${new Date(sale.date).toLocaleTimeString()}</td>
          <td>${items}</td>
          <td>${cur(sale.revenue)}</td>
          <td>${cur(sale.cogs)}</td>
          <td style="color:var(--green);font-weight:600;">${cur(sale.gp || (sale.revenue - sale.cogs))}</td>
          <td><button class="btn btn-danger btn-sm" data-act="del" data-id="${sale.id}">Delete</button></td>
        </tr>`;
      });
    });

    if (!html) html = '<tr><td colspan="6" class="no-data-placeholder">No sales found</td></tr>';

    const tbody = $('#salesTbody');
    tbody.innerHTML = html;

    // Toggle rows
    tbody.querySelectorAll('.sales-date-toggle').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const icon = btn.querySelector('.toggle-icon');
        const expanded = icon.textContent === '▼';
        let row = btn.closest('tr').nextElementSibling;
        while (row && !row.classList.contains('sales-date-header')) {
          if (row.classList.contains('sales-day-rows')) row.style.display = expanded ? 'none' : 'table-row';
          row = row.nextElementSibling;
        }
        icon.textContent = expanded ? '▶' : '▼';
      });
    });

    tbody.querySelectorAll('[data-act="del"]').forEach(btn => btn.addEventListener('click', () => {
      if (!confirm('Delete this sale?')) return;
      StorageAPI.deleteSale(btn.dataset.id);
      toast('Sale deleted'); renderSalesHistory(); renderDashboard();
    }));

    $('#exportSalesCsv').onclick = () => {
      StorageAPI.downloadCSV('sales.csv', filtered.map(s => ({
        id: s.id, date: s.date,
        items: s.lines.map(l => `${l.item_name} x${l.qty}`).join('; '),
        revenue: s.revenue, cogs: s.cogs, gross_profit: s.gp || (s.revenue - s.cogs)
      })));
      toast('Sales exported ✓');
    };
  }


  // Live-inject a new sale row into the sales history table (no refresh needed)
  function injectSaleRow(sale) {
    const tbody = $('#salesTbody');
    if (!tbody) return;

    // Respect active filters
    const start = $('#salesFilterStart').value || null;
    const end   = $('#salesFilterEnd').value   || null;
    const term  = ($('#salesFilterItem').value || '').toLowerCase();
    if (!inRange(sale.date, start, end)) return;
    if (term && !sale.lines.map(l => (l.item_name || '').toLowerCase()).join(' ').includes(term)) return;

    const dk      = sale.date.slice(0, 10);
    const isToday = dk === today();
    const items   = sale.lines.map(l => `${l.item_name} ×${l.qty}`).join(', ');

    const dataRow = document.createElement('tr');
    dataRow.className     = 'sales-day-rows';
    dataRow.style.display = 'table-row';
    dataRow.innerHTML = `
      <td style="font-size:12px;">${new Date(sale.date).toLocaleTimeString()}</td>
      <td>${items}</td>
      <td>${cur(sale.revenue)}</td>
      <td>${cur(sale.cogs)}</td>
      <td style="color:var(--green);font-weight:600;">${cur(sale.gp || (sale.revenue - sale.cogs))}</td>
      <td><button class="btn btn-danger btn-sm" data-act="del" data-id="${sale.id}">Delete</button></td>
    `;

    dataRow.querySelector('[data-act="del"]').addEventListener('click', () => {
      if (!confirm('Delete this sale?')) return;
      StorageAPI.deleteSale(sale.id);
      toast('Sale deleted'); renderSalesHistory(); renderDashboard();
    });

    const existingHeader = tbody.querySelector(`.sales-date-header[data-dk="${dk}"]`);
    if (existingHeader) {
      existingHeader.insertAdjacentElement('afterend', dataRow);
      const toggle = existingHeader.querySelector('.sales-date-toggle');
      if (toggle) {
        toggle.innerHTML = toggle.innerHTML.replace(/(\d+) sale\(s\)/, (_, n) => `${Number(n)+1} sale(s)`);
        const dayTotal = StorageAPI.getSales()
          .filter(s => s.date.slice(0,10) === dk)
          .reduce((sum, s) => sum + (s.revenue || 0), 0);
        toggle.innerHTML = toggle.innerHTML.replace(/·&nbsp;[^<]+/, `·&nbsp;${cur(dayTotal)}`);
      }
    } else {
      const label = new Date(dk).toLocaleDateString('en-US', { weekday:'short', year:'numeric', month:'short', day:'numeric' });
      const headerRow = document.createElement('tr');
      headerRow.className  = 'sales-date-header';
      headerRow.dataset.dk = dk;
      headerRow.innerHTML  = `<td colspan="6"><button class="sales-date-toggle"><span class="toggle-icon">▼</span> ${label}${isToday?' (Today)':''} — 1 sale(s) &nbsp;·&nbsp; ${cur(sale.revenue)}</button></td>`;
      headerRow.querySelector('.sales-date-toggle').addEventListener('click', ev => {
        ev.stopPropagation();
        const icon = headerRow.querySelector('.toggle-icon');
        const expanded = icon.textContent === '▼';
        let r = headerRow.nextElementSibling;
        while (r && !r.classList.contains('sales-date-header')) {
          if (r.classList.contains('sales-day-rows')) r.style.display = expanded ? 'none' : 'table-row';
          r = r.nextElementSibling;
        }
        icon.textContent = expanded ? '▶' : '▼';
      });
      tbody.querySelector('.no-data-placeholder')?.closest('tr')?.remove();
      tbody.insertBefore(dataRow,   tbody.firstChild);
      tbody.insertBefore(headerRow, dataRow);
    }
  }

  function renderSalesWeekly() {
    const sales = StorageAPI.getSales(), weeks = {};
    sales.forEach(sale => {
      const d = new Date(sale.date), dow = d.getDay();
      const mon = new Date(d); mon.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
      const wk = mon.toISOString().slice(0, 10);
      if (!weeks[wk]) weeks[wk] = { revenue: 0, cogs: 0, gp: 0, count: 0 };
      const t = Calc.saleTotals(sale);
      weeks[wk].revenue += t.revenue; weeks[wk].cogs += t.cogs; weeks[wk].gp += t.gp; weeks[wk].count++;
    });
    $('#salesWeeklyTbody').innerHTML = Object.keys(weeks).sort((a, b) => b.localeCompare(a)).map(wk => {
      const d = new Date(wk), e = new Date(wk); e.setDate(d.getDate() + 6);
      const lbl = `${d.toLocaleDateString('en-US',{month:'short',day:'numeric'})} – ${e.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}`;
      const w = weeks[wk];
      return `<tr><td>${lbl}</td><td>${cur(w.revenue)}</td><td>${cur(w.cogs)}</td><td style="color:var(--green);font-weight:600;">${cur(w.gp)}</td><td>${w.count}</td></tr>`;
    }).join('') || '<tr><td colspan="5" class="no-data-placeholder">No data</td></tr>';
  }

  function renderSalesMonthly() {
    const sales = StorageAPI.getSales(), months = {};
    sales.forEach(s => {
      const mk = s.date.slice(0, 7);
      if (!months[mk]) months[mk] = { revenue: 0, cogs: 0, gp: 0, count: 0 };
      const t = Calc.saleTotals(s); months[mk].revenue += t.revenue; months[mk].cogs += t.cogs; months[mk].gp += t.gp; months[mk].count++;
    });
    $('#salesMonthlyTbody').innerHTML = Object.keys(months).sort((a, b) => b.localeCompare(a)).map(mk => {
      const m = months[mk];
      return `<tr><td>${new Date(mk + '-01').toLocaleDateString('en-US',{year:'numeric',month:'long'})}</td><td>${cur(m.revenue)}</td><td>${cur(m.cogs)}</td><td style="color:var(--green);font-weight:600;">${cur(m.gp)}</td><td>${m.count}</td></tr>`;
    }).join('') || '<tr><td colspan="5" class="no-data-placeholder">No data</td></tr>';
  }

  function renderSalesYearly() {
    const sales = StorageAPI.getSales(), years = {};
    sales.forEach(s => {
      const yr = s.date.slice(0, 4);
      if (!years[yr]) years[yr] = { revenue: 0, cogs: 0, gp: 0, count: 0 };
      const t = Calc.saleTotals(s); years[yr].revenue += t.revenue; years[yr].cogs += t.cogs; years[yr].gp += t.gp; years[yr].count++;
    });
    $('#salesYearlyTbody').innerHTML = Object.keys(years).sort((a, b) => b.localeCompare(a)).map(yr => {
      const y = years[yr];
      return `<tr><td><strong>${yr}</strong></td><td>${cur(y.revenue)}</td><td>${cur(y.cogs)}</td><td style="color:var(--green);font-weight:600;">${cur(y.gp)}</td><td>${y.count}</td></tr>`;
    }).join('') || '<tr><td colspan="5" class="no-data-placeholder">No data</td></tr>';
  }

  function renderSalesPerItem() {
    const sales = StorageAPI.getSales(), inv = StorageAPI.getInventory();
    const start = $('#perItemStart').value || null, end = $('#perItemEnd').value || null, map = {};
    sales.filter(s => inRange(s.date, start, end)).forEach(sale => {
      sale.lines.forEach(l => {
        const key = l.item_id || l.item_name; if (!key) return;
        if (!map[key]) {
          const item = inv.find(i => i.id === l.item_id);
          map[key] = { name: l.item_name || item?.name || key, category: item?.category || '—', qty: 0, revenue: 0, cogs: 0, gp: 0 };
        }
        const t = Calc.lineTotals(l); map[key].qty += l.qty; map[key].revenue += t.revenue; map[key].cogs += t.cogs; map[key].gp += t.gp;
      });
    });
    const rows = Object.values(map).sort((a, b) => b.qty - a.qty);
    $('#salesPerItemTbody').innerHTML = rows.map(r =>
      `<tr><td>${r.name}</td><td>${r.category}</td><td><strong>${r.qty}</strong></td><td>${cur(r.revenue)}</td><td>${cur(r.cogs)}</td><td style="color:var(--green);font-weight:600;">${cur(r.gp)}</td></tr>`
    ).join('') || '<tr><td colspan="6" class="no-data-placeholder">No data</td></tr>';
  }

  function exportPerItemCsv() {
    const sales = StorageAPI.getSales(), inv = StorageAPI.getInventory();
    const start = $('#perItemStart').value || null, end = $('#perItemEnd').value || null, map = {};
    sales.filter(s => inRange(s.date, start, end)).forEach(sale => {
      sale.lines.forEach(l => {
        const key = l.item_id || l.item_name; if (!key) return;
        if (!map[key]) { const item = inv.find(i => i.id === l.item_id); map[key] = { name: l.item_name || item?.name || key, category: item?.category || '', qty: 0, revenue: 0, cogs: 0, gp: 0 }; }
        const t = Calc.lineTotals(l); map[key].qty += l.qty; map[key].revenue += t.revenue; map[key].cogs += t.cogs; map[key].gp += t.gp;
      });
    });
    StorageAPI.downloadCSV('sales_per_item.csv', Object.values(map).sort((a, b) => b.qty - a.qty));
    toast('Exported ✓');
  }

  // ── EXPENSES ───────────────────────────────────────────────────────────────
  let _expensesReady = false;
  function setupExpenses() {
    $('#expenseDate').value = today();
    if (_expensesReady) return;
    _expensesReady = true;

    const catSel = $('#expenseCategory'), customRow = $('#expenseCustomCategoryRow');
    catSel.addEventListener('change', () => {
      customRow.style.display = catSel.value === 'Other' ? 'grid' : 'none';
      if (catSel.value === 'Other') $('#expenseCustomCategory').focus();
    });

    $('#expenseSubmitBtn').addEventListener('click', () => {
      let cat = catSel.value;
      if (cat === 'Other') { cat = $('#expenseCustomCategory').value.trim(); if (!cat) { toast('Please specify a category', 'error'); return; } }
      if (!cat) { toast('Please select a category', 'error'); return; }
      const amount = Number($('#expenseAmount').value) || 0;
      if (amount <= 0) { toast('Please enter a valid amount', 'error'); return; }
      const date = $('#expenseDate').value;
      if (!date) { toast('Please select a date', 'error'); return; }

      StorageAPI.addExpense({
        id:           StorageAPI.uid('exp'),
        date:         new Date(date).toISOString(),
        account_type: $('#expenseAccountType').value,
        category:     cat,
        tin:          $('#expenseTin').value.trim(),
        amount,
        note:         $('#expenseNote').value.trim()
      });
      toast('Expense added ✓', 'success');
      // Reset form
      catSel.value = ''; $('#expenseAccountType').value = ''; $('#expenseTin').value = '';
      $('#expenseAmount').value = ''; $('#expenseNote').value = '';
      $('#expenseDate').value = today(); customRow.style.display = 'none';
      renderExpenses(); renderDashboard();
    });

    $('#expenseClearBtn').addEventListener('click', () => {
      catSel.value = ''; $('#expenseAccountType').value = ''; $('#expenseTin').value = '';
      $('#expenseAmount').value = ''; $('#expenseNote').value = '';
      $('#expenseDate').value = today(); customRow.style.display = 'none';
    });

    ['expenseFilterStart','expenseFilterEnd','expenseFilterCategory','expenseFilterAccount'].forEach(id =>
      $('#' + id).addEventListener('input', renderExpenses)
    );
  }

  function renderExpenses() {
    const expenses = StorageAPI.getExpenses();
    const start = $('#expenseFilterStart').value || null;
    const end   = $('#expenseFilterEnd').value   || null;
    const cat   = $('#expenseFilterCategory').value;
    const acc   = $('#expenseFilterAccount').value;

    const cats = Array.from(new Set(expenses.map(e => e.category).filter(Boolean))).sort();
    const accs = Array.from(new Set(expenses.map(e => e.account_type).filter(Boolean))).sort();
    const pCat = $('#expenseFilterCategory').value, pAcc = $('#expenseFilterAccount').value;
    $('#expenseFilterCategory').innerHTML = '<option value="">All Categories</option>' + cats.map(c => `<option ${c === pCat ? 'selected' : ''}>${c}</option>`).join('');
    $('#expenseFilterAccount').innerHTML  = '<option value="">All Accounts</option>'   + accs.map(a => `<option ${a === pAcc ? 'selected' : ''}>${a}</option>`).join('');

    const filtered = expenses.filter(e => inRange(e.date, start, end) && (!cat || e.category === cat) && (!acc || e.account_type === acc));

    $('#expensesTbody').innerHTML = filtered.length ? filtered.map(e => `<tr>
      <td>${new Date(e.date).toLocaleDateString()}</td>
      <td>${e.account_type || '—'}</td>
      <td>${e.category}</td>
      <td style="font-size:12px;">${e.tin || '—'}</td>
      <td style="font-weight:600;">${cur(e.amount)}</td>
      <td style="font-size:12px;max-width:200px;">${e.note || ''}</td>
      <td><button class="btn btn-danger btn-sm" data-act="del" data-id="${e.id}">Delete</button></td>
    </tr>`).join('') : '<tr><td colspan="7" class="no-data-placeholder">No expenses found</td></tr>';

    $$('#expensesTbody [data-act="del"]').forEach(btn => btn.addEventListener('click', () => {
      if (!confirm('Delete this expense?')) return;
      StorageAPI.deleteExpense(btn.dataset.id); toast('Deleted'); renderExpenses(); renderDashboard();
    }));

    const total = filtered.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
    $('#expensesTotal').textContent = cur(total);
    $('#exportExpensesCsv').onclick = () => { StorageAPI.downloadCSV('expenses.csv', filtered); toast('Exported ✓'); };
  }

  // ── STAFF ──────────────────────────────────────────────────────────────────
  let _staffReady = false;
  function setupStaff() {
    if (_staffReady) return;
    _staffReady = true;
    $('#addStaffBtn').addEventListener('click', () => openStaffDialog());
    $('#staffDialogCancel').addEventListener('click', () => $('#staffDialog').close());
    $('#staffForm').addEventListener('submit', e => {
      e.preventDefault();
      const id = $('#staffId').value || StorageAPI.uid('staff');
      const existing = $('#staffId').value ? StorageAPI.getStaffById(id) : null;
      StorageAPI.upsertStaff({
        id, name: $('#staffName').value.trim(), position: $('#staffPosition').value.trim(),
        employment_type: $('#staffType').value, salary: Number($('#staffSalary').value) || 0,
        hourly_rate: Number($('#staffHourlyRate').value) || 0,
        contact: $('#staffContact').value.trim(), hire_date: $('#staffHireDate').value,
        created_at: existing ? existing.created_at : new Date().toISOString()
      });
      $('#staffDialog').close(); toast('Staff saved ✓', 'success'); renderStaff();
    });

    $('#addPayrollBtn').addEventListener('click', () => openPayrollDialog());
    $('#payrollDialogCancel').addEventListener('click', () => $('#payrollDialog').close());
    ['payrollBase','payrollOvertime','payrollAllowance','payrollDeductions'].forEach(id =>
      $('#' + id).addEventListener('input', updatePayrollPreview)
    );
    $('#payrollHours').addEventListener('input', autoCalculateBaseFromHours);

    $('#payrollForm').addEventListener('submit', e => {
      e.preventDefault();
      const id    = $('#payrollEntryId').value || StorageAPI.uid('pay');
      const base  = Number($('#payrollBase').value)       || 0;
      const ot    = Number($('#payrollOvertime').value)   || 0;
      const allow = Number($('#payrollAllowance').value)  || 0;
      const ded   = Number($('#payrollDeductions').value) || 0;
      const staffId = $('#payrollStaffId').value;
      if (!staffId) { toast('Please select a staff member', 'error'); return; }
      StorageAPI.upsertPayroll({ id, staff_id: staffId, period: $('#payrollPeriod').value, hours_worked: Number($('#payrollHours').value) || 0, base_pay: base, overtime: ot, allowance: allow, deductions: ded, net_pay: base + ot + allow - ded, created_at: new Date().toISOString() });
      $('#payrollDialog').close(); toast('Payroll saved ✓', 'success'); renderStaff();
    });

    $('#payrollStaffFilter').addEventListener('change', renderStaff);
    $('#payrollMonth').addEventListener('change', renderStaff);
    $('#payslipPrint').addEventListener('click', printCurrentPayslip);
    $('#payslipClose').addEventListener('click', () => $('#payslipDialog').close());
    $('#exportPayrollCsv').addEventListener('click', () => { StorageAPI.downloadCSV('payroll.csv', StorageAPI.getPayroll()); toast('Exported ✓'); });
  }

  function openStaffDialog(id = null) {
    if (id) {
      const st = StorageAPI.getStaffById(id);
      $('#staffDialogTitle').textContent = 'Edit Staff';
      $('#staffId').value = st.id; $('#staffName').value = st.name || '';
      $('#staffPosition').value = st.position || ''; $('#staffType').value = st.employment_type || 'Full-time';
      $('#staffSalary').value = st.salary || ''; $('#staffHourlyRate').value = st.hourly_rate || '';
      $('#staffContact').value = st.contact || '';
      $('#staffHireDate').value = st.hire_date || '';
    } else {
      $('#staffDialogTitle').textContent = 'Add Staff';
      $('#staffForm').reset(); $('#staffId').value = '';
    }
    $('#staffDialog').showModal();
  }

  function openPayrollDialog(entryId = null) {
    const staff = StorageAPI.getStaff(), sel = $('#payrollStaffId');
    sel.innerHTML = '<option value="">Select staff…</option>' + staff.map(st => `<option value="${st.id}">${st.name}</option>`).join('');
    $('#payrollDialogTitle').textContent = entryId ? 'Edit Payroll Entry' : 'New Payroll Entry';
    if (entryId) {
      const entry = StorageAPI.getPayroll().find(p => p.id === entryId);
      if (entry) {
        $('#payrollEntryId').value = entry.id; sel.value = entry.staff_id;
        $('#payrollPeriod').value = entry.period; $('#payrollHours').value = entry.hours_worked;
        $('#payrollBase').value = entry.base_pay; $('#payrollOvertime').value = entry.overtime;
        $('#payrollAllowance').value = entry.allowance; $('#payrollDeductions').value = entry.deductions;
      }
    } else {
      $('#payrollForm').reset(); $('#payrollEntryId').value = '';
      $('#payrollPeriod').value = today().slice(0, 7);
      const fStaff = $('#payrollStaffFilter').value;
      if (fStaff) { 
        sel.value = fStaff;
        const st = StorageAPI.getStaffById(fStaff);
        if (st) {
          $('#payrollHours').value = '';
          $('#payrollBase').value = '';
        }
      }
    }
    updatePayrollPreview(); $('#payrollDialog').showModal();
  }

  function autoCalculateBaseFromHours() {
    const staffId = $('#payrollStaffId').value;
    if (!staffId) return;
    const staff = StorageAPI.getStaffById(staffId);
    if (!staff) return;
    const hourlyRate = Number(staff.hourly_rate) || 0;
    const hours = Number($('#payrollHours').value) || 0;
    const basePay = hourlyRate * hours;
    $('#payrollBase').value = basePay.toFixed(2);
    updatePayrollPreview();
  }

  function updatePayrollPreview() {
    const net = (Number($('#payrollBase').value) || 0) + (Number($('#payrollOvertime').value) || 0) + (Number($('#payrollAllowance').value) || 0) - (Number($('#payrollDeductions').value) || 0);
    $('#payrollNetPreview').textContent = cur(net);
  }

  function renderStaff() {
    const allStaff = StorageAPI.getStaff(), payroll = StorageAPI.getPayroll();
    const fStaff = $('#payrollStaffFilter').value, fMonth = $('#payrollMonth').value;

    $('#staffTbody').innerHTML = allStaff.length ? allStaff.map(st => `<tr>
      <td><strong>${st.name}</strong></td>
      <td>${st.position || '—'}</td>
      <td><span style="background:var(--green-bg);color:var(--green);padding:2px 8px;border-radius:12px;font-size:12px;font-weight:600;">${st.employment_type || '—'}</span></td>
      <td>${st.hourly_rate ? cur(st.hourly_rate) + ' /hr' : (st.salary ? cur(st.salary) : '—')}</td>
      <td>${st.contact || '—'}</td>
      <td style="font-size:12px;">${st.hire_date ? new Date(st.hire_date).toLocaleDateString() : '—'}</td>
      <td style="white-space:nowrap;">
        <button class="btn btn-ghost btn-sm" data-act="edit" data-id="${st.id}">Edit</button>
        <button class="btn btn-primary btn-sm" data-act="slip" data-id="${st.id}">Payslip</button>
        <button class="btn btn-danger btn-sm" data-act="del" data-id="${st.id}">Delete</button>
      </td>
    </tr>`).join('') : '<tr><td colspan="7" class="no-data-placeholder">No staff added yet. Click "+ Add Staff" to begin.</td></tr>';

    $$('#staffTbody [data-act="edit"]').forEach(b => b.addEventListener('click', () => openStaffDialog(b.dataset.id)));
    $$('#staffTbody [data-act="slip"]').forEach(b => b.addEventListener('click', () => showPayslipLatest(b.dataset.id)));
    $$('#staffTbody [data-act="del"]').forEach(b => b.addEventListener('click', () => {
      if (!confirm(`Delete "${StorageAPI.getStaffById(b.dataset.id)?.name}"?`)) return;
      StorageAPI.deleteStaff(b.dataset.id); toast('Staff deleted'); renderStaff();
    }));

    // Refresh payroll staff filter
    const prevF = $('#payrollStaffFilter').value;
    $('#payrollStaffFilter').innerHTML = '<option value="">All Staff</option>' + allStaff.map(st => `<option value="${st.id}" ${st.id === prevF ? 'selected' : ''}>${st.name}</option>`).join('');

    const filtered = payroll.filter(p => (!fStaff || p.staff_id === fStaff) && (!fMonth || p.period === fMonth));
    $('#payrollTbody').innerHTML = filtered.length ? filtered.map(p => {
      const st = allStaff.find(x => x.id === p.staff_id);
      const hourlyRate = st?.hourly_rate || 0;
      const hoursWorked = p.hours_worked || 0;
      const computedBase = hourlyRate * hoursWorked;
      return `<tr>
        <td>${st ? `<strong>${st.name}</strong>` : '—'}</td>
        <td>${p.period || '—'}</td>
        <td title="Hours × Hourly Rate: ${hoursWorked} hrs @ ${cur(hourlyRate)}/hr">${hoursWorked ?? '—'}</td>
        <td style="font-size:12px;color:var(--muted);" title="Computed: ${hoursWorked} × ${cur(hourlyRate)}">${cur(computedBase)}</td>
        <td>${cur(p.overtime)}</td>
        <td>${cur(p.allowance)}</td>
        <td style="color:var(--red);">${cur(p.deductions)}</td>
        <td style="font-weight:700;color:var(--green);">${cur(p.net_pay)}</td>
        <td style="white-space:nowrap;">
          <button class="btn btn-ghost btn-sm" data-act="edit" data-id="${p.id}">Edit</button>
          <button class="btn btn-primary btn-sm" data-act="slip" data-id="${p.id}">Payslip</button>
          <button class="btn btn-danger btn-sm" data-act="del" data-id="${p.id}">Delete</button>
        </td>
      </tr>`;
    }).join('') : '<tr><td colspan="9" class="no-data-placeholder">No payroll entries for selected period</td></tr>';

    $$('#payrollTbody [data-act="edit"]').forEach(b => b.addEventListener('click', () => openPayrollDialog(b.dataset.id)));
    $$('#payrollTbody [data-act="slip"]').forEach(b => b.addEventListener('click', () => showPayslipByEntry(b.dataset.id)));
    $$('#payrollTbody [data-act="del"]').forEach(b => b.addEventListener('click', () => {
      if (!confirm('Delete this payroll entry?')) return;
      StorageAPI.deletePayroll(b.dataset.id); toast('Deleted'); renderStaff();
    }));

    const total = filtered.reduce((sum, p) => sum + (Number(p.net_pay) || 0), 0);
    $('#payrollTotal').textContent = cur(total);
  }

  function showPayslipLatest(staffId) {
    const latest = StorageAPI.getPayroll()
      .filter(p => p.staff_id === staffId)
      .sort((a, b) => b.period.localeCompare(a.period))[0];
    if (!latest) { toast('No payroll entry found for this staff', 'error'); return; }
    showPayslipByEntry(latest.id);
  }

  // Store current payslip data so the print button can use it
  let _currentPayslipEntryId = null;

  function showPayslipByEntry(entryId) {
    const entry = StorageAPI.getPayroll().find(p => p.id === entryId); if (!entry) return;
    _currentPayslipEntryId = entryId;
    const st          = StorageAPI.getStaffById(entry.staff_id);
    const hourlyRate  = Number(st?.hourly_rate) || 0;
    const salary      = Number(st?.salary) || 0;
    const hoursWorked = Number(entry.hours_worked) || 0;
    const base        = Number(entry.base_pay) || (hourlyRate > 0 ? hourlyRate * hoursWorked : salary);
    const ot          = Number(entry.overtime) || 0;
    const allow       = Number(entry.allowance) || 0;
    const ded         = Number(entry.deductions) || 0;
    const net         = Number(entry.net_pay) || (base + ot + allow - ded);

    $('#payslipContent').innerHTML = `
      <div style="text-align:center;padding-bottom:14px;border-bottom:2px solid #eee;margin-bottom:14px;">
        <div style="font-size:22px;font-weight:800;letter-spacing:1px;">🍽️ RESERVE</div>
        <div style="font-size:12px;color:#888;margin-top:2px;">Official Payslip</div>
      </div>
      <table style="width:100%;font-size:13px;border-collapse:collapse;margin-bottom:14px;">
        <tr><td style="color:#888;padding:5px 0;width:50%;">Employee</td><td style="font-weight:700;text-align:right;">${st?.name || '—'}</td></tr>
        <tr><td style="color:#888;padding:5px 0;">Position</td><td style="text-align:right;">${st?.position || '—'}</td></tr>
        <tr><td style="color:#888;padding:5px 0;">Employment Type</td><td style="text-align:right;">${st?.employment_type || '—'}</td></tr>
        <tr><td style="color:#888;padding:5px 0;">Pay Period</td><td style="font-weight:600;text-align:right;">${entry.period || '—'}</td></tr>
        ${hourlyRate > 0 ? `<tr><td style="color:#888;padding:5px 0;">Hourly Rate</td><td style="text-align:right;">${cur(hourlyRate)}</td></tr>
        <tr><td style="color:#888;padding:5px 0;">Hours Worked</td><td style="text-align:right;">${hoursWorked} hrs</td></tr>` : ''}
      </table>
      <table style="width:100%;font-size:13px;border-collapse:collapse;margin-bottom:14px;">
        <thead><tr style="background:#f3f4f6;"><th style="padding:7px 8px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#6b7280;">Description</th><th style="padding:7px 8px;text-align:right;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#6b7280;">Amount</th></tr></thead>
        <tbody>
          <tr><td style="padding:6px 8px;">Base Pay${hourlyRate > 0 ? ` (${hoursWorked} hrs × ${cur(hourlyRate)})` : ''}</td><td style="text-align:right;font-weight:600;">${cur(base)}</td></tr>
          ${ot > 0 ? `<tr><td style="padding:6px 8px;">Overtime Pay</td><td style="text-align:right;">${cur(ot)}</td></tr>` : ''}
          ${allow > 0 ? `<tr><td style="padding:6px 8px;">Allowance</td><td style="text-align:right;">${cur(allow)}</td></tr>` : ''}
          ${ded > 0 ? `<tr><td style="padding:6px 8px;color:#D32F2F;">Deductions (SSS/PhilHealth/Pag-IBIG)</td><td style="text-align:right;color:#D32F2F;">−${cur(ded)}</td></tr>` : ''}
        </tbody>
      </table>
      <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 14px;background:#E8F5E9;border-radius:8px;border:1.5px solid #A5D6A7;">
        <span style="font-size:15px;font-weight:700;">NET PAY</span>
        <span style="font-size:24px;font-weight:800;color:#2E7D32;">${cur(net)}</span>
      </div>
      <div style="margin-top:16px;font-size:11px;color:#aaa;text-align:center;">Generated ${new Date().toLocaleString('en-PH')}</div>`;
    $('#payslipDialog').showModal();
  }

  function printCurrentPayslip() {
    if (!_currentPayslipEntryId) return;
    const entry = StorageAPI.getPayroll().find(p => p.id === _currentPayslipEntryId);
    if (!entry) return;
    const st          = StorageAPI.getStaffById(entry.staff_id);
    const hourlyRate  = Number(st?.hourly_rate) || 0;
    const salary      = Number(st?.salary) || 0;
    const hoursWorked = Number(entry.hours_worked) || 0;
    const base        = Number(entry.base_pay) || (hourlyRate > 0 ? hourlyRate * hoursWorked : salary);
    const ot          = Number(entry.overtime) || 0;
    const allow       = Number(entry.allowance) || 0;
    const ded         = Number(entry.deductions) || 0;
    const net         = Number(entry.net_pay) || (base + ot + allow - ded);

    const win = window.open('', '_blank', 'width=480,height=700');
    if (!win) { toast('Allow pop-ups to print payslips', 'error'); return; }
    win.document.write(`<!DOCTYPE html><html><head><title>Payslip — ${st?.name || ''}</title>
    <style>
      *{box-sizing:border-box;margin:0;padding:0;}
      body{font-family:"Inter",system-ui,sans-serif;font-size:13px;color:#111;padding:32px;max-width:420px;margin:0 auto;}
      .header{text-align:center;padding-bottom:16px;border-bottom:2px solid #e5e7eb;margin-bottom:18px;}
      .header h1{font-size:22px;font-weight:800;letter-spacing:1px;}
      .header p{font-size:11px;color:#888;margin-top:3px;}
      table{width:100%;border-collapse:collapse;margin-bottom:16px;}
      td{padding:6px 4px;font-size:13px;vertical-align:top;}
      td:last-child{text-align:right;font-weight:500;}
      .label{color:#6b7280;}
      thead tr{background:#f3f4f6;}
      th{padding:8px;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#6b7280;text-align:left;}
      th:last-child{text-align:right;}
      .net-box{display:flex;justify-content:space-between;align-items:center;background:#E8F5E9;border:1.5px solid #A5D6A7;border-radius:8px;padding:14px 16px;margin-bottom:20px;}
      .net-label{font-size:15px;font-weight:700;}
      .net-amount{font-size:26px;font-weight:800;color:#2E7D32;}
      .sig-row{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:32px;}
      .sig-box{border-top:1px solid #ccc;padding-top:6px;font-size:11px;color:#888;text-align:center;}
      .footer{text-align:center;font-size:10px;color:#aaa;margin-top:20px;}
      @media print{body{padding:16px;}@page{margin:.8cm;size:A5;}}
    </style></head><body>
    <div class="header">
      <h1>🍽️ RESERVE</h1>
      <p>Official Payslip &nbsp;·&nbsp; Pay Period: <strong>${entry.period || '—'}</strong></p>
    </div>

    <table>
      <tr><td class="label">Employee</td><td><strong>${st?.name || '—'}</strong></td></tr>
      <tr><td class="label">Position</td><td>${st?.position || '—'}</td></tr>
      <tr><td class="label">Employment Type</td><td>${st?.employment_type || '—'}</td></tr>
      ${hourlyRate > 0 ? `<tr><td class="label">Hourly Rate</td><td>${cur(hourlyRate)}</td></tr>
      <tr><td class="label">Hours Worked</td><td>${hoursWorked} hrs</td></tr>` : ''}
    </table>

    <table>
      <thead><tr><th>Description</th><th>Amount</th></tr></thead>
      <tbody>
        <tr><td>Base Pay${hourlyRate > 0 ? ` (${hoursWorked} hrs × ${cur(hourlyRate)})` : ''}</td><td style="text-align:right;font-weight:600;">${cur(base)}</td></tr>
        ${ot > 0 ? `<tr><td>Overtime Pay</td><td style="text-align:right;">${cur(ot)}</td></tr>` : ''}
        ${allow > 0 ? `<tr><td>Allowance</td><td style="text-align:right;">${cur(allow)}</td></tr>` : ''}
        ${ded > 0 ? `<tr><td style="color:#D32F2F;">Deductions (SSS / PhilHealth / Pag-IBIG)</td><td style="text-align:right;color:#D32F2F;">−${cur(ded)}</td></tr>` : ''}
      </tbody>
    </table>

    <div class="net-box">
      <span class="net-label">NET PAY</span>
      <span class="net-amount">${cur(net)}</span>
    </div>

    <div class="sig-row">
      <div class="sig-box">Prepared by</div>
      <div class="sig-box">Received by</div>
    </div>

    <div class="footer">Generated ${new Date().toLocaleString('en-PH')} &nbsp;·&nbsp; RESERVE Restaurant Manager</div>
    <script>window.onload = () => { window.print(); };<\/script>
    </body></html>`);
    win.document.close();
  }

  // ── REPORTS ────────────────────────────────────────────────────────────────
  let _reportsReady = false;
  function setupReports() {
    const now = new Date();
    $('#reportStart').value = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    $('#reportEnd').value   = now.toISOString().slice(0, 10);
    if (_reportsReady) return;
    _reportsReady = true;
    $('#reportApply').addEventListener('click', renderReports);
    $('#reportExportCsv').addEventListener('click', exportReportCsv);
  }

  function renderReports() {
    const sales    = StorageAPI.getSales();
    const expenses = StorageAPI.getExpenses();
    const payroll  = StorageAPI.getPayroll();
    const inv      = StorageAPI.getInventory();
    const start    = $('#reportStart').value || null;
    const end      = $('#reportEnd').value   || null;

    const fSales = sales.filter(s => inRange(s.date, start, end));
    const fExp   = expenses.filter(e => inRange(e.date, start, end));
    const fPay   = payroll.filter(p => {
      if (!p.period) return true;
      return (!start || p.period + '-28' >= start) && (!end || p.period + '-01' <= end);
    });

    const salesRev = fSales.reduce((sum, s) => sum + Calc.saleTotals(s).revenue, 0);
    const salesGP  = fSales.reduce((sum, s) => sum + Calc.saleTotals(s).gp, 0);
    const expTotal = fExp.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
    const payTotal = fPay.reduce((sum, p) => sum + (Number(p.net_pay) || 0), 0);
    const netP     = salesGP - expTotal - payTotal;

    $('#repSales').textContent    = cur(salesRev);
    $('#repGP').textContent       = cur(salesGP);
    $('#repExpenses').textContent = cur(expTotal);
    $('#repPayroll').textContent  = cur(payTotal);
    $('#repNP').textContent       = cur(netP);
    $('#repNP').style.color       = netP >= 0 ? 'var(--green)' : 'var(--red)';

    // Sales by day (most recent first, max 15 days)
    const dayMap = {};
    fSales.forEach(s => {
      const dk = s.date.slice(0, 10);
      if (!dayMap[dk]) dayMap[dk] = { revenue: 0, gp: 0, count: 0 };
      const t = Calc.saleTotals(s); dayMap[dk].revenue += t.revenue; dayMap[dk].gp += t.gp; dayMap[dk].count++;
    });
    const dayKeys = Object.keys(dayMap).sort((a, b) => b.localeCompare(a)).slice(0, 15);
    $('#repSalesBreakdownTbody').innerHTML = dayKeys.map(dk => {
      const d = dayMap[dk];
      const lbl = new Date(dk).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      return `<tr>
        <td style="font-size:12px;">${lbl}</td>
        <td>${cur(d.revenue)}</td>
        <td style="color:var(--green);font-weight:600;">${cur(d.gp)}</td>
        <td style="font-size:11px;color:var(--muted);">${d.count} sale(s)</td>
      </tr>`;
    }).join('') || '<tr><td colspan="4" class="no-data-placeholder">No sales in range</td></tr>';

    // Expenses by category
    const catMap = {};
    fExp.forEach(e => { const c = e.category || 'Other'; catMap[c] = (catMap[c] || 0) + (Number(e.amount) || 0); });
    const catRows = Object.entries(catMap).sort((a, b) => b[1] - a[1]);
    $('#repExpensesByCatTbody').innerHTML = catRows.map(([cat, amt]) =>
      `<tr><td>${cat}</td><td style="color:var(--red);font-weight:600;">${cur(amt)}</td><td style="font-size:12px;color:var(--muted);">${expTotal ? ((amt / expTotal) * 100).toFixed(1) + '%' : '—'}</td></tr>`
    ).join('') || '<tr><td colspan="3" class="no-data-placeholder">No expenses in range</td></tr>';

    // Top 10 items
    const itemMap = {};
    fSales.forEach(sale => {
      sale.lines.forEach(l => {
        const key = l.item_id || l.item_name; if (!key) return;
        if (!itemMap[key]) {
          const item = inv.find(i => i.id === l.item_id);
          itemMap[key] = { name: l.item_name || item?.name || key, category: item?.category || '—', qty: 0, revenue: 0, gp: 0 };
        }
        const t = Calc.lineTotals(l); itemMap[key].qty += l.qty; itemMap[key].revenue += t.revenue; itemMap[key].gp += t.gp;
      });
    });
    const topItems = Object.values(itemMap).sort((a, b) => b.qty - a.qty).slice(0, 10);
    $('#reportTopItemsTbody').innerHTML = topItems.map((t, i) =>
      `<tr>
        <td style="font-weight:700;color:var(--muted);">#${i + 1}</td>
        <td>${t.name}</td><td>${t.category}</td>
        <td><strong>${t.qty}</strong></td>
        <td>${cur(t.revenue)}</td>
        <td style="color:var(--green);font-weight:600;">${cur(t.gp)}</td>
      </tr>`
    ).join('') || '<tr><td colspan="6" class="no-data-placeholder">No sales data in this range</td></tr>';
  }

  function exportReportCsv() {
    const sales = StorageAPI.getSales(), expenses = StorageAPI.getExpenses(), payroll = StorageAPI.getPayroll();
    const start = $('#reportStart').value || null, end = $('#reportEnd').value || null;
    const fSales = sales.filter(s => inRange(s.date, start, end));
    const fExp   = expenses.filter(e => inRange(e.date, start, end));
    const fPay   = payroll.filter(p => (!start || (p.period + '-28') >= start) && (!end || (p.period + '-01') <= end));
    const salesRev = fSales.reduce((sum, s) => sum + Calc.saleTotals(s).revenue, 0);
    const salesGP  = fSales.reduce((sum, s) => sum + Calc.saleTotals(s).gp, 0);
    const expTotal = fExp.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
    const payTotal = fPay.reduce((sum, p) => sum + (Number(p.net_pay) || 0), 0);
    StorageAPI.downloadCSV('report.csv', [
      { metric: 'Period From', value: start || 'All time' },
      { metric: 'Period To',   value: end   || 'All time' },
      { metric: 'Total Sales Revenue', value: salesRev },
      { metric: 'Gross Profit',        value: salesGP  },
      { metric: 'Total Expenses',      value: expTotal },
      { metric: 'Total Payroll',       value: payTotal },
      { metric: 'Net Profit',          value: salesGP - expTotal - payTotal }
    ]);
    toast('Report exported ✓');
  }

  // ── MENU ───────────────────────────────────────────────────────────────────
  const menuOrder = [];

  // Guard flag — prevents duplicate event listeners when user logs out and back in
  let _menuReady = false;

  function setupMenu() {
    if (!_menuReady) {
      _menuReady = true;

      $$('#menu .tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          $$('#menu .tab-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          $$('#menu .tab-panel').forEach(p => p.classList.remove('active'));
          const panel = $('#' + btn.dataset.tab);
          if (panel) panel.classList.add('active');
          if (btn.dataset.tab === 'menuManageTab') renderMenuProductsTable();
          if (btn.dataset.tab === 'menuPosTab')    renderMenuBoard();
        });
      });

      $('#addMenuProductBtn').addEventListener('click', () => openMenuProductDialog());
      $('#menuProductDialogCancel').addEventListener('click', () => $('#menuProductDialog').close());
      $('#addIngredientBtn').addEventListener('click', () => addIngredientRow());

      $('#menuProductForm').addEventListener('submit', e => {
        e.preventDefault();
        const id       = $('#mpId').value || StorageAPI.uid('mp');
        const existing = StorageAPI.getMenuProductById(id);
        const now      = new Date().toISOString();
        const recipes  = collectIngredientRows();
        const product  = {
          id,
          name:         $('#mpName').value.trim(),
          category:     $('#mpCategory').value.trim(),
          price:        Number($('#mpPrice').value) || 0,
          description:  $('#mpDescription').value.trim(),
          is_available: $('#mpAvailable').checked,
          recipes,
          created_at:   existing ? existing.created_at : now,
          updated_at:   now
        };
        StorageAPI.upsertMenuProduct(product);
        toast(existing ? `"${product.name}" updated ✓` : `"${product.name}" added ✓`, 'success');
        $('#menuProductDialog').close();
        refreshMenuCategoryList();
        renderMenuBoard();
        renderMenuProductsTable();
      });

      $('#menuClearOrderBtn').addEventListener('click', () => {
        if (!menuOrder.length) return;
        if (confirm('Clear the current order?')) {
          menuOrder.length = 0;
          const saleDateEl = $('#menuSaleDate');
          if (saleDateEl) saleDateEl.value = today();
          renderOrderPad(); refreshMenuBadges();
        }
      });
      $('#menuRecordSaleBtn').addEventListener('click',  recordMenuSale);
      $('#menuPrintReceiptBtn').addEventListener('click', printMenuReceipt);

      $('#menuBoard').addEventListener('click', e => {
        const card = e.target.closest('.menu-item-card');
        if (!card || card.classList.contains('menu-unavailable')) return;
        const id = card.dataset.id;
        const product = StorageAPI.getMenuProductById(id);
        if (!product) return;
        const existing = menuOrder.find(o => o.product_id === id);
        if (existing) { existing.qty++; }
        else { menuOrder.push({ product_id: id, name: product.name, category: product.category, qty: 1, price: Number(product.price) || 0 }); }
        card.classList.add('menu-item-added');
        setTimeout(() => card.classList.remove('menu-item-added'), 350);
        refreshMenuBadges();
        renderOrderPad();
      });

      $('#menuOrderLines').addEventListener('click', e => {
        const btn = e.target.closest('button[data-idx]');
        if (!btn) return;
        const i = Number(btn.dataset.idx);
        if (isNaN(i) || i < 0 || i >= menuOrder.length) return;
        if      (btn.classList.contains('ol-minus'))  { menuOrder[i].qty--; if (menuOrder[i].qty <= 0) menuOrder.splice(i, 1); }
        else if (btn.classList.contains('ol-plus'))   { menuOrder[i].qty++; }
        else if (btn.classList.contains('ol-remove')) { menuOrder.splice(i, 1); }
        renderOrderPad(); refreshMenuBadges();
      });

      $('#menuSearch').addEventListener('input',    renderMenuBoard);
      $('#menuFilterCat').addEventListener('change', renderMenuBoard);
    }
  }

  // ── Ingredient row helpers ─────────────────────────────────────────────────
  function buildInvOptions(selectedId) {
    const sorted = [...StorageAPI.getInventory()].sort((a, b) => (a.name||'').localeCompare(b.name||''));
    return '<option value="">— Select ingredient —</option>' +
      sorted.map(it =>
        `<option value="${it.id}" data-unit="${it.unit||''}" ${it.id === selectedId ? 'selected' : ''}>${it.name}${it.unit ? ' ('+it.unit+')' : ''} [${it.inventory_type}]</option>`
      ).join('');
  }

  function addIngredientRow(data = {}) {
    const container = $('#ingredientRows');
    const emptyMsg  = $('#ingredientEmptyMsg');
    if (emptyMsg) emptyMsg.style.display = 'none';
    const row = document.createElement('div');
    row.className = 'ingredient-row';
    row.innerHTML = `
      <select class="ing-item-sel">${buildInvOptions(data.inventory_item_id || '')}</select>
      <input  class="ing-qty" type="number" step="0.001" min="0.001" placeholder="Qty" value="${data.quantity || ''}" />
      <span   class="ing-unit">${data.unit || ''}</span>
      <button type="button" class="ing-remove btn btn-ghost btn-sm btn-icon" title="Remove">✕</button>`;
    const sel  = row.querySelector('.ing-item-sel');
    const unit = row.querySelector('.ing-unit');
    sel.addEventListener('change', () => { unit.textContent = sel.options[sel.selectedIndex]?.dataset.unit || ''; });
    row.querySelector('.ing-remove').addEventListener('click', () => {
      row.remove();
      if (!container.children.length && emptyMsg) emptyMsg.style.display = '';
    });
    container.appendChild(row);
  }

  function collectIngredientRows() {
    return $$('#ingredientRows .ingredient-row').reduce((acc, row) => {
      const sel = row.querySelector('.ing-item-sel');
      const qty = Number(row.querySelector('.ing-qty').value) || 0;
      if (!sel.value || qty <= 0) return acc;
      const item = StorageAPI.getInventory().find(i => i.id === sel.value);
      acc.push({
        inventory_item_id: sel.value,
        ingredient_name:   item ? item.name : (sel.options[sel.selectedIndex]?.text || ''),
        quantity:          qty,
        unit:              row.querySelector('.ing-unit').textContent.trim()
      });
      return acc;
    }, []);
  }

  function openMenuProductDialog(id) {
    const existing = id ? StorageAPI.getMenuProductById(id) : null;
    $('#menuProductDialogTitle').textContent = existing ? 'Edit Product' : 'Add Menu Product';
    $('#mpId').value          = existing ? existing.id : '';
    $('#mpName').value        = existing ? existing.name : '';
    $('#mpCategory').value    = existing ? existing.category : '';
    $('#mpPrice').value       = existing ? existing.price : '';
    $('#mpDescription').value = existing ? (existing.description || '') : '';
    $('#mpAvailable').checked = existing ? existing.is_available !== false : true;
    $('#ingredientRows').innerHTML = '';
    const emptyMsg = $('#ingredientEmptyMsg');
    const recipes  = existing ? (existing.recipes || []) : [];
    if (recipes.length) { if (emptyMsg) emptyMsg.style.display = 'none'; recipes.forEach(r => addIngredientRow(r)); }
    else { if (emptyMsg) emptyMsg.style.display = ''; }
    $('#menuProductDialog').showModal();
    setTimeout(() => $('#mpName').focus(), 50);
  }

  function refreshMenuCategoryList() {
    const cats = Array.from(new Set(StorageAPI.getMenuProducts().map(p => p.category).filter(Boolean)));
    const dl = $('#menuCategoryList');
    if (dl) dl.innerHTML = cats.map(c => `<option value="${c}">`).join('');
  }

  function getProductStockStatus(product) {
    const recipes = product.recipes || [];
    if (!recipes.length) return 'ok';
    const inv = StorageAPI.getInventory();
    const threshold = Number(StorageAPI.getSettings().lowStockThreshold) || 10;
    let status = 'ok';
    for (const r of recipes) {
      const item  = inv.find(i => i.id === r.inventory_item_id);
      if (!item) continue;
      const stock = Number(item.stock_qty) || 0;
      const need  = Number(r.quantity)    || 0;
      if (stock < need)              return 'out';
      if (stock - need <= threshold) status = 'low';
    }
    return status;
  }

  function renderMenu() {
    refreshMenuCategoryList();
    const products = StorageAPI.getMenuProducts();
    const cats = Array.from(new Set(products.map(p => p.category).filter(Boolean)));
    const sel  = $('#menuFilterCat');
    const prev = sel.value;
    sel.innerHTML = '<option value="">All Categories</option>' +
      cats.map(c => `<option value="${c}"${c === prev ? ' selected' : ''}>${c}</option>`).join('');
    // Default sale date to today if not already set
    const saleDateInput = $('#menuSaleDate');
    if (saleDateInput && !saleDateInput.value) {
      saleDateInput.value = today();
    }
    renderMenuBoard();
    renderOrderPad();
  }

  function renderMenuBoard() {
    const products  = StorageAPI.getMenuProducts();
    const search    = ($('#menuSearch').value || '').toLowerCase().trim();
    const catFilter = $('#menuFilterCat').value;
    const available = products.filter(p => p.is_available !== false);
    const filtered  = available.filter(p => {
      if (catFilter && p.category !== catFilter) return false;
      if (search) { const hay = ((p.name||'')+' '+(p.category||'')+' '+(p.description||'')).toLowerCase(); if (!hay.includes(search)) return false; }
      return true;
    });
    const board = $('#menuBoard');
    if (!products.length) {
      board.innerHTML = `<div class="no-data-placeholder" style="padding:40px 20px;"><div style="font-size:40px;margin-bottom:12px;">🍽️</div><strong>No menu products yet.</strong><br>Click <strong>+ Add Product</strong> to add your first dish or drink.</div>`;
      return;
    }
    if (!filtered.length) { board.innerHTML = `<div class="no-data-placeholder">No products match your search.</div>`; return; }
    const byCategory = {};
    filtered.forEach(p => { const c = p.category || 'Other'; (byCategory[c] = byCategory[c] || []).push(p); });
    board.innerHTML = Object.entries(byCategory).map(([cat, prods]) => `
      <div class="menu-category-block">
        <div class="menu-category-label">${cat}</div>
        <div class="menu-items-grid">
          ${prods.map(p => {
            const inOrder = menuOrder.find(o => o.product_id === p.id);
            const status  = getProductStockStatus(p);
            const isOut   = status === 'out';
            const badge   = isOut ? `<div class="menu-stock-badge out">⛔ Out of stock</div>` : status === 'low' ? `<div class="menu-stock-badge low">⚠️ Low stock</div>` : '';
            return `<div class="menu-item-card${isOut ? ' menu-unavailable' : ''}" data-id="${p.id}">
              ${inOrder ? `<div class="menu-in-order-badge">×${inOrder.qty}</div>` : ''}
              <div class="menu-item-name">${p.name}</div>
              ${p.description ? `<div class="menu-item-desc">${p.description}</div>` : ''}
              <div class="menu-item-price">${cur(p.price)}</div>
              ${badge}
            </div>`;
          }).join('')}
        </div>
      </div>`).join('');
  }

  function refreshMenuBadges() {
    $$('#menuBoard .menu-item-card').forEach(card => {
      const id    = card.dataset.id;
      let badge   = card.querySelector('.menu-in-order-badge');
      const order = menuOrder.find(o => o.product_id === id);
      if (order) {
        if (!badge) { badge = document.createElement('div'); badge.className = 'menu-in-order-badge'; card.insertBefore(badge, card.firstChild); }
        badge.textContent = `×${order.qty}`;
      } else { if (badge) badge.remove(); }
    });
  }

  function renderOrderPad() {
    const pad = $('#menuOrderLines');
    if (!menuOrder.length) {
      pad.innerHTML = `<div style="text-align:center;padding:20px 8px;color:var(--muted);font-size:13px;">👆 Tap a product to add it</div>`;
      $('#menuSubtotal').textContent   = cur(0);
      $('#menuTotal').textContent      = cur(0);
      $('#menuOrderCount').textContent = '0 items';
      return;
    }
    let total = 0;
    pad.innerHTML = menuOrder.map((line, i) => {
      const lt = line.qty * line.price; total += lt;
      return `<div class="order-line">
        <div class="order-line-name">${line.name}</div>
        <div class="order-line-controls">
          <button class="ol-minus btn btn-ghost btn-sm btn-icon" data-idx="${i}">−</button>
          <span class="ol-qty">${line.qty}</span>
          <button class="ol-plus btn btn-ghost btn-sm btn-icon" data-idx="${i}">+</button>
        </div>
        <div class="order-line-price">${cur(lt)}</div>
        <button class="ol-remove btn btn-ghost btn-sm btn-icon" data-idx="${i}" title="Remove">✕</button>
      </div>`;
    }).join('');
    const totalItems = menuOrder.reduce((s, o) => s + o.qty, 0);
    $('#menuSubtotal').textContent   = cur(total);
    $('#menuTotal').textContent      = cur(total);
    $('#menuOrderCount').textContent = `${totalItems} item${totalItems !== 1 ? 's' : ''}`;
  }

  function recordMenuSale() {
    if (!menuOrder.length) { toast('Add at least one product to the order', 'error'); return; }

    const inv       = StorageAPI.getInventory();
    const threshold = Number(StorageAPI.getSettings().lowStockThreshold) || 10;

    // Build consolidated deduction map
    const deductMap = {};
    for (const ol of menuOrder) {
      const product = StorageAPI.getMenuProductById(ol.product_id);
      for (const r of (product?.recipes || [])) {
        if (!r.inventory_item_id) continue;
        const needed = Number(r.quantity) * ol.qty;
        if (!deductMap[r.inventory_item_id]) {
          deductMap[r.inventory_item_id] = { item: inv.find(i => i.id === r.inventory_item_id) || null, ingredient_name: r.ingredient_name, unit: r.unit || '', needed: 0 };
        }
        deductMap[r.inventory_item_id].needed += needed;
      }
    }

    // Block if any ingredient is short
    const short = Object.values(deductMap).filter(d => d.item && d.needed > (Number(d.item.stock_qty) || 0));
    if (short.length) {
      alert(`❌ Cannot record sale — insufficient ingredients:\n\n${
        short.map(d => `• ${d.ingredient_name}: need ${d.needed}${d.unit}, only ${Number(d.item.stock_qty)||0}${d.unit} left`).join('\n')
      }\n\nPlease restock before proceeding.`);
      return;
    }

    // Record the sale — use selected date from picker, fall back to now
    const saleDateRaw = $('#menuSaleDate').value;
    const saleDate    = saleDateRaw
      ? new Date(saleDateRaw + 'T' + new Date().toTimeString().slice(0, 8)).toISOString()
      : new Date().toISOString();
    const saleLines = menuOrder.map(o => ({ item_id: o.product_id, item_name: o.name, qty: o.qty, sell_price: o.price, cost_price: 0 }));
    const sale = { id: StorageAPI.uid('sale'), date: saleDate, lines: saleLines, ...Calc.saleTotals({ lines: saleLines }) };
    StorageAPI.addSale(sale);

    // Inject into sales history table instantly
    injectSaleRow(sale);

    // Deduct each ingredient from inventory + write log + inject log row live
    const nowLow = [];
    for (const [itemId, d] of Object.entries(deductMap)) {
      if (!d.item) continue;
      const prevQty = Number(d.item.stock_qty) || 0;
      const newQty  = Math.max(0, prevQty - d.needed);
      d.item.stock_qty  = newQty;
      d.item.updated_at = sale.date;
      StorageAPI.upsertItem(d.item);
      const logEntry = { item_id: itemId, item_name: d.ingredient_name, inventory_type: d.item.inventory_type, type: 'sale', qty: d.needed, balance: newQty, note: `Menu sale — ${sale.id}`, date: sale.date };
      StorageAPI.addStockLog(logEntry);
      injectLogRow(logEntry);
      if (newQty <= threshold) nowLow.push(`${d.ingredient_name} (${newQty}${d.unit} left)`);
    }
    if (nowLow.length) toast(`⚠️ Low stock: ${nowLow.join(', ')}`, 'error');

    const tableNote = $('#menuOrderNote').value.trim();
    const deducted  = Object.keys(deductMap).length;
    toast(`Sale recorded! ${tableNote ? `"${tableNote}" — ` : ''}${cur(sale.revenue)} ✓${deducted ? ` · ${deducted} ingredient${deducted>1?'s':''} deducted` : ''}`, 'success');

    const noteEl = $('#menuReceiptNote');
    noteEl.textContent   = `✅ Sale recorded! Total: ${cur(sale.revenue)}${deducted ? ' · Inventory updated' : ''}`;
    noteEl.style.display = 'block';
    setTimeout(() => { noteEl.style.display = 'none'; }, 4500);

    menuOrder.length = 0;
    $('#menuOrderNote').value = '';
    // Reset date back to today for next order
    const saleDateEl = $('#menuSaleDate');
    if (saleDateEl) saleDateEl.value = today();
    renderOrderPad();
    renderMenuBoard();
    renderInventory();
    renderDashboard();
  }

  function printMenuReceipt() {
    if (!menuOrder.length) { toast('Add products before printing', 'error'); return; }
    const tableNote = $('#menuOrderNote').value.trim();
    const total     = menuOrder.reduce((s, o) => s + o.qty * o.price, 0);
    const now       = new Date().toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' });
    const win       = window.open('', '_blank', 'width=380,height=640');
    if (!win) { toast('Allow pop-ups to print receipts', 'error'); return; }
    win.document.write(`<!DOCTYPE html><html><head><title>Receipt</title>
    <style>
      *{box-sizing:border-box;margin:0;padding:0;}
      body{font-family:"Courier New",monospace;font-size:13px;padding:20px;max-width:300px;margin:0 auto;color:#111;}
      h1{text-align:center;font-size:20px;letter-spacing:.08em;margin-bottom:2px;}
      .tagline{text-align:center;font-size:10px;color:#666;margin-bottom:14px;}
      .meta{text-align:center;font-size:11px;color:#444;margin-bottom:14px;line-height:1.7;}
      table{width:100%;border-collapse:collapse;}
      td{padding:4px 0;vertical-align:top;font-size:12px;}
      td.r{text-align:right;white-space:nowrap;padding-left:8px;}
      .item-name{font-weight:600;font-size:13px;} .item-sub{font-size:10px;color:#666;}
      hr{border:none;border-top:1px dashed #aaa;margin:10px 0;}
      .total-label{font-weight:700;font-size:15px;} .total-amt{font-weight:700;font-size:15px;text-align:right;}
      .footer{text-align:center;color:#999;font-size:10px;margin-top:16px;line-height:2;}
      @media print{body{padding:4px;}}
    </style></head><body>
    <h1>🍽️ RESERVE</h1><div class="tagline">Restaurant Manager</div>
    <div class="meta">${now}${tableNote ? `<br><strong>${tableNote}</strong>` : ''}</div>
    <hr>
    <table>${menuOrder.map(o => `
      <tr><td><div class="item-name">${o.name}</div><div class="item-sub">${o.qty} × ${cur(o.price)}</div></td><td class="r">${cur(o.qty * o.price)}</td></tr>`).join('')}
    </table>
    <hr>
    <table><tr><td class="total-label">TOTAL</td><td class="total-amt">${cur(total)}</td></tr></table>
    <div class="footer">Thank you for dining with us!<br>Please come again 😊</div>
    <script>window.onload = () => { window.print(); };<\/script>
    </body></html>`);
    win.document.close();
  }

  function renderMenuProductsTable() {
    const products = StorageAPI.getMenuProducts();
    const sorted   = [...products];
    const tbody = $('#menuProductsTbody');
    if (!sorted.length) { tbody.innerHTML = `<tr><td colspan="7" class="no-data-placeholder">No products yet — click <strong>+ Add Product</strong> to get started.</td></tr>`; return; }
    tbody.innerHTML = sorted.map(p => {
      const recipes = p.recipes || [];
      const recipeLabel = recipes.length
        ? `<span style="font-size:12px;font-weight:600;color:var(--green);">✅ ${recipes.length} ingredient${recipes.length !== 1 ? 's' : ''}</span>`
        : `<span style="font-size:12px;color:var(--muted);">— none</span>`;
      return `<tr>
        <td><strong>${p.name}</strong></td>
        <td><span class="chip" style="margin:0;">${p.category || '—'}</span></td>
        <td style="font-weight:700;color:var(--green);">${cur(p.price)}</td>
        <td style="font-size:12px;color:var(--muted);">${p.description || '—'}</td>
        <td>${recipeLabel}</td>
        <td><span style="font-size:12px;font-weight:600;color:${p.is_available !== false ? 'var(--green)' : 'var(--red)'};">${p.is_available !== false ? '✅ Yes' : '❌ No'}</span></td>
        <td style="white-space:nowrap;">
          <button class="btn btn-secondary btn-sm" data-mp-edit="${p.id}">✏️ Edit</button>
          <button class="btn btn-danger btn-sm" data-mp-del="${p.id}" style="margin-left:4px;">🗑️</button>
        </td>
      </tr>`;
    }).join('');
    tbody.querySelectorAll('[data-mp-edit]').forEach(btn => btn.addEventListener('click', () => openMenuProductDialog(btn.dataset.mpEdit)));
    tbody.querySelectorAll('[data-mp-del]').forEach(btn => btn.addEventListener('click', () => {
      const p = StorageAPI.getMenuProductById(btn.dataset.mpDel);
      if (!p || !confirm(`Delete "${p.name}" from the menu?`)) return;
      StorageAPI.deleteMenuProduct(btn.dataset.mpDel);
      toast(`"${p.name}" removed from menu`, 'success');
      renderMenuProductsTable(); renderMenuBoard();
    }));
  }

  // ── SETTINGS ───────────────────────────────────────────────────────────────
  let _settingsReady = false;
  function setupSettings() {
    const s = StorageAPI.getSettings();
    $('#setCurrency').value = s.currency || '₱';
    $('#setLowStockThreshold').value = s.lowStockThreshold || 10;

    renderChips('categoryChips', s.categories || [], name => {
      s.categories = (s.categories || []).filter(c => c !== name);
      StorageAPI.saveSettings(s); setupSettings(); refreshDatalists(); toast('Category removed');
    });
    $('#addCategoryBtn').onclick = () => {
      const v = $('#newCategory').value.trim(); if (!v) return;
      s.categories = Array.from(new Set([...(s.categories || []), v]));
      StorageAPI.saveSettings(s); $('#newCategory').value = ''; setupSettings(); refreshDatalists(); toast('Category added ✓', 'success');
    };

    renderChips('supplierChips', s.suppliers || [], name => {
      s.suppliers = (s.suppliers || []).filter(c => c !== name);
      StorageAPI.saveSettings(s); setupSettings(); refreshDatalists(); toast('Supplier removed');
    });
    $('#addSupplierBtn').onclick = () => {
      const v = $('#newSupplier').value.trim(); if (!v) return;
      s.suppliers = Array.from(new Set([...(s.suppliers || []), v]));
      StorageAPI.saveSettings(s); $('#newSupplier').value = ''; setupSettings(); refreshDatalists(); toast('Supplier added ✓', 'success');
    };

    if (!_settingsReady) {
      _settingsReady = true;
      $('#settingsForm').addEventListener('submit', e => {
        e.preventDefault();
        const s = StorageAPI.getSettings();
        s.currency = $('#setCurrency').value.trim() || '₱';
        const threshold = Number($('#setLowStockThreshold').value) || 10;
        if (threshold < 0.01) { toast('Minimum threshold is 0.01', 'error'); return; }
        s.lowStockThreshold = threshold;
        StorageAPI.saveSettings(s);
        toast('Settings saved ✓', 'success');
        refreshDatalists(); renderDashboard(); renderInventory();
      });
    }
  }

  function renderChips(containerId, arr, onRemove) {
    const el = $('#' + containerId); if (!el) return;
    el.innerHTML = arr.map(name =>
      `<span class="chip">${name}<button type="button" title="Remove ${name}">✕</button></span>`
    ).join('');
    $$('#' + containerId + ' .chip button').forEach((btn, i) => btn.addEventListener('click', () => onRemove(arr[i])));
  }

  // ── BACKUP ─────────────────────────────────────────────────────────────────
  let _backupReady = false;
  function setupBackup() {
    if (_backupReady) return;
    _backupReady = true;
    $('#backupExportBtn').addEventListener('click', () => { StorageAPI.exportJSON(); toast('Backup downloaded ✓'); });
    $('#backupImportInput').addEventListener('change', e => {
      const file = e.target.files[0]; if (!file) return;
      StorageAPI.importJSON(file, ok => {
        toast(ok ? 'Backup restored ✓' : 'Invalid backup file', ok ? 'success' : 'error');
        if (ok) renderAll();
      });
      e.target.value = '';
    });
  }

  // ── INVENTORY FILTERS SETUP ────────────────────────────────────────────────
  let _invFiltersReady = false;
  function setupInventoryFilters() {
    if (_invFiltersReady) return;
    _invFiltersReady = true;
    ['invFilterCategory', 'invFilterSupplier'].forEach(id => { const el = $('#' + id); if (el) el.addEventListener('change', renderInventory); });
    const low = $('#invFilterLowStock'); if (low) low.addEventListener('change', renderInventory);
    const srch = $('#invSearch'); if (srch) srch.addEventListener('input', renderInventory);
    ['logFilterItem','logFilterType','logFilterStart','logFilterEnd'].forEach(id => { const el = $('#' + id); if (el) el.addEventListener('change', renderStockLog); });
  }

  // ── KEYBOARD NAV ───────────────────────────────────────────────────────────
  let _keyboardReady = false;
  function setupKeyboard() {
    if (_keyboardReady) return;
    _keyboardReady = true;
    const keys = ['dashboard','inventory','menu','sales','expenses','staff','reports','settings'];
    document.addEventListener('keydown', e => {
      if (!e.altKey) return;
      const n = Number(e.key);
      if (n >= 1 && n <= keys.length) $(`.nav-link[data-section="${keys[n-1]}"]`)?.click();
    });
  }

  // ── PRINT UTILITIES ────────────────────────────────────────────────────────
  function openPrintWindow(title, bodyHtml, extraCss = '') {
    const win = window.open('', '_blank', 'width=900,height=700');
    if (!win) { toast('Allow pop-ups to print', 'error'); return; }
    win.document.write(`<!DOCTYPE html><html><head><title>${title}</title>
    <style>
      *{box-sizing:border-box;margin:0;padding:0;}
      body{font-family:"Inter",system-ui,sans-serif;font-size:13px;color:#111;padding:28px;}
      h1{font-size:20px;font-weight:700;margin-bottom:4px;}
      .meta{font-size:11px;color:#666;margin-bottom:18px;}
      table{width:100%;border-collapse:collapse;margin-bottom:16px;}
      th{background:#f3f4f6;font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:.05em;padding:8px 10px;text-align:left;border-bottom:2px solid #d1d5db;}
      td{padding:7px 10px;border-bottom:1px solid #e5e7eb;font-size:13px;}
      tr:last-child td{border-bottom:none;}
      .green{color:#2E7D32;font-weight:600;}
      .red{color:#D32F2F;font-weight:600;}
      .kpi-row{display:flex;gap:16px;flex-wrap:wrap;margin-bottom:20px;}
      .kpi-box{background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:12px 16px;min-width:120px;}
      .kpi-box .label{font-size:10px;font-weight:700;text-transform:uppercase;color:#6b7280;margin-bottom:4px;}
      .kpi-box .value{font-size:18px;font-weight:700;}
      .section-title{font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#6b7280;margin:18px 0 8px;border-bottom:1px solid #e5e7eb;padding-bottom:4px;}
      .footer{text-align:center;font-size:10px;color:#999;margin-top:24px;}
      @media print{body{padding:12px;}@page{margin:1cm;}}
      ${extraCss}
    </style></head><body>
    ${bodyHtml}
    <div class="footer">Printed from RESERVE · ${new Date().toLocaleString('en-PH')}</div>
    <script>window.onload=()=>{window.print();}<\/script>
    </body></html>`);
    win.document.close();
  }

  let _printReady = false;
  function setupPrintButtons() {
    if (_printReady) return;
    _printReady = true;
    // Dashboard print
    const dashPrint = $('#dashPrintBtn');
    if (dashPrint) dashPrint.addEventListener('click', printDashboard);

    // Inventory print
    const invPrint = $('#printInventoryBtn');
    if (invPrint) invPrint.addEventListener('click', printInventory);

    // Sales print
    const salPrint = $('#printSalesBtn');
    if (salPrint) salPrint.addEventListener('click', printSales);

    // Expenses print
    const expPrint = $('#printExpensesBtn');
    if (expPrint) expPrint.addEventListener('click', printExpenses);

    // Reports print
    const repPrint = $('#printReportsBtn');
    if (repPrint) repPrint.addEventListener('click', printReports);
  }

  function printDashboard() {
    const sales    = StorageAPI.getSales();
    const expenses = StorageAPI.getExpenses();
    const items    = StorageAPI.getInventory();
    const fs = dashFilter.start, fe = dashFilter.end;

    const presetLabels = { today: 'Today', week: 'This Week', month: 'This Month', year: 'This Year', custom: `${fs} to ${fe}` };
    const periodLabel  = presetLabels[dashFilter.preset] || 'All Time';

    const fSales = (fs && fe) ? sales.filter(s => inRange(s.date, fs, fe)) : sales;
    const fExp   = (fs && fe) ? expenses.filter(e => inRange(e.date, fs, fe)) : expenses;

    const td      = today();
    const wkStart = getWeekStart();
    const { start: mStart, end: mEnd } = getMonthRange();
    const { start: yStart, end: yEnd } = getYearRange();

    const rev  = fSales.reduce((s, x) => s + Calc.saleTotals(x).revenue, 0);
    const cogs = fSales.reduce((s, x) => s + Calc.saleTotals(x).cogs, 0);
    const gp   = fSales.reduce((s, x) => s + Calc.saleTotals(x).gp, 0);
    const exp  = fExp.reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const np   = gp - exp;

    // Top items
    const itemMap = {};
    fSales.forEach(sale => sale.lines.forEach(l => {
      const key = l.item_id || l.item_name; if (!key) return;
      if (!itemMap[key]) itemMap[key] = { name: l.item_name || key, qty: 0, revenue: 0, gp: 0 };
      const t = Calc.lineTotals(l);
      itemMap[key].qty += l.qty; itemMap[key].revenue += t.revenue; itemMap[key].gp += t.gp;
    }));
    const topItems = Object.values(itemMap).sort((a, b) => b.qty - a.qty).slice(0, 10);

    // Low stock
    const s = StorageAPI.getSettings();
    const threshold = Number(s.lowStockThreshold) || 10;
    const lowStock = items.filter(i => (Number(i.stock_qty) || 0) <= (Number(i.reorder_level) || threshold));

    const body = `
      <h1>🍽️ RESERVE — Dashboard</h1>
      <div class="meta">Period: <strong>${periodLabel}</strong> &nbsp;·&nbsp; Generated: ${new Date().toLocaleString('en-PH')}</div>

      <div class="kpi-row">
        <div class="kpi-box"><div class="label">Revenue</div><div class="value">${cur(rev)}</div></div>
        <div class="kpi-box"><div class="label">COGS</div><div class="value">${cur(cogs)}</div></div>
        <div class="kpi-box"><div class="label">Gross Profit</div><div class="value green">${cur(gp)}</div></div>
        <div class="kpi-box"><div class="label">Expenses</div><div class="value red">${cur(exp)}</div></div>
        <div class="kpi-box"><div class="label">Net Profit</div><div class="value ${np >= 0 ? 'green' : 'red'}">${cur(np)}</div></div>
        <div class="kpi-box"><div class="label">Transactions</div><div class="value">${fSales.length}</div></div>
        <div class="kpi-box"><div class="label">Stock Value</div><div class="value">${cur(Calc.totalStockValue(items))}</div></div>
      </div>

      <div class="section-title">🏆 Top Selling Products (${periodLabel})</div>
      <table>
        <thead><tr><th>#</th><th>Product</th><th>Qty Sold</th><th>Revenue</th><th>GP</th></tr></thead>
        <tbody>
          ${topItems.map((it, i) => `<tr>
            <td><strong>#${i + 1}</strong></td>
            <td>${it.name}</td>
            <td><strong>${it.qty}</strong></td>
            <td>${cur(it.revenue)}</td>
            <td class="green">${cur(it.gp)}</td>
          </tr>`).join('') || '<tr><td colspan="5" style="color:#999;text-align:center;">No sales in this period</td></tr>'}
        </tbody>
      </table>

      ${lowStock.length ? `
      <div class="section-title">⚠️ Low Stock Alerts (${lowStock.length} item${lowStock.length !== 1 ? 's' : ''})</div>
      <table>
        <thead><tr><th>Item</th><th>Category</th><th>Stock Qty</th><th>Alert Level</th></tr></thead>
        <tbody>
          ${lowStock.map(i => `<tr>
            <td><strong>${i.name}</strong></td>
            <td>${i.category || '—'}</td>
            <td class="red"><strong>${i.stock_qty}</strong></td>
            <td>${i.reorder_level || threshold}</td>
          </tr>`).join('')}
        </tbody>
      </table>` : ''}`;

    openPrintWindow('Dashboard — RESERVE', body);
  }

  function printInventory() {
    const items = StorageAPI.getInventory();
    const type  = state.inventoryType;
    const labels = { kitchen: '🍳 Kitchen Stock', beverage: '🥤 Beverage Stock', stockroom: '📦 Stock Room', pastry: '🥐 Pastry Stock', takeout: '🥡 Takeout Stock' };
    const filtered = items.filter(i => i.inventory_type === type);

    const body = `
      <h1>RESERVE — ${labels[type] || 'Inventory'}</h1>
      <div class="meta">Generated: ${new Date().toLocaleString('en-PH')} &nbsp;·&nbsp; ${filtered.length} item(s)</div>
      <table>
        <thead>
          <tr><th>Item</th><th>Category</th><th>Unit</th><th>Stock Qty</th><th>Reorder Lvl</th><th>Cost</th><th>Sell</th><th>Supplier</th></tr>
        </thead>
        <tbody>
          ${filtered.map(i => `<tr>
            <td><strong>${i.name}</strong></td>
            <td>${i.category || '—'}</td>
            <td>${i.unit || '—'}</td>
            <td><strong>${i.stock_qty}</strong></td>
            <td>${i.reorder_level || '—'}</td>
            <td>${cur(i.cost_price)}</td>
            <td class="green">${cur(i.sell_price)}</td>
            <td style="font-size:11px;">${i.supplier || '—'}</td>
          </tr>`).join('') || '<tr><td colspan="8" style="color:#999;text-align:center;">No items</td></tr>'}
        </tbody>
      </table>
      <div class="kpi-row">
        <div class="kpi-box"><div class="label">Total Items</div><div class="value">${filtered.length}</div></div>
        <div class="kpi-box"><div class="label">Total Stock Value</div><div class="value">${cur(Calc.totalStockValue(filtered))}</div></div>
      </div>`;

    openPrintWindow(`Inventory — RESERVE`, body);
  }

  function printSales() {
    const sales = StorageAPI.getSales();
    const start = $('#salesFilterStart').value || null;
    const end   = $('#salesFilterEnd').value   || null;
    const term  = ($('#salesFilterItem').value || '').toLowerCase();

    const filtered = sales
      .filter(s => inRange(s.date, start, end))
      .filter(s => !term || s.lines.some(l => (l.item_name || '').toLowerCase().includes(term)));

    const rev  = filtered.reduce((s, x) => s + (x.revenue || 0), 0);
    const cogs = filtered.reduce((s, x) => s + (x.cogs || 0), 0);
    const gp   = filtered.reduce((s, x) => s + (x.gp || (x.revenue - x.cogs) || 0), 0);

    const periodLabel = start || end ? `${start || '—'} to ${end || '—'}` : 'All Time';

    const body = `
      <h1>RESERVE — Sales History</h1>
      <div class="meta">Period: <strong>${periodLabel}</strong>${term ? ` · Filter: "${term}"` : ''} &nbsp;·&nbsp; ${filtered.length} transaction(s)</div>
      <div class="kpi-row">
        <div class="kpi-box"><div class="label">Total Revenue</div><div class="value">${cur(rev)}</div></div>
        <div class="kpi-box"><div class="label">Total COGS</div><div class="value">${cur(cogs)}</div></div>
        <div class="kpi-box"><div class="label">Gross Profit</div><div class="value green">${cur(gp)}</div></div>
        <div class="kpi-box"><div class="label">Transactions</div><div class="value">${filtered.length}</div></div>
      </div>
      <table>
        <thead><tr><th>Date &amp; Time</th><th>Items Sold</th><th>Revenue</th><th>COGS</th><th>Gross Profit</th></tr></thead>
        <tbody>
          ${[...filtered].sort((a, b) => b.date.localeCompare(a.date)).map(s => `<tr>
            <td style="white-space:nowrap;">${new Date(s.date).toLocaleString('en-PH', {dateStyle:'short',timeStyle:'short'})}</td>
            <td style="font-size:11px;">${s.lines.map(l => `${l.item_name} ×${l.qty}`).join(', ')}</td>
            <td>${cur(s.revenue)}</td>
            <td>${cur(s.cogs)}</td>
            <td class="green">${cur(s.gp || (s.revenue - s.cogs))}</td>
          </tr>`).join('') || '<tr><td colspan="5" style="color:#999;text-align:center;">No sales found</td></tr>'}
        </tbody>
      </table>`;

    openPrintWindow('Sales — RESERVE', body);
  }

  function printExpenses() {
    const expenses = StorageAPI.getExpenses();
    const start = $('#expFilterStart') ? $('#expFilterStart').value : null;
    const end   = $('#expFilterEnd')   ? $('#expFilterEnd').value   : null;
    const filtered = expenses.filter(e => inRange(e.date, start, end));
    const total = filtered.reduce((s, e) => s + (Number(e.amount) || 0), 0);

    // Group by category
    const byCategory = {};
    filtered.forEach(e => { const c = e.category || 'Other'; byCategory[c] = (byCategory[c] || 0) + (Number(e.amount) || 0); });
    const catRows = Object.entries(byCategory).sort((a, b) => b[1] - a[1]);

    const periodLabel = start || end ? `${start || '—'} to ${end || '—'}` : 'All Time';

    const body = `
      <h1>RESERVE — Expenses</h1>
      <div class="meta">Period: <strong>${periodLabel}</strong> &nbsp;·&nbsp; ${filtered.length} expense(s)</div>
      <div class="kpi-row">
        <div class="kpi-box"><div class="label">Total Expenses</div><div class="value red">${cur(total)}</div></div>
        <div class="kpi-box"><div class="label">Records</div><div class="value">${filtered.length}</div></div>
      </div>

      <div class="section-title">By Category</div>
      <table>
        <thead><tr><th>Category</th><th>Amount</th><th>Share</th></tr></thead>
        <tbody>
          ${catRows.map(([cat, amt]) => `<tr>
            <td>${cat}</td>
            <td class="red">${cur(amt)}</td>
            <td style="color:#6b7280;">${total ? ((amt / total) * 100).toFixed(1) + '%' : '—'}</td>
          </tr>`).join('')}
        </tbody>
      </table>

      <div class="section-title">All Records</div>
      <table>
        <thead><tr><th>Date</th><th>Category</th><th>Account Type</th><th>Note</th><th>Amount</th></tr></thead>
        <tbody>
          ${[...filtered].sort((a, b) => b.date.localeCompare(a.date)).map(e => `<tr>
            <td>${new Date(e.date).toLocaleDateString('en-PH')}</td>
            <td>${e.category || '—'}</td>
            <td style="font-size:11px;">${e.account_type || '—'}</td>
            <td style="font-size:11px;">${e.note || '—'}</td>
            <td class="red"><strong>${cur(e.amount)}</strong></td>
          </tr>`).join('') || '<tr><td colspan="5" style="color:#999;text-align:center;">No expenses</td></tr>'}
        </tbody>
      </table>`;

    openPrintWindow('Expenses — RESERVE', body);
  }

  function printReports() {
    const sales    = StorageAPI.getSales();
    const expenses = StorageAPI.getExpenses();
    const inv      = StorageAPI.getInventory();
    const start    = $('#reportStart').value || null;
    const end      = $('#reportEnd').value   || null;

    const fSales = sales.filter(s => inRange(s.date, start, end));
    const fExp   = expenses.filter(e => inRange(e.date, start, end));

    const rev  = fSales.reduce((s, x) => s + Calc.saleTotals(x).revenue, 0);
    const cogs = fSales.reduce((s, x) => s + Calc.saleTotals(x).cogs, 0);
    const gp   = fSales.reduce((s, x) => s + Calc.saleTotals(x).gp, 0);
    const exp  = fExp.reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const np   = gp - exp;

    // Item breakdown
    const itemMap = {};
    fSales.forEach(sale => sale.lines.forEach(l => {
      const key = l.item_id || l.item_name; if (!key) return;
      if (!itemMap[key]) { const item = inv.find(i => i.id === l.item_id); itemMap[key] = { name: l.item_name || item?.name || key, category: item?.category || '—', qty: 0, revenue: 0, gp: 0 }; }
      const t = Calc.lineTotals(l); itemMap[key].qty += l.qty; itemMap[key].revenue += t.revenue; itemMap[key].gp += t.gp;
    }));
    const topItems = Object.values(itemMap).sort((a, b) => b.qty - a.qty).slice(0, 15);

    const catMap = {};
    fExp.forEach(e => { const cat = e.category || 'Other'; catMap[cat] = (catMap[cat] || 0) + (Number(e.amount) || 0); });

    const periodLabel = start || end ? `${start || '—'} to ${end || '—'}` : 'All Time';

    const body = `
      <h1>RESERVE — Financial Report</h1>
      <div class="meta">Period: <strong>${periodLabel}</strong> &nbsp;·&nbsp; Generated: ${new Date().toLocaleString('en-PH')}</div>

      <div class="section-title">Summary</div>
      <div class="kpi-row">
        <div class="kpi-box"><div class="label">Revenue</div><div class="value">${cur(rev)}</div></div>
        <div class="kpi-box"><div class="label">COGS</div><div class="value">${cur(cogs)}</div></div>
        <div class="kpi-box"><div class="label">Gross Profit</div><div class="value green">${cur(gp)}</div></div>
        <div class="kpi-box"><div class="label">Total Expenses</div><div class="value red">${cur(exp)}</div></div>
        <div class="kpi-box"><div class="label">Net Profit</div><div class="value ${np >= 0 ? 'green' : 'red'}">${cur(np)}</div></div>
        <div class="kpi-box"><div class="label">Transactions</div><div class="value">${fSales.length}</div></div>
      </div>

      <div class="section-title">Top Products</div>
      <table>
        <thead><tr><th>#</th><th>Product</th><th>Category</th><th>Qty</th><th>Revenue</th><th>GP</th></tr></thead>
        <tbody>${topItems.map((it, i) => `<tr>
          <td><strong>#${i + 1}</strong></td>
          <td>${it.name}</td>
          <td>${it.category}</td>
          <td><strong>${it.qty}</strong></td>
          <td>${cur(it.revenue)}</td>
          <td class="green">${cur(it.gp)}</td>
        </tr>`).join('') || '<tr><td colspan="6" style="color:#999;text-align:center;">No data</td></tr>'}
        </tbody>
      </table>

      <div class="section-title">Expenses by Category</div>
      <table>
        <thead><tr><th>Category</th><th>Amount</th><th>Share</th></tr></thead>
        <tbody>${Object.entries(catMap).sort((a, b) => b[1] - a[1]).map(([cat, amt]) => `<tr>
          <td>${cat}</td>
          <td class="red">${cur(amt)}</td>
          <td style="color:#6b7280;">${exp ? ((amt / exp) * 100).toFixed(1) + '%' : '—'}</td>
        </tr>`).join('') || '<tr><td colspan="3" style="color:#999;text-align:center;">No expenses</td></tr>'}
        </tbody>
      </table>`;

    openPrintWindow('Financial Report — RESERVE', body);
  }

  // ── RENDER ALL ─────────────────────────────────────────────────────────────
  function renderAll() {
    renderDashboard();
    renderInventory();
    renderSalesHistory();
    renderExpenses();
    // Staff and reports are rendered on demand (nav click) to avoid DOM errors
  }

  // ── BOOT ───────────────────────────────────────────────────────────────────
  async function boot() {
    if (state.booted) return;
    state.booted = true;

    // Wait for all data to load from Supabase
    await StorageAPI.ensureDefaults();

    refreshDatalists();
    setupNav();
    applyRoleUI();
    setupTheme();
    setupItemDialog();
    setupRestockDialog();
    setupDashboardFilter();
    setupPrintButtons();
    setupInventoryCsv();
    setupSales();
    setupExpenses();
    setupMenu();
    setupStaff();
    setupReports();
    setupSettings();
    setupBackup();
    setupInventoryFilters();
    setupKeyboard();
    $('#year').textContent = new Date().getFullYear();

    renderAll();
    toast('Welcome to RESERVE 👋', 'success');
  }

  document.addEventListener('DOMContentLoaded', setupLogin);
})();
