/**
 * Vercel Serverless Function Entrypoint (`/api/*`)
 * Exposes Game9K's REST APIs (Xsolla SDK 3 Commerce, Gemini Decisions Governance,
 * Portal Cloud Save & Leaderboards, CORS Avatar Proxy, Manifest Discovery) on Vercel Edge/Node.
 */
import { createGame9KServer } from "../src/server.js";

const { app } = createGame9KServer();

export default app;
