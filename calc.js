// calc.js — finance formulas/utilities for RESERVE
(function () {
  function currency(n, symbol='₱') {
    const val = (Number(n) || 0).toFixed(2);
    return `${symbol}${val.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
  }

  // Stock value per item
  function stockValue(item) {
    return (Number(item.stock_qty) || 0) * (Number(item.cost_price) || 0);
  }
  function totalStockValue(items) {
    return items.reduce((sum, it) => sum + stockValue(it), 0);
  }

  // Compute the discount amount for a single line item
  // line.item_discount = { type: 'percent'|'fixed'|'senior'|'none', value: Number }
  function lineDiscount(line) {
    const base = (Number(line.qty) || 0) * (Number(line.sell_price) || 0);
    const d = line.item_discount;
    if (!d || d.type === 'none' || !d.type) return 0;
    if (d.type === 'percent') return base * Math.min(Number(d.value) || 0, 100) / 100;
    if (d.type === 'fixed')   return Math.min(Number(d.value) || 0, base);
    if (d.type === 'senior')  return base * 0.20;
    return 0;
  }

  // Sale computations per line
  function lineTotals(line, defaultTaxPct=0) {
    const qty = Number(line.qty) || 0;
    const sellPrice = Number(line.sell_price) || 0;
    const costPrice = Number(line.cost_price) || 0;
    // Per-item discount support
    const gross = sellPrice * qty;
    const itemDisc = lineDiscount(line);
    const revenue = gross - itemDisc; // deduct per-item discount
    const cogs = costPrice * qty;
    const gp = revenue - cogs;
    return { gross, revenue, cogs, gp };
  }

  // Sale totals
  function saleTotals(sale, defaultTaxPct=0) {
    // If sale already has pre-calculated revenue (e.g., from menu with discount),
    // use that and adjust GP accordingly
    if (sale.revenue !== undefined && typeof sale.revenue === 'number') {
      const cogs = (sale.lines || []).reduce((sum, line) => sum + (line.cost_price || 0) * (Number(line.qty) || 0), 0);
      const gp = sale.revenue - cogs;
      return { revenue: sale.revenue, cogs, gp };
    }

    // Legacy: recalculate from line items
    const totals = (sale.lines || []).reduce((acc, line) => {
      const t = lineTotals(line, defaultTaxPct);
      acc.revenue += t.revenue;
      acc.cogs += t.cogs;
      acc.gp += t.gp;
      return acc;
    }, { revenue: 0, cogs: 0, gp: 0 });
    return totals;
  }

  function withinDate(dateStr, start, end) {
    const d = dateStr.slice(0, 10);
    return (!start || d >= start) && (!end || d <= end);
  }

  function sumExpenses(expenses, start, end) {
    return expenses.filter(e => withinDate(e.date, start, end)).reduce((s, e) => s + (Number(e.amount) || 0), 0);
  }

  function sumSalesRevenue(sales, start, end, defaultTaxPct=0) {
    return sales.filter(s => withinDate(s.date, start, end)).reduce((s, sale) => s + saleTotals(sale, defaultTaxPct).revenue, 0);
  }
  function sumSalesCogs(sales, start, end, defaultTaxPct=0) {
    return sales.filter(s => withinDate(s.date, start, end)).reduce((s, sale) => s + saleTotals(sale, defaultTaxPct).cogs, 0);
  }
  function sumSalesGP(sales, start, end, defaultTaxPct=0) {
    return sales.filter(s => withinDate(s.date, start, end)).reduce((s, sale) => s + saleTotals(sale, defaultTaxPct).gp, 0);
  }

  function netProfit(sales, expenses, start, end, defaultTaxPct=0) {
    return sumSalesGP(sales, start, end, defaultTaxPct) - sumExpenses(expenses, start, end);
  }

  function groupByDateTotals(sales, expenses, days=30, defaultTaxPct=0) {
    const today = new Date();
    const labels = [];
    const salesTotals = [];
    const expTotals = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const key = d.toISOString().slice(0,10);
      labels.push(key);
      const salesDay = sales.filter(s => s.date.slice(0,10) === key).reduce((sum, s) => sum + saleTotals(s, defaultTaxPct).revenue, 0);
      const expDay = expenses.filter(e => e.date.slice(0,10) === key).reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
      salesTotals.push(salesDay);
      expTotals.push(expDay);
    }
    return { labels, salesTotals, expTotals };
  }

  function groupByMonthlyTotals(sales, expenses, months=12, defaultTaxPct=0) {
    const today = new Date();
    const labels = [];
    const salesTotals = [];
    const expTotals = [];
    
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const monthLabel = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
      labels.push(monthLabel);
      
      const monthStart = new Date(year, d.getMonth(), 1).toISOString().slice(0,10);
      const monthEnd = new Date(year, d.getMonth() + 1, 0).toISOString().slice(0,10);
      
      const salesMonth = sales
        .filter(s => s.date.slice(0,10) >= monthStart && s.date.slice(0,10) <= monthEnd)
        .reduce((sum, s) => sum + saleTotals(s, defaultTaxPct).revenue, 0);
      const expMonth = expenses
        .filter(e => e.date.slice(0,10) >= monthStart && e.date.slice(0,10) <= monthEnd)
        .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
      
      salesTotals.push(salesMonth);
      expTotals.push(expMonth);
    }
    return { labels, salesTotals, expTotals };
  }

  // Fixed January → December for a specific year — always 12 bars, Jan on the left
  function groupByCalendarYear(sales, expenses, year, defaultTaxPct=0) {
    const monthNames  = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const labels      = [];
    const salesTotals = [];
    const expTotals   = [];

    for (let m = 0; m < 12; m++) {
      const monthStart = new Date(year, m, 1).toISOString().slice(0, 10);
      const monthEnd   = new Date(year, m + 1, 0).toISOString().slice(0, 10);

      labels.push(monthNames[m]);

      const salesMonth = sales
        .filter(s => s.date.slice(0, 10) >= monthStart && s.date.slice(0, 10) <= monthEnd)
        .reduce((sum, s) => sum + saleTotals(s, defaultTaxPct).revenue, 0);

      const expMonth = expenses
        .filter(e => e.date.slice(0, 10) >= monthStart && e.date.slice(0, 10) <= monthEnd)
        .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

      salesTotals.push(salesMonth);
      expTotals.push(expMonth);
    }
    return { labels, salesTotals, expTotals };
  }

  function topSellingItems(sales, defaultTaxPct=0, limit=10) {
    const map = new Map();
    sales.forEach(sale => sale.lines.forEach(line => {
      // support manual lines (item_name) or item_id if present
      const key = line.item_id || line.item_name;
      const qty = Number(line.qty) || 0;
      const gp = lineTotals(line, defaultTaxPct).gp;
      if (!key) return; // skip anonymous lines
      const entry = map.get(key) || { qty: 0, gp: 0, label: (line.item_name || line.item_id) };
      entry.qty += qty; entry.gp += gp; map.set(key, entry);
    }));
    const arr = Array.from(map.entries()).map(([item_id, v]) => ({ item_id, ...v }));
    arr.sort((a,b) => b.qty - a.qty);
    return arr.slice(0, limit);
  }

  function topItemsMonthlyTrend(sales, inventory, months=12, limit=5) {
    const today = new Date();
    const labels = [];
    const topItems = {};
    
    // Get overall top items
    const allTopItems = topSellingItems(sales, 0, limit);
    
    // Initialize top items map
    allTopItems.forEach(item => {
      topItems[item.item_id] = {
        label: item.label,
        data: []
      };
    });
    
    // Process each month
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const year = d.getFullYear();
      const month = d.getMonth();
      const monthLabel = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
      labels.push(monthLabel);
      
      const monthStart = new Date(year, month, 1).toISOString().slice(0,10);
      const monthEnd = new Date(year, month + 1, 0).toISOString().slice(0,10);
      
      // Filter sales for this month
      const monthSales = sales.filter(s => s.date.slice(0,10) >= monthStart && s.date.slice(0,10) <= monthEnd);
      
      // Calculate qty for each top item in this month
      allTopItems.forEach(item => {
        let qty = 0;
        monthSales.forEach(sale => {
          sale.lines.forEach(line => {
            if (line.item_id === item.item_id) {
              qty += Number(line.qty) || 0;
            }
          });
        });
        topItems[item.item_id].data.push(qty);
      });
    }
    
    return { labels, topItems };
  }

  function topSellingByCategory(sales, inventory, defaultTaxPct=0, limit=5) {
    const byCategory = {};
    
    sales.forEach(sale => sale.lines.forEach(line => {
      const itemId = line.item_id;
      const item = inventory.find(i => i.id === itemId);
      const category = item?.category || 'Other';
      
      const qty = Number(line.qty) || 0;
      if (!itemId && !line.item_name) return;
      
      if (!byCategory[category]) {
        byCategory[category] = new Map();
      }
      
      const key = itemId || line.item_name;
      const entry = byCategory[category].get(key) || { 
        qty: 0,
        label: item?.name || line.item_name || itemId 
      };
      entry.qty += qty;
      byCategory[category].set(key, entry);
    }));
    
    // Convert to arrays and sort each category
    const result = {};
    Object.entries(byCategory).forEach(([cat, map]) => {
      const arr = Array.from(map.entries())
        .map(([item_id, v]) => ({ item_id, ...v }))
        .sort((a, b) => b.qty - a.qty)
        .slice(0, limit);
      if (arr.length > 0) {
        result[cat] = arr;
      }
    });
    
    return result;
  }

  function topSellingCurrentMonth(sales, inventory, defaultTaxPct=0, limit=5) {
    // Find most recent month with sales
    let monthStart, monthEnd;
    
    if (sales.length === 0) {
      // If no sales, use current month
      const today = new Date();
      monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0,10);
      monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().slice(0,10);
    } else {
      // Find the month of the most recent sale
      const sortedSales = [...sales].sort((a, b) => new Date(b.date) - new Date(a.date));
      const latestSaleDate = new Date(sortedSales[0].date);
      monthStart = new Date(latestSaleDate.getFullYear(), latestSaleDate.getMonth(), 1).toISOString().slice(0,10);
      monthEnd = new Date(latestSaleDate.getFullYear(), latestSaleDate.getMonth() + 1, 0).toISOString().slice(0,10);
    }
    
    const monthSales = sales.filter(s => s.date.slice(0,10) >= monthStart && s.date.slice(0,10) <= monthEnd);
    
    // Group inventory by category with sales data
    const byCategory = {};
    
    // First, populate with all inventory items
    inventory.forEach(item => {
      const category = item.category || 'Other';
      if (!byCategory[category]) {
        byCategory[category] = new Map();
      }
      byCategory[category].set(item.id, {
        qty: 0,
        label: item.name,
        id: item.id
      });
    });
    
    // Then add sales data
    monthSales.forEach(sale => sale.lines.forEach(line => {
      const itemId = line.item_id;
      const item = inventory.find(i => i.id === itemId);
      if (!item) return;
      
      const category = item.category || 'Other';
      const qty = Number(line.qty) || 0;
      
      if (!byCategory[category]) {
        byCategory[category] = new Map();
      }
      
      const entry = byCategory[category].get(itemId) || {
        qty: 0,
        label: item.name,
        id: itemId
      };
      entry.qty += qty;
      byCategory[category].set(itemId, entry);
    }));
    
    // Convert to arrays and sort each category (non-moving first, best sellers last)
    const result = {};
    Object.entries(byCategory).forEach(([cat, map]) => {
      const arr = Array.from(map.values())
        .sort((a, b) => a.qty - b.qty);
      if (arr.length > 0) {
        result[cat] = arr;
      }
    });
    
    return result;
  }

  // Convert payroll records into expense-shaped objects so they can be
  // merged with the expenses array for totals and chart data.
  //
  // Period format is now "YYYY-MM-C" where C is the cutoff number:
  //   C=1  → 1st–15th  → mapped to YYYY-MM-01
  //   C=2  → 16th–end  → mapped to YYYY-MM-16
  // Legacy entries stored as "YYYY-MM" are mapped to YYYY-MM-01.
  function periodToDate(period) {
    if (!period) return null;
    // New format: "2025-06-1" or "2025-06-2"
    const cutoffMatch = period.match(/^(\d{4}-\d{2})-([12])$/);
    if (cutoffMatch) {
      const [, ym, c] = cutoffMatch;
      return ym + (c === '1' ? '-01' : '-16');
    }
    // Legacy "YYYY-MM" format
    const legacyMatch = period.match(/^(\d{4}-\d{2})$/);
    if (legacyMatch) return period + '-01';
    return null;
  }

  function payrollToExpenses(payroll) {
    return (payroll || []).map(p => {
      const date = periodToDate(p.period) || (p.created_at || '').slice(0, 10);
      return {
        id:       p.id,
        date,
        amount:   Number(p.net_pay) || 0,
        category: 'Payroll',
        note:     p.staff_id ? `Staff payroll (${p.period || ''})` : 'Payroll',
        _isPayroll: true
      };
    });
  }

  window.Calc = {
    currency,
    stockValue, totalStockValue,
    lineDiscount, lineTotals, saleTotals,
    sumExpenses, sumSalesRevenue, sumSalesCogs, sumSalesGP, netProfit,
    groupByDateTotals, groupByMonthlyTotals, groupByCalendarYear, topSellingItems, topSellingByCategory, topSellingCurrentMonth, topItemsMonthlyTrend,
    withinDate,
    periodToDate,
    payrollToExpenses
  };
})();
