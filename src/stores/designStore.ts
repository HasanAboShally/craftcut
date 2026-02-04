import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { DesignData, Panel, Settings, StickyNote } from "../types";

// History entry for undo/redo
interface HistoryEntry {
  panels: Panel[];
  settings: Settings;
}

// View state for camera/zoom persistence
interface ViewState {
  zoom: number;
  panX: number;
  panY: number;
}

interface DesignState {
  // Current project ID (null for legacy single-project mode)
  currentProjectId: string | null;
  
  settings: Settings;
  panels: Panel[];
  stickyNotes: StickyNote[];
  selectedPanelIds: string[];

  // View state (for preserving camera position between tabs)
  viewState: ViewState;

  // Undo/Redo state
  history: HistoryEntry[];
  historyIndex: number;
  canUndo: boolean;
  canRedo: boolean;

  // Panel actions
  addPanel: (x?: number, y?: number, orientation?: "horizontal" | "vertical" | "back") => void;
  updatePanel: (id: string, updates: Partial<Panel>) => void;
  updatePanels: (ids: string[], updates: Partial<Panel>) => void;
  deletePanel: (id: string) => void;
  deletePanels: (ids: string[]) => void;
  selectPanel: (id: string | null, addToSelection?: boolean) => void;
  selectPanels: (ids: string[]) => void;
  selectAll: () => void;
  clearSelection: () => void;

  // Sticky note actions
  addStickyNote: (x: number, y: number) => string;
  updateStickyNote: (id: string, updates: Partial<StickyNote>) => void;
  deleteStickyNote: (id: string) => void;

  // Settings actions
  updateSettings: (updates: Partial<Settings>) => void;

  // View actions
  updateViewState: (updates: Partial<ViewState>) => void;

  // Design actions
  clearAll: () => void;
  loadDesign: (data: DesignData) => void;
  exportDesign: () => DesignData;

  // Project actions
  loadProject: (projectId: string) => void;
  saveProject: () => void;
  newProject: (projectId: string, name?: string) => void;

  // Undo/Redo actions
  undo: () => void;
  redo: () => void;
  saveToHistory: () => void;
}

const DEFAULT_SETTINGS: Settings = {
  thickness: 18,
  sheetWidth: 2440,
  sheetHeight: 1220,
  units: "mm",
  woodColor: "#E8D4B8",
  furnitureDepth: 400,
  projectName: "",
};

const MAX_HISTORY = 50;
const DEFAULT_ZOOM = 0.5;

let panelCounter = 1;

