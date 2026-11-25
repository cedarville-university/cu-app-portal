import NextAuth from "next-auth";
import { cache } from "react";
import { authConfig } from "./config";

const { auth, signIn, signOut } = NextAuth(authConfig);

export const getServerSession = cache(() => auth());
export { signIn, signOut };
