
import React, { useState, useEffect } from 'react';
import { getContracts, getBillboards, addContract, addInvoice, mockClients, deleteContract } from '../services/mockData';
import { generateContractPDF, generateMasterContractPDF, generateActiveRentalsPDF } from '../services/pdfGenerator';
import { generateRentalProposal } from '../services/aiService';
import { Contract, BillboardType, VAT_RATE, Invoice } from '../types';
import { FileText, Calendar, Download, Eye, Plus, X, Wand2, RefreshCw, CheckCircle, Trash2, AlertTriangle, Sparkles, Layers, ShoppingCart, MinusCircle, FileDown } from 'lucide-react';

const MinimalInput = ({ label, value, onChange, type = "text", required = false, disabled = false }: any) => {
  const isDate = type === 'date';
  return (
    <div className="group relative pt-4 w-full">
        <input 
        type={type} 
        required={required}
        value={value}
        onChange={onChange}
        disabled={disabled}
        placeholder=" "
        className="peer w-full px-0 py-2.5 border-b border-slate-200 bg-transparent text-slate-800 focus:border-slate-800 focus:ring-0 outline-none transition-all font-medium placeholder-transparent disabled:opacity-50 disabled:cursor-not-allowed" 
        />
        <label className={`absolute left-0 -top-0 text-xs text-slate-400 font-medium transition-all uppercase tracking-wide 
            ${isDate ? '' : 'peer-placeholder-shown:text-sm peer-placeholder-shown:text-slate-400 peer-placeholder-shown:top-6'} 
            peer-focus:-top-0 peer-focus:text-xs peer-focus:text-slate-800 pointer-events-none`}>
        {label}
        </label>
    </div>
  );
};

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

// Define type for batch items
interface BatchItem {
    billboardId: string;
    side: 'A' | 'B' | 'Both' | undefined;
    slotNumber: number | undefined;
    monthlyRate: number;
    installationCost: number;
    printingCost: number;
    details: string;
    tempId: number; // For identifying in cart
}