const generateId = () =>
  `panel_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

export const useDesignStore = create<DesignState>()(
  persist(
    (set, get) => ({
      currentProjectId: null,
      settings: { ...DEFAULT_SETTINGS },
      panels: [],
      stickyNotes: [],
      selectedPanelIds: [],
      viewState: { zoom: DEFAULT_ZOOM, panX: 0, panY: 0 },
      history: [],
      historyIndex: -1,
      canUndo: false,
      canRedo: false,

      // Update view state (zoom/pan)
      updateViewState: (updates) => {
        set((state) => ({
          viewState: { ...state.viewState, ...updates },
        }));
      },

      // Save current state to history (call before making changes)
      saveToHistory: () => {
        const state = get();
        const entry: HistoryEntry = {
          panels: JSON.parse(JSON.stringify(state.panels)),
          settings: JSON.parse(JSON.stringify(state.settings)),
        };

        // Remove any future history if we're not at the end
        const newHistory = state.history.slice(0, state.historyIndex + 1);
        newHistory.push(entry);

        // Limit history size
        if (newHistory.length > MAX_HISTORY) {
          newHistory.shift();
        }

        set({
          history: newHistory,
          historyIndex: newHistory.length - 1,
          canUndo: true,
          canRedo: false,
        });
      },

      undo: () => {
        const state = get();
        if (state.historyIndex < 0) return;

        // If at the end, save current state first so we can redo to it
        if (state.historyIndex === state.history.length - 1) {
          const currentEntry: HistoryEntry = {
            panels: JSON.parse(JSON.stringify(state.panels)),
            settings: JSON.parse(JSON.stringify(state.settings)),
          };
          const newHistory = [...state.history, currentEntry];
          set({ history: newHistory });
        }

        const entry = state.history[state.historyIndex];
        if (!entry) return;

        set({
          panels: JSON.parse(JSON.stringify(entry.panels)),
          settings: JSON.parse(JSON.stringify(entry.settings)),
          historyIndex: state.historyIndex - 1,
          canUndo: state.historyIndex - 1 >= 0,
          canRedo: true,
        });
      },

      redo: () => {
        const state = get();
        const nextIndex = state.historyIndex + 2; // +2 because historyIndex points to last saved, +1 is current, +2 is next

        if (nextIndex >= state.history.length) return;

        const entry = state.history[nextIndex];
        if (!entry) return;

        set({
          panels: JSON.parse(JSON.stringify(entry.panels)),
          settings: JSON.parse(JSON.stringify(entry.settings)),
          historyIndex: state.historyIndex + 1,
          canUndo: true,
          canRedo: nextIndex + 1 < state.history.length,
        });
      },

      addPanel: (x?: number, y?: number, orientation?: "horizontal" | "vertical" | "back") => {
        get().saveToHistory();
        const defaultX = 50 + (get().panels.length % 5) * 30;
        const defaultY = 50 + Math.floor(get().panels.length / 5) * 30;
        const orient = orientation ?? "horizontal";
        const newPanel: Panel = {
          id: generateId(),
          label: `Panel ${panelCounter++}`,
          x: x ?? defaultX,
          y: y ?? defaultY,
          width: 600,
          height: 400,
          quantity: 1,
          orientation: orient,
        };
        set((state) => ({
          panels: [...state.panels, newPanel],
          selectedPanelIds: [newPanel.id],
        }));
      },

      updatePanel: (id, updates) => {
        // Don't save to history for every tiny movement - we'll batch these
        set((state) => ({
          panels: state.panels.map((p) =>
            p.id === id ? { ...p, ...updates } : p,
          ),
        }));
      },

      updatePanels: (ids, updates) => {
        // Update multiple panels at once (for multi-select drag)
        set((state) => ({
          panels: state.panels.map((p) =>
            ids.includes(p.id) ? { ...p, ...updates } : p,
          ),
        }));
      },

      deletePanel: (id) => {
        get().saveToHistory();
        set((state) => ({
          panels: state.panels.filter((p) => p.id !== id),
          selectedPanelIds: state.selectedPanelIds.filter((pid) => pid !== id),
        }));
      },

      deletePanels: (ids) => {
        get().saveToHistory();
        set((state) => ({
          panels: state.panels.filter((p) => !ids.includes(p.id)),
          selectedPanelIds: [],
        }));
      },

      selectPanel: (id, addToSelection = false) => {
        if (id === null) {
          set({ selectedPanelIds: [] });
        } else if (addToSelection) {
          set((state) => {
            if (state.selectedPanelIds.includes(id)) {
              // Remove from selection if already selected
              return {
                selectedPanelIds: state.selectedPanelIds.filter(
                  (pid) => pid !== id,
                ),
              };
            } else {
              return { selectedPanelIds: [...state.selectedPanelIds, id] };
            }
          });
        } else {
          set({ selectedPanelIds: [id] });
        }
      },

      selectPanels: (ids) => {
        set({ selectedPanelIds: ids });
      },

      selectAll: () => {
        set((state) => ({
          selectedPanelIds: state.panels.map((p) => p.id),
        }));
      },

      clearSelection: () => {
        set({ selectedPanelIds: [] });
      },

      addStickyNote: (x, y) => {
        const id = `note_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
        const colors = [
          "#fef08a",
          "#fde68a",
          "#bbf7d0",
          "#bfdbfe",
          "#fbcfe8",
          "#e9d5ff",
        ];
        const color = colors[Math.floor(Math.random() * colors.length)];
        set((state) => ({
          stickyNotes: [...state.stickyNotes, { id, x, y, text: "", color }],
        }));
        return id;
      },

      updateStickyNote: (id, updates) => {
        set((state) => ({
          stickyNotes: state.stickyNotes.map((n) =>
            n.id === id ? { ...n, ...updates } : n,
          ),
        }));
      },

      deleteStickyNote: (id) => {
        set((state) => ({
          stickyNotes: state.stickyNotes.filter((n) => n.id !== id),
        }));
      },

      updateSettings: (updates) => {
        get().saveToHistory();
        set((state) => ({
          settings: { ...state.settings, ...updates },
        }));
      },

      clearAll: () => {
        get().saveToHistory();
        panelCounter = 1;
        set({
          panels: [],
          stickyNotes: [],
          selectedPanelIds: [],
          settings: { ...DEFAULT_SETTINGS },
        });
      },

      loadDesign: (data) => {
        get().saveToHistory();
        panelCounter = data.panels.length + 1;
        set({
          settings: data.settings,
          panels: data.panels,
          selectedPanelIds: [],
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

      // Project management actions
      loadProject: (projectId: string) => {
        const storageKey = `craftcut_project_${projectId}`;
        try {
          const savedData = localStorage.getItem(storageKey);
          if (savedData) {
            const parsed = JSON.parse(savedData);
            panelCounter = (parsed.panels?.length || 0) + 1;
            set({
              currentProjectId: projectId,
              settings: { ...DEFAULT_SETTINGS, ...parsed.settings },
              panels: parsed.panels || [],
              stickyNotes: parsed.stickyNotes || [],
              selectedPanelIds: [],
              viewState: parsed.viewState || { zoom: DEFAULT_ZOOM, panX: 0, panY: 0 },
              history: [],
              historyIndex: -1,
              canUndo: false,
              canRedo: false,
            });
          } else {
            // New project with no saved data
            set({
              currentProjectId: projectId,
              settings: { ...DEFAULT_SETTINGS },
              panels: [],
              stickyNotes: [],
              selectedPanelIds: [],
              viewState: { zoom: DEFAULT_ZOOM, panX: 0, panY: 0 },
              history: [],
              historyIndex: -1,
              canUndo: false,
              canRedo: false,
            });
            panelCounter = 1;
          }
        } catch (err) {
          console.error("Failed to load project:", err);
          // Reset to empty state
          set({
            currentProjectId: projectId,
            settings: { ...DEFAULT_SETTINGS },
            panels: [],
            stickyNotes: [],
            selectedPanelIds: [],
            viewState: { zoom: DEFAULT_ZOOM, panX: 0, panY: 0 },
            history: [],
            historyIndex: -1,
            canUndo: false,
            canRedo: false,
          });
          panelCounter = 1;
        }
      },

      saveProject: () => {
        const state = get();
        if (!state.currentProjectId) return;
        
        const storageKey = `craftcut_project_${state.currentProjectId}`;
        const dataToSave = {
          settings: state.settings,
          panels: state.panels,
          stickyNotes: state.stickyNotes,
          viewState: state.viewState,
        };
        
        try {
          localStorage.setItem(storageKey, JSON.stringify(dataToSave));
        } catch (err) {
          console.error("Failed to save project:", err);
        }
      },

      newProject: (projectId: string, name?: string) => {
        panelCounter = 1;
        set({
          currentProjectId: projectId,
          settings: { ...DEFAULT_SETTINGS, projectName: name || "" },
          panels: [],
          stickyNotes: [],
          selectedPanelIds: [],
          viewState: { zoom: DEFAULT_ZOOM, panX: 0, panY: 0 },
          history: [],
          historyIndex: -1,
          canUndo: false,
          canRedo: false,
        });
      },
    }),
    {
      name: "craftcut_design",
      partialize: (state) => ({
        currentProjectId: state.currentProjectId,
        settings: state.settings,
        panels: state.panels,
        stickyNotes: state.stickyNotes,
        // Don't persist history - it would be too large
      }),
      // Create backup before any storage operation
      onRehydrateStorage: () => {
        // Backup existing data before rehydration
        try {
          const existingData = localStorage.getItem("craftcut_design");
          if (existingData) {
            const parsed = JSON.parse(existingData);
            // Only backup if there's actual panel data
            if (parsed.state?.panels?.length > 0) {
              const backupKey = `craftcut_backup_${Date.now()}`;
              localStorage.setItem(backupKey, existingData);
              console.log(`Backup created: ${backupKey} with ${parsed.state.panels.length} panels`);
            }
          }
        } catch (e) {
          console.error("Failed to create backup:", e);
        }
        
        return (state, error) => {
          if (error) {
            console.error("Failed to rehydrate state:", error);
          }
        };
      },
    },
  ),
);
