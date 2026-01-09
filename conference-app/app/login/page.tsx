"use client";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function LoginContent() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");

  const handleGoogleSignIn = async () => {
    await signIn("google", { callbackUrl: "/create-room" });
  };

  return (
    <main className="min-h-screen bg-background flex items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <h1 className="text-2xl font-semibold">Sign in to create a room</h1>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md">
              Authentication failed. Please try again.
            </div>
          )}
          <Button className="w-full" size="lg" onClick={handleGoogleSignIn}>
            Sign in with Google
          </Button>
          <p className="text-sm text-muted-foreground text-center">
            Authentication required only to create rooms
          </p>
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

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <LoginContent />
    </Suspense>
  );
}
