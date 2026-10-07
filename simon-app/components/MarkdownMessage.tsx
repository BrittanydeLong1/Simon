import ReactMarkdown from "react-markdown";

type Props = {
  text: string;
};

export function MarkdownMessage({ text }: Props) {
  return (
    <div className="prose prose-sm max-w-none dark:prose-invert prose-p:my-2 prose-code:before:content-none prose-code:after:content-none">
      <ReactMarkdown>{text}</ReactMarkdown>
    </div>
  );
}
