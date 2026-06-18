import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Input,
  Select,
  Text
} from "@fluentui/react-components";
import { useTranslation } from "react-i18next";
import { listRows, type RowRecord } from "../api";
import type { FormElement } from "../formRuntime";

type FormPreviewFieldsProps = {
  databaseName: string;
  elements: FormElement[];
  formValues: Record<string, string>;
  onFormValueChange: (name: string, value: string) => void;
  onSubmit: (submitElement?: Extract<FormElement, { kind: "submit" }>, event?: FormEvent<HTMLFormElement>) => void | Promise<void>;
};

export function FormPreviewFields({
  databaseName,
  elements,
  formValues,
  onFormValueChange,
  onSubmit
}: FormPreviewFieldsProps) {
  return (
    <>
      {elements.map((element) => {
        if (element.kind === "input") {
          return (
            <label key={element.field} className="field-stack">
              <span>{element.label}</span>
              <Input
                type={element.inputType}
                value={formValues[element.field] ?? ""}
                onChange={(_, data) => onFormValueChange(element.field, data.value)}
              />
            </label>
          );
        }
        if (element.kind === "select") {
          return (
            <label key={element.field} className="field-stack">
              <span>{element.label}</span>
              <Select
                value={formValues[element.field] ?? element.options[0] ?? ""}
                onChange={(_, data) => onFormValueChange(element.field, data.value)}
              >
                {element.options.map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </Select>
            </label>
          );
        }
        if (element.kind === "relation") {
          return (
            <RelationInput
              key={element.field}
              databaseName={databaseName}
              element={element}
              onChange={(value) => onFormValueChange(element.field, value)}
              value={formValues[element.field] ?? ""}
            />
          );
        }
        if (element.kind === "html") {
          return <div key={element.html} className="form-html" dangerouslySetInnerHTML={{ __html: element.html }} />;
        }
        return (
          <Button key={element.label} type="button" appearance="primary" onClick={() => void onSubmit(element)}>
            {element.label}
          </Button>
        );
      })}
    </>
  );
}

function RelationInput({
  databaseName,
  element,
  onChange,
  value
}: {
  databaseName: string;
  element: Extract<FormElement, { kind: "relation" }>;
  onChange: (value: string) => void;
  value: string;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<RowRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    if (!open || !databaseName || !element.table) {
      return () => {
        cancelled = true;
      };
    }
    setLoading(true);
    setError("");
    void listRows(databaseName, element.table, element.view)
      .then((nextRows) => {
        if (!cancelled) {
          setRows(nextRows);
        }
      })
      .catch((nextError) => {
        if (!cancelled) {
          setRows([]);
          setError(nextError instanceof Error ? nextError.message : t("form.relationLoadFailed"));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [databaseName, element.table, element.view, open, t]);

  const selectedRow = useMemo(() => rows.find((row) => String(row.record_id) === value), [rows, value]);
  const selectedLabel = selectedRow ? relationRowLabel(selectedRow) : value ? t("form.selectedRecord", { id: value }) : "";

  return (
    <div className="field-stack">
      <span>{element.label}</span>
      <div className="relation-input">
        <Input readOnly value={selectedLabel} placeholder={t("form.noRelationSelected")} />
        {value && (
          <Button type="button" onClick={() => onChange("")}>
            {t("common.clear")}
          </Button>
        )}
        <Button type="button" onClick={() => setOpen(true)} disabled={!databaseName || !element.table}>
          {t("form.chooseRelation")}
        </Button>
      </div>
      <Dialog open={open} onOpenChange={(_, data) => setOpen(data.open)}>
        <DialogSurface className="relation-picker-dialog">
          <DialogBody>
            <DialogTitle>{t("form.relationDialogTitle", { table: element.table })}</DialogTitle>
            <DialogContent className="relation-picker-content">
              {element.view && <Text size={200}>{t("form.relationView", { view: element.view })}</Text>}
              {loading && <Text>{t("form.loadingRelationRecords")}</Text>}
              {error && <Text className="form-error">{error}</Text>}
              {!loading && !error && rows.length === 0 && <Text>{t("form.noRelationRecords")}</Text>}
              <div className="relation-picker-list" aria-label={t("form.relationRecords")}>
                {rows.map((row) => (
                  <button
                    key={row.record_id}
                    className={String(row.record_id) === value ? "relation-picker-row selected" : "relation-picker-row"}
                    type="button"
                    onClick={() => {
                      onChange(String(row.record_id));
                      setOpen(false);
                    }}
                  >
                    <span className="relation-picker-row-main">
                      <strong>{relationRowLabel(row)}</strong>
                      <small>{relationRowSummary(row)}</small>
                    </span>
                    <span>{t("form.selectedRecord", { id: row.record_id })}</span>
                  </button>
                ))}
              </div>
            </DialogContent>
            <DialogActions>
              <Button type="button" onClick={() => setOpen(false)}>{t("common.cancel")}</Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </div>
  );
}

function relationRowLabel(row: RowRecord): string {
  const firstValue = Object.values(row.values).find((value) => value !== undefined && value !== null && String(value).trim() !== "");
  return firstValue === undefined ? `#${row.record_id}` : String(firstValue);
}

function relationRowSummary(row: RowRecord): string {
  return Object.entries(row.values)
    .filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== "")
    .slice(0, 4)
    .map(([field, value]) => `${field}: ${String(value)}`)
    .join(" / ");
}
