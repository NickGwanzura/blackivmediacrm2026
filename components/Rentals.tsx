
import React, { useState, useEffect } from 'react';
import { getContracts, getBillboards, addContract, addInvoice, mockClients, deleteContract, getDefaultCurrency, updateContract, setContractStatus } from '../services/mockData';
import { useToast } from './Toast';
import { generateContractPDF, generateMasterContractPDF, generateActiveRentalsPDF } from '../services/pdfGenerator';
import { emailContract } from '../services/emailService';
import { generateRentalProposal } from '../services/aiService';
import { Contract, BillboardType, VAT_RATE, Invoice, Currency, CURRENCIES } from '../types';
import { FileText, Calendar, Download, Eye, Plus, Wand2, RefreshCw, CheckCircle, Trash2, Sparkles, Layers, ShoppingCart, MinusCircle, FileDown, Mail, Loader2, Receipt, PencilLine, AlertTriangle, Archive, Save } from 'lucide-react';
import { AccessibleModal, ModalButton } from './ui/AccessibleModal';
import { FormInput, FormSelect, FormNumber, FormDate, FormSection, FormCheckbox } from './ui/Form';
import { formatCurrency } from '../utils/sanitizers';
import { computeContractValue, monthsBetween } from '../utils/contractMath';

const STATUS_STYLES: Record<Contract['status'], string> = {
  Active: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  Pending: 'bg-amber-50 text-amber-700 border-amber-100',
  Expired: 'bg-rose-50 text-rose-700 border-rose-100',
  Archived: 'bg-slate-100 text-slate-600 border-slate-200',
};



// Define type for batch items
interface BatchItem {
    billboardId: string;
    side: 'A' | 'B' | 'Both' | undefined;
    slotNumber: number | undefined;
    monthlyRate: number;
    installationCost: number;
    printingCost: number;
    currency: Currency;
    details: string;
    tempId: number; // For identifying in cart
}

