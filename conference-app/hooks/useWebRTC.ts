import { useEffect, useRef, useCallback, useState } from "react";
import { useWebSocket } from "./useWebSocket";

interface Participant {
  id: string;
  stream?: MediaStream;
  peerConnection?: RTCPeerConnection;
}

interface UseWebRTCProps {
  roomId: string;
  participantId: string;
  localStream: MediaStream | null;
  enabled?: boolean;
}

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

export function useWebRTC({
  roomId,
  participantId,
  localStream,
  enabled = true,
}: UseWebRTCProps) {
  const [participants, setParticipants] = useState<Map<string, Participant>>(
    new Map()
  );
  const participantsRef = useRef<Map<string, Participant>>(new Map());
  const [error, setError] = useState<string | null>(null);

  // Keep ref in sync with state
  useEffect(() => {
    participantsRef.current = participants;
  }, [participants]);

  const createPeerConnection = useCallback(
    (peerId: string): RTCPeerConnection => {
      const pc = new RTCPeerConnection(ICE_SERVERS);

      // Add local tracks to peer connection
      if (localStream) {
        localStream.getTracks().forEach((track) => {
          pc.addTrack(track, localStream);
        });
      }

      // Handle incoming tracks
      pc.ontrack = (event) => {
        console.log("Received remote track from", peerId);
        const [remoteStream] = event.streams;

        setParticipants((prev) => {
          const newMap = new Map(prev);
          const participant = newMap.get(peerId) || { id: peerId };
          participant.stream = remoteStream;
          newMap.set(peerId, participant);
          return newMap;
        });
      };

      // Handle ICE candidates
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          sendMessage({
            type: "ice-candidate",
            from: participantId,
            to: peerId,
            candidate: event.candidate.toJSON(),
          });
        }
      };

      pc.onconnectionstatechange = () => {
        console.log(`Connection state with ${peerId}:`, pc.connectionState);
        if (
          pc.connectionState === "failed" ||
          pc.connectionState === "disconnected"
        ) {
          // Handle reconnection or cleanup
          console.log(`Connection to ${peerId} ${pc.connectionState}`);
        }
      };

      return pc;
    },
    [localStream, participantId]
  );

  const handleSignalingMessage = useCallback(
    async (message: any) => {
      try {
        switch (message.type) {
          case "participants":
            // Existing participants in the room
            console.log("Existing participants:", message.participants);
            message.participants.forEach((peerId: string) => {
              if (!participantsRef.current.has(peerId)) {
                // Create peer connection and send offer
                const pc = createPeerConnection(peerId);

                setParticipants((prev) => {
                  const newMap = new Map(prev);
                  newMap.set(peerId, { id: peerId, peerConnection: pc });
                  return newMap;
                });

                // Create and send offer
                pc.createOffer()
                  .then((offer) => pc.setLocalDescription(offer))
                  .then(() => {
                    sendMessage({
                      type: "offer",
                      from: participantId,
                      to: peerId,
                      sdp: pc.localDescription!,
                    });
                  })
                  .catch((err) => console.error("Error creating offer:", err));
              }
            });
            break;

          case "participant-joined":
            // New participant joined - they will send us an offer
            console.log("Participant joined:", message.from);
            const pc = createPeerConnection(message.from);
            setParticipants((prev) => {
              const newMap = new Map(prev);
              newMap.set(message.from, {
                id: message.from,
                peerConnection: pc,
              });
              return newMap;
            });
            break;

          case "offer":
            console.log("Received offer from", message.from);
            let peerConnection = participantsRef.current.get(
              message.from
            )?.peerConnection;

            if (!peerConnection) {
              peerConnection = createPeerConnection(message.from);
              setParticipants((prev) => {
                const newMap = new Map(prev);
                newMap.set(message.from, { id: message.from, peerConnection });
                return newMap;
              });
            }

            await peerConnection.setRemoteDescription(
              new RTCSessionDescription(message.sdp)
            );
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);

            sendMessage({
              type: "answer",
              from: participantId,
              to: message.from,
              sdp: peerConnection.localDescription!,
            });
            break;

          case "answer":
            console.log("Received answer from", message.from);
            const answerPc = participantsRef.current.get(
              message.from
            )?.peerConnection;
            if (answerPc) {
              await answerPc.setRemoteDescription(
                new RTCSessionDescription(message.sdp)
              );
            }
            break;

          case "ice-candidate":
            console.log("Received ICE candidate from", message.from);
            const candidatePc = participantsRef.current.get(
              message.from
            )?.peerConnection;
            if (candidatePc && message.candidate) {
              await candidatePc.addIceCandidate(
                new RTCIceCandidate(message.candidate)
              );
            }
            break;

          case "participant-left":
            console.log("Participant left:", message.from);
            const leftParticipant = participantsRef.current.get(message.from);
            if (leftParticipant?.peerConnection) {
              leftParticipant.peerConnection.close();
            }
            setParticipants((prev) => {
              const newMap = new Map(prev);
              newMap.delete(message.from);
              return newMap;
            });
            break;

          case "error":
            console.error("Signaling error:", message.message);
            setError(message.message);
            break;
        }
      } catch (err) {
        console.error("Error handling signaling message:", err);
        setError(
          err instanceof Error
            ? err.message
            : "Failed to handle signaling message"
        );
      }
    },
    [createPeerConnection, participantId]
  );

  const { sendMessage, isConnected, disconnect } = useWebSocket({
    roomId,
    participantId,
    onMessage: handleSignalingMessage,
    enabled,
  });

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      participants.forEach((participant) => {
        if (participant.peerConnection) {
          participant.peerConnection.close();
        }
      });
    };
  }, []);

  // Update peer connections when local stream changes
  useEffect(() => {
    if (!localStream) return;

    participants.forEach((participant) => {
      const pc = participant.peerConnection;
      if (!pc) return;

      // Remove old tracks
      pc.getSenders().forEach((sender) => {
        pc.removeTrack(sender);
      });

      // Add new tracks
      localStream.getTracks().forEach((track) => {
        pc.addTrack(track, localStream);
      });
    });
  }, [localStream, participants]);

  return {
    participants: Array.from(participants.values()),
    isConnected,
    error,
    disconnect,
  };
}
