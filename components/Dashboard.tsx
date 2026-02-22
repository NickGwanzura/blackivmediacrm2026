
import React, { useState } from 'react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  BarChart, Bar, Cell, PieChart, Pie, ComposedChart, Line
} from 'recharts';
import { DollarSign, FileText, Activity, Users, Sparkles, TrendingUp, Bell, AlertTriangle, Calendar, ArrowRight, BrainCircuit, Wrench } from 'lucide-react';
import { getContracts, getInvoices, getBillboards, getClients, getExpiringContracts, getOverdueInvoices, getUpcomingBillings, getFinancialTrends, getMaintenanceLogs } from '../services/mockData';
import { BillboardType } from '../types';
import { analyzeBusinessData } from '../services/aiService';

export const Dashboard: React.FC = () => {
  const [aiQuery, setAiQuery] = useState('');
  const [aiResponse, setAiResponse] = useState<string | null>(null);
  const [loadingAi, setLoadingAi] = useState(false);

  // Live Data
  const contracts = getContracts();
  const invoices = getInvoices();
  const billboards = getBillboards();
  const clients = getClients();

  // Notification Data
  const expiringContracts = getExpiringContracts();
  const overdueInvoices = getOverdueInvoices();
  const upcomingBillings = getUpcomingBillings().slice(0, 3);
  const financialTrends = getFinancialTrends();
  const maintenanceLogs = getMaintenanceLogs();
  const maintenanceNeeds = maintenanceLogs.filter(l => l.status === 'Needs Attention');

  const totalRevenue = invoices.filter(i => i.type === 'Invoice').reduce((acc, curr) => acc + curr.total, 0);
  const activeContracts = contracts.filter(c => c.status === 'Active').length;
  
  const ledBillboards = billboards.filter(b => b.type === BillboardType.LED);
  const totalLedSlots = ledBillboards.reduce((acc, b) => acc + (b.totalSlots || 0), 0);
  const rentedLedSlots = ledBillboards.reduce((acc, b) => acc + (b.rentedSlots || 0), 0);
  
  const staticBillboards = billboards.filter(b => b.type === BillboardType.Static);
  const totalStaticSides = staticBillboards.length * 2;
  const rentedStaticSides = staticBillboards.reduce((acc, b) => {
    let count = 0;
    if (b.sideAStatus === 'Rented') count++;
    if (b.sideBStatus === 'Rented') count++;
    return acc + count;
  }, 0);

  const occupancyRate = Math.round(((rentedLedSlots + rentedStaticSides) / (totalLedSlots + totalStaticSides)) * 100) || 0;

  const occupancyData = [
    { name: 'Occupied', value: rentedLedSlots + rentedStaticSides },
    { name: 'Available', value: (totalLedSlots + totalStaticSides) - (rentedLedSlots + rentedStaticSides) },
  ];
  const OCCUPANCY_COLORS = ['#f97316', '#e7e5e4']; // Orange-500, Stone-200

  const topClientsData = clients.map(client => {
      const clientRevenue = invoices
        .filter(i => i.clientId === client.id && i.type === 'Invoice')
        .reduce((acc, curr) => acc + curr.total, 0);
      return { name: client.companyName, value: clientRevenue };
  }).sort((a, b) => b.value - a.value).slice(0, 5);

  const revenueByTownData = billboards.reduce((acc: any[], curr) => {
      const billboardContracts = contracts.filter(c => c.billboardId === curr.id && c.status === 'Active');
      const revenue = billboardContracts.reduce((sum, c) => sum + c.totalContractValue, 0);
      const existing = acc.find(item => item.name === curr.town);
      if (existing) { existing.value += revenue; } else { acc.push({ name: curr.town, value: revenue }); }
      return acc;
  }, []).sort((a: any, b: any) => b.value - a.value).slice(0, 5);

  const handleAskAI = async (e?: React.FormEvent) => {
      if(e) e.preventDefault();
      if(!aiQuery) return;
      setLoadingAi(true);
      const context = `Revenue: $${totalRevenue}. Occupancy: ${occupancyRate}%. Active Contracts: ${activeContracts}. Expiring (30d): ${expiringContracts.length}. Overdue: ${overdueInvoices.length}. Maintenance Alerts: ${maintenanceNeeds.length}. Top Client: ${topClientsData[0]?.name}. User Q: ${aiQuery}`;
      const result = await analyzeBusinessData(context);
      setAiResponse(result);
      setLoadingAi(false);
  };

  const getClientName = (id: string) => clients.find(c => c.id === id)?.companyName || 'Unknown';
  const getBillboardName = (id: string) => billboards.find(b => b.id === id)?.name || 'Unknown';

  return (
    <div className="space-y-8 animate-fade-in pb-12 flex flex-col xl:flex-row gap-8">
      {/* Main Content Area */}
      <div className="flex-1 space-y-8 min-w-0">
        
        {/* AI Analyst Section - Black Ivy AI */}
        <div className="bg-gradient-to-br from-zinc-900 via-black to-orange-950 rounded-3xl p-8 text-white shadow-2xl shadow-orange-900/10 relative overflow-hidden group border border-zinc-800">
            <div className="absolute top-0 right-0 w-96 h-96 bg-orange-600/10 rounded-full blur-[100px] -translate-y-1/2 translate-x-1/3 group-hover:bg-orange-600/20 transition-all duration-1000"></div>
            
            <div className="relative z-10">
                <div className="flex items-center gap-3 mb-6">
                    <div className="p-2.5 bg-white/10 rounded-xl backdrop-blur-md border border-white/10 shadow-inner"><BrainCircuit size={24} className="text-orange-400"/></div>
                    <div>
                        <h2 className="text-2xl font-bold tracking-tight">Black Ivy AI</h2>
                        <p className="text-zinc-400 text-sm">Strategic intelligence for your fleet</p>
                    </div>
                </div>
                
                <form onSubmit={handleAskAI} className="relative max-w-2xl mb-6">
                    <input 
                        type="text" 
                        value={aiQuery}
                        onChange={(e) => setAiQuery(e.target.value)}
                        placeholder="Ask about revenue trends, occupancy, or strategy..." 
                        className="w-full pl-6 pr-14 py-4 rounded-2xl bg-white/5 border border-white/10 text-white placeholder-zinc-500 backdrop-blur-md focus:outline-none focus:bg-white/10 focus:border-orange-500/50 transition-all shadow-lg shadow-black/10"
                    />
                    <button type="submit" disabled={loadingAi} className="absolute right-2 top-2 p-2.5 bg-gradient-to-r from-orange-500 to-red-600 text-white rounded-xl hover:shadow-lg hover:shadow-orange-500/30 transition-all disabled:opacity-70 disabled:cursor-not-allowed active:scale-95">
                        {loadingAi ? <Sparkles size={20} className="animate-spin"/> : <ArrowRight size={20} />}
                    </button>
                </form>

                {aiResponse && (
                    <div className="p-6 bg-white/5 rounded-2xl border border-white/10 backdrop-blur-md animate-fade-in shadow-inner">
                        <div className="flex items-start gap-3">
                            <Sparkles size={18} className="text-orange-400 mt-1 shrink-0 animate-pulse"/>
                            <p className="text-sm leading-relaxed text-zinc-100 font-medium">{aiResponse}</p>
                        </div>
                    </div>
                )}
            </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 hover:shadow-xl hover:scale-[1.02] transition-all duration-300 group">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-zinc-100 rounded-2xl shadow-sm group-hover:bg-zinc-900 group-hover:text-white transition-all text-zinc-600">
                <DollarSign className="w-6 h-6" />
              </div>
              <span className="text-xs font-bold px-2.5 py-1 bg-green-50 text-green-700 rounded-full flex items-center gap-1 border border-green-100">
                <TrendingUp size={12}/> +12%
              </span>
            </div>
            <div>
                <p className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-1">Total Revenue</p>
                <h3 className="text-3xl font-black text-zinc-900 tracking-tight">${totalRevenue.toLocaleString()}</h3>
            </div>
          </div>

          <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 hover:shadow-xl hover:scale-[1.02] transition-all duration-300 group">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-orange-50 rounded-2xl shadow-sm group-hover:bg-orange-500 group-hover:text-white transition-all text-orange-600">
                <FileText className="w-6 h-6" />
              </div>
              <span className="text-xs font-bold px-2.5 py-1 bg-orange-50 text-orange-700 rounded-full border border-orange-100">Active</span>
            </div>
            <div>
                <p className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-1">Contracts</p>
                <h3 className="text-3xl font-black text-zinc-900 tracking-tight">{activeContracts}</h3>
            </div>
          </div>

          <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 hover:shadow-xl hover:scale-[1.02] transition-all duration-300 group">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-zinc-100 rounded-2xl shadow-sm group-hover:bg-zinc-900 group-hover:text-white transition-all text-zinc-600">
                <Activity className="w-6 h-6" />
              </div>
              <span className="text-xs font-bold px-2.5 py-1 bg-zinc-100 text-zinc-700 rounded-full border border-zinc-200">
                {rentedLedSlots + rentedStaticSides} / {totalLedSlots + totalStaticSides}
              </span>
            </div>
            <div>
                <p className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-1">Occupancy</p>
                <h3 className="text-3xl font-black text-zinc-900 tracking-tight">{occupancyRate}%</h3>
            </div>
          </div>

          <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 hover:shadow-xl hover:scale-[1.02] transition-all duration-300 group">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-zinc-100 rounded-2xl shadow-sm group-hover:bg-zinc-900 group-hover:text-white transition-all text-zinc-600">
                <Users className="w-6 h-6" />
              </div>
              <span className="text-xs font-bold px-2.5 py-1 bg-green-50 text-green-700 rounded-full flex items-center gap-1 border border-green-100">
                <TrendingUp size={12}/> +2
              </span>
            </div>
            <div>
                <p className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-1">Total Clients</p>
                <h3 className="text-3xl font-black text-zinc-900 tracking-tight">{clients.length}</h3>
            </div>
          </div>
        </div>

        {/* Main Charts Row */}
        <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
                <div>
                    <h3 className="text-xl font-bold text-zinc-900">Financial Performance</h3>
                    <p className="text-sm text-zinc-500 font-medium">Revenue vs Expenses (Actuals + Forecast)</p>
                </div>
                <div className="flex items-center gap-3 text-xs font-bold bg-zinc-50 p-1.5 rounded-xl border border-zinc-200">
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-white rounded-lg shadow-sm text-zinc-800"><span className="w-2.5 h-2.5 rounded-full bg-zinc-900"></span> Revenue</div>
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-zinc-500"><span className="w-2.5 h-2.5 rounded-full bg-orange-500"></span> Margin</div>
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-zinc-500"><span className="w-2.5 h-2.5 rounded-full bg-zinc-300"></span> Exp.</div>
                </div>
            </div>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={financialTrends}>
                  <defs>
                    <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#18181b" stopOpacity={0.8}/>
                      <stop offset="100%" stopColor="#18181b" stopOpacity={0.3}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f4f4f5" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#71717a', fontSize: 12, fontWeight: 500}} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{fill: '#71717a', fontSize: 12}} tickFormatter={(value) => `$${value/1000}k`} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'rgba(255, 255, 255, 0.95)', borderRadius: '12px', border: '1px solid #e4e4e7', padding: '12px' }}
                    itemStyle={{ fontSize: '13px', fontWeight: 600 }}
                    cursor={{fill: '#f4f4f5'}}
                  />
                  <Bar dataKey="revenue" barSize={28} fill="url(#revenueGradient)" radius={[6, 6, 0, 0]} name="Revenue" />
                  <Bar dataKey="expenses" barSize={28} fill="#e4e4e7" radius={[6, 6, 0, 0]} name="Expenses" />
                  <Line type="monotone" dataKey="margin" stroke="#f97316" strokeWidth={3} dot={{r: 4, fill: '#f97316', strokeWidth: 2, stroke: '#fff'}} name="Net Margin" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
        </div>
        
        {/* Secondary Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
             {/* Revenue by Town */}
             <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
                <h3 className="text-lg font-bold text-zinc-900 mb-6">Top Locations</h3>
                <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={revenueByTownData} layout="vertical" margin={{ left: 0, right: 20 }}>
                            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f4f4f5" />
                            <XAxis type="number" hide />
                            <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{fill: '#52525b', fontSize: 12, fontWeight: 600}} width={100} />
                            <Tooltip cursor={{fill: 'transparent'}} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}/>
                            <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={20}>
                                {revenueByTownData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={['#18181b', '#3f3f46', '#71717a', '#a1a1aa', '#d4d4d8'][index % 5]} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
             </div>

             {/* Occupancy Donut */}
             <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100 relative overflow-hidden">
                <h3 className="text-lg font-bold text-zinc-900 mb-2">Fleet Occupancy</h3>
                <div className="h-64 relative z-10">
                    <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                        <Pie
                        data={occupancyData}
                        cx="50%"
                        cy="50%"
                        innerRadius={85}
                        outerRadius={105}
                        startAngle={90}
                        endAngle={-270}
                        paddingAngle={5}
                        dataKey="value"
                        stroke="none"
                        cornerRadius={8}
                        >
                        {occupancyData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={OCCUPANCY_COLORS[index % OCCUPANCY_COLORS.length]} />
                        ))}
                        </Pie>
                    </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none pb-4">
                        <span className="text-5xl font-black text-zinc-900 tracking-tighter">{occupancyRate}%</span>
                        <span className="text-xs font-bold text-zinc-400 uppercase tracking-widest mt-1">Occupied</span>
                    </div>
                </div>
             </div>
        </div>
      </div>

      {/* Sidebar Notifications */}
      <div className="w-full xl:w-96 space-y-6 min-w-0">
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
             <div className="flex items-center gap-2 mb-6 text-zinc-800 font-bold uppercase tracking-wide text-xs">
                 <Bell size={16} className="text-orange-500" /> Action Required
             </div>
             
             <div className="space-y-4">
                 {/* Upcoming Collections */}
                 {upcomingBillings.length > 0 && (
                     <div className="mb-6 pb-6 border-b border-zinc-100">
                        <div className="flex items-center gap-2 mb-4">
                            <Calendar size={14} className="text-orange-500" />
                            <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-wide">Upcoming Collections</h4>
                        </div>
                        <div className="space-y-3">
                            {upcomingBillings.map((bill, i) => (
                                <div key={i} className="flex justify-between items-center p-3 bg-zinc-50 rounded-2xl border border-zinc-100/50 hover:bg-white hover:shadow-md transition-all">
                                    <div className="min-w-0">
                                        <p className="text-xs font-bold text-zinc-800 truncate">{bill.clientName}</p>
                                        <p className="text-[10px] text-zinc-400 font-medium mt-0.5">Due: {bill.date}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-xs font-bold text-orange-600 bg-orange-50 px-2 py-1 rounded-lg">${bill.amount.toLocaleString()}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                     </div>
                 )}

                 {/* Alerts List */}
                 {expiringContracts.length === 0 && overdueInvoices.length === 0 && maintenanceNeeds.length === 0 ? (
                    <div className="p-8 text-center bg-zinc-50 rounded-2xl border border-dashed border-zinc-200">
                        <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3 text-green-600"><Sparkles size={20}/></div>
                        <p className="text-sm font-medium text-zinc-500">All caught up!</p>
                        <p className="text-xs text-zinc-400">No pending alerts.</p>
                    </div>
                 ) : (
                    <>
                        {maintenanceNeeds.map(log => (
                            <div key={log.id} className="p-4 bg-orange-50 rounded-2xl border border-orange-100 flex items-start gap-3">
                                <div className="p-2 bg-white rounded-xl text-orange-500 shadow-sm border border-orange-50 shrink-0">
                                    <Wrench size={16} />
                                </div>
                                <div className="min-w-0">
                                    <h4 className="text-xs font-bold text-orange-700 uppercase tracking-wide mb-0.5">Maintenance Due</h4>
                                    <p className="text-sm font-bold text-zinc-800 truncate">{getBillboardName(log.billboardId)}</p>
                                    <p className="text-xs text-zinc-500 mt-1">{log.type} Check Required</p>
                                </div>
                            </div>
                        ))}
                        {expiringContracts.map(c => (
                            <div key={c.id} className="p-4 bg-amber-50 rounded-2xl border border-amber-100 flex items-start gap-3">
                                <div className="p-2 bg-white rounded-xl text-amber-500 shadow-sm border border-amber-50 shrink-0">
                                    <Bell size={16} />
                                </div>
                                <div className="min-w-0">
                                    <h4 className="text-xs font-bold text-amber-700 uppercase tracking-wide mb-0.5">Expiring Contract</h4>
                                    <p className="text-sm font-bold text-zinc-800 truncate">{getClientName(c.clientId)}</p>
                                    <p className="text-xs text-zinc-500 mt-1">Ends {c.endDate}</p>
                                </div>
                            </div>
                        ))}
                        {overdueInvoices.slice(0, 3).map(inv => (
                            <div key={inv.id} className="p-4 bg-red-50 rounded-2xl border border-red-100 flex items-start gap-3">
                                <div className="p-2 bg-white rounded-xl text-red-500 shadow-sm border border-red-50 shrink-0">
                                    <AlertTriangle size={16} />
                                </div>
                                <div className="min-w-0">
                                    <h4 className="text-xs font-bold text-red-700 uppercase tracking-wide mb-0.5">Overdue Payment</h4>
                                    <p className="text-sm font-bold text-zinc-800 truncate">{getClientName(inv.clientId)}</p>
                                    <p className="text-xs text-zinc-500 mt-1">${inv.total.toLocaleString()} • #{inv.id}</p>
                                </div>
                            </div>
                        ))}
                    </>
                 )}
             </div>
          </div>

          <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
             <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-6">Revenue Sources</h3>
             <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topClientsData} layout="vertical" margin={{ left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f4f4f5" />
                    <XAxis type="number" hide />
                    <YAxis dataKey="name" type="category" width={90} axisLine={false} tickLine={false} tick={{fill: '#71717a', fontSize: 11, fontWeight: 600}} />
                    <Tooltip cursor={{fill: 'transparent'}} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }} />
                    <Bar dataKey="value" fill="#18181b" radius={[0, 6, 6, 0]} barSize={16}>
                        {topClientsData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={['#18181b', '#27272a', '#3f3f46', '#52525b', '#71717a'][index % 5]} />
                        ))}
                    </Bar>
                </BarChart>
                </ResponsiveContainer>
             </div>
          </div>
      </div>
    </div>
  );
};