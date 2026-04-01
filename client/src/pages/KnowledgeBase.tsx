import { useState, useEffect, useRef, useCallback } from "react";
import {
  UploadCloud, FileText, CheckCircle2, Loader2, Trash2, Search,
  Image as ImageIcon, Video, FileQuestion, FolderPlus, Folder, FolderOpen,
  MoreVertical, Pencil, X, PauseCircle, PlayCircle,
  MoveRight, AlertTriangle, Brain, Paperclip, Check, ChevronRight, ChevronDown
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Document {
  id: string;
  name: string;
  type: "knowledge" | "media";
  mimeType: string;
  createdAt: string;
  folderId?: string | null;
  paused?: string;
}

interface FolderItem {
  id: string;
  name: string;
  parentId?: string | null;
  color?: string;
  sortOrder?: number;
  createdAt: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const getFileIcon = (mimeType: string, size = 16) => {
  if (mimeType.includes("image")) return <ImageIcon size={size} />;
  if (mimeType.includes("video")) return <Video size={size} />;
  if (mimeType.includes("pdf") || mimeType.includes("word") || mimeType.includes("text"))
    return <FileText size={size} />;
  return <FileQuestion size={size} />;
};

const fmt = (d: string) =>
  new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });

// ─── Paleta de cores para pastas ──────────────────────────────────────────────

const FOLDER_COLORS = [
  { key: "",        label: "Padrão",    icon: "#f59e0b" },
  { key: "red",     label: "Vermelho",   icon: "#dc2626" },
  { key: "blue",    label: "Azul",       icon: "#2563eb" },
  { key: "green",   label: "Verde",      icon: "#16a34a" },
  { key: "purple",  label: "Roxo",       icon: "#9333ea" },
  { key: "orange",  label: "Laranja",    icon: "#ea580c" },
  { key: "pink",    label: "Rosa",       icon: "#db2777" },
  { key: "cyan",    label: "Ciano",      icon: "#0891b2" },
  { key: "gray",    label: "Cinza",      icon: "#6b7280" },
];

const getFolderIconColor = (color?: string) => {
  const found = FOLDER_COLORS.find((c) => c.key === color);
  return found?.icon ?? "#f59e0b";
};

// ─── FolderTree ───────────────────────────────────────────────────────────────

