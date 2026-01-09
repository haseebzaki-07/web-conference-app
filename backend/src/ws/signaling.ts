// import type { PrismaClient } from "@prisma/client";

interface SignalingMessage {
  type: "offer" | "answer" | "ice-candidate" | "join" | "leave";
  from: string; // participant ID
  to?: string; // target participant ID (for peer-to-peer)
  roomId?: string;
  data?: any;
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
}

interface WSContext {
  send: (data: string) => void;
  readyState: number;
}

// Store active connections per room
const roomConnections = new Map<string, Map<string, WSContext>>();

export async function signalingHandler(
  event: MessageEvent,
  ws: WSContext,
  roomId: string,
  prisma: any
) {
  try {
    const message: SignalingMessage = JSON.parse(event.data as string);

    // Initialize room if needed
    if (!roomConnections.has(roomId)) {
      roomConnections.set(roomId, new Map());
    }
    const connections = roomConnections.get(roomId)!;

    switch (message.type) {
      case "join":
        // Store connection with participant ID
        connections.set(message.from, ws);

        // Send list of existing participants to the new joiner
        const existingParticipants = Array.from(connections.keys()).filter(
          (id) => id !== message.from
        );
        ws.send(
          JSON.stringify({
            type: "participants",
            participants: existingParticipants,
          })
        );

        // Notify other participants about the new joiner
        connections.forEach((otherWs, participantId) => {
          if (participantId !== message.from && otherWs.readyState === 1) {
            otherWs.send(
              JSON.stringify({
                type: "participant-joined",
                from: message.from,
              })
            );
          }
        });
        break;

      case "offer":
        // Forward offer to target participant
        if (message.to) {
          const targetWs = connections.get(message.to);
          if (targetWs && targetWs.readyState === 1) {
            targetWs.send(
              JSON.stringify({
                type: "offer",
                from: message.from,
                to: message.to,
                sdp: message.sdp,
              })
            );
          }
        }
        break;

      case "answer":
        // Forward answer to target participant
        if (message.to) {
          const targetWs = connections.get(message.to);
          if (targetWs && targetWs.readyState === 1) {
            targetWs.send(
              JSON.stringify({
                type: "answer",
                from: message.from,
                to: message.to,
                sdp: message.sdp,
              })
            );
          }
        }
        break;

      case "ice-candidate":
        // Forward ICE candidate to target participant
        if (message.to) {
          const targetWs = connections.get(message.to);
          if (targetWs && targetWs.readyState === 1) {
            targetWs.send(
              JSON.stringify({
                type: "ice-candidate",
                from: message.from,
                to: message.to,
                candidate: message.candidate,
              })
            );
          }
        }
        break;

      case "leave":
        connections.delete(message.from);

        // Notify other participants
        connections.forEach((otherWs) => {
          if (otherWs.readyState === 1) {
            otherWs.send(
              JSON.stringify({
                type: "participant-left",
                from: message.from,
              })
            );
          }
        });
        break;
    }
  } catch (error) {
    console.error("Error handling signaling message:", error);
    ws.send(
      JSON.stringify({
        type: "error",
        message: "Failed to process signaling message",
      })
    );
  }
}

// Cleanup function for when WebSocket closes
export function cleanupRoomConnection(roomId: string, participantId: string) {
  const connections = roomConnections.get(roomId);
  if (connections) {
    connections.delete(participantId);

    // Notify remaining participants
    connections.forEach((otherWs) => {
      if (otherWs.readyState === 1) {
        otherWs.send(
          JSON.stringify({
            type: "participant-left",
            from: participantId,
          })
        );
      }
    });

    if (connections.size === 0) {
      roomConnections.delete(roomId);
    }
  }
}
