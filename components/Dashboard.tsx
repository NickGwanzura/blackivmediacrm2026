import React, { useMemo } from 'react';
import {
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell, PieChart, Pie, ComposedChart, Line
} from 'recharts';
import {
  DollarSign, FileText, Activity, Users, TrendingUp, TrendingDown,
  Bell, AlertTriangle, Calendar, Wrench, Receipt, CircleDollarSign, Wallet, Clock
} from 'lucide-react';
import {
  getContracts, getInvoices, getBillboards, getClients,
  getExpenses, mockPrintingJobs,
  getExpiringContracts, getOverdueInvoices, getUpcomingBillings,
  getFinancialTrends, getMaintenanceLogs,
} from '../services/mockData';
import { getCurrentUser } from '../services/authService';
import { BillboardType } from '../types';
import { formatCurrency, formatCurrencyTotals, sumByCurrency } from '../utils/sanitizers';

// Single-currency formatter for charts/tooltips where all points share one
// denomination. Defaults to USD since financial trends remain USD-only in
// the legacy series; cards that handle mixed currencies use
// formatCurrencyTotals instead.
const fmt = (n: number) => formatCurrency(Math.round(n), 'USD');

const pct = (num: number, denom: number): number => {
  if (!Number.isFinite(num) || !Number.isFinite(denom) || denom <= 0) return 0;
  return Math.round((num / denom) * 100);
};

// Combine two { USD: n, ZWG: n } maps element-wise.
const mergeTotals = (a: Record<string, number>, b: Record<string, number>): Record<string, number> => {
  const out: Record<string, number> = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = (out[k] || 0) + v;
  return out;
};

// a - b per currency. Missing currencies on either side default to 0.
const subtractTotals = (a: Record<string, number>, b: Record<string, number>): Record<string, number> => {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const out: Record<string, number> = {};
  for (const k of keys) out[k] = (a[k] || 0) - (b[k] || 0);
  return out;
};

const greeting = () => {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
};

const EXPENSE_COLORS = ['#18181b', '#f97316', '#0ea5e9', '#10b981', '#a855f7', '#64748b'];

