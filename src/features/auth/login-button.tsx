import React from "react";
import { loginAction } from "./login";

export function LoginButton() {
  return (
    <form action={loginAction}>
      <button type="submit">Log In</button>
    </form>
  );
}
