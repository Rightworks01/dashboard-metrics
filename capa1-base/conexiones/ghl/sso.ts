import "server-only";
import { createDecipheriv, createHash } from "node:crypto";
import { z } from "zod";

// SSO de GHL (app privada de Marketplace): dentro de una página de la app, GHL entrega al iframe los datos del
// usuario cifrados con la "SSO key" de la app (AES-256-CBC en formato OpenSSL/CryptoJS: "Salted__" + sal + datos,
// clave e IV derivados con EVP_BytesToKey/MD5). Solo quien tiene la clave (el servidor, GHL_SSO_KEY) puede
// descifrarlos, así que el usuario no se puede falsificar desde el navegador.

const userSchema = z.object({
  userId: z.string().min(1),
  companyId: z.string().optional(),
  role: z.string(),                 // "admin" | "user"
  type: z.string().optional(),      // "agency" | "account"
  activeLocation: z.string().optional(),
  userName: z.string().optional(),
  email: z.email(),
});
export type GhlSsoUser = z.infer<typeof userSchema>;

function evpBytesToKey(password: Buffer, salt: Buffer, keyLen: number, ivLen: number) {
  let derived = Buffer.alloc(0);
  let block = Buffer.alloc(0);
  while (derived.length < keyLen + ivLen) {
    block = createHash("md5").update(Buffer.concat([block, password, salt])).digest();
    derived = Buffer.concat([derived, block]);
  }
  return { key: derived.subarray(0, keyLen), iv: derived.subarray(keyLen, keyLen + ivLen) };
}

/** Descifra y valida el payload de SSO. Lanza si la clave no coincide o el contenido no es un usuario de GHL. */
export function decryptGhlSso(payload: string, ssoKey: string): GhlSsoUser {
  const raw = Buffer.from(payload, "base64");
  if (raw.length < 32 || raw.subarray(0, 8).toString("latin1") !== "Salted__") throw new Error("payload de SSO no válido");
  const { key, iv } = evpBytesToKey(Buffer.from(ssoKey, "utf8"), raw.subarray(8, 16), 32, 16);
  const decipher = createDecipheriv("aes-256-cbc", key, iv);
  const json = Buffer.concat([decipher.update(raw.subarray(16)), decipher.final()]).toString("utf8");
  return userSchema.parse(JSON.parse(json));
}
