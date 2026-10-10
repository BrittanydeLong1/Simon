export function streamText(fullText: string, onChunk: (text: string) => void): Promise<void> {
  // Keep every character, including indentation, line breaks, and trailing spaces.
  const tokens = fullText.match(/\s*\S+\s*|\s+/gu) ?? [];
  if (!tokens.length) {
    onChunk(fullText);
    return Promise.resolve();
  }

  return new Promise<void>((resolve) => {
    let index = 0;
    let partial = "";
    const timer = setInterval(() => {
      partial += tokens[index++];
      onChunk(partial);
      if (index === tokens.length) {
        clearInterval(timer);
        resolve();
      }
    }, 22);
  });
}
