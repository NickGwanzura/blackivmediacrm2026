
import React, { useState, useEffect, useMemo } from 'react';
import { mockContracts, mockClients, mockBillboards, getContracts, updateContract, setContractStatus } from '../services/mockData';
import { useToast } from './Toast';
import { generateContractPDF, generateContractsReportPDF } from '../services/pdfGenerator';
import { emailContract } from '../services/emailService';
import { Contract, VAT_RATE } from '../types';
import { formatCurrency } from '../utils/sanitizers';
import { FileText, Calendar, Download, Eye, Clock, Plus as PlusIcon, FileDown, Mail, Loader2, PencilLine, Save, Archive, AlertTriangle, RotateCcw } from 'lucide-react';
import { AccessibleModal, ModalButton } from './ui/AccessibleModal';

type StatusFilter = 'All' | 'Active' | 'Pending' | 'Expired' | 'Archived';

const STATUS_STYLES: Record<Contract['status'], string> = {
  Active: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  Pending: 'bg-amber-50 text-amber-700 border-amber-100',
  Expired: 'bg-rose-50 text-rose-700 border-rose-100',
  Archived: 'bg-slate-100 text-slate-600 border-slate-200',
};

const MinimalInput = ({ label, value, onChange, type = 'text', required = false, min, max, step }: any) => (
  <div className="group relative">
    <input type={type} required={required} value={value ?? ''} onChange={onChange} min={min} max={max} step={step} placeholder=" " className="peer w-full px-0 py-2.5 border-b border-slate-200 bg-transparent text-slate-800 focus:border-slate-800 focus:ring-0 outline-none transition-all font-medium placeholder-transparent" />
    <label className="absolute left-0 -top-2.5 text-xs text-slate-400 font-medium transition-all peer-placeholder-shown:text-sm peer-placeholder-shown:text-slate-400 peer-placeholder-shown:top-2.5 peer-focus:-top-2.5 peer-focus:text-xs peer-focus:text-slate-800 uppercase tracking-wide">{label}</label>
  </div>
);

const recomputeTotal = (c: Contract): number => {
  const subtotal = (Number(c.monthlyRate) || 0) * 12 + (Number(c.installationCost) || 0) + (Number(c.printingCost) || 0);
  return c.hasVat ? subtotal + subtotal * VAT_RATE : subtotal;
};

