import ReactMarkdown from "react-markdown";

type Props = {
  text: string;
  inverted?: boolean;
};

export function MarkdownMessage({ text, inverted = false }: Props) {
  return (
    <div className={`prose prose-sm max-w-none prose-p:my-2 prose-code:before:content-none prose-code:after:content-none ${inverted ? "prose-invert" : "dark:prose-invert"}`}>
      <ReactMarkdown>{text}</ReactMarkdown>
    </div>
  );
}