export const Rentals: React.FC = () => {
  const [rentals, setRentals] = useState<Contract[]>(getContracts());
  const [selectedRental, setSelectedRental] = useState<Contract | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [rentalToDelete, setRentalToDelete] = useState<Contract | null>(null);
  const [aiProposal, setAiProposal] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [billboards, setBillboards] = useState(getBillboards()); // Local state to ensure freshness
  
  // Mode State
  const [isBatchMode, setIsBatchMode] = useState(false);
  const [batchItems, setBatchItems] = useState<BatchItem[]>([]);

  // Shared form state
  const [formData, setFormData] = useState({
    clientId: '', 
    startDate: '', 
    endDate: '', 
    hasVat: true,
    // Single mode specific (or current batch item specific)
    billboardId: '', 
    side: 'A' as 'A' | 'B' | 'Both', 
    slotNumber: 1, 
    monthlyRate: 0, 
    installationCost: 0, 
    printingCost: 0
  });

  useEffect(() => {
      if(isCreateModalOpen) setBillboards([...getBillboards()]);
      
      // Poll for updates while modal is open to ensure asset list is current
      let interval: ReturnType<typeof setInterval>;
      if(isCreateModalOpen) {
          interval = setInterval(() => {
              setBillboards([...getBillboards()]);
          }, 2000);
      }
      return () => clearInterval(interval);
  }, [isCreateModalOpen]);

  const getClient = (id: string) => mockClients.find(c => c.id === id);
  const getBillboard = (id: string) => billboards.find(b => b.id === id);
  const getClientName = (id: string) => getClient(id)?.companyName || 'Unknown';
  const getBillboardName = (id: string) => getBillboard(id)?.name || 'Unknown';

  const selectedBillboard = getBillboard(formData.billboardId);

  const isSideAvailable = (side: 'A' | 'B' | 'Both', billboard = selectedBillboard) => {
    if (!billboard) return false;
    if (billboard.type !== BillboardType.Static) return false;
    
    // Check real rental status
    const isOccupiedA = billboard.sideAStatus === 'Rented';
    const isOccupiedB = billboard.sideBStatus === 'Rented';

    // Also check if already in batch cart
    const inBatch = batchItems.filter(item => item.billboardId === billboard.id);
    const batchUsesA = inBatch.some(i => i.side === 'A' || i.side === 'Both');
    const batchUsesB = inBatch.some(i => i.side === 'B' || i.side === 'Both');

    if (side === 'Both') {
        return (!isOccupiedA && !isOccupiedB) && (!batchUsesA && !batchUsesB);
    }
    if (side === 'A') return !isOccupiedA && !batchUsesA;
    if (side === 'B') return !isOccupiedB && !batchUsesB;
    
    return false;
  };

  // Auto-set rate when billboard/side selected
  useEffect(() => {
    if (selectedBillboard?.type === BillboardType.Static) {
        // Simple logic: default to A if available, else B, else none
        const aFree = isSideAvailable('A', selectedBillboard);
        const bFree = isSideAvailable('B', selectedBillboard);
        
        let autoSide: 'A' | 'B' | 'Both' = 'A';
        let rate = 0;

        if (aFree) { autoSide = 'A'; rate = selectedBillboard.sideARate || 0; } 
        else if (bFree) { autoSide = 'B'; rate = selectedBillboard.sideBRate || 0; } 
        else { rate = 0; } // All occupied or in cart

        setFormData(prev => ({ ...prev, side: autoSide, monthlyRate: rate }));
    } else if (selectedBillboard?.type === BillboardType.LED) {
        // Intelligent Slot Selection
        const usedSlots = batchItems
            .filter(i => i.billboardId === selectedBillboard.id)
            .map(i => i.slotNumber);
        
        let nextSlot = 1;
        // Skip slots that are already in batch OR already rented (assuming simplified sequential filling for rented)
        // Note: rentedSlots is a count, not specific indices in this model, so we just offset by rented count
        const baseOffset = selectedBillboard.rentedSlots || 0;
        
        // Try to find a slot index > baseOffset and not in usedSlots
        // Loop 1 to totalSlots
        for(let i = 1; i <= (selectedBillboard.totalSlots || 10); i++) {
            if (i > baseOffset && !usedSlots.includes(i)) {
                nextSlot = i;
                break;
            }
        }

        setFormData(prev => ({ 
            ...prev, 
            monthlyRate: selectedBillboard.ratePerSlot || 0,
            slotNumber: nextSlot
        }));
    }
  }, [formData.billboardId, selectedBillboard, batchItems]); // Added batchItems to re-eval if cart changes

  const addToBatch = () => {
      if (!selectedBillboard) return;
      
      if (selectedBillboard.type === BillboardType.Static && !isSideAvailable(formData.side)) {
          alert("Selected side is not available or already in cart.");
          return;
      }

      // Prevent adding same asset configuration twice
      const isDuplicate = batchItems.some(item => 
          item.billboardId === formData.billboardId && 
          item.side === formData.side && 
          item.slotNumber === formData.slotNumber
      );

      if (isDuplicate) {
          alert("This asset configuration is already in your batch cart.");
          return;
      }

      const detailText = selectedBillboard.type === BillboardType.Static 
          ? (formData.side === 'Both' ? "Sides A & B" : `Side ${formData.side}`) 
          : `Slot ${formData.slotNumber}`;

      const newItem: BatchItem = {
          billboardId: formData.billboardId,
          side: selectedBillboard.type === BillboardType.Static ? formData.side : undefined,
          slotNumber: selectedBillboard.type === BillboardType.LED ? formData.slotNumber : undefined,
          monthlyRate: formData.monthlyRate,
          installationCost: formData.installationCost,
          printingCost: formData.printingCost,
          details: detailText,
          tempId: Date.now()
      };

      setBatchItems([...batchItems, newItem]);
      
      // Reset only asset-specific fields
      // Use setTimeout to ensure React batching doesn't miss the reset for the Select component
      setTimeout(() => {
          setFormData(prev => ({
              ...prev, 
              billboardId: '', 
              monthlyRate: 0, 
              installationCost: 0, 
              printingCost: 0,
              side: 'A',
              slotNumber: 1
          }));
      }, 50);
  };

  const removeFromBatch = (tempId: number) => {
      setBatchItems(prev => prev.filter(i => i.tempId !== tempId));
  };

  const handleBatchCreate = () => {
      if(batchItems.length === 0) { alert("Please add at least one asset to the batch."); return; }
      if(!formData.clientId || !formData.startDate || !formData.endDate) { alert("Please fill in Client and Date fields."); return; }

      const createdContractIds: string[] = [];
      const invoiceItems: { description: string; amount: number }[] = [];
      const createdContracts: Contract[] = [];
      let totalSubtotal = 0;

      // Create Contracts
      batchItems.forEach(item => {
          const contractId = `C-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
          const subtotal = (item.monthlyRate * 12) + item.installationCost + item.printingCost; // Basic annual est for value, but invoice is monthly
          const vat = formData.hasVat ? subtotal * VAT_RATE : 0;
          
          const contract: Contract = {
              id: contractId,
              clientId: formData.clientId,
              billboardId: item.billboardId,
              startDate: formData.startDate,
              endDate: formData.endDate,
              monthlyRate: item.monthlyRate,
              installationCost: item.installationCost,
              printingCost: item.printingCost,
              hasVat: formData.hasVat,
              totalContractValue: subtotal + vat,
              status: 'Active',
              side: item.side,
              slotNumber: item.slotNumber,
              details: item.details
          };
          
          addContract(contract);
          createdContracts.push(contract);
          createdContractIds.push(contractId);

          // Build Invoice Line Items
          const billboardName = getBillboardName(item.billboardId);
          invoiceItems.push({ description: `Rental: ${billboardName} (${item.details})`, amount: item.monthlyRate });
          if(item.installationCost > 0) invoiceItems.push({ description: `Install: ${billboardName}`, amount: item.installationCost });
          if(item.printingCost > 0) invoiceItems.push({ description: `Print: ${billboardName}`, amount: item.printingCost });
          
          totalSubtotal += item.monthlyRate + item.installationCost + item.printingCost;
      });

      // Create Consolidated Invoice
      const invoiceVat = formData.hasVat ? totalSubtotal * VAT_RATE : 0;
      const invoice: Invoice = {
          id: `INV-${Date.now().toString().slice(-5)}`,
          contractIds: createdContractIds, // Link to all created contracts
          clientId: formData.clientId,
          date: new Date().toISOString().split('T')[0],
          items: invoiceItems,
          subtotal: totalSubtotal,
          vatAmount: invoiceVat,
          total: totalSubtotal + invoiceVat,
          status: 'Pending',
          type: 'Invoice'
      };
      
      addInvoice(invoice);
      
      // Cleanup & Feedback
      setRentals(getContracts());
      setBillboards([...getBillboards()]); 
      setIsCreateModalOpen(false);
      resetForm();
      alert(`Batch Successful!\n• ${batchItems.length} Contracts Created (Tracked individually)\n• 1 Consolidated Invoice Generated`);

      // Offer Master Contract PDF
      const client = getClient(formData.clientId);
      if (client) {
          if (confirm("Batch processed. Download Master Agreement PDF containing all assets?")) {
              generateMasterContractPDF(createdContracts, client, getBillboardName);
          }
      }
  };

  const handleSingleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedBillboard?.type === BillboardType.Static) {
        if (!isSideAvailable(formData.side)) {
            alert(`Selected side option (${formData.side}) is no longer available.`);
            return;
        }
    }

    const subtotal = (formData.monthlyRate * 12) + formData.installationCost + formData.printingCost;
    const vat = formData.hasVat ? subtotal * VAT_RATE : 0;
    const rentalId = `C-${Date.now().toString().slice(-4)}`;
    
    let detailText = selectedBillboard?.type === BillboardType.Static 
        ? (formData.side === 'Both' ? "Sides A & B" : `Side ${formData.side}`) 
        : `Slot ${formData.slotNumber}`;

    const rental: Contract = {
        id: rentalId,
        clientId: formData.clientId,
        billboardId: formData.billboardId,
        startDate: formData.startDate,
        endDate: formData.endDate,
        monthlyRate: formData.monthlyRate,
        installationCost: formData.installationCost,
        printingCost: formData.printingCost,
        hasVat: formData.hasVat,
        totalContractValue: subtotal + vat,
        status: 'Active',
        side: selectedBillboard?.type === BillboardType.Static ? formData.side : undefined,
        slotNumber: selectedBillboard?.type === BillboardType.LED ? formData.slotNumber : undefined,
        details: detailText
    };

    addContract(rental);

    const invoiceSubtotal = formData.monthlyRate + formData.installationCost + formData.printingCost;
    const invoiceVat = formData.hasVat ? invoiceSubtotal * VAT_RATE : 0;
    const initialInvoice: Invoice = {
        id: `INV-${Date.now().toString().slice(-5)}`,
        contractId: rentalId,
        clientId: formData.clientId,
        date: new Date().toISOString().split('T')[0],
        items: [
            { description: `Rental: ${selectedBillboard?.name} (${rental.details}) - Month 1`, amount: formData.monthlyRate },
            ...(formData.installationCost > 0 ? [{ description: 'Installation Fee', amount: formData.installationCost }] : []),
            ...(formData.printingCost > 0 ? [{ description: 'Printing Costs', amount: formData.printingCost }] : [])
        ],
        subtotal: invoiceSubtotal,
        vatAmount: invoiceVat,
        total: invoiceSubtotal + invoiceVat,
        status: 'Pending',
        type: 'Invoice'
    };
    addInvoice(initialInvoice);
    
    setRentals(getContracts());
    setBillboards([...getBillboards()]);
    setIsCreateModalOpen(false);
    resetForm();
    alert("Success! Rental Active & Initial Invoice Generated.");
  };

  const resetForm = () => {
      setFormData({ clientId: '', billboardId: '', side: 'A', slotNumber: 1, startDate: '', endDate: '', monthlyRate: 0, installationCost: 0, printingCost: 0, hasVat: true });
      setBatchItems([]);
      setIsBatchMode(false);
  };

  const handleGenerateProposal = async () => {
    if (!formData.clientId || !formData.billboardId) { alert("Please select a Client and Billboard first."); return; }
    setIsGenerating(true);
    const client = getClient(formData.clientId)!;
    const billboard = getBillboard(formData.billboardId)!;
    const proposal = await generateRentalProposal(client, billboard, formData.monthlyRate);
    setAiProposal(proposal);
    setIsGenerating(false);
  };

  const confirmDelete = () => {
      if (rentalToDelete) {
          deleteContract(rentalToDelete.id);
          setRentals(getContracts());
          setBillboards([...getBillboards()]); 
          setRentalToDelete(null);
      }
  };

  const handleDownloadActiveReport = () => {
      generateActiveRentalsPDF(rentals, getClientName, getBillboardName);
  };

  return (
    <>
      <div className="space-y-8 animate-fade-in">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-slate-900 to-slate-600 mb-2">Rentals Module</h2>
            <p className="text-slate-500 font-medium text-sm sm:text-base">Active contracts, renewals, and availability</p>
          </div>
          <div className="flex gap-3">
            <button onClick={handleDownloadActiveReport} className="bg-white border border-slate-200 text-slate-600 px-4 py-3 rounded-full text-sm font-bold uppercase tracking-wider hover:bg-slate-50 shadow-sm transition-all flex items-center gap-2">
                <FileDown size={18} /> Active Rentals PDF
            </button>
            <button onClick={() => setIsCreateModalOpen(true)} className="bg-slate-900 text-white px-5 py-3 rounded-full text-sm font-bold uppercase tracking-wider hover:bg-slate-800 shadow-lg hover:shadow-xl transition-all hover:scale-105 flex items-center gap-2">
                <Plus size={18} /> <span className="hidden sm:inline">New Rental</span><span className="sm:hidden">New</span>
            </button>
          </div>
        </div>

        <div className="grid gap-4">
          {rentals.map(contract => (
            <div key={contract.id} className="bg-white rounded-2xl p-4 sm:p-6 border border-slate-100 shadow-sm hover:shadow-xl transition-all flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 group hover:-translate-y-0.5 duration-300">
              <div className="flex items-start gap-4 w-full lg:w-auto">
                <div className="p-3 sm:p-4 bg-indigo-50 rounded-2xl group-hover:bg-indigo-600 transition-colors group-hover:text-white text-indigo-600 shrink-0">
                  <FileText className="w-5 h-5 sm:w-6 sm:h-6" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-bold text-slate-900 text-base sm:text-lg truncate">{getClientName(contract.clientId)}</h3>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 text-xs sm:text-sm text-slate-500 mt-1">
                    <span className="font-medium text-slate-700 truncate">{getBillboardName(contract.billboardId)}</span>
                    <span className="hidden sm:inline text-slate-300">•</span>
                    <span className={`font-bold px-2 py-0.5 rounded text-[10px] sm:text-xs w-fit ${contract.side ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'}`}>
                      {contract.details}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-2 sm:mt-3 text-[10px] sm:text-xs text-slate-400 uppercase tracking-wide font-medium flex-wrap">
                    <span className="flex items-center gap-1"><Calendar size={12} /> {contract.startDate} — {contract.endDate}</span>
                    <span>ID: {contract.id}</span>
                  </div>
                </div>
              </div>

              <div className="flex flex-row lg:flex-col lg:items-end gap-2 w-full lg:w-auto pl-0 lg:pl-16 justify-between lg:justify-start items-center">
                <div className="flex flex-col lg:items-end">
                    <div className="flex items-center gap-2">
                        <span className="text-xs sm:text-sm text-slate-400 font-medium hidden sm:inline">Value:</span>
                        <span className="text-lg sm:text-2xl font-bold text-slate-900 tracking-tight">${contract.totalContractValue.toLocaleString()}</span>
                    </div>
                    <div className="flex gap-2 text-[10px] text-slate-500 uppercase tracking-wide">
                        {contract.monthlyRate > 0 && <span>${contract.monthlyRate}/mo</span>}
                    </div>
                </div>
                
                <div className="flex gap-2">
                    <button onClick={() => setSelectedRental(contract)} className="px-3 py-2 text-[10px] sm:text-xs font-bold uppercase tracking-wider text-slate-500 hover:text-slate-900 hover:bg-slate-50 rounded-lg transition-colors flex items-center gap-1">
                        <Eye size={14} /> <span className="hidden sm:inline">View</span>
                    </button>
                    <button onClick={() => { const client = getClient(contract.clientId); if(client) generateContractPDF(contract, client, getBillboardName(contract.billboardId)); }} className="px-3 py-2 text-[10px] sm:text-xs font-bold uppercase tracking-wider text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors flex items-center gap-1 shadow-lg hover:shadow-slate-500/30">
                        <Download size={14} /> <span className="hidden sm:inline">PDF</span>
                    </button>
                    <button onClick={() => setRentalToDelete(contract)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors" title="Delete Rental">
                        <Trash2 size={16} />
                    </button>
                </div>
              </div>
            </div>
          ))}
          {rentals.length === 0 && (
              <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-slate-200">
                  <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                      <FileText className="text-slate-300" size={32}/>
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 mb-1">No Active Rentals</h3>
                  <p className="text-slate-500 text-sm">Create a new rental agreement to get started.</p>
              </div>
          )}
        </div>
      </div>

      {isCreateModalOpen && (
        <div className="fixed inset-0 z-[200] overflow-y-auto">
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md transition-opacity" onClick={() => { setIsCreateModalOpen(false); resetForm(); }} />
            <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
                <div className={`relative transform overflow-hidden rounded-3xl bg-white text-left shadow-2xl transition-all sm:my-8 w-full ${isBatchMode ? 'max-w-5xl' : 'max-w-4xl'} border border-white/20`}>
                    
                    {/* Modal Header with Mode Toggle */}
                    <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-white/50 sticky top-0 z-10">
                        <div className="flex items-center gap-4">
                            <h3 className="text-xl font-bold text-slate-900">New Rental</h3>
                            <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200">
                                <button onClick={() => setIsBatchMode(false)} className={`px-3 py-1 text-xs font-bold uppercase rounded-md transition-all ${!isBatchMode ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}>Single Asset</button>
                                <button onClick={() => setIsBatchMode(true)} className={`px-3 py-1 text-xs font-bold uppercase rounded-md transition-all flex items-center gap-1 ${isBatchMode ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}><Layers size={12}/> Batch Mode</button>
                            </div>
                        </div>
                        <button onClick={() => { setIsCreateModalOpen(false); resetForm(); }} className="p-2 hover:bg-slate-100 rounded-full transition-colors"><X size={20} className="text-slate-400" /></button>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2">
                        {/* Form Side */}
                        <div className={`p-6 sm:p-8 space-y-6 sm:space-y-8 border-r border-slate-100 ${isBatchMode ? 'lg:col-span-2' : ''}`}>
                            <form onSubmit={isBatchMode ? (e) => e.preventDefault() : handleSingleCreate}>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                                    <MinimalSelect label="Select Client" value={formData.clientId} onChange={(e: any) => setFormData(prev => ({...prev, clientId: e.target.value}))} options={[{value: '', label: 'Select Client...'}, ...mockClients.map(c => ({value: c.id, label: c.companyName}))]} disabled={isBatchMode && batchItems.length > 0} />
                                    
                                    <div className="flex gap-4">
                                        <MinimalInput label="Start Date" type="date" value={formData.startDate} onChange={(e: any) => setFormData(prev => ({...prev, startDate: e.target.value}))} required disabled={isBatchMode && batchItems.length > 0} />
                                        <MinimalInput label="End Date" type="date" value={formData.endDate} onChange={(e: any) => setFormData(prev => ({...prev, endDate: e.target.value}))} required disabled={isBatchMode && batchItems.length > 0} />
                                    </div>
                                </div>

                                <div className={`p-6 bg-slate-50 rounded-2xl border border-slate-100 space-y-6 ${isBatchMode ? 'mb-8' : ''}`}>
                                    <div className="flex justify-between items-center">
                                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">{isBatchMode ? 'Add Asset to Batch' : 'Asset Details'}</h4>
                                        {isBatchMode && <span className="text-[10px] text-slate-400 font-medium">Step 2: Build Cart</span>}
                                    </div>
                                    
                                    <MinimalSelect 
                                        label="Select Billboard" 
                                        value={formData.billboardId} 
                                        onChange={(e: React.ChangeEvent<HTMLSelectElement>) => { 
                                            const val = e.target.value;
                                            setFormData(prev => ({...prev, billboardId: val})); 
                                        }} 
                                        options={[{value: '', label: 'Select Billboard...'}, ...billboards.map(b => ({value: b.id, label: `${b.name} (${b.type})`}))]} 
                                    />

                                    {selectedBillboard && (
                                        <>
                                            {!isBatchMode && (
                                                <div className="bg-indigo-50/50 p-4 rounded-xl border border-indigo-100 text-sm text-indigo-800 animate-fade-in">
                                                    <div className="flex items-center gap-2 font-bold mb-1"><Sparkles size={14}/> <span>Visibility Insight</span></div>
                                                    <p className="opacity-80 leading-relaxed text-xs">{selectedBillboard.visibility || "No data."}</p>
                                                </div>
                                            )}

                                            {selectedBillboard.type === BillboardType.Static && (
                                                <div className="flex flex-col sm:flex-row gap-4">
                                                    {(['A', 'B', 'Both'] as const).map(side => {
                                                        const available = isSideAvailable(side);
                                                        let price = 0;
                                                        if(side === 'A') price = selectedBillboard.sideARate || 0;
                                                        else if(side === 'B') price = selectedBillboard.sideBRate || 0;
                                                        else price = (selectedBillboard.sideARate || 0) + (selectedBillboard.sideBRate || 0);

                                                        const isSelected = formData.side === side;
                                                        return (
                                                            <label key={side} className={`flex-1 relative cursor-pointer border rounded-xl p-3 text-center transition-all ${!available ? 'opacity-40 bg-slate-100 cursor-not-allowed border-slate-100' : isSelected ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500 shadow-sm' : 'border-slate-200 hover:border-slate-300'}`}>
                                                                <input type="radio" name="side" className="hidden" disabled={!available} checked={isSelected} onChange={() => available && setFormData(prev => ({...prev, side, monthlyRate: price}))} />
                                                                <div className="font-bold text-slate-800">{side === 'Both' ? 'Both A&B' : `Side ${side}`}</div>
                                                                <div className="text-xs text-slate-500">${price.toLocaleString()}</div>
                                                                {!available && <div className="text-[10px] text-red-500 font-bold uppercase mt-1">Occupied</div>}
                                                                {isSelected && <div className="absolute top-2 right-2 text-blue-500"><CheckCircle size={14}/></div>}
                                                            </label>
                                                        )
                                                    })}
                                                </div>
                                            )}
                                            {selectedBillboard.type === BillboardType.LED && (
                                                <MinimalSelect label="Select Slot" value={formData.slotNumber} onChange={(e: any) => setFormData(prev => ({...prev, slotNumber: Number(e.target.value)}))} options={Array.from({length: selectedBillboard.totalSlots || 10}, (_, i) => ({value: i+1, label: `Slot ${i+1}`}))} />
                                            )}

                                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                                                <MinimalInput label="Monthly Rate ($)" type="number" value={formData.monthlyRate} onChange={(e: any) => setFormData(prev => ({...prev, monthlyRate: Number(e.target.value)}))} />
                                                <MinimalInput label="Install Fee ($)" type="number" value={formData.installationCost} onChange={(e: any) => setFormData(prev => ({...prev, installationCost: Number(e.target.value)}))} />
                                                <MinimalInput label="Print Cost ($)" type="number" value={formData.printingCost} onChange={(e: any) => setFormData(prev => ({...prev, printingCost: Number(e.target.value)}))} />
                                            </div>
                                        </>
                                    )}
                                    
                                    {isBatchMode && (
                                        <div className="flex justify-end items-center gap-3 border-t border-slate-200 pt-4">
                                            {batchItems.length > 0 && (
                                                <span className="text-xs text-slate-400">Add asset to cart below</span>
                                            )}
                                            <button onClick={addToBatch} disabled={!selectedBillboard} className="bg-slate-900 text-white px-6 py-2 rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-slate-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md">
                                                Add to Batch Cart
                                            </button>
                                        </div>
                                    )}
                                </div>

                                {isBatchMode && batchItems.length > 0 && (
                                    <div className="mb-8 animate-fade-in bg-slate-50 p-4 rounded-2xl border border-slate-200">
                                        <div className="flex items-center gap-2 mb-4">
                                            <ShoppingCart size={18} className="text-indigo-600"/>
                                            <h4 className="text-sm font-bold text-slate-900">Batch Cart ({batchItems.length} Items)</h4>
                                        </div>
                                        <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
                                            <table className="w-full text-left text-xs text-slate-600">
                                                <thead className="bg-slate-50 border-b border-slate-200 font-bold uppercase text-slate-400">
                                                    <tr>
                                                        <th className="px-4 py-3">Asset</th>
                                                        <th className="px-4 py-3">Details</th>
                                                        <th className="px-4 py-3 text-right">Monthly</th>
                                                        <th className="px-4 py-3 text-center">Action</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-100">
                                                    {batchItems.map((item) => (
                                                        <tr key={item.tempId} className="hover:bg-slate-50/50">
                                                            <td className="px-4 py-3 font-bold text-slate-800">{getBillboardName(item.billboardId)}</td>
                                                            <td className="px-4 py-3">{item.details}</td>
                                                            <td className="px-4 py-3 text-right">${item.monthlyRate.toLocaleString()}</td>
                                                            <td className="px-4 py-3 text-center">
                                                                <button onClick={() => removeFromBatch(item.tempId)} className="text-red-400 hover:text-red-600 p-1"><MinusCircle size={16}/></button>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                    <tr className="bg-slate-50 font-bold text-slate-900">
                                                        <td className="px-4 py-3 text-right" colSpan={2}>Total Monthly:</td>
                                                        <td className="px-4 py-3 text-right">${batchItems.reduce((acc, i) => acc + i.monthlyRate, 0).toLocaleString()}</td>
                                                        <td></td>
                                                    </tr>
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                )}

                                <div className="flex items-center gap-2 mb-6">
                                    <input type="checkbox" checked={formData.hasVat} onChange={e => setFormData(prev => ({...prev, hasVat: e.target.checked}))} className="rounded border-slate-300 text-slate-900 focus:ring-slate-900"/>
                                    <label className="text-sm font-medium text-slate-600">Include VAT (15%) in final Invoice</label>
                                </div>

                                {isBatchMode ? (
                                    <button type="button" onClick={handleBatchCreate} className="w-full py-4 text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 flex items-center justify-center gap-2 shadow-xl shadow-indigo-200 font-bold uppercase tracking-wider transition-all hover:scale-[1.01]">
                                        <Layers size={18} /> Confirm Batch & Generate Docs
                                    </button>
                                ) : (
                                    <button type="submit" className="w-full py-4 text-white bg-slate-900 rounded-xl hover:bg-slate-800 flex items-center justify-center gap-2 shadow-xl font-bold uppercase tracking-wider transition-all hover:scale-[1.01]">
                                        Generate Contract & Invoice
                                    </button>
                                )}
                            </form>
                        </div>

                        {/* AI / Info Side - Only visible in Single Mode */}
                        {!isBatchMode && (
                            <div className="p-8 bg-slate-50/50 flex flex-col">
                                <div className="flex items-center gap-2 mb-4">
                                    <div className="p-2 bg-purple-100 rounded-lg text-purple-600"><Wand2 size={20}/></div>
                                    <div>
                                        <h4 className="font-bold text-slate-800">AI Proposal Draft</h4>
                                        <p className="text-xs text-slate-500">Generate a pitch email for this rental</p>
                                    </div>
                                </div>
                                <div className="flex-1 bg-white rounded-xl border border-slate-200 p-4 shadow-inner mb-4 overflow-y-auto min-h-[200px] text-sm text-slate-600 whitespace-pre-wrap leading-relaxed">
                                    {aiProposal || "Select a client and billboard, then click 'Generate' to create a professional pitch draft..."}
                                </div>
                                <button type="button" onClick={handleGenerateProposal} disabled={isGenerating} className="w-full py-3 bg-white border border-slate-200 text-slate-700 font-bold uppercase tracking-wider rounded-xl hover:bg-slate-50 transition-colors flex items-center justify-center gap-2">
                                    {isGenerating ? <RefreshCw size={16} className="animate-spin"/> : <Wand2 size={16} />} {isGenerating ? 'Drafting...' : 'Generate Proposal'}
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
      )}

      {rentalToDelete && (
        <div className="fixed inset-0 z-[200] overflow-y-auto">
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md transition-opacity" onClick={() => setRentalToDelete(null)} />
          <div className="flex min-h-full items-center justify-center p-4 text-center">
              <div className="relative transform overflow-hidden rounded-2xl bg-white text-left shadow-2xl transition-all sm:my-8 sm:w-full sm:max-w-sm border border-white/20 p-6 text-center">
                 <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4 border-4 border-red-50">
                    <AlertTriangle className="text-red-500" size={32} />
                 </div>
                 <h3 className="text-xl font-bold text-slate-900 mb-2">Delete Rental?</h3>
                 <p className="text-slate-500 mb-6 text-sm">
                   Are you sure you want to delete the rental agreement for <span className="font-bold text-slate-700">{getClientName(rentalToDelete.clientId)}</span>?
                 </p>
                 <div className="flex gap-3">
                   <button onClick={() => setRentalToDelete(null)} className="flex-1 py-3 text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl font-bold uppercase text-xs tracking-wider transition-colors">Cancel</button>
                   <button onClick={confirmDelete} className="flex-1 py-3 text-white bg-red-500 hover:bg-red-600 rounded-xl font-bold uppercase text-xs tracking-wider transition-colors shadow-lg shadow-red-500/30">Delete</button>
                 </div>
              </div>
          </div>
        </div>
      )}
    </>
  );
};
