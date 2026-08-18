import { micromark } from "micromark";

const noRemoteImages = {
  disable: { null: ["labelStartImage"] },
};

export function renderSafeConversationMarkdown(source: string): string {
  return micromark(source, {
    allowDangerousHtml: false,
    allowDangerousProtocol: false,
    extensions: [noRemoteImages],
  });
}
