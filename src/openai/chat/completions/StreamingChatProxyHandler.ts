import { generateContent } from "../../../gemini-api-client/gemini-api-client.ts"
import { resultHelper } from "../../../gemini-api-client/response-helper.ts"
import type { FunctionCall } from "../../../gemini-api-client/types.ts"
import type { Logger } from "../../../log.ts"
import type { OpenAI } from "../../../types.ts"
import { type ApiParam, genModel } from "../../../utils.ts"

export function streamingChatProxyHandler(
  req: OpenAI.Chat.ChatCompletionCreateParams,
  apiParam: ApiParam,
  log?: Logger,
  rawReq?: any
): Response {
  const [model, geminiReq] = genModel(req)
  log?.debug("streamGenerateContent request", req)
  return sseResponse(
    (async function* () {
      try {
        for await (const it of generateContent("streamGenerateContent", apiParam, model, geminiReq)) {
          log?.debug("streamGenerateContent resp", it)
          const data = resultHelper(it)
          yield genStreamResp({ model: req.model, content: data, stop: false })
        }
      } catch (error) {
        yield genStreamResp({
          model: req.model,
          content: error?.message ?? error.toString(),
          stop: true,
        })
      }
      yield genStreamResp({ model: req.model, content: "", stop: true })
      yield "[DONE]"
      return undefined
    })(),
    rawReq,
  );
}

function genStreamResp({
  model,
  content,
  stop,
}: {
  model: string
  content: string | FunctionCall
  stop: boolean
}): OpenAI.Chat.ChatCompletionChunk {
  if (typeof content === "string") {
    return {
      id: "chatcmpl-abc123",
      object: "chat.completion.chunk",
      created: Math.floor(Date.now() / 1000),
      model: model,
      choices: [
        {
          delta: { role: "assistant", content },
          finish_reason: stop ? "stop" : null,
          index: 0,
        },
      ],
    } satisfies OpenAI.Chat.ChatCompletionChunk
  }

  return {
    id: "chatcmpl-abc123",
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model: model,
    choices: [
      {
        delta: { role: "assistant", function_call: content },
        finish_reason: stop ? "function_call" : null,
        index: 0,
      },
    ],
  } satisfies OpenAI.Chat.ChatCompletionChunk
}

const encoder = new TextEncoder()

function sseResponse(
  dataStream: AsyncGenerator<
    string | OpenAI.Chat.ChatCompletionChunk,
    undefined
  >,
  request?: any
): Response {
  let results = [];

  const s = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { value, done } = await dataStream.next()
      if (done) {
        if (request) {
          const value = {
            // id: request?.dbData?.id,
            result: results.join('\n'),
            title: request?.content?.title,
            updateTime: request?.content?.updateTime,
            // lastUpdateTime: Date.now(),
          }
          await MY_KV.put(`${request?.content?.title}`, value)
          // await MY_KV.put(`${request?.content?.title}-${request?.content?.updateTime}`, value)
        }
        controller.close();
      } else {
        const data = typeof value === "string" ? value : JSON.stringify(value)
        results.push(data)
        controller.enqueue(encoder.encode(toSseMsg({ data })))
      }
    },
  })

  const response = new Response(s, {
    status: 200,
    headers: new Headers({
      "Content-Type": "text/event-stream",
    }),
  })

  return response
}

export function toSseMsg({ event, data, id }: SseEvent) {
  let result = `data: ${data}\n`
  if (event) {
    result += `event: ${event ?? ""}\n`
  }
  if (id) {
    result += `id: ${id ?? ""}\n`
  }
  return `${result}\n`
}

export interface SseEvent {
  event?: string
  id?: string
  data: string
}
