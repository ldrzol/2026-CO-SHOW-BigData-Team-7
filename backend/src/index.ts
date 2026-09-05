import { onRequest } from "firebase-functions/v2/https";

export const ping = onRequest((req, res) => {
  res.json({ ok: true });
});
