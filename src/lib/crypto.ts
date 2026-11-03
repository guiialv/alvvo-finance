/** Criptografia AES-GCM da chave de IA do usuário. Segredo em AI_KEY_SECRET (só no servidor). */
const enc = new TextEncoder(), dec = new TextDecoder();
const b64 = (b: ArrayBuffer | Uint8Array) => Buffer.from(b instanceof Uint8Array ? b : new Uint8Array(b)).toString("base64");
const unb64 = (s: string) => new Uint8Array(Buffer.from(s, "base64"));

async function key() {
  const secret = process.env.AI_KEY_SECRET;
  if (!secret || secret.length < 16) throw new Error("AI_KEY_SECRET não configurado.");
  const raw = await crypto.subtle.digest("SHA-256", enc.encode(secret));
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}
export async function encryptSecret(plain: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await key(), enc.encode(plain));
  return `${b64(iv)}.${b64(ct)}`;
}
export async function decryptSecret(blob: string): Promise<string> {
  const [iv, ct] = blob.split(".");
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv) }, await key(), unb64(ct));
  return dec.decode(pt);
}
