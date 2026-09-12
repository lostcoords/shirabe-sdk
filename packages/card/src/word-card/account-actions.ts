import type { WordCardHost } from "./host.js";

export function accountActions(account: NonNullable<WordCardHost["account"]>, signedOut: () => void): HTMLElement {
  const details = document.createElement("details");
  details.className = "sb-account";
  const summary = document.createElement("summary");
  summary.textContent = "Sign out of Shirabe on this device";
  const prompt = document.createElement("p");
  prompt.textContent = "Sign out on this device? You will need to reconnect for online lookups.";
  const status = document.createElement("p");
  status.setAttribute("role", "status");
  status.setAttribute("aria-label", "Sign-out status");
  const confirm = document.createElement("button");
  confirm.type = "button";
  confirm.textContent = "Sign out";
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.textContent = "Cancel";
  cancel.addEventListener("click", () => {
    details.open = false;
    status.textContent = "";
    summary.focus();
  });
  confirm.addEventListener("click", async () => {
    if (confirm.disabled) return;
    confirm.disabled = true;
    cancel.disabled = true;
    details.setAttribute("aria-busy", "true");
    status.textContent = "Signing out…";
    summary.focus({ preventScroll: true });
    try {
      await account.signOut();
      signedOut();
      details.open = false;
      status.textContent = "";
    } catch (error) {
      status.textContent = error instanceof Error && error.message.trim() ? error.message : "Couldn't sign out. Try again.";
    } finally {
      confirm.disabled = false;
      cancel.disabled = false;
      details.removeAttribute("aria-busy");
    }
  });
  details.append(summary, prompt, confirm, cancel, status);
  for (const event of ["click", "dblclick", "pointerdown", "pointerup", "keyup"]) {
    details.addEventListener(event, (event) => event.stopPropagation());
  }
  details.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" && !(event.altKey && ["ArrowLeft", "ArrowRight"].includes(event.key))) event.stopPropagation();
  });
  return details;
}

export const ACCOUNT_CSS = `
.sb-account { flex: 0 0 auto; margin-top: 8px; border-top: 1px solid var(--sb-divider); font-size: 12px; }
.sb-account summary, .sb-account button { cursor: pointer; box-sizing: border-box; min-height: 44px; padding: 10px 4px; }
.sb-account summary { color: var(--sb-ink-subtle); }
.sb-account button { margin-right: 6px; padding: 8px 12px; font: inherit; border: 1px solid var(--sb-outline-strong); border-radius: 8px; color: var(--sb-ink); background: var(--sb-surface-muted); }
.sb-account button:hover:not(:disabled), .sb-account summary:hover { background: var(--sb-accent-tint); }
.sb-account button:disabled { opacity: .4; cursor: default; }
.sb-account :is(summary, button):focus-visible { outline: 2px solid var(--sb-accent); outline-offset: 2px; }
.sb-account p { margin: 4px 0; }
.sb-account p:empty { display: none; }
`;
