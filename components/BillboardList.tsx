
import React, { useState, useEffect, useRef } from 'react';
import { Billboard, BillboardType, Client, Contract } from '../types';
import { getBillboards, addBillboard, updateBillboard, deleteBillboard, mockClients, ZIM_TOWNS, getClients, updateClient, bulkAddBillboards, bulkAddClients, bulkAddContracts, bulkUpdateBillboards } from '../services/mockData';
import { estimateLocationDetails } from '../services/aiService';
import { MapPin, X, Edit2, Save, Plus, Image as ImageIcon, Map as MapIcon, Grid as GridIcon, Trash2, AlertTriangle, Share2, Eye, EyeOff, Copy, List as ListIcon, Search, Link2, FileUp, FileDown, Sparkles, Loader2, Filter, Check, MoreHorizontal, RefreshCw } from 'lucide-react';
import L from 'leaflet';

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

const MinimalTextArea = ({ label, value, onChange, required = false }: any) => (
  <div className="group relative pt-4">
    <textarea required={required} value={value} onChange={onChange} placeholder=" " className="peer w-full px-0 py-2.5 border-b border-slate-200 bg-transparent text-slate-800 focus:border-slate-800 focus:ring-0 outline-none transition-all font-medium placeholder-transparent resize-none h-20" />
    <label className="absolute left-0 top-0 text-xs text-slate-400 font-medium transition-all uppercase tracking-wide">{label}</label>
  </div>
);

const Checkbox = ({ checked, onChange, className }: any) => (
    <div onClick={(e) => { e.stopPropagation(); onChange(!checked); }} className={`w-5 h-5 rounded border flex items-center justify-center cursor-pointer transition-all ${checked ? 'bg-indigo-600 border-indigo-600' : 'bg-white border-slate-300 hover:border-indigo-400'} ${className}`}>
        {checked && <Check size={12} className="text-white" />}
    </div>
);

interface BillboardCardProps {
  billboard: Billboard;
  onEdit: (b: Billboard) => void;
  onDelete: (b: Billboard) => void;
  getClientName: (id?: string) => string;
  onShare: (b: Billboard) => void;
  selected: boolean;
  onSelect: (id: string) => void;
}

