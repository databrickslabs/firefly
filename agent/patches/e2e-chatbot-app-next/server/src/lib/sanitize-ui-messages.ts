import type { ChatMessage } from '@chat-template/core';

const COMPLETED_TOOL_STATES = new Set([
  'output-available',
  'output-denied',
  'output-error',
]);

/**
 * Drop assistant tool parts that never received outputs. Orphan function_call
 * items break OpenAI replay (Edit / Regenerate) with "tool_call_ids did not
 * have response messages".
 */
export function sanitizeUiMessagesForModel(
  messages: ChatMessage[],
): ChatMessage[] {
  return messages
    .map((message) => {
      if (message.role !== 'assistant' || !message.parts?.length) {
        return message;
      }

      const parts = message.parts.filter((part) => {
        if (part.type !== 'dynamic-tool') {
          return true;
        }
        return COMPLETED_TOOL_STATES.has(part.state);
      });

      if (parts.length === message.parts.length) {
        return message;
      }

      return { ...message, parts };
    })
    .filter((message) => {
      if (message.role !== 'assistant') {
        return true;
      }
      if (!message.parts?.length) {
        return false;
      }
      return message.parts.some(
        (part) =>
          part.type === 'text' ||
          part.type === 'reasoning' ||
          part.type === 'dynamic-tool',
      );
    });
}
