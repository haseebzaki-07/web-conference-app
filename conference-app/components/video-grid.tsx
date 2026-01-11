"use client";

import { VideoTile } from "./video-tile";

interface Participant {
  id: string;
  name: string;
  isMuted: boolean;
  isHost: boolean;
  avatar: string;
  stream?: MediaStream;
  isCameraEnabled?: boolean;
}

interface VideoGridProps {
  participants: Participant[];
}

export function VideoGrid({ participants }: VideoGridProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-4 auto-rows-fr p-4">
      {participants.map((participant) => (
        <VideoTile key={participant.id} participant={participant} />
      ))}
    </div>
  );
}
