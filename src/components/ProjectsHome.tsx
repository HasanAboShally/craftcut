/**
 * Projects Home Page
 * 
 * Lists all projects with create, open, rename, delete functionality.
 */

import {
  Clock,
  Copy,
  FolderOpen,
  MoreVertical,
  PenLine,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import { useProjectsStore, type ProjectMeta } from "../stores/projectsStore";
import { CraftCutLogo } from "./CraftCutLogo";
import { ConfirmModal } from "./ui/ConfirmModal";

interface ProjectsHomeProps {
  onOpenProject: (projectId: string) => void;
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
}

function ProjectCard({
  project,
  onOpen,
  onRename,
  onDuplicate,
  onDelete,
}: {
  project: ProjectMeta;
  onOpen: () => void;
  onRename: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (showMenu) {
      const handleClickOutside = (e: MouseEvent) => {
        if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
          setShowMenu(false);
        }
      };
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showMenu]);

  return (
    <div
      className="group relative bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-500 hover:shadow-lg transition-all cursor-pointer"
      onClick={onOpen}
    >
      {/* Preview Area */}
      <div className="h-40 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-700 dark:to-slate-800 rounded-t-xl flex items-center justify-center overflow-hidden">
        {project.thumbnail ? (
          <img 
            src={project.thumbnail} 
            alt={project.name}
            className="w-full h-full object-cover"
          />
        ) : project.panelCount > 0 ? (
          <div className="text-center">
            <div className="text-3xl font-bold text-slate-300 dark:text-slate-500">{project.panelCount}</div>
            <div className="text-xs text-slate-400 dark:text-slate-500">panels</div>
          </div>
        ) : (
          <div className="text-slate-300 dark:text-slate-600">
            <FolderOpen size={48} strokeWidth={1} />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-4">
        <h3 className="font-medium text-gray-900 dark:text-white truncate" title={project.name}>
          {project.name}
        </h3>
        <div className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500 mt-1">
          <Clock size={12} />
          <span>{formatDate(project.updatedAt)}</span>
        </div>
      </div>

      {/* Menu Button */}
      <div className="absolute top-2 right-2" ref={menuRef}>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowMenu(!showMenu);
          }}
          className="p-2 rounded-lg bg-white/80 hover:bg-white text-gray-500 hover:text-gray-700 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
          aria-label="Project options"
        >
          <MoreVertical size={16} />
        </button>

        {showMenu && (
          <div className="absolute right-0 top-full mt-1 bg-white rounded-lg shadow-xl border border-gray-200 py-1 min-w-[140px] z-10 animate-scale-in">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRename();
                setShowMenu(false);
              }}
              className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
            >
              <PenLine size={14} />
              Rename
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDuplicate();
                setShowMenu(false);
              }}
              className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
            >
              <Copy size={14} />
              Duplicate
            </button>
            <hr className="my-1 border-gray-200" />
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
                setShowMenu(false);
              }}
              className="w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
            >
              <Trash2 size={14} />
              Delete
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ProjectsHome({ onOpenProject }: ProjectsHomeProps) {
  const { projects, createProject, updateProject, deleteProject, duplicateProject } =
    useProjectsStore();
  const [searchQuery, setSearchQuery] = useState("");
  const [renamingProject, setRenamingProject] = useState<ProjectMeta | null>(null);
  const [newName, setNewName] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<ProjectMeta | null>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Filter projects by search
  const filteredProjects = projects.filter((p) =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Sort by most recently updated
  const sortedProjects = [...filteredProjects].sort(
    (a, b) => b.updatedAt - a.updatedAt
  );

  const handleCreateProject = () => {
    const newId = createProject();
    onOpenProject(newId);
  };

  const handleRename = (project: ProjectMeta) => {
    setRenamingProject(project);
    setNewName(project.name);
    setTimeout(() => renameInputRef.current?.select(), 50);
  };

  const handleRenameSubmit = () => {
    if (renamingProject && newName.trim()) {
      updateProject(renamingProject.id, { name: newName.trim() });
    }
    setRenamingProject(null);
    setNewName("");
  };

  const handleDuplicate = (project: ProjectMeta) => {
    const newId = duplicateProject(project.id);
    onOpenProject(newId);
  };

  const handleDelete = (project: ProjectMeta) => {
    setDeleteConfirm(project);
  };

  const confirmDelete = () => {
    if (deleteConfirm) {
      deleteProject(deleteConfirm.id);
      setDeleteConfirm(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CraftCutLogo size={32} variant="color" label="" />
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-bold text-gray-900">CraftCut</h1>
                  <span className="px-1.5 py-0.5 text-xs font-semibold bg-blue-100 text-blue-700 rounded">Beta</span>
                </div>
                <p className="text-sm text-gray-500">DIY Furniture Planner</p>
              </div>
            </div>

            <button
              onClick={handleCreateProject}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              <Plus size={18} />
              New Project
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-6 py-8">
        {/* Search */}
        {projects.length > 0 && (
          <div className="mb-6">
            <div className="relative max-w-md">
              <Search
                size={18}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search projects..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>
        )}

        {/* Projects Grid */}
        {projects.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-20 h-20 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <FolderOpen size={40} className="text-slate-400" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              No projects yet
            </h2>
            <p className="text-gray-500 mb-6 max-w-sm mx-auto">
              Create your first furniture project to start designing and
              generating cut lists.
            </p>
            <button
              onClick={handleCreateProject}
              className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              <Plus size={20} />
              Create First Project
            </button>
          </div>
        ) : sortedProjects.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500">No projects match "{searchQuery}"</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {sortedProjects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                onOpen={() => onOpenProject(project.id)}
                onRename={() => handleRename(project)}
                onDuplicate={() => handleDuplicate(project)}
                onDelete={() => handleDelete(project)}
              />
            ))}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200 mt-auto">
        <div className="max-w-6xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between text-sm text-gray-400">
            <div className="flex items-center gap-2">
              <CraftCutLogo size={16} variant="mono" className="text-gray-400" label="" />
              <span>CraftCut</span>
            </div>
            <span>© {new Date().getFullYear()} — Free & open-source DIY planner</span>
          </div>
        </div>
      </footer>

      {/* Rename Modal */}
      {renamingProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setRenamingProject(null)}
          />
          <div className="relative bg-white rounded-xl shadow-2xl p-6 w-full max-w-md animate-scale-in">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Rename Project
            </h3>
            <input
              ref={renameInputRef}
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleRenameSubmit();
                if (e.key === "Escape") setRenamingProject(null);
              }}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4"
              placeholder="Project name"
            />
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setRenamingProject(null)}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleRenameSubmit}
                disabled={!newName.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Rename
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      <ConfirmModal
        isOpen={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={confirmDelete}
        title="Delete Project"
        message={`Are you sure you want to delete "${deleteConfirm?.name}"? This action cannot be undone.`}
        confirmText="Delete"
        variant="danger"
      />
    </div>
  );
}
