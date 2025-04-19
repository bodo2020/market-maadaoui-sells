
import { create } from 'zustand';

interface StoreInfo {
  id: string;
  name: string;
  address?: string;
  phone?: string;
  email?: string;
  logo_url?: string;
  vat_number?: string;
}

interface StoreState {
  storeInfo: StoreInfo | null;
  setStoreInfo: (info: StoreInfo) => void;
}

export const useStore = create<StoreState>((set) => ({
  storeInfo: null,
  setStoreInfo: (info) => set({ storeInfo: info }),
}));
