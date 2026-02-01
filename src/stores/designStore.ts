import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { DesignData, Panel, Settings } from "../types";

interface DesignState {
  settings: Settings;
  panels: Panel[];
  selectedPanelId: string | null;

  // Panel actions
  addPanel: () => void;
  updatePanel: (id: string, updates: Partial<Panel>) => void;
  deletePanel: (id: string) => void;
  selectPanel: (id: string | null) => void;

  // Settings actions
  updateSettings: (updates: Partial<Settings>) => void;

  // Design actions
  clearAll: () => void;
  loadDesign: (data: DesignData) => void;
  exportDesign: () => DesignData;
}

const DEFAULT_SETTINGS: Settings = {
  thickness: 18,
  sheetWidth: 2440,
  sheetHeight: 1220,
  units: "mm",
  woodColor: "#E8D4B8",
};

let panelCounter = 1;

const generateId = () =>
  `panel_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

export const useDesignStore = create<DesignState>()(
  persist(
    (set, get) => ({
      settings: { ...DEFAULT_SETTINGS },
      panels: [],
      selectedPanelId: null,

      addPanel: () => {
        const newPanel: Panel = {
          id: generateId(),
          label: `Panel ${panelCounter++}`,
          x: 50 + (get().panels.length % 5) * 30,
          y: 50 + Math.floor(get().panels.length / 5) * 30,
          width: 600,
          height: 400,
          quantity: 1,
          orientation: "horizontal", // Default to shelf
        };
        set((state) => ({
          panels: [...state.panels, newPanel],
          selectedPanelId: newPanel.id,
        }));
      },

      updatePanel: (id, updates) => {
        set((state) => ({
          panels: state.panels.map((p) =>
            p.id === id ? { ...p, ...updates } : p,
          ),
        }));
      },

      deletePanel: (id) => {
        set((state) => ({
          panels: state.panels.filter((p) => p.id !== id),
          selectedPanelId:
            state.selectedPanelId === id ? null : state.selectedPanelId,
        }));
      },

      selectPanel: (id) => {
        set({ selectedPanelId: id });
      },

      updateSettings: (updates) => {
        set((state) => ({
          settings: { ...state.settings, ...updates },
        }));
      },

      clearAll: () => {
        panelCounter = 1;
        set({
          panels: [],
          selectedPanelId: null,
          settings: { ...DEFAULT_SETTINGS },
        });
      },

      loadDesign: (data) => {
        panelCounter = data.panels.length + 1;
        set({
          settings: data.settings,
          panels: data.panels,
          selectedPanelId: null,
        });
      },

      exportDesign: () => {
        const state = get();
        return {
          version: 1,
          settings: state.settings,
          panels: state.panels,
        };
      },
    }),
    {
      name: "craftcut_design",
    },
  ),
);
