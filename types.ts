
export enum BillboardType {
  Static = 'Static',
  LED = 'LED'
}

export interface Billboard {
  id: string;
  name: string;
  location: string;
  town: string;
  type: BillboardType;
  width: number;
  height: number;
  imageUrl?: string; // Base64 or URL
  coordinates: {
    lat: number;
    lng: number;
  };
  
  // Marketing Info
  visibility?: string; // Traffic analysis, demographics, etc.

  // For Static with independent pricing
  sideARate?: number;
  sideBRate?: number;
  sideAStatus?: 'Available' | 'Rented';
  sideBStatus?: 'Available' | 'Rented';
  sideAClientId?: string;
  sideBClientId?: string;
  
  // For LED
  ratePerSlot?: number;
  totalSlots?: number;
  rentedSlots?: number;
}

export interface OutsourcedBillboard {
  id: string;
  billboardId: string; // Linked to internal inventory
  billboardName?: string; // Cache for display
  mediaOwner: string; // The 3rd party
  ownerContact: string;
  monthlyPayout: number; // Revenue from them
  contractStart: string;
  contractEnd: string;
  status: 'Active' | 'Inactive';
}

export interface Client {
  id: string;
  companyName: string;
  contactPerson: string;
  email: string;
  phone: string;
  status: 'Active' | 'Inactive';
  billingDay?: number; // Preferred day of month for payment
}

export interface Contract {
  id: string;
  clientId: string;
  billboardId: string;
  startDate: string;
  endDate: string;
  
  // Financials
  monthlyRate: number;
  installationCost: number; // One-time fee
  printingCost: number; // Tied to a printing job
  hasVat: boolean;
  totalContractValue: number; // (Monthly * Months) + Install + Print + VAT
  
  status: 'Active' | 'Pending' | 'Expired';
  details: string; // e.g., "Side A" or "Slot 5"
  
  // Specific Tracking
  slotNumber?: number; 
  side?: 'A' | 'B' | 'Both'; 
}

export interface Invoice {
  id: string;
  contractId?: string; // Single contract link (Legacy/Simple)
  contractIds?: string[]; // Multiple contract links (Batch/Consolidated)
  clientId: string;
  date: string;
  items: { description: string; amount: number }[];
  subtotal: number;
  vatAmount: number; // 0 if hasVat is false
  total: number;
  status: 'Paid' | 'Pending' | 'Overdue';
  type: 'Invoice' | 'Quotation' | 'Receipt';
  
  // Audit Trail
  paymentMethod?: 'Cash' | 'Bank Transfer' | 'EcoCash' | 'Other';
  paymentReference?: string;
}

export interface PrintingJob {
  id: string;
  clientId: string;
  billboardId?: string; // Optional link to installation
  date: string;
  description: string;
  dimensions: string; // e.g. "12x3m"
  
  // Cost Breakdown
  pvcCost: number;
  inkCost: number;
  electricityCost: number;
  operatorCost: number;
  weldingCost: number;
  
  totalCost: number;
  chargedAmount: number; // What we charged the client (Profit margin)
}

export interface Expense {
  id: string;
  category: 'Maintenance' | 'Printing' | 'Electricity' | 'Labor' | 'Other';
  description: string;
  amount: number;
  date: string;
  reference?: string;
}

export interface MaintenanceLog {
  id: string;
  billboardId: string;
  date: string;
  type: 'Visual Check' | 'Structural' | 'Electrical' | 'Cleaning' | 'Repair';
  technician: string;
  notes: string;
  status: 'Pass' | 'Fail' | 'Needs Attention';
  nextDueDate: string; // Calculated field (usually date + 3 months)
  cost?: number;
}

export interface User {
  id: string;
  firstName: string;
  lastName: string;
  role: 'Admin' | 'Manager' | 'Staff';
  email: string;
  /** @deprecated Passwords are stored server-side only. Never set from the client. */
  password?: string;
  status?: 'Active' | 'Pending' | 'Denied'; // Approval Workflow
  mustChangePassword?: boolean; // True after invite / admin-reset; cleared on change
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  action: string;
  details: string;
  user: string;
}

export interface CompanyProfile {
    name: string;
    vatNumber: string;
    regNumber: string;
    email: string;
    supportEmail: string;
    phone: string;
    website: string;
    address: string;
    city: string;
    country: string;
}

export const VAT_RATE = 0.15;

// ==========================================
// CRM OUTREACH TRACKING SYSTEM
// (Ported from Dreambox project)
// ==========================================

export type OpportunityStatus =
  | 'new'
  | 'contacted'
  | 'qualified'
  | 'proposal'
  | 'negotiation'
  | 'closed_won'
  | 'closed_lost';

export type OpportunityStage =
  | 'new_lead'
  | 'initial_contact'
  | 'discovery_call'
  | 'site_survey'
  | 'proposal_sent'
  | 'negotiation'
  | 'contract_pending'
  | 'closed_won'
  | 'closed_lost'
  | 'nurture';

export type TouchpointType =
  | 'email_sent'
  | 'email_opened'
  | 'email_clicked'
  | 'email_replied'
  | 'call_made'
  | 'call_connected'
  | 'call_voicemail'
  | 'call_no_answer'
  | 'linkedin_connect'
  | 'linkedin_message'
  | 'linkedin_view'
  | 'meeting_scheduled'
  | 'meeting_completed'
  | 'meeting_no_show'
  | 'sms_sent'
  | 'whatsapp_sent'
  | 'note_added';

export type TouchpointDirection = 'outbound' | 'inbound';

