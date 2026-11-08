import type Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { ModelClient } from "./run.js";

/**
 * ModelClient for the Anthropic Messages API. The SDK is an optional peer
 * dependency: nothing else in this package needs it.
 *
 * The system prompt carries a cache breakpoint, so repeated calls to one task
 * pay the cache-read rate for it. stop_reason is checked before the parsed
 * output, because a refusal comes back as HTTP 200 with empty or partial
 * content.
 */
export function anthropicClient(sdk: Anthropic): ModelClient {
  return {
    async complete({ model, system, messages, schema, maxTokens }) {
      const message = await sdk.messages.parse({
        model,
        max_tokens: maxTokens,
        system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
        output_config: { format: zodOutputFormat(schema) },
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
      });

      const usage = {
        inputTokens: message.usage.input_tokens ?? 0,
        outputTokens: message.usage.output_tokens ?? 0,
        cacheCreationInputTokens: message.usage.cache_creation_input_tokens ?? 0,
        cacheReadInputTokens: message.usage.cache_read_input_tokens ?? 0,
      };

      if (message.stop_reason === "refusal") {
        return { kind: "refusal", category: message.stop_details?.category ?? null, usage };
      }
      if (message.parsed_output === null || message.parsed_output === undefined) {
        return { kind: "unparsed", reason: `no parsed output (stop_reason: ${message.stop_reason})`, usage };
      }
      return { kind: "parsed", output: message.parsed_output, usage };
    },
  };
}
