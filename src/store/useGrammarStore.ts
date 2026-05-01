import { create } from "zustand";
import { toast } from "sonner";
import Mark from "mark.js";
import { useAIConfigStore } from "@/store/useAIConfigStore";
import { AI_MODEL_CONFIGS } from "@/config/ai";
import { cn } from "@/lib/utils";

export interface GrammarError {
  context: string;
  text: string;
  suggestion: string;
  reason: string;
  type: "spelling" | "grammar";
}

interface GrammarStore {
  isChecking: boolean;
  errors: GrammarError[];
  selectedErrorIndex: number | null;
  highlightKey: number;
  setErrors: (errors: GrammarError[]) => void;
  setIsChecking: (isChecking: boolean) => void;
  setSelectedErrorIndex: (index: number | null) => void;
  incrementHighlightKey: () => void;
  checkGrammar: (text: string) => Promise<void>;
  clearErrors: () => void;
  selectError: (index: number) => void;
  dismissError: (index: number) => void;
}

const markSingleError = (
  marker: Mark,
  error: GrammarError,
  options?: { selected?: boolean; activeIndex?: number }
) => {
  const keyword = (error.text || "").trim();
  if (!keyword) return;

  let hasMarked = false;
  marker.mark(keyword, {
    separateWordSearch: false,
    acrossElements: true,
    className: cn(
      "grammar-error",
      error.type,
      options?.selected && options?.activeIndex !== undefined && `active-${options.activeIndex}`
    ),
    filter: () => {
      if (hasMarked) return false;
      hasMarked = true;
      return true;
    }
  });
};

const getPreviewScrollContainer = (element: HTMLElement): HTMLElement | null => {
  const containers = Array.from(
    document.querySelectorAll<HTMLElement>('[data-preview-scroll-container="true"]')
  );

  for (const container of containers) {
    if (container.contains(element)) {
      return container;
    }
  }

  let current: HTMLElement | null = element.parentElement;
  while (current) {
    const style = window.getComputedStyle(current);
    const canScrollY = /(auto|scroll)/.test(style.overflowY);
    if (canScrollY && current.scrollHeight > current.clientHeight) {
      return current;
    }
    current = current.parentElement;
  }

  return null;
};

export const useGrammarStore = create<GrammarStore>((set, get) => ({
  isChecking: false,
  errors: [],
  selectedErrorIndex: null,
  highlightKey: 0,

  setErrors: (errors) => set({ errors }),
  setIsChecking: (isChecking) => set({ isChecking }),
  setSelectedErrorIndex: (selectedErrorIndex) => set({ selectedErrorIndex }),
  incrementHighlightKey: () =>
    set((state) => ({ highlightKey: state.highlightKey + 1 })),

  checkGrammar: async (text: string) => {
    const {
      selectedModel,
      doubaoApiKey,
      doubaoModelId,
      deepseekApiKey,
      deepseekModelId,
      openaiApiKey,
      openaiModelId,
      openaiApiEndpoint,
      geminiApiKey,
      geminiModelId
    } = useAIConfigStore.getState();

    const config = AI_MODEL_CONFIGS[selectedModel];
    const systemPrompt = `Anda adalah asisten pemeriksaan resume profesional. Tugas Anda adalah **hanya** menemukan **kesalahan ejaan** dan **kesalahan tanda baca** dalam resume.

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
    const apiKey =
      selectedModel === "doubao"
        ? doubaoApiKey
        : selectedModel === "openai"
          ? openaiApiKey
          : selectedModel === "gemini"
            ? geminiApiKey
            : deepseekApiKey;
    const modelId =
      selectedModel === "doubao"
        ? doubaoModelId
        : selectedModel === "openai"
          ? openaiModelId
          : selectedModel === "gemini"
            ? geminiModelId
            : deepseekModelId;

    set({ isChecking: true });

    try {
      const response = await fetch("/api/grammar", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          content: text,
          systemPrompt,
          apiKey,
          model: config.requiresModelId ? modelId : config.defaultModel,
          modelType: selectedModel,
          apiEndpoint: selectedModel === "openai" ? openaiApiEndpoint : undefined,
        }),
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }

      const data = await response.json();

      if (data.error) {
        toast.error(data.error.message);
        throw new Error(data.error.message);
      }

      if (data.error?.code === "AuthenticationError") {
        toast.error("ApiKey atau ModelId tidak benar");
        throw new Error(data.error.message);
      }

      const aiResponse = data.choices[0]?.message?.content;

      try {
        const grammarErrors = JSON.parse(aiResponse);
        if (grammarErrors.errors.length === 0) {
          set({ errors: [] });
          toast.success("Tidak ada kesalahan tata bahasa");
          return;
        }
        set({ errors: grammarErrors.errors });

        const preview = document.getElementById("resume-preview");
        if (preview) {
          const marker = new Mark(preview);
          marker.unmark();
          grammarErrors.errors.forEach((error: GrammarError) => {
            // 仅标注错误片段，避免整句/全局模糊匹配造成误高亮
            markSingleError(marker, error);
          });
        }
      } catch (parseError) {
        toast.error(`Gagal mengurai respons AI: ${parseError}`);
        set({ errors: [] });
      }
    } catch (error) {
      set({ errors: [] });
    } finally {
      set({ isChecking: false });
    }
  },

  clearErrors: () => {
    const preview = document.getElementById("resume-preview");
    if (preview) {
      const marker = new Mark(preview);
      marker.unmark();
    }
    set({ errors: [], selectedErrorIndex: null });
  },

  selectError: (index: number) => {
    const { errors } = get();
    const error = errors[index];
    if (!error) return;

    set({ selectedErrorIndex: index });

    const preview = document.getElementById("resume-preview");
    if (!preview) return;

    const marker = new Mark(preview);
    marker.unmark();

    errors.forEach((err, i) => {
      markSingleError(marker, err, {
        selected: i === index,
        activeIndex: index
      });
    });

    const marks = preview.querySelectorAll("mark");
    const selectedMark = marks[index];
    if (selectedMark) {
      const scrollContainer = getPreviewScrollContainer(selectedMark as HTMLElement);

      if (scrollContainer) {
        const containerRect = scrollContainer.getBoundingClientRect();
        const markRect = selectedMark.getBoundingClientRect();
        const currentTop = scrollContainer.scrollTop;
        const nextTop =
          currentTop +
          (markRect.top - containerRect.top) -
          scrollContainer.clientHeight / 2 +
          markRect.height / 2;
        const maxTop = Math.max(
          0,
          scrollContainer.scrollHeight - scrollContainer.clientHeight
        );

        scrollContainer.scrollTo({
          top: Math.max(0, Math.min(nextTop, maxTop)),
          behavior: "smooth"
        });
      }
    }
  },
  dismissError: (index: number) => {
    set((state) => {
      const newErrors = [...state.errors];
      newErrors.splice(index, 1);
      
      const preview = document.getElementById("resume-preview");
      if (preview) {
        // 重新标记剩余错误
        const marker = new Mark(preview);
        marker.unmark();
        newErrors.forEach((error, i) => {
          markSingleError(marker, error, {
            selected: state.selectedErrorIndex === i,
            activeIndex: state.selectedErrorIndex ?? undefined
          });
        });
      }

      return { errors: newErrors, selectedErrorIndex: null };
    });
  },
}));
