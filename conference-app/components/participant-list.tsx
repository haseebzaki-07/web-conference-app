"use client";

import { ParticipantItem } from "./participant-item";

interface Participant {
  id: string;
  name: string;
  isMuted: boolean;
  isHost: boolean;
  avatar: string;
  stream?: MediaStream;
  isCameraEnabled?: boolean;
}

interface ParticipantListProps {
  participants: Participant[];
  isHost: boolean;
  onParticipantMute: (id: string) => void;
  onParticipantKick: (id: string) => void;
}

export function ParticipantList({
  participants,
  isHost,
  onParticipantMute,
  onParticipantKick,
}: ParticipantListProps) {
  return (
    <div className="flex flex-col">
      <div className="border-b border-border px-4 py-3">
        <h2 className="font-semibold text-sm text-card-foreground">
          Participants ({participants.length})
        </h2>
      </div>
      <div className="flex-1 overflow-y-auto">
        {participants.map((participant) => (
          <ParticipantItem
            key={participant.id}
            participant={participant}
            isHost={isHost}
            onMute={() => onParticipantMute(participant.id)}
            onKick={() => onParticipantKick(participant.id)}
          />
        ))}
      </div>
    </div>
  );
}
