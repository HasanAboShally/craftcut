/**
 * App Component
 * 
 * Root component that handles navigation between Projects Home and Editor.
 * Uses simple client-side routing based on URL hash or state.
 */

import React, { useCallback, useEffect, useState } from "react";
import { useDesignStore } from "../stores/designStore";
import { useProjectsStore } from "../stores/projectsStore";
import Editor from "./Editor";
import ProjectsHome from "./ProjectsHome";
import { InstallPrompt } from "./ui";

type View = "home" | "editor";

// Migration: Check for legacy single-project data and convert to new multi-project format
function migrateLegacyProject(
  createProject: (name?: string) => string,
  getProject: (id: string) => any
): string | null {
  const LEGACY_KEY = "craftcut_design";
  const MIGRATION_FLAG = "craftcut_migrated_v2"; // v2 to re-run migration

  // Check if we've already migrated
  if (localStorage.getItem(MIGRATION_FLAG)) {
    return null;
  }

  try {
    const legacyData = localStorage.getItem(LEGACY_KEY);
    if (!legacyData) {
      // No legacy data to migrate
      localStorage.setItem(MIGRATION_FLAG, "true");
      return null;
    }

    const parsed = JSON.parse(legacyData);
    
    // Zustand persist stores data under 'state' key
    const state = parsed.state || parsed;
    
    // Check if there's actual content (panels)
    if (!state.panels || state.panels.length === 0) {
      console.log("No panels found in legacy data");
      localStorage.setItem(MIGRATION_FLAG, "true");
      return null;
    }

    console.log("Migrating legacy project data...", state.panels.length, "panels found");

    // Create a new project
    const projectName = state.settings?.projectName || "My First Project";
    const newProjectId = createProject(projectName);

    // Copy the data to the new project storage
    const projectData = {
      settings: state.settings || {},
      panels: state.panels || [],
      stickyNotes: state.stickyNotes || [],
      viewState: state.viewState || { zoom: 0.5, panX: 0, panY: 0 },
    };

    localStorage.setItem(`craftcut_project_${newProjectId}`, JSON.stringify(projectData));

    // Update project metadata with panel count
    // Note: This is a bit of a hack since we can't call updateProject here
    // The projects store will be updated when the project is opened

    // Mark migration as complete
    localStorage.setItem(MIGRATION_FLAG, "true");

    console.log(`Legacy project migrated successfully! Project ID: ${newProjectId}, Panels: ${state.panels.length}`);
    
    return newProjectId;
  } catch (err) {
    console.error("Failed to migrate legacy project:", err);
    // Don't set migration flag on error so we can retry
    return null;
  }
}

export default function App() {
  const [view, setView] = useState<View>("home");
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const { loadProject, saveProject, newProject, panels, settings } = useDesignStore();
  const { updateProject, getProject, createProject, projects } = useProjectsStore();

  // Initialize: check for migration and URL hash
  useEffect(() => {
    if (isInitialized) return;

    // Prevent browser from hijacking scroll/swipe for history navigation
    if ('scrollRestoration' in history) {
      history.scrollRestoration = 'manual';
    }

    // Try to migrate legacy data first
    const migratedProjectId = migrateLegacyProject(createProject, getProject);
    
    // Check URL hash for direct project links
    const hash = window.location.hash;
    if (hash.startsWith("#/project/")) {
      const projectId = hash.replace("#/project/", "");
      if (projectId && getProject(projectId)) {
        loadProject(projectId);
        setCurrentProjectId(projectId);
        setView("editor");
        setIsInitialized(true);
        return;
      }
    }

    // If we migrated a project, open it directly
    if (migratedProjectId) {
      loadProject(migratedProjectId);
      setCurrentProjectId(migratedProjectId);
      setView("editor");
      setIsInitialized(true);
      return;
    }

    setIsInitialized(true);
  }, [isInitialized, createProject, getProject, loadProject]);

  // Update URL hash when view changes
  useEffect(() => {
    if (!isInitialized) return;
    
    if (view === "editor" && currentProjectId) {
      window.location.hash = `/project/${currentProjectId}`;
    } else {
      window.location.hash = "";
    }
  }, [view, currentProjectId, isInitialized]);

  // Handle browser back/forward
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash;
      if (hash.startsWith("#/project/")) {
        const projectId = hash.replace("#/project/", "");
        if (projectId && projectId !== currentProjectId) {
          handleOpenProject(projectId);
        }
      } else if (hash === "" || hash === "#") {
        handleGoHome();
      }
    };

    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, [currentProjectId]);

  // Auto-save project data periodically
  useEffect(() => {
    if (view !== "editor" || !currentProjectId) return;

    const saveInterval = setInterval(() => {
      saveProject();
      // Update project metadata
      const project = getProject(currentProjectId);
      if (project) {
        updateProject(currentProjectId, {
          panelCount: panels.length,
          name: settings.projectName || project.name,
        });
      }
    }, 5000); // Save every 5 seconds

    return () => clearInterval(saveInterval);
  }, [view, currentProjectId, panels.length, settings.projectName, saveProject, updateProject, getProject]);

  // Save when leaving editor
  const handleGoHome = useCallback(() => {
    if (currentProjectId) {
      saveProject();
      const project = getProject(currentProjectId);
      if (project) {
        updateProject(currentProjectId, {
          panelCount: panels.length,
          name: settings.projectName || project.name,
        });
      }
    }
    setView("home");
    setCurrentProjectId(null);
  }, [currentProjectId, panels.length, settings.projectName, saveProject, updateProject, getProject]);

  const handleOpenProject = useCallback((projectId: string) => {
    // Check if project exists
    const project = getProject(projectId);
    if (!project) {
      // Project doesn't exist, might be a new one being created
      // or a stale link - go to home
      setView("home");
      return;
    }
    
    loadProject(projectId);
    setCurrentProjectId(projectId);
    setView("editor");
  }, [loadProject, getProject]);

  // Show loading state during initialization
  if (!isInitialized) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-500">Loading CraftCut...</p>
        </div>
      </div>
    );
  }

  // Provide goHome function to Editor via context or props
  if (view === "editor" && currentProjectId) {
    return (
      <>
        <Editor onGoHome={handleGoHome} projectId={currentProjectId} />
        <InstallPrompt />
      </>
    );
  }

  return (
    <>
      <ProjectsHome onOpenProject={handleOpenProject} />
      <InstallPrompt />
    </>
  );
}
