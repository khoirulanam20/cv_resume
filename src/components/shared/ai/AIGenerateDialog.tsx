import { useEffect, useState, useRef } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "@/i18n/compat/client";
import { Streamdown } from "streamdown";
import "streamdown/styles.css";
import { createMarkdownExit } from "markdown-exit";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useAIConfigStore } from "@/store/useAIConfigStore";
import { AI_MODEL_CONFIGS } from "@/config/ai";
import { cn } from "@/lib/utils";

interface AIGenerateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApply: (content: string) => void;
}

const md = createMarkdownExit({
  html: true,
  breaks: true,
  linkify: false,
});

export default function AIGenerateDialog({
  open,
  onOpenChange,
  onApply
}: AIGenerateDialogProps) {
  const t = useTranslations("aiGenerateDialog");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedContent, setGeneratedContent] = useState("");
  const [prompt, setPrompt] = useState("");
  const [customInstructions, setCustomInstructions] = useState("");
  
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
    geminiModelId,
    isConfigured
  } = useAIConfigStore();
  const abortControllerRef = useRef<AbortController | null>(null);
  const generatedContentRef = useRef<HTMLDivElement>(null);

  const handleGenerate = async () => {
    try {
      if (!isConfigured()) {
        toast.error(t("error.configRequired"));
        onOpenChange(false);
        return;
      }
      
      if (!prompt.trim()) {
        toast.error(t("error.promptRequired"));
        return;
      }

      setIsGenerating(true);
      setGeneratedContent("");

      abortControllerRef.current = new AbortController();

      const config = AI_MODEL_CONFIGS[selectedModel];
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

      const response = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          content: prompt.trim(),
          apiKey,
          apiEndpoint: selectedModel === "openai" ? openaiApiEndpoint : undefined,
          model: config.requiresModelId ? modelId : config.defaultModel,
          modelType: selectedModel,
          customInstructions: customInstructions.trim() || undefined
        }),
        signal: abortControllerRef.current.signal
      });

      if (!response.ok) {
        throw new Error("Failed to generate content");
      }

      if (!response.body) {
        throw new Error("No response body");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        setGeneratedContent((prev) => prev + chunk);
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        console.log("Generate aborted");
        return;
      }
      console.error("Generate error:", error);
      toast.error(t("error.generateFailed"));
    } finally {
      setIsGenerating(false);
    }
  };

  useEffect(() => {
    if (generatedContent && generatedContentRef.current) {
      const container = generatedContentRef.current;
      requestAnimationFrame(() => {
        container.scrollTop = container.scrollHeight;
      });
    }
  }, [generatedContent]);

  useEffect(() => {
    if (!open) {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      setGeneratedContent("");
      setPrompt("");
      setCustomInstructions("");
    }
  }, [open]);

  const handleClose = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    onOpenChange(false);
    setGeneratedContent("");
  };

  const handleApply = () => {
    const htmlContent = md.render(generatedContent);
    onApply(htmlContent);
    handleClose();
    toast.success(t("error.applied"));
  };

  const handleOpenChange = (open: boolean) => {
    if (!open && !isGenerating) {
      onOpenChange(open);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className={cn(
          "sm:max-w-[700px]",
          "bg-white dark:bg-neutral-900",
          "border-neutral-200 dark:border-neutral-800",
          "rounded-2xl shadow-2xl dark:shadow-none"
        )}
        onPointerDownOutside={(e) => {
          e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          e.preventDefault();
        }}
        onInteractOutside={(e) => {
          e.preventDefault();
        }}
      >
        <DialogHeader className="pb-6">
          <DialogTitle
            className={cn(
              "flex items-center gap-2 text-2xl",
              "text-neutral-800 dark:text-neutral-100"
            )}
          >
            <Sparkles
              className={cn(
                "h-6 w-6 text-primary animate-pulse",
                "dark:text-primary-400"
              )}
            />
            {t("title")}
          </DialogTitle>
          <DialogDescription
            className={cn(
              "text-base",
              "text-neutral-600 dark:text-neutral-400"
            )}
          >
            {isGenerating
              ? t("description.generating")
              : generatedContent
                ? t("description.finished")
                : t("description.ready")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label
              htmlFor="prompt-input"
              className={cn(
                "text-sm font-medium",
                "text-neutral-600 dark:text-neutral-400"
              )}
            >
              {t("prompt")}
            </Label>
            <Textarea
              id="prompt-input"
              placeholder={t("promptPlaceholder")}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              disabled={isGenerating}
              rows={3}
              className={cn(
                "resize-none rounded-xl border",
                "bg-neutral-50 dark:bg-neutral-800/50",
                "border-neutral-200 dark:border-neutral-800",
                "text-neutral-700 dark:text-neutral-300",
                "placeholder:text-neutral-400 dark:placeholder:text-neutral-500"
              )}
            />
          </div>
          
          <div className="space-y-2">
            <Label
              htmlFor="custom-instructions"
              className={cn(
                "text-sm font-medium text-muted-foreground"
              )}
            >
              {t("customInstructions")}
            </Label>
            <Input
              id="custom-instructions"
              placeholder={t("customInstructionsPlaceholder")}
              value={customInstructions}
              onChange={(e) => setCustomInstructions(e.target.value)}
              disabled={isGenerating}
              className={cn(
                "rounded-lg border",
                "bg-neutral-50 dark:bg-neutral-800/50"
              )}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2 px-1">
              <div
                className={cn(
                  "w-1.5 h-1.5 rounded-full",
                  "bg-primary",
                  isGenerating ? "animate-pulse" : ""
                )}
              ></div>
              <span
                className={cn(
                  "text-sm font-medium",
                  "text-primary dark:text-primary-400"
                )}
              >
                {t("content.generated")}
              </span>
            </div>
            <div
              ref={generatedContentRef}
              className={cn(
                "relative rounded-xl border",
                "bg-primary/[0.03] dark:bg-primary/[0.1]",
                "border-primary/20 dark:border-primary/30",
                "p-6 h-[250px] overflow-auto shadow-sm scroll-smooth"
              )}
            >
              <Streamdown
                animated
                isAnimating={isGenerating}
                className={cn(
                  "prose dark:prose-invert max-w-none",
                  "text-neutral-800 dark:text-neutral-200"
                )}
              >
                {generatedContent}
              </Streamdown>
            </div>
          </div>
        </div>

        <DialogFooter className="mt-6 flex items-center gap-3">
          <Button
            onClick={handleGenerate}
            disabled={isGenerating || !prompt.trim()}
            className="flex-1 bg-gradient-to-r from-[#10B981] to-[#3B82F6] hover:opacity-90 text-white border-none h-11 shadow-lg shadow-emerald-500/20"
          >
            {isGenerating ? (
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t("button.generating")}
              </div>
            ) : !generatedContent ? (
              t("button.start")
            ) : (
              t("button.regenerate")
            )}
          </Button>

          <Button
            onClick={handleApply}
            disabled={!generatedContent || isGenerating}
            className="flex-1 bg-primary hover:bg-primary/90 text-white h-11 shadow-lg shadow-primary/20"
          >
            {t("button.apply")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
