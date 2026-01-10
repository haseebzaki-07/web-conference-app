"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useSession } from "next-auth/react";
import { VideoGrid } from "@/components/video-grid";
import { ControlBar } from "@/components/control-bar";
import { ParticipantList } from "@/components/participant-list";
import { Notification } from "@/components/notification";
import { useMediaStream } from "@/hooks/useMediaStream";
import { useWebRTC } from "@/hooks/useWebRTC";
import { nanoid } from "nanoid";
import { useParams, useRouter } from "next/navigation";

export default function RoomPage({ params }: { params: { roomId: string } }) {
  const router = useRouter();
  const { data: session } = useSession();
  const [showParticipants, setShowParticipants] = useState(true);
  const [isHost, setIsHost] = useState(false);
  const [roomValid, setRoomValid] = useState<boolean | null>(null);
  const [mediaRequested, setMediaRequested] = useState(false);
  const [notifications, setNotifications] = useState<
    Array<{
      id: string;
      message: string;
      type: "info" | "success" | "warning" | "error";
    }>
  >([]);
  const roomId = useParams<{ roomId: string }>();
  // Generate or retrieve participant ID
  const participantId = useMemo(() => {
    if (typeof window !== "undefined") {
      let id = sessionStorage.getItem(`participant-${roomId}`);
      if (!id) {
        id = nanoid(10);
        sessionStorage.setItem(`participant-${roomId}`, id);
      }
      return id;
    }
    return nanoid(10);
  }, [roomId]);

  // Create a ref to store the broadcast function
  const broadcastAudioToggleRef = useRef<((enabled: boolean) => void) | null>(
    null
  );

  // Get local media stream
  const {
    stream: localStream,
    isMicEnabled,
    isCameraEnabled,
    toggleMicrophone,
    toggleCamera,
    stopStream,
    getMediaStream,
    error: mediaError,
    isLoading: mediaLoading,
  } = useMediaStream({
    options: {
      audio: true,
      video: true,
    },
    autoStart: mediaRequested,
    onAudioToggle: (enabled) => {
      // Broadcast audio toggle to other participants
      if (broadcastAudioToggleRef.current) {
        broadcastAudioToggleRef.current(enabled);
      }
    },
  });

  // Setup WebRTC
  const {
    participants: remoteParticipants,
    isConnected,
    error: webrtcError,
    disconnect,
    kickParticipant,
    muteParticipant,
    broadcastAudioToggle,
  } = useWebRTC({
    roomId: roomId.roomId,
    participantId,
    localStream,
    enabled: roomValid === true && localStream !== null,
    onParticipantJoined: (joinedParticipantId) => {
      // Add notification when participant joins
      const notificationId = nanoid();
      setNotifications((prev) => [
        ...prev,
        {
          id: notificationId,
          message: "A participant joined the room",
          type: "success",
        },
      ]);
    },
    onParticipantLeft: (leftParticipantId) => {
      // Add notification when participant leaves
      const participantIndex = remoteParticipants.findIndex(
        (p) => p.id === leftParticipantId
      );
      const participantName =
        participantIndex >= 0
          ? `Guest ${participantIndex + 1}`
          : "A participant";

      const notificationId = nanoid();
      setNotifications((prev) => [
        ...prev,
        {
          id: notificationId,
          message: `${participantName} left the room`,
          type: "info",
        },
      ]);
    },
    onKicked: () => {
      // Handle being kicked
      const notificationId = nanoid();
      setNotifications((prev) => [
        ...prev,
        {
          id: notificationId,
          message: "You have been removed from the room by the host",
          type: "error",
        },
      ]);
      // Disconnect and redirect after a short delay
      setTimeout(() => {
        stopStream();
        disconnect();
        router.push("/");
      }, 2000);
    },
    onMuted: (muted) => {
      // Handle being muted/unmuted by host
      if (muted && isMicEnabled) {
        // Host is muting us - turn off microphone
        // This will trigger onAudioToggle which broadcasts the state
        toggleMicrophone();
        const notificationId = nanoid();
        setNotifications((prev) => [
          ...prev,
          {
            id: notificationId,
            message: "You have been muted by the host",
            type: "warning",
          },
        ]);
      } else if (!muted && !isMicEnabled) {
        // Host is unmuting us - turn on microphone
        // This will trigger onAudioToggle which broadcasts the state
        toggleMicrophone();
        const notificationId = nanoid();
        setNotifications((prev) => [
          ...prev,
          {
            id: notificationId,
            message: "You have been unmuted by the host",
            type: "info",
          },
        ]);
      }
    },
  });

  // Update the broadcast ref when the function is available
  useEffect(() => {
    broadcastAudioToggleRef.current = broadcastAudioToggle;
  }, [broadcastAudioToggle]);

  // Validate room
  useEffect(() => {
    async function validateRoom() {
      try {
        const backendUrl =
          process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001";
        const response = await fetch(`${backendUrl}/api/rooms/validate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roomId: roomId.roomId }),
        });

        const data = await response.json();
        setRoomValid(data.valid);

        if (data.valid && data.room) {
          // Check if current user is the host
          setIsHost(session?.user?.id === data.room.hostId);
        }

        if (!data.valid) {
          router.push("/");
        }
      } catch (error) {
        console.error("Failed to validate room:", error);
        setRoomValid(false);
      }
    }

    validateRoom();
  }, [roomId, session, router]);

  // Combine local and remote participants
  const allParticipants = useMemo(() => {
    const local = {
      id: "local",
      name: session?.user?.name || "You",
      isMuted: !isMicEnabled,
      isHost,
      avatar: session?.user?.name?.[0]?.toUpperCase() || "Y",
      stream: localStream || undefined,
      isCameraEnabled,
    };

    const remote = remoteParticipants.map((p, index) => {
      const videoTrack = p.stream
        ?.getVideoTracks()
        .find((track) => track.readyState !== "ended");
      const audioTrack = p.stream?.getAudioTracks()[0];

      // Determine mute state: use audioEnabled if available, otherwise check track state
      let isMuted = false;
      if (p.audioEnabled !== undefined) {
        isMuted = !p.audioEnabled;
      } else if (p.isMuted !== undefined) {
        isMuted = p.isMuted;
      } else if (audioTrack) {
        isMuted = !audioTrack.enabled;
      }

      return {
        id: p.id,
        name: `Guest ${index + 1}`,
        isMuted,
        isHost: false,
        avatar: `G${index + 1}`,
        stream: p.stream,
        isCameraEnabled: videoTrack?.enabled ?? false,
      };
    });

    return [local, ...remote];
  }, [
    localStream,
    remoteParticipants,
    isMicEnabled,
    isCameraEnabled,
    isHost,
    session,
  ]);

  const handleLeaveRoom = () => {
    stopStream();
    disconnect();
    router.push("/");
  };

  const handleEnableCamera = async () => {
    try {
      await getMediaStream();
      setMediaRequested(true);
    } catch (err) {
      console.error("Failed to enable camera:", err);
    }
  };

  const removeNotification = (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  const handleParticipantKick = (participantId: string) => {
    if (participantId === "local") return; // Can't kick yourself
    kickParticipant(participantId);

    const notificationId = nanoid();
    setNotifications((prev) => [
      ...prev,
      {
        id: notificationId,
        message: "Participant removed from the room",
        type: "info",
      },
    ]);
  };

  const handleParticipantMute = (participantId: string) => {
    if (participantId === "local") return; // Can't mute yourself this way

    // Find the participant to check their current mute state
    const participant = allParticipants.find((p) => p.id === participantId);
    if (participant) {
      const newMutedState = !participant.isMuted;
      muteParticipant(participantId, newMutedState);

      const notificationId = nanoid();
      setNotifications((prev) => [
        ...prev,
        {
          id: notificationId,
          message: `Participant ${newMutedState ? "muted" : "unmuted"}`,
          type: "info",
        },
      ]);
    }
  };

  // Show loading state
  if (roomValid === null) {
    return (
      <main className="h-screen bg-black flex items-center justify-center">
        <div className="text-white">Loading room...</div>
      </main>
    );
  }

  // Show error state
  if (webrtcError) {
    return (
      <main className="h-screen bg-black flex items-center justify-center">
        <div className="text-center text-white space-y-4">
          <h2 className="text-xl font-semibold">Error</h2>
          <p className="text-red-400">{webrtcError}</p>
          <button
            onClick={handleLeaveRoom}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg"
          >
            Leave Room
          </button>
        </div>
      </main>
    );
  }

  // Show camera permission prompt if not requested yet
  if (!mediaRequested && !localStream && roomValid === true) {
    return (
      <main className="h-screen bg-black flex items-center justify-center">
        <div className="text-center text-white space-y-6 max-w-md px-4">
          <h2 className="text-2xl font-semibold">Enable Camera & Microphone</h2>
          <p className="text-gray-400">
            To join the video call, please allow access to your camera and
            microphone.
          </p>
          {mediaError && <p className="text-red-400 text-sm">{mediaError}</p>}
          <div className="flex gap-4 justify-center">
            <button
              onClick={handleEnableCamera}
              disabled={mediaLoading}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {mediaLoading ? "Requesting..." : "Enable Camera & Mic"}
            </button>
            <button
              onClick={handleLeaveRoom}
              className="px-6 py-3 bg-gray-700 hover:bg-gray-600 rounded-lg"
            >
              Cancel
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="h-screen bg-black flex flex-col">
      {/* Notification Container */}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2">
        {notifications.map((notification) => (
          <Notification
            key={notification.id}
            message={notification.message}
            type={notification.type}
            onClose={() => removeNotification(notification.id)}
          />
        ))}
      </div>

      <div className="flex-1 flex overflow-hidden gap-4 p-4">
        {/* Video Grid Area */}
        <div className="flex-1 flex flex-col gap-4">
          <VideoGrid participants={allParticipants} />

          {/* Connection Status */}
          {!isConnected && (
            <div className="absolute top-4 left-4 bg-yellow-600 text-white px-3 py-2 rounded-lg text-sm">
              Connecting to signaling server...
            </div>
          )}
        </div>

        {/* Participants Panel - Collapsible */}
        {showParticipants && (
          <div className="w-64 bg-card border border-border rounded-lg overflow-hidden flex flex-col">
            <ParticipantList
              participants={allParticipants}
              isHost={isHost}
              onParticipantMute={handleParticipantMute}
              onParticipantKick={handleParticipantKick}
            />
          </div>
        )}
      </div>

      {/* Control Bar */}
      <ControlBar
        isMicEnabled={isMicEnabled}
        isCameraEnabled={isCameraEnabled}
        onMicToggle={toggleMicrophone}
        onCameraToggle={toggleCamera}
        onLeaveRoom={handleLeaveRoom}
        onToggleParticipants={() => setShowParticipants(!showParticipants)}
        participantCount={allParticipants.length}
      />
    </main>
  );
}
