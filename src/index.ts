import { Hono } from "hono";

const app = new Hono();

app.get("/health", (c) => c.json({ status: "ok", stage: "etapa-0" }));

// Etapa 1: router de canales (Telegram) + resolución de tenant aquí.

export default app;
