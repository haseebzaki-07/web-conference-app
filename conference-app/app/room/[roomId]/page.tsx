"use client";

import { useState, useEffect, useMemo } from "react";
import { useSession } from "next-auth/react";
import { VideoGrid } from "@/components/video-grid";
import { ControlBar } from "@/components/control-bar";
import { ParticipantList } from "@/components/participant-list";
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
  } = useMediaStream(
    {
      audio: true,
      video: true,
    },
    mediaRequested
  );

  // Setup WebRTC
  const {
    participants: remoteParticipants,
    isConnected,
    error: webrtcError,
    disconnect,
  } = useWebRTC({
    roomId: roomId.roomId,
    participantId,
    localStream,
    enabled: roomValid === true,
  });

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

    const remote = remoteParticipants.map((p, index) => ({
      id: p.id,
      name: `Guest ${index + 1}`,
      isMuted: false, // We don't track remote mute state in this simple implementation
      isHost: false,
      avatar: `G${index + 1}`,
      stream: p.stream,
      isCameraEnabled: p.stream?.getVideoTracks()[0]?.enabled ?? false,
    }));

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
              onParticipantMute={() => {}}
              onParticipantKick={() => {}}
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
