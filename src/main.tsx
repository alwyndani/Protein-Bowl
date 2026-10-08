import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { AuthProvider } from './context/AuthContext.tsx';
import { CartProvider } from './context/CartContext.tsx';
import { AcceptInvitePage, isAcceptInviteRoute } from './components/admin/AcceptInvitePage.tsx';
import './index.css';

const root = createRoot(document.getElementById('root')!);

if (isAcceptInviteRoute(window.location.pathname)) {
  // Public staff-invitation page: rendered on its own, WITHOUT the app shell, auth restoration or cart. The one-time token
  // in the URL fragment is captured into memory and scrubbed from the address bar by the page itself.
  root.render(
    <StrictMode>
      <AcceptInvitePage />
    </StrictMode>
  );
} else {
  root.render(
    <StrictMode>
      <AuthProvider>
        <CartProvider>
          <App />
        </CartProvider>
      </AuthProvider>
    </StrictMode>
  );
}
