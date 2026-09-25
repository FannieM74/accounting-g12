"use client";

const DARK_KEY = "acct12-dark";

export function getDarkMode(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(DARK_KEY) === "true";
}

export function setDarkMode(enabled: boolean): void {
  localStorage.setItem(DARK_KEY, enabled ? "true" : "false");
  if (enabled) {
    document.documentElement.classList.add("dark");
  } else {
    document.documentElement.classList.remove("dark");
  }
}

