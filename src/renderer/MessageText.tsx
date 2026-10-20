import React, { useRef, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Icon } from "./ui";
import { copyText } from "./clipboard";

function CodeBlock({
  children,
  pl,
}: {
  children?: React.ReactNode;
  pl: boolean;
}) {
  const code = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false),
    [failed, setFailed] = useState(false);
  return (
    <div className="message-code">
      <div className="message-code-toolbar">
        <span>{pl ? "Kod" : "Code"}</span>
        <button
          onClick={() => {
            setFailed(false);
            void copyText(code.current?.textContent ?? "")
              .then(() => setCopied(true))
              .catch(() => setFailed(true));
          }}
        >
          <Icon name={copied ? "check" : "copy"} />
          {copied
            ? pl
              ? "Skopiowano"
              : "Copied"
            : pl
              ? "Kopiuj kod"
              : "Copy code"}
        </button>
      </div>
      {failed && (
        <span role="alert">
          {pl ? "Nie udało się skopiować kodu." : "Could not copy code."}
        </span>
      )}
      <pre ref={code}>{children}</pre>
    </div>
  );
}

/** Markdown is content: no raw HTML, remote images, embedded frames or commands. */
export function MessageText({ content, pl }: { content: string; pl: boolean }) {
  const [linkError, setLinkError] = useState(false);
  return (
    <div className="message-text">
      <Markdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={{
          pre: ({ children }) => <CodeBlock pl={pl}>{children}</CodeBlock>,
          a: ({ href, children }) => (
            <button
              className="message-link"
              type="button"
              title={href}
              disabled={!href || !/^https?:\/\//i.test(href)}
              onClick={() => {
                if (href)
                  void window.agenting
                    ?.openExternalLink?.({ url: href })
                    .catch(() => setLinkError(true));
              }}
            >
              {children}
              <Icon name="arrow" />
            </button>
          ),
          img: ({ alt }) => (
            <span className="message-image-label">
              {pl ? "Obraz" : "Image"}:{" "}
              {alt || (pl ? "bez opisu" : "no description")}
            </span>
          ),
          table: ({ children }) => (
            <div className="message-table">
              <table>{children}</table>
            </div>
          ),
        }}
      >
        {content}
      </Markdown>
      {linkError && (
        <span role="alert">
          {pl
            ? "Nie udało się otworzyć odnośnika."
            : "Could not open the link."}
        </span>
      )}
    </div>
  );
}
