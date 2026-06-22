import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Divider,
  Field,
  Input,
  Tab,
  TabList
} from "@fluentui/react-components";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { OIDCProvider } from "../api";

type AuthMode = "login" | "register";

type AuthDialogProps = {
  displayName: string;
  email: string;
  onDisplayNameChange: (value: string) => void;
  onEmailChange: (value: string) => void;
  onLogin: () => Promise<boolean>;
  onOIDCLogin: (providerName: string) => void;
  onOpenChange: (open: boolean) => void;
  onPasswordChange: (value: string) => void;
  onRegister: () => Promise<boolean>;
  open: boolean;
  password: string;
  passwordEnabled: boolean;
  providers: OIDCProvider[];
};

export function AuthDialog({
  displayName,
  email,
  onDisplayNameChange,
  onEmailChange,
  onLogin,
  onOIDCLogin,
  onOpenChange,
  onPasswordChange,
  onRegister,
  open,
  password,
  passwordEnabled,
  providers
}: AuthDialogProps) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<AuthMode>("login");
  const hasOIDCProviders = providers.length > 0;
  const isRegister = mode === "register";
  const canSubmit = email.trim().length > 0 && password.length > 0 && (!isRegister || displayName.trim().length > 0);

  useEffect(() => {
    if (open) {
      setMode("login");
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(_, data) => onOpenChange(data.open)}>
      <DialogSurface>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            if (!passwordEnabled) {
              return;
            }
            if (!canSubmit) {
              return;
            }
            const ok = isRegister ? await onRegister() : await onLogin();
            if (ok) {
              onOpenChange(false);
            }
          }}
        >
          <DialogBody>
            <DialogTitle>{isRegister ? t("auth.registerTitle") : t("auth.loginTitle")}</DialogTitle>
            <DialogContent>
              <div className="auth-modal">
                {passwordEnabled && (
                  <>
                    <TabList
                      selectedValue={mode}
                      onTabSelect={(_, data) => setMode(data.value as AuthMode)}
                      aria-label={t("auth.mode")}
                    >
                      <Tab value="login">{t("common.login")}</Tab>
                      <Tab value="register">{t("common.register")}</Tab>
                    </TabList>
                    <Field label={t("auth.email")}>
                      <Input
                        type="email"
                        autoComplete="email"
                        required
                        value={email}
                        onChange={(_, data) => onEmailChange(data.value)}
                      />
                    </Field>
                    {isRegister && (
                      <Field label={t("auth.displayName")}>
                        <Input
                          type="text"
                          autoComplete="name"
                          required
                          value={displayName}
                          onChange={(_, data) => onDisplayNameChange(data.value)}
                        />
                      </Field>
                    )}
                    <Field label={t("auth.password")}>
                      <Input
                        type="password"
                        autoComplete={isRegister ? "new-password" : "current-password"}
                        required
                        value={password}
                        onChange={(_, data) => onPasswordChange(data.value)}
                      />
                    </Field>
                  </>
                )}
                {passwordEnabled && hasOIDCProviders && <Divider>{t("auth.or")}</Divider>}
                {hasOIDCProviders && (
                  <>
                    <div className="oidc-actions">
                      {providers.map((provider) => (
                        <Button key={provider.name} type="button" onClick={() => onOIDCLogin(provider.name)}>
                          {t("auth.continueWith", { provider: provider.name })}
                        </Button>
                      ))}
                    </div>
                  </>
                )}
                {!passwordEnabled && !hasOIDCProviders && <div>{t("auth.noMethods")}</div>}
              </div>
            </DialogContent>
            {passwordEnabled && (
              <DialogActions>
                <Button type="submit" appearance="primary" disabled={!canSubmit}>
                  {isRegister ? t("common.register") : t("common.login")}
                </Button>
              </DialogActions>
            )}
          </DialogBody>
        </form>
      </DialogSurface>
    </Dialog>
  );
}
