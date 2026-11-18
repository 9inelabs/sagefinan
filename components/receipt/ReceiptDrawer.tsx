"use client";

import Link from "next/link";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Download, ExternalLink, X } from "lucide-react";
import { getReceipt, type ReceiptData } from "@/lib/receipts/actions";
import { parseReceiptParams, receiptQuery } from "@/lib/receipts/params";
import { LoadingBlock } from "@/components/ui/Spinner";
import { ReceiptView } from "./ReceiptView";
import { PrintButton } from "./PrintButton";
import { ReceiptReloadContext } from "./ReverseUnstockedLine";

// In-place receipts: any list row or link pointing at /reports/receipt?…
// opens that receipt in a slide-over drawer on top of the list instead of
// navigating away, so closing it returns to exactly the same place in the
// list. The link keeps its real href, so a ctrl/cmd-click or middle-click
// still opens the full receipt page in a new tab. Mounted once in AppShell.

const DrawerContext = createContext<{ open: (href: string) => void }>({
  open: () => {},
});

export function ReceiptDrawerProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [href, setHref] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");

  const close = useCallback(() => {
    setHref(null);
    setReceipt(null);
    setState("idle");
  }, []);

  const open = useCallback((target: string) => {
    const params = parseReceiptParams(new URL(target, "http://x").searchParams);
    if (!params) {
      window.location.href = target;
      return;
    }
    setHref(target);
    setReceipt(null);
    setState("loading");
    getReceipt(params)
      .then((r) => {
        setReceipt(r);
        setState(r ? "idle" : "error");
      })
      .catch(() => setState("error"));
  }, []);

  // Re-fetch the open receipt in place (after a line on it is reversed),
  // without the loading state flashing the whole receipt away.
  const reload = useCallback(() => {
    const params = href ? parseReceiptParams(new URL(href, "http://x").searchParams) : null;
    if (!params) return;
    getReceipt(params)
      .then((r) => r && setReceipt(r))
      .catch(() => {});
  }, [href]);

  useEffect(() => {
    if (!href) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    document.documentElement.classList.add("receipt-drawer-open");
    return () => {
      window.removeEventListener("keydown", onKey);
      document.documentElement.classList.remove("receipt-drawer-open");
    };
  }, [href, close]);

  const params = href
    ? parseReceiptParams(new URL(href, "http://x").searchParams)
    : null;
  const pdfHref = params ? `/reports/receipt/pdf?${receiptQuery(params)}` : "#";
  const pill =
    "inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full text-[12px] font-medium transition-[transform,background-color] active:scale-[0.97]";

  return (
    <DrawerContext.Provider value={{ open }}>
      {children}
      {href && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed inset-0 z-[70] receipt-drawer-root"
              role="dialog"
              aria-modal="true"
              aria-label="Receipt"
            >
              <div
                className="absolute inset-0 bg-frame/45 backdrop-blur-[2px] animate-fade-in receipt-drawer-backdrop"
                onClick={close}
              />
              <div className="receipt-drawer absolute inset-y-0 right-0 w-full max-w-[900px] bg-canvas shadow-lift flex flex-col animate-slide-in-right min-[900px]:rounded-l-[24px]">
                <div className="receipt-drawer-bar flex-none flex flex-wrap items-center justify-between gap-2 px-4 min-[700px]:px-6 py-3 border-b border-n200">
                  <button
                    type="button"
                    onClick={close}
                    className={`${pill} bg-white shadow-premium text-ink hover:bg-brand-hover`}
                    aria-label="Close receipt"
                  >
                    <X size={15} strokeWidth={1.9} />
                    Close
                  </button>
                  <div className="flex flex-wrap gap-2">
                    <Link
                      href={href}
                      className={`${pill} bg-white shadow-premium text-ink hover:bg-brand-hover max-[520px]:hidden`}
                    >
                      <ExternalLink size={14} strokeWidth={1.8} />
                      Full page
                    </Link>
                    <PrintButton
                      className={`${pill} bg-white shadow-premium text-ink hover:bg-brand-hover`}
                    />
                    <a
                      href={pdfHref}
                      className={`${pill} bg-ink text-white shadow-btn hover:bg-frame`}
                    >
                      <Download
                        size={14}
                        strokeWidth={1.9}
                        className="text-brand-bright"
                      />
                      PDF
                    </a>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto p-3 min-[700px]:p-6">
                  {state === "loading" ? (
                    <LoadingBlock label="Loading receipt…" />
                  ) : null}
                  {state === "error" ? (
                    <p className="text-center text-[13px] text-n600 py-16">
                      This receipt couldn&apos;t be loaded.
                    </p>
                  ) : null}
                  {receipt ? (
                    <div className="animate-rise">
                      <ReceiptReloadContext.Provider value={reload}>
                        <ReceiptView
                          receipt={receipt}
                          pdfHref={pdfHref}
                          embedded
                        />
                      </ReceiptReloadContext.Provider>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </DrawerContext.Provider>
  );
}

function shouldIntercept(e: React.MouseEvent) {
  return !(
    e.defaultPrevented ||
    e.button !== 0 ||
    e.metaKey ||
    e.ctrlKey ||
    e.shiftKey ||
    e.altKey
  );
}

// A link to a receipt that opens it in the drawer (plain clicks only).
export function ReceiptLink({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: React.ReactNode;
}) {
  const { open } = useContext(DrawerContext);
  return (
    <a
      href={href}
      className={className}
      onClick={(e) => {
        if (!shouldIntercept(e)) return;
        e.preventDefault();
        e.stopPropagation();
        open(href);
      }}
    >
      {children}
    </a>
  );
}

// A whole table row that opens its receipt — the cells stay server-rendered.
export function ReceiptRow({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: React.ReactNode;
}) {
  const { open } = useContext(DrawerContext);
  return (
    <tr
      className={`cursor-pointer ${className ?? ""}`}
      tabIndex={0}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("a,button")) return;
        open(href);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") open(href);
      }}
    >
      {children}
    </tr>
  );
}
