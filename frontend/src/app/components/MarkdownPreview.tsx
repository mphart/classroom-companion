import type { Components } from 'react-markdown';
import ReactMarkdown from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';

const components: Components = {
  h1: ({ children, ...props }) => (
    <h1 className="text-2xl font-semibold tracking-tight text-foreground mt-8 mb-4 first:mt-0" {...props}>
      {children}
    </h1>
  ),
  h2: ({ children, ...props }) => (
    <h2 className="text-xl font-semibold tracking-tight text-foreground mt-6 mb-3" {...props}>
      {children}
    </h2>
  ),
  h3: ({ children, ...props }) => (
    <h3 className="text-lg font-semibold text-foreground mt-5 mb-2" {...props}>
      {children}
    </h3>
  ),
  h4: ({ children, ...props }) => (
    <h4 className="text-base font-semibold text-foreground mt-4 mb-2" {...props}>
      {children}
    </h4>
  ),
  p: ({ children, ...props }) => (
    <p className="mb-4 leading-relaxed text-foreground last:mb-0" {...props}>
      {children}
    </p>
  ),
  ul: ({ children, ...props }) => (
    <ul className="list-disc pl-6 mb-4 space-y-2 text-foreground" {...props}>
      {children}
    </ul>
  ),
  ol: ({ children, ...props }) => (
    <ol className="list-decimal pl-6 mb-4 space-y-2 text-foreground" {...props}>
      {children}
    </ol>
  ),
  li: ({ children, ...props }) => (
    <li className="leading-relaxed" {...props}>
      {children}
    </li>
  ),
  strong: ({ children, ...props }) => (
    <strong className="font-semibold text-foreground" {...props}>
      {children}
    </strong>
  ),
  em: ({ children, ...props }) => (
    <em className="italic" {...props}>
      {children}
    </em>
  ),
  a: ({ children, href, ...props }) => (
    <a
      href={href}
      className="text-primary underline underline-offset-2 hover:opacity-90"
      target="_blank"
      rel="noopener noreferrer"
      {...props}
    >
      {children}
    </a>
  ),
  blockquote: ({ children, ...props }) => (
    <blockquote
      className="border-l-4 border-primary/35 pl-4 my-4 text-muted-foreground italic"
      {...props}
    >
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-8 border-border" />,
  table: ({ children, ...props }) => (
    <div className="overflow-x-auto mb-4 rounded-lg border border-border">
      <table className="w-full text-sm border-collapse" {...props}>
        {children}
      </table>
    </div>
  ),
  thead: ({ children, ...props }) => (
    <thead className="bg-muted/60 border-b border-border" {...props}>
      {children}
    </thead>
  ),
  tbody: ({ children, ...props }) => <tbody {...props}>{children}</tbody>,
  tr: ({ children, ...props }) => <tr className="border-b border-border last:border-0" {...props}>{children}</tr>,
  th: ({ children, ...props }) => (
    <th className="text-left font-semibold px-3 py-2 text-foreground" {...props}>
      {children}
    </th>
  ),
  td: ({ children, ...props }) => (
    <td className="px-3 py-2 align-top text-foreground" {...props}>
      {children}
    </td>
  ),
  code: ({ className, children, ...props }) => {
    const isFenced = Boolean(className?.includes('language-'));
    if (!isFenced) {
      return (
        <code
          className="rounded-md bg-muted px-1.5 py-0.5 text-[0.9em] font-mono text-foreground"
          {...props}
        >
          {children}
        </code>
      );
    }
    return (
      <code className={`${className ?? ''} font-mono text-sm`} {...props}>
        {children}
      </code>
    );
  },
  pre: ({ children, ...props }) => (
    <pre
      className="overflow-x-auto rounded-lg border border-border bg-muted/50 p-4 mb-4 text-sm leading-relaxed"
      {...props}
    >
      {children}
    </pre>
  ),
};

type MarkdownPreviewProps = {
  markdown: string;
  className?: string;
};

/**
 * Renders Markdown as readable HTML (headings, lists, tables, code blocks).
 * `remark-breaks` keeps single newlines in plain lecture notes readable.
 */
export function MarkdownPreview({ markdown, className = '' }: MarkdownPreviewProps) {
  return (
    <div className={`markdown-preview text-foreground ${className}`.trim()}>
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} components={components}>
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
