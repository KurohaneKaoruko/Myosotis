import { useEffect, useMemo, useRef, useState } from "react";
import { Marked } from "marked";
import DOMPurify from "dompurify";
import Prism from "prismjs";
import { t } from "../i18n";
// language components (order matters: deps first)
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-jsx";
import "prismjs/components/prism-tsx";
import "prismjs/components/prism-json";
import "prismjs/components/prism-python";
import "prismjs/components/prism-bash";
import "prismjs/components/prism-markdown";
import "prismjs/components/prism-sql";
import "prismjs/components/prism-yaml";

const marked = new Marked({ breaks: true, gfm: true, async: false });

// KaTeX chain is lazy: only conversations that actually contain math pay for it.
let katexInstance: Marked | null = null;
let katexLoading: Promise<Marked> | null = null;

function loadKatex(): Promise<Marked> {
  katexLoading ??= (async () => {
    const [{ default: markedKatex }] = await Promise.all([
      import("marked-katex-extension"),
      import("katex/dist/katex.min.css"),
    ]);
    katexInstance = new Marked({ breaks: true, gfm: true, async: false }).use(
      markedKatex({ throwOnError: false })
    );
    return katexInstance;
  })();
  return katexLoading;
}

/** Loose detection: a false positive only triggers the lazy load, never wrong rendering. */
function looksLikeMath(text: string): boolean {
  return /\$\$[^$]+?\$\$|\$[^\s$][^$\n]*?[^\s$]\$/.test(text);
}

function sanitize(raw: string): string {
  try {
    return DOMPurify.sanitize(raw, { ADD_ATTR: ["target"] });
  } catch {
    return DOMPurify.sanitize(raw);
  }
}

/**
 * marked-katex only renders $$...$$ when the delimiters can start a block.
 * Real model output often puts them mid-line ("text $$x$$ text"), so we
 * normalize them onto their own lines. Fenced code blocks and inline code
 * spans are never touched.
 */
function normalizeBlockMath(text: string): string {
  if (!text.includes("$$")) return text;
  let inFence = false;
  const lines = text.split("\n").map((line) => {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      return line;
    }
    if (inFence || !line.includes("$$")) return line;
    const masks: string[] = [];
    let l = line.replace(/`[^`]*`/g, (m) => {
      masks.push(m);
      return `\u0000${masks.length - 1}\u0000`;
    });
    l = l.replace(/\$\$([^$\n]+?)\$\$/g, (_, inner) => `\n\n$$${inner}$$\n\n`);
    return l.replace(/\u0000(\d+)\u0000/g, (_, i) => masks[Number(i)]);
  });
  return lines.join("\n");
}

function render(text: string, withMath: boolean): string {
  try {
    const parser = withMath && katexInstance ? katexInstance : marked;
    const src = withMath && katexInstance ? normalizeBlockMath(text) : text;
    return sanitize(parser.parse(src || "") as string);
  } catch {
    return sanitize(text ?? "");
  }
}

export default function Markdown({ text, highlight }: { text: string; highlight?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const needsMath = useMemo(() => looksLikeMath(text), [text]);
  const [mathReady, setMathReady] = useState(!!katexInstance);

  useEffect(() => {
    if (needsMath && !katexInstance) {
      loadKatex().then(() => setMathReady(true));
    }
  }, [needsMath]);

  const html = useMemo(() => render(text, needsMath && mathReady), [text, needsMath, mathReady]);

  // highlight the search term in the rendered text (skipping code blocks)
  useEffect(() => {
    const root = ref.current;
    const needle = highlight?.trim();
    if (!root || !needle) return;
    const lower = needle.toLowerCase();
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        if (parent.closest("code, pre, mark, script, style")) return NodeFilter.FILTER_REJECT;
        return node.textContent?.toLowerCase().includes(lower)
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_REJECT;
      },
    });
    const targets: Text[] = [];
    let n = walker.nextNode();
    while (n) {
      targets.push(n as Text);
      n = walker.nextNode();
    }
    for (const node of targets) {
      const text = node.textContent ?? "";
      const frag = document.createDocumentFragment();
      let i = 0;
      for (;;) {
        const at = text.toLowerCase().indexOf(lower, i);
        if (at < 0) {
          if (i < text.length) frag.appendChild(document.createTextNode(text.slice(i)));
          break;
        }
        if (at > i) frag.appendChild(document.createTextNode(text.slice(i, at)));
        const mark = document.createElement("mark");
        mark.className = "search-mark";
        mark.textContent = text.slice(at, at + needle.length);
        frag.appendChild(mark);
        i = at + needle.length;
      }
      node.parentNode?.replaceChild(frag, node);
    }
  }, [html, highlight]);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    // external links: new tab + safe opener (chat apps never navigate away)
    root.querySelectorAll("a[href]").forEach((a) => {
      a.setAttribute("target", "_blank");
      a.setAttribute("rel", "noopener noreferrer nofollow");
    });
    // syntax highlight + language tag + copy button
    root.querySelectorAll("pre").forEach((pre) => {
      const code = pre.querySelector("code");
      if (!code) return;
      const lang = /language-([\w-]+)/.exec(code.className)?.[1];
      if (lang) pre.setAttribute("data-lang", lang);
      try {
        Prism.highlightElement(code);
      } catch {}
      if (!pre.querySelector(".copy-code")) {
        const btn = document.createElement("button");
        btn.className = "copy-code";
        btn.textContent = t("copy");
        btn.onclick = async () => {
          try {
            await navigator.clipboard.writeText(code.textContent ?? "");
            btn.textContent = t("copied");
            setTimeout(() => (btn.textContent = t("copy")), 1500);
          } catch {}
        };
        pre.appendChild(btn);
      }
    });
  }, [html]);

  // @mentions in group chat: wrap "@Name" tokens in a highlight span.
  // Text-node walk so code blocks / existing markup are never touched.
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = (node as Text).parentElement;
        if (!parent || parent.closest("pre, code, .mention")) return NodeFilter.FILTER_REJECT;
        // cheap gate before the regex: only walk nodes that contain an @
        return (node as Text).textContent?.includes("@") ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      },
    });
    const hits: { node: Text; ranges: [number, number][] }[] = [];
    while (walker.nextNode()) {
      const node = walker.currentNode as Text;
      const text = node.textContent ?? "";
      const ranges: [number, number][] = [];
      const re = /@[\p{L}\p{N}_-]{1,24}/gu;
      let m: RegExpExecArray | null;
      while ((m = re.exec(text))) {
        // not a mention when the @ follows a word character (email@foo…)
        const prev = m.index > 0 ? text[m.index - 1] : "";
        if (prev && /[\p{L}\p{N}_@]/u.test(prev)) continue;
        ranges.push([m.index, m.index + m[0].length]);
      }
      if (ranges.length) hits.push({ node, ranges });
    }
    if (!hits.length) return;
    for (const { node, ranges } of hits) {
      const text = node.textContent ?? "";
      const frag = document.createDocumentFragment();
      let pos = 0;
      for (const [start, end] of ranges) {
        if (start > pos) frag.appendChild(document.createTextNode(text.slice(pos, start)));
        const span = document.createElement("span");
        span.className = "mention";
        span.textContent = text.slice(start, end);
        frag.appendChild(span);
        pos = end;
      }
      if (pos < text.length) frag.appendChild(document.createTextNode(text.slice(pos)));
      node.parentNode?.replaceChild(frag, node);
    }
  }, [html]);

  return <div ref={ref} className="md" dangerouslySetInnerHTML={{ __html: html }} />;
}
