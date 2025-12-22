"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { z } from "zod";

const registerSchema = z.object({
  name: z.string().min(2, "El nombre debe tener al menos 2 caracteres"),
  email: z.string().email("Correo electrónico inválido"),
  password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres"),
  confirmPassword: z.string().min(6, "Debe confirmar su contraseña"),
  role: z.enum(["admin", "user"]),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Las contraseñas no coinciden",
  path: ["confirmPassword"],
});

export default function RegisterPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({ 
    name: "", 
    email: "", 
    password: "", 
    confirmPassword: "", 
    role: "user" as "user" | "admin" 
  });
  const [errors, setErrors] = useState<any>({});

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const result = registerSchema.safeParse(formData);
    if (!result.success) {
      const fieldErrors: any = {};
      result.error.issues.forEach((issue) => {
        fieldErrors[issue.path[0]] = issue.message;
      });
      setErrors(fieldErrors);
      return;
    }

    // Simulated Registration
    if (formData.role === "admin" && formData.email !== process.env.NEXT_PUBLIC_ADMIN_EMAIL) {
      setErrors({ email: "Solo el correo autorizado puede registrarse como administrador" });
      return;
    }

    localStorage.setItem("isAuthenticated", "true");
    localStorage.setItem("userName", formData.name);
    localStorage.setItem("userEmail", formData.email);
    localStorage.setItem("userRole", formData.role);
    router.push("/");
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-4 font-sans dark:bg-zinc-950">
      <div className="w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl dark:bg-zinc-900 dark:ring-1 dark:ring-white/10">
        <div className="p-8">
          <div className="mb-8 text-center">
            <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
              Crear Cuenta
            </h1>
            <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
              Únete a QR Generator Studio
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
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
                Nombre Completo
              </label>
              <input
                type="text"
                className={`flex h-11 w-full rounded-xl border bg-transparent px-4 py-2 text-sm transition-all focus:outline-none focus:ring-1 ${
                  errors.name ? "border-red-500 ring-red-500" : "border-zinc-200 focus:border-black focus:ring-black dark:border-zinc-800 dark:focus:border-white"
                }`}
                placeholder="Juan Pérez"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
              {errors.name && <p className="text-xs text-red-500">{errors.name}</p>}
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

            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Confirmar Contraseña
              </label>
              <input
                type="password"
                className={`flex h-11 w-full rounded-xl border bg-transparent px-4 py-2 text-sm transition-all focus:outline-none focus:ring-1 ${
                  errors.confirmPassword ? "border-red-500 ring-red-500" : "border-zinc-200 focus:border-black focus:ring-black dark:border-zinc-800 dark:focus:border-white"
                }`}
                placeholder="••••••••"
                value={formData.confirmPassword}
                onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
              />
              {errors.confirmPassword && <p className="text-xs text-red-500">{errors.confirmPassword}</p>}
            </div>

            <button
              type="submit"
              className="mt-4 flex h-12 w-full items-center justify-center rounded-xl bg-black text-sm font-semibold text-white transition-all hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
            >
              Registrarse
            </button>
          </form>

          <p className="mt-8 text-center text-sm text-zinc-500">
            ¿Ya tienes una cuenta?{" "}
            <Link href="/login" className="font-semibold text-black hover:underline dark:text-white">
              Inicia sesión aquí
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