export const Rentals: React.FC = () => {
  const toast = useToast();
  const [rentals, setRentals] = useState<Contract[]>(getContracts());
  const [selectedRental, setSelectedRental] = useState<Contract | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [rentalToDelete, setRentalToDelete] = useState<Contract | null>(null);
  // Edit in-place: clone into state so a cancelled edit leaves the list
  // untouched. Totals are recomputed from the staged clone on submit via
  // computeContractValue so the saved row is always internally consistent.
  const [editingContract, setEditingContract] = useState<Contract | null>(null);
  const [aiProposal, setAiProposal] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [billboards, setBillboards] = useState(getBillboards()); // Local state to ensure freshness
  
  // Mode State
  const [isBatchMode, setIsBatchMode] = useState(false);
  const [batchItems, setBatchItems] = useState<BatchItem[]>([]);
  const [emailingContractId, setEmailingContractId] = useState<string | null>(null);

  // Shared form state
  const [formData, setFormData] = useState({
    clientId: '',
    startDate: '',
    endDate: '',
    hasVat: true,
    // Single mode specific (or current batch item specific).
    // Currency is inherited from the selected billboard and snapshotted onto
    // the contract at save time so later repricing of the billboard doesn't
    // silently change historical contract denominations.
    billboardId: '',
    side: 'A' as 'A' | 'B' | 'Both',
    slotNumber: 1,
    monthlyRate: 0,
    installationCost: 0,
    printingCost: 0,
    currency: getDefaultCurrency() as Currency,
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

  const handleEmailContract = async (contract: Contract) => {
    const client = getClient(contract.clientId);
    if (!client) { toast.error('Client not found for this contract.'); return; }
    if (!client.email) { toast.warning(`No email address on file for ${client.companyName}.`); return; }
    setEmailingContractId(contract.id);
    const result = await emailContract(contract, client, getBillboardName(contract.billboardId));
    setEmailingContractId(null);
    if (result.success) { toast.success(`Contract emailed to ${client.email}.`); } else { toast.error(`Email failed: ${result.message}`); }
  };

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
    const inheritedCurrency = (selectedBillboard?.currency || getDefaultCurrency()) as Currency;
    if (selectedBillboard?.type === BillboardType.Static) {
        // Simple logic: default to A if available, else B, else none
        const aFree = isSideAvailable('A', selectedBillboard);
        const bFree = isSideAvailable('B', selectedBillboard);

        let autoSide: 'A' | 'B' | 'Both' = 'A';
        let rate = 0;

        if (aFree) { autoSide = 'A'; rate = selectedBillboard.sideARate || 0; }
        else if (bFree) { autoSide = 'B'; rate = selectedBillboard.sideBRate || 0; }
        else { rate = 0; } // All occupied or in cart

        setFormData(prev => ({ ...prev, side: autoSide, monthlyRate: rate, currency: inheritedCurrency }));
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
            slotNumber: nextSlot,
            currency: inheritedCurrency,
        }));
    }
  }, [formData.billboardId, selectedBillboard, batchItems]); // Added batchItems to re-eval if cart changes

  const addToBatch = () => {
      if (!selectedBillboard) return;

      if (selectedBillboard.type === BillboardType.Static && !isSideAvailable(formData.side)) {
          toast.warning("Selected side is not available or already in cart.");
          return;
      }

      // Prevent adding same asset configuration twice
      const isDuplicate = batchItems.some(item =>
          item.billboardId === formData.billboardId &&
          item.side === formData.side &&
          item.slotNumber === formData.slotNumber
      );

      if (isDuplicate) {
          toast.warning("This asset configuration is already in your batch cart.");
          return;
      }

      // A consolidated invoice can only carry one currency — reject an
      // item whose denomination differs from items already in the cart.
      // Currency comes from the user's in-form choice (pre-filled from the
      // billboard) so an override in the selector is honoured. Users needing
      // mixed-currency rentals run one batch per currency.
      const itemCurrency = (formData.currency || selectedBillboard.currency || getDefaultCurrency()) as Currency;
      if (batchItems.length > 0 && batchItems[0].currency !== itemCurrency) {
          toast.warning(`Batch is ${batchItems[0].currency}; this item is in ${itemCurrency}. Create a separate batch for the other currency.`);
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
          currency: itemCurrency,
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
              slotNumber: 1,
              // keep currency pinned to the batch's currency so subsequent
              // picks stay in the right denomination
              currency: prev.currency,
          }));
      }, 50);
  };

  const removeFromBatch = (tempId: number) => {
      setBatchItems(prev => prev.filter(i => i.tempId !== tempId));
  };

  const handleBatchCreate = async () => {
      if (batchItems.length === 0) { toast.warning("Please add at least one asset to the batch."); return; }
      if (!formData.clientId || !formData.startDate || !formData.endDate) { toast.warning("Please fill in Client and Date fields."); return; }
      if (monthsBetween(formData.startDate, formData.endDate) <= 0) { toast.warning('End date must be after start date.'); return; }

      const createdContractIds: string[] = [];
      const invoiceItems: { description: string; amount: number }[] = [];
      const createdContracts: Contract[] = [];
      let totalSubtotal = 0;
      // addToBatch enforces a single-currency batch, so every item carries
      // the same currency — snapshot the first one onto each contract and
      // the consolidated invoice.
      const batchCurrency: Currency = batchItems[0].currency;

      // Create Contracts
      batchItems.forEach(item => {
          const contractId = `C-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
          const contract: Contract = {
              id: contractId,
              clientId: formData.clientId,
              billboardId: item.billboardId,
              startDate: formData.startDate,
              endDate: formData.endDate,
              currency: item.currency,
              monthlyRate: item.monthlyRate,
              installationCost: item.installationCost,
              printingCost: item.printingCost,
              hasVat: formData.hasVat,
              totalContractValue: computeContractValue({
                  startDate: formData.startDate,
                  endDate: formData.endDate,
                  monthlyRate: item.monthlyRate,
                  installationCost: item.installationCost,
                  printingCost: item.printingCost,
                  hasVat: formData.hasVat,
              }),
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
          currency: batchCurrency,
          items: invoiceItems,
          subtotal: totalSubtotal,
          vatAmount: invoiceVat,
          total: totalSubtotal + invoiceVat,
          status: 'Pending',
          type: 'Invoice'
      };
      
      addInvoice(invoice);
      
      // Cleanup & Feedback
      const batchCount = batchItems.length;
      const batchClient = getClient(formData.clientId);
      setRentals(getContracts());
      setBillboards([...getBillboards()]);
      setIsCreateModalOpen(false);
      resetForm();
      toast.success(`Batch Successful!\n• ${batchCount} Contracts Created (Tracked individually)\n• 1 Consolidated Invoice Generated`);

      // Offer Master Contract PDF
      if (batchClient) {
          const downloadPdf = await toast.confirm({ message: "Download Master Agreement PDF containing all assets?", title: "Batch Processed", variant: 'default', confirmLabel: 'Download PDF' });
          if (downloadPdf) {
              generateMasterContractPDF(createdContracts, batchClient, getBillboardName);
          }
      }
  };

  const handleSingleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedBillboard?.type === BillboardType.Static) {
        if (!isSideAvailable(formData.side)) {
            toast.warning(`Selected side option (${formData.side}) is no longer available.`);
            return;
        }
    }
    if (monthsBetween(formData.startDate, formData.endDate) <= 0) {
        toast.warning('End date must be after start date.');
        return;
    }

    const rentalId = `C-${Date.now().toString().slice(-4)}`;
    
    let detailText = selectedBillboard?.type === BillboardType.Static 
        ? (formData.side === 'Both' ? "Sides A & B" : `Side ${formData.side}`) 
        : `Slot ${formData.slotNumber}`;

    // Prefer the user's in-form choice so an override in the Currency
    // selector actually wins; fall back to the billboard's currency, then
    // the company default for orphaned cases.
    const contractCurrency = (formData.currency || selectedBillboard?.currency || getDefaultCurrency()) as Currency;
    const rental: Contract = {
        id: rentalId,
        clientId: formData.clientId,
        billboardId: formData.billboardId,
        startDate: formData.startDate,
        endDate: formData.endDate,
        currency: contractCurrency,
        monthlyRate: formData.monthlyRate,
        installationCost: formData.installationCost,
        printingCost: formData.printingCost,
        hasVat: formData.hasVat,
        totalContractValue: computeContractValue({
            startDate: formData.startDate,
            endDate: formData.endDate,
            monthlyRate: formData.monthlyRate,
            installationCost: formData.installationCost,
            printingCost: formData.printingCost,
            hasVat: formData.hasVat,
        }),
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
        currency: contractCurrency,
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
    toast.success("Rental active & initial invoice generated.");
  };

  const resetForm = () => {
      setFormData({ clientId: '', billboardId: '', side: 'A', slotNumber: 1, startDate: '', endDate: '', monthlyRate: 0, installationCost: 0, printingCost: 0, hasVat: true, currency: getDefaultCurrency() });
      setBatchItems([]);
      setIsBatchMode(false);
  };

  const handleGenerateProposal = async () => {
    if (!formData.clientId || !formData.billboardId) { toast.warning("Please select a Client and Billboard first."); return; }
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

  // Edit / status transitions. Mirrors ContractList.tsx so both surfaces use
  // the same service helpers (updateContract / setContractStatus) and keep
  // billboard occupancy in sync via syncBillboardAvailability.
  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingContract) return;
    const next: Contract = { ...editingContract, totalContractValue: computeContractValue(editingContract) };
    updateContract(next);
    setRentals(getContracts());
    setBillboards([...getBillboards()]);
    setEditingContract(null);
    toast.success(`Contract ${next.id} updated.`);
  };

  const handleMarkExpired = async (contract: Contract) => {
    if (contract.status === 'Expired') return;
    const ok = await toast.confirm({
      title: 'Mark as Expired',
      message: `Mark contract ${contract.id} for ${getClientName(contract.clientId)} as Expired? This frees the asset for re-rental.`,
      variant: 'default',
      confirmLabel: 'Mark Expired',
    });
    if (!ok) return;
    setContractStatus(contract.id, 'Expired');
    setRentals(getContracts());
    setBillboards([...getBillboards()]);
    toast.success(`Contract ${contract.id} marked Expired.`);
  };

  const handleArchive = async (contract: Contract) => {
    if (contract.status === 'Archived') return;
    const ok = await toast.confirm({
      title: 'Archive Contract',
      message: `Archive contract ${contract.id}? It will be hidden from Rentals. Restore it from Contracts → Archived.`,
      variant: 'default',
      confirmLabel: 'Archive',
    });
    if (!ok) return;
    setContractStatus(contract.id, 'Archived');
    setRentals(getContracts());
    setBillboards([...getBillboards()]);
    toast.success(`Contract ${contract.id} archived.`);
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
          {/* Archived contracts are hidden from Rentals (use Contracts → Archived to restore).
              Rentals is the "what's live right now" view; anything Archived shouldn't clutter it. */}
          {rentals.filter(c => c.status !== 'Archived').map(contract => (
            <div key={contract.id} className="bg-white rounded-2xl p-4 sm:p-6 border border-slate-100 shadow-sm hover:shadow-xl transition-all flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 group hover:-translate-y-0.5 duration-300">
              <div className="flex items-start gap-4 w-full lg:w-auto">
                <div className="p-3 sm:p-4 bg-indigo-50 rounded-2xl group-hover:bg-indigo-600 transition-colors group-hover:text-white text-indigo-600 shrink-0">
                  <FileText className="w-5 h-5 sm:w-6 sm:h-6" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-bold text-slate-900 text-base sm:text-lg truncate">{getClientName(contract.clientId)}</h3>
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${STATUS_STYLES[contract.status]}`}>{contract.status}</span>
                  </div>
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
                        <span className="text-lg sm:text-2xl font-bold text-slate-900 tracking-tight" title={`Currency: ${contract.currency || 'USD'}`}>{formatCurrency(contract.totalContractValue, contract.currency)}</span>
                    </div>
                    <div className="flex gap-2 text-[10px] text-slate-500 uppercase tracking-wide">
                        {contract.monthlyRate > 0 && <span>{formatCurrency(contract.monthlyRate, contract.currency)}/mo</span>}
                    </div>
                </div>
                
                <div className="flex gap-2 flex-wrap justify-end">
                    <button onClick={() => setSelectedRental(contract)} className="px-3 py-2 text-[10px] sm:text-xs font-bold uppercase tracking-wider text-slate-500 hover:text-slate-900 hover:bg-slate-50 rounded-lg transition-colors flex items-center gap-1">
                        <Eye size={14} /> <span className="hidden sm:inline">View</span>
                    </button>
                    <button onClick={() => setEditingContract({ ...contract })} className="px-3 py-2 text-[10px] sm:text-xs font-bold uppercase tracking-wider text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 rounded-lg transition-colors flex items-center gap-1" title="Edit Contract">
                        <PencilLine size={14} /> <span className="hidden sm:inline">Edit</span>
                    </button>
                    <button onClick={() => { const client = getClient(contract.clientId); if(client) generateContractPDF(contract, client, getBillboardName(contract.billboardId)); }} className="px-3 py-2 text-[10px] sm:text-xs font-bold uppercase tracking-wider text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors flex items-center gap-1 shadow-lg hover:shadow-slate-500/30">
                        <Download size={14} /> <span className="hidden sm:inline">PDF</span>
                    </button>
                    <button onClick={() => handleEmailContract(contract)} disabled={emailingContractId === contract.id} title={(() => { const c = getClient(contract.clientId); return c?.email ? `Email to ${c.email}` : 'No client email on file'; })()} className="px-3 py-2 text-[10px] sm:text-xs font-bold uppercase tracking-wider text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors flex items-center gap-1 disabled:opacity-50">
                        {emailingContractId === contract.id ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />} <span className="hidden sm:inline">Email</span>
                    </button>
                    {contract.status === 'Active' && (
                        <button onClick={() => handleMarkExpired(contract)} className="px-3 py-2 text-[10px] sm:text-xs font-bold uppercase tracking-wider text-rose-600 bg-white border border-rose-100 hover:bg-rose-50 rounded-lg transition-colors flex items-center gap-1" title="Mark as Expired (frees the asset)">
                            <AlertTriangle size={14} /> <span className="hidden sm:inline">Expire</span>
                        </button>
                    )}
                    <button onClick={() => handleArchive(contract)} className="px-3 py-2 text-[10px] sm:text-xs font-bold uppercase tracking-wider text-slate-500 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors flex items-center gap-1" title="Archive Contract">
                        <Archive size={14} /> <span className="hidden sm:inline">Archive</span>
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

      <AccessibleModal
        isOpen={isCreateModalOpen}
        onClose={() => { setIsCreateModalOpen(false); resetForm(); }}
        title="New Rental Contract"
        icon={<Receipt size={20} />}
        size="xxl"
        variant="default"
        closeOnOverlayClick={false}
        mobileLayout="sheet"
        footer={
          <>
            <ModalButton variant="secondary" onClick={() => { setIsCreateModalOpen(false); resetForm(); }}>
              Cancel
            </ModalButton>
            <ModalButton
              variant="primary"
              onClick={isBatchMode ? handleBatchCreate : undefined}
              type={isBatchMode ? 'button' : 'submit'}
              form={isBatchMode ? undefined : 'rental-create-form'}
            >
              {isBatchMode ? <><Layers size={14} /> Create Batch</> : 'Create Rental'}
            </ModalButton>
          </>
        }
      >
        {/* Single/Batch mode toggle — placed at top of body so it's visually connected to the form it controls */}
        <div className="flex items-center gap-3 pb-4 mb-2 border-b border-slate-100">
            <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200">
                <button type="button" onClick={() => setIsBatchMode(false)} className={`px-3 py-1 text-xs font-bold uppercase rounded-md transition-all ${!isBatchMode ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}>Single Asset</button>
                <button type="button" onClick={() => setIsBatchMode(true)} className={`px-3 py-1 text-xs font-bold uppercase rounded-md transition-all flex items-center gap-1 ${isBatchMode ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}><Layers size={12}/> Batch Mode</button>
            </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2">
            {/* Form Side */}
            <div className={`space-y-6 sm:space-y-8 pr-0 lg:pr-8 lg:border-r border-slate-100 ${isBatchMode ? 'lg:col-span-2' : ''}`}>
                <form id="rental-create-form" onSubmit={isBatchMode ? (e) => e.preventDefault() : handleSingleCreate}>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                        <FormSelect label="Select Client" value={formData.clientId} onChange={(e: any) => setFormData(prev => ({...prev, clientId: e.target.value}))} options={[{value: '', label: 'Select Client...'}, ...mockClients.map(c => ({value: c.id, label: c.companyName}))]} />
                        <FormDate label="Start Date" value={formData.startDate} onChange={(e: any) => setFormData(prev => ({...prev, startDate: e.target.value}))} required />
                        <FormDate label="End Date" value={formData.endDate} onChange={(e: any) => setFormData(prev => ({...prev, endDate: e.target.value}))} required />
                    </div>

                    <div className={`p-6 bg-slate-50 rounded-2xl border border-slate-100 space-y-6 ${isBatchMode ? 'mb-8' : ''}`}>
                        <div className="flex justify-between items-center">
                            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">{isBatchMode ? 'Add Asset to Batch' : 'Asset Details'}</h4>
                            {isBatchMode && <span className="text-[10px] text-slate-400 font-medium">Step 2: Build Cart</span>}
                        </div>

                        <FormSelect
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
                                                    <div className="text-xs text-slate-500">{formatCurrency(price, selectedBillboard.currency)}</div>
                                                    {!available && <div className="text-[10px] text-red-500 font-bold uppercase mt-1">Occupied</div>}
                                                    {isSelected && <div className="absolute top-2 right-2 text-blue-500"><CheckCircle size={14}/></div>}
                                                </label>
                                            )
                                        })}
                                    </div>
                                )}
                                {selectedBillboard.type === BillboardType.LED && (
                                    <FormSelect label="Select Slot" value={formData.slotNumber} onChange={(e: any) => setFormData(prev => ({...prev, slotNumber: Number(e.target.value)}))} options={Array.from({length: selectedBillboard.totalSlots || 10}, (_, i) => ({value: i+1, label: `Slot ${i+1}`}))} />
                                )}

                                <FormSelect
                                    label="Billing Currency"
                                    value={formData.currency || 'USD'}
                                    onChange={(e: any) => setFormData(prev => ({...prev, currency: e.target.value as Currency}))}
                                    options={CURRENCIES.map(c => ({ value: c, label: c }))}
                                    hint={`Pre-filled from billboard (${selectedBillboard.currency || 'USD'}). Override if the contract is billed in a different currency.`}
                                />
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                    <FormNumber label={`Monthly Rate (${formData.currency || 'USD'})`} min={0} value={formData.monthlyRate} onChange={(e: any) => setFormData(prev => ({...prev, monthlyRate: Number(e.target.value)}))} />
                                    <FormNumber label={`Install Fee (${formData.currency || 'USD'})`} min={0} value={formData.installationCost} onChange={(e: any) => setFormData(prev => ({...prev, installationCost: Number(e.target.value)}))} />
                                    <FormNumber label={`Print Cost (${formData.currency || 'USD'})`} min={0} value={formData.printingCost} onChange={(e: any) => setFormData(prev => ({...prev, printingCost: Number(e.target.value)}))} />
                                </div>
                            </>
                        )}

                        {isBatchMode && (
                            <div className="flex justify-end items-center gap-3 border-t border-slate-200 pt-4">
                                {batchItems.length > 0 && (
                                    <span className="text-xs text-slate-400">Add asset to cart below</span>
                                )}
                                <button type="button" onClick={addToBatch} disabled={!selectedBillboard} className="bg-slate-900 text-white px-6 py-2 rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-slate-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md">
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
                                                <td className="px-4 py-3 text-right">{formatCurrency(item.monthlyRate, item.currency)}</td>
                                                <td className="px-4 py-3 text-center">
                                                    <button type="button" onClick={() => removeFromBatch(item.tempId)} className="text-red-400 hover:text-red-600 p-1"><MinusCircle size={16}/></button>
                                                </td>
                                            </tr>
                                        ))}
                                        <tr className="bg-slate-50 font-bold text-slate-900">
                                            <td className="px-4 py-3 text-right" colSpan={2}>Total Monthly ({batchItems[0]?.currency || 'USD'}):</td>
                                            <td className="px-4 py-3 text-right">{formatCurrency(batchItems.reduce((acc, i) => acc + i.monthlyRate, 0), batchItems[0]?.currency)}</td>
                                            <td></td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    <div className="flex items-center gap-2 mb-6 mt-6">
                        <input type="checkbox" checked={formData.hasVat} onChange={e => setFormData(prev => ({...prev, hasVat: e.target.checked}))} className="rounded border-slate-300 text-slate-900 focus:ring-slate-900"/>
                        <label className="text-sm font-medium text-slate-600">Include VAT (15%) in final Invoice</label>
                    </div>
                </form>
            </div>

            {/* AI / Info Side - Only visible in Single Mode */}
            {!isBatchMode && (
                <div className="pt-6 lg:pt-0 lg:pl-8 bg-slate-50/50 flex flex-col">
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
      </AccessibleModal>

      <AccessibleModal
        isOpen={!!rentalToDelete}
        onClose={() => setRentalToDelete(null)}
        size="sm"
        role="alertdialog"
        variant="danger"
        title="Delete Rental?"
        description={`Are you sure you want to delete the rental agreement for ${rentalToDelete ? getClientName(rentalToDelete.clientId) : ''}?`}
        onConfirmKey={confirmDelete}
        footer={
          <>
            <ModalButton variant="secondary" onClick={() => setRentalToDelete(null)}>Cancel</ModalButton>
            <ModalButton variant="danger" onClick={confirmDelete}>Delete</ModalButton>
          </>
        }
      >
        <></>
      </AccessibleModal>

      {/* Edit Rental modal. Editing client/billboard is intentionally
          disabled — those are identity-like anchors used by invoices, the
          occupancy sync, and the billing schedule. Change rate / dates /
          costs / VAT / currency / status here; create a fresh contract if
          the client or asset needs to change. */}
      <AccessibleModal
        isOpen={!!editingContract}
        onClose={() => setEditingContract(null)}
        title={editingContract ? `Edit Rental ${editingContract.id}` : 'Edit Rental'}
        description={editingContract ? `${getClientName(editingContract.clientId)} — ${getBillboardName(editingContract.billboardId)}` : undefined}
        size="lg"
        icon={<PencilLine size={20} />}
        mobileLayout="sheet"
        footer={
          <>
            <ModalButton variant="secondary" onClick={() => setEditingContract(null)}>Cancel</ModalButton>
            <ModalButton variant="primary" type="submit" form="rental-edit-form"><Save size={14} /> Save Changes</ModalButton>
          </>
        }
      >
        {editingContract && (
          <form id="rental-edit-form" onSubmit={handleSaveEdit} className="space-y-6">
            <FormSection title="Contract Duration">
              <FormDate label="Start Date" value={editingContract.startDate} onChange={(e: any) => setEditingContract({ ...editingContract, startDate: e.target.value })} required />
              <FormDate label="End Date" value={editingContract.endDate} onChange={(e: any) => setEditingContract({ ...editingContract, endDate: e.target.value })} required />
            </FormSection>
            <FormSection title="Financial Terms">
              <FormNumber label={`Monthly Rate (${editingContract.currency || 'USD'})`} min={0} value={editingContract.monthlyRate} onChange={(e: any) => setEditingContract({ ...editingContract, monthlyRate: Number(e.target.value) })} required />
              <FormNumber label={`Install Fee (${editingContract.currency || 'USD'})`} min={0} value={editingContract.installationCost} onChange={(e: any) => setEditingContract({ ...editingContract, installationCost: Number(e.target.value) })} />
              <FormNumber label={`Print Cost (${editingContract.currency || 'USD'})`} min={0} value={editingContract.printingCost} onChange={(e: any) => setEditingContract({ ...editingContract, printingCost: Number(e.target.value) })} />
            </FormSection>
            <FormSection title="Status & Details">
              <FormSelect label="Currency" value={editingContract.currency || 'USD'} onChange={(e: any) => setEditingContract({ ...editingContract, currency: e.target.value as Currency })} options={CURRENCIES.map(c => ({ value: c, label: c }))} />
              <FormSelect label="Status" value={editingContract.status} onChange={(e: any) => setEditingContract({ ...editingContract, status: e.target.value as Contract['status'] })} options={[
                { value: 'Active', label: 'Active' },
                { value: 'Pending', label: 'Pending' },
                { value: 'Expired', label: 'Expired' },
                { value: 'Archived', label: 'Archived' },
              ]} />
              <FormInput label="Details" value={editingContract.details} onChange={(e: any) => setEditingContract({ ...editingContract, details: e.target.value })} />
            </FormSection>
            <FormCheckbox
              label={`Apply VAT (${Math.round(VAT_RATE * 100)}%)`}
              checked={editingContract.hasVat}
              onChange={(checked) => setEditingContract({ ...editingContract, hasVat: checked })}
            />
            {/* Live recompute chip so editors see the saved total before they
                commit. Uses the same computeContractValue helper as create so
                both paths produce identical values. */}
            <div className="bg-slate-50 rounded-xl border border-slate-100 p-4 flex justify-between items-center">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Recomputed Total · {monthsBetween(editingContract.startDate, editingContract.endDate).toFixed(1)} months
              </span>
              <span className="text-lg font-bold text-slate-900">{formatCurrency(computeContractValue(editingContract), editingContract.currency)}</span>
            </div>
          </form>
        )}
      </AccessibleModal>
    </>
  );
};
