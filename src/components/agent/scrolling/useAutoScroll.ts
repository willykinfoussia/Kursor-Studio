import { useCallback, useEffect, useRef, useState } from "react";

const BOTTOM_THRESHOLD = 80;

function scrollElementTo(node: HTMLElement, top: number, smooth: boolean) {
  if (typeof node.scrollTo === "function") {
    node.scrollTo({ top, behavior: smooth ? "smooth" : "auto" });
    return;
  }
  node.scrollTop = top;
}

export function useAutoScroll(deps: unknown[]) {
  const ref = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const [showNewActivity, setShowNewActivity] = useState(false);

  const onScroll = useCallback(() => {
    const node = ref.current;
    if (!node) return;
    const distance = node.scrollHeight - node.scrollTop - node.clientHeight;
    const atBottom = distance < BOTTOM_THRESHOLD;
    stickToBottom.current = atBottom;
    if (atBottom) setShowNewActivity(false);
  }, []);

  const scrollToBottom = useCallback((smooth = true) => {
    const node = ref.current;
    if (!node) return;
    scrollElementTo(node, node.scrollHeight, smooth);
    stickToBottom.current = true;
    setShowNewActivity(false);
  }, []);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (stickToBottom.current) {
      scrollElementTo(node, node.scrollHeight, true);
      setShowNewActivity(false);
    } else {
      setShowNewActivity(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: scroll on listed deps
  }, deps);

  return { ref, onScroll, showNewActivity, scrollToBottom, stickToBottom };
}
