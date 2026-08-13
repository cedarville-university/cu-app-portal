import React from "react";
import { loginAction } from "./login";

export function LoginButton() {
  async function startLogin() {
    await loginAction();
  }

  return (
    <form action={startLogin}>
      <button type="submit">Log In</button>
    </form>
  );
}
