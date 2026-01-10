// import type { PrismaClient } from "@prisma/client";

interface SignalingMessage {
  type:
    | "offer"
    | "answer"
    | "ice-candidate"
    | "join"
    | "leave"
    | "kick"
    | "mute"
    | "audio-toggle";
  from: string; // participant ID
  to?: string; // target participant ID (for peer-to-peer)
  roomId?: string;
  data?: any;
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
  muted?: boolean; // for mute message
  audioEnabled?: boolean; // for audio-toggle message
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
    console.log(
      `[Signaling] Room ${roomId}: Received ${message.type} from ${
        message.from
      }${message.to ? ` to ${message.to}` : ""}`
    );

    // Initialize room if needed
    if (!roomConnections.has(roomId)) {
      roomConnections.set(roomId, new Map());
    }
    const connections = roomConnections.get(roomId)!;

    switch (message.type) {
      case "join":
        // Store connection with participant ID
        connections.set(message.from, ws);
        console.log(
          `[Join] ${message.from} joined room ${roomId}. Total participants: ${connections.size}`
        );

        // Send list of existing participants to the new joiner
        const existingParticipants = Array.from(connections.keys()).filter(
          (id) => id !== message.from
        );
        console.log(
          `[Join] Sending ${existingParticipants.length} existing participants to ${message.from}:`,
          existingParticipants
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
            console.log(
              `[Join] Notifying ${participantId} about ${message.from}`
            );
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
            console.log(
              `[Offer] Forwarding offer from ${message.from} to ${message.to}`
            );
            targetWs.send(
              JSON.stringify({
                type: "offer",
                from: message.from,
                to: message.to,
                sdp: message.sdp,
              })
            );
          } else {
            console.log(`[Offer] Target ${message.to} not found or not ready`);
          }
        }
        break;

      case "answer":
        // Forward answer to target participant
        if (message.to) {
          const targetWs = connections.get(message.to);
          if (targetWs && targetWs.readyState === 1) {
            console.log(
              `[Answer] Forwarding answer from ${message.from} to ${message.to}`
            );
            targetWs.send(
              JSON.stringify({
                type: "answer",
                from: message.from,
                to: message.to,
                sdp: message.sdp,
              })
            );
          } else {
            console.log(`[Answer] Target ${message.to} not found or not ready`);
          }
        }
        break;

      case "ice-candidate":
        // Forward ICE candidate to target participant
        if (message.to) {
          const targetWs = connections.get(message.to);
          if (targetWs && targetWs.readyState === 1) {
            console.log(
              `[ICE] Forwarding ICE candidate from ${message.from} to ${message.to}`
            );
            targetWs.send(
              JSON.stringify({
                type: "ice-candidate",
                from: message.from,
                to: message.to,
                candidate: message.candidate,
              })
            );
          } else {
            console.log(
              `[ICE] Target ${message.to} not found or not ready. Available:`,
              Array.from(connections.keys())
            );
          }
        } else {
          console.log(
            `[ICE] No target specified for ICE candidate from ${message.from}`
          );
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

      case "kick":
        // Host kicks a participant
        if (message.to) {
          const targetWs = connections.get(message.to);
          if (targetWs && targetWs.readyState === 1) {
            console.log(
              `[Kick] ${message.from} is kicking ${message.to} from room ${roomId}`
            );
            // Notify the kicked participant
            targetWs.send(
              JSON.stringify({
                type: "kicked",
                from: message.from,
              })
            );
            // Remove the connection
            connections.delete(message.to);

            // Notify other participants
            connections.forEach((otherWs, participantId) => {
              if (participantId !== message.to && otherWs.readyState === 1) {
                otherWs.send(
                  JSON.stringify({
                    type: "participant-left",
                    from: message.to,
                  })
                );
              }
            });
          }
        }
        break;

      case "mute":
        // Host mutes/unmutes a participant
        if (message.to) {
          const targetWs = connections.get(message.to);
          if (targetWs && targetWs.readyState === 1) {
            console.log(
              `[Mute] ${message.from} is ${
                message.muted ? "muting" : "unmuting"
              } ${message.to}`
            );
            targetWs.send(
              JSON.stringify({
                type: "mute",
                from: message.from,
                muted: message.muted,
              })
            );
          }
        }
        break;

      case "audio-toggle":
        // Broadcast audio toggle state to all other participants
        console.log(
          `[Audio Toggle] ${message.from} audio is now ${
            message.audioEnabled ? "enabled" : "disabled"
          }`
        );
        connections.forEach((otherWs, participantId) => {
          if (participantId !== message.from && otherWs.readyState === 1) {
            otherWs.send(
              JSON.stringify({
                type: "audio-toggle",
                from: message.from,
                audioEnabled: message.audioEnabled,
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
