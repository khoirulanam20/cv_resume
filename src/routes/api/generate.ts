import { createFileRoute } from "@tanstack/react-router";
import { AIModelType, AI_MODEL_CONFIGS } from "@/config/ai";
import { formatGeminiErrorMessage, getGeminiModelInstance } from "@/lib/server/gemini";

export const Route = createFileRoute("/api/generate")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await request.json();
          const { apiKey, model, content, modelType, apiEndpoint, customInstructions } = body as {
            apiKey: string;
            model: string;
            content: string; // the prompt/instructions from user
            modelType: AIModelType;
            apiEndpoint?: string;
            customInstructions?: string;
          };

          const modelConfig = AI_MODEL_CONFIGS[modelType as AIModelType];
          if (!modelConfig) {
            throw new Error("Invalid model type");
          }

          let systemPrompt = `Kamu adalah seorang asisten pembuat CV (Resume) profesional tingkat ahli. Tugasmu adalah membuatkan konten deskripsi, poin-poin (bullet points), atau ringkasan yang menarik dan profesional berdasarkan instruksi yang diberikan oleh pengguna.
              
              Prinsip Pembuatan Konten:
              1. Gunakan bahasa yang profesional dan meyakinkan.
              2. Buat poin-poin pencapaian yang spesifik, sebaiknya menggunakan format STAR (Situation, Task, Action, Result) jika memungkinkan.
              3. Gunakan kata kerja aktif (Active Verbs) yang kuat.
              4. Berikan hasil langsung dalam format Markdown (gunakan bullet list '-' untuk daftar).
              5. JANGAN memberikan teks pengantar atau penutup (seperti "Berikut adalah hasilnya:"). Langsung berikan konten Markdown-nya saja.`;

          if (customInstructions?.trim()) {
            systemPrompt += `\n\nKonteks tambahan dari pengguna:\n${customInstructions.trim()}`;
          }

          if (modelType === "gemini") {
            const geminiModel = model || "gemini-flash-latest";
            const modelInstance = getGeminiModelInstance({
              apiKey,
              model: geminiModel,
              systemInstruction: systemPrompt,
              generationConfig: {
                temperature: 0.7,
              },
            });

            const encoder = new TextEncoder();

            const stream = new ReadableStream({
              async start(controller) {
                try {
                  const result = await modelInstance.generateContentStream(content);
                  for await (const chunk of result.stream) {
                    const chunkText = chunk.text();
                    if (chunkText) {
                      controller.enqueue(encoder.encode(chunkText));
                    }
                  }
                } catch (error) {
                  controller.error(error);
                  return;
                }
                controller.close();
              },
            });

            return new Response(stream, {
              headers: {
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache",
                Connection: "keep-alive"
              }
            });
          }

          const response = await fetch(modelConfig.url(apiEndpoint), {
            method: "POST",
            headers: modelConfig.headers(apiKey),
            body: JSON.stringify({
              model: modelConfig.requiresModelId ? model : modelConfig.defaultModel,
              messages: [
                {
                  role: "system",
                  content: systemPrompt
                },
                {
                  role: "user",
                  content // This is the user's prompt
                }
              ],
              stream: true
            })
          });

          const encoder = new TextEncoder();
          const stream = new ReadableStream({
            async start(controller) {
              if (!response.body) {
                controller.close();
                return;
              }

              const reader = response.body.getReader();
              const decoder = new TextDecoder();

              try {
                while (true) {
                  const { done, value } = await reader.read();
                  if (done) {
                    controller.close();
                    break;
                  }

                  const chunk = decoder.decode(value);
                  const lines = chunk.split("\n").filter((line) => line.trim() !== "");

                  for (const line of lines) {
                    if (line.includes("[DONE]")) continue;
                    if (!line.startsWith("data:")) continue;

                    try {
                      const data = JSON.parse(line.slice(5));
                      const deltaContent = data.choices[0]?.delta?.content;
                      if (deltaContent) {
                        controller.enqueue(encoder.encode(deltaContent));
                      }
                    } catch (e) {
                      console.error("Error parsing JSON:", e);
                    }
                  }
                }
              } catch (error) {
                console.error("Stream reading error:", error);
                controller.error(error);
              }
            }
          });

          return new Response(stream, {
            headers: {
              "Content-Type": "text/event-stream",
              "Cache-Control": "no-cache",
              Connection: "keep-alive"
            }
          });
        } catch (error) {
          console.error("Generate error:", error);
          return Response.json(
            { error: formatGeminiErrorMessage(error) },
            { status: 500 }
          );
        }
      }
    }
  }
});
