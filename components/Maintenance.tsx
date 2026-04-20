
import React, { useState } from 'react';
import { getBillboards, getMaintenanceLogs, addMaintenanceLog, runMaintenanceScheduler } from '../services/mockData';
import { useToast } from './Toast';
import { generateMaintenanceReportPDF } from '../services/pdfGenerator';
import { MaintenanceLog } from '../types';
import { Wrench, CheckCircle, AlertTriangle, XCircle, Search, Plus, Calendar, Save, History, FileText, X, RefreshCw, Download } from 'lucide-react';

const MinimalInput = ({ label, value, onChange, type = "text", required = false }: any) => (
  <div className="group relative">
    <input type={type} required={required} value={value} onChange={onChange} placeholder=" " className="peer w-full px-0 py-2.5 border-b border-slate-200 bg-transparent text-slate-800 focus:border-slate-800 focus:ring-0 outline-none transition-all font-medium placeholder-transparent" />
    <label className="absolute left-0 -top-2.5 text-xs text-slate-400 font-medium transition-all peer-placeholder-shown:text-sm peer-placeholder-shown:text-slate-400 peer-placeholder-shown:top-2.5 peer-focus:-top-2.5 peer-focus:text-xs peer-focus:text-slate-800 uppercase tracking-wide">{label}</label>
  </div>
);

const MinimalSelect = ({ label, value, onChange, options }: any) => (
  <div className="group relative">
    <select value={value} onChange={onChange} className="peer w-full px-0 py-2.5 border-b border-slate-200 bg-transparent text-slate-800 focus:border-slate-800 focus:ring-0 outline-none transition-all font-medium appearance-none cursor-pointer" >
      {options.map((opt: any) => (<option key={opt.value} value={opt.value}>{opt.label}</option>))}
    </select>
    <label className="absolute left-0 -top-2.5 text-xs text-slate-400 font-medium uppercase tracking-wide">{label}</label>
  </div>
);

