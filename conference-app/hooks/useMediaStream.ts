import { useState, useEffect, useCallback } from "react";

interface MediaStreamOptions {
  audio?: boolean | MediaTrackConstraints;
  video?: boolean | MediaTrackConstraints;
}

export function useMediaStream(
  options: MediaStreamOptions = { audio: true, video: true },
  autoStart: boolean = false
) {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isMicEnabled, setIsMicEnabled] = useState(true);
  const [isCameraEnabled, setIsCameraEnabled] = useState(true);

  const getMediaStream = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: options.audio,
        video: options.video,
      });

      setStream(mediaStream);
      setIsMicEnabled(options.audio !== false);
      setIsCameraEnabled(options.video !== false);
      setIsLoading(false);
      return mediaStream;
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to access media devices";
      setError(errorMessage);
      setIsLoading(false);
      console.error("Error accessing media devices:", err);
      throw err;
    }
  }, [options.audio, options.video]);

  const toggleMicrophone = useCallback(() => {
    if (!stream) return;

    const audioTrack = stream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      setIsMicEnabled(audioTrack.enabled);
    }
  }, [stream]);

  const toggleCamera = useCallback(() => {
    if (!stream) return;

    const videoTrack = stream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      setIsCameraEnabled(videoTrack.enabled);
    }
  }, [stream]);

  const stopStream = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach((track) => {
        track.stop();
      });
      setStream(null);
    }
  }, [stream]);

  useEffect(() => {
    if (autoStart) {
      getMediaStream();
    }

    return () => {
      stopStream();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart]);

  return {
    stream,
    error,
    isLoading,
    isMicEnabled,
    isCameraEnabled,
    toggleMicrophone,
    toggleCamera,
    stopStream,
    getMediaStream,
  };
}
