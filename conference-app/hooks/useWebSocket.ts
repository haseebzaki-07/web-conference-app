import { useEffect, useRef, useCallback, useState } from "react";

interface SignalingMessage {
  type:
    | "offer"
    | "answer"
    | "ice-candidate"
    | "join"
    | "leave"
    | "participants"
    | "participant-joined"
    | "participant-left"
    | "kick"
    | "kicked"
    | "mute"
    | "audio-toggle"
    | "error";
  from?: string;
  to?: string;
  participants?: string[];
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
  message?: string;
  muted?: boolean;
  audioEnabled?: boolean;
}

interface UseWebSocketProps {
  roomId: string;
  participantId: string;
  onMessage: (message: SignalingMessage) => void;
  enabled?: boolean;
}

export function useWebSocket({
  roomId,
  participantId,
  onMessage,
  enabled = true,
}: UseWebSocketProps) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const shouldReconnectRef = useRef(true);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connect = useCallback(() => {
    if (!enabled) return;

    // Prevent multiple connections
    if (
      wsRef.current &&
      (wsRef.current.readyState === WebSocket.OPEN ||
        wsRef.current.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:3001";
    const ws = new WebSocket(`${wsUrl}/ws/${roomId}`);

    ws.onopen = () => {
      console.log("WebSocket connected");
      setIsConnected(true);
      setError(null);

      // Send join message
      const joinMessage = {
        type: "join",
        from: participantId,
        roomId,
      };
      console.log("[WS Send] Join message:", joinMessage);
      ws.send(JSON.stringify(joinMessage));
    };

    ws.onmessage = (event) => {
      try {
        const message: SignalingMessage = JSON.parse(event.data);
        console.log(
          "[WS Receive]",
          message.type,
          "from",
          message.from || "server",
          message
        );
        onMessage(message);
      } catch (err) {
        console.error("Failed to parse WebSocket message:", err);
      }
    };

    ws.onerror = (event) => {
      console.error("WebSocket error:", event);
      setError("WebSocket connection error");
    };

    ws.onclose = () => {
      console.log("WebSocket disconnected");
      setIsConnected(false);
      wsRef.current = null;

      // Attempt to reconnect after 3 seconds only if we should reconnect
      if (enabled && shouldReconnectRef.current) {
        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, 3000);
      }
    };

    wsRef.current = ws;
  }, [roomId, participantId, onMessage, enabled]);

  const sendMessage = useCallback((message: SignalingMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      console.log(
        "[WS Send]",
        message.type,
        "to",
        message.to || "all",
        message
      );
      wsRef.current.send(JSON.stringify(message));
    } else {
      console.error(
        "WebSocket is not connected. Ready state:",
        wsRef.current?.readyState
      );
    }
  }, []);

  const disconnect = useCallback(() => {
    shouldReconnectRef.current = false;

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }

    if (wsRef.current) {
      // Send leave message before closing
      if (wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: "leave",
            from: participantId,
          })
        );
      }
      wsRef.current.close();
      wsRef.current = null;
    }
    setIsConnected(false);
  }, [participantId]);

  useEffect(() => {
    if (enabled) {
      shouldReconnectRef.current = true;
      connect();
    }

    return () => {
      shouldReconnectRef.current = false;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        if (wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(
            JSON.stringify({
              type: "leave",
              from: participantId,
            })
          );
        }
        wsRef.current.close();
        wsRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, roomId, participantId]);

  return { sendMessage, isConnected, error, disconnect };
}
