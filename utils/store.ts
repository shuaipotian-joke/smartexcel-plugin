import { create } from 'zustand';
import type { ParsedTable } from './table-parser';

interface ExtensionState {
  tables: ParsedTable[];
  activeTableId: string | null;
  isEnabled: boolean;

  setTables: (tables: ParsedTable[]) => void;
  setActiveTable: (id: string | null) => void;
  toggleEnabled: () => void;
}

export const useExtensionStore = create<ExtensionState>((set) => ({
  tables: [],
  activeTableId: null,
  isEnabled: true,

  setTables: (tables) => set({ tables }),
  setActiveTable: (id) => set({ activeTableId: id }),
  toggleEnabled: () => set((s) => ({ isEnabled: !s.isEnabled })),
}));
