
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import './lib/fonts.css';
import { AuthProvider } from './contexts/AuthContext.tsx';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/react-query';

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <App />
    </AuthProvider>
  </QueryClientProvider>
);
