// app/api/auth/[...nextauth]/route.ts

import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth";

const { handlers, auth, signIn, signOut } = NextAuth(authConfig);

export { auth, signIn, signOut };
export const { GET, POST } = handlers;
