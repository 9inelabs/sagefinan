"use client";

import Link from "next/link";
import { MessageSquare } from "lucide-react";
import { useShell } from "./shell-context";

// Round messages shortcut with a live unread dot. `dark` is the mobile top
// bar's variant; the default sits on the light canvas (page header actions).
export function MessagesButton({ dark = false }: { dark?: boolean }) {
  const { unreadMessages } = useShell();
  return (
    <Link
      href="/messages"
      aria-label={unreadMessages > 0 ? `Messages, ${unreadMessages} unread` : "Messages"}
      className={`relative w-9.5 h-9.5 rounded-full grid place-items-center flex-none ${
        dark ? "bg-frame-2 border border-frame-line text-on-dark" : "bg-white shadow-premium text-ink hover:bg-n50"
      }`}
    >
      <MessageSquare size={16} strokeWidth={1.75} />
      {unreadMessages > 0 ? (
        <i className={`absolute top-2 right-2.5 w-[7px] h-[7px] rounded-full bg-brand-bright ${dark ? "ring-2 ring-frame-2" : "ring-2 ring-white"}`} />
      ) : null}
    </Link>
  );
}
