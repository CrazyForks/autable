import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FluentProvider, webLightTheme } from "@fluentui/react-components";
import { beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "../i18n";
import type { UseZxingOptions } from "react-zxing";
import { FormPreviewFields } from "./FormPreviewFields";

let latestZxingOptions: UseZxingOptions | undefined;

vi.mock("react-zxing", () => ({
  useZxing: (options: UseZxingOptions) => {
    latestZxingOptions = options;
    return {
      ref: { current: null },
      torch: { isOn: false, isAvailable: false, on: vi.fn(), off: vi.fn() }
    };
  }
}));

beforeEach(async () => {
  latestZxingOptions = undefined;
  Object.defineProperty(HTMLMediaElement.prototype, "play", {
    configurable: true,
    value: vi.fn().mockResolvedValue(undefined)
  });
  Object.defineProperty(HTMLMediaElement.prototype, "pause", {
    configurable: true,
    value: vi.fn()
  });
  await i18n.changeLanguage("en-US");
});

describe("FormPreviewFields", () => {
  it("writes scanner results and triggers the input change action", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    const onFormValueChange = vi.fn();

    render(
      <FluentProvider theme={webLightTheme}>
        <FormPreviewFields
          databaseName="workspace"
          elements={[
            {
              kind: "input",
              field: "device_code",
              label: "Device code",
              inputType: "text",
              scanner: true,
              onChangeActionID: "change_device_code"
            }
          ]}
          formValues={{}}
          onAction={onAction}
          onFormValueChange={onFormValueChange}
        />
      </FluentProvider>
    );

    await user.click(screen.getByRole("button", { name: "Scan Device code" }));
    await screen.findByText("Point the camera at a QR code or barcode.");

    act(() => {
      latestZxingOptions?.onDecodeResult?.({ rawValue: "DEVICE-001", format: "qr_code" } as Parameters<
        NonNullable<UseZxingOptions["onDecodeResult"]>
      >[0]);
    });

    expect(onFormValueChange).toHaveBeenCalledWith("device_code", "DEVICE-001");
    expect(onAction).toHaveBeenCalledWith("change_device_code", { device_code: "DEVICE-001" });
    await waitFor(() => expect(screen.queryByText("Point the camera at a QR code or barcode.")).not.toBeInTheDocument());
  });

  it("waits for confirmation before writing scanner results", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    const onFormValueChange = vi.fn();
    render(
      <FluentProvider theme={webLightTheme}>
        <FormPreviewFields
          databaseName="workspace"
          elements={[
            {
              kind: "input",
              field: "asset_code",
              label: "Asset code",
              inputType: "text",
              scanner: { confirm: true },
              onChangeActionID: "change_asset_code"
            }
          ]}
          formValues={{}}
          onAction={onAction}
          onFormValueChange={onFormValueChange}
        />
      </FluentProvider>
    );

    await user.click(screen.getByRole("button", { name: "Scan Asset code" }));
    await screen.findByText("Point the camera at a QR code or barcode.");
    act(() => {
      latestZxingOptions?.onDecodeResult?.(detectedBarcode("ASSET-001"));
    });

    expect(onFormValueChange).not.toHaveBeenCalled();
    expect(onAction).not.toHaveBeenCalled();
    expect(await screen.findByText("Detected value")).toBeInTheDocument();
    expect(screen.getByText("ASSET-001")).toBeInTheDocument();
    expect(document.querySelector(".scanner-overlay polygon")).toHaveAttribute("points", "10,20 110,20 110,70 10,70");

    await user.click(screen.getByRole("button", { name: "Confirm" }));

    expect(onFormValueChange).toHaveBeenCalledWith("asset_code", "ASSET-001");
    expect(onAction).toHaveBeenCalledWith("change_asset_code", { asset_code: "ASSET-001" });
    await waitFor(() => expect(screen.queryByText("Detected value")).not.toBeInTheDocument());
  });
});

function detectedBarcode(rawValue: string): Parameters<NonNullable<UseZxingOptions["onDecodeResult"]>>[0] {
  return {
    rawValue,
    format: "qr_code",
    boundingBox: { x: 10, y: 20, width: 100, height: 50 },
    cornerPoints: [
      { x: 10, y: 20 },
      { x: 110, y: 20 },
      { x: 110, y: 70 },
      { x: 10, y: 70 }
    ]
  } as Parameters<NonNullable<UseZxingOptions["onDecodeResult"]>>[0];
}
