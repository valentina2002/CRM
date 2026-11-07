"use server";

import { AuthError } from "next-auth";
import { loginSchema, signIn } from "@/auth";

export type LoginState = { error?: string; email?: string } | undefined;

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "");
  const parsed = loginSchema.safeParse({ email, password: formData.get("password") });
  if (!parsed.success) return { error: "Escribe un correo válido y tu contraseña.", email };

  try {
    await signIn("credentials", { ...parsed.data, redirectTo: "/tablero" });
  } catch (error) {
    // signIn throws a redirect on success; only Auth.js errors mean bad credentials.
    if (error instanceof AuthError) return { error: "Correo o contraseña incorrectos.", email };
    throw error;
  }
  return undefined;
}
