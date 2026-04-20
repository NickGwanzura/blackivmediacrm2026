// TODO(auth-follow-up): Staff role should get destructive buttons (Add/Edit/
// Delete) hidden across Rentals/ClientList/BillboardList/Payments/Expenses/
// Maintenance. This pass only gates the Settings module; wider gating will
// follow once the role helpers here are in use.

import React, { useState, useEffect, useRef } from 'react';
import {
  LayoutDashboard, Map, Users, FileText, CreditCard, Receipt, Settings as SettingsIcon,
  Menu, X, Bell, LogOut, Printer, Globe, PieChart, Wallet, ChevronRight, Wrench, AlertTriangle, Calendar, AlertCircle, RefreshCw
} from 'lucide-react';
import { getCurrentUser, logout } from '../services/authService';
import { getSystemAlertCount, triggerAutoBackup, runAutoBilling, runMaintenanceScheduler, syncBillboardAvailability, RELEASE_NOTES, getExpiringContracts, getOverdueInvoices, getMaintenanceLogs, getBillboards, pullFromRemote } from '../services/mockData';

interface LayoutProps {
  children: React.ReactNode;
  currentPage: string;
  onNavigate: (page: string) => void;
  onLogout: () => void;
}

export const Layout: React.FC<LayoutProps> = ({ children, currentPage, onNavigate, onLogout }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [alertCount, setAlertCount] = useState(0);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const notificationRef = useRef<HTMLDivElement>(null);
  const user = getCurrentUser();

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) {
        setIsNotificationsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const runSmartSync = async () => {
      setIsSyncing(true);
      await pullFromRemote(false);
      setIsSyncing(false);
  };

  useEffect(() => {
    // Initial remote sync check on app mount. 
    runSmartSync();

    // Focus Listener: Sync immediately when user comes back to tab
    const handleFocus = () => {
        // console.log("Tab focused, triggering smart sync...");
        runSmartSync();
    };
    window.addEventListener('focus', handleFocus);

    // Initial run of automations
    setAlertCount(getSystemAlertCount());
    triggerAutoBackup();
    runAutoBilling();
    runMaintenanceScheduler(); // 3-month structural check automation
    syncBillboardAvailability(); // Ensure availability is correct based on active contracts

    // Intervals
    const interval = setInterval(() => setAlertCount(getSystemAlertCount()), 10000);
    const backupInterval = setInterval(() => triggerAutoBackup(), 5 * 60 * 1000); // 5 mins
    const billingInterval = setInterval(() => runAutoBilling(), 60 * 60 * 1000); // 1 hour
    const maintenanceInterval = setInterval(() => runMaintenanceScheduler(), 24 * 60 * 60 * 1000); // Daily check
    const availabilityInterval = setInterval(() => syncBillboardAvailability(), 60 * 60 * 1000); // Hourly check for expired contracts

    // AUTO-CLOUD POLL: Aggressive Polling (5s) for Smart Sync
    const cloudSyncInterval = setInterval(() => {
        runSmartSync();
    }, 5000);

    return () => { 
        clearInterval(interval); 
        clearInterval(backupInterval);
        clearInterval(billingInterval);
        clearInterval(maintenanceInterval);
        clearInterval(availabilityInterval);
        clearInterval(cloudSyncInterval);
        window.removeEventListener('focus', handleFocus);
    };
  }, [currentPage]);

  const isAdmin = user?.role === 'Admin';

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'analytics', label: 'Profit & Analytics', icon: PieChart },
    { id: 'billboards', label: 'Billboards', icon: Map },
    { id: 'maintenance', label: 'Maintenance', icon: Wrench },
    { id: 'rentals', label: 'Rentals', icon: FileText },
    { id: 'outsourced', label: 'Outsourced', icon: Globe },
    { id: 'payments', label: 'Payments', icon: Wallet },
    { id: 'clients', label: 'Clients', icon: Users },
    { id: 'financials', label: 'Invoices & Quotes', icon: CreditCard },
    { id: 'receipts', label: 'Receipts', icon: Receipt },
    { id: 'expenses', label: 'Expenses', icon: Printer },
    // Settings is Admin-only — the server enforces this too, but hide it from
    // the sidebar for non-Admins so they don't get a blank page.
    ...(isAdmin ? [{ id: 'settings', label: 'Settings', icon: SettingsIcon }] : []),
  ];

  const handleLogout = async () => { await logout(); onLogout(); };

  // Get data for notifications
  const expiringContracts = getExpiringContracts();
  const overdueInvoices = getOverdueInvoices();
  const maintenanceNeeds = getMaintenanceLogs().filter(l => l.status === 'Needs Attention');
  const billboards = getBillboards();

  return (
    <div className="flex h-screen w-full overflow-hidden bg-[#09090b] text-slate-200 supports-[height:100dvh]:h-[100dvh]">
      {/* Mobile Sidebar Backdrop */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[90] lg:hidden transition-opacity"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar - Black Ivy Theme */}
      <aside 
        className={`fixed inset-y-0 left-0 z-[100] w-72 transform transition-transform duration-300 ease-[cubic-bezier(0.25,0.8,0.25,1)] lg:translate-x-0 lg:relative flex flex-col ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } bg-black shadow-2xl border-r border-zinc-900 overflow-hidden`}
      >
        {/* Background Gradients for Sidebar */}
        <div className="absolute inset-0 bg-gradient-to-b from-black via-zinc-950 to-black z-0"></div>

        {/* Sidebar Header - Black Ivy Logo Stack */}
        <div className="relative z-10 flex items-center justify-between p-6 shrink-0 border-b border-zinc-900">
          <div className="group cursor-pointer">
             <div className="flex flex-col leading-none font-black tracking-tighter text-white select-none scale-75 origin-left" style={{ fontFamily: 'Montserrat, sans-serif' }}>
                <div className="text-4xl -mb-1">BLA</div>
                <div className="text-4xl flex items-center -mb-1">
                    <span className="relative">i<span className="absolute top-[0.6rem] left-[0.1rem] w-[0.6rem] h-[0.6rem] bg-[#f97316]"></span></span>
                    <span>CK</span>
                </div>
                <div className="text-4xl text-[#f97316]">IVY</div>
             </div>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="lg:hidden text-zinc-400 hover:text-white transition-colors p-1 bg-zinc-900 rounded-lg">
            <X size={24} />
          </button>
        </div>

        {/* Navigation */}
        <nav className="relative z-10 flex-1 overflow-y-auto px-4 py-4 space-y-1.5 scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-transparent">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentPage === item.id;
            return (
              <button
                key={item.id}
                onClick={() => { onNavigate(item.id); setSidebarOpen(false); }}
                className={`group flex items-center w-full px-4 py-3.5 rounded-xl text-sm font-bold transition-all duration-300 relative overflow-hidden ${
                  isActive 
                    ? 'text-white shadow-md shadow-orange-900/10' 
                    : 'text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900/50'
                }`}
              >
                {isActive && (
                    <div className="absolute inset-0 bg-gradient-to-r from-orange-600/90 to-amber-600/90 rounded-xl z-0"></div>
                )}
                <div className="relative z-10 flex items-center w-full">
                    <Icon size={20} className={`mr-3 shrink-0 transition-transform duration-300 ${isActive ? 'text-white' : 'text-zinc-600 group-hover:text-orange-400 group-hover:scale-110'}`} />
                    <span className="flex-1 text-left">{item.label}</span>
                    {isActive && <ChevronRight size={16} className="text-white/70" />}
                </div>
              </button>
            );
          })}
        </nav>

        {/* Sidebar Footer */}
        <div className="relative z-10 p-6 bg-black/40 backdrop-blur-md border-t border-zinc-900 shrink-0">
           <div className="flex items-center gap-3 mb-4 p-3 rounded-xl bg-zinc-900/50 border border-zinc-800 hover:border-zinc-700 transition-colors cursor-pointer group">
              <div className="w-9 h-9 rounded-full bg-zinc-800 flex items-center justify-center text-sm font-bold border border-zinc-700 text-white shadow-inner">
                  {user?.firstName?.charAt(0) || 'U'}
              </div>
              <div className="flex-1 min-w-0">
                 <p className="text-sm font-bold text-zinc-200 truncate group-hover:text-orange-400 transition-colors">{user?.firstName || 'User'}</p>
                 <p className="text-[10px] text-zinc-500 truncate uppercase tracking-wider">{user?.role || 'Guest'}</p>
              </div>
              <button onClick={handleLogout} className="text-zinc-600 hover:text-red-400 transition-colors p-2" title="Logout">
                 <LogOut size={18} />
              </button>
           </div>
           
           <div className="flex items-center justify-between text-[10px] text-zinc-600 py-1 px-1">
              <span className="flex items-center gap-1.5">
                  {isSyncing ? (
                      <>
                        <RefreshCw size={10} className="animate-spin text-orange-500" />
                        <span className="text-orange-500 font-medium">Syncing...</span>
                      </>
                  ) : (
                      <>
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.6)]"></div> 
                        <span className="text-emerald-500/80 font-medium">Live</span>
                      </>
                  )}
              </span>
              <span className="font-mono opacity-50">v{RELEASE_NOTES[0].version}</span>
           </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 h-full relative bg-[#fcfaf8]">
        {/* Background pattern */}
        <div className="absolute inset-0 pointer-events-none z-0 opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(#000 1px, transparent 1px)', backgroundSize: '24px 24px' }}></div>

        {/* Header */}
        <header className="sticky top-0 z-40 h-auto min-h-[4rem] flex items-center justify-between px-4 sm:px-6 lg:px-8 py-3 shrink-0 transition-all duration-300 border-b border-zinc-200/50 bg-white/80 backdrop-blur-md">
          <div className="flex items-center gap-3 sm:gap-4 overflow-hidden">
             <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-2 text-zinc-600 hover:text-black hover:bg-zinc-100 rounded-xl transition-colors">
               <Menu size={24} />
             </button>
             <h1 className="text-lg sm:text-2xl font-black text-black tracking-tight capitalize truncate">
               {currentPage.replace('-', ' ')}
             </h1>
          </div>
          
          <div className="flex items-center gap-2 sm:gap-4 relative shrink-0">
             <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-zinc-50 border border-zinc-200 rounded-full text-xs font-bold text-zinc-600 shadow-sm">
                <span className="w-2 h-2 rounded-full bg-orange-500"></span>
                <span>Harare, ZW</span>
             </div>
             
             {/* Notification Bell */}
             <div ref={notificationRef}>
                 <button 
                    onClick={() => setIsNotificationsOpen(!isNotificationsOpen)} 
                    className={`relative p-2 rounded-full transition-all duration-300 ${isNotificationsOpen ? 'bg-orange-50 text-orange-600' : 'text-zinc-400 hover:text-orange-600 hover:bg-orange-50'}`} 
                    title="Notifications"
                 >
                    <Bell size={22} />
                    {alertCount > 0 && (
                        <span className="absolute top-1.5 right-1.5 w-4 h-4 bg-red-600 rounded-full border-2 border-white flex items-center justify-center text-[8px] font-bold text-white shadow-sm animate-pulse">
                            {alertCount > 9 ? '9+' : alertCount}
                        </span>
                    )}
                 </button>

                 {/* Notification Dropdown */}
                 {isNotificationsOpen && (
                    <div className="absolute right-0 top-12 w-80 bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden z-50 animate-fade-in origin-top-right">
                        <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                            <h4 className="font-bold text-slate-800 text-sm">Notifications</h4>
                            <span className="text-xs font-bold bg-red-100 text-red-600 px-2 py-0.5 rounded-full">{alertCount} New</span>
                        </div>
                        <div className="max-h-80 overflow-y-auto">
                            {alertCount === 0 ? (
                                <div className="p-8 text-center text-slate-400">
                                    <div className="flex justify-center mb-2"><Bell size={24} className="opacity-20"/></div>
                                    <p className="text-xs">No pending alerts.</p>
                                </div>
                            ) : (
                                <div className="divide-y divide-slate-50">
                                    {overdueInvoices.map(inv => (
                                        <div key={inv.id} onClick={() => { onNavigate('payments'); setIsNotificationsOpen(false); }} className="p-3 hover:bg-slate-50 cursor-pointer transition-colors group">
                                            <div className="flex items-start gap-3">
                                                <div className="mt-1 text-red-500 bg-red-50 p-1.5 rounded-lg"><AlertCircle size={14}/></div>
                                                <div>
                                                    <p className="text-xs font-bold text-slate-800 group-hover:text-red-600">Overdue Invoice</p>
                                                    <p className="text-[10px] text-slate-500">#{inv.id} - ${inv.total.toLocaleString()}</p>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                    {expiringContracts.map(c => (
                                        <div key={c.id} onClick={() => { onNavigate('rentals'); setIsNotificationsOpen(false); }} className="p-3 hover:bg-slate-50 cursor-pointer transition-colors group">
                                            <div className="flex items-start gap-3">
                                                <div className="mt-1 text-amber-500 bg-amber-50 p-1.5 rounded-lg"><Calendar size={14}/></div>
                                                <div>
                                                    <p className="text-xs font-bold text-slate-800 group-hover:text-amber-600">Contract Expiring</p>
                                                    <p className="text-[10px] text-slate-500">Ends {c.endDate}</p>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                    {maintenanceNeeds.map(log => {
                                        const asset = billboards.find(b => b.id === log.billboardId);
                                        return (
                                            <div key={log.id} onClick={() => { onNavigate('maintenance'); setIsNotificationsOpen(false); }} className="p-3 hover:bg-slate-50 cursor-pointer transition-colors group">
                                                <div className="flex items-start gap-3">
                                                    <div className="mt-1 text-orange-500 bg-orange-50 p-1.5 rounded-lg"><Wrench size={14}/></div>
                                                    <div>
                                                        <p className="text-xs font-bold text-slate-800 group-hover:text-orange-600">Maintenance Check</p>
                                                        <p className="text-[10px] text-slate-500 truncate w-48">{asset?.name || 'Asset'}</p>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                        <div className="p-2 border-t border-slate-100 bg-slate-50 text-center">
                            <button onClick={() => { onNavigate('dashboard'); setIsNotificationsOpen(false); }} className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 uppercase tracking-wide">View Dashboard</button>
                        </div>
                    </div>
                 )}
             </div>
          </div>
        </header>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-6 lg:p-8 relative z-10 scrollbar-thin scrollbar-thumb-zinc-300 scrollbar-track-transparent">
           <div className="max-w-7xl mx-auto pb-20">
             {children}
           </div>
        </div>
      </main>
    </div>
  );
};
