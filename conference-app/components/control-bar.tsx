"use client"

import { Button } from "@/components/ui/button"
import { Mic, MicOff, Video, VideoOff, PhoneOff, Users } from "lucide-react"

interface ControlBarProps {
  isMicEnabled: boolean
  isCameraEnabled: boolean
  onMicToggle: () => void
  onCameraToggle: () => void
  onLeaveRoom: () => void
  onToggleParticipants: () => void
  participantCount: number
}

export function ControlBar({
  isMicEnabled,
  isCameraEnabled,
  onMicToggle,
  onCameraToggle,
  onLeaveRoom,
  onToggleParticipants,
  participantCount,
}: ControlBarProps) {
  return (
    <div className="bg-card border-t border-border px-4 py-4 flex items-center justify-center gap-4">
      {/* Mic Toggle */}
      <Button
        variant={isMicEnabled ? "default" : "outline"}
        size="icon"
        className="w-12 h-12 rounded-full"
        onClick={onMicToggle}
        title={isMicEnabled ? "Mute microphone" : "Unmute microphone"}
      >
        {isMicEnabled ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
      </Button>

      {/* Camera Toggle */}
      <Button
        variant={isCameraEnabled ? "default" : "outline"}
        size="icon"
        className="w-12 h-12 rounded-full"
        onClick={onCameraToggle}
        title={isCameraEnabled ? "Turn off camera" : "Turn on camera"}
      >
        {isCameraEnabled ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
      </Button>

      {/* Participants Toggle */}
      <Button
        variant="outline"
        size="icon"
        className="w-12 h-12 rounded-full bg-transparent"
        onClick={onToggleParticipants}
        title="Show participants"
      >
        <Users className="w-5 h-5" />
        <span className="absolute -top-2 -right-2 bg-primary text-primary-foreground text-xs font-semibold rounded-full w-5 h-5 flex items-center justify-center">
          {participantCount}
        </span>
      </Button>

      {/* Leave Room */}
      <Button
        variant="destructive"
        size="icon"
        className="w-12 h-12 rounded-full"
        onClick={onLeaveRoom}
        title="Leave room"
      >
        <PhoneOff className="w-5 h-5" />
      </Button>
    </div>
  )
}
