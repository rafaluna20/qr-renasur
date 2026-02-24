"use client";

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { z } from "zod";

const loginSchema = z.object({
  email: z.string().email("Correo electrónico inválido"),
  password: z.string().min(8, "El DNI debe tener al menos 8 caracteres"),
  role: z.enum(["admin", "user"]),
});

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [formData, setFormData] = useState({ 
    email: "", 
    password: "", 
    role: "user" as "user" | "admin" 
  });
  const [errors, setErrors] = useState<{ email?: string; password?: string; role?: string }>({});
  const [users,setUsers] = useState<any>([]);
  const [loading, setLoading] = useState(false);

  const EMAIL_ADMIN = process.env.NEXT_PUBLIC_ADMIN_EMAIL;
  const PASSWORD_ADMIN = process.env.NEXT_PUBLIC_ADMIN_PASSWORD;

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const response = await fetch('/api/users/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
        const data = await response.json();
        setUsers(data.data.result)
      } catch (error) {
        console.error("Error fetching users:", error);
      }
    };
    fetchUsers();
  }, []);

  useEffect(() => {
    const pID = searchParams.get("proyectoID");
    const tID = searchParams.get("tareaID");
    
    if (pID) localStorage.setItem("proyectoID", pID);
    if (tID) localStorage.setItem("tareaID", tID);
  }, [searchParams]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const result = loginSchema.safeParse(formData);
    if (!result.success) {
      const fieldErrors: any = {};
      result.error.issues.forEach((issue) => {
        fieldErrors[issue.path[0]] = issue.message;
      });
      setErrors(fieldErrors);
      return;
    }

    // Simulated Login
    if (formData.role === "admin") {
      if (formData.email !== EMAIL_ADMIN || formData.password !== PASSWORD_ADMIN) {
        setErrors({ email: "Credenciales de administrador incorrectas" });
        setLoading(false);
        return;
      }
      // Admin autenticado correctamente — redirigir directamente
      setLoading(true);
      localStorage.setItem("isAuthenticated", "true");
      localStorage.setItem("userEmail", formData.email);
      localStorage.setItem("userRole", "admin");
      localStorage.setItem("userID", "0");
      localStorage.setItem("userImage", "");
      localStorage.setItem("userName", "Administrador");
      setLoading(false);
      router.push("/");
      return;
    }

    // Login de usuario normal
    setLoading(true);
    const user = users.find((user: any) => user.work_email === formData.email);
    if (!user) {
      setErrors({ email: "Usuario no encontrado" });
      setLoading(false);
      return;
    }
    if (formData.password !== user.identification_id) {
      setErrors({ password: "Contraseña incorrecta" });
      setLoading(false);
      return;
    }

    localStorage.setItem("isAuthenticated", "true");
    localStorage.setItem("userEmail", formData.email);
    localStorage.setItem("userRole", formData.role);
    localStorage.setItem("userID", user.id);
    localStorage.setItem("userImage", user.image_128);
    localStorage.setItem("userName", user.name);
    setLoading(false);
    router.push("/");
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-4 font-sans dark:bg-zinc-950">
      <div className="w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl dark:bg-zinc-900 dark:ring-1 dark:ring-white/10">
        <div className="p-8">
          <div className="mb-8 text-center">
            <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
              Bienvenido
            </h1>
            <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
              Inicia sesión en QR Generator Studio
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="flex p-1 bg-zinc-100 dark:bg-zinc-800 rounded-xl">
              <button
                type="button"
                onClick={() => setFormData({ ...formData, role: "user" })}
                className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${
                  formData.role === "user" ? "bg-white text-black shadow-sm dark:bg-zinc-700 dark:text-white" : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400"
                }`}
              >
                Usuario
              </button>
              <button
                type="button"
                onClick={() => setFormData({ ...formData, role: "admin" })}
                className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${
                  formData.role === "admin" ? "bg-white text-black shadow-sm dark:bg-zinc-700 dark:text-white" : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400"
                }`}
              >
                Administrador
              </button>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Correo Electrónico
              </label>
              <input
                type="email"
                className={`flex h-11 w-full rounded-xl border bg-transparent px-4 py-2 text-sm transition-all focus:outline-none focus:ring-1 ${
                  errors.email ? "border-red-500 ring-red-500" : "border-zinc-200 focus:border-black focus:ring-black dark:border-zinc-800 dark:focus:border-white"
                }`}
                placeholder="nombre@ejemplo.com"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
              {errors.email && <p className="text-xs text-red-500">{errors.email}</p>}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Contraseña
              </label>
              <input
                type="password"
                className={`flex h-11 w-full rounded-xl border bg-transparent px-4 py-2 text-sm transition-all focus:outline-none focus:ring-1 ${
                  errors.password ? "border-red-500 ring-red-500" : "border-zinc-200 focus:border-black focus:ring-black dark:border-zinc-800 dark:focus:border-white"
                }`}
                placeholder="••••••••"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              />
              {errors.password && <p className="text-xs text-red-500">{errors.password}</p>}
            </div>

            <button
              type="submit"
              className="flex h-12 w-full items-center justify-center rounded-xl bg-black text-sm font-semibold text-white transition-all hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
              disabled={loading}
            >
              {loading ? "Cargando..." : "Iniciar Sesión"}
            </button>
          </form>

          <p className="mt-8 text-center text-sm text-zinc-500">
            ¿No tienes una cuenta?{" "}
            <Link href="/register" className="font-semibold text-black hover:underline dark:text-white">
              Regístrate aquí
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-zinc-200 border-t-black dark:border-zinc-800 dark:border-t-white" />
      </div>
    }>
      <LoginContent />
    </Suspense>
  );
}
