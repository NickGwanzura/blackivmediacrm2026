
import React, { useState, useEffect } from 'react';
import { getOutsourcedBillboards, getBillboards, addOutsourcedBillboard, updateOutsourcedBillboard, deleteOutsourcedBillboard, getDefaultCurrency } from '../services/mockData';
import { useToast } from './Toast';
import { OutsourcedBillboard, Billboard, Currency, CURRENCIES } from '../types';
import { formatCurrency, sumByCurrency, formatCurrencyTotals } from '../utils/sanitizers';
import { Plus, Edit2, Globe, DollarSign, Calendar, Save, Trash2, MapPin } from 'lucide-react';
import { AccessibleModal, ModalButton } from './ui/AccessibleModal';
import { FormInput, FormSelect, FormNumber, FormDate, FormSection } from './ui/Form';



export const OutsourcedList: React.FC = () => {
  const toast = useToast();
  const [outsourcedList, setOutsourcedList] = useState<OutsourcedBillboard[]>(getOutsourcedBillboards());
  const [inventory, setInventory] = useState<Billboard[]>(getBillboards());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentBillboard, setCurrentBillboard] = useState<Partial<OutsourcedBillboard>>({});
  const [itemToDelete, setItemToDelete] = useState<OutsourcedBillboard | null>(null);

  // Poll for updates to ensure data is in sync
  useEffect(() => {
      const interval = setInterval(() => {
          setOutsourcedList(getOutsourcedBillboards());
          setInventory(getBillboards());
      }, 1000);
      return () => clearInterval(interval);
  }, []);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();

    if (!currentBillboard.billboardId) {
        toast.warning("Please select a billboard from the inventory.");
        return;
    }

    const linkedBillboard = inventory.find(b => b.id === currentBillboard.billboardId);

    if (currentBillboard.id) {
        const updated = {
            ...currentBillboard,
            billboardName: linkedBillboard?.name || 'Unknown'
        } as OutsourcedBillboard;
        updateOutsourcedBillboard(updated);
        setOutsourcedList(getOutsourcedBillboards());
        toast.success("Outsourced assignment updated.");
    } else {
        const newB: OutsourcedBillboard = {
            ...currentBillboard,
            id: `OUT-${Date.now()}`,
            billboardName: linkedBillboard?.name || 'Unknown',
            status: 'Active'
        } as OutsourcedBillboard;
        addOutsourcedBillboard(newB);
        setOutsourcedList(getOutsourcedBillboards());
        toast.success(`${linkedBillboard?.name || 'Billboard'} assigned to partner.`);
    }
    setIsModalOpen(false);
    setCurrentBillboard({});
  };

  const handleDeleteConfirm = () => {
      if (itemToDelete) {
          deleteOutsourcedBillboard(itemToDelete.id);
          setOutsourcedList(getOutsourcedBillboards());
          toast.success(`${itemToDelete.billboardName} assignment removed.`);
          setItemToDelete(null);
      }
  };

  const openAdd = () => { 
      // Refresh inventory immediately before opening
      setInventory([...getBillboards()]);
      setCurrentBillboard({ monthlyPayout: 0, contractStart: '', contractEnd: '', billboardId: '', currency: getDefaultCurrency() });
      setIsModalOpen(true); 
  };

  const openEdit = (billboard: OutsourcedBillboard) => {
      setInventory([...getBillboards()]);
      setCurrentBillboard(billboard);
      setIsModalOpen(true);
  };

  return (
    <>
      <div className="space-y-8 animate-fade-in">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4"><div><h2 className="text-4xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-slate-900 to-slate-600 mb-2">Outsourced Inventory</h2><p className="text-slate-500 font-medium">Assign existing billboards to 3rd party partners</p></div><button onClick={openAdd} className="bg-slate-900 text-white px-5 py-3 rounded-full text-sm font-bold uppercase tracking-wider hover:bg-slate-800 flex items-center gap-2 shadow-lg hover:shadow-xl transition-all hover:scale-105"><Plus size={18} /> Assign Outsourced</button></div>
        
        {outsourcedList.length > 0 && (
            <div className="bg-white rounded-2xl px-6 py-4 border border-slate-100 shadow-sm flex items-center gap-3">
              <DollarSign size={16} className="text-green-600 shrink-0" />
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Total Monthly Payouts:</span>
              {/* sumByCurrency prevents incorrect cross-currency addition */}
              <span className="text-sm font-bold text-slate-900">{formatCurrencyTotals(sumByCurrency(outsourcedList, r => r.monthlyPayout, r => r.currency, getDefaultCurrency()))}</span>
            </div>
        )}

        {outsourcedList.length === 0 ? (
            <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-slate-200">
                <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-300">
                    <Globe size={32}/>
                </div>
                <h3 className="text-lg font-bold text-slate-900 mb-1">No Outsourced Units</h3>
                <p className="text-slate-500 text-sm">Assign an inventory item to a partner to get started.</p>
            </div>
        ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {outsourcedList.map(billboard => (
                <div key={billboard.id} className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 hover:shadow-lg transition-all group hover:-translate-y-1 duration-300">
                    <div className="flex justify-between items-start mb-4"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center shadow-sm"><Globe size={20} /></div><div className="min-w-0"><h3 className="font-bold text-slate-900 leading-tight truncate pr-2">{billboard.billboardName}</h3><p className="text-xs text-slate-500 font-mono">ID: {billboard.billboardId}</p></div></div><div className="flex gap-2 shrink-0"><button onClick={() => openEdit(billboard)} className="text-slate-300 hover:text-slate-600 transition-colors"><Edit2 size={16} /></button><button onClick={() => setItemToDelete(billboard)} className="text-slate-300 hover:text-red-500 transition-colors"><Trash2 size={16} /></button></div></div>
                    <div className="space-y-4 py-4 border-t border-slate-50"><div><p className="text-[10px] uppercase font-bold text-slate-400 mb-1">Media Owner (Partner)</p><p className="text-sm font-medium text-slate-800">{billboard.mediaOwner}</p><p className="text-xs text-slate-500">{billboard.ownerContact}</p></div><div className="grid grid-cols-2 gap-4"><div className="bg-green-50 p-3 rounded-xl border border-green-100"><div className="flex items-center gap-2 text-green-700 text-xs font-bold uppercase mb-1"><DollarSign size={12} /> Payout/Mo</div><p className="text-lg font-bold text-slate-900">{formatCurrency(billboard.monthlyPayout, billboard.currency)}</p></div><div className="bg-slate-50 p-3 rounded-xl border border-slate-100"><div className="flex items-center gap-2 text-slate-500 text-xs font-bold uppercase mb-1"><Calendar size={12} /> Ends</div><p className="text-sm font-bold text-slate-800">{billboard.contractEnd}</p></div></div></div>
                </div>
            ))}
            </div>
        )}
      </div>
      <AccessibleModal
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); setCurrentBillboard({}); }}
        title="Assign Billboard to Partner"
        size="lg"
        variant="default"
        icon={<Globe size={20} />}
        closeOnOverlayClick={false}
        mobileLayout="sheet"
        footer={
          <>
            <ModalButton variant="secondary" onClick={() => { setIsModalOpen(false); setCurrentBillboard({}); }}>Cancel</ModalButton>
            <ModalButton variant="primary" type="submit" form="outsourced-form"><Save size={14} /> Save Assignment</ModalButton>
          </>
        }
      >
        <form id="outsourced-form" onSubmit={handleSave} className="space-y-6">
          <FormSection title="Asset Selection">
            <FormSelect
              label="Select Billboard from Inventory"
              value={currentBillboard.billboardId || ''}
              onChange={(e: any) => setCurrentBillboard({...currentBillboard, billboardId: e.target.value})}
              options={[
                {value: '', label: 'Select Asset...'},
                ...inventory.map(b => ({value: b.id, label: `${b.name} (${b.type})`}))
              ]}
            />
            {currentBillboard.billboardId && (
              <div className="flex items-center gap-2 text-xs text-indigo-600 bg-indigo-50 p-2 rounded-lg">
                <MapPin size={12} />
                {inventory.find(b => b.id === currentBillboard.billboardId)?.location}
              </div>
            )}
          </FormSection>
          <FormSection title="Partner Details">
            <FormInput label="Partner Name" value={currentBillboard.mediaOwner || ''} onChange={(e: any) => setCurrentBillboard({...currentBillboard, mediaOwner: e.target.value})} required />
            <FormInput label="Partner Contact" value={currentBillboard.ownerContact || ''} onChange={(e: any) => setCurrentBillboard({...currentBillboard, ownerContact: e.target.value})} />
          </FormSection>
          <FormSection title="Contract Terms">
            <FormNumber label={`Monthly Payout (${currentBillboard.currency || getDefaultCurrency()})`} min={0} value={currentBillboard.monthlyPayout || 0} onChange={(e: any) => setCurrentBillboard({...currentBillboard, monthlyPayout: Number(e.target.value)})} />
            <FormSelect label="Currency" value={currentBillboard.currency || getDefaultCurrency()} onChange={(e: any) => setCurrentBillboard({...currentBillboard, currency: e.target.value as Currency})} options={CURRENCIES.map(c => ({ value: c, label: c }))} />
            <FormDate label="Start Date" value={currentBillboard.contractStart || ''} onChange={(e: any) => setCurrentBillboard({...currentBillboard, contractStart: e.target.value})} />
            <FormDate label="End Date" value={currentBillboard.contractEnd || ''} onChange={(e: any) => setCurrentBillboard({...currentBillboard, contractEnd: e.target.value})} />
          </FormSection>
        </form>
      </AccessibleModal>
      <AccessibleModal
        isOpen={!!itemToDelete}
        onClose={() => setItemToDelete(null)}
        title="Delete Assignment?"
        description={itemToDelete ? <>Are you sure you want to remove the outsourced assignment for <span className="font-bold text-slate-700">{itemToDelete.billboardName}</span>?</> : undefined}
        size="sm"
        role="alertdialog"
        variant="danger"
        onConfirmKey={handleDeleteConfirm}
        footer={
          <>
            <ModalButton variant="secondary" onClick={() => setItemToDelete(null)}>Cancel</ModalButton>
            <ModalButton variant="danger" onClick={handleDeleteConfirm}><Trash2 size={14} /> Delete</ModalButton>
          </>
        }
      >
        <></>
      </AccessibleModal>
    </>
  );
};
