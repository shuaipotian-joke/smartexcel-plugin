import { create } from 'zustand';
import { isExtensionContextValid } from './extension-runtime';
import type { ParsedTable } from './table-parser';
import { type Lang, detectBrowserLang } from './i18n';

/** storage.local key of the "Show table icon on pages" setting (default on). */
export const SHOW_TABLE_ICON_KEY = 'se_show_table_icon';

interface ExtensionState {
  tables: ParsedTable[];
  activeTableId: string | null;
  showTableIcon: boolean;
  lang: Lang;

  setTables: (tables: ParsedTable[]) => void;
  setActiveTable: (id: string | null) => void;
  /** Update the table-icon setting in-memory and persist it to storage. */
  setShowTableIcon: (show: boolean) => void;
  /** Update language in-memory and persist to storage. */
  setLang: (lang: Lang) => void;
  /** Read saved preferences (language, table icon) from storage on mount. */
  initPrefs: () => Promise<void>;
}

export const useExtensionStore = create<ExtensionState>((set) => ({
  tables: [],
  activeTableId: null,
  showTableIcon: true,
  lang: detectBrowserLang(),

  setTables: (tables) => set({ tables }),
  setActiveTable: (id) => set({ activeTableId: id }),
  setShowTableIcon: (show) => {
    set({ showTableIcon: show });
    if (!isExtensionContextValid()) {
      return;
    }
    browser.storage.local.set({ [SHOW_TABLE_ICON_KEY]: show }).catch(() => undefined);
  },
  setLang: (lang) => {
    set({ lang });
    if (!isExtensionContextValid()) {
      return;
    }
    browser.storage.local.set({ se_lang: lang }).catch(() => undefined);
  },
  initPrefs: async () => {
    if (!isExtensionContextValid()) {
      return;
    }
    const result = await browser.storage.local.get(['se_lang', SHOW_TABLE_ICON_KEY]);
    if (result.se_lang) {
      set({ lang: result.se_lang as Lang });
    }
    set({ showTableIcon: result[SHOW_TABLE_ICON_KEY] !== false });
  },
}));
