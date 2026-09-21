import type { TableHTMLAttributes } from "react";

export function MarkdownTable({ children, ...props }: TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="md-table-wrap">
      <table className="md-table" {...props}>{children}</table>
    </div>
  );
}
