import { Window } from "happy-dom";

/** Installs a happy-dom window as the browser globals the card reads. Each test
    file runs in its own process, so one call per file is one page. */
export function installWindow(url = "https://example.test"): Window {
  const window = new Window({ url });
  Object.assign(globalThis, {
    window, document: window.document, HTMLElement: window.HTMLElement, Document: window.Document,
    DocumentFragment: window.DocumentFragment, Node: window.Node, NodeFilter: window.NodeFilter,
    DOMRect: window.DOMRect, getComputedStyle: window.getComputedStyle.bind(window),
  });
  return window;
}

/** Lets the card's queued lookups and renders run to completion. */
export const settle = async () => { for (let i = 0; i < 5; i += 1) await new Promise((resolve) => setTimeout(resolve, 0)); };
