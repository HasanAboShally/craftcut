import {
  ArrowLeft,
  Box,
  Download,
  HelpCircle,
  Loader2,
  Package,
  PanelRightClose,
  PanelRightOpen,
  PenTool,
  Plus,
  Redo2,
  Trash2,
  Undo2,
  Upload,
} from "lucide-react";
import React, { Suspense, lazy, useEffect, useRef, useState } from "react";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";
import { useTheme } from "../hooks/useTheme";
import { exportToCSV, exportToJSON, importFromJSON } from "../lib/export";
import { calculateCutList } from "../lib/optimizer";
import { useDesignStore } from "../stores/designStore";
import { useProjectsStore } from "../stores/projectsStore";
import Canvas from "./Canvas";
import Sidebar from "./Sidebar";
import { ErrorBoundary, KeyboardHelp, ToastProvider, Tooltip, useConfirm, useKeyboardHelp, useToast } from "./ui";
import { ThemeToggle } from "./ui/ThemeToggle";

// Lazy load heavy components
const Preview3D = lazy(() => import("./Preview3D"));
const ProductionView = lazy(() => import("./ProductionView"));
const PrintBooklet = lazy(() => import("./PrintBooklet"));

// Loading skeleton for lazy components
function LoadingSkeleton({ label }: { label: string }) {
  return (
    <div className="h-full flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
        <p className="text-gray-500">Loading {label}...</p>
      </div>
    </div>
  );
}

type ViewTab = "design" | "3d" | "production";

interface EditorContentProps {
  onGoHome?: () => void;
  projectId?: string;
}

