// app/api/rooms/create/route.ts

import { NextResponse } from "next/server";
import { auth } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { nanoid } from "nanoid";

export async function POST() {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Generate unique roomId
    const roomId = nanoid(12);

    // Create room in database
    const room = await prisma.room.create({
      data: {
        roomId,
        hostId: session.user.id,
        isActive: true,
      },
    });

    const roomLink = `${process.env.NEXT_PUBLIC_APP_URL || 
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 
       `http://localhost:3000`)}/room/${roomId}`;

    return NextResponse.json({
      roomId: room.roomId,
      link: roomLink,
    });
  } catch (error) {
    console.error("Error creating room:", error);
    return NextResponse.json(
      { error: "Failed to create room" },
      { status: 500 }
    );
  }
}