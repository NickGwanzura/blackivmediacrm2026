
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useToast } from './Toast';
import { getUsers, addUser, updateUser, deleteUser, getAuditLogs, fetchServerAuditLogs, getCompanyLogo, setCompanyLogo, getCompanyProfile, updateCompanyProfile, RELEASE_NOTES, resetSystemData, createSystemBackup, restoreSystemBackup, getLastManualBackupDate, getAutoBackupStatus, getStorageUsage, recordCloudSync, getLastCloudSyncDate, pullFromRemote, getLastSyncedAt } from '../services/mockData';
import { generateFeaturesPDF } from '../services/pdfGenerator';
import { getCurrentUser, approveUser as approveUserApi, inviteUser as inviteUserApi, requestPasswordReset } from '../services/authService';
import { Shield, Download, Phone, MapPin, Edit2, Trash2, AlertTriangle, Cloud, Upload, History, RefreshCw, Database, FileUp, FileDown, Clock, HardDrive, BookOpen, Loader2, Smartphone, Monitor, UserCheck, Mail, Send, KeyRound, Building, ScrollText, Lock, UserPlus, UserCog, Megaphone, CheckCircle2 } from 'lucide-react';
import { broadcastAnnouncement, buildDualCurrencyAnnouncement, BroadcastResult } from '../services/emailService';
import { AccessibleModal, ModalButton } from './ui/AccessibleModal';
import { FormInput, FormSelect, FormSection, FormRow } from './ui/Form';
import { User as UserType, CompanyProfile } from '../types';

type InputChange = (e: React.ChangeEvent<HTMLInputElement>) => void;
type SelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => void;



// RFC 4180 + formula-injection guard for CSV export. Spreadsheet apps
// (Excel, LibreOffice) treat cells starting with =, +, -, @ as formulas,
// which can leak data or run external content. Prefix with a single quote
// to neutralize, and always double-quote + escape embedded quotes.
const csvEscape = (raw: unknown): string => {
  const s = raw === null || raw === undefined ? '' : String(raw);
  const safe = /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
  return `"${safe.replace(/"/g, '""')}"`;
};

