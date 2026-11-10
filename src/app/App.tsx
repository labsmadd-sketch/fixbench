import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { LoginPage } from '../features/auth/LoginPage';
import {
  CustomersPage,
  DashboardPage,
  InventoryPage,
  InvoicesPage,
  NewTicketPage,
  NotFoundPage,
  QuotesPage,
  ReportsPage,
  SettingsPage,
  TicketsPage,
} from '../features/pages';
import { SetupPage } from '../features/setup/SetupPage';
import { RequireRole, RequireStaff } from './guards';
import { Layout } from './Layout';
import { SessionProvider } from './session';

export function App() {
  return (
    <SessionProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
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
            <Route path="tickets/new" element={<RequireRole roles={['owner', 'manager', 'frontdesk']}><NewTicketPage /></RequireRole>} />
            <Route path="customers" element={<CustomersPage />} />
            <Route path="quotes" element={<QuotesPage />} />
            <Route path="invoices" element={<RequireRole roles={['owner', 'manager', 'frontdesk']}><InvoicesPage /></RequireRole>} />
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
