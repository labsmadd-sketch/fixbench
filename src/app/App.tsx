import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { LoginPage } from '../features/auth/LoginPage';
import { CustomerFormPage } from '../features/customers/CustomerFormPage';
import { CustomerProfile } from '../features/customers/CustomerProfile';
import { CustomersPage, NoCustomerSelected } from '../features/customers/CustomersPage';
import { DashboardPage } from '../features/dashboard/DashboardPage';
import {
  InventoryPage,
  InvoicesPage,
  NotFoundPage,
  QuotesPage,
  ReportsPage,
  SettingsPage,
} from '../features/pages';
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
            <Route path="invoices" element={<RequireRole roles={[...DESK]}><InvoicesPage /></RequireRole>} />
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
