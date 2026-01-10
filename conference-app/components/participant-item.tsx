"use client";

import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Mic, MicOff, Trash2 } from "lucide-react";
import { useState } from "react";

interface Participant {
  id: string;
  name: string;
  isMuted: boolean;
  isHost: boolean;
  avatar: string;
}

interface ParticipantItemProps {
  participant: Participant;
  isHost: boolean;
  onMute: () => void;
  onKick: () => void;
}

export function ParticipantItem({
  participant,
  isHost,
  onMute,
  onKick,
}: ParticipantItemProps) {
  const [showActions, setShowActions] = useState(false);

  return (
    <div
      className="px-4 py-3 border-b border-border hover:bg-muted/50 flex items-center justify-between gap-2 group"
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <Avatar className="h-8 w-8">
          <AvatarFallback className="text-xs">
            {participant.avatar}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-card-foreground truncate">
            {participant.name}
            {participant.isHost && (
              <span className="text-xs text-muted-foreground ml-1">(Host)</span>
            )}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-1">
        {participant.isMuted ? (
          <MicOff className="w-4 h-4 text-red-400" />
        ) : (
          <Mic className="w-4 h-4 text-green-400" />
        )}

        {/* Host-only actions */}
        {isHost &&
          participant.id !== "local" &&
          !participant.isHost &&
          showActions && (
            <div className="flex gap-1 ml-2">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 hover:bg-destructive/20"
                onClick={onMute}
                title="Mute participant"
              >
                <MicOff className="w-3 h-3" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 hover:bg-destructive/20"
                onClick={onKick}
                title="Remove participant"
              >
                <Trash2 className="w-3 h-3" />
              </Button>
            </div>
          )}
      </div>
    </div>
  );
}
