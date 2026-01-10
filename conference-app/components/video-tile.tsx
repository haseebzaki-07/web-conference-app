"use client";

import { Card } from "@/components/ui/card";
import { Mic, MicOff, Crown, VideoOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface Participant {
  id: string;
  name: string;
  isMuted: boolean;
  isHost: boolean;
  avatar: string;
  stream?: MediaStream;
  isCameraEnabled?: boolean;
}

interface VideoTileProps {
  participant: Participant;
}

export function VideoTile({ participant }: VideoTileProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [, forceUpdate] = useState({});

  useEffect(() => {
    if (videoRef.current && participant.stream) {
      videoRef.current.srcObject = participant.stream;
    } else if (videoRef.current && !participant.stream) {
      videoRef.current.srcObject = null;
    }
  }, [participant.stream]);

  // Force re-render when video track state changes
  useEffect(() => {
    if (!participant.stream) return;

    const videoTrack = participant.stream
      .getVideoTracks()
      .find((track) => track.readyState !== "ended");

    // Listen for track additions/removals
    const handleTrackAdded = (event: MediaStreamTrackEvent) => {
      if (event.track.kind === "video") {
        forceUpdate({});
      }
    };
    const handleTrackRemoved = (event: MediaStreamTrackEvent) => {
      if (event.track.kind === "video") {
        forceUpdate({});
      }
    };
    const handleTrackEnded = () => {
      forceUpdate({});
    };

    participant.stream.addEventListener("addtrack", handleTrackAdded);
    participant.stream.addEventListener("removetrack", handleTrackRemoved);

    if (videoTrack) {
      videoTrack.addEventListener("ended", handleTrackEnded);
      // Poll for enabled state changes (since there's no enabled/disabled event)
      const interval = setInterval(() => {
        forceUpdate({});
      }, 250);

      return () => {
        clearInterval(interval);
        participant.stream?.removeEventListener("addtrack", handleTrackAdded);
        participant.stream?.removeEventListener(
          "removetrack",
          handleTrackRemoved
        );
        videoTrack.removeEventListener("ended", handleTrackEnded);
      };
    }

    return () => {
      participant.stream?.removeEventListener("addtrack", handleTrackAdded);
      participant.stream?.removeEventListener(
        "removetrack",
        handleTrackRemoved
      );
    };
  }, [participant.stream]);

  // Check actual video track state at render time
  const videoTrack = participant.stream
    ?.getVideoTracks()
    .find((track) => track.readyState !== "ended");
  const hasVideoTrack = !!videoTrack;
  const isVideoTrackEnabled = videoTrack?.enabled ?? false;

  // For local participant, use the prop; for remote, check actual track state
  const showVideo =
    participant.id === "local"
      ? participant.stream && participant.isCameraEnabled !== false
      : hasVideoTrack && isVideoTrackEnabled;

  const showPlaceholder = !participant.stream || !showVideo;

  return (
    <Card className="relative bg-gradient-to-br from-gray-800 to-gray-900 border-gray-700 overflow-hidden aspect-video flex items-center justify-center group">
      {/* Video Element - Always render if stream exists */}
      {participant.stream && (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={participant.id === "local" ? false : true}
          className="absolute inset-0 w-full h-full object-cover"
        />
      )}

      {/* Placeholder - Show when no stream or camera is disabled */}
      {showPlaceholder && (
        <>
          {/* Video Placeholder */}
          <div className="absolute inset-0 bg-gradient-to-br from-gray-700 to-gray-900 z-10" />

          {/* Avatar */}
          <div className="relative z-20 flex flex-col items-center gap-3">
            <div className="w-16 h-16 rounded-full bg-primary flex items-center justify-center text-xl font-semibold text-primary-foreground">
              {participant.avatar}
            </div>
            {participant.stream && !showVideo && (
              <div className="flex items-center gap-1 text-gray-400 text-sm">
                <VideoOff className="w-4 h-4" />
                <span>Camera off</span>
              </div>
            )}
          </div>
        </>
      )}

      {/* Overlay Info */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black to-transparent p-3 z-30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-white font-medium text-sm">
              {participant.name}
            </span>
            {participant.isHost && (
              <Crown className="w-4 h-4 text-yellow-400" aria-label="Host" />
            )}
          </div>
          {participant.isMuted ? (
            <MicOff className="w-4 h-4 text-red-400" />
          ) : (
            <Mic className="w-4 h-4 text-green-400" />
          )}
        </div>
      </div>
    </Card>
  );
}