function EditorContent({ onGoHome, projectId }: EditorContentProps) {
  const [activeTab, setActiveTab] = useState<ViewTab>("design");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [showPrintBooklet, setShowPrintBooklet] = useState(false);
  const { addPanel, clearAll, panels, settings, exportDesign, loadDesign, saveProject, undo, redo, canUndo, canRedo } =
    useDesignStore();
  const { updateProject, getProject } = useProjectsStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const { confirm, ConfirmDialog } = useConfirm();
  const keyboardHelp = useKeyboardHelp();

  // Enable keyboard shortcuts
  useKeyboardShortcuts(activeTab === "design");
  
  // Initialize theme (applies .dark class to document)
  useTheme();

  // Get current project name
  const currentProject = projectId ? getProject(projectId) : null;
  const projectName = settings.projectName || currentProject?.name || "Untitled";

  // Save project on unmount and periodically
  useEffect(() => {
    if (!projectId) return;
    
    // Save when component unmounts
    return () => {
      saveProject();
      if (currentProject) {
        updateProject(projectId, { panelCount: panels.length });
      }
    };
  }, [projectId]);

  const handleExportJSON = () => {
    try {
      const data = exportDesign();
      exportToJSON(data);
      toast.success("Design exported", "Your project has been saved as JSON");
    } catch {
      toast.error("Export failed", "Could not export the design file");
    }
    setShowExportMenu(false);
  };

  const handleExportCSV = () => {
    try {
      const { pieces } = calculateCutList(panels);
      exportToCSV(pieces);
      toast.success("Cut list exported", "CSV file has been downloaded");
    } catch {
      toast.error("Export failed", "Could not generate the cut list");
    }
    setShowExportMenu(false);
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setIsImporting(true);
    try {
      const data = await importFromJSON(file);
      loadDesign(data);
      toast.success("Design imported", `Loaded ${data.panels.length} panels`);
    } catch (err) {
      toast.error(
        "Import failed",
        err instanceof Error ? err.message : "Could not read the file"
      );
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleClearAll = async () => {
    if (panels.length === 0) {
      toast.info("Nothing to clear", "Add some panels first");
      return;
    }
    
    const confirmed = await confirm({
      title: "Clear all panels?",
      message: `This will remove all ${panels.length} panel${panels.length > 1 ? "s" : ""} from your design. This action cannot be undone.`,
      confirmText: "Clear All",
      cancelText: "Keep Panels",
      variant: "danger",
    });
    
    if (confirmed) {
      clearAll();
      toast.success("Design cleared", "All panels have been removed");
    }
  };

  const handlePrint = () => {
    setShowExportMenu(false);
    setShowPrintBooklet(true);
  };

  const handleGoBack = () => {
    // Save before going back
    if (projectId) {
      saveProject();
      if (currentProject) {
        updateProject(projectId, { panelCount: panels.length });
      }
    }
    onGoHome?.();
  };

  const tabs: { id: ViewTab; label: string; icon: React.ReactNode }[] = [
    { id: "design", label: "Design", icon: <PenTool size={16} /> },
    { id: "3d", label: "3D", icon: <Box size={16} /> },
    { id: "production", label: "Production", icon: <Package size={16} /> },
  ];

  return (
    <div className="h-screen flex flex-col bg-slate-100 dark:bg-slate-900 overflow-hidden">
      {/* Modals */}
      {ConfirmDialog}
      <KeyboardHelp isOpen={keyboardHelp.isOpen} onClose={keyboardHelp.close} />
      
      {/* Print Booklet */}
      {showPrintBooklet && (
        <Suspense fallback={<LoadingSkeleton label="Print Preview" />}>
          <PrintBooklet onClose={() => setShowPrintBooklet(false)} />
        </Suspense>
      )}
      
      {/* Compact Header */}
      <header className="h-12 bg-slate-900 text-white flex items-center justify-between px-3 flex-shrink-0 z-50" role="banner">
        {/* Left: Back + Logo + Project Name + Tabs */}
        <div className="flex items-center gap-3">
          {/* Back button (only if multi-project mode) */}
          {onGoHome && (
            <button
              onClick={handleGoBack}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
              aria-label="Back to projects"
            >
              <ArrowLeft size={18} />
            </button>
          )}

          <div className="flex items-center gap-2">
            <span className="text-lg" aria-hidden="true">🪵</span>
            <div className="flex flex-col">
              <span className="font-semibold text-sm leading-tight">{projectName}</span>
              {onGoHome && (
                <span className="text-[10px] text-slate-400 leading-tight">CraftCut</span>
              )}
            </div>
          </div>

          <div className="h-6 w-px bg-slate-700" aria-hidden="true" />

          {/* View Tabs */}
          <nav aria-label="View modes">
            <div className="flex items-center bg-slate-800 rounded-lg p-0.5" role="tablist">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  role="tab"
                  aria-selected={activeTab === tab.id}
                  aria-controls={`${tab.id}-panel`}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    activeTab === tab.id
                      ? "bg-white text-slate-900"
                      : "text-slate-300 hover:text-white hover:bg-slate-700"
                  }`}
                >
                  <span aria-hidden="true">{tab.icon}</span>
                  {tab.label}
                </button>
              ))}
            </div>
          </nav>
        </div>

        {/* Center: Empty (add panel moved to bottom toolbar in Canvas) */}
        <div className="flex items-center gap-1">
        </div>

        {/* Right: File Actions + Sidebar Toggle */}
        <div className="flex items-center gap-1">
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleImport}
            className="hidden"
            aria-label="Import design file"
          />

          <button
            onClick={() => fileInputRef.current?.click()}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
            aria-label="Import design"
            disabled={isImporting}
          >
            {isImporting ? (
              <Loader2 size={16} className="animate-spin" aria-hidden="true" />
            ) : (
              <Upload size={16} aria-hidden="true" />
            )}
          </button>

          <div className="relative">
            <button
              onClick={() => setShowExportMenu(!showExportMenu)}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
              aria-label="Export options"
              aria-expanded={showExportMenu}
              aria-haspopup="menu"
            >
              <Download size={16} aria-hidden="true" />
            </button>
            {showExportMenu && (
              <div 
                className="absolute right-0 top-full mt-1 bg-white dark:bg-slate-800 rounded-lg shadow-xl border border-gray-200 dark:border-slate-700 py-1 min-w-[140px] z-50 animate-scale-in"
                role="menu"
              >
                <button
                  onClick={handleExportJSON}
                  className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-slate-700"
                  role="menuitem"
                >
                  Export JSON
                </button>
                <button
                  onClick={handleExportCSV}
                  className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-slate-700"
                  role="menuitem"
                >
                  Export CSV
                </button>
                <button
                  onClick={handlePrint}
                  className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-slate-700"
                  role="menuitem"
                >
                  Print
                </button>
              </div>
            )}
          </div>

          {/* Undo/Redo */}
          <div className="flex items-center gap-1">
            <Tooltip content="Undo (⌘Z)">
              <button
                onClick={undo}
                disabled={!canUndo}
                className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-slate-400"
                aria-label="Undo"
              >
                <Undo2 size={16} aria-hidden="true" />
              </button>
            </Tooltip>
            <Tooltip content="Redo (⌘⇧Z)">
              <button
                onClick={redo}
                disabled={!canRedo}
                className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-slate-400"
                aria-label="Redo"
              >
                <Redo2 size={16} aria-hidden="true" />
              </button>
            </Tooltip>
          </div>

          <Tooltip content="Clear all panels">
            <button
              onClick={handleClearAll}
              className="p-2 text-slate-400 hover:text-red-400 hover:bg-slate-700 rounded-lg transition-colors"
              aria-label="Clear all panels"
            >
              <Trash2 size={16} aria-hidden="true" />
            </button>
          </Tooltip>

          <div className="h-6 w-px bg-slate-700 mx-1" aria-hidden="true" />

          <ThemeToggle />

          <Tooltip content="Keyboard shortcuts (?)">
            <button
              onClick={keyboardHelp.toggle}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
              aria-label="Keyboard shortcuts"
            >
              <HelpCircle size={16} aria-hidden="true" />
            </button>
          </Tooltip>

          <Tooltip content={sidebarOpen ? "Hide sidebar" : "Show sidebar"}>
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className={`p-2 rounded-lg transition-colors ${sidebarOpen ? "bg-slate-700 text-white" : "text-slate-400 hover:text-white hover:bg-slate-700"}`}
              aria-label={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
              aria-expanded={sidebarOpen}
            >
              {sidebarOpen ? (
                <PanelRightClose size={16} aria-hidden="true" />
              ) : (
                <PanelRightOpen size={16} aria-hidden="true" />
              )}
            </button>
          </Tooltip>
        </div>
      </header>

      {/* Click outside to close export menu */}
      {showExportMenu && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setShowExportMenu(false)}
          aria-hidden="true"
        />
      )}

      {/* Main Content Area */}
      <main className="flex-1 flex overflow-hidden relative">
        {/* Canvas Area - Full Width */}
        <div className="flex-1 relative overflow-hidden" role="tabpanel" id={`${activeTab}-panel`}>
          {activeTab === "design" && <Canvas />}
          {activeTab === "3d" && (
            <ErrorBoundary fallbackMessage="WebGL may not be supported in your browser. Try Chrome or Firefox for the best experience.">
              <Suspense fallback={<LoadingSkeleton label="3D Preview" />}>
                <Preview3D />
              </Suspense>
            </ErrorBoundary>
          )}
          {activeTab === "production" && (
            <Suspense fallback={<LoadingSkeleton label="Production Documents" />}>
              <ProductionView />
            </Suspense>
          )}
        </div>

        {/* Collapsible Sidebar - Hidden in production view */}
        {activeTab !== "production" && (
          <aside
            className={`bg-white dark:bg-slate-800 border-l border-gray-200 dark:border-slate-700 transition-all duration-300 ease-in-out flex-shrink-0 overflow-hidden ${
              sidebarOpen ? "w-80" : "w-0"
            }`}
            aria-label="Panel properties"
          >
            {sidebarOpen && activeTab === "design" && <Sidebar />}
            {sidebarOpen && activeTab === "3d" && (
              <div className="p-4 text-sm text-gray-500 dark:text-gray-400">
                <h3 className="font-medium text-gray-700 dark:text-gray-200 mb-2">3D Preview</h3>
                <ul className="space-y-1">
                  <li>🖱️ Drag to rotate</li>
                  <li>🔍 Scroll to zoom</li>
                  <li>✋ Right-click drag to pan</li>
                </ul>
              </div>
            )}
          </aside>
        )}
      </main>
    </div>
  );
}

// Props interface
interface EditorProps {
  onGoHome?: () => void;
  projectId?: string;
}

// Wrap with ToastProvider for notifications
export default function Editor({ onGoHome, projectId }: EditorProps) {
  return (
    <ToastProvider>
      <EditorContent onGoHome={onGoHome} projectId={projectId} />
    </ToastProvider>
  );
}
