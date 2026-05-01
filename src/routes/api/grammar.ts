import { createFileRoute } from "@tanstack/react-router";
import { AIModelType, AI_MODEL_CONFIGS } from "@/config/ai";
import { formatGeminiErrorMessage, getGeminiModelInstance } from "@/lib/server/gemini";

export const Route = createFileRoute("/api/grammar")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await request.json();
          const { apiKey, model, content, modelType, apiEndpoint, systemPrompt: clientSystemPrompt } = body as {
            apiKey: string;
            model: string;
            content: string;
            modelType: AIModelType;
            apiEndpoint?: string;
            systemPrompt?: string;
          };

          const modelConfig = AI_MODEL_CONFIGS[modelType as AIModelType];
          if (!modelConfig) {
            throw new Error("Invalid model type");
          }

          const systemPrompt = clientSystemPrompt || `Anda adalah asisten pemeriksaan resume profesional. Tugas Anda adalah **hanya** menemukan **kesalahan ejaan** dan **kesalahan tanda baca** dalam resume.

            **Tegas dilarang**:
            1. ❌ **Dilarang** memberikan saran gaya, nada, pemolesan, atau penulisan ulang. Jika kalimat secara tata bahasa benar (walaupun membacanya kurang indah), **jangan pernah** melaporkan kesalahan.
            2. ❌ **Dilarang** melaporkan "tidak ada kesalahan yang jelas" atau informasi serupa. Jika tidak ditemukan kesalahan ejaan atau tanda baca, array "errors" harus kosong.
            3. ❌ **Dilarang** melakukan koreksi berlebihan pada istilah teknis, kecuali berdasarkan konteks sangat yakin itu adalah kesalahan penulisan.

            **Hanya periksa dua kategori kesalahan berikut**:
            1. ✅ **Kesalahan Ejaan**: Contoh: menulis "sebagi" bukan "sebagai", atau kesalahan ketik lainnya.
            2. ✅ **Kesalahan Tanda Baca yang Serius**: Hanya laporkan tanda baca ganda (seperti ",,") atau posisi simbol yang salah total.

            **Pengecualian Penting (Jangan pernah melaporkan kesalahan)**:
            - ❌ **Abaikan campuran tanda baca**: Dalam resume teknis, penggunaan tanda baca Inggris (seperti koma Inggris , atau titik Inggris .) adalah gaya yang **sepenuhnya diterima**. **Jangan pernah** melaporkan "kesalahan" semacam ini.
            - ❌ **Abaikan penggunaan spasi**: Jangan laporkan kehilangan atau kelebihan spasi.

            Kembalikan format JSON:
            {
              "errors": [
                {
                  "context": "Kalimat lengkap yang mengandung kesalahan (harus teks asli)",
                  "text": "Bagian kesalahan spesifik (harus string yang benar-benar ada di teks asli)",
                  "suggestion": "Hanya berisi kata atau fragmen setelah diperbaiki (**jangan** kembalikan seluruh kalimat, kecuali seluruh kalimat itu salah)",
                  "reason": "Ejaan / Kesalahan Tanda Baca",
                  "type": "spelling"
                }
              ]
            }

            Sekali lagi ditekankan: **Hanya cari kesalahan ejaan dan tanda baca, jangan lakukan pemolesan!**`;

          if (modelType === "gemini") {
            const geminiModel = model || "gemini-flash-latest";
            const modelInstance = getGeminiModelInstance({
              apiKey,
              model: geminiModel,
              systemInstruction: systemPrompt,
              generationConfig: {
                temperature: 0,
                responseMimeType: "application/json",
              },
            });

            const result = await modelInstance.generateContent(content);
            const text = result.response.text() || "";

            return Response.json({
              choices: [
                {
                  message: {
                    content: text,
                  },
                },
              ],
            });
          }

          const response = await fetch(modelConfig.url(apiEndpoint), {
            method: "POST",
            headers: modelConfig.headers(apiKey),
            body: JSON.stringify({
              model: modelConfig.requiresModelId ? model : modelConfig.defaultModel,
              response_format: {
                type: "json_object"
              },
              messages: [
                {
                  role: "system",
                  content: systemPrompt
                },
                {
                  role: "user",
                  content
                }
              ]
            })
          });

          const data = await response.json();
          return Response.json(data);
        } catch (error) {
          console.error("Error in grammar check:", error);
          return Response.json(
            { error: formatGeminiErrorMessage(error) },
            { status: 500 }
          );
        }
      }
    }
  }
});
