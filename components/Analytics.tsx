
import React from 'react';
import { getInvoices, getExpenses, mockPrintingJobs, mockOutsourcedBillboards, getFinancialTrends } from '../services/mockData';
import {
    AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell, Legend
} from 'recharts';
import { TrendingUp, TrendingDown, DollarSign, Wallet, Download } from 'lucide-react';
import { generateProfitAnalyticsPDF } from '../services/pdfGenerator';
import { formatCurrency, formatCurrencyTotals, sumByCurrency } from '../utils/sanitizers';

export const Analytics: React.FC = () => {
    // Dual-currency aggregation: revenue, expenses, and profit are computed
    // per denomination. Totals never mix USD with ZWG — the KPI cards show
    // "USD X · ZWG Y" and the trend/pie charts collapse to a reporting
    // currency chosen by the primary (largest) revenue currency.
    const invoiceRows = getInvoices().filter(i => i.type === 'Invoice');
    const expenses = getExpenses();
    const printingJobs = mockPrintingJobs;
    const outsourcedRows = mockOutsourcedBillboards;

    const revenueByCurrency = sumByCurrency(invoiceRows,    i => i.total,       i => i.currency);
    const opsByCurrency     = sumByCurrency(expenses,       e => e.amount,      e => e.currency);
    const printByCurrency   = sumByCurrency(printingJobs,   p => p.totalCost,   p => (p as any).currency);
    const outsourcedByCurrency = sumByCurrency(outsourcedRows, o => (o.monthlyPayout || 0) * 12, o => o.currency); // annualized

    const mergeTotals = (...maps: Record<string, number>[]): Record<string, number> => {
        const out: Record<string, number> = {};
        for (const m of maps) for (const [k, v] of Object.entries(m)) out[k] = (out[k] || 0) + v;
        return out;
    };
    const expensesByCurrency = mergeTotals(opsByCurrency, printByCurrency, outsourcedByCurrency);
    const profitByCurrency: Record<string, number> = {};
    for (const code of new Set([...Object.keys(revenueByCurrency), ...Object.keys(expensesByCurrency)])) {
        profitByCurrency[code] = (revenueByCurrency[code] || 0) - (expensesByCurrency[code] || 0);
    }

    // Legacy scalar totals for the trend chart / PDF — these collapse to a
    // single number, which is only correct if all rows share one currency.
    // Dashboards above handle the split case; this chart series is retained
    // for the legacy USD-only historical data path.
    const totalRevenue = Object.values(revenueByCurrency).reduce((a, v) => a + v, 0);
    const totalExpenses = Object.values(expensesByCurrency).reduce((a, v) => a + v, 0);
    const netProfit = totalRevenue - totalExpenses;
    const primaryCurrency =
        Object.entries(revenueByCurrency).sort((a, b) => b[1] - a[1])[0]?.[0] || 'USD';
    const primaryRevenue = revenueByCurrency[primaryCurrency] || 0;
    const primaryProfit  = profitByCurrency[primaryCurrency] || 0;
    const profitMargin = primaryRevenue > 0 ? (primaryProfit / primaryRevenue) * 100 : 0;

    // Pie chart split per-currency so "Operational (USD)" and
    // "Operational (ZWG)" render as distinct slices.
    const expenseBreakdown = [
        ...Object.entries(opsByCurrency).map(([code, value]) => ({ name: `Operational (${code})`, value, currency: code })),
        ...Object.entries(printByCurrency).map(([code, value]) => ({ name: `Printing (${code})`, value, currency: code })),
        ...Object.entries(outsourcedByCurrency).map(([code, value]) => ({ name: `Outsourced (${code})`, value, currency: code })),
    ].filter(e => e.value > 0);

    // Use dynamic trend data derived from actual invoices/expenses
    const monthlyData = getFinancialTrends().map(m => ({
        month: m.name,
        revenue: m.revenue,
        expenses: m.expenses,
        profit: m.margin
    })).filter(d => !d.month.includes('Proj'));

    const COLORS = ['#ef4444', '#f59e0b', '#3b82f6'];

    const handleDownloadReport = () => {
        generateProfitAnalyticsPDF(monthlyData, expenseBreakdown, { revenue: totalRevenue, expenses: totalExpenses, profit: netProfit, margin: profitMargin });
    };

    return (
        <div className="space-y-8 animate-fade-in">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h2 className="text-4xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-slate-900 to-slate-600 mb-2">Profit Analytics</h2>
                    <p className="text-slate-500 font-medium">Deep dive into financial health, margins, and expense distribution</p>
                </div>
                <button onClick={handleDownloadReport} className="bg-slate-900 text-white px-5 py-3 rounded-full text-sm font-bold uppercase tracking-wider hover:bg-slate-800 shadow-lg hover:shadow-xl transition-all flex items-center gap-2">
                    <Download size={18} /> Download Report
                </button>
            </div>

            {/* Scorecards — dual currency: each card renders "USD X · ZWG Y" */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
                    <p className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-2">Total Revenue</p>
                    <h3 className="text-3xl md:text-4xl font-extrabold text-slate-900 tracking-tight break-words">{formatCurrencyTotals(revenueByCurrency)}</h3>
                    <div className="mt-4 flex items-center gap-2 text-green-600 bg-green-50 w-fit px-2 py-1 rounded-full text-xs font-bold">
                        <TrendingUp size={14} /> Based on Actuals
                    </div>
                </div>
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
                    <p className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-2">Total Expenses</p>
                    <h3 className="text-3xl md:text-4xl font-extrabold text-slate-900 tracking-tight break-words">{formatCurrencyTotals(expensesByCurrency)}</h3>
                    <p className="text-xs text-slate-400 mt-2 font-medium">Includes payouts & production</p>
                </div>
                <div className="bg-slate-900 p-6 rounded-2xl shadow-lg border border-slate-800 text-white hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
                    <p className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-2">Net Profit</p>
                    <h3 className="text-3xl md:text-4xl font-extrabold text-white tracking-tight break-words">{formatCurrencyTotals(profitByCurrency)}</h3>
                    <div className="mt-4 flex justify-between items-center">
                        <span className="text-xs text-slate-400 font-medium">{primaryCurrency} Margin</span>
                        <span className={`font-bold ${profitMargin >= 0 ? 'text-green-400' : 'text-red-400'}`}>{profitMargin.toFixed(1)}%</span>
                    </div>
                </div>
            </div>

            {/* Graphs */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100">
                    <h3 className="text-lg font-bold text-slate-800 mb-6">Profit Trend (Last 6 Months)</h3>
                    <div className="h-72">
                         <ResponsiveContainer width="100%" height="100%">
                            {monthlyData.length > 0 ? (
                                <AreaChart data={monthlyData}>
                                    <defs>
                                    <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.2}/>
                                        <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                                    </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                    <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{fill: '#94a3b8'}} />
                                    <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8'}} />
                                    <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0' }} />
                                    <Area type="monotone" dataKey="profit" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorProfit)" />
                                </AreaChart>
                            ) : (
                                <div className="flex items-center justify-center h-full text-slate-400">No data available yet.</div>
                            )}
                        </ResponsiveContainer>
                    </div>
                </div>

                <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100">
                    <h3 className="text-lg font-bold text-slate-800 mb-6">Expense Distribution</h3>
                    <div className="h-72">
                        <ResponsiveContainer width="100%" height="100%">
                             {expenseBreakdown.length > 0 ? (
                                 <PieChart>
                                    <Pie 
                                        data={expenseBreakdown} 
                                        dataKey="value" 
                                        cx="50%" cy="50%" 
                                        innerRadius={60} 
                                        outerRadius={100} 
                                        paddingAngle={5}
                                    >
                                        {expenseBreakdown.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip formatter={(v: number, _n, p: any) => formatCurrency(v, p?.payload?.currency)} contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0' }} />
                                    <Legend verticalAlign="middle" align="right" layout="vertical" iconType="circle" />
                                 </PieChart>
                             ) : (
                                <div className="flex items-center justify-center h-full text-slate-400">No expenses recorded yet.</div>
                             )}
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            {/* Detailed Reporting Table */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                    <h3 className="text-lg font-bold text-slate-800">Monthly Performance Report</h3>
                    <button onClick={handleDownloadReport} className="text-xs font-bold text-indigo-600 bg-indigo-50 px-4 py-2 rounded-xl hover:bg-indigo-100 transition-colors uppercase tracking-wider">Download PDF</button>
                </div>
                <table className="w-full text-left text-sm text-slate-600">
                    <thead className="bg-slate-50 border-b border-slate-100">
                        <tr>
                            <th className="px-6 py-4 font-bold text-xs uppercase text-slate-400 tracking-wider">Month</th>
                            <th className="px-6 py-4 font-bold text-xs uppercase text-slate-400 tracking-wider text-right">Revenue</th>
                            <th className="px-6 py-4 font-bold text-xs uppercase text-slate-400 tracking-wider text-right">Expenses</th>
                            <th className="px-6 py-4 font-bold text-xs uppercase text-slate-400 tracking-wider text-right">Net Profit</th>
                            <th className="px-6 py-4 font-bold text-xs uppercase text-slate-400 tracking-wider text-right">Margin</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {monthlyData.length > 0 ? monthlyData.map((data, i) => (
                             <tr key={i} className="hover:bg-slate-50 transition-colors">
                                 <td className="px-6 py-4 font-bold text-slate-800">{data.month}</td>
                                 <td className="px-6 py-4 text-right font-medium">{formatCurrency(data.revenue, primaryCurrency)}</td>
                                 <td className="px-6 py-4 text-right font-medium">{formatCurrency(data.expenses, primaryCurrency)}</td>
                                 <td className="px-6 py-4 text-right font-bold text-green-600">{formatCurrency(data.profit, primaryCurrency)}</td>
                                 <td className="px-6 py-4 text-right">{data.revenue > 0 ? ((data.profit/data.revenue)*100).toFixed(1) : 0}%</td>
                             </tr>
                        )) : (
                            <tr><td colSpan={5} className="px-6 py-8 text-center text-slate-400">No data available for report.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    )
}
