import { createServerFn } from "@tanstack/react-start";

// Password-protected .xlsx/.xls use MS Office encryption that the browser can't
// open (the decryptor needs Node's Buffer/crypto). This server function runs in
// Node (Vercel), decrypts the uploaded bytes, and returns the plain workbook so
// the client can parse it. Bytes travel as base64.
export const decryptSpreadsheet = createServerFn({ method: "POST" })
  .validator((input: { base64: string; password: string }) => input)
  .handler(
    async ({
      data,
    }): Promise<{ ok: boolean; base64?: string; error?: string }> => {
      try {
        const buf = Buffer.from(data.base64, "base64");
        const oc = (await import("officecrypto-tool")) as {
          isEncrypted: (b: Buffer) => boolean;
          decrypt: (b: Buffer, o: { password: string }) => Promise<Buffer>;
        };
        if (!oc.isEncrypted(buf)) return { ok: true, base64: data.base64 };
        const out = await oc.decrypt(buf, { password: data.password });
        return { ok: true, base64: Buffer.from(out).toString("base64") };
      } catch (e) {
        const msg = String(e);
        if (/password|invalid|key/i.test(msg)) return { ok: false, error: "wrong_password" };
        return { ok: false, error: "decrypt_failed" };
      }
    },
  );
