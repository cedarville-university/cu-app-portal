"use client";

import Link from "next/link";
import React from "react";
import { useEffect, useRef, useState } from "react";
import { LogoutButton } from "@/features/auth/logout-button";

type AccountMenuProps = {
  userDisplayName: string;
};

export function AccountMenu({ userDisplayName }: AccountMenuProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    function closeWhenOutside(event: PointerEvent | FocusEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", closeWhenOutside);
    document.addEventListener("focusin", closeWhenOutside);

    return () => {
      document.removeEventListener("pointerdown", closeWhenOutside);
      document.removeEventListener("focusin", closeWhenOutside);
    };
  }, []);

  function closeMenu() {
    setOpen(false);
  }

  return (
    <details ref={menuRef} className="site-header__account-menu" open={open}>
      <summary
        className="site-header__user-name"
        onClick={(event) => {
          event.preventDefault();
          setOpen((currentOpen) => !currentOpen);
        }}
      >
        {userDisplayName}
      </summary>
      <div className="site-header__account-menu-content">
        <Link href="/settings" onClick={closeMenu}>
          Settings
        </Link>
        <span onClick={closeMenu}>
          <LogoutButton />
        </span>
      </div>
    </details>
  );
}