function FolderTreeNode({
  folder,
  allFolders,
  depth,
  selectedId,
  onSelect,
  onRename,
  onDelete,
  onNewSubfolder,
  onColorChange,
  docCounts,
  draggingId,
  dragOverId,
  dropSide,
  onDragStart,
  onDragOverNode,
  onDropOnNode,
  onDragEnd,
}: {
  folder: FolderItem;
  allFolders: FolderItem[];
  depth: number;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onRename: (folder: FolderItem) => void;
  onDelete: (id: string) => void;
  onNewSubfolder: (parentId: string) => void;
  onColorChange: (folder: FolderItem, color: string) => void;
  docCounts: Record<string, number>;
  draggingId: string | null;
  dragOverId: string | null;
  dropSide: "before" | "after" | "inside" | null;
  onDragStart: (folder: FolderItem) => void;
  onDragOverNode: (e: React.DragEvent, folder: FolderItem) => void;
  onDropOnNode: (target: FolderItem) => void;
  onDragEnd: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [colorMenuOpen, setColorMenuOpen] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const children = allFolders
    .filter((f) => f.parentId === folder.id && f.id !== draggingId)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  const isSelected = selectedId === folder.id;
  const count = docCounts[folder.id] ?? 0;
  const hasChildren = children.length > 0;
  const isDraggingThis = draggingId === folder.id;
  const isDropTarget = dragOverId === folder.id;
  const folderIconColor = getFolderIconColor(folder.color);

  return (
    <div style={{ opacity: isDraggingThis ? 0.4 : 1, transition: "opacity 0.15s" }}>
      {/* Drop-indicator: BEFORE */}
      {isDropTarget && dropSide === "before" && (
        <div className="h-0.5 rounded-full mx-2 my-0.5" style={{ background: "#dc2626" }} />
      )}

      <div
        draggable
        onDragStart={(e) => { e.stopPropagation(); onDragStart(folder); }}
        onDragOver={(e) => { e.stopPropagation(); onDragOverNode(e, folder); }}
        onDrop={(e) => { e.preventDefault(); e.stopPropagation(); onDropOnNode(folder); }}
        onDragEnd={onDragEnd}
        className={`group flex items-center gap-1.5 py-1.5 pr-1.5 rounded-lg cursor-grab active:cursor-grabbing transition-all duration-150 text-sm select-none ${
          isSelected
            ? "text-white"
            : isDropTarget && dropSide === "inside"
            ? "ring-2 ring-red-400 text-gray-900 bg-red-50"
            : "text-gray-600 hover:bg-red-50 hover:text-gray-900"
        }`}
        style={isSelected
          ? { background: "linear-gradient(135deg, #450a0a, #7f1d1d)", paddingLeft: `${8 + depth * 14}px` }
          : { paddingLeft: `${8 + depth * 14}px` }
        }
      >
        {/* Expand/collapse chevron */}
        <button
          onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}
          className={`w-4 h-4 flex items-center justify-center flex-shrink-0 transition-colors ${
            isSelected ? "text-white/60" : "text-gray-400"
          }`}
        >
          {hasChildren ? (
            expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />
          ) : (
            <span className="w-3" />
          )}
        </button>

        {/* Folder icon + name */}
        <div className="flex items-center gap-1.5 flex-1 min-w-0" onClick={() => onSelect(folder.id)}>
          {isSelected
            ? <FolderOpen size={13} className="flex-shrink-0" style={{ color: folderIconColor }} />
            : <Folder size={13} className="flex-shrink-0" style={{ color: folderIconColor }} />
          }
          <span className="truncate font-medium text-xs">{folder.name}</span>
        </div>

        {/* Count badge */}
        {count > 0 && (
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold flex-shrink-0 ${
            isSelected ? "bg-white/20 text-white" : "bg-red-50 text-red-600"
          }`}>
            {count}
          </span>
        )}

        {/* ⋯ menu */}
        <div className="relative flex-shrink-0">
          <button
            onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v); setColorMenuOpen(false); }}
            className={`opacity-0 group-hover:opacity-100 p-1 rounded transition-all ${
              isSelected ? "text-white/60 hover:text-white hover:bg-white/10" : "text-gray-400 hover:text-gray-700 hover:bg-gray-200"
            }`}
          >
            <MoreVertical size={11} />
          </button>
          {menuOpen && (
            <div
              className="absolute right-0 top-7 z-[60] bg-white border border-gray-200 rounded-xl shadow-xl py-1 w-44"
              onClick={(e) => e.stopPropagation()}
              onMouseLeave={() => { setMenuOpen(false); setColorMenuOpen(false); }}
            >
              <button
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50"
                onClick={() => { onNewSubfolder(folder.id); setMenuOpen(false); }}
              >
                <FolderPlus size={12} className="text-blue-500" /> Nova subpasta
              </button>
              <button
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50"
                onClick={() => { onRename(folder); setMenuOpen(false); }}
              >
                <Pencil size={12} className="text-gray-500" /> Renomear
              </button>
              {/* Cor da pasta */}
              <button
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50"
                onClick={() => setColorMenuOpen((v) => !v)}
              >
                <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: folderIconColor }} />
                Cor da pasta
              </button>
              {colorMenuOpen && (
                <div className="px-3 pb-2">
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {FOLDER_COLORS.map((c) => (
                      <button
                        key={c.key}
                        title={c.label}
                        onClick={() => { onColorChange(folder, c.key); setMenuOpen(false); setColorMenuOpen(false); }}
                        className={`w-5 h-5 rounded-full border-2 transition-transform hover:scale-110 ${
                          folder.color === c.key ? "border-gray-900 scale-110" : "border-transparent"
                        }`}
                        style={{ background: c.icon }}
                      />
                    ))}
                  </div>
                </div>
              )}
              <div className="h-px bg-gray-100 my-1" />
              <button
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-600 hover:bg-red-50"
                onClick={() => { onDelete(folder.id); setMenuOpen(false); }}
              >
                <Trash2 size={12} /> Excluir pasta
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Drop-indicator: AFTER */}
      {isDropTarget && dropSide === "after" && (
        <div className="h-0.5 rounded-full mx-2 my-0.5" style={{ background: "#dc2626" }} />
      )}

      {/* Children */}
      {expanded && hasChildren && (
        <div>
          {children.map((child) => (
            <FolderTreeNode
              key={child.id}
              folder={child}
              allFolders={allFolders}
              depth={depth + 1}
              selectedId={selectedId}
              onSelect={onSelect}
              onRename={onRename}
              onDelete={onDelete}
              onNewSubfolder={onNewSubfolder}
              onColorChange={onColorChange}
              docCounts={docCounts}
              draggingId={draggingId}
              dragOverId={dragOverId}
              dropSide={dropSide}
              onDragStart={onDragStart}
              onDragOverNode={onDragOverNode}
              onDropOnNode={onDropOnNode}
              onDragEnd={onDragEnd}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────

function Modal({ title, icon, onClose, children }: {
  title: string;
  icon: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl p-6 w-80 border border-gray-100">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
            {icon} {title}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 p-1 rounded-lg hover:bg-gray-100">
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

export default function KnowledgeBase() {
  const { toast } = useToast();

  const [documents, setDocuments] = useState<Document[]>([]);
  const [folders, setFolders] = useState<FolderItem[]>([]);

  // ─── Folder DnD state ─────────────────────────────────────────────────────
  const [draggingFolder, setDraggingFolder] = useState<FolderItem | null>(null);
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);
  const [dropSide, setDropSide] = useState<"before" | "after" | "inside" | null>(null);

  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadType, setUploadType] = useState<"knowledge" | "media">("knowledge");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [queueTotal, setQueueTotal] = useState(0);
  const [queueCurrent, setQueueCurrent] = useState(0);
  const [queueCurrentName, setQueueCurrentName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "knowledge" | "media">("all");

  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [newFolderParentId, setNewFolderParentId] = useState<string | null | undefined>(undefined);
  const [newFolderName, setNewFolderName] = useState("");
  const [renamingFolder, setRenamingFolder] = useState<FolderItem | null>(null);
  const [renameFolderName, setRenameFolderName] = useState("");
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [movingDocId, setMovingDocId] = useState<string | null>(null);

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const refresh = useCallback(async () => {
    const [docsRes, foldersRes] = await Promise.all([
      fetch("/api/documents"),
      fetch("/api/folders"),
    ]);
    if (docsRes.status === 401 || foldersRes.status === 401) {
      window.location.href = "/login"; return;
    }
    if (docsRes.ok) setDocuments(await docsRes.json());
    if (foldersRes.ok) setFolders(await foldersRes.json());
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // ── Computed ───────────────────────────────────────────────────────────────

  const docCounts = (() => {
    const counts: Record<string, number> = { __all__: documents.length, __none__: 0 };
    for (const doc of documents) {
      if (!doc.folderId) counts.__none__ = (counts.__none__) + 1;
      else counts[doc.folderId] = (counts[doc.folderId] ?? 0) + 1;
    }
    return counts;
  })();

  const filteredDocs = documents.filter((doc) => {
    if (searchTerm && !doc.name.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    if (typeFilter !== "all" && doc.type !== typeFilter) return false;
    if (selectedFolder === "__none__" && doc.folderId) return false;
    if (selectedFolder && selectedFolder !== "__none__" && doc.folderId !== selectedFolder) return false;
    return true;
  });

  const getFolderName = (id: string | null | undefined) =>
    id ? folders.find((f) => f.id === id)?.name ?? null : null;

  // ── Upload (suporte a múltiplos arquivos em fila) ──────────────────────────

  const handleFileUpload = async (file: File) => {
    setIsUploading(true);
    setUploadProgress(10);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("type", uploadType);
    if (selectedFolder && selectedFolder !== "__none__") formData.append("folderId", selectedFolder);
    const interval = setInterval(() => setUploadProgress((p) => Math.min(p + 7, 85)), 400);
    try {
      const res = await fetch("/api/documents", { method: "POST", body: formData });
      clearInterval(interval);
      setUploadProgress(100);
      if (!res.ok) {
        if (res.status === 401) { window.location.href = "/login"; return; }
        const err = await res.json().catch(() => null);
        throw new Error(err?.message || "Erro no upload");
      }
      setTimeout(() => { setUploadProgress(0); setIsUploading(false); }, 600);
      toast({ title: "Upload concluído", description: `${file.name} processado.` });
      refresh();
    } catch (err: any) {
      clearInterval(interval);
      setUploadProgress(0);
      setIsUploading(false);
      toast({ variant: "destructive", title: "Erro no upload", description: err.message });
    }
  };

  const handleMultiFileUpload = async (fileList: FileList) => {
    const files = Array.from(fileList);
    if (files.length === 0) return;

    // Arquivo único: upload simples tradicional
    if (files.length === 1) {
      handleFileUpload(files[0]);
      return;
    }

    // Múltiplos: upload em fila sequencial
    setIsUploading(true);
    setQueueTotal(files.length);
    setQueueCurrent(0);
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setQueueCurrent(i + 1);
      setQueueCurrentName(file.name);
      setUploadProgress(Math.round(((i) / files.length) * 100));

      const formData = new FormData();
      formData.append("files", file);
      formData.append("type", uploadType);
      if (selectedFolder && selectedFolder !== "__none__") formData.append("folderId", selectedFolder);

      try {
        const res = await fetch("/api/documents/upload-queue", { method: "POST", body: formData });
        if (!res.ok) {
          if (res.status === 401) { window.location.href = "/login"; return; }
          errorCount++;
        } else {
          successCount++;
        }
      } catch {
        errorCount++;
      }
    }

    setUploadProgress(100);
    setTimeout(() => {
      setIsUploading(false);
      setUploadProgress(0);
      setQueueTotal(0);
      setQueueCurrent(0);
      setQueueCurrentName("");
    }, 800);

    toast({
      title: `Upload concluído`,
      description: `${successCount} arquivo${successCount !== 1 ? "s" : ""} processado${successCount !== 1 ? "s" : ""}${errorCount > 0 ? ` · ${errorCount} erro${errorCount !== 1 ? "s" : ""}` : ""}`,
    });
    refresh();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) handleMultiFileUpload(files);
  };

  // ── Document actions ───────────────────────────────────────────────────────

  const handleDelete = async (id: string) => {
    await fetch(`/api/documents/${id}`, { method: "DELETE" });
    setDocuments((d) => d.filter((x) => x.id !== id));
    setSelected((s) => { const n = new Set(s); n.delete(id); return n; });
    toast({ title: "Documento excluído." });
  };

  const handleTogglePause = async (doc: Document) => {
    const newPaused = doc.paused !== "true";
    const res = await fetch(`/api/documents/${doc.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paused: newPaused }),
    });
    if (res.ok) {
      const updated = await res.json();
      setDocuments((d) => d.map((x) => (x.id === doc.id ? updated : x)));
    }
  };

  const handleMoveToFolder = async (docId: string, folderId: string | null) => {
    const res = await fetch(`/api/documents/${docId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folderId }),
    });
    if (res.ok) {
      const updated = await res.json();
      setDocuments((d) => d.map((x) => (x.id === docId ? updated : x)));
      setMovingDocId(null);
      toast({ title: "Documento movido." });
    }
  };

  // ── Bulk ───────────────────────────────────────────────────────────────────

  const handleBulkDelete = async () => {
    const ids = Array.from(selected);
    const res = await fetch("/api/documents/bulk", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    if (res.ok || res.status === 204) {
      setDocuments((d) => d.filter((x) => !ids.includes(x.id)));
      setSelected(new Set()); setBulkDeleteConfirm(false);
      toast({ title: `${ids.length} documentos excluídos.` });
    }
  };

  const handleBulkPause = async (pause: boolean) => {
    const ids = Array.from(selected);
    await Promise.all(ids.map((id) =>
      fetch(`/api/documents/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paused: pause }),
      })
    ));
    refresh(); setSelected(new Set());
    toast({ title: pause ? "Pausados" : "Retomados", description: `${ids.length} documentos atualizados.` });
  };

  const handleBulkMove = async (folderId: string | null) => {
    const ids = Array.from(selected);
    await Promise.all(ids.map((id) =>
      fetch(`/api/documents/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderId }),
      })
    ));
    refresh(); setSelected(new Set());
    toast({ title: "Movidos", description: `${ids.length} documentos movidos.` });
  };

  const handleColorChange = async (folder: FolderItem, color: string) => {
    await fetch(`/api/folders/${folder.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ color }),
    });
    setFolders((prev) => prev.map((f) => f.id === folder.id ? { ...f, color } : f));
  };

  // ─── Folder DnD handlers (HTML5 native) ──────────────────────────────────────

  const handleFolderDragStart = (folder: FolderItem) => {
    setDraggingFolder(folder);
  };

  const handleFolderDragOverNode = (e: React.DragEvent, target: FolderItem) => {
    e.preventDefault();
    if (!draggingFolder || target.id === draggingFolder.id) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect?.() ?? (e.target as HTMLElement).getBoundingClientRect();
    const y = e.clientY - rect.top;
    const h = rect.height;
    setDragOverFolderId(target.id);
    if (y < h * 0.25) setDropSide("before");
    else if (y > h * 0.75) setDropSide("after");
    else setDropSide("inside");
  };

  const handleFolderDropOnNode = async (target: FolderItem) => {
    if (!draggingFolder || target.id === draggingFolder.id) {
      setDraggingFolder(null); setDragOverFolderId(null); setDropSide(null);
      return;
    }
    if (dropSide === "inside") {
      // Move draggedFolder into target (change parentId)
      await fetch(`/api/folders/${draggingFolder.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parentId: target.id }),
      });
    } else {
      // Re-order: insert before/after target at same parent level
      const sameLevel = folders
        .filter((f) => f.parentId === target.parentId && f.id !== draggingFolder.id)
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
      const targetIdx = sameLevel.findIndex((f) => f.id === target.id);
      const insertAt = dropSide === "before" ? targetIdx : targetIdx + 1;
      sameLevel.splice(insertAt, 0, { ...draggingFolder, parentId: target.parentId });
      const orders = sameLevel.map((f, i) => ({ id: f.id, sortOrder: i }));
      await fetch(`/api/folders/reorder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orders }),
      });
      // Also update parentId if different
      if (draggingFolder.parentId !== target.parentId) {
        await fetch(`/api/folders/${draggingFolder.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ parentId: target.parentId }),
        });
      }
    }
    setDraggingFolder(null); setDragOverFolderId(null); setDropSide(null);
    refresh();
    toast({ title: "Pasta reorganizada" });
  };

  const handleFolderDragEnd = () => {
    setDraggingFolder(null); setDragOverFolderId(null); setDropSide(null);
  };

  const rootFolders = folders
    .filter((f) => !f.parentId)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));



  // ── Folders ──────────────────────────────────────────────────────────────

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    await fetch("/api/folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newFolderName.trim(), parentId: newFolderParentId ?? null }),
    });
    setNewFolderParentId(undefined); setNewFolderName(""); refresh();
  };

  const handleRenameFolder = async () => {
    if (!renamingFolder || !renameFolderName.trim()) return;
    await fetch(`/api/folders/${renamingFolder.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: renameFolderName.trim() }),
    });
    setRenamingFolder(null); setRenameFolderName(""); refresh();
  };

  const handleDeleteFolder = async (id: string) => {
    await fetch(`/api/folders/${id}`, { method: "DELETE" });
    if (selectedFolder === id) setSelectedFolder(null);
    refresh();
  };

  // ── Selection ──────────────────────────────────────────────────────────────

  const toggleSelect = (id: string) => {
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  const toggleAll = () => {
    setSelected(selected.size === filteredDocs.length ? new Set() : new Set(filteredDocs.map((d) => d.id)));
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full">

      {/* ── Header ── */}
      <div className="px-8 pt-7 pb-5 bg-white border-b border-gray-100">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center shadow-sm" style={{ background: "linear-gradient(135deg, #450a0a, #dc2626)" }}>
                <Brain size={18} className="text-white" />
              </div>
              <h1 className="text-xl font-bold text-gray-900">Base de Conhecimento</h1>
            </div>
            <p className="text-xs text-gray-400 ml-12">
              Carregue documentos para vetorização RAG ou mídias para envio direto pelo Prime Bot.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 rounded-full border border-red-100 text-xs text-red-700 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" />
              {documents.filter((d) => d.type === "knowledge" && d.paused !== "true").length} ativos
            </span>
            <span className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 rounded-full border border-red-100 text-xs text-red-700 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-red-300 inline-block" />
              {documents.filter((d) => d.type === "media").length} mídias
            </span>
          </div>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex flex-1 overflow-hidden bg-gray-50/50">

        {/* ── Sidebar ── */}
        <aside className="w-52 flex-shrink-0 border-r border-gray-100 bg-white px-3 py-4 flex flex-col">
          <div className="flex items-center justify-between px-2 mb-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Pastas</p>
            <button
              onClick={() => { setNewFolderParentId(null); setNewFolderName(""); }}
              title="Nova pasta"
              className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            >
              <FolderPlus size={13} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto space-y-0.5">
            {/* All documents */}
            <div
            onClick={() => setSelectedFolder(null)}
            className={`flex items-center gap-2 px-2 py-2 rounded-lg cursor-pointer transition-all text-xs font-semibold`}
            style={selectedFolder === null
              ? { background: "linear-gradient(135deg, #450a0a, #7f1d1d)", color: "#fff" }
              : { color: "#4b5563" }
            }
          >
              <Brain size={13} className="flex-shrink-0" />
              <span className="flex-1 truncate">Todos os documentos</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                selectedFolder === null ? "bg-white/20 text-white" : "bg-gray-200 text-gray-500"
              }`}>{docCounts.__all__ ?? 0}</span>
            </div>

            {/* No folder */}
            <div
            onClick={() => setSelectedFolder("__none__")}
            className={`flex items-center gap-2 px-2 py-2 rounded-lg cursor-pointer transition-all text-xs`}
            style={selectedFolder === "__none__"
              ? { background: "linear-gradient(135deg, #450a0a, #7f1d1d)", color: "#fff", fontWeight: 600 }
              : { color: "#6b7280" }
            }
          >
              <Folder size={13} className="flex-shrink-0 opacity-40" />
              <span className="flex-1 italic">Sem pasta</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
              selectedFolder === "__none__" ? "bg-white/20 text-white" : "bg-red-50 text-red-600"
            }`}>{docCounts.__none__ ?? 0}</span>
            </div>

            {rootFolders.length > 0 && <div className="h-px bg-gray-100 my-2" />}

            {rootFolders.map((f) => (
              <FolderTreeNode
                key={f.id}
                folder={f}
                allFolders={folders}
                depth={0}
                selectedId={selectedFolder}
                onSelect={setSelectedFolder}
                onRename={(ff) => { setRenamingFolder(ff); setRenameFolderName(ff.name); }}
                onDelete={handleDeleteFolder}
                onNewSubfolder={(parentId) => { setNewFolderParentId(parentId); setNewFolderName(""); }}
                onColorChange={handleColorChange}
                docCounts={docCounts}
                draggingId={draggingFolder?.id ?? null}
                dragOverId={dragOverFolderId}
                dropSide={dropSide}
                onDragStart={handleFolderDragStart}
                onDragOverNode={handleFolderDragOverNode}
                onDropOnNode={handleFolderDropOnNode}
                onDragEnd={handleFolderDragEnd}
              />
            ))}

            {folders.length === 0 && (
              <p className="text-[10px] text-gray-400 text-center py-4 italic">
                Nenhuma pasta criada.
              </p>
            )}
          </div>
        </aside>

        {/* ── Main ── */}
        <main className="flex-1 flex flex-col overflow-hidden">

          {/* Upload Zone */}
          <div className="px-6 pt-5 pb-4 border-b border-gray-100 bg-white">
            {/* Type cards */}
            <div className="flex gap-2 mb-3">
              {([
                {
                  value: "knowledge" as const,
                  icon: <Brain size={16} />,
                  label: "Fonte de Conhecimento",
                  desc: "PDF, DOCX, TXT — vetorizado (RAG)",
                  bg: uploadType === "knowledge" ? "border-red-800 text-white" : "bg-white text-gray-600 border-gray-200 hover:border-red-300",
                },
                {
                  value: "media" as const,
                  icon: <Paperclip size={16} />,
                  label: "Mídia para Envio",
                  desc: "Imagens, vídeos, PDFs — chat direto",
                  bg: uploadType === "media" ? "border-red-800 text-white" : "bg-white text-gray-600 border-gray-200 hover:border-red-300",
                },
              ]).map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setUploadType(opt.value)}
                  className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl border-2 transition-all duration-200 flex-1 text-left ${opt.bg}`}
                  style={uploadType === opt.value ? { background: "linear-gradient(135deg, #450a0a, #7f1d1d)" } : {}}
                >
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${uploadType === opt.value ? "bg-white/15" : "bg-gray-100"}`}>
                    {opt.icon}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold truncate">{opt.label}</p>
                    <p className={`text-[10px] truncate mt-0.5 ${uploadType === opt.value ? "text-white/60" : "text-gray-400"}`}>{opt.desc}</p>
                  </div>
                  {uploadType === opt.value && <Check size={14} className="ml-auto flex-shrink-0" />}
                </button>
              ))}
            </div>

            {/* Drop area */}
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => !isUploading && fileInputRef.current?.click()}
              className={`flex items-center gap-4 px-5 py-4 rounded-xl border-2 border-dashed cursor-pointer transition-all duration-200 ${
                isDragging
                  ? "border-red-400 bg-red-50/60 scale-[1.02] shadow-xl"
                  : "border-gray-200 bg-gray-50/60 hover:border-red-300 hover:bg-white hover:shadow-md"
              }`}
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors ${
                isDragging ? "bg-red-100 text-red-600" : "bg-white border border-gray-200 text-gray-400 shadow-sm"
              }`}>
                {isUploading ? <Loader2 size={18} className="animate-spin text-gray-900" /> : <UploadCloud size={18} />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-800">
                  {isUploading
                    ? queueTotal > 1
                      ? `Processando ${queueCurrent}/${queueTotal} — ${queueCurrentName}`
                      : "Processando..."
                    : isDragging ? "Solte os arquivos aqui" : "Arraste ou clique para selecionar (múltiplos)"}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {uploadType === "knowledge" ? "PDF, DOCX ou TXT — será vetorizado para a I.A. (aceita múltiplos)" : "Imagens, vídeos ou PDFs para envio direto"}
                </p>
                {isUploading && (
                  <div className="mt-2 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${uploadProgress}%`, background: "linear-gradient(90deg, #7f1d1d, #dc2626)" }}
                    />
                  </div>
                )}
              </div>
              {!isUploading && (
                <span className="flex-shrink-0 px-3.5 py-2 text-xs font-semibold text-white rounded-lg hover:opacity-90 transition-colors" style={{ background: "linear-gradient(135deg, #7f1d1d, #dc2626)" }}>
                  Procurar
                </span>
              )}
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => e.target.files && e.target.files.length > 0 && handleMultiFileUpload(e.target.files)}
                disabled={isUploading}
              />
            </div>
          </div>

          {/* List toolbar */}
          <div className="px-6 py-3 border-b border-gray-100 bg-white flex items-center gap-3 flex-wrap">
            <div className="flex-1 relative min-w-36">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" size={13} />
              <Input
                placeholder="Pesquisar..."
                className="pl-8 h-8 text-xs bg-gray-50 border-gray-200"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="flex gap-1">
              {(["all", "knowledge", "media"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTypeFilter(t)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all duration-200 active:scale-95 ${
                    typeFilter === t
                      ? "text-white scale-[1.03] shadow-sm"
                      : "bg-white border border-gray-200 text-gray-600 hover:border-red-300 hover:scale-[1.02]"
                  }`}
                  style={typeFilter === t ? { background: "linear-gradient(135deg, #7f1d1d, #dc2626)" } : {}}
                >
                  {t === "all" ? "Todos" : t === "knowledge" ? "Conhecimento" : "Mídia"}
                </button>
              ))}
            </div>
          </div>

          {/* Bulk action bar */}
          {selected.size > 0 && (
            <div className="mx-6 mt-3 px-4 py-2.5 rounded-xl flex items-center gap-3 flex-wrap shadow-lg" style={{ background: "linear-gradient(135deg, #1a0000, #7f1d1d)" }}>
              <span className="text-white text-xs font-semibold flex-1">
                {selected.size} selecionado{selected.size > 1 ? "s" : ""}
              </span>
              <button
                onClick={() => handleBulkPause(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white text-xs font-semibold rounded-lg transition-colors"
              >
                <PauseCircle size={12} /> Pausar
              </button>
              <button
                onClick={() => handleBulkPause(false)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white text-xs font-semibold rounded-lg transition-colors"
              >
                <PlayCircle size={12} /> Retomar
              </button>
              {/* Mover */}
              <div className="relative group/bmove">
                <button className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white text-xs font-semibold rounded-lg transition-colors">
                  <MoveRight size={12} /> Mover ▾
                </button>
                <div className="absolute top-full left-0 mt-1 z-50 bg-white border border-gray-200 rounded-xl shadow-xl py-1 w-44 hidden group-hover/bmove:block">
                  <button
                    className="w-full text-left px-3 py-2 text-xs text-gray-600 hover:bg-gray-50 flex items-center gap-2"
                    onClick={() => handleBulkMove(null)}
                  >
                    <Folder size={11} className="opacity-40" /> Sem pasta
                  </button>
                  {folders.map((f) => (
                    <button
                      key={f.id}
                      className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                      onClick={() => handleBulkMove(f.id)}
                    >
                      <Folder size={11} className="text-amber-500" /> {f.name}
                    </button>
                  ))}
                </div>
              </div>
              <button
                onClick={() => setBulkDeleteConfirm(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500 hover:bg-red-400 text-white text-xs font-semibold rounded-lg transition-colors"
              >
                <Trash2 size={12} /> Excluir {selected.size}
              </button>
              <button onClick={() => setSelected(new Set())} className="text-white/50 hover:text-white">
                <X size={15} />
              </button>
            </div>
          )}

          {/* Table header */}
          {filteredDocs.length > 0 && (
            <div className="px-6 pt-4 pb-1.5 flex items-center gap-3 text-[10px] font-bold uppercase tracking-wider text-gray-400">
              <div className="w-5 flex-shrink-0">
                <input
                  type="checkbox"
                  className="rounded accent-red-700 cursor-pointer"
                  checked={selected.size === filteredDocs.length && filteredDocs.length > 0}
                  onChange={toggleAll}
                />
              </div>
              <span className="flex-1">Documento</span>
              <span className="w-24 text-center">Pasta</span>
              <span className="w-24 text-center">Status</span>
              <span className="w-24 text-right">Ações</span>
            </div>
          )}

          {/* Document list */}
          <div className="flex-1 overflow-y-auto px-6 pb-6 pt-1 space-y-1.5">
            {filteredDocs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mb-3">
                  <Brain size={24} className="text-gray-300" />
                </div>
                <p className="text-sm font-medium text-gray-500">Nenhum documento encontrado</p>
                <p className="text-xs mt-1 text-gray-400">
                  {searchTerm ? "Tente outro termo de busca" : "Carregue um arquivo acima para começar"}
                </p>
              </div>
            ) : (
              filteredDocs.map((doc, docIndex) => {
                const isPaused = doc.paused === "true";
                const isSelected = selected.has(doc.id);
                const folder = getFolderName(doc.folderId);
                const staggerIdx = Math.min(docIndex + 1, 6);

                return (
                  <div
                    key={doc.id}
                    className={`animate-pop-in group flex items-center gap-3 px-4 py-3 rounded-xl border transition-all duration-150 ${
                      isSelected
                        ? "border-gray-400 bg-gray-50 shadow-sm"
                        : "border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm"
                    }`}
                    style={{ animationDelay: `${(staggerIdx - 1) * 40}ms` }}
                  >
                    {/* Checkbox */}
                    <div className="w-5 flex-shrink-0">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(doc.id)}
                        className="rounded accent-gray-900 cursor-pointer"
                      />
                    </div>

                    {/* Icon */}
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                doc.type === "knowledge"
                  ? isPaused ? "bg-amber-50 text-amber-500" : "bg-red-50 text-red-600"
                  : "bg-red-100 text-red-800"
              }`}>
                      {getFileIcon(doc.mimeType)}
                    </div>

                    {/* Name */}
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-semibold truncate ${isPaused ? "text-gray-400" : "text-gray-900"}`}>
                        {doc.name}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {doc.type === "knowledge" ? "Conhecimento" : "Mídia"} · {fmt(doc.createdAt)}
                      </p>
                    </div>

                    {/* Folder cell */}
                    <div className="w-24 flex justify-center">
                      {movingDocId === doc.id ? (
                        <select
                          className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white text-gray-700 w-full"
                          defaultValue={doc.folderId ?? ""}
                          onChange={(e) => handleMoveToFolder(doc.id, e.target.value || null)}
                          onBlur={() => setMovingDocId(null)}
                          autoFocus
                        >
                          <option value="">Sem pasta</option>
                          {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                        </select>
                      ) : folder ? (
                        <button
                          onClick={() => setMovingDocId(doc.id)}
                          className="flex items-center gap-1 px-2 py-1 text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded-full hover:bg-amber-100 transition-colors max-w-full"
                        >
                          <Folder size={9} className="flex-shrink-0" />
                          <span className="truncate">{folder}</span>
                        </button>
                      ) : (
                        <button
                          onClick={() => setMovingDocId(doc.id)}
                          className="opacity-0 group-hover:opacity-100 flex items-center gap-1 px-2 py-1 text-[10px] text-gray-400 border border-dashed border-gray-300 rounded-full hover:text-gray-600 hover:border-gray-500 transition-all"
                        >
                          <FolderPlus size={9} /> Pasta
                        </button>
                      )}
                    </div>

                    {/* Status badge */}
                    <div className="w-24 flex justify-center">
                      {doc.type === "knowledge" ? (
                        isPaused ? (
                          <span className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-full">
                            <PauseCircle size={10} /> Pausado
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-semibold text-green-700 bg-green-50 border border-green-200 rounded-full">
                            <CheckCircle2 size={10} /> Ativo
                          </span>
                        )
                      ) : (
                        <span className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-full">
                          <Paperclip size={10} /> Mídia
                        </span>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="w-24 flex items-center justify-end gap-1">
                      {doc.type === "knowledge" && (
                        <button
                          onClick={() => handleTogglePause(doc)}
                          title={isPaused ? "Retomar uso pela I.A." : "Pausar uso pela I.A."}
                          className={`p-1.5 rounded-lg transition-colors ${
                            isPaused ? "text-green-600 hover:bg-green-50" : "text-amber-500 hover:bg-amber-50"
                          }`}
                        >
                          {isPaused ? <PlayCircle size={14} /> : <PauseCircle size={14} />}
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(doc.id)}
                        title="Excluir"
                        className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </main>
      </div>

      {/* ── Modals ── */}

      {newFolderParentId !== undefined && (
        <Modal
          title={newFolderParentId ? "Nova subpasta" : "Nova pasta"}
          icon={<FolderPlus size={15} className="text-blue-500" />}
          onClose={() => { setNewFolderParentId(undefined); setNewFolderName(""); }}
        >
          {newFolderParentId && (
            <p className="text-xs text-gray-500 mb-3">
              Dentro de: <span className="font-semibold text-gray-700">{folders.find(f => f.id === newFolderParentId)?.name}</span>
            </p>
          )}
          <Input
            placeholder="Nome da pasta"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreateFolder()}
            autoFocus
            className="mb-4 text-sm"
          />
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1 text-xs" onClick={() => { setNewFolderParentId(undefined); setNewFolderName(""); }}>
              Cancelar
            </Button>
            <Button
              className="flex-1 text-xs bg-gray-900 hover:bg-black text-white"
              onClick={handleCreateFolder}
              disabled={!newFolderName.trim()}
            >
              Criar Pasta
            </Button>
          </div>
        </Modal>
      )}

      {renamingFolder && (
        <Modal
          title="Renomear pasta"
          icon={<Pencil size={14} className="text-gray-500" />}
          onClose={() => setRenamingFolder(null)}
        >
          <Input
            value={renameFolderName}
            onChange={(e) => setRenameFolderName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleRenameFolder()}
            autoFocus
            className="mb-4 text-sm"
          />
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1 text-xs" onClick={() => setRenamingFolder(null)}>
              Cancelar
            </Button>
            <Button
              className="flex-1 text-xs bg-gray-900 hover:bg-black text-white"
              onClick={handleRenameFolder}
              disabled={!renameFolderName.trim()}
            >
              Salvar
            </Button>
          </div>
        </Modal>
      )}

      {bulkDeleteConfirm && (
        <Modal
          title={`Excluir ${selected.size} documentos?`}
          icon={<AlertTriangle size={15} className="text-red-500" />}
          onClose={() => setBulkDeleteConfirm(false)}
        >
          <p className="text-xs text-gray-500 mb-5">Esta ação é irreversível. Os arquivos serão permanentemente removidos.</p>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1 text-xs" onClick={() => setBulkDeleteConfirm(false)}>
              Cancelar
            </Button>
            <Button className="flex-1 text-xs bg-red-600 hover:bg-red-700 text-white" onClick={handleBulkDelete}>
              <Trash2 size={12} className="mr-1.5" /> Excluir
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}