const BillboardCard: React.FC<BillboardCardProps> = ({ billboard, onEdit, onDelete, getClientName, onShare, selected, onSelect }) => (
    <div className={`group bg-white rounded-3xl shadow-sm hover:shadow-2xl hover:shadow-slate-200/50 transition-all duration-500 overflow-hidden flex flex-col h-full hover:-translate-y-1 relative ${selected ? 'ring-2 ring-indigo-500 ring-offset-2' : 'border border-slate-100'}`}>
        <div className="absolute top-4 left-4 z-20" onClick={(e) => e.stopPropagation()}>
             <Checkbox checked={selected} onChange={() => onSelect(billboard.id)} className="shadow-md" />
        </div>
        <div className="h-56 bg-slate-200 relative overflow-hidden shrink-0">
            {billboard.imageUrl ? (
                <img src={billboard.imageUrl} alt="Billboard" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"/>
            ) : (
                <div className="w-full h-full flex items-center justify-center bg-slate-100 text-slate-300"><ImageIcon size={48} /></div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-slate-900/90 via-slate-900/20 to-transparent opacity-80 group-hover:opacity-100 transition-opacity duration-500"></div>
            
            <div className="absolute top-4 right-4 flex gap-2">
                <span className="px-3 py-1 text-[10px] font-bold tracking-widest uppercase rounded-full bg-white/20 backdrop-blur-md text-white border border-white/20 shadow-lg">{billboard.town}</span>
                <span className={`px-3 py-1 text-[10px] font-bold tracking-widest uppercase rounded-full text-white backdrop-blur-md border border-white/20 shadow-lg ${billboard.type === BillboardType.LED ? 'bg-indigo-600/80' : 'bg-orange-600/80'}`}>{billboard.type}</span>
            </div>
            
            <div className="absolute bottom-0 left-0 w-full p-6 text-white translate-y-2 group-hover:translate-y-0 transition-transform duration-500">
                <h3 className="font-bold text-xl leading-tight tracking-tight truncate mb-1">{billboard.name}</h3>
                <div className="flex items-center text-slate-300 text-xs font-medium truncate opacity-0 group-hover:opacity-100 transition-opacity duration-500 delay-100">
                    <MapPin className="w-3.5 h-3.5 mr-1 shrink-0 text-indigo-400" />{billboard.location}
                </div>
            </div>
        </div>
        
        <div className="p-6 flex-1 flex flex-col">
            <div className="grid grid-cols-2 gap-y-6 gap-x-4 mb-6">
                <div><p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-1">Dimensions</p><p className="text-sm font-bold text-slate-800">{billboard.width}m x {billboard.height}m</p></div>
                {billboard.type === BillboardType.Static ? (
                <div><p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-1">Monthly Rates</p><div className="text-sm font-bold text-slate-800"><span className="text-xs text-slate-400 mr-1 font-normal">A:</span>${billboard.sideARate?.toLocaleString()}<span className="mx-2 text-slate-300">|</span><span className="text-xs text-slate-400 mr-1 font-normal">B:</span>${billboard.sideBRate?.toLocaleString()}</div></div>
                ) : (
                <div><p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-1">Rate / Slot</p><p className="text-sm font-bold text-slate-800">${billboard.ratePerSlot?.toLocaleString()} <span className="text-[10px] text-slate-400 font-normal">/mo</span></p></div>
                )}
            </div>
            
            <div className="mb-6 bg-slate-50 p-4 rounded-2xl border border-slate-100/80">
                <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-1 flex items-center gap-1"><Sparkles size={10} className="text-orange-500" /> Visibility Analysis</p>
                <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed font-medium">{billboard.visibility || "No visibility data available."}</p>
            </div>
            
            {billboard.type === BillboardType.Static ? (
                <div className="flex gap-3 mb-6">
                <div className={`flex-1 p-3 rounded-2xl border transition-all ${billboard.sideAStatus === 'Available' ? 'border-emerald-100 bg-emerald-50/50' : 'border-slate-100 bg-slate-50'}`}>
                    <div className="flex justify-between items-center mb-1"><span className="text-xs font-bold text-slate-700">Side A</span><div className={`w-2 h-2 rounded-full ring-2 ring-white shadow-sm ${billboard.sideAStatus === 'Available' ? 'bg-emerald-500' : 'bg-red-500'}`}></div></div>
                    <p className="text-[10px] text-slate-500 truncate font-medium" title={getClientName(billboard.sideAClientId)}>{billboard.sideAStatus === 'Available' ? 'Vacant' : getClientName(billboard.sideAClientId)}</p>
                </div>
                <div className={`flex-1 p-3 rounded-2xl border transition-all ${billboard.sideBStatus === 'Available' ? 'border-emerald-100 bg-emerald-50/50' : 'border-slate-100 bg-slate-50'}`}>
                    <div className="flex justify-between items-center mb-1"><span className="text-xs font-bold text-slate-700">Side B</span><div className={`w-2 h-2 rounded-full ring-2 ring-white shadow-sm ${billboard.sideBStatus === 'Available' ? 'bg-emerald-500' : 'bg-red-500'}`}></div></div>
                    <p className="text-[10px] text-slate-500 truncate font-medium" title={getClientName(billboard.sideBClientId)}>{billboard.sideBStatus === 'Available' ? 'Vacant' : getClientName(billboard.sideBClientId)}</p>
                </div>
                </div>
            ) : (
                <div className="mb-6">
                <div className="flex justify-between items-center mb-2"><span className="text-xs font-bold uppercase tracking-wider text-slate-400">Slot Occupancy</span><span className="text-xs font-bold text-slate-700">{billboard.rentedSlots}/{billboard.totalSlots}</span></div>
                <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden border border-slate-200/50"><div className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 rounded-full shadow-[0_0_10px_rgba(99,102,241,0.4)] transition-all duration-1000" style={{ width: `${(billboard.rentedSlots! / billboard.totalSlots!) * 100}%` }}></div></div>
                </div>
            )}
            
            <div className="mt-auto flex gap-3">
                <button onClick={() => onEdit(billboard)} className="flex-1 px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-600 bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 rounded-xl transition-all flex items-center justify-center gap-2 shadow-sm"><Edit2 size={14} /> Edit</button>
                <button onClick={() => onShare(billboard)} className="px-3 py-3 text-indigo-600 bg-indigo-50 border border-indigo-100 hover:bg-indigo-100 rounded-xl transition-all flex items-center justify-center shadow-sm" title="Share Billboard Link"><Link2 size={16} /></button>
                <button onClick={() => onDelete(billboard)} className="px-3 py-3 text-red-500 bg-red-50 border border-red-100 hover:bg-red-100 hover:border-red-200 rounded-xl transition-all flex items-center justify-center shadow-sm" title="Delete Asset"><Trash2 size={16} /></button>
            </div>
        </div>
    </div>
);

export const BillboardList: React.FC = () => {
  const [billboards, setBillboards] = useState<Billboard[]>(getBillboards());
  const [filter, setFilter] = useState<'All' | 'Static' | 'LED'>('All');
  const [townFilter, setTownFilter] = useState('All');
  const [viewMode, setViewMode] = useState<'grid' | 'list' | 'map'>('grid');
  const [searchTerm, setSearchTerm] = useState('');
  const [isClientView, setIsClientView] = useState(false);
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const [isImporting, setIsImporting] = useState(false);
  
  // Selection State
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [batchEditType, setBatchEditType] = useState<'Town' | null>(null);
  const [batchEditValue, setBatchEditValue] = useState(''); // e.g. new Town name

  const [editingBillboard, setEditingBillboard] = useState<Billboard | null>(null);
  const [billboardToDelete, setBillboardToDelete] = useState<Billboard | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isMapShareModalOpen, setIsMapShareModalOpen] = useState(false);
  const [isAutoFilling, setIsAutoFilling] = useState(false);
  
  const [newBillboard, setNewBillboard] = useState<Partial<Billboard>>({
    name: '', location: '', town: 'Harare', type: BillboardType.Static, width: 0, height: 0,
    sideARate: 0, sideBRate: 0, ratePerSlot: 0, totalSlots: 10, imageUrl: '', visibility: '',
    coordinates: { lat: -17.8292, lng: 31.0522 },
    sideAStatus: 'Available', sideBStatus: 'Available', rentedSlots: 0
  });

  // Deep Link Handling
  useEffect(() => {
      const params = new URLSearchParams(window.location.search);
      const sharedId = params.get('billboardId');
      const view = params.get('view');
      
      if (view === 'map') {
          setViewMode('map');
          setIsClientView(true);
      }
      
      if (sharedId) {
          const target = billboards.find(b => b.id === sharedId);
          if (target) {
              setSearchTerm(target.name);
              // Ensure we don't filter it out
              setFilter('All');
              setTownFilter('All');
          }
      }
  }, []);

  const filteredBillboards = billboards.filter(b => {
    const matchesFilter = filter === 'All' ? true : b.type === filter;
    const matchesTown = townFilter === 'All' ? true : b.town === townFilter;
    const matchesSearch = b.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          b.location.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          b.town.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesFilter && matchesTown && matchesSearch;
  });

  const ledBoards = filteredBillboards.filter(b => b.type === BillboardType.LED);
  const staticBoards = filteredBillboards.filter(b => b.type === BillboardType.Static);

  // Selection Logic
  const handleSelect = (id: string) => {
      setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handleSelectAll = () => {
      if (selectedIds.length === filteredBillboards.length) setSelectedIds([]);
      else setSelectedIds(filteredBillboards.map(b => b.id));
  };

  // Batch Logic
  const handleBatchDelete = () => {
      if (!confirm(`Are you sure you want to delete ${selectedIds.length} assets? This cannot be undone.`)) return;
      
      selectedIds.forEach(id => deleteBillboard(id));
      setBillboards([...getBillboards()]);
      setSelectedIds([]);
  };

  const handleBatchResetStatus = () => {
      if (!confirm(`Reset status to 'Available' for ${selectedIds.length} assets?`)) return;
      
      const updates = billboards
          .filter(b => selectedIds.includes(b.id))
          .map(b => ({
              ...b,
              sideAStatus: 'Available' as any,
              sideBStatus: 'Available' as any,
              sideAClientId: undefined,
              sideBClientId: undefined,
              rentedSlots: 0
          }));
      
      bulkUpdateBillboards(updates);
      setBillboards([...getBillboards()]);
      setSelectedIds([]);
      alert("Statuses reset successfully.");
  };

  const handleBatchEditTown = (e: React.FormEvent) => {
      e.preventDefault();
      if (!batchEditValue) return;
      
      const updates = billboards
          .filter(b => selectedIds.includes(b.id))
          .map(b => ({ ...b, town: batchEditValue }));
      
      bulkUpdateBillboards(updates);
      setBillboards([...getBillboards()]);
      setSelectedIds([]);
      setBatchEditType(null);
      setBatchEditValue('');
      alert("Locations updated successfully.");
  };

  useEffect(() => {
    if (viewMode !== 'map' || !mapContainerRef.current) return;
    if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
    try {
        const zimbabweBounds: L.LatLngBoundsExpression = [
            [-22.6, 25.0], // Southwest
            [-15.4, 33.5]  // Northeast
        ];

        const map = L.map(mapContainerRef.current, {
            maxBounds: zimbabweBounds,
            maxBoundsViscosity: 1.0, // Hard stop at bounds
            minZoom: 6
        }).setView([-17.8249, 31.0530], 12);
        
        mapRef.current = map;
        L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', { 
            attribution: 'OpenStreetMap', 
            maxZoom: 19,
            minZoom: 6 
        }).addTo(map);
        
        const DefaultIcon = L.icon({ iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png', shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png', iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34] });
        
        filteredBillboards.forEach(b => {
            if (b.coordinates) {
                const popupContent = isClientView ? `<div><strong>${b.name}</strong></div>` : `<div><strong>${b.name}</strong><div>${b.location}</div></div>`;
                L.marker([b.coordinates.lat, b.coordinates.lng], { icon: DefaultIcon }).addTo(map).bindPopup(popupContent);
            }
        });
    } catch (e) { console.error("Failed to initialize map:", e); }
    return () => { if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; } }
  }, [viewMode, filter, townFilter, isClientView, searchTerm]); 

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingBillboard) { updateBillboard(editingBillboard); setBillboards([...getBillboards()]); setEditingBillboard(null); }
  };
  const handleConfirmDelete = () => {
      if (billboardToDelete) { deleteBillboard(billboardToDelete.id); setBillboards([...getBillboards()]); setBillboardToDelete(null); }
  };
  const handleAddBillboard = (e: React.FormEvent) => {
    e.preventDefault();
    const billboard: Billboard = {
      id: (Date.now()).toString(), 
      name: newBillboard.name!, 
      location: newBillboard.location!, 
      town: newBillboard.town || 'Harare', 
      type: newBillboard.type!, 
      width: newBillboard.width!, 
      height: newBillboard.height!,
      sideARate: newBillboard.sideARate, 
      sideBRate: newBillboard.sideBRate, 
      ratePerSlot: newBillboard.ratePerSlot, 
      totalSlots: newBillboard.totalSlots, 
      rentedSlots: newBillboard.rentedSlots || 0,
      sideAStatus: newBillboard.sideAStatus as any || 'Available', 
      sideBStatus: newBillboard.sideBStatus as any || 'Available', 
      imageUrl: newBillboard.imageUrl, 
      visibility: newBillboard.visibility, 
      coordinates: newBillboard.coordinates || { lat: -17.82, lng: 31.05 }
    };
    addBillboard(billboard); 
    setBillboards([...getBillboards()]); 
    setIsAddModalOpen(false);
    setNewBillboard({ 
      name: '', location: '', town: 'Harare', type: BillboardType.Static, 
      width: 0, height: 0, sideARate: 0, sideBRate: 0, ratePerSlot: 0, 
      totalSlots: 10, imageUrl: '', visibility: '', coordinates: { lat: -17.8292, lng: 31.0522 },
      sideAStatus: 'Available', sideBStatus: 'Available', rentedSlots: 0
    });
  };
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, isEdit: boolean) => {
    const file = e.target.files?.[0];
    if (file) {
        const reader = new FileReader();
        reader.onloadend = () => {
            const base64 = reader.result as string;
            if (isEdit && editingBillboard) { setEditingBillboard({...editingBillboard, imageUrl: base64}); } else { setNewBillboard({...newBillboard, imageUrl: base64}); }
        };
        reader.readAsDataURL(file);
    }
  };
  const getClientName = (clientId?: string) => { if(!clientId) return 'Available'; return mockClients.find(c => c.id === clientId)?.companyName || 'Unknown'; };
  
  const shareBillboard = (b: Billboard) => { 
      const url = `${window.location.origin}${window.location.pathname}?billboardId=${b.id}`;
      navigator.clipboard.writeText(url); 
      alert("Link copied to clipboard!"); 
  };
  
  const copyMapLink = () => { 
      const url = `${window.location.origin}${window.location.pathname}?view=map`;
      navigator.clipboard.writeText(url); 
      setIsMapShareModalOpen(false); 
      alert("Map link copied!"); 
  };

  const handleAiAutofill = async (isEdit: boolean) => {
    const target = isEdit ? editingBillboard : newBillboard;
    if (!target?.location || !target?.town) {
        alert("Please enter a Location and Town first.");
        return;
    }
    
    setIsAutoFilling(true);
    const result = await estimateLocationDetails(target.location, target.town);
    
    if (isEdit && editingBillboard) {
        setEditingBillboard({
            ...editingBillboard,
            coordinates: { lat: result.lat, lng: result.lng },
            visibility: result.visibility
        });
    } else {
        setNewBillboard({
            ...newBillboard,
            coordinates: { lat: result.lat, lng: result.lng },
            visibility: result.visibility
        });
    }
    setIsAutoFilling(false);
  };

  const downloadTemplate = () => {
      const headers = "Name,Location,Town,Type(Static/LED),Width,Height,Card_Rate_A,Card_Rate_B,Latitude,Longitude,Client_Name,Start_Date,End_Date,Side_or_Slot,Agreed_Monthly_Rate,Billing_Day";
      const example = "Main Airport Rd,Airport Approach,Harare,Static,12,3,500,500,-17.892,31.105,Delta Beverages,2025-01-01,2025-12-31,A,450,25";
      const csv = `${headers}\n${example}`;
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'billboard_import_template.csv');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };

  const handleImportBillboards = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setIsImporting(true); // Start loading state

      const reader = new FileReader();
      reader.onload = async (event) => {
          try {
              const text = event.target?.result as string;
              const lines = text.split('\n').slice(1); // Skip header
              
              const newBoardsToAdd: Billboard[] = [];
              const newClientsToAdd: Client[] = [];
              const newContractsToAdd: Contract[] = [];
              
              lines.forEach(line => {
                  if (!line.trim()) return;
                  const cols = line.split(',').map(c => c.trim());
                  if (cols.length < 4) return;

                  const [name, location, town, typeStr, width, height, rateA, rateB, lat, lng, clientName, startDate, endDate, sideOrSlot, agreedRate, billingDay] = cols;
                  
                  const newBoard: Billboard = {
                      id: `IMP-${Date.now()}-${Math.floor(Math.random()*1000)}`,
                      name: name || 'Imported Billboard',
                      location: location || 'Unknown',
                      town: town || 'Harare',
                      type: typeStr?.toLowerCase() === 'led' ? BillboardType.LED : BillboardType.Static,
                      width: Number(width) || 0,
                      height: Number(height) || 0,
                      sideARate: Number(rateA) || 0,
                      sideBRate: Number(rateB) || 0,
                      ratePerSlot: Number(rateA) || 0, 
                      totalSlots: 10,
                      rentedSlots: 0,
                      coordinates: { lat: Number(lat) || -17.82, lng: Number(lng) || 31.05 },
                      sideAStatus: 'Available',
                      sideBStatus: 'Available',
                      visibility: 'Imported Data'
                  };
                  newBoardsToAdd.push(newBoard);

                  if (clientName && startDate && endDate) {
                      // Check against existing AND currently processing new clients
                      const existingClients = getClients();
                      let client = existingClients.find(c => c.companyName.toLowerCase() === clientName.toLowerCase()) || 
                                  newClientsToAdd.find(c => c.companyName.toLowerCase() === clientName.toLowerCase());
                      
                      const preferredBillingDay = billingDay ? parseInt(billingDay, 10) : undefined;

                      if (!client) {
                          const newClient: Client = {
                              id: `CLI-${Date.now()}-${Math.floor(Math.random()*1000)}`,
                              companyName: clientName,
                              contactPerson: 'Imported Contact',
                              email: '',
                              phone: '',
                              status: 'Active',
                              billingDay: preferredBillingDay
                          };
                          newClientsToAdd.push(newClient);
                          client = newClient;
                      }

                      const isSideA = sideOrSlot?.toUpperCase() === 'A';
                      const isSideB = sideOrSlot?.toUpperCase() === 'B';
                      const isBoth = sideOrSlot?.toUpperCase() === 'BOTH';
                      
                      let contractDetails = sideOrSlot || 'Standard';
                      let monthlyRate = 0;

                      if (agreedRate && Number(agreedRate) > 0) {
                          monthlyRate = Number(agreedRate);
                      } else {
                          if (newBoard.type === BillboardType.Static) {
                              if (isSideA) monthlyRate = newBoard.sideARate || 0;
                              else if (isSideB) monthlyRate = newBoard.sideBRate || 0;
                              else if (isBoth) monthlyRate = (newBoard.sideARate || 0) + (newBoard.sideBRate || 0);
                          } else {
                              monthlyRate = newBoard.ratePerSlot || 0;
                          }
                      }

                      const newContract: Contract = {
                          id: `CNT-${Date.now()}-${Math.floor(Math.random()*1000)}`,
                          clientId: client.id,
                          billboardId: newBoard.id,
                          startDate: startDate,
                          endDate: endDate,
                          monthlyRate: monthlyRate,
                          installationCost: 0,
                          printingCost: 0,
                          hasVat: true,
                          totalContractValue: monthlyRate * 12,
                          status: 'Active',
                          details: contractDetails,
                          side: isSideA ? 'A' : isSideB ? 'B' : isBoth ? 'Both' : undefined
                      };
                      newContractsToAdd.push(newContract);
                  }
              });

              // Perform Bulk Operations and Await Sync
              if (newBoardsToAdd.length > 0) await bulkAddBillboards(newBoardsToAdd);
              if (newClientsToAdd.length > 0) await bulkAddClients(newClientsToAdd);
              if (newContractsToAdd.length > 0) await bulkAddContracts(newContractsToAdd);

              setBillboards([...getBillboards()]);
              alert(`Import Successful!\n• ${newBoardsToAdd.length} Billboards added.\n• ${newContractsToAdd.length} Contracts created & linked.\n\nSync to cloud completed.`);
          } catch (error) {
              console.error("Import Error:", error);
              alert("An error occurred during import. Please check the file format and try again.");
          } finally {
              setIsImporting(false);
              if (importInputRef.current) importInputRef.current.value = '';
          }
      };
      reader.readAsText(file);
  };

  return (
    <>
      <div className="space-y-8 relative font-sans h-[calc(100vh-140px)] flex flex-col animate-fade-in">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 shrink-0">
          <div><h2 className="text-4xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-slate-900 to-slate-600 mb-2">Inventory</h2><p className="text-slate-500 font-medium">Manage and monitor your digital and static assets</p></div>
          <div className="flex flex-col sm:flex-row items-center gap-3 w-full lg:w-auto">
             <div className="relative group w-full sm:w-72">
                <Search className="absolute left-4 top-3 text-slate-400 group-focus-within:text-indigo-500 transition-colors" size={18} />
                <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Search location or name..." className="w-full pl-11 pr-4 py-2.5 border border-slate-200 rounded-full bg-white/80 backdrop-blur-sm outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all text-sm shadow-sm"/>
             </div>
             <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
                <div className="flex bg-white/80 backdrop-blur-sm rounded-full border border-slate-200 p-1 shadow-sm">
                    <button onClick={() => setViewMode('grid')} className={`p-2.5 rounded-full transition-all ${viewMode === 'grid' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-400 hover:text-slate-900'}`} title="Grid View"><GridIcon size={18} /></button>
                    <button onClick={() => setViewMode('list')} className={`p-2.5 rounded-full transition-all ${viewMode === 'list' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-400 hover:text-slate-900'}`} title="List View"><ListIcon size={18} /></button>
                    <button onClick={() => setViewMode('map')} className={`p-2.5 rounded-full transition-all ${viewMode === 'map' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-400 hover:text-slate-900'}`} title="Map View"><MapIcon size={18} /></button>
                </div>
                
                <div className="flex bg-white/80 backdrop-blur-sm rounded-full border border-slate-200 p-1 shadow-sm hidden xl:flex">
                    <button onClick={downloadTemplate} className="p-2.5 rounded-full text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all" title="Download CSV Template"><FileDown size={18}/></button>
                    <label className={`p-2.5 rounded-full transition-all cursor-pointer ${isImporting ? 'text-indigo-600 bg-indigo-50 animate-pulse cursor-wait' : 'text-slate-400 hover:text-indigo-600 hover:bg-indigo-50'}`} title="Import Billboards CSV">
                        {isImporting ? <Loader2 size={18} className="animate-spin"/> : <FileUp size={18}/>}
                        <input type="file" ref={importInputRef} accept=".csv" className="hidden" onChange={handleImportBillboards} disabled={isImporting} />
                    </label>
                </div>

                <div className="flex flex-col sm:flex-row gap-2 bg-white/80 backdrop-blur-sm rounded-[2rem] sm:rounded-full border border-slate-200 p-1 shadow-sm">
                    <div className="flex">
                        {(['All', 'Static', 'LED'] as const).map(type => (<button key={type} onClick={() => setFilter(type)} className={`px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-full transition-all duration-300 ${filter === type ? 'bg-slate-100 text-slate-900 shadow-inner' : 'text-slate-500 hover:text-slate-800'}`}>{type}</button>))}
                    </div>
                    <div className="relative border-l border-slate-200 pl-2">
                        <select 
                            value={townFilter} 
                            onChange={(e) => setTownFilter(e.target.value)}
                            className="appearance-none bg-transparent pl-3 pr-8 py-2 text-xs font-bold uppercase tracking-wider text-slate-500 hover:text-slate-800 outline-none cursor-pointer w-full sm:w-auto h-full"
                        >
                            <option value="All">All Towns</option>
                            {ZIM_TOWNS.map(town => <option key={town} value={town}>{town}</option>)}
                        </select>
                        <Filter className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={12} />
                    </div>
                </div>

                <button onClick={() => setIsMapShareModalOpen(true)} className="bg-white text-slate-600 p-3 rounded-full hover:bg-slate-50 border border-slate-200 transition-colors shadow-sm hover:shadow-md hidden sm:block" title="Share Map"><Share2 size={20} /></button>
                <button onClick={() => setIsAddModalOpen(true)} className="bg-gradient-to-r from-indigo-600 to-violet-600 text-white p-3 rounded-full hover:shadow-lg hover:shadow-indigo-500/30 transition-all hover:scale-105 active:scale-95" title="Add Billboard"><Plus size={20} /></button>
             </div>
          </div>
        </div>
        <div className="flex-1 min-h-0 relative animate-fade-in">
          {viewMode === 'map' ? (
              <div className="h-full w-full rounded-3xl overflow-hidden shadow-lg border border-slate-200 relative z-0"><div ref={mapContainerRef} className="h-full w-full bg-slate-100" /><div className="absolute top-4 left-4 z-[100] bg-white/90 backdrop-blur-md shadow-xl border border-white/50 rounded-2xl p-2 flex flex-col gap-2"><button onClick={() => setIsClientView(!isClientView)} className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors ${isClientView ? 'bg-indigo-50 text-indigo-700' : 'bg-transparent text-slate-500 hover:bg-slate-100'}`}>{isClientView ? <Eye size={14}/> : <EyeOff size={14} />} {isClientView ? 'Client View On' : 'Admin View'}</button></div></div>
          ) : viewMode === 'list' ? (
              <div className="bg-white/80 backdrop-blur-xl rounded-3xl border border-white/60 shadow-sm overflow-hidden h-full flex flex-col">
                  <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm text-slate-600 min-w-[800px]">
                          <thead className="bg-slate-50/80 border-b border-slate-200 sticky top-0 z-10 backdrop-blur-md"><tr><th className="px-6 py-4 font-bold text-xs uppercase text-slate-400 tracking-wider w-16"><Checkbox checked={selectedIds.length === filteredBillboards.length && filteredBillboards.length > 0} onChange={handleSelectAll} /></th><th className="px-6 py-4 font-bold text-xs uppercase text-slate-400 tracking-wider">Asset</th><th className="px-6 py-4 font-bold text-xs uppercase text-slate-400 tracking-wider">Location</th><th className="px-6 py-4 font-bold text-xs uppercase text-slate-400 tracking-wider">Type</th><th className="px-6 py-4 font-bold text-xs uppercase text-slate-400 tracking-wider">Status</th><th className="px-6 py-4 font-bold text-xs uppercase text-slate-400 tracking-wider">Rate</th><th className="px-6 py-4 font-bold text-xs uppercase text-slate-400 tracking-wider text-right">Actions</th></tr></thead>
                          <tbody className="divide-y divide-slate-100">{filteredBillboards.map(b => (<tr key={b.id} className="hover:bg-indigo-50/30 transition-colors"><td className="px-6 py-4"><Checkbox checked={selectedIds.includes(b.id)} onChange={() => handleSelect(b.id)} /></td><td className="px-6 py-4 flex items-center gap-4"><div className="w-14 h-14 rounded-xl bg-slate-100 overflow-hidden shrink-0 border border-slate-200 shadow-sm">{b.imageUrl ? <img src={b.imageUrl} className="w-full h-full object-cover"/> : <div className="w-full h-full flex items-center justify-center text-slate-300"><ImageIcon size={20}/></div>}</div><span className="font-bold text-slate-900 text-base">{b.name}</span></td><td className="px-6 py-4"><div className="text-slate-800 font-bold">{b.town}</div><div className="text-xs text-slate-500 font-medium">{b.location}</div></td><td className="px-6 py-4"><span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider ${b.type === 'LED' ? 'bg-indigo-100 text-indigo-700' : 'bg-orange-100 text-orange-700'}`}>{b.type}</span></td><td className="px-6 py-4">{b.type === BillboardType.Static ? (<div className="flex gap-2"><div className={`px-2.5 py-1 rounded-lg text-xs font-bold ${b.sideAStatus === 'Available' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>A</div><div className={`px-2.5 py-1 rounded-lg text-xs font-bold ${b.sideBStatus === 'Available' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>B</div></div>) : (<div className="flex items-center gap-2"><div className="h-2 w-20 bg-slate-100 rounded-full overflow-hidden border border-slate-200"><div className="h-full bg-gradient-to-r from-indigo-500 to-violet-500" style={{width: `${(b.rentedSlots! / b.totalSlots!) * 100}%`}}></div></div><span className="text-xs font-bold">{b.rentedSlots}/{b.totalSlots}</span></div>)}</td><td className="px-6 py-4 font-mono text-xs font-bold text-slate-700">{b.type === BillboardType.Static ? `$${b.sideARate} | $${b.sideBRate}` : `$${b.ratePerSlot}/slot`}</td><td className="px-6 py-4 text-right"><div className="flex justify-end gap-2"><button onClick={() => setEditingBillboard(b)} className="p-2 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-all"><Edit2 size={16}/></button><button onClick={() => shareBillboard(b)} className="p-2 text-indigo-400 hover:text-indigo-900 hover:bg-indigo-50 rounded-xl transition-all"><Link2 size={16}/></button><button onClick={() => setBillboardToDelete(b)} className="p-2 text-rose-400 hover:text-rose-900 hover:bg-rose-50 rounded-xl transition-all"><Trash2 size={16}/></button></div></td></tr>))}</tbody></table></div></div>
          ) : (
            <div className="pb-8 overflow-y-auto max-h-full pr-2">
                {(filter === 'All' || filter === 'LED') && ledBoards.length > 0 && (<div className="mb-12"><h3 className="text-2xl font-bold text-slate-900 mb-6 flex items-center gap-3"><span className="w-1.5 h-8 bg-gradient-to-b from-indigo-500 to-violet-600 rounded-full shadow-lg shadow-indigo-500/30"></span>Digital Inventory <span className="text-sm font-bold text-slate-500 bg-white border border-slate-200 px-3 py-1 rounded-lg ml-2 shadow-sm">{ledBoards.length}</span></h3><div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">{ledBoards.map(billboard => (<BillboardCard key={billboard.id} billboard={billboard} onEdit={setEditingBillboard} onDelete={setBillboardToDelete} getClientName={getClientName} onShare={shareBillboard} selected={selectedIds.includes(billboard.id)} onSelect={handleSelect} />))}</div></div>)}
                {(filter === 'All' || filter === 'Static') && staticBoards.length > 0 && (<div className="mb-12"><h3 className="text-2xl font-bold text-slate-900 mb-6 flex items-center gap-3"><span className="w-1.5 h-8 bg-gradient-to-b from-orange-400 to-red-500 rounded-full shadow-lg shadow-orange-500/30"></span>Static Inventory <span className="text-sm font-bold text-slate-500 bg-white border border-slate-200 px-3 py-1 rounded-lg ml-2 shadow-sm">{staticBoards.length}</span></h3><div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">{staticBoards.map(billboard => (<BillboardCard key={billboard.id} billboard={billboard} onEdit={setEditingBillboard} onDelete={setBillboardToDelete} getClientName={getClientName} onShare={shareBillboard} selected={selectedIds.includes(billboard.id)} onSelect={handleSelect} />))}</div></div>)}
                {filteredBillboards.length === 0 && (<div className="text-center py-32 bg-white/50 rounded-[3rem] border border-dashed border-slate-200 backdrop-blur-sm"><p className="text-slate-400 font-medium text-lg">No billboards found matching this filter.</p></div>)}
            </div>
          )}
        </div>
      </div>
      
      {/* Batch Actions Toolbar */}
      {selectedIds.length > 0 && (
          <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[100] animate-fade-in flex items-center gap-2 bg-white/80 backdrop-blur-xl border border-slate-200 shadow-2xl p-2 rounded-2xl ring-1 ring-black/5">
              <div className="pl-4 pr-3 py-2 border-r border-slate-200/50">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500 mr-1">Selected</span>
                  <span className="text-sm font-black text-slate-900 bg-slate-100 px-2 py-0.5 rounded-lg">{selectedIds.length}</span>
              </div>
              <button onClick={() => setBatchEditType('Town')} className="flex items-center gap-2 px-4 py-2 hover:bg-slate-100 rounded-xl text-xs font-bold uppercase tracking-wider text-slate-700 transition-colors">
                  <MapPin size={14} /> Update Town
              </button>
              <button onClick={handleBatchResetStatus} className="flex items-center gap-2 px-4 py-2 hover:bg-orange-50 rounded-xl text-xs font-bold uppercase tracking-wider text-orange-600 transition-colors">
                  <RefreshCw size={14} /> Reset Status
              </button>
              <div className="w-[1px] h-6 bg-slate-200 mx-1"></div>
              <button onClick={handleBatchDelete} className="flex items-center gap-2 px-4 py-2 hover:bg-red-50 rounded-xl text-xs font-bold uppercase tracking-wider text-red-600 transition-colors">
                  <Trash2 size={14} /> Delete
              </button>
              <button onClick={() => setSelectedIds([])} className="p-2 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-colors ml-1">
                  <X size={16} />
              </button>
          </div>
      )}

      {/* Batch Edit Modal */}
      {batchEditType && (
          <div className="fixed inset-0 z-[200] overflow-y-auto">
              <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md transition-opacity" onClick={() => setBatchEditType(null)} />
              <div className="flex min-h-full items-center justify-center p-4 text-center">
                  <div className="relative transform overflow-hidden rounded-2xl bg-white text-left shadow-2xl transition-all sm:my-8 sm:w-full sm:max-w-sm border border-white/20 p-6">
                      <h3 className="text-lg font-bold text-slate-900 mb-4">Batch Update {batchEditType}</h3>
                      <form onSubmit={handleBatchEditTown}>
                          <MinimalSelect 
                              label="New Town" 
                              value={batchEditValue} 
                              onChange={(e: any) => setBatchEditValue(e.target.value)} 
                              options={[{value:'', label: 'Select Town...'}, ...ZIM_TOWNS.map(t => ({ value: t, label: t }))]} 
                          />
                          <div className="flex gap-3 mt-6">
                              <button type="button" onClick={() => setBatchEditType(null)} className="flex-1 py-3 text-slate-500 bg-slate-50 hover:bg-slate-100 rounded-xl font-bold uppercase text-xs tracking-wider">Cancel</button>
                              <button type="submit" className="flex-1 py-3 text-white bg-slate-900 hover:bg-slate-800 rounded-xl font-bold uppercase text-xs tracking-wider shadow-lg">Apply to {selectedIds.length}</button>
                          </div>
                      </form>
                  </div>
              </div>
          </div>
      )}

      {/* Modals Updated for Responsiveness */}
      {isMapShareModalOpen && (
        <div className="fixed inset-0 z-[200] overflow-y-auto">
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md transition-opacity" onClick={() => setIsMapShareModalOpen(false)} />
            <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
                <div className="relative transform overflow-hidden rounded-3xl bg-white text-left shadow-2xl transition-all sm:my-8 sm:w-full sm:max-w-sm border border-white/20 p-8 transform scale-100">
                    <div className="w-16 h-16 bg-gradient-to-br from-indigo-50 to-indigo-100 rounded-2xl flex items-center justify-center mx-auto mb-6 text-indigo-600 shadow-inner border border-indigo-200"><Share2 size={32} /></div>
                    <h3 className="text-2xl font-bold text-slate-900 mb-2 text-center">Share Map</h3>
                    <p className="text-slate-500 text-center text-sm mb-8 leading-relaxed">Clients will see a simplified view without pricing details.</p>
                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 flex items-center justify-between mb-8 shadow-inner">
                        <code className="text-xs text-slate-600 truncate max-w-[200px] font-mono">{`${window.location.origin}${window.location.pathname}?view=map`}</code>
                        <button onClick={copyMapLink} className="p-2 hover:bg-white rounded-xl text-slate-500 transition-all hover:text-indigo-600 hover:shadow-sm"><Copy size={18}/></button>
                    </div>
                    <div className="flex gap-4">
                        <button onClick={() => setIsMapShareModalOpen(false)} className="flex-1 py-4 text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl font-bold uppercase text-xs tracking-wider transition-all">Close</button>
                        <button onClick={() => { setIsClientView(true); setViewMode('map'); setIsMapShareModalOpen(false); }} className="flex-1 py-4 text-white bg-slate-900 hover:bg-slate-800 rounded-xl font-bold uppercase text-xs tracking-wider transition-all shadow-lg shadow-slate-900/20">Preview</button>
                    </div>
                </div>
            </div>
        </div>
      )}

      {isAddModalOpen && (
        <div className="fixed inset-0 z-[200] overflow-y-auto">
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md transition-opacity" onClick={() => setIsAddModalOpen(false)} />
            <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
                <div className="relative transform overflow-hidden rounded-[2rem] bg-white text-left shadow-2xl transition-all sm:my-8 sm:w-full sm:max-w-3xl border border-white/20">
                    <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-white sticky top-0 z-10">
                        <h3 className="text-2xl font-bold text-slate-900 tracking-tight">Add New Asset</h3>
                        <button onClick={() => setIsAddModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors"><X size={24} className="text-slate-400" /></button>
                    </div>
                    <form onSubmit={handleAddBillboard} className="p-8 grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="space-y-6">
                            <MinimalInput label="Name" value={newBillboard.name} onChange={(e: any) => setNewBillboard({...newBillboard, name: e.target.value})} required />
                            <div className="grid grid-cols-2 gap-4">
                                <MinimalInput label="Location Description" value={newBillboard.location} onChange={(e: any) => setNewBillboard({...newBillboard, location: e.target.value})} required />
                                <MinimalSelect label="Town / City" value={newBillboard.town} onChange={(e: any) => setNewBillboard({...newBillboard, town: e.target.value})} options={ZIM_TOWNS.map(t => ({ value: t, label: t }))}/>
                            </div>
                            <div className="flex justify-end">
                                <button type="button" onClick={() => handleAiAutofill(false)} disabled={isAutoFilling} className="flex items-center gap-2 text-xs font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition-colors">
                                    {isAutoFilling ? <Loader2 size={14} className="animate-spin"/> : <Sparkles size={14}/>} AI Auto-Fill & Coordinates
                                </button>
                            </div>
                            <MinimalSelect label="Type" value={newBillboard.type} onChange={(e: any) => setNewBillboard({...newBillboard, type: e.target.value})} options={[{ value: BillboardType.Static, label: 'Static (Side A/B)' }, { value: BillboardType.LED, label: 'LED (Slots)' }]}/> 
                            <MinimalTextArea label="Visibility & Traffic Analysis" value={newBillboard.visibility || ''} onChange={(e: any) => setNewBillboard({...newBillboard, visibility: e.target.value})}/>
                        </div>
                        <div className="space-y-6">
                            <div className="space-y-3">
                                <p className="text-xs font-bold uppercase text-slate-400 tracking-wider">Asset Image</p>
                                <div className="flex items-center gap-4">
                                    <div className="w-28 h-28 bg-slate-50 rounded-2xl overflow-hidden border border-slate-200 flex items-center justify-center shadow-inner">{newBillboard.imageUrl ? <img src={newBillboard.imageUrl} className="w-full h-full object-cover"/> : <ImageIcon className="text-slate-300 w-8 h-8" />}</div>
                                    <label className="flex-1 cursor-pointer group">
                                        <div className="h-28 border-2 border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center text-slate-400 group-hover:border-indigo-300 group-hover:text-indigo-500 transition-colors bg-slate-50/50 group-hover:bg-indigo-50/30">
                                            <span className="text-xs font-bold uppercase tracking-wider mb-1">Click to Upload</span>
                                            <span className="text-[10px]">JPG, PNG (Max 5MB)</span>
                                        </div>
                                        <input type="file" className="hidden" accept="image/*" onChange={(e) => handleImageUpload(e, false)} />
                                    </label>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4"><MinimalInput label="Width (m)" type="number" value={newBillboard.width} onChange={(e: any) => setNewBillboard({...newBillboard, width: Number(e.target.value)})} /><MinimalInput label="Height (m)" type="number" value={newBillboard.height} onChange={(e: any) => setNewBillboard({...newBillboard, height: Number(e.target.value)})} /></div>
                            <div className="grid grid-cols-2 gap-4"><MinimalInput label="Latitude" type="number" value={newBillboard.coordinates?.lat} onChange={(e: any) => setNewBillboard({...newBillboard, coordinates: {...newBillboard.coordinates!, lat: Number(e.target.value)}})} /><MinimalInput label="Longitude" type="number" value={newBillboard.coordinates?.lng} onChange={(e: any) => setNewBillboard({...newBillboard, coordinates: {...newBillboard.coordinates!, lng: Number(e.target.value)}})} /></div>
                            {newBillboard.type === BillboardType.Static ? (
                              <div className="space-y-4 pt-2">
                                <p className="text-xs font-bold uppercase text-slate-400 tracking-wider">Monthly Rates</p>
                                <div className="grid grid-cols-2 gap-4">
                                  <MinimalInput label="Side A Rate ($)" type="number" value={newBillboard.sideARate} onChange={(e: any) => setNewBillboard({...newBillboard, sideARate: Number(e.target.value)})} />
                                  <MinimalInput label="Side B Rate ($)" type="number" value={newBillboard.sideBRate} onChange={(e: any) => setNewBillboard({...newBillboard, sideBRate: Number(e.target.value)})} />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                   <MinimalSelect label="Side A Status" value={newBillboard.sideAStatus} onChange={(e: any) => setNewBillboard({...newBillboard, sideAStatus: e.target.value})} options={[{value: 'Available', label: 'Available'}, {value: 'Rented', label: 'Rented'}]}/>
                                   <MinimalSelect label="Side B Status" value={newBillboard.sideBStatus} onChange={(e: any) => setNewBillboard({...newBillboard, sideBStatus: e.target.value})} options={[{value: 'Available', label: 'Available'}, {value: 'Rented', label: 'Rented'}]}/>
                                </div>
                              </div>
                            ) : (
                              <div className="space-y-4 pt-2">
                                <p className="text-xs font-bold uppercase text-slate-400 tracking-wider">LED Configuration</p>
                                <div className="grid grid-cols-2 gap-4">
                                  <MinimalInput label="Total Slots" type="number" value={newBillboard.totalSlots} onChange={(e: any) => setNewBillboard({...newBillboard, totalSlots: Number(e.target.value)})} />
                                  <MinimalInput label="Rate / Slot ($)" type="number" value={newBillboard.ratePerSlot} onChange={(e: any) => setNewBillboard({...newBillboard, ratePerSlot: Number(e.target.value)})} />
                                </div>
                                <MinimalInput label="Initially Rented Slots" type="number" value={newBillboard.rentedSlots} onChange={(e: any) => setNewBillboard({...newBillboard, rentedSlots: Number(e.target.value)})} />
                              </div>
                            )}
                        </div>
                        <div className="md:col-span-2 pt-6 flex gap-4 border-t border-slate-100">
                            <button type="button" onClick={() => setIsAddModalOpen(false)} className="flex-1 py-4 text-slate-500 hover:bg-slate-50 rounded-xl font-bold uppercase text-xs tracking-wider transition-colors">Cancel</button>
                            <button type="submit" className="flex-1 py-4 text-white bg-slate-900 rounded-xl hover:bg-slate-800 shadow-lg font-bold uppercase tracking-wider transition-all hover:scale-[1.02]">Create Asset</button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
      )}

      {editingBillboard && (
        <div className="fixed inset-0 z-[200] overflow-y-auto">
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md transition-opacity" onClick={() => setEditingBillboard(null)} />
            <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
                <div className="relative transform overflow-hidden rounded-[2rem] bg-white text-left shadow-2xl transition-all sm:my-8 sm:w-full sm:max-w-3xl border border-white/20">
                    <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-white sticky top-0 z-10">
                        <h3 className="text-2xl font-bold text-slate-900 tracking-tight">Edit Asset</h3>
                        <button onClick={() => setEditingBillboard(null)} className="p-2 hover:bg-slate-100 rounded-full transition-colors"><X size={24} className="text-slate-400" /></button>
                    </div>
                    <form onSubmit={handleSaveEdit} className="p-8 grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="space-y-6">
                            <MinimalInput label="Name" value={editingBillboard.name} onChange={(e: any) => setEditingBillboard({...editingBillboard, name: e.target.value})} required />
                            <div className="grid grid-cols-2 gap-4">
                                <MinimalInput label="Location Description" value={editingBillboard.location} onChange={(e: any) => setEditingBillboard({...editingBillboard, location: e.target.value})} required />
                                <MinimalSelect label="Town / City" value={editingBillboard.town} onChange={(e: any) => setEditingBillboard({...editingBillboard, town: e.target.value})} options={ZIM_TOWNS.map(t => ({ value: t, label: t }))}/>
                            </div>
                            <div className="flex justify-end">
                                <button type="button" onClick={() => handleAiAutofill(true)} disabled={isAutoFilling} className="flex items-center gap-2 text-xs font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition-colors">
                                    {isAutoFilling ? <Loader2 size={14} className="animate-spin"/> : <Sparkles size={14}/>} AI Auto-Fill & Coordinates
                                </button>
                            </div>
                            <MinimalSelect 
                                label="Type" 
                                value={editingBillboard.type} 
                                onChange={(e: any) => {
                                    const newType = e.target.value;
                                    setEditingBillboard({
                                        ...editingBillboard,
                                        type: newType,
                                        // Reset rates if switching type to avoid confusion or mixed data
                                        ...(newType === BillboardType.LED ? { 
                                            sideARate: 0, 
                                            sideBRate: 0,
                                            totalSlots: editingBillboard.totalSlots || 10,
                                            ratePerSlot: editingBillboard.ratePerSlot || 0
                                        } : {
                                            ratePerSlot: 0,
                                            totalSlots: 0,
                                            sideARate: editingBillboard.sideARate || 0,
                                            sideBRate: editingBillboard.sideBRate || 0
                                        })
                                    });
                                }}
                                options={[{ value: BillboardType.Static, label: 'Static (Side A/B)' }, { value: BillboardType.LED, label: 'LED (Slots)' }]}
                            /> 
                            <MinimalTextArea label="Visibility & Traffic Analysis" value={editingBillboard.visibility || ''} onChange={(e: any) => setEditingBillboard({...editingBillboard, visibility: e.target.value})}/>
                        </div>
                        <div className="space-y-6">
                            <div className="space-y-3">
                                <p className="text-xs font-bold uppercase text-slate-400 tracking-wider">Asset Image</p>
                                <div className="flex items-center gap-4">
                                    <div className="w-28 h-28 bg-slate-50 rounded-2xl overflow-hidden border border-slate-200 flex items-center justify-center shadow-inner">{editingBillboard.imageUrl ? <img src={editingBillboard.imageUrl} className="w-full h-full object-cover"/> : <ImageIcon className="text-slate-300 w-8 h-8" />}</div>
                                    <label className="flex-1 cursor-pointer group">
                                        <div className="h-28 border-2 border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center text-slate-400 group-hover:border-indigo-300 group-hover:text-indigo-500 transition-colors bg-slate-50/50 group-hover:bg-indigo-50/30">
                                            <span className="text-xs font-bold uppercase tracking-wider mb-1">Click to Upload</span>
                                            <span className="text-[10px]">JPG, PNG (Max 5MB)</span>
                                        </div>
                                        <input type="file" className="hidden" accept="image/*" onChange={(e) => handleImageUpload(e, true)} />
                                    </label>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4"><MinimalInput label="Width (m)" type="number" value={editingBillboard.width} onChange={(e: any) => setEditingBillboard({...editingBillboard, width: Number(e.target.value)})} /><MinimalInput label="Height (m)" type="number" value={editingBillboard.height} onChange={(e: any) => setEditingBillboard({...editingBillboard, height: Number(e.target.value)})} /></div>
                            <div className="grid grid-cols-2 gap-4"><MinimalInput label="Latitude" type="number" value={editingBillboard.coordinates?.lat} onChange={(e: any) => setEditingBillboard({...editingBillboard, coordinates: {...editingBillboard.coordinates!, lat: Number(e.target.value)}})} /><MinimalInput label="Longitude" type="number" value={editingBillboard.coordinates?.lng} onChange={(e: any) => setEditingBillboard({...editingBillboard, coordinates: {...editingBillboard.coordinates!, lng: Number(e.target.value)}})} /></div>
                            {editingBillboard.type === BillboardType.Static ? (
                              <div className="space-y-4 pt-2">
                                <p className="text-xs font-bold uppercase text-slate-400 tracking-wider">Monthly Rates</p>
                                <div className="grid grid-cols-2 gap-4">
                                  <MinimalInput label="Side A Rate ($)" type="number" value={editingBillboard.sideARate} onChange={(e: any) => setEditingBillboard({...editingBillboard, sideARate: Number(e.target.value)})} />
                                  <MinimalInput label="Side B Rate ($)" type="number" value={editingBillboard.sideBRate} onChange={(e: any) => setEditingBillboard({...editingBillboard, sideBRate: Number(e.target.value)})} />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                   <MinimalSelect label="Side A Status" value={editingBillboard.sideAStatus} onChange={(e: any) => setEditingBillboard({...editingBillboard, sideAStatus: e.target.value})} options={[{value: 'Available', label: 'Available'}, {value: 'Rented', label: 'Rented'}]}/>
                                   <MinimalSelect label="Side B Status" value={editingBillboard.sideBStatus} onChange={(e: any) => setEditingBillboard({...editingBillboard, sideBStatus: e.target.value})} options={[{value: 'Available', label: 'Available'}, {value: 'Rented', label: 'Rented'}]}/>
                                </div>
                              </div>
                            ) : (
                              <div className="space-y-4 pt-2">
                                <p className="text-xs font-bold uppercase text-slate-400 tracking-wider">LED Configuration</p>
                                <div className="grid grid-cols-2 gap-4">
                                  <MinimalInput label="Total Slots" type="number" value={editingBillboard.totalSlots} onChange={(e: any) => setEditingBillboard({...editingBillboard, totalSlots: Number(e.target.value)})} />
                                  <MinimalInput label="Rate / Slot ($)" type="number" value={editingBillboard.ratePerSlot} onChange={(e: any) => setEditingBillboard({...editingBillboard, ratePerSlot: Number(e.target.value)})} />
                                </div>
                                <MinimalInput label="Rented Slots" type="number" value={editingBillboard.rentedSlots} onChange={(e: any) => setEditingBillboard({...editingBillboard, rentedSlots: Number(e.target.value)})} />
                              </div>
                            )}
                        </div>
                        <div className="md:col-span-2 pt-6 flex gap-4 border-t border-slate-100">
                            <button type="button" onClick={() => setEditingBillboard(null)} className="flex-1 py-4 text-slate-500 hover:bg-slate-50 rounded-xl font-bold uppercase text-xs tracking-wider transition-colors">Cancel</button>
                            <button type="submit" className="flex-1 py-4 text-white bg-slate-900 rounded-xl hover:bg-slate-800 shadow-lg font-bold uppercase tracking-wider transition-all hover:scale-[1.02]">Save Changes</button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
      )}

      {billboardToDelete && (
        <div className="fixed inset-0 z-[200] overflow-y-auto">
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md transition-opacity" onClick={() => setBillboardToDelete(null)} />
            <div className="flex min-h-full items-center justify-center p-4 text-center">
                <div className="relative transform overflow-hidden rounded-2xl bg-white text-left shadow-2xl transition-all sm:my-8 sm:w-full sm:max-w-sm border border-white/20 p-6 text-center">
                    <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4 border-4 border-red-50"><AlertTriangle className="text-red-500" size={32}/></div>
                    <h3 className="text-xl font-bold text-slate-900 mb-2">Delete Asset?</h3>
                    <p className="text-slate-500 mb-6 text-sm">Are you sure you want to delete <span className="font-bold text-slate-700">{billboardToDelete.name}</span>? This action cannot be undone.</p>
                    <div className="flex gap-3">
                        <button onClick={() => setBillboardToDelete(null)} className="flex-1 py-3 text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl font-bold uppercase text-xs tracking-wider transition-colors">Cancel</button>
                        <button onClick={handleConfirmDelete} className="flex-1 py-3 text-white bg-red-500 hover:bg-red-600 rounded-xl font-bold uppercase text-xs tracking-wider transition-colors shadow-lg shadow-red-500/30">Delete</button>
                    </div>
                </div>
            </div>
        </div>
      )}
    </>
  );
};
