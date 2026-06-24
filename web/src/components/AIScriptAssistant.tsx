import { useEffect, useMemo, useRef, useState } from "react";
import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  DialogTrigger,
  Field,
  MessageBar,
  MessageBarBody,
  Select,
  Text,
  Textarea
} from "@fluentui/react-components";
import { EditRegular } from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";
import {
  loadAIAuthStatus,
  loadAIOptions,
  startAIAuth,
  suggestScriptWithAI,
  type AIAuthStart,
  type AIAuthStatus,
  type AIOptions,
  type AIScriptKind,
  type AIScriptSuggestion
} from "../api";

type AIScriptAssistantProps = {
  canWrite: boolean;
  kind: AIScriptKind;
  language?: string;
  resourceID?: number;
  script: string;
  onApply: (script: string) => void;
};

export function AIScriptAssistant({
  canWrite,
  kind,
  language,
  resourceID,
  script,
  onApply
}: AIScriptAssistantProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<AIAuthStatus | null>(null);
  const [options, setOptions] = useState<AIOptions>({ models: [] });
  const [model, setModel] = useState("");
  const [reasoningEffort, setReasoningEffort] = useState("");
  const [login, setLogin] = useState<AIAuthStart | null>(null);
  const [instruction, setInstruction] = useState("");
  const [suggestion, setSuggestion] = useState<AIScriptSuggestion | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const instructionRef = useRef<HTMLTextAreaElement | null>(null);
  const selectedModel = useMemo(
    () => options.models.find((item) => item.id === model),
    [model, options.models]
  );
  const reasoningEfforts = selectedModel?.supported_reasoning_efforts ?? [];

  useEffect(() => {
    if (!open) {
      return;
    }
    const focusID = window.setTimeout(() => instructionRef.current?.focus(), 0);
    void refreshStatus(true);
    void refreshOptions();
    return () => window.clearTimeout(focusID);
  }, [open]);

  useEffect(() => {
    if (options.models.length === 0 || model) {
      return;
    }
    setModel(options.models.find((item) => item.is_default)?.id ?? options.models[0]?.id ?? "");
  }, [model, options.models]);

  useEffect(() => {
    if (!selectedModel) {
      setReasoningEffort("");
      return;
    }
    const efforts = selectedModel.supported_reasoning_efforts ?? [];
    if (efforts.length === 0) {
      setReasoningEffort("");
      return;
    }
    if (reasoningEffort && efforts.some((item) => item.reasoning_effort === reasoningEffort)) {
      return;
    }
    setReasoningEffort(selectedModel.default_reasoning_effort || efforts[0]?.reasoning_effort || "");
  }, [reasoningEffort, selectedModel]);

  async function refreshStatus(restoreInstructionFocus = false) {
    setBusy(true);
    setError("");
    try {
      setStatus(await loadAIAuthStatus());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      if (restoreInstructionFocus) {
        window.requestAnimationFrame(() => instructionRef.current?.focus());
      }
    }
  }

  async function refreshOptions() {
    try {
      setOptions(await loadAIOptions());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function startLogin() {
    setBusy(true);
    setError("");
    try {
      const nextLogin = await startAIAuth();
      setLogin(nextLogin);
      if (nextLogin.verification_url || nextLogin.auth_url) {
        window.open(nextLogin.verification_url ?? nextLogin.auth_url, "_blank", "noopener,noreferrer");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function generateSuggestion() {
    if (!resourceID) {
      setError(t("ai.existingResourceRequired"));
      return;
    }
    setBusy(true);
    setError("");
    setSuggestion(null);
    try {
      setSuggestion(
        await suggestScriptWithAI({
          kind,
          resource_id: resourceID,
          instruction,
          script,
          language,
          model: model || undefined,
          reasoning_effort: reasoningEffort || undefined
        })
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  function applySuggestion() {
    if (!suggestion?.content) {
      return;
    }
    onApply(suggestion.content);
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={(_, data) => setOpen(data.open)}>
      <DialogTrigger disableButtonEnhancement>
        <Button icon={<EditRegular />} disabled={!canWrite || !resourceID}>
          {t("ai.button")}
        </Button>
      </DialogTrigger>
      <DialogSurface className="ai-assistant-dialog">
        <DialogBody>
          <DialogTitle>{t("ai.title")}</DialogTitle>
          <DialogContent className="ai-assistant-content">
            {error && (
              <MessageBar intent="error">
                <MessageBarBody>{error}</MessageBarBody>
              </MessageBar>
            )}
            {busy && (
              <MessageBar intent="info">
                <MessageBarBody>{suggestion ? t("ai.applying") : t("ai.working")}</MessageBarBody>
              </MessageBar>
            )}
            <div className="ai-auth-row">
              <Text size={200}>
                {status?.authenticated
                  ? t("ai.authenticated", { account: status.account || t("common.none") })
                  : t("ai.notAuthenticated")}
              </Text>
              <div className="ai-auth-actions">
                <Button onClick={() => refreshStatus()} disabled={busy}>
                  {t("common.refresh")}
                </Button>
                <Button onClick={startLogin} disabled={busy || status?.authenticated}>
                  {t("ai.login")}
                </Button>
              </div>
            </div>
            {login && (
              <div className="ai-device-code">
                {(login.verification_url || login.auth_url) && (
                  <a href={login.verification_url ?? login.auth_url} target="_blank" rel="noreferrer">
                    {login.verification_url ?? login.auth_url}
                  </a>
                )}
                {login.user_code && <Text weight="semibold">{login.user_code}</Text>}
                {login.message && <Text size={200}>{login.message}</Text>}
              </div>
            )}
            <div className="ai-options-row">
              <Field label={t("ai.model")}>
                <Select value={model} onChange={(event) => setModel(event.target.value)} disabled={busy}>
                  {options.models.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.display_name || item.id}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t("ai.reasoningEffort")}>
                <Select
                  value={reasoningEffort}
                  onChange={(event) => setReasoningEffort(event.target.value)}
                  disabled={busy || reasoningEfforts.length === 0}
                >
                  {reasoningEfforts.map((item) => (
                    <option key={item.reasoning_effort} value={item.reasoning_effort}>
                      {t(`ai.reasoning.${item.reasoning_effort}`, item.reasoning_effort)}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Textarea
              aria-label={t("ai.instruction")}
              autoFocus
              className="ai-instruction"
              placeholder={t("ai.instructionPlaceholder")}
              ref={instructionRef}
              value={instruction}
              onChange={(_, data) => setInstruction(data.value)}
            />
            {suggestion && (
              <div className="ai-suggestion">
                {suggestion.summary && <Text size={200}>{suggestion.summary}</Text>}
                <pre>{suggestion.content}</pre>
              </div>
            )}
          </DialogContent>
          <DialogActions>
            <Button appearance="secondary" onClick={() => setOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              appearance="secondary"
              onClick={generateSuggestion}
              disabled={busy || !resourceID || instruction.trim() === ""}
            >
              {busy ? t("ai.generating") : t("ai.generate")}
            </Button>
            <Button appearance="primary" onClick={applySuggestion} disabled={!suggestion?.content}>
              {t("ai.allowChanges")}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
