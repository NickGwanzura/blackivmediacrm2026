
import React, { useState } from 'react';
import { Client } from '../types';
import { getClients, addClient, deleteClient, updateClient, getNextBillingDetails } from '../services/mockData';
import { generateActiveClientsPDF } from '../services/pdfGenerator';
import { Mail, Phone, MoreHorizontal, User, Plus, Save, Search, Trash2, Calendar, Clock, Edit2, CreditCard, FileDown, UserPlus, PencilLine } from 'lucide-react';
import { AccessibleModal, ModalButton } from './ui/AccessibleModal';
import { FormInput, FormNumber, FormSection } from './ui/Form';



export const ClientList: React.FC = () => {
  const [clients, setClients] = useState<Client[]>(getClients());
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [clientToDelete, setClientToDelete] = useState<Client | null>(null);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  
  const [newClient, setNewClient] = useState<Partial<Client>>({ companyName: '', contactPerson: '', email: '', phone: '', status: 'Active', billingDay: undefined });

  const handleAddClient = (e: React.FormEvent) => {
    e.preventDefault();
    const client: Client = { 
        id: (Date.now()).toString(), 
        companyName: newClient.companyName || 'New Company', 
        contactPerson: newClient.contactPerson || 'N/A', 
        email: newClient.email || '', 
        phone: newClient.phone || '', 
        status: 'Active',
        billingDay: newClient.billingDay 
    };
    addClient(client); setClients(getClients()); setIsAddModalOpen(false); setNewClient({ companyName: '', contactPerson: '', email: '', phone: '', status: 'Active', billingDay: undefined });
  };
  
  const handleUpdateClient = (e: React.FormEvent) => {
    e.preventDefault();
    if(editingClient) {
        updateClient(editingClient);
        setClients(getClients());
        setEditingClient(null);
    }
  };

  const handleConfirmDelete = () => { if (clientToDelete) { deleteClient(clientToDelete.id); setClients(getClients()); setClientToDelete(null); } };

  return (
    <>
      <div className="space-y-8 relative animate-fade-in">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div><h2 className="text-4xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-slate-900 to-slate-600 mb-2">Client Directory</h2><p className="text-slate-500 font-medium">Manage advertising partners and contact details</p></div>
          <div className="flex items-center gap-4 w-full sm:w-auto">
              <div className="relative group w-full sm:w-64"><Search className="absolute left-0 top-2.5 text-slate-400 group-focus-within:text-slate-800 transition-colors" size={18} /><input type="text" placeholder="Search clients..." className="w-full pl-8 py-2 border-b border-slate-200 bg-transparent outline-none focus:border-slate-800 transition-colors"/></div>
              <button onClick={() => generateActiveClientsPDF(clients)} className="bg-white border border-slate-200 text-slate-600 px-4 py-3 rounded-full text-sm font-bold uppercase tracking-wider hover:bg-slate-50 transition-all flex items-center gap-2"><FileDown size={18} /> Report</button>
              <button onClick={() => setIsAddModalOpen(true)} className="bg-slate-900 text-white px-5 py-3 rounded-full text-sm font-bold uppercase tracking-wider hover:bg-slate-800 flex items-center gap-2 shadow-lg hover:shadow-xl transition-all hover:scale-105"><Plus size={18} /> <span className="hidden sm:inline">New Client</span></button>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {clients.map(client => {
                const billingInfo = getNextBillingDetails(client.id);
                return (
                <div key={client.id} className="bg-white rounded-2xl p-6 shadow-sm hover:shadow-xl transition-all duration-300 border border-slate-100 group hover:-translate-y-1 flex flex-col justify-between">
                    <div>
                        <div className="flex justify-between items-start mb-4">
                            <div className="w-14 h-14 rounded-full bg-slate-50 text-slate-600 flex items-center justify-center font-bold text-xl group-hover:bg-slate-900 group-hover:text-white transition-colors shadow-sm">{client.companyName.charAt(0)}</div>
                            <div className="flex gap-1">
                                <button onClick={() => setEditingClient(client)} className="text-slate-300 hover:text-indigo-600 transition-colors p-2 hover:bg-indigo-50 rounded-full" title="Edit Client"><Edit2 size={18} /></button>
                                <button onClick={() => setClientToDelete(client)} className="text-slate-300 hover:text-red-500 transition-colors p-2 hover:bg-red-50 rounded-full" title="Delete Client"><Trash2 size={18} /></button>
                            </div>
                        </div>
                        <h3 className="text-xl font-bold text-slate-900 mb-1">{client.companyName}</h3><div className="flex items-center gap-2 text-sm text-slate-500 mb-6 font-medium"><User size={14} className="text-indigo-500"/> {client.contactPerson}</div>
                        <div className="space-y-3 border-t border-slate-50 pt-4 mb-4"><div className="flex items-center gap-3 text-sm text-slate-600 group-hover:text-slate-900 transition-colors"><Mail size={16} className="text-slate-400" /> {client.email}</div><div className="flex items-center gap-3 text-sm text-slate-600 group-hover:text-slate-900 transition-colors"><Phone size={16} className="text-slate-400" /> {client.phone}</div></div>
                        
                        {billingInfo ? (
                             <div className="bg-indigo-50 rounded-xl p-3 border border-indigo-100 mb-4">
                                 <div className="flex items-center justify-between mb-1">
                                     <span className="text-[10px] font-bold uppercase tracking-wide text-indigo-400">Next Bill</span>
                                     <span className="text-xs font-bold text-indigo-700">${billingInfo.amount.toLocaleString()}</span>
                                 </div>
                                 <div className="flex items-center gap-2 text-sm font-bold text-indigo-900">
                                     <Clock size={14} /> {billingInfo.date} {client.billingDay && <span className="text-[10px] bg-white px-1.5 py-0.5 rounded border border-indigo-100 text-indigo-400 font-normal">Fixed: Day {client.billingDay}</span>}
                                 </div>
                             </div>
                        ) : client.billingDay ? (
                            <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 mb-4">
                                 <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
                                     <Calendar size={14} /> Bill Day: <span className="font-bold text-slate-700">{client.billingDay}th</span> of month
                                 </div>
                             </div>
                        ) : null}
                    </div>
                    <div className="flex justify-between items-center pt-2"><span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest border ${client.status === 'Active' ? 'bg-green-50 text-green-600 border-green-100' : 'bg-slate-50 text-slate-500 border-slate-100'}`}>{client.status}</span><button onClick={() => setEditingClient(client)} className="text-xs font-bold uppercase tracking-wider text-slate-400 hover:text-indigo-600 transition-colors flex items-center gap-1">View Details <MoreHorizontal size={14}/></button></div>
                </div>
            )})}
        </div>
      </div>
      
      {/* Create Modal */}
      <AccessibleModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Add New Client"
        size="md"
        variant="default"
        icon={<UserPlus size={20} />}
        footer={
          <>
            <ModalButton variant="secondary" onClick={() => setIsAddModalOpen(false)}>Cancel</ModalButton>
            <ModalButton variant="primary" type="submit" form="add-client-form"><Save size={14} /> Save Client</ModalButton>
          </>
        }
      >
        <form id="add-client-form" onSubmit={handleAddClient} className="space-y-6">
          <FormSection title="Company Information">
            <FormInput label="Company Name" value={newClient.companyName || ''} onChange={(e: any) => setNewClient({...newClient, companyName: e.target.value})} required />
            <FormInput label="Contact Person" value={newClient.contactPerson || ''} onChange={(e: any) => setNewClient({...newClient, contactPerson: e.target.value})} required />
            <FormInput label="Email Address" type="email" value={newClient.email || ''} onChange={(e: any) => setNewClient({...newClient, email: e.target.value})} required />
            <FormInput label="Phone Number" type="tel" value={newClient.phone || ''} onChange={(e: any) => setNewClient({...newClient, phone: e.target.value})} />
            <FormNumber label="Billing Day (1-31)" min={1} max={31} value={newClient.billingDay || ''} onChange={(e: any) => setNewClient({...newClient, billingDay: e.target.value ? Number(e.target.value) : undefined})} />
          </FormSection>
        </form>
      </AccessibleModal>
      
      {/* Edit Modal */}
      <AccessibleModal
        isOpen={!!editingClient}
        onClose={() => setEditingClient(null)}
        title={editingClient ? `Edit ${editingClient.companyName}` : 'Edit Client'}
        size="lg"
        variant="default"
        icon={<PencilLine size={20} />}
        footer={
          <>
            <ModalButton variant="secondary" onClick={() => setEditingClient(null)}>Cancel</ModalButton>
            <ModalButton variant="primary" type="submit" form="edit-client-form"><Save size={14} /> Update Client</ModalButton>
          </>
        }
      >
        <form id="edit-client-form" onSubmit={handleUpdateClient} className="space-y-6">
          {editingClient && (
            <>
              <FormSection title="Company Information">
                <FormInput label="Company Name" value={editingClient.companyName} onChange={(e: any) => setEditingClient({...editingClient, companyName: e.target.value})} required />
                <FormInput label="Contact Person" value={editingClient.contactPerson} onChange={(e: any) => setEditingClient({...editingClient, contactPerson: e.target.value})} required />
                <FormInput label="Email Address" type="email" value={editingClient.email} onChange={(e: any) => setEditingClient({...editingClient, email: e.target.value})} required />
                <FormInput label="Phone Number" type="tel" value={editingClient.phone} onChange={(e: any) => setEditingClient({...editingClient, phone: e.target.value})} />
              </FormSection>
              <FormSection title="Billing Preferences" icon={<CreditCard size={16} />}>
                <FormNumber label="Preferred Billing Day (1-31)" min={1} max={31} value={editingClient.billingDay || ''} onChange={(e: any) => setEditingClient({...editingClient, billingDay: e.target.value ? Number(e.target.value) : undefined})} />
                <FormRow>
                  <p className="text-xs text-slate-400 leading-relaxed">Setting a fixed billing day (e.g., 25th) will consolidate all invoices for this client to be generated on this day of the month, overriding individual contract start dates.</p>
                </FormRow>
              </FormSection>
            </>
          )}
        </form>
      </AccessibleModal>

      {/* Delete Confirmation Modal */}
      <AccessibleModal
        isOpen={!!clientToDelete}
        onClose={() => setClientToDelete(null)}
        title="Delete Client"
        size="sm"
        variant="danger"
        role="alertdialog"
        description={clientToDelete ? `Are you sure you want to delete ${clientToDelete.companyName}? This action cannot be undone.` : undefined}
        onConfirmKey={handleConfirmDelete}
        footer={
          <>
            <ModalButton variant="secondary" onClick={() => setClientToDelete(null)}>Cancel</ModalButton>
            <ModalButton variant="danger" onClick={handleConfirmDelete}>Delete Client</ModalButton>
          </>
        }
      >
        <span />
      </AccessibleModal>
    </>
  );
};