export const Maintenance: React.FC = () => {
    const toast = useToast();
    const [searchTerm, setSearchTerm] = useState('');
    const [isLogModalOpen, setIsLogModalOpen] = useState(false);
    const [logs, setLogs] = useState<MaintenanceLog[]>(getMaintenanceLogs());
    const billboards = getBillboards();
    
    const [newLog, setNewLog] = useState<Partial<MaintenanceLog>>({
        billboardId: '', date: new Date().toISOString().split('T')[0], type: 'Visual Check', technician: '', notes: '', status: 'Pass', cost: 0
    });

    const getStatusInfo = (billboardId: string) => {
        const bLogs = logs.filter(l => l.billboardId === billboardId).sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        const lastLog = bLogs[0];
        
        // Prioritize explicit "Needs Attention" status regardless of date
        if (lastLog && lastLog.status === 'Needs Attention') {
             return { status: 'Flagged', label: 'Needs Attention', color: 'text-orange-600', bg: 'bg-orange-50', nextDue: 'Immediate Action' };
        }
        
        if (!lastLog) return { status: 'Pending', label: 'Initial Check Needed', color: 'text-amber-500', bg: 'bg-amber-50', nextDue: new Date().toISOString().split('T')[0] };
        
        const nextDue = new Date(lastLog.date);
        nextDue.setMonth(nextDue.getMonth() + 3);
        const today = new Date();
        const daysUntil = Math.ceil((nextDue.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        
        if (daysUntil < 0) return { status: 'Overdue', label: `Overdue ${Math.abs(daysUntil)} days`, color: 'text-red-600', bg: 'bg-red-50', nextDue: nextDue.toISOString().split('T')[0] };
        if (daysUntil <= 14) return { status: 'Due Soon', label: `Due in ${daysUntil} days`, color: 'text-orange-500', bg: 'bg-orange-50', nextDue: nextDue.toISOString().split('T')[0] };
        
        return { status: 'Good', label: 'Good Standing', color: 'text-green-600', bg: 'bg-green-50', nextDue: nextDue.toISOString().split('T')[0] };
    };

    const handleSaveLog = (e: React.FormEvent) => {
        e.preventDefault();
        const nextDue = new Date(newLog.date!);
        nextDue.setMonth(nextDue.getMonth() + 3);
        
        const log: MaintenanceLog = {
            id: `MNT-${Date.now()}`,
            billboardId: newLog.billboardId!,
            date: newLog.date!,
            type: newLog.type as any,
            technician: newLog.technician!,
            notes: newLog.notes || '',
            status: newLog.status as any,
            nextDueDate: nextDue.toISOString().split('T')[0],
            cost: newLog.cost
        };
        
        addMaintenanceLog(log);
        setLogs(getMaintenanceLogs());
        setIsLogModalOpen(false);
        setNewLog({ billboardId: '', date: new Date().toISOString().split('T')[0], type: 'Visual Check', technician: '', notes: '', status: 'Pass', cost: 0 });
        toast.success("Maintenance log saved.");
    };

    const handleRunAutoCheck = () => {
        const generated = runMaintenanceScheduler();
        setLogs(getMaintenanceLogs());
        if (generated > 0) {
            toast.info(`Auto-Scheduler created ${generated} new maintenance tasks for assets due for their 3-month check.`);
        } else {
            toast.success("All assets are up to date with the 3-month inspection cycle.");
        }
    };

    const handleDownloadReport = () => {
        generateMaintenanceReportPDF(billboards, logs, getStatusInfo);
    };

    const filteredBillboards = billboards.filter(b => b.name.toLowerCase().includes(searchTerm.toLowerCase()) || b.location.toLowerCase().includes(searchTerm.toLowerCase()));
    
    // Stats
    const overdueCount = billboards.filter(b => {
        const s = getStatusInfo(b.id);
        return s.status === 'Overdue' || s.status === 'Flagged';
    }).length;
    const pendingCount = billboards.filter(b => getStatusInfo(b.id).status === 'Pending').length;

    return (
        <div className="space-y-8 animate-fade-in">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h2 className="text-4xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-slate-900 to-slate-600 mb-2">Maintenance</h2>
                    <p className="text-slate-500 font-medium">3-Month Structural Health Monitor</p>
                </div>
                <div className="flex flex-col sm:flex-row gap-4 items-center w-full sm:w-auto">
                    <div className="relative group w-full sm:w-64">
                        <Search className="absolute left-3 top-2.5 text-slate-400 group-focus-within:text-slate-800 transition-colors" size={18} />
                        <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Search asset..." className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-full bg-white outline-none focus:border-slate-800 transition-all text-sm shadow-sm"/>
                    </div>
                    <div className="flex gap-3 w-full sm:w-auto">
                        <button onClick={handleDownloadReport} className="flex-1 sm:flex-none bg-white border border-slate-200 text-slate-600 hover:text-slate-900 px-4 py-2.5 rounded-full text-sm font-bold uppercase tracking-wider hover:bg-slate-50 shadow-sm transition-all flex items-center justify-center gap-2" title="Download PDF Report">
                            <Download size={16} /> Report
                        </button>
                        <button onClick={handleRunAutoCheck} className="flex-1 sm:flex-none bg-white border border-slate-200 text-slate-600 hover:text-slate-900 px-4 py-2.5 rounded-full text-sm font-bold uppercase tracking-wider hover:bg-slate-50 shadow-sm transition-all flex items-center justify-center gap-2" title="Run 3-Month Logic Now">
                            <RefreshCw size={16} /> Auto-Check
                        </button>
                        <button onClick={() => setIsLogModalOpen(true)} className="flex-1 sm:flex-none bg-slate-900 text-white px-5 py-2.5 rounded-full text-sm font-bold uppercase tracking-wider hover:bg-slate-800 shadow-lg transition-all hover:scale-105 flex items-center justify-center gap-2 whitespace-nowrap">
                            <Plus size={16} /> Log Check
                        </button>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4">
                    <div className="p-3 bg-slate-100 text-slate-600 rounded-xl"><Wrench size={24}/></div>
                    <div><p className="text-xs font-bold uppercase text-slate-400">Total Assets</p><h3 className="text-2xl font-black text-slate-900">{billboards.length}</h3></div>
                </div>
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4">
                    <div className="p-3 bg-red-50 text-red-600 rounded-xl"><AlertTriangle size={24}/></div>
                    <div><p className="text-xs font-bold uppercase text-slate-400">Needs Attention</p><h3 className="text-2xl font-black text-red-600">{overdueCount}</h3></div>
                </div>
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4">
                    <div className="p-3 bg-amber-50 text-amber-600 rounded-xl"><History size={24}/></div>
                    <div><p className="text-xs font-bold uppercase text-slate-400">Pending Initial</p><h3 className="text-2xl font-black text-amber-600">{pendingCount}</h3></div>
                </div>
            </div>

            <div className="bg-white shadow-sm rounded-2xl border border-slate-100 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-slate-600 min-w-[800px]">
                        <thead className="bg-slate-50 border-b border-slate-100">
                            <tr>
                                <th className="px-6 py-4 font-bold text-xs uppercase text-slate-400 tracking-wider">Asset Name</th>
                                <th className="px-6 py-4 font-bold text-xs uppercase text-slate-400 tracking-wider">Location</th>
                                <th className="px-6 py-4 font-bold text-xs uppercase text-slate-400 tracking-wider">Next Due (3 Mo)</th>
                                <th className="px-6 py-4 font-bold text-xs uppercase text-slate-400 tracking-wider">Status</th>
                                <th className="px-6 py-4 font-bold text-xs uppercase text-slate-400 tracking-wider">Latest Note</th>
                                <th className="px-6 py-4 font-bold text-xs uppercase text-slate-400 tracking-wider text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {filteredBillboards.map(b => {
                                const status = getStatusInfo(b.id);
                                const lastLog = logs.filter(l => l.billboardId === b.id).sort((x,y) => new Date(y.date).getTime() - new Date(x.date).getTime())[0];
                                return (
                                    <tr key={b.id} className="hover:bg-slate-50 transition-colors">
                                        <td className="px-6 py-4 font-bold text-slate-900">{b.name}</td>
                                        <td className="px-6 py-4">{b.location}, {b.town}</td>
                                        <td className="px-6 py-4 font-mono text-xs">{status.nextDue}</td>
                                        <td className="px-6 py-4">
                                            <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${status.bg} ${status.color} border-transparent`}>
                                                {status.label}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 truncate max-w-[200px] text-xs text-slate-500 italic">
                                            {lastLog ? lastLog.notes : 'No records yet'}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <button 
                                                onClick={() => { setNewLog(prev => ({...prev, billboardId: b.id})); setIsLogModalOpen(true); }}
                                                className="text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors"
                                            >
                                                Log Check
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {isLogModalOpen && (
                <div className="fixed inset-0 z-[200] overflow-y-auto">
                    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md transition-opacity" onClick={() => setIsLogModalOpen(false)} />
                    <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
                        <div className="relative transform overflow-hidden rounded-3xl bg-white text-left shadow-2xl transition-all sm:my-8 sm:w-full sm:max-w-lg border border-white/20">
                            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-white sticky top-0 z-10">
                                <h3 className="text-xl font-bold text-slate-900">Log Maintenance Check</h3>
                                <button onClick={() => setIsLogModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors"><X size={20} className="text-slate-400" /></button>
                            </div>
                            <form onSubmit={handleSaveLog} className="p-8 space-y-6">
                                <MinimalSelect label="Select Billboard" value={newLog.billboardId} onChange={(e: any) => setNewLog({...newLog, billboardId: e.target.value})} options={[{value:'', label: 'Select Asset...'}, ...billboards.map(b => ({value: b.id, label: b.name}))]} />
                                <div className="grid grid-cols-2 gap-6">
                                    <MinimalInput label="Date Checked" type="date" value={newLog.date} onChange={(e: any) => setNewLog({...newLog, date: e.target.value})} />
                                    <MinimalSelect label="Check Type" value={newLog.type} onChange={(e: any) => setNewLog({...newLog, type: e.target.value})} options={[{value:'Visual Check', label:'Visual Check'}, {value:'Structural', label:'Structural Safety'}, {value:'Electrical', label:'Electrical / Light'}, {value:'Cleaning', label:'Cleaning'}, {value:'Repair', label:'Repair'}]} />
                                </div>
                                <div className="grid grid-cols-2 gap-6">
                                    <MinimalInput label="Technician Name" value={newLog.technician} onChange={(e: any) => setNewLog({...newLog, technician: e.target.value})} required />
                                    <MinimalSelect label="Result Status" value={newLog.status} onChange={(e: any) => setNewLog({...newLog, status: e.target.value})} options={[{value:'Pass', label:'Pass (Good)'}, {value:'Needs Attention', label:'Needs Attention'}, {value:'Fail', label:'Fail (Critical)'}]} />
                                </div>
                                <MinimalInput label="Notes / Observations" value={newLog.notes} onChange={(e: any) => setNewLog({...newLog, notes: e.target.value})} />
                                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                                    <p className="text-xs text-slate-400 font-bold uppercase mb-2">Optional Cost Tracking</p>
                                    <MinimalInput label="Cost Incurred ($)" type="number" value={newLog.cost} onChange={(e: any) => setNewLog({...newLog, cost: Number(e.target.value)})} />
                                </div>
                                <button type="submit" className="w-full py-4 text-white bg-slate-900 rounded-xl hover:bg-slate-800 flex items-center justify-center gap-2 shadow-xl font-bold uppercase tracking-wider transition-all"><Save size={18} /> Save Maintenance Log</button>
                            </form>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
