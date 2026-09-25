import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import PartnerApp from "./PartnerApp";
import baseStyles from "./style.css?inline";
import analyticsStyles from "./analytics.css?inline";
import posStyles from "./partner-pos.css?inline";
import pagesStyles from "./partner-pages.css?inline";

const styles = [baseStyles, analyticsStyles, posStyles, pagesStyles].join("\n");

export default function PartnerWorkspace() {
  const hostRef = useRef<HTMLDivElement>(null);
  const [shadowRoot, setShadowRoot] = useState<ShadowRoot | null>(null);

  useEffect(() => {
    if (!hostRef.current) return;
    setShadowRoot(hostRef.current.shadowRoot || hostRef.current.attachShadow({ mode: "open" }));
  }, []);

  return (
    <div ref={hostRef} className="min-h-screen">
      {shadowRoot && createPortal(
        <>
          <style>{styles}</style>
          <PartnerApp />
        </>,
        shadowRoot,
      )}
    </div>
  );
}
