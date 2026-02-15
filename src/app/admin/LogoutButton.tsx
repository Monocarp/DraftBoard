"use client";

import { logout } from "./actions";

export function LogoutButton() {
  return (
    <form action={logout}>
      <button
        type="submit"
        className="rounded-lg border border-[#2a3a4e] px-3 py-1.5 text-sm text-gray-400 hover:text-white hover:border-gray-500 transition-colors"
      >
        Sign Out
      </button>
    </form>
  );
}
