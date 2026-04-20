
import React, { useState, useEffect, ReactNode, ErrorInfo, Component } from 'react';
import { Layout } from './Layout';
import { Dashboard } from './Dashboard';
import { BillboardList } from './BillboardList';
import { ClientList } from './ClientList';
import { Rentals } from './Rentals';
import { Financials } from './Financials';
import { Expenses } from './Expenses';
import { Settings } from './Settings';
import { OutsourcedList } from './OutsourcedList';
import { Analytics } from './Analytics';
import { Payments } from './Payments';
import { Maintenance } from './Maintenance';
import { Auth } from './Auth';
import { getCurrentUser, getCurrentUserAsync } from '../services/authService';
import { User } from '../types';

interface ErrorBoundaryProps {
  children?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = { hasError: false };

  constructor(props: ErrorBoundaryProps) {
    super(props);
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-screen flex items-center justify-center bg-slate-50 text-slate-900 p-6">
           <div className="text-center p-8 bg-white rounded-3xl shadow-xl max-w-md w-full border border-slate-100">
             <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-500"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/></svg>
             </div>
             <h1 className="text-xl font-bold mb-2 text-slate-900">Application Error</h1>
             <p className="text-slate-500 mb-6 text-sm leading-relaxed">
               {this.state.error?.message || "An unexpected error occurred while rendering the application."}
             </p>
             <button onClick={() => window.location.reload()} className="bg-slate-900 text-white px-6 py-3 rounded-xl font-bold uppercase text-xs hover:bg-slate-800 transition-all w-full shadow-lg shadow-slate-900/20">
               Reload Application
             </button>
           </div>
        </div>
      );
    }

    return this.props.children;
  }
}

const Splash: React.FC = () => (
  <div className="h-screen w-full flex items-center justify-center bg-slate-50">
    <div className="flex flex-col items-center gap-3">
      <div className="w-10 h-10 border-4 border-slate-200 border-t-slate-900 rounded-full animate-spin"></div>
      <p className="text-xs uppercase tracking-widest text-slate-400 font-bold">Loading…</p>
    </div>
  </div>
);

// Public-access paths let anonymous visitors view the read-only billboard
// map/list (e.g. shared links). Anything else requires authentication.
const isPublicAccess = () => {
  const params = new URLSearchParams(window.location.search);
  return !!(params.get('billboardId') || params.get('view') === 'map');
};

const App: React.FC = () => {
  const getInitialPage = () => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('billboardId') || params.get('view') === 'map') return 'billboards';
    return 'dashboard';
  };

  const [currentPage, setCurrentPage] = useState(getInitialPage());
  // Auth bootstrap is async — hit /auth/me on mount. Until we know, show a
  // splash so the UI doesn't flash the wrong state (sidebar was flickering
  // the wrong role on first paint before this change).
  const [authState, setAuthState] = useState<'loading' | 'anonymous' | 'authenticated'>(
    getCurrentUser() ? 'loading' : (isPublicAccess() ? 'anonymous' : 'loading')
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const user: User | null = await getCurrentUserAsync();
      if (cancelled) return;
      if (user) {
        setAuthState('authenticated');
      } else if (isPublicAccess()) {
        setAuthState('anonymous');
      } else {
        setAuthState('anonymous');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard': return <Dashboard />;
      case 'analytics': return <Analytics />;
      case 'billboards': return <BillboardList />;
      case 'maintenance': return <Maintenance />;
      case 'outsourced': return <OutsourcedList />;
      case 'payments': return <Payments />;
      case 'clients': return <ClientList />;
      case 'rentals': return <Rentals />;
      case 'financials': return <Financials initialTab="Invoices" />;
      case 'receipts': return <Financials initialTab="Receipts" />;
      case 'expenses': return <Expenses />;
      case 'settings': return <Settings />;
      default: return <Dashboard />;
    }
  };

  if (authState === 'loading') {
    return <Splash />;
  }

  if (authState === 'anonymous') {
    // Public read-only entrance: only the BillboardList is exposed, rendered
    // bare (no sidebar / Layout) in read-only mode.
    if (isPublicAccess()) {
      return (
        <ErrorBoundary>
          <div className="h-screen w-full overflow-auto bg-[#fcfaf8] p-3 sm:p-6 lg:p-8">
            <div className="max-w-7xl mx-auto">
              <BillboardList readOnly />
            </div>
          </div>
        </ErrorBoundary>
      );
    }
    return (
      <ErrorBoundary>
        <Auth onLogin={() => setAuthState('authenticated')} />
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
        <Layout
            currentPage={currentPage}
            onNavigate={setCurrentPage}
            onLogout={() => setAuthState('anonymous')}
        >
          {renderPage()}
        </Layout>
    </ErrorBoundary>
  );
};

export default App;