export const Dashboard: React.FC = () => {
  const contracts = getContracts();
  const invoices = getInvoices();
  const billboards = getBillboards();
  const clients = getClients();
  const expenses = getExpenses();
  const printingJobs = mockPrintingJobs;

  const expiringContracts = getExpiringContracts();
  const overdueInvoices = getOverdueInvoices();
  const upcomingBillings = useMemo(() => getUpcomingBillings().slice(0, 3), []);
  const financialTrends = useMemo(() => getFinancialTrends(), []);
  const maintenanceLogs = getMaintenanceLogs();
  const maintenanceNeeds = maintenanceLogs.filter(l => l.status === 'Needs Attention');

  // --- Financials ---
  // Dual-currency: revenue/expense/profit are reported PER CURRENCY. Mixed
  // currencies cannot be summed into a single scalar, so KPI cards render a
  // "USD X · ZWG Y" string via formatCurrencyTotals and every per-currency
  // aggregation is kept as { USD: n, ZWG: n }.
  const invoiceRows = invoices.filter(i => i.type === 'Invoice');
  const receiptRows = invoices.filter(i => i.type === 'Receipt');
  const outstandingRows = invoiceRows.filter(i => i.status === 'Pending' || i.status === 'Overdue');

  const revenueByCurrency     = sumByCurrency(invoiceRows,    i => i.total, i => i.currency);
  const collectedByCurrency   = sumByCurrency(receiptRows,    i => i.total, i => i.currency);
  const outstandingByCurrency = sumByCurrency(outstandingRows, i => i.total, i => i.currency);

  const opsExpensesByCurrency   = sumByCurrency(expenses,      e => e.amount,    e => e.currency);
  const printingCostByCurrency  = sumByCurrency(printingJobs,  p => p.totalCost, p => (p as any).currency);
  const expenditureByCurrency = mergeTotals(opsExpensesByCurrency, printingCostByCurrency);

  const profitByCurrency = subtractTotals(revenueByCurrency, expenditureByCurrency);

  // Per-currency margin (profit ÷ revenue) is only meaningful within one
  // denomination. Pick the currency with the most revenue for the headline
  // margin chip; this stays useful in USD-only deployments while being
  // honest about which currency drives the headline number.
  const primaryCurrency =
    Object.entries(revenueByCurrency).sort((a, b) => b[1] - a[1])[0]?.[0]
    || Object.keys(profitByCurrency)[0]
    || 'USD';
  const primaryRevenue = revenueByCurrency[primaryCurrency] || 0;
  const primaryProfit = profitByCurrency[primaryCurrency] || 0;
  const profitMargin = pct(primaryProfit, primaryRevenue);
  const profitPositive = Object.values(profitByCurrency).every(v => v >= 0);

  // Single-currency scalars kept for the financial-trends chart (revenue vs.
  // expenses over time). The trend series collapses to USD for now because
  // historical data has no currency column; once ZWG history accrues the
  // chart can be duplicated or overlaid by currency.
  const outstandingAmount = Object.values(outstandingByCurrency).reduce((a, v) => a + v, 0);

  // --- Fleet / Occupancy ---
  const ledBillboards = billboards.filter(b => b.type === BillboardType.LED);
  const staticBillboards = billboards.filter(b => b.type === BillboardType.Static);

  const totalLedSlots = ledBillboards.reduce((a, b) => a + (b.totalSlots || 0), 0);
  const rentedLedSlots = ledBillboards.reduce((a, b) => a + Math.min(b.rentedSlots || 0, b.totalSlots || 0), 0);

  const totalStaticSides = staticBillboards.length * 2;
  const rentedStaticSides = staticBillboards.reduce((a, b) => {
    let c = 0;
    if (b.sideAStatus === 'Rented') c++;
    if (b.sideBStatus === 'Rented') c++;
    return a + c;
  }, 0);

  const totalInventory = totalLedSlots + totalStaticSides;
  const totalRented = rentedLedSlots + rentedStaticSides;
  const occupancyRate = pct(totalRented, totalInventory);

  const occupancyData = [
    { name: 'Occupied', value: totalRented },
    { name: 'Available', value: Math.max(totalInventory - totalRented, 0) },
  ];

  // --- Clients & Contracts ---
  // Mirror syncBillboardAvailability: an Active contract whose endDate is in
  // the past doesn't contribute to occupancy, so it shouldn't inflate this
  // KPI either. No automated sweep flips stale Actives to Expired yet.
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const activeContracts = contracts.filter(c => c.status === 'Active' && new Date(c.endDate) >= startOfToday).length;
  const activeClients = clients.filter(c => c.status === 'Active').length;

  // --- Revenue by Town ---
  // Bars are keyed by (town, currency) so "Harare (USD)" and "Harare (ZWG)"
  // appear as separate entries. Recharts can't render two currencies in one
  // bar, and converting with an exchange rate would drift — splitting keeps
  // totals comparable within each denomination.
  const revenueByTownData = useMemo(() => {
    const byTownCurrency = new Map<string, { name: string; value: number; currency: string }>();
    for (const b of billboards) {
      const activeContracts = contracts.filter(c => c.billboardId === b.id && c.status === 'Active');
      for (const c of activeContracts) {
        const code = (c.currency || 'USD').toUpperCase();
        const key = `${b.town}::${code}`;
        const existing = byTownCurrency.get(key);
        const value = (existing?.value || 0) + (c.totalContractValue || 0);
        byTownCurrency.set(key, { name: `${b.town} (${code})`, value, currency: code });
      }
    }
    return Array.from(byTownCurrency.values())
      .filter(x => x.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
  }, [billboards, contracts]);

  // --- Top Clients (by billed) ---
  // Same split: one entry per (client, currency). A client with both USD
  // and ZWG invoices shows up twice so neither total is distorted.
  const topClientsData = useMemo(() => {
    const entries: { name: string; value: number; currency: string }[] = [];
    for (const c of clients) {
      const byCurrency = sumByCurrency(
        invoices.filter(i => i.clientId === c.id && i.type === 'Invoice'),
        i => i.total,
        i => i.currency,
      );
      for (const [code, value] of Object.entries(byCurrency)) {
        if (value > 0) entries.push({ name: `${c.companyName} (${code})`, value, currency: code });
      }
    }
    return entries.sort((a, b) => b.value - a.value).slice(0, 5);
  }, [clients, invoices]);

  // --- Expense Breakdown ---
  // Percentages only make sense within a single currency, so the pie chart
  // renders the *primary* currency's expense categories. A chip below the
  // title names which currency is shown, and the non-primary totals appear
  // in the KPI row above so nothing is hidden.
  const expenseBreakdown = useMemo(() => {
    const byCategory = new Map<string, number>();
    for (const e of expenses) {
      if (((e.currency || 'USD').toUpperCase()) !== primaryCurrency) continue;
      byCategory.set(e.category, (byCategory.get(e.category) || 0) + (e.amount || 0));
    }
    const printingInPrimary = printingJobs
      .filter(p => ((p as any).currency || 'USD').toUpperCase() === primaryCurrency)
      .reduce((a, p) => a + (p.totalCost || 0), 0);
    if (printingInPrimary > 0) {
      byCategory.set('Printing', (byCategory.get('Printing') || 0) + printingInPrimary);
    }
    return Array.from(byCategory.entries())
      .map(([name, value]) => ({ name, value }))
      .filter(x => x.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [expenses, printingJobs, primaryCurrency]);

  const primaryExpenditure = expenditureByCurrency[primaryCurrency] || 0;

  const user = getCurrentUser();
  const today = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

  const getClientName = (id: string) => clients.find(c => c.id === id)?.companyName || 'Unknown';
  const getBillboardName = (id: string) => billboards.find(b => b.id === id)?.name || 'Unknown';

  return (
    <div className="space-y-8 animate-fade-in pb-12 flex flex-col xl:flex-row gap-8">
      <div className="flex-1 space-y-8 min-w-0">

        {/* Greeting / Overview Header */}
        <div className="bg-white rounded-3xl p-8 border border-slate-100 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
            <div>
              <p className="text-sm text-slate-500 font-medium mb-1">{today}</p>
              <h1 className="text-3xl md:text-4xl font-extrabold text-slate-900 tracking-tight">
                {greeting()}{user?.firstName ? `, ${user.firstName}` : ''}.
              </h1>
              <p className="text-sm text-slate-500 mt-2 max-w-lg">
                Here's your fleet health and financials at a glance.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2 text-right">
              <div className="px-4 py-2 rounded-xl bg-slate-50 border border-slate-100 min-w-[84px]">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Billboards</p>
                <p className="text-lg font-extrabold text-slate-900">{billboards.length}</p>
              </div>
              <div className="px-4 py-2 rounded-xl bg-slate-50 border border-slate-100 min-w-[84px]">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Contracts</p>
                <p className="text-lg font-extrabold text-slate-900">{activeContracts}</p>
              </div>
              <div className="px-4 py-2 rounded-xl bg-slate-50 border border-slate-100 min-w-[84px]">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Clients</p>
                <p className="text-lg font-extrabold text-slate-900">{activeClients}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Primary KPIs — Financial
            Dual currency: each KPI renders "USD X · ZWG Y". Margin is the
            primary-currency margin only (mixing denominators would be
            misleading). */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <KpiCard
            label="Total Revenue"
            value={formatCurrencyTotals(revenueByCurrency)}
            icon={DollarSign}
            tone="dark"
            sub={`${formatCurrencyTotals(collectedByCurrency)} collected`}
          />
          <KpiCard
            label="Expenditure"
            value={formatCurrencyTotals(expenditureByCurrency)}
            icon={Wallet}
            tone="amber"
            sub={`${formatCurrencyTotals(opsExpensesByCurrency)} ops · ${formatCurrencyTotals(printingCostByCurrency)} print`}
          />
          <KpiCard
            label="Net Profit"
            value={formatCurrencyTotals(profitByCurrency)}
            icon={profitPositive ? TrendingUp : TrendingDown}
            tone={profitPositive ? 'emerald' : 'rose'}
            sub={`${profitMargin}% ${primaryCurrency} margin`}
          />
          <KpiCard
            label="Occupancy"
            value={`${occupancyRate}%`}
            icon={Activity}
            tone="slate"
            sub={`${totalRented} / ${totalInventory} sides`}
          />
        </div>

        {/* Secondary KPIs — Activity */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MiniStat label="Active Contracts" value={activeContracts} icon={FileText} />
          <MiniStat label="Active Clients" value={activeClients} icon={Users} />
          <MiniStat
            label="Overdue"
            value={overdueInvoices.length}
            sub={formatCurrencyTotals(sumByCurrency(overdueInvoices, i => i.total, i => i.currency))}
            icon={AlertTriangle}
            tone="rose"
          />
          <MiniStat
            label="Expiring 30d"
            value={expiringContracts.length}
            icon={Clock}
            tone="amber"
          />
        </div>

        {/* Financial Performance */}
        <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
            <div>
              <h3 className="text-xl font-bold text-slate-900">Financial Performance</h3>
              <p className="text-sm text-slate-500 font-medium">Revenue, expenses, and margin over time</p>
            </div>
            <Legend />
          </div>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={financialTrends}>
                <defs>
                  <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#18181b" stopOpacity={0.85} />
                    <stop offset="100%" stopColor="#18181b" stopOpacity={0.3} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f4f4f5" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#71717a', fontSize: 12, fontWeight: 500 }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#71717a', fontSize: 12 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  formatter={(v: number) => fmt(v)}
                  contentStyle={{ backgroundColor: 'rgba(255,255,255,0.95)', borderRadius: 12, border: '1px solid #e4e4e7', padding: 12 }}
                  itemStyle={{ fontSize: 13, fontWeight: 600 }}
                  cursor={{ fill: '#f4f4f5' }}
                />
                <Bar dataKey="revenue" barSize={26} fill="url(#revenueGradient)" radius={[6, 6, 0, 0]} name="Revenue" />
                <Bar dataKey="expenses" barSize={26} fill="#e4e4e7" radius={[6, 6, 0, 0]} name="Expenses" />
                <Line type="monotone" dataKey="margin" stroke="#f97316" strokeWidth={3} dot={{ r: 4, fill: '#f97316', strokeWidth: 2, stroke: '#fff' }} name="Net Margin" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Expense Breakdown + Top Locations */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Expenditure Breakdown</h3>
                <p className="text-xs text-slate-500 font-medium mt-0.5">By category, {primaryCurrency} only · full multi-currency totals in the KPI row</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{primaryCurrency} Total</p>
                <p className="text-lg font-extrabold text-slate-900">{formatCurrency(primaryExpenditure, primaryCurrency)}</p>
              </div>
            </div>
            {expenseBreakdown.length === 0 ? (
              <EmptyState icon={Receipt} title="No expenses recorded" hint="Log expenses in the Expenses tab." />
            ) : (
              <div className="h-64 flex items-center gap-6">
                <div className="w-40 h-full shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={expenseBreakdown}
                        cx="50%" cy="50%"
                        innerRadius={48} outerRadius={70}
                        paddingAngle={3} dataKey="value" stroke="none" cornerRadius={4}
                      >
                        {expenseBreakdown.map((_, i) => (
                          <Cell key={i} fill={EXPENSE_COLORS[i % EXPENSE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v: number) => formatCurrency(v, primaryCurrency)} contentStyle={{ borderRadius: 12, border: '1px solid #e4e4e7', fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex-1 min-w-0 space-y-2">
                  {expenseBreakdown.map((row, i) => {
                    const share = pct(row.value, primaryExpenditure);
                    return (
                      <div key={row.name} className="flex items-center gap-3">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: EXPENSE_COLORS[i % EXPENSE_COLORS.length] }} />
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-baseline text-sm mb-1">
                            <span className="font-bold text-slate-800 truncate">{row.name}</span>
                            <span className="font-bold text-slate-900 ml-2">{formatCurrency(row.value, primaryCurrency)}</span>
                          </div>
                          <div className="h-1 rounded-full bg-slate-100 overflow-hidden">
                            <div
                              className="h-full rounded-full"
                              style={{ width: `${share}%`, background: EXPENSE_COLORS[i % EXPENSE_COLORS.length] }}
                            />
                          </div>
                        </div>
                        <span className="text-xs font-bold text-slate-400 w-10 text-right">{share}%</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
            <h3 className="text-lg font-bold text-slate-900 mb-6">Top Locations</h3>
            {revenueByTownData.length === 0 ? (
              <EmptyState icon={CircleDollarSign} title="No active contracts yet" hint="Active contracts will rank here by value." />
            ) : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={revenueByTownData} layout="vertical" margin={{ left: 0, right: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f4f4f5" />
                    <XAxis type="number" hide />
                    <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fill: '#52525b', fontSize: 12, fontWeight: 600 }} width={120} />
                    <Tooltip formatter={(v: number, _n, p: any) => formatCurrency(v, p?.payload?.currency)} cursor={{ fill: 'transparent' }} contentStyle={{ borderRadius: 12, border: '1px solid #e4e4e7' }} />
                    <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={20}>
                      {revenueByTownData.map((_, i) => (
                        <Cell key={i} fill={['#18181b', '#3f3f46', '#71717a', '#a1a1aa', '#d4d4d8'][i % 5]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>

        {/* Occupancy Donut */}
        <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-lg font-bold text-slate-900">Fleet Occupancy</h3>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">{totalRented} / {totalInventory} sides</span>
          </div>
          <div className="h-64 relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={occupancyData}
                  cx="50%" cy="50%"
                  innerRadius={85} outerRadius={105}
                  startAngle={90} endAngle={-270}
                  paddingAngle={5} dataKey="value" stroke="none" cornerRadius={8}
                >
                  <Cell fill="#f97316" />
                  <Cell fill="#e7e5e4" />
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none pb-4">
              <span className="text-5xl font-black text-slate-900 tracking-tighter">{occupancyRate}%</span>
              <span className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Occupied</span>
            </div>
          </div>
        </div>
      </div>

      {/* Sidebar */}
      <aside className="w-full xl:w-96 space-y-6 min-w-0">
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
          <div className="flex items-center gap-2 mb-6 text-slate-800 font-bold uppercase tracking-wide text-xs">
            <Bell size={16} className="text-orange-500" /> Action Required
          </div>

          <div className="space-y-4">
            {upcomingBillings.length > 0 && (
              <div className="mb-6 pb-6 border-b border-slate-100">
                <div className="flex items-center gap-2 mb-4">
                  <Calendar size={14} className="text-orange-500" />
                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wide">Upcoming Collections</h4>
                </div>
                <div className="space-y-3">
                  {upcomingBillings.map((bill, i) => (
                    <div key={i} className="flex justify-between items-center p-3 bg-slate-50 rounded-2xl border border-slate-100/50 hover:bg-white hover:shadow-md transition-all">
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-800 truncate">{bill.clientName}</p>
                        <p className="text-[10px] text-slate-400 font-medium mt-0.5">Due: {bill.date}</p>
                      </div>
                      <p className="text-xs font-bold text-orange-600 bg-orange-50 px-2 py-1 rounded-lg shrink-0 ml-2">{formatCurrencyTotals(bill.amountByCurrency)}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {expiringContracts.length === 0 && overdueInvoices.length === 0 && maintenanceNeeds.length === 0 ? (
              <div className="p-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-3 text-emerald-600">
                  <TrendingUp size={20} />
                </div>
                <p className="text-sm font-medium text-slate-500">All caught up!</p>
                <p className="text-xs text-slate-400">No pending alerts.</p>
              </div>
            ) : (
              <>
                {maintenanceNeeds.map(log => (
                  <AlertRow
                    key={log.id}
                    tone="orange"
                    icon={Wrench}
                    label="Maintenance Due"
                    title={getBillboardName(log.billboardId)}
                    sub={`${log.type} check required`}
                  />
                ))}
                {expiringContracts.map(c => (
                  <AlertRow
                    key={c.id}
                    tone="amber"
                    icon={Bell}
                    label="Expiring Contract"
                    title={getClientName(c.clientId)}
                    sub={`Ends ${c.endDate}`}
                  />
                ))}
                {overdueInvoices.slice(0, 3).map(inv => (
                  <AlertRow
                    key={inv.id}
                    tone="rose"
                    icon={AlertTriangle}
                    label="Overdue Payment"
                    title={getClientName(inv.clientId)}
                    sub={`${formatCurrency(inv.total || 0, inv.currency)} · #${inv.id}`}
                  />
                ))}
              </>
            )}
          </div>
        </div>

        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-6">Revenue Sources</h3>
          {topClientsData.length === 0 ? (
            <EmptyState icon={Users} title="No client billings yet" hint="Billed clients appear here." />
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topClientsData} layout="vertical" margin={{ left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f4f4f5" />
                  <XAxis type="number" hide />
                  <YAxis dataKey="name" type="category" width={110} axisLine={false} tickLine={false} tick={{ fill: '#71717a', fontSize: 11, fontWeight: 600 }} />
                  <Tooltip formatter={(v: number, _n, p: any) => formatCurrency(v, p?.payload?.currency)} cursor={{ fill: 'transparent' }} contentStyle={{ borderRadius: 12, border: '1px solid #e4e4e7' }} />
                  <Bar dataKey="value" fill="#18181b" radius={[0, 6, 6, 0]} barSize={16}>
                    {topClientsData.map((_, i) => (
                      <Cell key={i} fill={['#18181b', '#27272a', '#3f3f46', '#52525b', '#71717a'][i % 5]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
};

// --- Small, local building blocks ---

type Tone = 'dark' | 'amber' | 'emerald' | 'rose' | 'slate';

const TONE_MAP: Record<Tone, { icon: string; ring: string; chip: string }> = {
  dark:    { icon: 'bg-slate-900 text-white',    ring: 'group-hover:bg-slate-900 group-hover:text-white', chip: 'bg-slate-50 text-slate-700 border-slate-100' },
  amber:   { icon: 'bg-amber-50 text-amber-600', ring: 'group-hover:bg-amber-500 group-hover:text-white', chip: 'bg-amber-50 text-amber-700 border-amber-100' },
  emerald: { icon: 'bg-emerald-50 text-emerald-600', ring: 'group-hover:bg-emerald-500 group-hover:text-white', chip: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
  rose:    { icon: 'bg-rose-50 text-rose-600',   ring: 'group-hover:bg-rose-500 group-hover:text-white',  chip: 'bg-rose-50 text-rose-700 border-rose-100' },
  slate:   { icon: 'bg-slate-100 text-slate-700',ring: 'group-hover:bg-slate-900 group-hover:text-white', chip: 'bg-slate-50 text-slate-700 border-slate-200' },
};

const KpiCard: React.FC<{
  label: string;
  value: string;
  sub?: string;
  icon: React.ComponentType<{ className?: string; size?: number }>;
  tone: Tone;
}> = ({ label, value, sub, icon: Icon, tone }) => {
  const t = TONE_MAP[tone];
  return (
    <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 group">
      <div className="flex items-center justify-between mb-4">
        <div className={`p-3 rounded-2xl shadow-sm transition-all ${t.icon} ${t.ring}`}>
          <Icon className="w-6 h-6" />
        </div>
        {sub && <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${t.chip}`}>{sub}</span>}
      </div>
      <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">{label}</p>
      <h3 className="text-3xl font-black text-slate-900 tracking-tight truncate">{value}</h3>
    </div>
  );
};

const MiniStat: React.FC<{
  label: string;
  value: number | string;
  sub?: string;
  icon: React.ComponentType<{ className?: string; size?: number }>;
  tone?: Tone;
}> = ({ label, value, sub, icon: Icon, tone = 'slate' }) => {
  const t = TONE_MAP[tone];
  return (
    <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${t.icon}`}>
        <Icon size={18} />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 truncate">{label}</p>
        <p className="text-xl font-extrabold text-slate-900 leading-tight">{value}</p>
        {sub && <p className="text-[10px] font-semibold text-slate-500 truncate">{sub}</p>}
      </div>
    </div>
  );
};

const Legend: React.FC = () => (
  <div className="flex items-center gap-2 text-xs font-bold bg-slate-50 p-1.5 rounded-xl border border-slate-200 flex-wrap">
    <div className="flex items-center gap-2 px-3 py-1.5 bg-white rounded-lg shadow-sm text-slate-800"><span className="w-2.5 h-2.5 rounded-full bg-slate-900" /> Revenue</div>
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-slate-500"><span className="w-2.5 h-2.5 rounded-full bg-orange-500" /> Margin</div>
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-slate-500"><span className="w-2.5 h-2.5 rounded-full bg-slate-300" /> Expenses</div>
  </div>
);

const EmptyState: React.FC<{
  icon: React.ComponentType<{ size?: number; className?: string }>;
  title: string;
  hint: string;
}> = ({ icon: Icon, title, hint }) => (
  <div className="h-64 flex flex-col items-center justify-center text-center p-6 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
    <div className="w-12 h-12 rounded-full bg-white border border-slate-100 flex items-center justify-center mb-3 text-slate-500 shadow-sm">
      <Icon size={20} />
    </div>
    <p className="text-sm font-bold text-slate-700">{title}</p>
    <p className="text-xs text-slate-400 mt-1 max-w-xs">{hint}</p>
  </div>
);

const ALERT_TONES: Record<'orange' | 'amber' | 'rose', { bg: string; border: string; icon: string; label: string }> = {
  orange: { bg: 'bg-orange-50', border: 'border-orange-100', icon: 'text-orange-500 border-orange-50', label: 'text-orange-700' },
  amber:  { bg: 'bg-amber-50',  border: 'border-amber-100',  icon: 'text-amber-500 border-amber-50',  label: 'text-amber-700' },
  rose:   { bg: 'bg-rose-50',   border: 'border-rose-100',   icon: 'text-rose-500 border-rose-50',    label: 'text-rose-700' },
};

const AlertRow: React.FC<{
  tone: 'orange' | 'amber' | 'rose';
  icon: React.ComponentType<{ size?: number }>;
  label: string;
  title: string;
  sub: string;
}> = ({ tone, icon: Icon, label, title, sub }) => {
  const t = ALERT_TONES[tone];
  return (
    <div className={`p-4 rounded-2xl flex items-start gap-3 border ${t.bg} ${t.border}`}>
      <div className={`p-2 bg-white rounded-xl shadow-sm border shrink-0 ${t.icon}`}>
        <Icon size={16} />
      </div>
      <div className="min-w-0">
        <h4 className={`text-xs font-bold uppercase tracking-wide mb-0.5 ${t.label}`}>{label}</h4>
        <p className="text-sm font-bold text-slate-800 truncate">{title}</p>
        <p className="text-xs text-slate-500 mt-1 truncate">{sub}</p>
      </div>
    </div>
  );
};
