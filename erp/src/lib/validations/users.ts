import { z } from "zod";

export const userSchema = z
  .object({
    id: z.string().nullable(),
    name: z.string().trim().min(2, "Ingresá el nombre").max(120),
    email: z.string().trim().toLowerCase().email("Email inválido"),
    roleId: z.string().min(1, "Elegí el rol"),
    active: z.boolean(),
    /** Vacío al editar = no cambia la contraseña */
    password: z.string().max(200),
  })
  .superRefine((v, ctx) => {
    if ((!v.id || v.password) && v.password.length < 10) {
      ctx.addIssue({ code: "custom", path: ["password"], message: "La contraseña debe tener al menos 10 caracteres" });
    }
  });

export type UserInput = z.infer<typeof userSchema>;
