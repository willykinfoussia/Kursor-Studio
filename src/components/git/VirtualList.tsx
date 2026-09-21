import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

export function VirtualList<T>({
  items,
  itemHeight,
  renderItem,
  overscan = 8,
  className,
}: {
  items: T[];
  itemHeight: number;
  renderItem: (item: T, index: number) => ReactNode;
  overscan?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [height, setHeight] = useState(480);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const update = () => setHeight(node.clientHeight);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const { start, end, offset } = useMemo(() => {
    const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
    const visible = Math.ceil(height / itemHeight) + overscan * 2;
    const endIndex = Math.min(items.length, startIndex + visible);
    return { start: startIndex, end: endIndex, offset: startIndex * itemHeight };
  }, [height, itemHeight, items.length, overscan, scrollTop]);

  return (
    <div
      ref={ref}
      className={className}
      onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
      style={{ overflow: "auto", height: "100%" }}
    >
      <div style={{ height: items.length * itemHeight, position: "relative" }}>
        <div style={{ transform: `translateY(${offset}px)` }}>
          {items.slice(start, end).map((item, index) => renderItem(item, start + index))}
        </div>
      </div>
    </div>
  );
}
