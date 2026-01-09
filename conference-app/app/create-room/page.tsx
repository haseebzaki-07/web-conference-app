"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Copy, Check } from "lucide-react";
import Link from "next/link";

export default function CreateRoomPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [roomLink, setRoomLink] = useState<string | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreateRoom = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/rooms/create", {
        method: "POST",
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to create room");
      }

      const data = await response.json();
      setRoomLink(data.link);
      setRoomId(data.roomId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create room");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyLink = () => {
    if (roomLink) {
      navigator.clipboard.writeText(roomLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <main className="min-h-screen bg-background flex items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <h1 className="text-2xl font-semibold">Create a Room</h1>
        </CardHeader>
        <CardContent className="space-y-4">
          {!roomLink ? (
            <>
              <p className="text-sm text-muted-foreground">
                Create a new room and invite others to join
              </p>
              {error && (
                <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md">
                  {error}
                </div>
              )}
              <Button
                size="lg"
                className="w-full"
                onClick={handleCreateRoom}
                disabled={isLoading}
              >
                {isLoading ? "Creating..." : "Create Room"}
              </Button>
            </>
          ) : (
            <>
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Room created successfully!
                </p>
                <div className="bg-muted p-3 rounded-lg break-all text-sm font-mono">
                  {roomLink}
                </div>
                <Button
                  size="lg"
                  variant="outline"
                  className="w-full flex items-center justify-center gap-2 bg-transparent"
                  onClick={handleCopyLink}
                >
                  {copied ? (
                    <>
                      <Check className="w-4 h-4" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      Copy Link
                    </>
                  )}
                </Button>
              </div>
              {roomId && (
                <Link href={`/room/${roomId}`} className="block">
                  <Button size="lg" className="w-full">
                    Join Room
                  </Button>
                </Link>
              )}
            </>
          )}
          <div className="pt-4">
            <Link href="/" className="text-sm text-primary hover:underline">
              Back to home
            </Link>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}