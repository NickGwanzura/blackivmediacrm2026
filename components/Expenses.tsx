
import React, { useState } from 'react';
import { getExpenses, addExpense, mockPrintingJobs, getClients, getDefaultCurrency, wipeExpenses } from '../services/mockData';
import { useToast } from './Toast';
import { Printer, Plus, Scissors, Droplets, Zap, User, Download, Receipt, Trash2 } from 'lucide-react';
import { AccessibleModal, ModalButton } from './ui/AccessibleModal';
import { FormInput, FormSelect, FormNumber, FormDate, FormSection, FormRow } from './ui/Form';
import { PrintingJob, Expense, Currency, CURRENCIES } from '../types';
import { generateCostReportPDF } from '../services/pdfGenerator';
import { formatCurrency, formatCurrencyTotals, sumByCurrency } from '../utils/sanitizers';



export const Expenses: React.FC = () => {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<'General' | 'Printing' | 'Reports'>('General');
  const [generalExpenses, setGeneralExpenses] = useState<Expense[]>(getExpenses());
  const [isAddJobModalOpen, setIsAddJobModalOpen] = useState(false);
  const [isAddExpenseModalOpen, setIsAddExpenseModalOpen] = useState(false);
  const [newJob, setNewJob] = useState<Partial<PrintingJob>>({ clientId: '', description: '', dimensions: '', pvcCost: 0, inkCost: 0, electricityCost: 0, operatorCost: 0, weldingCost: 0, chargedAmount: 0, currency: getDefaultCurrency() });
  const [newExpense, setNewExpense] = useState<Partial<Expense>>({ category: 'Maintenance', description: '', amount: 0, currency: getDefaultCurrency(), date: new Date().toISOString().split('T')[0], reference: '' });

  const getClientName = (id: string) => getClients().find(c => c.id === id)?.companyName || 'Unknown';
  const handleAddJob = (e: React.FormEvent) => { e.preventDefault(); setIsAddJobModalOpen(false); toast.success("Job added successfully."); };
  const handleAddExpense = (e: React.FormEvent) => { e.preventDefault(); const expense: Expense = { id: `EXP-${Date.now()}`, category: newExpense.category as any, description: newExpense.description || '', amount: newExpense.amount || 0, currency: (newExpense.currency || getDefaultCurrency()) as Currency, date: newExpense.date || new Date().toISOString(), reference: newExpense.reference }; addExpense(expense); setGeneralExpenses(getExpenses()); setIsAddExpenseModalOpen(false); setNewExpense({ category: 'Maintenance', description: '', amount: 0, currency: getDefaultCurrency(), date: new Date().toISOString().split('T')[0], reference: '' }); toast.success("Expense recorded."); };
  const exportExpenseReport = () => { const clients = getClients(); const csvRows = clients.map(client => { const jobs = mockPrintingJobs.filter(j => j.clientId === client.id); if (jobs.length === 0) return null; const totalSpent = jobs.reduce((acc, curr) => acc + curr.chargedAmount, 0); const totalCost = jobs.reduce((acc, curr) => acc + curr.totalCost, 0); const profit = totalSpent - totalCost; const margin = totalSpent > 0 ? ((profit / totalSpent) * 100).toFixed(2) : '0'; return `"${client.companyName}",${jobs.length},${totalSpent},${totalCost},${profit},${margin}`; }).filter(row => row !== null).join("\n"); if (!csvRows) { toast.info("No data to export."); return; } const blob = new Blob(["Client,Total Jobs,Total Billed,Total Internal Cost,Net Profit,Margin %\n" + csvRows], { type: 'text/csv;charset=utf-8;' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.setAttribute('download', `printing_expenses_report_${new Date().toISOString().slice(0,10)}.csv`); document.body.appendChild(link); link.click(); document.body.removeChild(link); toast.success("Report exported."); };
  const calculateTotalJobCost = () => { return (newJob.pvcCost || 0) + (newJob.inkCost || 0) + (newJob.electricityCost || 0) + (newJob.operatorCost || 0) + (newJob.weldingCost || 0); };
  const exportPdfReport = () => { generateCostReportPDF(getClients(), mockPrintingJobs, generalExpenses); };

  // Wipe every expense row (local + remote). Confirmation first because
  // this is destructive and cannot be undone from the UI.
  const handleWipeExpenses = async () => {
    const ok = await toast.confirm({
      title: 'Wipe All Expenses?',
      message: `This permanently deletes all ${generalExpenses.length} expense record${generalExpenses.length === 1 ? '' : 's'} from this app and the server. This cannot be undone.`,
      variant: 'danger',
      confirmLabel: 'Wipe Expenses',
    });
    if (!ok) return;
    const removed = await wipeExpenses();
    setGeneralExpenses(getExpenses());
    toast.success(`Wiped ${removed} expense record${removed === 1 ? '' : 's'}.`);
  };

  // Split the General-tab expense total by currency so USD and ZWG are
  // visible side-by-side instead of collapsed into a misleading scalar.
  const generalTotalsByCurrency = sumByCurrency(generalExpenses, e => e.amount, e => e.currency);

  // Calculate dynamic totals from actual data — grouped by currency so a
  // mixed USD/ZWG printing pipeline doesn't collapse into a single
  // misleading scalar.
  const pvcTotals   = sumByCurrency(mockPrintingJobs, j => j.pvcCost, j => (j as any).currency);
  const inkTotals   = sumByCurrency(mockPrintingJobs, j => j.inkCost, j => (j as any).currency);
  const electricityTotals = sumByCurrency(mockPrintingJobs, j => j.electricityCost, j => (j as any).currency);
  const laborTotals = sumByCurrency(mockPrintingJobs, j => (j.operatorCost || 0) + (j.weldingCost || 0), j => (j as any).currency);

  return (
    <>
      <div className="space-y-6 animate-fade-in">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div><h2 className="text-4xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-slate-900 to-slate-600 mb-2">Expenses & Production</h2><p className="text-slate-500 font-medium">Internal cost tracking, printing jobs, and profitability analysis</p></div>
          {activeTab === 'Printing' && (<button onClick={() => setIsAddJobModalOpen(true)} className="bg-slate-900 text-white px-5 py-2.5 rounded-full text-sm font-bold uppercase tracking-wider shadow-lg hover:shadow-xl hover:scale-105 transition-all flex items-center gap-2"><Plus size={16} /> New Print Job</button>)}
          {activeTab === 'General' && (
            <div className="flex gap-2">
              <button onClick={handleWipeExpenses} disabled={generalExpenses.length === 0} className="bg-white border border-rose-100 text-rose-600 px-4 py-2.5 rounded-full text-sm font-bold uppercase tracking-wider hover:bg-rose-50 transition-all flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed" title="Delete every expense record (local + server)"><Trash2 size={16} /> Wipe All</button>
              <button onClick={() => setIsAddExpenseModalOpen(true)} className="bg-slate-900 text-white px-5 py-2.5 rounded-full text-sm font-bold uppercase tracking-wider shadow-lg hover:shadow-xl hover:scale-105 transition-all flex items-center gap-2"><Plus size={16} /> New Expense</button>
            </div>
          )}
          {activeTab === 'Reports' && (
              <div className="flex gap-2">
                  <button onClick={exportPdfReport} className="bg-white border border-slate-200 text-slate-700 px-5 py-2.5 rounded-full text-sm font-bold uppercase tracking-wider hover:bg-slate-50 transition-all flex items-center gap-2"><Download size={16} /> PDF Report</button>
                  <button onClick={exportExpenseReport} className="bg-slate-100 text-slate-600 px-5 py-2.5 rounded-full text-sm font-bold uppercase tracking-wider hover:bg-slate-200 transition-all flex items-center gap-2"><Download size={16} /> Export CSV</button>
              </div>
          )}
        </div>
        <div className="flex border-b border-slate-200 gap-8"><button onClick={() => setActiveTab('General')} className={`pb-3 text-sm font-bold uppercase tracking-wider transition-all border-b-2 ${activeTab === 'General' ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>General Expenses</button><button onClick={() => setActiveTab('Printing')} className={`pb-3 text-sm font-bold uppercase tracking-wider transition-all border-b-2 ${activeTab === 'Printing' ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>Printing Module</button><button onClick={() => setActiveTab('Reports')} className={`pb-3 text-sm font-bold uppercase tracking-wider transition-all border-b-2 ${activeTab === 'Reports' ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>Cost Reports</button></div>
        {activeTab === 'General' && (<div className="bg-white shadow-sm rounded-2xl border border-slate-100 overflow-hidden animate-fade-in"><div className="p-6 border-b border-slate-50"><h3 className="text-lg font-semibold text-slate-800">Operational Expenses</h3></div><div className="overflow-x-auto"><table className="w-full text-left text-sm text-slate-600 min-w-[700px]"><thead className="bg-slate-50/50"><tr><th className="px-6 py-4 font-bold text-xs uppercase text-slate-400 tracking-wider">Date</th><th className="px-6 py-4 font-bold text-xs uppercase text-slate-400 tracking-wider">Category</th><th className="px-6 py-4 font-bold text-xs uppercase text-slate-400 tracking-wider">Description</th><th className="px-6 py-4 font-bold text-xs uppercase text-slate-400 tracking-wider">Reference</th><th className="px-6 py-4 font-bold text-xs uppercase text-slate-400 tracking-wider text-right">Amount</th></tr></thead><tbody className="divide-y divide-slate-100">{generalExpenses.map(exp => (<tr key={exp.id} className="hover:bg-slate-50 transition-colors"><td className="px-6 py-4 font-mono text-xs">{exp.date}</td><td className="px-6 py-4"><span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${exp.category === 'Maintenance' ? 'bg-orange-50 text-orange-600' : exp.category === 'Electricity' ? 'bg-yellow-50 text-yellow-600' : 'bg-slate-100 text-slate-600'}`}>{exp.category}</span></td><td className="px-6 py-4 font-medium text-slate-900">{exp.description}</td><td className="px-6 py-4 text-xs font-mono text-slate-400">{exp.reference || '-'}</td><td className="px-6 py-4 text-right font-bold text-slate-900" title={`Currency: ${exp.currency || 'USD'}`}>{formatCurrency(exp.amount, exp.currency)}</td></tr>))}{generalExpenses.length === 0 && (<tr><td colSpan={5} className="px-6 py-8 text-center text-slate-400 italic">No expenses recorded yet.</td></tr>)}</tbody></table></div></div>)}
        {activeTab === 'Printing' && (<div className="space-y-6 animate-fade-in"><div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4"><div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all"><div className="flex items-center gap-3 mb-2 text-slate-500 text-xs font-bold uppercase tracking-wider"><Scissors size={14} /> PVC Costs</div><h3 className="text-2xl font-bold text-slate-800">{formatCurrencyTotals(pvcTotals)}</h3></div><div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all"><div className="flex items-center gap-3 mb-2 text-slate-500 text-xs font-bold uppercase tracking-wider"><Droplets size={14} /> Ink Costs</div><h3 className="text-2xl font-bold text-slate-800">{formatCurrencyTotals(inkTotals)}</h3></div><div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all"><div className="flex items-center gap-3 mb-2 text-slate-500 text-xs font-bold uppercase tracking-wider"><Zap size={14} /> Electricity</div><h3 className="text-2xl font-bold text-slate-800">{formatCurrencyTotals(electricityTotals)}</h3></div><div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all"><div className="flex items-center gap-3 mb-2 text-slate-500 text-xs font-bold uppercase tracking-wider"><User size={14} /> Operator Labor</div><h3 className="text-2xl font-bold text-slate-800">{formatCurrencyTotals(laborTotals)}</h3></div></div><div className="bg-white shadow-sm rounded-2xl border border-slate-100 overflow-hidden"><div className="p-6 border-b border-slate-50"><h3 className="text-lg font-semibold text-slate-800">Recent Printing Jobs</h3></div><div className="overflow-x-auto"><table className="w-full text-left text-sm text-slate-600 min-w-[700px]"><thead className="bg-slate-50/50"><tr><th className="px-6 py-4 font-bold text-xs uppercase text-slate-400 tracking-wider">Date</th><th className="px-6 py-4 font-bold text-xs uppercase text-slate-400 tracking-wider">Client</th><th className="px-6 py-4 font-bold text-xs uppercase text-slate-400 tracking-wider">Job Details</th><th className="px-6 py-4 font-bold text-xs uppercase text-slate-400 tracking-wider text-right">Cost</th><th className="px-6 py-4 font-bold text-xs uppercase text-slate-400 tracking-wider text-right">Charged</th><th className="px-6 py-4 font-bold text-xs uppercase text-slate-400 tracking-wider text-right">Profit</th></tr></thead><tbody className="divide-y divide-slate-100">{mockPrintingJobs.map(job => { const profit = job.chargedAmount - job.totalCost; return (<tr key={job.id} className="hover:bg-slate-50 transition-colors"><td className="px-6 py-4">{job.date}</td><td className="px-6 py-4 font-medium text-slate-900">{getClientName(job.clientId)}</td><td className="px-6 py-4"><p className="font-medium text-slate-800">{job.description}</p><p className="text-xs text-slate-500">{job.dimensions}</p></td><td className="px-6 py-4 text-right">{formatCurrency(job.totalCost, job.currency)}</td><td className="px-6 py-4 text-right">{formatCurrency(job.chargedAmount, job.currency)}</td><td className={`px-6 py-4 text-right font-bold ${profit > 0 ? 'text-green-600' : 'text-red-500'}`}>{formatCurrency(profit, job.currency)}</td></tr>) })}</tbody></table></div></div></div>)}
        {activeTab === 'Reports' && (<div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8 animate-fade-in"><h3 className="text-xl font-bold text-slate-800 mb-6">Client Printing Spend Report</h3><div className="space-y-4">{getClients().map(client => { const jobs = mockPrintingJobs.filter(j => j.clientId === client.id); const billedByCurrency = sumByCurrency(jobs, j => j.chargedAmount, j => j.currency); const costByCurrency = sumByCurrency(jobs, j => j.totalCost, j => j.currency); const totalBilled = Object.values(billedByCurrency).reduce((a, v) => a + v, 0); const totalCost = Object.values(costByCurrency).reduce((a, v) => a + v, 0); if(totalBilled === 0) return null; const marginPct = totalBilled > 0 ? ((totalBilled - totalCost) / totalBilled) * 100 : 0; return (<div key={client.id} className="border border-slate-100 rounded-xl p-6 hover:shadow-md transition-all"><div className="flex justify-between items-center mb-4"><h4 className="font-bold text-slate-900 text-lg">{client.companyName}</h4><span className="text-sm font-medium text-slate-500">{jobs.length} Jobs</span></div><div className="grid grid-cols-2 md:grid-cols-4 gap-4"><div><p className="text-xs text-slate-400 font-bold uppercase">Total Billed</p><p className="text-xl font-bold text-slate-900">{formatCurrencyTotals(billedByCurrency)}</p></div><div><p className="text-xs text-slate-400 font-bold uppercase">Our Cost</p><p className="text-xl font-bold text-slate-700">{formatCurrencyTotals(costByCurrency)}</p></div><div className="md:col-span-2"><p className="text-xs text-slate-400 font-bold uppercase mb-1">Margin Analysis (aggregate)</p><div className="h-2 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-green-500" style={{ width: `${Math.max(0, Math.min(100, marginPct))}%` }}></div></div></div></div></div>) })}</div></div>)}
      </div>
      <AccessibleModal
        isOpen={isAddJobModalOpen}
        onClose={() => setIsAddJobModalOpen(false)}
        title="Log Printing Job"
        size="xl"
        icon={<Printer size={20} />}
        mobileLayout="sheet"
        closeOnOverlayClick={false}
        footer={
          <>
            <ModalButton variant="secondary" onClick={() => setIsAddJobModalOpen(false)}>Cancel</ModalButton>
            <ModalButton variant="primary" type="submit" form="add-job-form">Log Job</ModalButton>
          </>
        }
      >
        <form id="add-job-form" onSubmit={handleAddJob} className="space-y-6">
          <FormSection title="Job Details">
            <FormRow>
              <FormSelect label="Client" value={newJob.clientId || ''} onChange={(e: any) => setNewJob({...newJob, clientId: e.target.value})} options={[{value: '', label: 'Select Client'}, ...getClients().map(c => ({value: c.id, label: c.companyName}))]} />
            </FormRow>
            <FormRow>
              <FormInput label="Description / Ref" value={newJob.description || ''} onChange={(e: any) => setNewJob({...newJob, description: e.target.value})} />
            </FormRow>
            <FormInput label="Dimensions (e.g. 12x4m)" value={newJob.dimensions || ''} onChange={(e: any) => setNewJob({...newJob, dimensions: e.target.value})} />
            <FormSelect label="Currency" value={newJob.currency || 'USD'} onChange={(e: any) => setNewJob({...newJob, currency: e.target.value as Currency})} options={CURRENCIES.map(c => ({ value: c, label: c }))} />
            <FormNumber label={`Billed Amount (${newJob.currency || 'USD'})`} min={0} value={newJob.chargedAmount || 0} onChange={(e: any) => setNewJob({...newJob, chargedAmount: Number(e.target.value)})} />
          </FormSection>
          <FormSection title={`Internal Cost Breakdown — ${newJob.currency || 'USD'}`}>
            <FormNumber label="PVC Cost" min={0} value={newJob.pvcCost || 0} onChange={(e: any) => setNewJob({...newJob, pvcCost: Number(e.target.value)})} />
            <FormNumber label="Ink" min={0} value={newJob.inkCost || 0} onChange={(e: any) => setNewJob({...newJob, inkCost: Number(e.target.value)})} />
            <FormNumber label="Electricity" min={0} value={newJob.electricityCost || 0} onChange={(e: any) => setNewJob({...newJob, electricityCost: Number(e.target.value)})} />
            <FormNumber label="Operator" min={0} value={newJob.operatorCost || 0} onChange={(e: any) => setNewJob({...newJob, operatorCost: Number(e.target.value)})} />
            <FormNumber label="Welding" min={0} value={newJob.weldingCost || 0} onChange={(e: any) => setNewJob({...newJob, weldingCost: Number(e.target.value)})} />
            <div className="flex flex-col justify-end"><p className="text-xs text-slate-400">Total Cost</p><p className="text-lg font-bold text-slate-800">{formatCurrency(calculateTotalJobCost(), newJob.currency)}</p></div>
          </FormSection>
        </form>
      </AccessibleModal>
      <AccessibleModal
        isOpen={isAddExpenseModalOpen}
        onClose={() => setIsAddExpenseModalOpen(false)}
        title="Log Expense"
        size="lg"
        icon={<Receipt size={20} />}
        mobileLayout="sheet"
        closeOnOverlayClick={false}
        footer={
          <>
            <ModalButton variant="secondary" onClick={() => setIsAddExpenseModalOpen(false)}>Cancel</ModalButton>
            <ModalButton variant="primary" type="submit" form="add-expense-form">Log Expense</ModalButton>
          </>
        }
      >
        <form id="add-expense-form" onSubmit={handleAddExpense} className="space-y-6">
          <FormSection title="Expense Details">
            <FormSelect label="Category" value={newExpense.category || 'Maintenance'} onChange={(e: any) => setNewExpense({...newExpense, category: e.target.value})} options={[{value: 'Maintenance', label: 'Maintenance & Repairs'},{value: 'Electricity', label: 'Electricity / Power'},{value: 'Labor', label: 'General Labor'},{value: 'Printing', label: 'Printing Supplies (Misc)'},{value: 'Other', label: 'Other'}]} />
            <FormInput label="Description" value={newExpense.description || ''} onChange={(e: any) => setNewExpense({...newExpense, description: e.target.value})} required />
            <FormNumber label={`Amount (${newExpense.currency || 'USD'})`} min={0} value={newExpense.amount || 0} onChange={(e: any) => setNewExpense({...newExpense, amount: Number(e.target.value)})} required />
            <FormSelect label="Currency" value={newExpense.currency || 'USD'} onChange={(e: any) => setNewExpense({...newExpense, currency: e.target.value as Currency})} options={CURRENCIES.map(c => ({ value: c, label: c }))} />
            <FormDate label="Date" value={newExpense.date || ''} onChange={(e: any) => setNewExpense({...newExpense, date: e.target.value})} />
            <FormInput label="Reference / Invoice No." value={newExpense.reference || ''} onChange={(e: any) => setNewExpense({...newExpense, reference: e.target.value})} />
          </FormSection>
        </form>
      </AccessibleModal>
    </>
  );
};