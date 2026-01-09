"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="max-w-lg text-center space-y-8">
        <div className="space-y-4">
          <h1 className="text-4xl font-semibold text-foreground">MeetFlow</h1>
          <p className="text-lg text-muted-foreground">
            Simple, secure video conferencing. Create a room and invite others to join via link.
          </p>
        </div>

        <div className="flex flex-col gap-3 pt-4">
          <Link href="/create-room">
            <Button size="lg" className="w-full">
              Create Room
            </Button>
          </Link>
          <Link href="/login">
            <Button variant="outline" size="lg" className="w-full bg-transparent">
              Sign In
            </Button>
          </Link>
        </div>
      </div>
    </main>
  )
}
