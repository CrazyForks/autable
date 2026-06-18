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
  Input
} from "@fluentui/react-components";
import type { OIDCProvider } from "../api";

type AuthDialogProps = {
  email: string;
  onEmailChange: (value: string) => void;
  onLogin: () => Promise<void>;
  onOIDCLogin: (providerName: string) => void;
  onOpenChange: (open: boolean) => void;
  onPasswordChange: (value: string) => void;
  onRegister: () => Promise<void>;
  open: boolean;
  password: string;
  providers: OIDCProvider[];
};

export function AuthDialog({
  email,
  onEmailChange,
  onLogin,
  onOIDCLogin,
  onOpenChange,
  onPasswordChange,
  onRegister,
  open,
  password,
  providers
}: AuthDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(_, data) => onOpenChange(data.open)}>
      <DialogSurface>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            await onLogin();
            onOpenChange(false);
          }}
        >
          <DialogBody>
            <DialogTitle>Login</DialogTitle>
            <DialogContent>
              <div className="auth-modal">
                <Field label="Email">
                  <Input
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(_, data) => onEmailChange(data.value)}
                  />
                </Field>
                <Field label="Password">
                  <Input
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(_, data) => onPasswordChange(data.value)}
                  />
                </Field>
                {providers.length > 0 && (
                  <>
                    <Divider>or</Divider>
                    <div className="oidc-actions">
                      {providers.map((provider) => (
                        <Button key={provider.name} onClick={() => onOIDCLogin(provider.name)}>
                          Continue with {provider.name}
                        </Button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </DialogContent>
            <DialogActions>
              <Button
                type="button"
                onClick={async () => {
                  await onRegister();
                  onOpenChange(false);
                }}
              >
                Register
              </Button>
              <Button type="submit" appearance="primary">
                Login
              </Button>
            </DialogActions>
          </DialogBody>
        </form>
      </DialogSurface>
    </Dialog>
  );
}
