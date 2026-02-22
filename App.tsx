
import React, { useState, ReactNode, ErrorInfo, Component } from 'react';
import { Layout } from './components/Layout';
import { Dashboard } from './components/Dashboard';
import { BillboardList } from './components/BillboardList';
import { ClientList } from './components/ClientList';
import { Rentals } from './components/Rentals';
import { Financials } from './components/Financials';
import { Expenses } from './components/Expenses';
import { Settings } from './components/Settings';
import { OutsourcedList } from './components/OutsourcedList';
import { Analytics } from './components/Analytics';
import { Payments } from './components/Payments';
import { Maintenance } from './components/Maintenance';
import { Auth } from './components/Auth';
import { getCurrentUser } from './services/authService';

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

const App: React.FC = () => {
  const getInitialPage = () => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('billboardId') || params.get('view') === 'map') return 'billboards';
    return 'dashboard';
  };

  const isPublicAccess = () => {
    const params = new URLSearchParams(window.location.search);
    return !!(params.get('billboardId') || params.get('view') === 'map');
  };

  const [currentPage, setCurrentPage] = useState(getInitialPage());
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(!!getCurrentUser() || isPublicAccess());

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

  if (!isAuthenticated) {
      return (
        <ErrorBoundary>
            <Auth onLogin={() => setIsAuthenticated(true)} />
        </ErrorBoundary>
      );
  }

  return (
    <ErrorBoundary>
        <Layout 
            currentPage={currentPage} 
            onNavigate={setCurrentPage}
            onLogout={() => setIsAuthenticated(false)}
        >
          {renderPage()}
        </Layout>
    </ErrorBoundary>
  );
};

export default App;
