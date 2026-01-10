import { useEffect, useRef, useCallback, useState } from "react";
import { useWebSocket } from "./useWebSocket";

interface Participant {
  id: string;
  stream?: MediaStream;
  peerConnection?: RTCPeerConnection;
  pendingCandidates?: RTCIceCandidateInit[];
  isMuted?: boolean;
  audioEnabled?: boolean;
}

interface UseWebRTCProps {
  roomId: string;
  participantId: string;
  localStream: MediaStream | null;
  enabled?: boolean;
  onParticipantLeft?: (participantId: string) => void;
  onParticipantJoined?: (participantId: string) => void;
  onKicked?: () => void;
  onMuted?: (muted: boolean) => void;
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
  onParticipantLeft,
  onParticipantJoined,
  onKicked,
  onMuted,
}: UseWebRTCProps) {
  const [participants, setParticipants] = useState<Map<string, Participant>>(
    new Map()
  );
  const participantsRef = useRef<Map<string, Participant>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const sendMessageRef = useRef<((msg: any) => void) | null>(null);

  // Keep ref in sync with state
  useEffect(() => {
    participantsRef.current = participants;
  }, [participants]);

  const createPeerConnection = useCallback(
    (peerId: string): RTCPeerConnection => {
      const pc = new RTCPeerConnection(ICE_SERVERS);
      console.log(
        `Creating peer connection for ${peerId}, localStream available:`,
        !!localStream
      );

      // Add local tracks to peer connection
      if (localStream) {
        localStream.getTracks().forEach((track) => {
          console.log(
            `Adding ${track.kind} track (${track.id}) to peer connection for ${peerId}`
          );
          pc.addTrack(track, localStream);
        });
      } else {
        console.warn(
          `⚠️ No local stream available when creating PC for ${peerId} - ICE candidates may not be generated!`
        );
      }

      // Handle incoming tracks
      pc.ontrack = (event) => {
        console.log(
          `[Track] Received ${event.track.kind} track from ${peerId}`,
          {
            trackId: event.track.id,
            trackState: event.track.readyState,
            trackEnabled: event.track.enabled,
            streams: event.streams.length,
          }
        );
        const [remoteStream] = event.streams;

        setParticipants((prev) => {
          const newMap = new Map(prev);
          const participant = newMap.get(peerId) || { id: peerId };
          participant.stream = remoteStream;
          newMap.set(peerId, participant);
          console.log(`[Track] Updated participant ${peerId} with stream`, {
            audioTracks: remoteStream.getAudioTracks().length,
            videoTracks: remoteStream.getVideoTracks().length,
          });
          return newMap;
        });
      };

      // Handle ICE candidates
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          console.log(
            `[ICE] Generated candidate for ${peerId}:`,
            event.candidate.candidate
          );
          if (sendMessageRef.current) {
            sendMessageRef.current({
              type: "ice-candidate",
              from: participantId,
              to: peerId,
              candidate: event.candidate.toJSON(),
            });
          } else {
            console.error(
              "[ICE] ❌ sendMessage not available yet! Retrying in 100ms..."
            );
            // Retry after a short delay
            setTimeout(() => {
              if (sendMessageRef.current) {
                sendMessageRef.current({
                  type: "ice-candidate",
                  from: participantId,
                  to: peerId,
                  candidate: event.candidate!.toJSON(),
                });
              } else {
                console.error(
                  "[ICE] ❌ sendMessage still not available, candidate lost"
                );
              }
            }, 100);
          }
        } else {
          console.log(
            `[ICE] ✅ All candidates sent for ${peerId} (null candidate received)`
          );
        }
      };

      pc.onicegatheringstatechange = () => {
        console.log(
          `[ICE] Gathering state for ${peerId}:`,
          pc.iceGatheringState
        );
      };

      pc.oniceconnectionstatechange = () => {
        console.log(
          `[ICE] Connection state for ${peerId}:`,
          pc.iceConnectionState
        );
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

  // Helper function to process queued ICE candidates
  const processQueuedCandidates = useCallback(
    async (peerId: string, pc: RTCPeerConnection) => {
      const participant = participantsRef.current.get(peerId);
      if (participant?.pendingCandidates) {
        console.log(
          `Processing ${participant.pendingCandidates.length} queued candidates for ${peerId}`
        );
        for (const candidate of participant.pendingCandidates) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
          } catch (err) {
            console.error("Error adding queued candidate:", err);
          }
        }
        // Clear the queue
        setParticipants((prev) => {
          const newMap = new Map(prev);
          const p = newMap.get(peerId);
          if (p) {
            p.pendingCandidates = [];
            newMap.set(peerId, p);
          }
          return newMap;
        });
      }
    },
    []
  );

  const handleSignalingMessage = useCallback(
    async (message: any) => {
      try {
        switch (message.type) {
          case "participants":
            // Existing participants in the room
            console.log("Existing participants:", message.participants);
            console.log(
              "[useWebRTC] sendMessageRef available:",
              !!sendMessageRef.current
            );
            message.participants.forEach((peerId: string) => {
              if (!participantsRef.current.has(peerId)) {
                // Create peer connection and send offer
                console.log(
                  `[useWebRTC] Creating PC for existing participant: ${peerId}`
                );
                const pc = createPeerConnection(peerId);

                setParticipants((prev) => {
                  const newMap = new Map(prev);
                  newMap.set(peerId, { id: peerId, peerConnection: pc });
                  return newMap;
                });

                // Create and send offer
                pc.createOffer()
                  .then((offer) => {
                    console.log(
                      `[useWebRTC] Created offer for ${peerId}, setting local description`
                    );
                    return pc.setLocalDescription(offer);
                  })
                  .then(() => {
                    console.log(
                      `[useWebRTC] Local description set for ${peerId}, sending offer`
                    );
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
            console.log(
              "[useWebRTC] sendMessageRef available:",
              !!sendMessageRef.current
            );
            const pc = createPeerConnection(message.from);
            setParticipants((prev) => {
              const newMap = new Map(prev);
              newMap.set(message.from, {
                id: message.from, //peerId
                peerConnection: pc,
              });
              return newMap;
            });
            // Notify parent component
            if (onParticipantJoined) {
              onParticipantJoined(message.from);
            }
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

            // Process any queued ICE candidates
            await processQueuedCandidates(message.from, peerConnection);

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
              // Process any queued ICE candidates
              await processQueuedCandidates(message.from, answerPc);
            }
            break;

          case "ice-candidate":
            console.log("Received ICE candidate from", message.from);
            const participant = participantsRef.current.get(message.from);
            const candidatePc = participant?.peerConnection;

            if (candidatePc && message.candidate) {
              // Check if remote description is set
              if (!candidatePc.remoteDescription) {
                console.log(
                  "Queuing ICE candidate - no remote description yet"
                );
                // Queue the candidate
                setParticipants((prev) => {
                  const newMap = new Map(prev);
                  const p = newMap.get(message.from);
                  if (p) {
                    p.pendingCandidates = p.pendingCandidates || [];
                    p.pendingCandidates.push(message.candidate);
                    newMap.set(message.from, p);
                  }
                  return newMap;
                });
              } else {
                console.log("Adding ICE candidate immediately");
                try {
                  await candidatePc.addIceCandidate(
                    new RTCIceCandidate(message.candidate)
                  );
                  console.log("ICE candidate added successfully");
                } catch (err) {
                  console.error("Error adding ICE candidate:", err);
                }
              }
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
            // Notify parent component
            if (onParticipantLeft) {
              onParticipantLeft(message.from);
            }
            break;

          case "kicked":
            console.log("You have been kicked from the room");
            // Notify parent component
            if (onKicked) {
              onKicked();
            }
            break;

          case "mute":
            console.log("Host has", message.muted ? "muted" : "unmuted", "you");
            // Notify parent component to handle the actual muting
            if (onMuted) {
              onMuted(message.muted ?? true);
            }
            break;

          case "audio-toggle":
            console.log(
              `Participant ${message.from} audio is now ${
                message.audioEnabled ? "enabled" : "disabled"
              }`
            );
            // Update participant's audio state
            setParticipants((prev) => {
              const newMap = new Map(prev);
              const participant = newMap.get(message.from);
              if (participant) {
                participant.audioEnabled = message.audioEnabled;
                newMap.set(message.from, participant);
              }
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
    [
      createPeerConnection,
      participantId,
      processQueuedCandidates,
      onParticipantLeft,
      onParticipantJoined,
      onKicked,
      onMuted,
    ]
  );

  const { sendMessage, isConnected, disconnect } = useWebSocket({
    roomId,
    participantId,
    onMessage: handleSignalingMessage,
    enabled,
  });

  const kickParticipant = useCallback(
    (targetParticipantId: string) => {
      if (sendMessage) {
        sendMessage({
          type: "kick",
          from: participantId,
          to: targetParticipantId,
        });
        // Optimistically remove the participant
        const participant = participantsRef.current.get(targetParticipantId);
        if (participant?.peerConnection) {
          participant.peerConnection.close();
        }
        setParticipants((prev) => {
          const newMap = new Map(prev);
          newMap.delete(targetParticipantId);
          return newMap;
        });
      }
    },
    [sendMessage, participantId]
  );

  const muteParticipant = useCallback(
    (targetParticipantId: string, muted: boolean) => {
      if (sendMessage) {
        sendMessage({
          type: "mute",
          from: participantId,
          to: targetParticipantId,
          muted,
        });
        // Update local state to reflect the mute status
        setParticipants((prev) => {
          const newMap = new Map(prev);
          const participant = newMap.get(targetParticipantId);
          if (participant) {
            participant.isMuted = muted;
            newMap.set(targetParticipantId, participant);
          }
          return newMap;
        });
      }
    },
    [sendMessage, participantId]
  );

  const broadcastAudioToggle = useCallback(
    (audioEnabled: boolean) => {
      if (sendMessage) {
        sendMessage({
          type: "audio-toggle",
          from: participantId,
          audioEnabled,
        });
      }
    },
    [sendMessage, participantId]
  );

  // Update sendMessage ref when it changes
  useEffect(() => {
    sendMessageRef.current = sendMessage;
    console.log(
      "[useWebRTC] sendMessage ref updated, available:",
      !!sendMessage
    );
  }, [sendMessage]);

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
    kickParticipant,
    muteParticipant,
    broadcastAudioToggle,
  };
}
