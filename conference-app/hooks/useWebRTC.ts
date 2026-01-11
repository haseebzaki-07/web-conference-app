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
  // Store the original audio track for replaceTrack when unmuting
  const originalAudioTrackRef = useRef<MediaStreamTrack | null>(null);

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
            `Adding ${track.kind} track (${track.id}) to peer connection for ${peerId}, enabled=${track.enabled}`
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
          `[Track] ✅ ontrack fired! Received ${event.track.kind} track from ${peerId}`,
          {
            trackId: event.track.id,
            trackState: event.track.readyState,
            trackEnabled: event.track.enabled,
            trackMuted: event.track.muted,
            streams: event.streams.length,
            streamId: event.streams[0]?.id,
          }
        );

        const [remoteStream] = event.streams;

        if (!remoteStream) {
          console.error(`[Track] ❌ No stream in ontrack event for ${peerId}!`);
          return;
        }

        // Log all tracks in the stream
        console.log(`[Track] Stream ${remoteStream.id} details:`, {
          audioTracks: remoteStream.getAudioTracks().map((t) => ({
            id: t.id,
            enabled: t.enabled,
            muted: t.muted,
            readyState: t.readyState,
          })),
          videoTracks: remoteStream.getVideoTracks().map((t) => ({
            id: t.id,
            enabled: t.enabled,
            muted: t.muted,
            readyState: t.readyState,
          })),
        });

        // Listen for track state changes
        event.track.onended = () => {
          console.log(`[Track] Track ${event.track.kind} from ${peerId} ended`);
        };
        event.track.onmute = () => {
          console.log(`[Track] Track ${event.track.kind} from ${peerId} muted`);
        };
        event.track.onunmute = () => {
          console.log(
            `[Track] Track ${event.track.kind} from ${peerId} unmuted`
          );
        };

        setParticipants((prev) => {
          const newMap = new Map(prev);
          const participant = newMap.get(peerId) || { id: peerId };
          participant.stream = remoteStream;
          newMap.set(peerId, participant);
          console.log(
            `[Track] ✅ Updated participant ${peerId} with stream in state`
          );
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
        console.log(`[Connection] State with ${peerId}: ${pc.connectionState}`);
        if (
          pc.connectionState === "failed" ||
          pc.connectionState === "disconnected"
        ) {
          // Handle reconnection or cleanup
          console.log(`Connection to ${peerId} ${pc.connectionState}`);
        }
        if (pc.connectionState === "connected") {
          console.log(`[Connection] ✅ Fully connected to ${peerId}!`);
        }
      };

      pc.onsignalingstatechange = () => {
        console.log(`[Signaling] State with ${peerId}: ${pc.signalingState}`);
      };

      pc.onnegotiationneeded = () => {
        console.log(`[Negotiation] Negotiation needed for ${peerId}`);
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
                    console.log(
                      `[useWebRTC] sendMessageRef available: ${!!sendMessageRef.current}`
                    );
                    if (sendMessageRef.current) {
                      sendMessageRef.current({
                        type: "offer",
                        from: participantId,
                        to: peerId,
                        sdp: pc.localDescription!,
                      });
                    } else {
                      console.error(
                        "[useWebRTC] ❌ Cannot send offer - sendMessageRef is null!"
                      );
                    }
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
            console.log(`[Offer] Received offer from ${message.from}`);
            console.log(
              `[Offer] SDP type: ${message.sdp?.type}, has sdp: ${!!message.sdp
                ?.sdp}`
            );
            let peerConnection = participantsRef.current.get(
              message.from
            )?.peerConnection;

            if (!peerConnection) {
              console.log(
                `[Offer] Creating new peer connection for ${message.from}`
              );
              peerConnection = createPeerConnection(message.from);
              setParticipants((prev) => {
                const newMap = new Map(prev);
                newMap.set(message.from, { id: message.from, peerConnection });
                return newMap;
              });
            } else {
              console.log(
                `[Offer] Reusing existing peer connection for ${message.from}`
              );
            }

            console.log(
              `[Offer] Setting remote description for ${message.from}`
            );
            await peerConnection.setRemoteDescription(
              new RTCSessionDescription(message.sdp)
            );
            console.log(
              `[Offer] ✅ Remote description set for ${message.from}, signalingState: ${peerConnection.signalingState}`
            );

            // Process any queued ICE candidates
            await processQueuedCandidates(message.from, peerConnection);

            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);

            console.log(
              `[useWebRTC] Sending answer to ${
                message.from
              }, sendMessageRef available: ${!!sendMessageRef.current}`
            );
            if (sendMessageRef.current) {
              sendMessageRef.current({
                type: "answer",
                from: participantId,
                to: message.from,
                sdp: peerConnection.localDescription!,
              });
            } else {
              console.error(
                "[useWebRTC] ❌ Cannot send answer - sendMessageRef is null!"
              );
            }
            break;

          case "answer":
            console.log(`[Answer] Received answer from ${message.from}`);
            console.log(
              `[Answer] SDP type: ${message.sdp?.type}, has sdp: ${!!message.sdp
                ?.sdp}`
            );
            const answerPc = participantsRef.current.get(
              message.from
            )?.peerConnection;
            if (answerPc) {
              console.log(
                `[Answer] Setting remote description for ${message.from}, current signalingState: ${answerPc.signalingState}`
              );
              await answerPc.setRemoteDescription(
                new RTCSessionDescription(message.sdp)
              );
              console.log(
                `[Answer] ✅ Remote description set for ${message.from}, new signalingState: ${answerPc.signalingState}`
              );
              // Process any queued ICE candidates
              await processQueuedCandidates(message.from, answerPc);
            } else {
              console.error(
                `[Answer] ❌ No peer connection found for ${message.from}!`
              );
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

  // Mute/unmute audio on all RTCRtpSenders using replaceTrack for reliable muting
  const setLocalAudioEnabled = useCallback(
    async (enabled: boolean) => {
      const participantCount = participantsRef.current.size;
      console.log(
        `[useWebRTC] Setting local audio enabled=${enabled} on ${participantCount} peer connections`
      );

      // Store original audio track reference when first muting
      if (!enabled && localStream) {
        const audioTrack = localStream.getAudioTracks()[0];
        if (audioTrack && !originalAudioTrackRef.current) {
          originalAudioTrackRef.current = audioTrack;
          console.log(
            `[useWebRTC] Stored original audio track: ${audioTrack.id}`
          );
        }
      }

      if (participantCount === 0) {
        console.log("[useWebRTC] No peer connections yet, nothing to mute");
        return;
      }

      const promises: Promise<void>[] = [];

      participantsRef.current.forEach((participant, peerId) => {
        const pc = participant.peerConnection;
        if (!pc) {
          console.log(`[useWebRTC] No peer connection for ${peerId}`);
          return;
        }

        const senders = pc.getSenders();
        const audioSender = senders.find(
          (s) => s.track?.kind === "audio" || (!s.track && !enabled)
        );

        if (audioSender) {
          if (!enabled) {
            // Mute: Set track.enabled = false (most reliable)
            if (audioSender.track) {
              console.log(
                `[useWebRTC] Muting audio track ${audioSender.track.id} for ${peerId}`
              );
              audioSender.track.enabled = false;
            }
          } else {
            // Unmute: Re-enable the track
            const trackToEnable =
              audioSender.track || originalAudioTrackRef.current;
            if (trackToEnable) {
              console.log(
                `[useWebRTC] Unmuting audio track ${trackToEnable.id} for ${peerId}`
              );
              trackToEnable.enabled = true;
              // If the sender lost its track, replace it
              if (!audioSender.track && originalAudioTrackRef.current) {
                promises.push(
                  audioSender
                    .replaceTrack(originalAudioTrackRef.current)
                    .then(() => {
                      console.log(
                        `[useWebRTC] Replaced track for ${peerId} with original`
                      );
                    })
                    .catch((err) => {
                      console.error(
                        `[useWebRTC] Failed to replace track for ${peerId}:`,
                        err
                      );
                    })
                );
              }
            }
          }
        } else {
          console.log(`[useWebRTC] No audio sender found for ${peerId}`);
        }
      });

      await Promise.all(promises);
    },
    [localStream]
  );

  const broadcastAudioToggle = useCallback(
    async (audioEnabled: boolean) => {
      // First, ensure audio is muted/unmuted on all peer connections
      await setLocalAudioEnabled(audioEnabled);

      // Then broadcast the state to other participants
      if (sendMessage) {
        sendMessage({
          type: "audio-toggle",
          from: participantId,
          audioEnabled,
        });
      }
    },
    [sendMessage, participantId, setLocalAudioEnabled]
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

  // Track the previous localStream to detect actual changes
  const prevLocalStreamRef = useRef<MediaStream | null>(null);

  // Update peer connections when local stream ACTUALLY changes (not on participant updates)
  useEffect(() => {
    if (!localStream) return;

    // Only update if localStream actually changed
    if (localStream === prevLocalStreamRef.current) {
      return;
    }
    prevLocalStreamRef.current = localStream;

    console.log("[useWebRTC] localStream changed, updating peer connections");

    // Use the ref to get current participants without depending on the state
    participantsRef.current.forEach((participant, peerId) => {
      const pc = participant.peerConnection;
      if (!pc) return;

      // Check if tracks are already added
      const senders = pc.getSenders();
      const existingTrackIds = new Set(senders.map((s) => s.track?.id));
      const newTrackIds = new Set(localStream.getTracks().map((t) => t.id));

      // Skip if tracks are already correct
      const alreadyHasTracks = localStream
        .getTracks()
        .every((t) => existingTrackIds.has(t.id));
      if (
        alreadyHasTracks &&
        senders.length === localStream.getTracks().length
      ) {
        console.log(`[useWebRTC] PC for ${peerId} already has correct tracks`);
        return;
      }

      console.log(`[useWebRTC] Updating tracks for ${peerId}`);

      // Remove tracks that are no longer in the stream
      senders.forEach((sender) => {
        if (sender.track && !newTrackIds.has(sender.track.id)) {
          pc.removeTrack(sender);
        }
      });

      // Add new tracks that aren't already added
      localStream.getTracks().forEach((track) => {
        if (!existingTrackIds.has(track.id)) {
          pc.addTrack(track, localStream);
        }
      });
    });
  }, [localStream]); // Only depend on localStream, not participants

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
