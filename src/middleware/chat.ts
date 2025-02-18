const chatMiddleware = async (request: Request & { content: any }) => {
  // set headers
  request.headers.set("Authorization", `Bearer ${process.env.GEMINI_API_KEY}`);
  request.headers.set("Content-Type", "application/json");

  let content;
  try {
    content = await request.json();
  } catch (error) {
    console.error("pares json error", error);
  }

  // set params
  request.content = {
    ...content,
    model: "gpt-4o-mini",
  };

  // get data from kv
  const row = (await MY_KV.get(`${content?.title}`)) as any;

  // or get data from kv by title & updateTime
  // const row = (await MY_KV.get(`${content?.title}-${content?.updateTime}`)) as any;

  // @ts-ignore
  request.dbData = row;

  /**
   * 检测缓存
  */
  if (row) {
    const messageList = row?.result?.split("\n");

    const message = messageList
      ?.map?.((data, index) => {
        const str = `${index === 0 ? "" : "\n"}data: ${data}`;

        if (index === messageList.length - 1) {
          return [
            '\ndata: {"id":"chatcmpl-abc123","object":"chat.chunk","created":1718786723,"model":"gpt-4o","choices":[{"delta":{"role":"assistant","content":"【该内容来自缓存】"},"finish_reason":"stop","index":0}]}',
            str,
          ];
        }
        return str;
      })
      ?.flat()
      ?.join("\n");

    return new Response(message, {
      status: 200,
      headers: new Headers({
        "Content-Type": "text/event-stream",
      }),
    });
  }
};

export default chatMiddleware;
