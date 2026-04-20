export default {
  async fetch(request, env) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Content-Type": "application/json",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    if (request.method !== "POST") {
      return new Response(
        JSON.stringify({ error: { message: "Method not allowed." } }),
        {
          status: 405,
          headers: corsHeaders,
        },
      );
    }

    const apiKey = env.OPENAI_API_KEY;

    if (!apiKey) {
      return new Response(
        JSON.stringify({
          error: { message: "Missing OPENAI_API_KEY secret." },
        }),
        {
          status: 500,
          headers: corsHeaders,
        },
      );
    }

    let body;

    try {
      body = await request.json();
    } catch {
      return new Response(
        JSON.stringify({ error: { message: "Invalid JSON body." } }),
        {
          status: 400,
          headers: corsHeaders,
        },
      );
    }

    const messages = Array.isArray(body.messages) ? body.messages : [];

    if (messages.length === 0) {
      return new Response(
        JSON.stringify({ error: { message: "A messages array is required." } }),
        {
          status: 400,
          headers: corsHeaders,
        },
      );
    }

    const userMessage =
      messages
        .slice()
        .reverse()
        .find((message) => message.role === "user")?.content || "";

    const beautyKeywords = [
      "beauty",
      "skin",
      "skincare",
      "face",
      "cleanser",
      "moisturizer",
      "sunscreen",
      "spf",
      "acne",
      "serum",
      "hair",
      "haircare",
      "shampoo",
      "conditioner",
      "mask",
      "styling",
      "makeup",
      "foundation",
      "mascara",
      "lipstick",
      "fragrance",
      "perfume",
      "routine",
      "l'oreal",
      "loreal",
      "l'oréal",
      "cerave",
      "la roche-posay",
      "vichy",
      "maybelline",
      "lancome",
      "garnier",
      "kiehl's",
      "skinceuticals",
      "urban decay",
      "yves saint laurent",
      "redken",
      "kerastase",
    ];

    const isBeautyQuestion = beautyKeywords.some((keyword) =>
      userMessage.toLowerCase().includes(keyword),
    );

    if (!isBeautyQuestion) {
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content:
                  "I only answer beauty questions. Ask me about skincare, haircare, makeup, fragrance, routines, or L'Oréal product recommendations.",
              },
            },
          ],
        }),
        {
          status: 200,
          headers: corsHeaders,
        },
      );
    }

    const systemMessage = {
      role: "system",
      content:
        "You are a friendly L'Oréal beauty assistant. Only answer questions about beauty, including skincare, haircare, makeup, fragrance, routines, and L'Oréal product recommendations. If the user asks about anything else, refuse briefly and invite them to ask a beauty question. Keep answers clear, practical, and supportive.",
    };

    const requestMessages = messages.some(
      (message) => message.role === "system",
    )
      ? messages
      : [systemMessage, ...messages];

    const openAiResponse = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o",
          messages: requestMessages,
          max_completion_tokens: 300,
        }),
      },
    );

    const data = await openAiResponse.json();

    return new Response(JSON.stringify(data), {
      status: openAiResponse.status,
      headers: corsHeaders,
    });
  },
};