export type TouchpointOutcome =
  | 'successful'
  | 'no_answer'
  | 'callback_requested'
  | 'not_interested'
  | 'follow_up_required'
  | 'meeting_booked'
  | 'proposal_requested'
  | 'objection_price'
  | 'objection_timing'
  | 'unsubscribe';

export type TouchpointSentiment =
  | 'positive'
  | 'neutral'
  | 'negative'
  | 'objection'
  | 'buying_signal'
  | 'urgent';

export type CRMTaskType =
  | 'call'
  | 'email'
  | 'meeting'
  | 'proposal'
  | 'follow_up'
  | 'site_survey'
  | 'contract_review';

export type CRMTaskStatus =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'overdue'
  | 'cancelled';

export type CRMTaskPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface CRMCompany {
  id: string;
  name: string;
  industry?: string;
  website?: string;
  streetAddress?: string;
  city?: string;
  country?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CRMContact {
  id: string;
  companyId: string;
  fullName: string;
  jobTitle?: string;
  phone?: string;
  email?: string;
  linkedinUrl?: string;
  isPrimary: boolean;
  createdAt: string;
}

export interface CRMOpportunity {
  id: string;

  companyId: string;
  primaryContactId: string;
  secondaryContactId?: string;

  locationInterest?: string;
  billboardType?: string;
  campaignDuration?: string;

  estimatedValue?: number;
  actualValue?: number;

  status: OpportunityStatus;
  stage: OpportunityStage;

  leadSource?: string;

  lastContactDate?: string;
  nextFollowUpDate?: string;
  callOutcomeNotes?: string;
  numberOfAttempts: number;

  assignedTo?: string;
  createdBy: string;

  createdAt: string;
  updatedAt: string;
  closedAt?: string;
  closedReason?: string;

  daysInCurrentStage: number;
  stageHistory: StageHistoryEntry[];
}

export interface StageHistoryEntry {
  stage: OpportunityStage;
  enteredAt: string;
  exitedAt?: string;
  daysInStage: number;
}

export interface CRMTouchpoint {
  id: string;
  opportunityId: string;

  type: TouchpointType;
  direction: TouchpointDirection;

  subject?: string;
  content?: string;
  clientResponse?: string;

  outcome?: TouchpointOutcome;
  sentiment?: TouchpointSentiment;
  durationSeconds?: number;

  createdBy: string;
  createdAt: string;
}

export interface CRMTask {
  id: string;
  opportunityId: string;

  type: CRMTaskType;
  title: string;
  description?: string;

  dueDate: string;
  status: CRMTaskStatus;
  priority: CRMTaskPriority;

  assignedTo: string;
  completedBy?: string;
  completedAt?: string;
  completionNotes?: string;

  createdAt: string;
  createdBy: string;
}

export interface CRMCSVRow {
  'Company Name': string;
  'Company Industry'?: string;
  'Website'?: string;
  'Primary Contact Name': string;
  'Job Title'?: string;
  'Phone Number'?: string;
  'Email Address'?: string;
  'LinkedIn Profile'?: string;
  'Secondary Contact'?: string;
  'Location Interest (Zone/City)'?: string;
  'Billboard Type Interest'?: string;
  'Campaign Duration'?: string;
  'Estimated Deal Value'?: string | number;
  'Opportunity Status': OpportunityStatus;
  'Opportunity Stage'?: OpportunityStage;
  'Lead Source'?: string;
  'Last Contact Date'?: string;
  'Next Follow-Up Date'?: string;
  'Call Outcome/Notes'?: string;
  'Number of Attempts'?: string | number;
  'Street Address'?: string;
  'City'?: string;
  'Country'?: string;
}

export interface CRMEmailThread {
  id: string;
  opportunityId: string;
  contactId: string;

  subject: string;
  messages: CRMEmailMessage[];

  status: 'active' | 'replied' | 'no_reply' | 'bounced';
  lastActivityAt: string;

  sentCount: number;
  openCount: number;
  clickCount: number;
  replyCount: number;
}

export interface CRMEmailMessage {
  id: string;
  threadId: string;

  direction: TouchpointDirection;
  fromAddress: string;
  toAddresses: string[];

  subject: string;
  body: string;
  bodyText?: string;

  trackingId?: string;

  sentAt?: string;
  deliveredAt?: string;
  openedAt?: string;
  clickedAt?: string;
  repliedAt?: string;

  createdAt: string;
}

export interface CRMCallLog {
  id: string;
  opportunityId: string;
  contactId: string;

  phoneNumber: string;
  direction: TouchpointDirection;

  startedAt: string;
  endedAt?: string;
  durationSeconds: number;

  outcome: TouchpointOutcome;
  notes?: string;

  recordingUrl?: string;

  createdBy: string;
  createdAt: string;
}

export interface CRMPipelineMetrics {
  totalOpportunities: number;
  totalValue: number;
  weightedValue: number;

  byStatus: Record<OpportunityStatus, {
    count: number;
    value: number;
    avgDaysInStage: number;
  }>;

  conversionRates: {
    leadToContacted: number;
    contactedToQualified: number;
    qualifiedToProposal: number;
    proposalToClosed: number;
    overall: number;
  };

  activityMetrics: {
    callsMade: number;
    callsConnected: number;
    emailsSent: number;
    emailsOpened: number;
    emailsReplied: number;
    meetingsScheduled: number;
    meetingsCompleted: number;
  };

  overdueTasks: number;
  tasksDueToday: number;
  followUpsRequired: number;
}