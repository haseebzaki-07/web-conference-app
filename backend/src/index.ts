import "dotenv/config";
import { Hono } from "hono";
import { WebSocketServer, WebSocket } from "ws";
import { createServer } from "http";
import { prisma } from "./lib/prisma";
import { signalingHandler, cleanupRoomConnection } from "./ws/signaling";
import { cors } from "hono/cors";

const app = new Hono();

app.use(
  "*",
  cors({
    origin: process.env.CORS_ORIGIN || "http://localhost:3000",
    credentials: true,
  })
);

// Store participant IDs per WebSocket connection
const wsToParticipant = new WeakMap<
  WebSocket,
  { roomId: string; participantId: string }
>();

// REST routes
app.post("/api/rooms/validate", async (c) => {
  const { roomId } = await c.req.json();

  const room = await prisma.room.findUnique({
    where: { roomId },
    include: { host: true },
  });

  if (!room || !room.isActive) {
    return c.json({ valid: false }, 404);
  }

  return c.json({ valid: true, room });
});

// Health check
app.get("/health", (c) => c.json({ status: "ok" }));

const port = Number(process.env.PORT || 3001);

// Create HTTP server with Hono handler
const server = createServer(async (req, res) => {
  // Skip WebSocket upgrade requests - handled separately
  if (req.url?.startsWith("/ws/")) {
    return;
  }

  // Handle regular HTTP requests with Hono
  const url = `http://${req.headers.host}${req.url}`;

  // Read request body if present
  let body: string | undefined;
  if (req.method !== "GET" && req.method !== "HEAD") {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    body = Buffer.concat(chunks).toString();
  }

  const request = new Request(url, {
    method: req.method,
    headers: req.headers as HeadersInit,
    body,
  });

  const response = await app.fetch(request);
  const responseBody = await response.text();

  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    headers[key] = value;
  });

  res.writeHead(response.status, headers);
  res.end(responseBody);
});

// Setup WebSocket server (noServer: true to handle upgrades manually)
const wss = new WebSocketServer({ noServer: true });

// Handle WebSocket upgrade manually to filter by path
server.on("upgrade", (request, socket, head) => {
  if (!request.url?.startsWith("/ws/")) {
    socket.destroy();
    return;
  }

  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit("connection", ws, request);
  });
});

wss.on("connection", (ws, req) => {
  const url = new URL(req.url || "", `http://${req.headers.host}`);
  const roomIdMatch = url.pathname.match(/\/ws\/([^/]+)/);
  const roomId = roomIdMatch ? roomIdMatch[1] : null;

  if (!roomId) {
    ws.close(1008, "Room ID required");
    return;
  }

  let participantId: string | null = null;

  ws.on("message", async (data) => {
    try {
      const message = JSON.parse(data.toString());

      // Extract participant ID from first message
      if (message.from && !participantId) {
        participantId = message.from;
        wsToParticipant.set(ws, { roomId, participantId });
      }

      // Create MessageEvent-like object for signaling handler
      const evt = {
        data: data.toString(),
      } as MessageEvent;

      await signalingHandler(
        evt,
        {
          send: (data: string) => ws.send(data),
          readyState: ws.readyState,
        } as any,
        roomId,
        prisma
      );
    } catch (error) {
      console.error("Error handling WebSocket message:", error);
      ws.send(
        JSON.stringify({
          type: "error",
          message: "Failed to process message",
        })
      );
    }
  });

  ws.on("close", () => {
    console.log(`WebSocket closed for room: ${roomId}`);
    const info = wsToParticipant.get(ws);
    if (info) {
      cleanupRoomConnection(info.roomId, info.participantId);
    }
  });

  ws.on("error", (error) => {
    console.error(`WebSocket error in room ${roomId}:`, error);
  });

  console.log(`WebSocket opened for room: ${roomId}`);
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Server running on port ${port}`);
});