export const ContractList: React.FC = () => {
  const toast = useToast();
  const [selectedContract, setSelectedContract] = useState<Contract | null>(null);
  const [editingContract, setEditingContract] = useState<Contract | null>(null);
  const [contracts, setContracts] = useState<Contract[]>(mockContracts);
  const [emailingContractId, setEmailingContractId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('All');

  useEffect(() => {
    const interval = setInterval(() => {
      const freshData = getContracts();
      if (freshData.length !== contracts.length) setContracts(freshData);
    }, 2000);
    return () => clearInterval(interval);
  }, [contracts.length]);

  const getClient = (id: string) => mockClients.find(c => c.id === id);
  const getClientName = (id: string) => getClient(id)?.companyName || 'Unknown';
  const getBillboardName = (id: string) => mockBillboards.find(b => b.id === id)?.name || 'Unknown';

  const filteredContracts = useMemo(() => {
    if (statusFilter === 'All') return contracts.filter(c => c.status !== 'Archived');
    return contracts.filter(c => c.status === statusFilter);
  }, [contracts, statusFilter]);

  const counts = useMemo(() => ({
    All: contracts.filter(c => c.status !== 'Archived').length,
    Active: contracts.filter(c => c.status === 'Active').length,
    Pending: contracts.filter(c => c.status === 'Pending').length,
    Expired: contracts.filter(c => c.status === 'Expired').length,
    Archived: contracts.filter(c => c.status === 'Archived').length,
  }), [contracts]);

  const handleDownload = (contract: Contract) => {
    const client = getClient(contract.clientId);
    if (client) generateContractPDF(contract, client, getBillboardName(contract.billboardId));
  };

  const handleEmail = async (contract: Contract) => {
    const client = getClient(contract.clientId);
    if (!client) { toast.error('Client not found for this contract.'); return; }
    if (!client.email) { toast.warning(`No email address on file for ${client.companyName}.`); return; }
    setEmailingContractId(contract.id);
    const result = await emailContract(contract, client, getBillboardName(contract.billboardId));
    setEmailingContractId(null);
    if (result.success) toast.success(`Contract emailed to ${client.email}.`);
    else toast.error(`Email failed: ${result.message}`);
  };

  const handleDownloadReport = () => generateContractsReportPDF(contracts, getClientName, getBillboardName);

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingContract) return;
    const next: Contract = { ...editingContract, totalContractValue: recomputeTotal(editingContract) };
    updateContract(next);
    setContracts(getContracts());
    setEditingContract(null);
    toast.success(`Contract ${next.id} updated.`);
  };

  const handleMarkExpired = async (contract: Contract) => {
    if (contract.status === 'Expired') return;
    const ok = await toast.confirm({
      title: 'Mark as Expired',
      message: `Mark contract ${contract.id} for ${getClientName(contract.clientId)} as Expired? This will free the asset occupancy.`,
      variant: 'default',
      confirmLabel: 'Mark Expired',
    });
    if (!ok) return;
    setContractStatus(contract.id, 'Expired');
    setContracts(getContracts());
    toast.success(`Contract ${contract.id} marked Expired.`);
  };

  const handleArchive = async (contract: Contract) => {
    if (contract.status === 'Archived') return;
    const ok = await toast.confirm({
      title: 'Archive Contract',
      message: `Archive contract ${contract.id}? It will be hidden from the main list and will not hold any asset occupancy. You can restore it from the Archived filter.`,
      variant: 'default',
      confirmLabel: 'Archive',
    });
    if (!ok) return;
    setContractStatus(contract.id, 'Archived');
    setContracts(getContracts());
    toast.success(`Contract ${contract.id} archived.`);
  };

  const handleRestore = (contract: Contract) => {
    const today = new Date();
    const end = new Date(contract.endDate);
    const restoredStatus: Contract['status'] = !isNaN(end.getTime()) && end < today ? 'Expired' : 'Active';
    setContractStatus(contract.id, restoredStatus);
    setContracts(getContracts());
    toast.success(`Contract ${contract.id} restored as ${restoredStatus}.`);
  };

  const getBillingDayDisplay = (contract: Contract) => {
    const client = getClient(contract.clientId);
    const suffix = (d: number) => {
      const j = d % 10, k = d % 100;
      if (j === 1 && k !== 11) return 'st';
      if (j === 2 && k !== 12) return 'nd';
      if (j === 3 && k !== 13) return 'rd';
      return 'th';
    };
    if (client && client.billingDay) return `${client.billingDay}${suffix(client.billingDay)} (Client Fixed)`;
    if (!contract.startDate) return '';
    const parts = contract.startDate.split('-');
    if (parts.length !== 3) return '';
    const day = parseInt(parts[2], 10);
    return `${day}${suffix(day)}`;
  };

  const filterTabs: StatusFilter[] = ['All', 'Active', 'Pending', 'Expired', 'Archived'];

  return (
    <>
      <div className="space-y-8 animate-fade-in">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-4xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-slate-900 to-slate-600 mb-2">Contracts</h2>
            <p className="text-slate-500 font-medium">Active agreements, billing cycles, and rental history</p>
          </div>
          <div className="flex gap-3">
            <button onClick={handleDownloadReport} className="bg-white border border-slate-200 text-slate-600 px-4 py-3 rounded-full text-sm font-bold uppercase tracking-wider hover:bg-slate-50 shadow-sm transition-all flex items-center gap-2">
              <FileDown size={18} /> Report
            </button>
            <button className="bg-slate-900 text-white px-5 py-3 rounded-full text-sm font-bold uppercase tracking-wider hover:bg-slate-800 shadow-lg hover:shadow-xl transition-all hover:scale-105 flex items-center gap-2">
              <PlusIcon size={18} /> New Contract
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {filterTabs.map(tab => (
            <button
              key={tab}
              onClick={() => setStatusFilter(tab)}
              className={`px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider transition-all border ${statusFilter === tab ? 'bg-slate-900 text-white border-slate-900 shadow' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}
            >
              {tab} <span className="ml-1 opacity-60">({counts[tab]})</span>
            </button>
          ))}
        </div>

        <div className="grid gap-4">
          {filteredContracts.length === 0 && (
            <div className="bg-white rounded-2xl p-10 border border-dashed border-slate-200 text-center text-slate-400 font-medium">
              No contracts in this view.
            </div>
          )}
          {filteredContracts.map(contract => {
            const isArchived = contract.status === 'Archived';
            return (
              <div key={contract.id} className={`bg-white rounded-2xl p-6 border shadow-sm hover:shadow-xl transition-all flex flex-col md:flex-row items-start md:items-center justify-between gap-6 group ${isArchived ? 'border-slate-200 opacity-70' : 'border-slate-100'}`}>
                <div className="flex items-start gap-5">
                  <div className="p-4 bg-indigo-50 rounded-2xl group-hover:bg-indigo-600 transition-colors group-hover:text-white text-indigo-600"><FileText className="w-6 h-6" /></div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-bold text-slate-900 text-lg">{getClientName(contract.clientId)}</h3>
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${STATUS_STYLES[contract.status]}`}>{contract.status}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-slate-500 mt-1">
                      <span className="font-medium text-slate-700">{getBillboardName(contract.billboardId)}</span>
                      <span className="text-slate-300">•</span>
                      <span className={`font-bold px-2 py-0.5 rounded text-xs ${contract.side === 'A' || contract.side === 'B' ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'}`}>{contract.details}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-3 text-xs text-slate-400 uppercase tracking-wide font-medium flex-wrap">
                      <span className="flex items-center gap-1"><Calendar size={12} /> {contract.startDate} — {contract.endDate}</span>
                      <span className="flex items-center gap-1 text-emerald-700 bg-emerald-50 px-2 py-1 rounded-md border border-emerald-100 shadow-sm" title="Monthly Billing Cycle"><Clock size={12} /> Bill Day: {getBillingDayDisplay(contract)}</span>
                      <span>ID: {contract.id}</span>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col md:items-end gap-1 w-full md:w-auto pl-16 md:pl-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-slate-400 font-medium">Total Value:</span>
                    <span className="text-2xl font-bold text-slate-900 tracking-tight">{formatCurrency(contract.totalContractValue, contract.currency)}</span>
                  </div>
                  <div className="flex gap-2 text-[10px] text-slate-500 uppercase tracking-wide">
                    {contract.monthlyRate > 0 && <span>{formatCurrency(contract.monthlyRate, contract.currency)}/mo</span>}
                    {contract.installationCost > 0 && <span className="flex items-center gap-1 text-slate-400">+ Install</span>}
                    {contract.printingCost > 0 && <span className="flex items-center gap-1 text-slate-400">+ Print</span>}
                    {contract.hasVat && <span className="text-slate-400">+ VAT</span>}
                  </div>
                </div>
                <div className="flex gap-2 flex-wrap w-full md:w-auto border-t md:border-t-0 border-slate-100 pt-5 md:pt-0 mt-2 md:mt-0 pl-16 md:pl-0">
                  <button onClick={() => setSelectedContract(contract)} className="px-3 py-2 text-xs font-bold uppercase tracking-wider text-slate-500 hover:text-slate-900 hover:bg-slate-50 rounded-lg transition-colors flex items-center gap-2"><Eye size={14} /> View</button>
                  {!isArchived && (
                    <button onClick={() => setEditingContract({ ...contract })} className="px-3 py-2 text-xs font-bold uppercase tracking-wider text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 rounded-lg transition-colors flex items-center gap-2" title="Edit Contract"><PencilLine size={14} /> Edit</button>
                  )}
                  <button onClick={() => handleDownload(contract)} className="px-3 py-2 text-xs font-bold uppercase tracking-wider text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors flex items-center gap-2 shadow-lg hover:shadow-slate-500/30"><Download size={14} /> PDF</button>
                  {!isArchived && (
                    <button onClick={() => handleEmail(contract)} disabled={emailingContractId === contract.id} title={getClient(contract.clientId)?.email ? `Email to ${getClient(contract.clientId)?.email}` : 'No client email on file'} className="px-3 py-2 text-xs font-bold uppercase tracking-wider text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50">{emailingContractId === contract.id ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />} Email</button>
                  )}
                  {contract.status === 'Active' && (
                    <button onClick={() => handleMarkExpired(contract)} className="px-3 py-2 text-xs font-bold uppercase tracking-wider text-rose-600 bg-white border border-rose-100 hover:bg-rose-50 rounded-lg transition-colors flex items-center gap-2" title="Mark as Expired"><AlertTriangle size={14} /> Expire</button>
                  )}
                  {!isArchived ? (
                    <button onClick={() => handleArchive(contract)} className="px-3 py-2 text-xs font-bold uppercase tracking-wider text-slate-500 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors flex items-center gap-2" title="Archive Contract"><Archive size={14} /> Archive</button>
                  ) : (
                    <button onClick={() => handleRestore(contract)} className="px-3 py-2 text-xs font-bold uppercase tracking-wider text-emerald-600 bg-white border border-emerald-100 hover:bg-emerald-50 rounded-lg transition-colors flex items-center gap-2" title="Restore Contract"><RotateCcw size={14} /> Restore</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* View Modal */}
      <AccessibleModal
        isOpen={!!selectedContract}
        onClose={() => setSelectedContract(null)}
        title="Contract Details"
        description={selectedContract ? `${getClientName(selectedContract.clientId)} — ${getBillboardName(selectedContract.billboardId)}` : undefined}
        size="lg"
        icon={<FileText size={20} />}
        closeOnOverlayClick={false}
        mobileLayout="sheet"
        footer={
          selectedContract ? (
            <>
              <ModalButton variant="secondary" onClick={() => setSelectedContract(null)}>Close</ModalButton>
              <ModalButton variant="primary" onClick={() => handleDownload(selectedContract)}>
                <Download size={14} /> Download PDF
              </ModalButton>
            </>
          ) : undefined
        }
      >
        {selectedContract && (
          <div className="space-y-6">
            <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 flex justify-between items-center">
              <div>
                <p className="text-xs font-bold uppercase text-slate-400 mb-2">Lessee</p>
                <h4 className="text-xl font-bold text-slate-900">{getClientName(selectedContract.clientId)}</h4>
              </div>
              <div className="text-right">
                <p className="text-xs font-bold uppercase text-slate-400 mb-1">Billing Day</p>
                <span className="inline-flex items-center gap-1 px-3 py-1 bg-white border border-slate-200 rounded-lg text-sm font-bold text-slate-800 shadow-sm">
                  <Clock size={14} className="text-emerald-500" /> {getBillingDayDisplay(selectedContract)}
                </span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-6">
              <div>
                <p className="text-xs font-bold uppercase text-slate-400 mb-1">Asset</p>
                <p className="font-medium text-slate-800">{getBillboardName(selectedContract.billboardId)}</p>
                <p className="text-xs text-slate-500">{selectedContract.details}</p>
              </div>
              <div>
                <p className="text-xs font-bold uppercase text-slate-400 mb-1">Duration</p>
                <p className="font-medium text-slate-900">{selectedContract.startDate}</p>
                <p className="text-xs text-slate-500">to {selectedContract.endDate}</p>
              </div>
            </div>
            <div className="space-y-2 border-t border-slate-100 pt-4">
              <div className="flex justify-between text-sm"><span className="text-slate-500">Monthly Rate</span><span className="font-medium">{formatCurrency(selectedContract.monthlyRate, selectedContract.currency)}</span></div>
              <div className="flex justify-between text-sm"><span className="text-slate-500">Installation Fee</span><span className="font-medium">{formatCurrency(selectedContract.installationCost, selectedContract.currency)}</span></div>
              <div className="flex justify-between text-sm"><span className="text-slate-500">Printing Costs</span><span className="font-medium">{formatCurrency(selectedContract.printingCost, selectedContract.currency)}</span></div>
              <div className="flex justify-between text-lg font-bold pt-2 text-slate-900"><span>Total Value</span><span>{formatCurrency(selectedContract.totalContractValue, selectedContract.currency)}</span></div>
            </div>
          </div>
        )}
      </AccessibleModal>

      {/* Edit Modal */}
      <AccessibleModal
        isOpen={!!editingContract}
        onClose={() => setEditingContract(null)}
        title={editingContract ? `Edit Contract ${editingContract.id}` : 'Edit Contract'}
        description={editingContract ? `${getClientName(editingContract.clientId)} — ${getBillboardName(editingContract.billboardId)}` : undefined}
        size="lg"
        icon={<PencilLine size={20} />}
        footer={
          <>
            <ModalButton variant="secondary" onClick={() => setEditingContract(null)}>Cancel</ModalButton>
            <ModalButton variant="primary" type="submit" form="edit-contract-form"><Save size={14} /> Save Changes</ModalButton>
          </>
        }
      >
        <form id="edit-contract-form" onSubmit={handleSaveEdit} className="space-y-8">
          {editingContract && (
            <>
              <div className="grid grid-cols-2 gap-6">
                <MinimalInput label="Start Date" type="date" value={editingContract.startDate} onChange={(e: any) => setEditingContract({ ...editingContract, startDate: e.target.value })} required />
                <MinimalInput label="End Date" type="date" value={editingContract.endDate} onChange={(e: any) => setEditingContract({ ...editingContract, endDate: e.target.value })} required />
              </div>
              <div className="grid grid-cols-2 gap-6">
                <MinimalInput label="Monthly Rate" type="number" min={0} step={1} value={editingContract.monthlyRate} onChange={(e: any) => setEditingContract({ ...editingContract, monthlyRate: Number(e.target.value) })} required />
                <MinimalInput label="Installation Cost" type="number" min={0} step={1} value={editingContract.installationCost} onChange={(e: any) => setEditingContract({ ...editingContract, installationCost: Number(e.target.value) })} />
              </div>
              <div className="grid grid-cols-2 gap-6">
                <MinimalInput label="Printing Cost" type="number" min={0} step={1} value={editingContract.printingCost} onChange={(e: any) => setEditingContract({ ...editingContract, printingCost: Number(e.target.value) })} />
                <MinimalInput label="Details" value={editingContract.details} onChange={(e: any) => setEditingContract({ ...editingContract, details: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-6 items-end">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wide text-slate-400 mb-2">Status</label>
                  <select
                    value={editingContract.status}
                    onChange={(e) => setEditingContract({ ...editingContract, status: e.target.value as Contract['status'] })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white text-slate-800 focus:border-slate-800 focus:ring-0 outline-none font-medium"
                  >
                    <option value="Active">Active</option>
                    <option value="Pending">Pending</option>
                    <option value="Expired">Expired</option>
                    <option value="Archived">Archived</option>
                  </select>
                </div>
                <label className="flex items-center gap-3 pb-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={editingContract.hasVat}
                    onChange={(e) => setEditingContract({ ...editingContract, hasVat: e.target.checked })}
                    className="w-4 h-4 accent-slate-900"
                  />
                  <span className="text-sm font-medium text-slate-700">Apply VAT ({Math.round(VAT_RATE * 100)}%)</span>
                </label>
              </div>
              <div className="bg-slate-50 rounded-xl border border-slate-100 p-4 flex justify-between items-center">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Recomputed Total Value</span>
                <span className="text-lg font-bold text-slate-900">{formatCurrency(recomputeTotal(editingContract), editingContract.currency)}</span>
              </div>
            </>
          )}
        </form>
      </AccessibleModal>
    </>
  );
};