export const Settings: React.FC = () => {
  const toast = useToast();
  const currentUser = getCurrentUser();
  const isAdmin = currentUser?.role === 'Admin';
  const [activeTab, setActiveTab] = useState<'General' | 'Audit' | 'Data' | 'ReleaseNotes' | 'Features'>('General');
  const [users, setUsers] = useState<UserType[]>(getUsers());
  const [logoPreview, setLogoPreview] = useState(getCompanyLogo());
  const [profile, setProfile] = useState<CompanyProfile>(getCompanyProfile());
  const [profileDirty, setProfileDirty] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserType | null>(null);
  const [userToDelete, setUserToDelete] = useState<UserType | null>(null);
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState('');
  const [inviteForm, setInviteForm] = useState<{ firstName: string; lastName: string; email: string; role: UserType['role'] }>({ firstName: '', lastName: '', email: '', role: 'Staff' });
  const [inviteError, setInviteError] = useState('');
  const [inviteSending, setInviteSending] = useState(false);
  const [resendingUserId, setResendingUserId] = useState<string | null>(null);
  const [backupStatus, setBackupStatus] = useState({ manual: getLastManualBackupDate(), auto: getAutoBackupStatus(), storage: getStorageUsage(), cloud: getLastCloudSyncDate() });
  const [isSyncing, setIsSyncing] = useState(false);

  // Cloud sync UI state — the underlying plumbing is same-origin to the
  // Neon-backed API (see services/mockData.ts). No user-facing config here;
  // ops owns the deployment via Railway env vars.
  const [isPulling, setIsPulling] = useState(false);
  const [lastSynced, setLastSynced] = useState<string | null>(getLastSyncedAt());

  // Staff announcement broadcast — admin-only. Sends a single pre-composed
  // update (e.g. the dual-currency rollout) to every Active user with an
  // email. See services/emailService.ts → broadcastAnnouncement.
  const [isAnnouncementPreviewOpen, setIsAnnouncementPreviewOpen] = useState(false);
  const [isAnnouncementConfirmOpen, setIsAnnouncementConfirmOpen] = useState(false);
  const [announcementSending, setAnnouncementSending] = useState(false);
  const [announcementResult, setAnnouncementResult] = useState<BroadcastResult | null>(null);

  // Staff recipients: active users with a real email. We exclude Pending /
  // Denied accounts (they shouldn't be notified of feature work until they
  // have access) and anything without an email address.
  const announcementRecipients = useMemo(() => {
    return users
      .filter(u => (u.status || 'Active') === 'Active' && !!u.email)
      .map(u => ({ email: u.email, name: `${u.firstName || ''} ${u.lastName || ''}`.trim() }));
  }, [users]);

  const announcementContent = useMemo(() => buildDualCurrencyAnnouncement(), []);

  const runAnnouncementBroadcast = async () => {
    setAnnouncementSending(true);
    setAnnouncementResult(null);
    try {
      const result = await broadcastAnnouncement(
        announcementRecipients,
        announcementContent.subject,
        announcementContent.html,
        announcementContent.text,
      );
      setAnnouncementResult(result);
      if (result.failed.length === 0) {
        toast.success(`Sent to ${result.sent.length} staff.`);
      } else if (result.sent.length === 0) {
        toast.error(`Broadcast failed for all ${result.failed.length} recipients.`);
      } else {
        toast.warning(`Sent to ${result.sent.length}; ${result.failed.length} failed.`);
      }
    } catch (e: any) {
      toast.error(`Broadcast error: ${e?.message || 'unknown'}`);
    } finally {
      setAnnouncementSending(false);
      setIsAnnouncementConfirmOpen(false);
    }
  };

  // Audit logs are now server-authoritative. Fetch the most recent 500 from
  // /audit/log (Admin-only endpoint) when the Audit tab opens; fall back to
  // the localStorage mirror if the network is unreachable.
  const [auditLogs, setAuditLogs] = useState<ReturnType<typeof getAuditLogs>>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  useEffect(() => {
    if (activeTab !== 'Audit' || !isAdmin) return;
    let cancelled = false;
    setAuditLoading(true);
    fetchServerAuditLogs(500)
      .then(logs => {
        if (cancelled) return;
        // If the server returns nothing (e.g. offline), fall back to the
        // local mirror rather than rendering an empty table.
        setAuditLogs(logs.length > 0 ? logs : getAuditLogs());
      })
      .finally(() => { if (!cancelled) setAuditLoading(false); });
    return () => { cancelled = true; };
  }, [activeTab, isAdmin]);

  useEffect(() => {
      // Refresh backup status when entering Data tab
      if (activeTab === 'Data') {
          setBackupStatus({
              manual: getLastManualBackupDate(),
              auto: getAutoBackupStatus(),
              storage: getStorageUsage(),
              cloud: getLastCloudSyncDate()
          });
      }
  }, [activeTab]);

  // Warn on full-page unload if there are unsaved Company Profile edits.
  // In-app tab switching is guarded separately in the tab button onClick.
  useEffect(() => {
      if (!profileDirty) return;
      const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
      window.addEventListener('beforeunload', handler);
      return () => window.removeEventListener('beforeunload', handler);
  }, [profileDirty]);

  const guardedSetTab = async (next: typeof activeTab) => {
      if (next === activeTab) return;
      if (profileDirty && activeTab === 'General') {
          const leave = await toast.confirm({
              title: 'Unsaved company profile changes',
              message: 'You have unsaved changes to the Company Profile. Leave without saving?',
              variant: 'danger',
              confirmLabel: 'Discard changes'
          });
          if (!leave) return;
          setProfile(getCompanyProfile());
          setProfileDirty(false);
      }
      setActiveTab(next);
  };

  const updateProfileField = <K extends keyof CompanyProfile>(field: K, value: CompanyProfile[K]) => {
      setProfile(prev => ({ ...prev, [field]: value }));
      setProfileDirty(true);
  };

  // Server-side /auth/* enforces Admin for all sensitive settings mutations,
  // but the client also hard-gates the whole module: non-Admins who reach
  // this component (devtools, stale route, etc.) see an access-denied screen
  // and cannot trigger /sync or resetSystemData from here.
  if (!isAdmin) {
    return (
      <div className="max-w-md mx-auto mt-24 bg-white p-10 rounded-2xl shadow-sm border border-slate-100 text-center">
        <div className="w-16 h-16 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-6 border-4 border-amber-100/50">
          <Lock className="text-amber-600" size={28} />
        </div>
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Administrator access required</h2>
        <p className="text-sm text-slate-500 leading-relaxed">
          The Settings module manages users, data, and backend connections. Only accounts with the <strong>Admin</strong> role can view or change these settings.
        </p>
      </div>
    );
  }

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
          if (file.size > 1024 * 1024) { // 1MB limit
              toast.warning("Image size is too large (Max 1MB). Please compress the image.");
              return;
          }
          const reader = new FileReader();
          reader.onloadend = () => {
              const base64 = reader.result as string;
              setLogoPreview(base64);
              setCompanyLogo(base64);
              toast.success("Logo updated and saved successfully.");
          };
          reader.readAsDataURL(file);
      }
  };

  const handleSaveCompanyDetails = () => {
      updateCompanyProfile(profile);
      setProfileDirty(false);
      toast.success("Company details updated successfully.");
  };

  const handleResync = async () => {
      setIsPulling(true);
      const result = await pullFromRemote(false);
      setIsPulling(false);
      setLastSynced(getLastSyncedAt());

      if (result.success) {
          toast.success("Data synced. Reloading to refresh views…");
          setTimeout(() => window.location.reload(), 600);
      } else {
          toast.error(`Sync Failed:\n${result.message}`);
      }
  };

  const handleInviteUser = async (e: React.FormEvent) => {
      e.preventDefault();
      setInviteError('');
      if (!inviteForm.firstName || !inviteForm.lastName || !inviteForm.email) {
          setInviteError('First name, last name, and email are required.');
          return;
      }
      setInviteSending(true);
      try {
          // Server creates the user, hashes a temp password, and emails it.
          const created = await inviteUserApi(
              inviteForm.firstName.trim(),
              inviteForm.lastName.trim(),
              inviteForm.email.trim(),
              inviteForm.role,
          );
          // Mirror into the client cache so the table refreshes without a
          // round-trip. No password is stored client-side.
          addUser(created);
          setUsers(getUsers());
          setIsInviteModalOpen(false);
          setInviteForm({ firstName: '', lastName: '', email: '', role: 'Staff' });
          toast.success(`Invite sent to ${created.email}. User is pending approval.`);
      } catch (err: any) {
          setInviteError(err.message || 'Invite failed.');
      } finally {
          setInviteSending(false);
      }
  };

  const handleResendOrReset = async (user: UserType) => {
      // Admin-initiated reset: fire the same /auth/reset-request that the
      // user's "Forgot password" flow uses. The server generates a signed
      // reset link and emails it; we never handle passwords client-side.
      const ok = await toast.confirm({
          message: `Send a password reset email to ${user.email}?`,
          variant: 'default',
          confirmLabel: 'Send reset email'
      });
      if (!ok) return;
      setResendingUserId(user.id);
      try {
          await requestPasswordReset(user.email);
          toast.success(`Reset email sent to ${user.email}.`);
      } catch (err: any) {
          toast.error(err.message || 'Reset failed.');
      } finally {
          setResendingUserId(null);
      }
  };

  const handleEditUser = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!editingUser) return;
      const original = users.find(u => u.id === editingUser.id);
      const roleChanged = !!original && original.role !== editingUser.role;

      // Role changes (and especially escalations to Admin) are one of the
      // highest-impact actions in the app. Require a typed confirm so a
      // compromised session or a mis-click can't silently grant Admin.
      if (roleChanged) {
          const escalation = editingUser.role === 'Admin' && original?.role !== 'Admin';
          const ok = await toast.confirm({
              title: escalation ? 'Grant administrator access?' : 'Change user role?',
              message: `You are changing ${editingUser.firstName} ${editingUser.lastName}'s role from ${original?.role} to ${editingUser.role}.${escalation ? ' This grants full access to users, data, and the backend connection.' : ''}`,
              variant: escalation ? 'danger' : 'default',
              confirmLabel: escalation ? 'Grant Admin' : 'Change role'
          });
          if (!ok) return;
      }

      updateUser(editingUser);
      setUsers(getUsers());
      setEditingUser(null);
      toast.success(`${editingUser.firstName} ${editingUser.lastName} updated.`);
  };
  const handleConfirmDelete = () => {
      if (!userToDelete) return;
      if (currentUser && userToDelete.id === currentUser.id) {
          toast.error("You can't delete the account you're currently signed in with.");
          setUserToDelete(null);
          return;
      }
      deleteUser(userToDelete.id);
      setUsers(getUsers());
      setUserToDelete(null);
      toast.success(`${userToDelete.firstName} ${userToDelete.lastName} has been removed.`);
  };
  const handleApproveUser = async (user: UserType) => {
      try {
          const approved = await approveUserApi(user.id);
          // Mirror into client cache (and also writes the approval email via Resend).
          updateUser(approved);
          setUsers(getUsers());
          toast.success(`${approved.firstName} ${approved.lastName} has been approved.`);
      } catch (err: any) {
          toast.error(err.message || 'Approval failed.');
      }
  };
  
  const handleExportAuditLogs = () => {
    if (auditLogs.length === 0) { toast.info("No logs to export."); return; }
    const header = ['ID','Timestamp','User','Action','Details'].map(csvEscape).join(',');
    const rows = auditLogs.map(log => [log.id, log.timestamp, log.user, log.action, log.details].map(csvEscape).join(','));
    // UTF-8 BOM (\uFEFF) tells Excel on Windows to decode the file as UTF-8;
    // without it, diacritics in names are mangled as mojibake.
    const csv = '\uFEFF' + [header, ...rows].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `audit_logs_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success("Audit logs exported.");
  };

  const handleDownloadBackup = () => {
    const json = createSystemBackup();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `billboard_suite_backup_${new Date().toISOString().slice(0,10)}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setBackupStatus(prev => ({ ...prev, manual: getLastManualBackupDate() }));
    toast.success("Backup file downloaded.");
  };

  const handleGoogleSync = async () => {
      setIsSyncing(true);
      try {
          const syncTime = await recordCloudSync();
          setBackupStatus(prev => ({ ...prev, cloud: syncTime }));
          toast.success("Restore point created & synced to cloud.");
      } catch (e) {
          toast.error("Failed to create cloud restore point. Check console for details.");
      } finally {
          setIsSyncing(false);
      }
  };

  const handleRestoreBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
            if (event.target?.result) {
                const success = restoreSystemBackup(event.target.result as string);
                if (success) {
                    toast.success("System restored successfully! The page will now reload.");
                    window.location.reload();
                } else {
                    toast.error("Failed to restore backup. Invalid file format.");
                }
            }
        };
        reader.readAsText(file);
    }
  };

  return (
    <>
      <div className="space-y-8 animate-fade-in">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4"><div><h2 className="text-4xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-slate-900 to-slate-600 mb-2">System Settings</h2><p className="text-slate-500 font-medium">Manage organization profile, users, and data</p></div><div className="flex bg-white rounded-full border border-slate-200 p-1 shadow-sm overflow-x-auto max-w-full"><button onClick={() => guardedSetTab('General')} className={`px-5 py-2 rounded-full text-sm font-bold transition-all whitespace-nowrap ${activeTab === 'General' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-500 hover:text-slate-900'}`}>General</button><button onClick={() => guardedSetTab('Data')} className={`px-5 py-2 rounded-full text-sm font-bold transition-all whitespace-nowrap ${activeTab === 'Data' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-500 hover:text-slate-900'}`}>Data</button>{isAdmin && <button onClick={() => guardedSetTab('Audit')} className={`px-5 py-2 rounded-full text-sm font-bold transition-all whitespace-nowrap ${activeTab === 'Audit' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-500 hover:text-slate-900'}`}>Audit</button>}<button onClick={() => guardedSetTab('Features')} className={`px-5 py-2 rounded-full text-sm font-bold transition-all whitespace-nowrap ${activeTab === 'Features' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-500 hover:text-slate-900'}`}>Features</button><button onClick={() => guardedSetTab('ReleaseNotes')} className={`px-5 py-2 rounded-full text-sm font-bold transition-all whitespace-nowrap ${activeTab === 'ReleaseNotes' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-500 hover:text-slate-900'}`}>Release Notes</button></div></div>
        {activeTab === 'General' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-fade-in">
          <div className="lg:col-span-2 space-y-8">
            <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100">
              <div className="flex items-center gap-3 mb-8">
                <div className="p-3 bg-blue-50 rounded-xl"><Building className="w-6 h-6 text-blue-600" /></div>
                <h3 className="text-xl font-bold text-slate-800">Company Profile</h3>
                {profileDirty && <span className="ml-auto text-[10px] font-bold uppercase tracking-wider text-amber-600 bg-amber-50 border border-amber-100 px-2 py-1 rounded-full">Unsaved changes</span>}
              </div>
              <div className="space-y-6">
                <FormSection title="Company Registration">
                  <FormRow>
                    <FormInput label="Company Registered Name" value={profile.name} onChange={e => updateProfileField('name', e.target.value)} />
                  </FormRow>
                  <FormInput label="Tax ID / VAT Number" value={profile.vatNumber} onChange={e => updateProfileField('vatNumber', e.target.value)} />
                  <FormInput label="Registration Number" value={profile.regNumber} onChange={e => updateProfileField('regNumber', e.target.value)} />
                </FormSection>
                <FormSection title="Contact Information" icon={<Phone size={16} />}>
                  <FormInput label="General Email" value={profile.email} onChange={e => updateProfileField('email', e.target.value)} type="email" />
                  <FormInput label="Support Email" value={profile.supportEmail} onChange={e => updateProfileField('supportEmail', e.target.value)} type="email" />
                  <FormInput label="Phone Number" value={profile.phone} onChange={e => updateProfileField('phone', e.target.value)} type="tel" />
                  <FormInput label="Website" value={profile.website} onChange={e => updateProfileField('website', e.target.value)} />
                </FormSection>
                <FormSection title="Location Details" icon={<MapPin size={16} />}>
                  <FormRow>
                    <FormInput label="Street Address" value={profile.address} onChange={e => updateProfileField('address', e.target.value)} />
                  </FormRow>
                  <FormInput label="City" value={profile.city} onChange={e => updateProfileField('city', e.target.value)} />
                  <FormInput label="Country" value={profile.country} onChange={e => updateProfileField('country', e.target.value)} />
                </FormSection>
                <div className="border-t border-slate-50 pt-6">
                  <h4 className="text-xs font-bold uppercase text-slate-400 tracking-wider mb-2">Default Currency</h4>
                  <p className="text-xs text-slate-500 mb-6">Currency pre-selected when creating billboards, expenses, and ad-hoc invoices. Existing rows keep the currency they were saved with; dashboards always split totals per currency.</p>
                  <div className="max-w-xs">
                    <FormSelect
                      label="Default Currency"
                      value={profile.defaultCurrency || 'USD'}
                      onChange={e => updateProfileField('defaultCurrency', e.target.value as CompanyProfile['defaultCurrency'])}
                      options={[
                        { value: 'USD', label: 'USD — US Dollar' },
                        { value: 'ZWG', label: 'ZWG — Zimbabwe Gold' },
                      ]}
                    />
                  </div>
                </div>
              </div>
              <div className="mt-8 flex justify-end pt-4 border-t border-slate-50">
                <button onClick={handleSaveCompanyDetails} disabled={!profileDirty} className="px-8 py-3 bg-slate-900 text-white rounded-xl text-sm font-bold uppercase tracking-wider hover:bg-slate-800 shadow-lg shadow-slate-900/20 transition-all hover:scale-105 disabled:opacity-40 disabled:hover:bg-slate-900 disabled:hover:scale-100 disabled:cursor-not-allowed">Save Changes</button>
              </div>
            </div>
            <div className="bg-white shadow-sm rounded-2xl border border-slate-100 overflow-hidden">
              <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-green-50 rounded-xl"><Shield className="w-6 h-6 text-green-600" /></div>
                  <h3 className="text-lg font-bold text-slate-800">User Access Control</h3>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => { setInviteError(''); setIsInviteModalOpen(true); }} className="flex items-center gap-1 text-sm text-emerald-600 font-bold uppercase tracking-wider hover:bg-emerald-50 px-3 py-2 rounded-lg transition-colors" title="Email an invitation with a temporary password"><Mail size={16} /> Invite</button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-slate-600 min-w-[500px]">
                  <thead className="bg-slate-50/50 border-b border-slate-100">
                    <tr>
                      <th className="px-6 py-4 font-bold text-xs uppercase text-slate-400 tracking-wider">User</th>
                      <th className="px-6 py-4 font-bold text-xs uppercase text-slate-400 tracking-wider">Email</th>
                      <th className="px-6 py-4 font-bold text-xs uppercase text-slate-400 tracking-wider">Role</th>
                      <th className="px-6 py-4 font-bold text-xs uppercase text-slate-400 tracking-wider">Status</th>
                      <th className="px-6 py-4 font-bold text-xs uppercase text-slate-400 tracking-wider text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {users.map(user => (
                      <tr key={user.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-6 py-4 font-medium text-slate-900 flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-500 font-bold border border-slate-300">{user.firstName.charAt(0)}</div>
                          {user.firstName} {user.lastName}
                        </td>
                        <td className="px-6 py-4">{user.email}</td>
                        <td className="px-6 py-4"><span className={`px-2 py-1 rounded text-xs font-bold uppercase tracking-wider ${user.role === 'Admin' ? 'bg-purple-50 text-purple-700' : 'bg-blue-50 text-blue-700'}`}>{user.role}</span></td>
                        <td className="px-6 py-4"><span className={`px-2 py-1 rounded text-xs font-bold uppercase tracking-wider ${user.status === 'Active' ? 'bg-green-50 text-green-700' : user.status === 'Denied' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}>{user.status || 'Active'}</span></td>
                        <td className="px-6 py-4 flex justify-end gap-2">
                          {user.status === 'Pending' && (<button onClick={() => handleApproveUser(user)} className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors" title="Approve User"><UserCheck size={16}/></button>)}
                          <button onClick={() => handleResendOrReset(user)} disabled={resendingUserId === user.id || !user.email} className="p-2 text-slate-400 hover:bg-indigo-50 hover:text-indigo-600 rounded-lg transition-colors disabled:opacity-40" title={user.status === 'Pending' ? 'Resend invite email' : 'Reset password and email the new one'}>
                            {resendingUserId === user.id ? <Loader2 size={16} className="animate-spin" /> : user.status === 'Pending' ? <Send size={16} /> : <KeyRound size={16} />}
                          </button>
                          <button onClick={() => setEditingUser(user)} className="p-2 text-slate-400 hover:bg-white hover:shadow-sm hover:text-slate-800 rounded-lg transition-all border border-transparent hover:border-slate-100" title="Edit user"><Edit2 size={16} /></button>
                          <button onClick={() => setUserToDelete(user)} disabled={!!currentUser && currentUser.id === user.id} className="p-2 text-slate-400 hover:bg-red-50 hover:text-red-500 rounded-lg transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400" title={!!currentUser && currentUser.id === user.id ? "You can't delete your own account" : 'Delete user'}><Trash2 size={16} /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
              <h3 className="text-lg font-bold text-slate-800 mb-6">Branding & Identity</h3>
              <div className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-slate-200 rounded-2xl mb-6 bg-slate-50/50 hover:bg-slate-50 transition-colors">
                <div className="text-center relative group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                  <div className="w-24 h-24 bg-white rounded-full mx-auto mb-4 flex items-center justify-center overflow-hidden shadow-md border-4 border-white group-hover:scale-105 transition-transform">
                    <img src={logoPreview} alt="Logo" className="w-full h-full object-cover"/>
                  </div>
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="bg-black/50 text-white text-xs font-bold px-2 py-1 rounded">Change</div>
                  </div>
                  <p className="text-sm font-medium text-slate-600">Company Logo</p>
                  <p className="text-xs text-slate-400 mt-1">Click to Upload (Max 1MB)</p>
                  <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleLogoUpload}/>
                </div>
              </div>
              <button onClick={() => fileInputRef.current?.click()} className="w-full py-3 border border-slate-200 rounded-xl text-xs font-bold uppercase tracking-wider text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-all flex items-center justify-center gap-2"><Upload size={14}/> Upload New Logo</button>
            </div>
            <div className="bg-gradient-to-br from-blue-900 to-slate-900 p-6 rounded-2xl shadow-lg text-white relative overflow-hidden group">
              <div className="relative z-10">
                <h3 className="text-lg font-bold mb-2 flex items-center gap-2"><Cloud size={18}/> System Status</h3>
                <div className="flex items-center gap-2 mb-6">
                  <div className="w-2.5 h-2.5 rounded-full bg-green-400 animate-pulse shadow-[0_0_10px_rgba(74,222,128,0.5)]"></div>
                  <span className="text-blue-100 text-sm font-medium">Systems Operational</span>
                </div>
                <div className="space-y-2 text-xs text-blue-200/80 border-t border-white/10 pt-4 font-mono">
                  <p className="flex justify-between"><span>Last synced</span><span className="text-white">{lastSynced ? new Date(lastSynced).toLocaleTimeString() : 'never'}</span></p>
                  <p className="flex justify-between"><span>Version</span><span className="text-white">{RELEASE_NOTES[0].version}</span></p>
                  <p className="flex justify-between"><span>Build</span><span className="text-white">Production-Clean</span></p>
                </div>
                <button
                  onClick={handleResync}
                  disabled={isPulling}
                  className="mt-5 w-full py-2.5 bg-white/10 hover:bg-white/20 border border-white/20 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isPulling ? <Loader2 className="animate-spin" size={14}/> : <RefreshCw size={14}/>}
                  {isPulling ? 'Syncing…' : 'Resync from Neon'}
                </button>
              </div>
              <div className="absolute -bottom-12 -right-12 w-48 h-48 bg-blue-500 rounded-full blur-3xl opacity-20 group-hover:opacity-30 transition-opacity"></div>
              <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500 rounded-full blur-3xl opacity-10"></div>
            </div>
          </div>
        </div>
        )}
        {activeTab === 'Data' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-fade-in">
                <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100 h-fit">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-3 bg-indigo-50 rounded-xl text-indigo-600"><Database size={24} /></div>
                        <div>
                            <h3 className="text-lg font-bold text-slate-800">Local Data Management</h3>
                            <p className="text-xs text-slate-500">Backup and transfer data between devices</p>
                        </div>
                    </div>
                    
                    <div className="mb-6 bg-slate-50 p-4 rounded-xl border border-slate-100 flex flex-col gap-4">
                        <div className="flex justify-between items-center">
                            <div>
                                <p className="text-xs font-bold uppercase text-slate-400 tracking-wider mb-1">Last Auto-Backup</p>
                                <p className="text-sm font-medium text-slate-700">{backupStatus.auto}</p>
                            </div>
                            <div className="h-8 w-[1px] bg-slate-200"></div>
                            <div>
                                <p className="text-xs font-bold uppercase text-slate-400 tracking-wider mb-1">Last Snapshot</p>
                                <p className="text-sm font-medium text-slate-700">{backupStatus.cloud}</p>
                            </div>
                        </div>
                        <div className="pt-4 border-t border-slate-200 flex justify-between items-center">
                             <div className="flex items-center gap-2">
                                <HardDrive size={16} className="text-slate-400"/>
                                <span className="text-xs font-bold uppercase text-slate-500">Local Storage</span>
                             </div>
                             <span className="text-xs font-bold text-slate-800 bg-white px-2 py-1 rounded border border-slate-200">{backupStatus.storage} KB Used</span>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm">
                             <h4 className="text-sm font-bold text-slate-800 mb-2 flex items-center gap-2"><Cloud size={16}/> Create Restore Point</h4>
                             <p className="text-xs text-slate-500 mb-4">Creates a timestamped snapshot of all data and syncs it to Neon (if the API is connected).</p>
                             <button onClick={handleGoogleSync} disabled={isSyncing} className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold uppercase tracking-wider transition-colors shadow-lg shadow-blue-500/30 flex items-center justify-center gap-2">
                                 {isSyncing ? <Loader2 className="animate-spin" size={16}/> : <Upload size={16}/>}
                                 {isSyncing ? 'Syncing...' : 'Create & Sync Restore Point'}
                             </button>
                        </div>

                        <div className="p-4 bg-indigo-50/50 rounded-xl border border-indigo-100 shadow-sm relative overflow-hidden">
                             <div className="absolute top-0 right-0 bg-indigo-100 p-2 rounded-bl-xl"><Monitor size={16} className="text-indigo-600 inline-block mr-1"/><Smartphone size={16} className="text-indigo-600 inline-block"/></div>
                             <h4 className="text-sm font-bold text-slate-800 mb-1 flex items-center gap-2"><FileDown size={16}/> Cross-Device Transfer</h4>
                             <p className="text-xs text-slate-500 mb-4 pr-8">To move data to another device (e.g. laptop to phone), download this backup file and restore it on the target device.</p>
                             <button onClick={handleDownloadBackup} className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold uppercase tracking-wider transition-colors shadow-lg shadow-indigo-500/30">Download Backup File</button>
                        </div>
                        
                        <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm">
                             <h4 className="text-sm font-bold text-slate-800 mb-1 flex items-center gap-2"><FileUp size={16}/> Restore Data</h4>
                             <p className="text-xs text-slate-500 mb-4">Upload a JSON backup file to overwrite current data on this device.</p>
                             <label className="w-full py-3 bg-white border border-slate-200 hover:bg-slate-100 text-slate-600 rounded-xl text-sm font-bold uppercase tracking-wider transition-colors cursor-pointer flex justify-center">
                                 Upload & Restore
                                 <input type="file" className="hidden" accept=".json" onChange={handleRestoreBackup} />
                             </label>
                        </div>
                    </div>
                </div>

                <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100 h-fit">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-3 bg-red-50 rounded-xl text-red-600"><AlertTriangle size={24} /></div>
                        <div>
                            <h3 className="text-lg font-bold text-slate-800">Danger Zone</h3>
                            <p className="text-xs text-slate-500">Irreversible system actions</p>
                        </div>
                    </div>
                    <div className="space-y-6">
                        <div className="p-6 bg-red-50/50 rounded-2xl border border-red-50">
                            <h4 className="text-sm font-bold text-red-900 mb-2">Reset Application Data</h4>
                            <p className="text-xs text-red-700/80 mb-6 leading-relaxed">This action will <strong>PERMANENTLY DELETE</strong> all local data including clients, contracts, and financial records. This cannot be undone.</p>
                            <button onClick={() => setIsResetConfirmOpen(true)} className="w-full py-3 bg-white border border-red-200 text-red-600 hover:bg-red-50 rounded-xl text-sm font-bold uppercase tracking-wider transition-colors">Reset System</button>
                        </div>
                    </div>
                </div>
            </div>
        )}
        {activeTab === 'Audit' && isAdmin && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden animate-fade-in"><div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/30"><div className="flex items-center gap-3"><div className="p-2 bg-slate-100 rounded-xl text-slate-600"><ScrollText size={20}/></div><div><h3 className="text-lg font-bold text-slate-800">Admin Audit Logs</h3><p className="text-xs text-slate-500 font-medium">Track system-wide events and security actions</p></div></div><button onClick={handleExportAuditLogs} className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 hover:border-slate-300 px-4 py-2.5 rounded-xl transition-all shadow-sm">{auditLoading ? <Loader2 size={14} className="animate-spin"/> : <Download size={14}/>} Export CSV</button></div><div className="overflow-x-auto"><table className="w-full text-left text-sm text-slate-600 min-w-[600px]"><thead className="bg-slate-50/50 border-b border-slate-100"><tr><th className="px-6 py-4 font-bold text-xs uppercase text-slate-400 tracking-wider">Timestamp</th><th className="px-6 py-4 font-bold text-xs uppercase text-slate-400 tracking-wider">User</th><th className="px-6 py-4 font-bold text-xs uppercase text-slate-400 tracking-wider">Action</th><th className="px-6 py-4 font-bold text-xs uppercase text-slate-400 tracking-wider">Details</th></tr></thead><tbody className="divide-y divide-slate-100">{auditLogs.map(log => (<tr key={log.id} className="hover:bg-slate-50 transition-colors"><td className="px-6 py-4 font-mono text-xs text-slate-500">{log.timestamp}</td><td className="px-6 py-4 font-bold text-slate-800">{log.user}</td><td className="px-6 py-4"><span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 text-[10px] font-bold uppercase tracking-wide border border-slate-200">{log.action}</span></td><td className="px-6 py-4 text-slate-600">{log.details}</td></tr>))}</tbody></table></div></div>
        )}
        {activeTab === 'Features' && (
            <div className="max-w-4xl mx-auto animate-fade-in space-y-8">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-indigo-50 rounded-2xl text-indigo-600"><BookOpen size={24} /></div>
                        <div>
                            <h3 className="text-2xl font-bold text-slate-800">App Features & Documentation</h3>
                            <p className="text-slate-500">System capabilities and usage guide</p>
                        </div>
                    </div>
                    <button onClick={generateFeaturesPDF} className="bg-slate-900 text-white px-6 py-3 rounded-xl font-bold uppercase text-xs tracking-wider hover:bg-slate-800 transition-all shadow-lg shadow-slate-900/20 flex items-center gap-2">
                        <Download size={14}/> Download Features PDF
                    </button>
                </div>
                <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100">
                    <div className="prose prose-slate max-w-none">
                        <h4 className="text-lg font-bold text-slate-900 mb-4">Core Capabilities</h4>
                        <ul className="space-y-2 text-slate-600 text-sm list-disc pl-5">
                            <li><strong>Inventory Management:</strong> Track Static and LED assets, map view, and visibility analysis.</li>
                            <li><strong>Interactive Map:</strong> Visualize asset locations on a dynamic map with filtering options.</li>
                            <li><strong>Client CRM:</strong> Manage client details, contact information, and billing preferences.</li>
                            <li><strong>Contract Management:</strong> Create, track, and generate PDF contracts for rentals.</li>
                            <li><strong>Financial Suite:</strong> Generate professional Invoices, Quotations, and Receipts. Track VAT and payments.</li>
                            <li><strong>Maintenance Automation:</strong> Automatic generation of 3-month structural check tasks for all assets.</li>
                            <li><strong>Data Persistence:</strong> Robust local storage. Use Backup/Restore for cross-device transfer.</li>
                            <li><strong>AI Analyst:</strong> Built-in AI to analyze revenue trends and generate rental proposals.</li>
                        </ul>

                        <h4 className="text-lg font-bold text-slate-900 mt-8 mb-4">Author & Credits</h4>
                        <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-xl border border-slate-100">
                            <div className="w-10 h-10 bg-slate-900 rounded-full flex items-center justify-center text-white font-bold">NG</div>
                            <div>
                                <p className="text-sm font-bold text-slate-900">Nicholas Gwanzura</p>
                                <p className="text-xs text-slate-500">Lead Developer & System Architect</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        )}
        {activeTab === 'ReleaseNotes' && (
            <div className="max-w-4xl mx-auto animate-fade-in space-y-8">
                <div className="flex items-center gap-4 mb-6">
                    <div className="p-3 bg-indigo-50 rounded-2xl text-indigo-600"><History size={24} /></div>
                    <div>
                        <h3 className="text-2xl font-bold text-slate-800">Release Notes</h3>
                        <p className="text-slate-500">System updates and changelog history</p>
                    </div>
                </div>

                {isAdmin && (
                    <div className="bg-gradient-to-br from-indigo-50 via-white to-white rounded-2xl border border-indigo-100 p-6 shadow-sm">
                        <div className="flex items-start justify-between gap-4 flex-wrap">
                            <div className="flex items-start gap-4 min-w-0">
                                <div className="p-3 bg-white rounded-2xl text-indigo-600 shadow-sm border border-indigo-100 shrink-0"><Megaphone size={22} /></div>
                                <div className="min-w-0">
                                    <h4 className="text-base font-bold text-slate-900">Broadcast staff announcement</h4>
                                    <p className="text-sm text-slate-500 mt-1">Emails every active staff account the pre-written dual-currency update. One email per recipient via Resend — clients are <strong>not</strong> included.</p>
                                    <div className="flex flex-wrap gap-2 mt-3 text-xs">
                                        <span className="px-2.5 py-1 rounded-full bg-white border border-slate-200 text-slate-600 font-bold uppercase tracking-wider">{announcementRecipients.length} recipient{announcementRecipients.length === 1 ? '' : 's'}</span>
                                        <span className="px-2.5 py-1 rounded-full bg-white border border-slate-200 text-slate-600 font-bold uppercase tracking-wider">Subject: Dual-currency support is live</span>
                                    </div>
                                </div>
                            </div>
                            <div className="flex gap-2 shrink-0">
                                <button onClick={() => setIsAnnouncementPreviewOpen(true)} className="px-4 py-2 text-sm font-bold uppercase tracking-wider text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">Preview</button>
                                <button
                                    onClick={() => setIsAnnouncementConfirmOpen(true)}
                                    disabled={announcementRecipients.length === 0 || announcementSending}
                                    className="px-4 py-2 text-sm font-bold uppercase tracking-wider text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 shadow-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
                                >
                                    {announcementSending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                                    {announcementSending ? 'Sending…' : 'Send Announcement'}
                                </button>
                            </div>
                        </div>
                        {announcementResult && (
                            <div className="mt-5 p-4 rounded-xl bg-white border border-slate-100">
                                <div className="flex items-center gap-2 mb-2 text-sm font-bold text-slate-800">
                                    <CheckCircle2 size={16} className="text-emerald-500" />
                                    Last broadcast: {announcementResult.sent.length} sent · {announcementResult.failed.length} failed · {announcementResult.total} total
                                </div>
                                {announcementResult.failed.length > 0 && (
                                    <ul className="text-xs text-rose-600 space-y-1 mt-2 max-h-40 overflow-y-auto">
                                        {announcementResult.failed.map((f, i) => (
                                            <li key={i} className="font-mono">{f.email}: {f.message}</li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        )}
                    </div>
                )}
                
                {/* Scrollable Container Added Here */}
                <div className="relative border-l-2 border-slate-200 ml-3 space-y-12 pb-12 max-h-[600px] overflow-y-auto pr-4 scrollbar-thin scrollbar-thumb-slate-200">
                    {RELEASE_NOTES.map((release, idx) => (
                        <div key={idx} className="relative pl-8">
                            <div className={`absolute -left-[9px] top-0 w-4 h-4 rounded-full border-2 border-white shadow-sm ${idx === 0 ? 'bg-indigo-600' : 'bg-slate-300'}`}></div>
                            <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100 hover:shadow-md transition-shadow">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
                                    <div>
                                        <div className="flex items-center gap-3 mb-1">
                                            <span className="text-lg font-bold text-slate-900">v{release.version}</span>
                                            {idx === 0 && <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 text-[10px] font-bold uppercase rounded-full tracking-wider">Latest</span>}
                                        </div>
                                        <h4 className="text-slate-700 font-medium">{release.title}</h4>
                                    </div>
                                    <span className="text-xs font-mono text-slate-400 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100 flex items-center gap-2">
                                        <Clock size={12}/> {release.date}
                                    </span>
                                </div>
                                <ul className="space-y-3">
                                    {release.features.map((feature, fIdx) => (
                                        <li key={fIdx} className="flex items-start gap-3 text-sm text-slate-600">
                                            <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-green-500 shrink-0"></div>
                                            {feature}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        )}
      </div>
      <AccessibleModal
        isOpen={isInviteModalOpen}
        onClose={() => { setIsInviteModalOpen(false); setInviteError(''); }}
        title="Invite User"
        description="A temporary password is generated and emailed via Resend. The invitee signs in and their account activates after admin approval."
        size="md"
        variant="default"
        icon={<UserPlus size={20} />}
        preventClose={inviteSending}
        closeOnOverlayClick={false}
        footer={
          <>
            <ModalButton variant="secondary" onClick={() => { setIsInviteModalOpen(false); setInviteError(''); }} disabled={inviteSending}>
              Cancel
            </ModalButton>
            <ModalButton variant="primary" type="submit" form="invite-user-form" loading={inviteSending}>
              Send Invite
            </ModalButton>
          </>
        }
      >
        <form id="invite-user-form" onSubmit={handleInviteUser} className="space-y-6">
          <FormSection title="Invite Details">
            <FormInput label="First Name" value={inviteForm.firstName} onChange={(e: any) => { setInviteForm({...inviteForm, firstName: e.target.value}); setInviteError(''); }} required />
            <FormInput label="Last Name" value={inviteForm.lastName} onChange={(e: any) => { setInviteForm({...inviteForm, lastName: e.target.value}); setInviteError(''); }} required />
            <FormInput label="Email Address" type="email" value={inviteForm.email} onChange={(e: any) => { setInviteForm({...inviteForm, email: e.target.value}); setInviteError(''); }} required />
            <FormSelect label="Role" value={inviteForm.role} onChange={(e: any) => setInviteForm({...inviteForm, role: e.target.value})} options={[{value: 'Admin', label: 'Admin (Full Access)'},{value: 'Manager', label: 'Manager (No Settings)'},{value: 'Staff', label: 'Staff (Read Only)'}]} />
          </FormSection>
          {inviteError && <p className="text-red-500 text-xs font-bold bg-red-50 border border-red-100 rounded-lg px-3 py-2">{inviteError}</p>}
        </form>
      </AccessibleModal>
      <AccessibleModal
        isOpen={!!editingUser}
        onClose={() => setEditingUser(null)}
        title={`Edit ${editingUser ? `${editingUser.firstName} ${editingUser.lastName}` : 'User'}`}
        size="lg"
        variant="default"
        icon={<UserCog size={20} />}
        closeOnOverlayClick={false}
        footer={
          <>
            <ModalButton variant="secondary" onClick={() => setEditingUser(null)}>
              Cancel
            </ModalButton>
            <ModalButton variant="primary" type="submit" form="edit-user-form">
              Save Changes
            </ModalButton>
          </>
        }
      >
        {editingUser && (
          <form id="edit-user-form" onSubmit={handleEditUser} className="space-y-6">
            <FormSection title="User Details">
              <FormInput label="First Name" value={editingUser.firstName} onChange={(e: any) => setEditingUser({...editingUser, firstName: e.target.value})} required />
              <FormInput label="Last Name" value={editingUser.lastName} onChange={(e: any) => setEditingUser({...editingUser, lastName: e.target.value})} required />
              <FormInput label="Email Address" type="email" value={editingUser.email} onChange={(e: any) => setEditingUser({...editingUser, email: e.target.value})} required />
              <FormSelect label="Role" value={editingUser.role} onChange={(e: any) => setEditingUser({...editingUser, role: e.target.value as any})} options={[{value: 'Admin', label: 'Admin (Full Access)'},{value: 'Manager', label: 'Manager (No Settings)'},{value: 'Staff', label: 'Staff (Read Only)'}]} />
              <FormSelect label="Status" value={editingUser.status || 'Active'} onChange={(e: any) => setEditingUser({...editingUser, status: e.target.value as any})} options={[{value: 'Active', label: 'Active'},{value: 'Pending', label: 'Pending Approval'},{value: 'Denied', label: 'Denied / Suspended'}]} />
            </FormSection>
            {!!currentUser && currentUser.id === editingUser.id && editingUser.role !== 'Admin' && (
              <p className="text-xs text-amber-600 font-semibold bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">You're changing your own role away from Admin. You may lose access to this page after saving.</p>
            )}
          </form>
        )}
      </AccessibleModal>
      <AccessibleModal
        isOpen={!!userToDelete}
        onClose={() => setUserToDelete(null)}
        title="Delete User"
        description={userToDelete ? `Remove ${userToDelete.firstName} ${userToDelete.lastName} from the system? This cannot be undone.` : undefined}
        size="sm"
        role="alertdialog"
        variant="danger"
        onConfirmKey={handleConfirmDelete}
        footer={
          <>
            <ModalButton variant="secondary" onClick={() => setUserToDelete(null)}>
              Cancel
            </ModalButton>
            <ModalButton variant="danger" onClick={handleConfirmDelete}>
              Delete User
            </ModalButton>
          </>
        }
      >
        <p className="text-sm text-slate-500">
          Are you sure you want to remove <span className="font-bold text-slate-700">{userToDelete?.firstName} {userToDelete?.lastName}</span> from the system? This action cannot be undone.
        </p>
      </AccessibleModal>
      <AccessibleModal
        isOpen={isResetConfirmOpen}
        onClose={() => { setIsResetConfirmOpen(false); setResetConfirmText(''); }}
        title="Reset Application Data"
        description="This action permanently deletes all local data and cannot be undone."
        size="sm"
        role="alertdialog"
        variant="danger"
        closeOnOverlayClick={false}
        footer={
          <>
            <ModalButton variant="secondary" onClick={() => { setIsResetConfirmOpen(false); setResetConfirmText(''); }}>
              Cancel
            </ModalButton>
            <ModalButton variant="danger" onClick={resetSystemData} disabled={resetConfirmText !== 'RESET'}>
              Wipe Data
            </ModalButton>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600 leading-relaxed">
            This action will <strong>PERMANENTLY DELETE</strong> all local data including clients, contracts, and financial records. This cannot be undone.
          </p>
          <div>
            <p className="text-xs text-slate-500 mb-2">Type <span className="font-mono font-bold text-red-700">RESET</span> to confirm:</p>
            <input
              type="text"
              value={resetConfirmText}
              onChange={e => setResetConfirmText(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              className="w-full px-4 py-3 border border-red-200 rounded-xl font-mono text-sm uppercase tracking-widest focus:border-red-500 focus:ring-0 outline-none"
              placeholder="RESET"
            />
          </div>
        </div>
      </AccessibleModal>

      {/* Announcement preview: renders the actual HTML that will be emailed
          so admins can review before firing. No network activity here. */}
      <AccessibleModal
        isOpen={isAnnouncementPreviewOpen}
        onClose={() => setIsAnnouncementPreviewOpen(false)}
        title="Announcement preview"
        description={announcementContent.subject}
        size="lg"
        icon={<Megaphone size={20} />}
        mobileLayout="sheet"
        footer={
          <>
            <ModalButton variant="secondary" onClick={() => setIsAnnouncementPreviewOpen(false)}>Close</ModalButton>
            <ModalButton variant="primary" onClick={() => { setIsAnnouncementPreviewOpen(false); setIsAnnouncementConfirmOpen(true); }}>
              <Send size={14} className="mr-1.5" /> Continue to send
            </ModalButton>
          </>
        }
      >
        <div className="space-y-3">
          <div className="text-xs text-slate-500 font-bold uppercase tracking-wider">Recipients</div>
          <div className="text-sm text-slate-700 bg-slate-50 border border-slate-100 rounded-xl p-3 max-h-40 overflow-y-auto">
            {announcementRecipients.length === 0 ? (
              <span className="text-slate-400 italic">No active staff with email addresses on file.</span>
            ) : (
              <ul className="space-y-1 font-mono text-xs">
                {announcementRecipients.map((r, i) => (
                  <li key={i}>{r.email}{r.name ? ` — ${r.name}` : ''}</li>
                ))}
              </ul>
            )}
          </div>
          <div className="text-xs text-slate-500 font-bold uppercase tracking-wider pt-2">Body</div>
          <div className="border border-slate-200 rounded-xl p-4 bg-white max-h-[420px] overflow-y-auto" dangerouslySetInnerHTML={{ __html: announcementContent.html }} />
        </div>
      </AccessibleModal>

      {/* Explicit confirm — sending is irreversible once Resend accepts. */}
      <AccessibleModal
        isOpen={isAnnouncementConfirmOpen}
        onClose={() => !announcementSending && setIsAnnouncementConfirmOpen(false)}
        title={`Send to ${announcementRecipients.length} staff?`}
        description="One email per recipient via Resend. This cannot be undone."
        size="sm"
        variant="default"
        icon={<Send size={20} />}
        preventClose={announcementSending}
        closeOnOverlayClick={!announcementSending}
        footer={
          <>
            <ModalButton variant="secondary" onClick={() => setIsAnnouncementConfirmOpen(false)} disabled={announcementSending}>Cancel</ModalButton>
            <ModalButton variant="primary" onClick={runAnnouncementBroadcast} loading={announcementSending} disabled={announcementRecipients.length === 0}>
              {announcementSending ? 'Sending…' : `Send now`}
            </ModalButton>
          </>
        }
      >
        <div className="text-sm text-slate-600 space-y-2">
          <p>Subject: <strong className="text-slate-900">{announcementContent.subject}</strong></p>
          <p className="text-xs text-slate-500">Per-recipient success and failure will be shown after the broadcast completes. If any addresses bounce you can resend individually from the failures list.</p>
        </div>
      </AccessibleModal>
    </>
  );
};
