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
  const currentStreamRef = useRef<MediaStream | undefined>(undefined);
  const [, forceUpdate] = useState({});

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const stream = participant.stream;

    // Avoid re-setting the same stream (prevents play() interruption)
    if (stream === currentStreamRef.current) {
      return;
    }

    currentStreamRef.current = stream;

    if (stream) {
      console.log(`[VideoTile ${participant.id}] Setting srcObject`, {
        streamId: stream.id,
        videoTracks: stream.getVideoTracks().length,
        audioTracks: stream.getAudioTracks().length,
        videoTrackState: stream.getVideoTracks()[0]?.readyState,
        videoTrackEnabled: stream.getVideoTracks()[0]?.enabled,
      });
      video.srcObject = stream;

      // Wait for video to be ready before playing
      const handleCanPlay = () => {
        console.log(
          `[VideoTile ${participant.id}] canplay fired, attempting play()`
        );
        video
          .play()
          .then(() => {
            console.log(
              `[VideoTile ${participant.id}] ✅ Video playing successfully`
            );
          })
          .catch((err) => {
            console.warn(
              `[VideoTile ${participant.id}] Autoplay blocked:`,
              err.message
            );
          });
      };

      // If already ready, play immediately; otherwise wait for canplay
      if (video.readyState >= 3) {
        console.log(
          `[VideoTile ${participant.id}] Already ready (readyState=${video.readyState})`
        );
        handleCanPlay();
      } else {
        console.log(
          `[VideoTile ${participant.id}] Waiting for canplay (readyState=${video.readyState})`
        );
        video.addEventListener("canplay", handleCanPlay, { once: true });
      }

      return () => {
        video.removeEventListener("canplay", handleCanPlay);
      };
    } else {
      video.srcObject = null;
    }
  }, [participant.stream, participant.id]);

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
      {/* CRITICAL: All videos start muted to satisfy autoplay policy, then unmute remote after playing */}
      {participant.stream && (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="absolute inset-0 w-full h-full object-cover"
          onPlaying={() => {
            // Unmute remote videos after they start playing
            if (videoRef.current && participant.id !== "local") {
              console.log(
                `[VideoTile ${participant.id}] Video playing, unmuting`
              );
              videoRef.current.muted = false;
            }
          }}
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
