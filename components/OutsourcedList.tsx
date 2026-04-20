
import React, { useState, useEffect } from 'react';
import { getOutsourcedBillboards, getBillboards, addOutsourcedBillboard, updateOutsourcedBillboard, deleteOutsourcedBillboard } from '../services/mockData';
import { useToast } from './Toast';
import { OutsourcedBillboard, Billboard } from '../types';
import { Plus, X, Edit2, Globe, DollarSign, Calendar, Save, Trash2, AlertTriangle, MapPin } from 'lucide-react';

const MinimalSelect = ({ label, value, onChange, options, disabled = false }: any) => (
  <div className="group relative pt-4 w-full">
    <select 
      value={value}
      onChange={onChange}
      disabled={disabled}
      className="peer w-full px-0 py-2.5 border-b border-slate-200 bg-transparent text-slate-800 focus:border-slate-800 focus:ring-0 outline-none transition-all font-medium appearance-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed" 
    >
      {options.map((opt: any) => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
    <label className="absolute left-0 -top-0 text-xs text-slate-400 font-medium uppercase tracking-wide pointer-events-none">
      {label}
    </label>
  </div>
);

const MinimalInput = ({ label, value, onChange, type = "text", required = false }: any) => (
  <div className="group relative pt-4 w-full">
    <input type={type} required={required} value={value} onChange={onChange} placeholder=" " className="peer w-full px-0 py-2.5 border-b border-slate-200 bg-transparent text-slate-800 focus:border-slate-800 focus:ring-0 outline-none transition-all font-medium placeholder-transparent" />
    <label className="absolute left-0 -top-0 text-xs text-slate-400 font-medium transition-all peer-placeholder-shown:text-sm peer-placeholder-shown:text-slate-400 peer-placeholder-shown:top-2.5 peer-focus:-top-0 peer-focus:text-xs peer-focus:text-slate-800 uppercase tracking-wide pointer-events-none">{label}</label>
  </div>
);

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
      setCurrentBillboard({ monthlyPayout: 0, contractStart: '', contractEnd: '', billboardId: '' }); 
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
                    <div className="space-y-4 py-4 border-t border-slate-50"><div><p className="text-[10px] uppercase font-bold text-slate-400 mb-1">Media Owner (Partner)</p><p className="text-sm font-medium text-slate-800">{billboard.mediaOwner}</p><p className="text-xs text-slate-500">{billboard.ownerContact}</p></div><div className="grid grid-cols-2 gap-4"><div className="bg-green-50 p-3 rounded-xl border border-green-100"><div className="flex items-center gap-2 text-green-700 text-xs font-bold uppercase mb-1"><DollarSign size={12} /> Payout/Mo</div><p className="text-lg font-bold text-slate-900">${billboard.monthlyPayout.toLocaleString()}</p></div><div className="bg-slate-50 p-3 rounded-xl border border-slate-100"><div className="flex items-center gap-2 text-slate-500 text-xs font-bold uppercase mb-1"><Calendar size={12} /> Ends</div><p className="text-sm font-bold text-slate-800">{billboard.contractEnd}</p></div></div></div>
                </div>
            ))}
            </div>
        )}
      </div>
      {isModalOpen && (
        <div className="fixed inset-0 z-[200] overflow-y-auto">
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md transition-opacity" onClick={() => setIsModalOpen(false)} />
            <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
                <div className="relative transform overflow-hidden rounded-3xl bg-white text-left shadow-2xl transition-all sm:my-8 sm:w-full sm:max-w-lg border border-white/20">
                    <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-white sticky top-0 z-10">
                        <h3 className="text-xl font-bold text-slate-900">Assign Billboard to Partner</h3>
                        <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors"><X size={20} className="text-slate-400" /></button>
                    </div>
                    <form onSubmit={handleSave} className="p-8 space-y-6">
                        <MinimalSelect 
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
                                <MapPin size={12}/> 
                                {inventory.find(b => b.id === currentBillboard.billboardId)?.location}
                            </div>
                        )}

                        <div className="grid grid-cols-2 gap-6">
                            <MinimalInput label="Partner Name" value={currentBillboard.mediaOwner || ''} onChange={(e: any) => setCurrentBillboard({...currentBillboard, mediaOwner: e.target.value})} required />
                            <MinimalInput label="Partner Contact" value={currentBillboard.ownerContact || ''} onChange={(e: any) => setCurrentBillboard({...currentBillboard, ownerContact: e.target.value})} />
                        </div>
                        <div className="grid grid-cols-2 gap-6">
                            <MinimalInput label="Payout / Month ($)" type="number" value={currentBillboard.monthlyPayout} onChange={(e: any) => setCurrentBillboard({...currentBillboard, monthlyPayout: Number(e.target.value)})} />
                            <div className="space-y-4">
                                <MinimalInput label="Start Date" type="date" value={currentBillboard.contractStart || ''} onChange={(e: any) => setCurrentBillboard({...currentBillboard, contractStart: e.target.value})} />
                                <MinimalInput label="End Date" type="date" value={currentBillboard.contractEnd || ''} onChange={(e: any) => setCurrentBillboard({...currentBillboard, contractEnd: e.target.value})} />
                            </div>
                        </div>
                        <button type="submit" className="w-full py-4 text-white bg-slate-900 rounded-xl hover:bg-slate-800 flex items-center justify-center gap-2 shadow-xl font-bold uppercase tracking-wider transition-all"><Save size={18} /> Save Assignment</button>
                    </form>
                </div>
            </div>
        </div>
      )}
      {itemToDelete && (
        <div className="fixed inset-0 z-[200] overflow-y-auto">
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md transition-opacity" onClick={() => setItemToDelete(null)} />
            <div className="flex min-h-full items-center justify-center p-4 text-center">
                <div className="relative transform overflow-hidden rounded-2xl bg-white text-left shadow-2xl transition-all sm:my-8 sm:w-full sm:max-w-sm border border-white/20 p-6 text-center">
                    <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4 border-4 border-red-50"><AlertTriangle className="text-red-500" size={32} /></div>
                    <h3 className="text-xl font-bold text-slate-900 mb-2">Delete Assignment?</h3>
                    <p className="text-slate-500 mb-6 text-sm">Are you sure you want to remove the outsourced assignment for <span className="font-bold text-slate-700">{itemToDelete.billboardName}</span>?</p>
                    <div className="flex gap-3">
                        <button onClick={() => setItemToDelete(null)} className="flex-1 py-3 text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl font-bold uppercase text-xs tracking-wider transition-colors">Cancel</button>
                        <button onClick={handleDeleteConfirm} className="flex-1 py-3 text-white bg-red-500 hover:bg-red-600 rounded-xl font-bold uppercase text-xs tracking-wider transition-colors shadow-lg shadow-red-500/30">Delete</button>
                    </div>
                </div>
            </div>
        </div>
      )}
    </>
  );
};
