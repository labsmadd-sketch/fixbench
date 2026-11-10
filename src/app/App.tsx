import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { LoginPage } from '../features/auth/LoginPage';
import { CustomerFormPage } from '../features/customers/CustomerFormPage';
import { CustomerProfile } from '../features/customers/CustomerProfile';
import { CustomersPage, NoCustomerSelected } from '../features/customers/CustomersPage';
import { DashboardPage } from '../features/dashboard/DashboardPage';
import { InvoiceDetailPage } from '../features/invoices/InvoiceDetailPage';
import { InvoicesPage } from '../features/invoices/InvoicesPage';
import { NewInvoicePage } from '../features/invoices/NewInvoicePage';
import { InventoryPage } from '../features/inventory/InventoryPage';
import { NotFoundPage, ReportsPage, SettingsPage } from '../features/pages';
import { QuoteDetailPage } from '../features/quotes/QuoteDetailPage';
import { QuoteEditorPage } from '../features/quotes/QuoteEditorPage';
import { QuotesPage } from '../features/quotes/QuotesPage';
import { SetupPage } from '../features/setup/SetupPage';
import { PublicStatusPage } from '../features/status/PublicStatusPage';
import { NewTicketPage } from '../features/tickets/NewTicketPage';
import { TicketDetailPage } from '../features/tickets/TicketDetailPage';
import { TicketsPage } from '../features/tickets/TicketsPage';
import { RequireRole, RequireStaff } from './guards';
import { Layout } from './Layout';
import { SessionProvider } from './session';

const DESK = ['owner', 'manager', 'frontdesk'] as const;

export function App() {
  return (
    <SessionProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          {/* Public: opened from the QR code on the intake receipt. */}
          <Route path="/status/:token" element={<PublicStatusPage />} />
          <Route
            path="/setup"
            element={
              <RequireStaff>
                <SetupPage />
              </RequireStaff>
            }
          />
          <Route
            element={
              <RequireStaff>
                <Layout />
              </RequireStaff>
            }
          >
            <Route index element={<DashboardPage />} />
            <Route path="tickets" element={<TicketsPage />} />
            <Route path="tickets/new" element={<RequireRole roles={[...DESK]}><NewTicketPage /></RequireRole>} />
            <Route path="tickets/:id" element={<TicketDetailPage />} />
            <Route path="customers/new" element={<RequireRole roles={[...DESK]}><CustomerFormPage /></RequireRole>} />
            <Route path="customers/:id/edit" element={<RequireRole roles={[...DESK]}><CustomerFormPage /></RequireRole>} />
            <Route path="customers" element={<CustomersPage />}>
              <Route index element={<NoCustomerSelected />} />
              <Route path=":id" element={<CustomerProfile />} />
            </Route>
            <Route path="quotes" element={<QuotesPage />} />
            <Route path="quotes/new" element={<QuoteEditorPage />} />
            <Route path="quotes/:id" element={<QuoteDetailPage />} />
            <Route path="quotes/:id/edit" element={<QuoteEditorPage />} />
            <Route path="invoices" element={<RequireRole roles={[...DESK]}><InvoicesPage /></RequireRole>} />
            <Route path="invoices/new" element={<RequireRole roles={[...DESK]}><NewInvoicePage /></RequireRole>} />
            <Route path="invoices/:id" element={<RequireRole roles={[...DESK]}><InvoiceDetailPage /></RequireRole>} />
            <Route path="inventory" element={<InventoryPage />} />
            <Route path="reports" element={<RequireRole roles={['owner', 'manager']}><ReportsPage /></RequireRole>} />
            <Route path="settings" element={<RequireRole roles={['owner']}><SettingsPage /></RequireRole>} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </SessionProvider>
  );
}
