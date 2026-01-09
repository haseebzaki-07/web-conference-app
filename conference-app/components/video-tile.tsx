"use client"

import { Card } from "@/components/ui/card"
import { Mic, MicOff, Crown, VideoOff } from "lucide-react"
import { useEffect, useRef } from "react"

interface Participant {
  id: string
  name: string
  isMuted: boolean
  isHost: boolean
  avatar: string
  stream?: MediaStream
  isCameraEnabled?: boolean
}

interface VideoTileProps {
  participant: Participant
}

export function VideoTile({ participant }: VideoTileProps) {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    if (videoRef.current && participant.stream) {
      videoRef.current.srcObject = participant.stream
    }
  }, [participant.stream])

  const hasVideo = participant.stream && participant.isCameraEnabled !== false

  return (
    <Card className="relative bg-gradient-to-br from-gray-800 to-gray-900 border-gray-700 overflow-hidden aspect-video flex items-center justify-center group">
      {/* Video Element */}
      {hasVideo ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={participant.id === "local"}
          className="absolute inset-0 w-full h-full object-cover"
        />
      ) : (
        <>
          {/* Video Placeholder */}
          <div className="absolute inset-0 bg-gradient-to-br from-gray-700 to-gray-900" />
          
          {/* Avatar */}
          <div className="relative z-10 flex flex-col items-center gap-3">
            <div className="w-16 h-16 rounded-full bg-primary flex items-center justify-center text-xl font-semibold text-primary-foreground">
              {participant.avatar}
            </div>
            {participant.isCameraEnabled === false && (
              <div className="flex items-center gap-1 text-gray-400 text-sm">
                <VideoOff className="w-4 h-4" />
                <span>Camera off</span>
              </div>
            )}
          </div>
        </>
      )}

      {/* Overlay Info */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black to-transparent p-3 z-20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-white font-medium text-sm">{participant.name}</span>
            {participant.isHost && <Crown className="w-4 h-4 text-yellow-400" title="Host" />}
          </div>
          {participant.isMuted ? (
            <MicOff className="w-4 h-4 text-red-400" />
          ) : (
            <Mic className="w-4 h-4 text-green-400" />
          )}
        </div>
      </div>
    </Card>
  )
}
