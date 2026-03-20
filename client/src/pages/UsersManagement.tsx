import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { type User, type InsertUser } from "@shared/schema";
import {
  Users,
  Plus,
  Pencil,
  Trash2,
  Shield,
  Mail,
  User as UserIcon,
  Search,
  X,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// ─────────────────────────────────────────────────────────
// Sub-component: User Form (Create / Edit)
// ─────────────────────────────────────────────────────────
function UserForm({
  initialData,
  onCancel,
  onSubmit,
  isPending,
}: {
  initialData: User | null;
  onCancel: () => void;
  onSubmit: (data: InsertUser) => void;
  isPending: boolean;
}) {
  const [formData, setFormData] = useState<InsertUser>({
    name: initialData?.name || "",
    email: initialData?.email || "",
    username: initialData?.username || "",
    password: "",
  });
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Nome */}
        <div className="space-y-2">
          <Label className="text-xs font-bold uppercase tracking-widest text-zinc-400 flex items-center gap-2">
            <UserIcon size={11} /> Nome Completo
          </Label>
          <Input
            value={formData.name}
            onChange={e => setFormData({ ...formData, name: e.target.value })}
            placeholder="Ex: João da Silva"
            className="h-11 border-zinc-200 bg-zinc-50 focus-visible:ring-red-500/20 focus-visible:border-red-500 rounded-xl transition-all"
          />
        </div>

        {/* Email */}
        <div className="space-y-2">
          <Label className="text-xs font-bold uppercase tracking-widest text-zinc-400 flex items-center gap-2">
            <Mail size={11} /> Email
          </Label>
          <Input
            type="email"
            value={formData.email}
            onChange={e => setFormData({ ...formData, email: e.target.value })}
            placeholder="joao@empresa.com.br"
            className="h-11 border-zinc-200 bg-zinc-50 focus-visible:ring-red-500/20 focus-visible:border-red-500 rounded-xl transition-all"
          />
        </div>

        {/* Username */}
        <div className="space-y-2">
          <Label className="text-xs font-bold uppercase tracking-widest text-zinc-400 flex items-center gap-2">
            <UserIcon size={11} /> Nome de Usuário
          </Label>
          <Input
            value={formData.username}
            onChange={e => setFormData({ ...formData, username: e.target.value })}
            placeholder="joao.silva"
            className="h-11 border-zinc-200 bg-zinc-50 focus-visible:ring-red-500/20 focus-visible:border-red-500 rounded-xl transition-all"
          />
        </div>

        {/* Senha */}
        <div className="space-y-2">
          <Label className="text-xs font-bold uppercase tracking-widest text-zinc-400 flex items-center gap-2">
            <Shield size={11} /> Senha de Acesso
          </Label>
          <div className="relative">
            <Input
              type={showPassword ? "text" : "password"}
              value={formData.password}
              onChange={e => setFormData({ ...formData, password: e.target.value })}
              placeholder={initialData ? "Deixe em branco para manter a senha" : "Defina uma senha"}
              className="h-11 pr-11 border-zinc-200 bg-zinc-50 focus-visible:ring-red-500/20 focus-visible:border-red-500 rounded-xl transition-all"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700 transition-colors"
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <Button
          type="button"
          variant="ghost"
          onClick={onCancel}
          className="text-zinc-500 hover:text-zinc-800 rounded-xl px-6 h-11"
        >
          Cancelar
        </Button>
        <Button
          type="button"
          disabled={isPending || !formData.name || !formData.email || !formData.username || (!initialData && !formData.password)}
          onClick={() => {
            const dataToSubmit = { ...formData };
            if (initialData && !dataToSubmit.password) {
              delete (dataToSubmit as any).password;
            }
            onSubmit(dataToSubmit);
          }}
          className="bg-gradient-to-r from-red-700 to-red-500 hover:from-red-800 hover:to-red-600 text-white px-8 rounded-xl h-11 shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5 font-semibold"
        >
          {isPending ? (
            <Loader2 size={16} className="animate-spin" />
          ) : initialData ? (
            "Salvar Alterações"
          ) : (
            "Criar Usuário"
          )}
        </Button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────
export default function UsersManagement() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [deletingUser, setDeletingUser] = useState<User | null>(null);

  // ── Data ──────────────────────────────────────────────
  const { data: users = [], isLoading, isError } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });

  // ── Mutations ────────────────────────────────────────
  const createUserMutation = useMutation({
    mutationFn: (user: InsertUser) => apiRequest("POST", "/api/users", user),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      setDialogOpen(false);
      toast({ title: "✅ Usuário criado", description: "O novo usuário foi cadastrado com sucesso." });
    },
    onError: (err: Error) => {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    },
  });

  const updateUserMutation = useMutation({
    mutationFn: ({ id, ...user }: Partial<InsertUser> & { id: string }) =>
      apiRequest("PATCH", `/api/users/${id}`, user),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      setEditingUser(null);
      setDialogOpen(false);
      toast({ title: "✅ Usuário atualizado", description: "As informações foram salvas com sucesso." });
    },
    onError: (err: Error) => {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/users/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      setDeletingUser(null);
      toast({ title: "Usuário removido", description: "O acesso foi revogado com sucesso." });
    },
    onError: (err: Error) => {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    },
  });

  // ── Helpers ──────────────────────────────────────────
  const filteredUsers = users.filter(u =>
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase()) ||
    u.username.toLowerCase().includes(search.toLowerCase())
  );

  function openCreate() {
    setEditingUser(null);
    setDialogOpen(true);
  }

  function openEdit(user: User) {
    setEditingUser(user);
    setDialogOpen(true);
  }

  function handleFormSubmit(data: InsertUser) {
    if (editingUser) {
      updateUserMutation.mutate({ id: editingUser.id, ...data });
    } else {
      createUserMutation.mutate(data);
    }
  }

  const isPendingMutation = createUserMutation.isPending || updateUserMutation.isPending;

  // ── Render ───────────────────────────────────────────
  return (
    <div className="flex flex-col h-full p-8 space-y-6 overflow-y-auto animate-page-enter">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div
            className="p-3 rounded-2xl flex items-center justify-center shadow-md"
            style={{ background: "linear-gradient(135deg, #7f1d1d 0%, #dc2626 100%)" }}
          >
            <Users size={26} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold text-zinc-950 tracking-tight">Usuários & Acessos</h1>
            <p className="text-sm text-zinc-500 mt-0.5">
              Gerencie os membros com acesso ao painel de controle.
            </p>
          </div>
        </div>
        <Button
          onClick={openCreate}
          className="gap-2 bg-gradient-to-r from-red-800 to-red-600 hover:from-red-900 hover:to-red-700 text-white rounded-xl px-6 h-11 shadow-sm hover:shadow-lg transition-all hover:-translate-y-0.5 font-semibold"
        >
          <Plus size={18} />
          Novo Usuário
        </Button>
      </div>

      {/* ── Stats Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          {
            label: "Total de Usuários",
            value: isLoading ? "—" : users.length,
            icon: Users,
            color: "from-red-700 to-red-500",
          },
          {
            label: "Ativos",
            value: isLoading ? "—" : users.length,
            icon: CheckCircle2,
            color: "from-red-600 to-red-400",
          },
          {
            label: "Administradores",
            value: isLoading ? "—" : users.length > 0 ? 1 : 0,
            icon: Shield,
            color: "from-red-900 to-red-700",
          },
        ].map(({ label, value, icon: Icon, color }) => (
          <div
            key={label}
            className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-5 flex items-center gap-4 hover:shadow-md transition-shadow"
          >
            <div className={`p-3 rounded-xl bg-gradient-to-br ${color} shadow-sm`}>
              <Icon size={20} className="text-white" />
            </div>
            <div>
              <p className="text-xs text-zinc-500 font-medium">{label}</p>
              <p className="text-2xl font-bold text-zinc-950">{value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Search ── */}
      <div className="relative">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
        <input
          type="text"
          placeholder="Buscar por nome, email ou usuário..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full h-11 pl-10 pr-10 rounded-xl border border-zinc-200 bg-white text-sm text-zinc-900 placeholder-zinc-400 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/10 transition-all"
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700 transition-colors"
          >
            <X size={15} />
          </button>
        )}
      </div>

      {/* ── Table ── */}
      <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm overflow-hidden flex-1">
        {/* Table header */}
        <div className="grid grid-cols-[1fr_1fr_auto] items-center px-6 py-3.5 bg-zinc-50 border-b border-zinc-100">
          <span className="text-xs font-bold uppercase tracking-widest text-zinc-400">Membro</span>
          <span className="text-xs font-bold uppercase tracking-widest text-zinc-400">Credenciais</span>
          <span className="text-xs font-bold uppercase tracking-widest text-zinc-400 text-right pr-1">Ações</span>
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="flex items-center justify-center py-20 text-zinc-500 gap-3">
            <Loader2 size={22} className="animate-spin text-red-500" />
            <span className="text-sm font-medium">Carregando usuários…</span>
          </div>
        )}

        {/* Error */}
        {isError && (
          <div className="flex flex-col items-center justify-center py-20 text-zinc-500 gap-3">
            <AlertCircle size={28} className="text-red-400" />
            <p className="text-sm font-medium">Erro ao carregar usuários.</p>
            <p className="text-xs text-zinc-400">Verifique se o servidor está acessível.</p>
          </div>
        )}

        {/* Empty */}
        {!isLoading && !isError && filteredUsers.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-zinc-400 gap-4">
            <div className="w-16 h-16 rounded-2xl bg-zinc-100 flex items-center justify-center">
              <Users size={28} className="text-zinc-300" />
            </div>
            <div className="text-center">
              <p className="font-semibold text-zinc-500 text-sm">
                {search ? "Nenhum usuário encontrado" : "Nenhum usuário cadastrado"}
              </p>
              <p className="text-xs text-zinc-400 mt-1">
                {search ? `Sem resultados para "${search}"` : "Clique em \"Novo Usuário\" para começar."}
              </p>
            </div>
          </div>
        )}

        {/* Rows */}
        {!isLoading && !isError && filteredUsers.map((user, idx) => (
          <div
            key={user.id}
            className={`animate-pop-in grid grid-cols-[1fr_1fr_auto] items-center px-6 py-4 hover:bg-zinc-50/80 transition-colors group ${idx !== filteredUsers.length - 1 ? "border-b border-zinc-100" : ""}`}
            style={{ animationDelay: `${idx * 40}ms` }}
          >
            {/* Avatar + name */}
            <div className="flex items-center gap-3.5 min-w-0">
              <div
                className="w-11 h-11 rounded-full flex items-center justify-center font-bold text-white text-base flex-shrink-0 shadow-sm"
                style={{ background: `linear-gradient(135deg, hsl(${(user.name.charCodeAt(0) * 47) % 360}, 60%, 40%), hsl(${(user.name.charCodeAt(0) * 47 + 60) % 360}, 70%, 55%))` }}
              >
                {user.name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-zinc-900 text-sm truncate">{user.name}</p>
                <p className="text-xs text-zinc-500 truncate">{user.email}</p>
              </div>
            </div>

            {/* Username badge */}
            <div>
              <span className="inline-flex items-center gap-1.5 bg-zinc-100 text-zinc-600 px-3 py-1.5 rounded-lg text-xs font-mono font-medium border border-zinc-200/60">
                <UserIcon size={11} className="text-zinc-400" />
                @{user.username}
              </span>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1.5 justify-end">
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100 rounded-xl opacity-0 group-hover:opacity-100 transition-all"
                onClick={() => openEdit(user)}
                title="Editar"
              >
                <Pencil size={15} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 text-zinc-400 hover:text-red-600 hover:bg-red-50 rounded-xl opacity-0 group-hover:opacity-100 transition-all"
                onClick={() => setDeletingUser(user)}
                title="Remover"
              >
                <Trash2 size={15} />
              </Button>
            </div>
          </div>
        ))}
      </div>

      {/* ── Create / Edit Dialog ── */}
      <Dialog open={dialogOpen} onOpenChange={open => { if (!open) { setDialogOpen(false); setEditingUser(null); } }}>
        <DialogContent className="max-w-2xl rounded-3xl border border-zinc-100 shadow-2xl p-0 overflow-hidden">
          <DialogHeader className="p-7 pb-5 border-b border-zinc-100 bg-gradient-to-b from-zinc-50 to-white">
            <div className="flex items-center gap-4">
              <div
                className="p-3 rounded-2xl shadow-sm"
                style={{ background: editingUser ? "linear-gradient(135deg, #1e3a5f, #2563eb)" : "linear-gradient(135deg, #7f1d1d, #dc2626)" }}
              >
                {editingUser ? <Pencil size={22} className="text-white" /> : <Plus size={22} className="text-white" />}
              </div>
              <div>
                <DialogTitle className="text-xl font-bold text-zinc-950">
                  {editingUser ? "Editar Usuário" : "Novo Usuário"}
                </DialogTitle>
                <DialogDescription className="text-zinc-500 text-sm mt-0.5">
                  {editingUser
                    ? "Atualize as informações do membro selecionado."
                    : "Preencha os dados para liberar o acesso ao painel."}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <div className="p-7">
            <UserForm
              initialData={editingUser}
              onCancel={() => { setDialogOpen(false); setEditingUser(null); }}
              onSubmit={handleFormSubmit}
              isPending={isPendingMutation}
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirm Dialog ── */}
      <AlertDialog open={!!deletingUser} onOpenChange={open => { if (!open) setDeletingUser(null); }}>
        <AlertDialogContent className="rounded-3xl border border-zinc-100 shadow-2xl">
          <AlertDialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-11 h-11 rounded-2xl bg-red-50 flex items-center justify-center">
                <Trash2 size={20} className="text-red-500" />
              </div>
              <AlertDialogTitle className="text-xl font-bold text-zinc-950">Remover Usuário</AlertDialogTitle>
            </div>
            <AlertDialogDescription className="text-zinc-500 text-sm leading-relaxed">
              Tem certeza que deseja remover <strong className="text-zinc-800">{deletingUser?.name}</strong>?
              O acesso será revogado imediatamente. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 mt-2">
            <AlertDialogCancel className="rounded-xl h-11 font-medium text-zinc-600 hover:text-zinc-800">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingUser && deleteUserMutation.mutate(deletingUser.id)}
              className="bg-gradient-to-r from-red-700 to-red-500 hover:from-red-800 hover:to-red-600 text-white rounded-xl h-11 font-semibold px-6 shadow-sm"
            >
              {deleteUserMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : "Sim, remover"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
