"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Settings2 } from "lucide-react";
import type { PdfSettings } from "@/lib/types";

interface PDFSettingsProps {
  settings: PdfSettings;
  expanded: boolean;
  onToggle: () => void;
  onChange: (next: PdfSettings) => void;
}

export function PDFSettings({ settings, expanded, onToggle, onChange }: PDFSettingsProps) {
  return (
    <section className="rounded-[2rem] border border-[#e8637a22] bg-[var(--bg-elevated)]/90 p-4 shadow-[0_16px_50px_rgba(0,0,0,0.28)]">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between rounded-2xl px-1 py-2 text-left"
      >
        <span className="inline-flex items-center gap-2 text-sm font-medium text-[var(--text-primary)]">
          <Settings2 className="h-4 w-4 text-[var(--accent-rose)]" />
          PDF Settings
        </span>
        <span className="text-xs text-[var(--text-muted)]">{expanded ? "Hide" : "Show"}</span>
      </button>

      <AnimatePresence initial={false}>
        {expanded ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28 }}
            className="overflow-hidden"
          >
            <div className="grid gap-4 pt-4 md:grid-cols-2">
              <SettingGroup title="Page size">
                <ChoicePills
                  value={settings.pageSize}
                  options={[
                    { label: "A4", value: "a4" },
                    { label: "Letter", value: "letter" },
                    { label: "Fit to image", value: "fit" },
                  ]}
                  onChange={(pageSize) => onChange({ ...settings, pageSize: pageSize as PdfSettings["pageSize"] })}
                />
              </SettingGroup>

              <SettingGroup title="Orientation">
                <ChoicePills
                  value={settings.orientation}
                  options={[
                    { label: "Portrait", value: "portrait" },
                    { label: "Landscape", value: "landscape" },
                  ]}
                  onChange={(orientation) => onChange({ ...settings, orientation: orientation as PdfSettings["orientation"] })}
                />
              </SettingGroup>

              <SettingGroup title="Compression preset">
                <ChoicePills
                  value={settings.compressionPreset}
                  options={[
                    { label: "Smallest file", value: "smallest" },
                    { label: "Balanced", value: "balanced" },
                    { label: "Best quality", value: "best" },
                  ]}
                  onChange={(compressionPreset) => {
                    const quality = getQualityForPreset(compressionPreset as PdfSettings["compressionPreset"]);
                    onChange({
                      ...settings,
                      compressionPreset: compressionPreset as PdfSettings["compressionPreset"],
                      quality,
                    });
                  }}
                />
              </SettingGroup>

              <SettingGroup title="Image quality">
                <div className="space-y-2">
                  <input
                    type="range"
                    min={1}
                    max={100}
                    value={settings.quality}
                    onChange={(event) => {
                      const quality = Number(event.target.value);
                      onChange({
                        ...settings,
                        quality,
                        compressionPreset: getPresetForQuality(quality),
                      });
                    }}
                    className="h-2 w-full cursor-pointer appearance-none rounded-full bg-white/10 accent-[var(--accent-rose)]"
                  />
                  <p className="text-xs text-[var(--text-muted)]">Higher = bigger file size</p>
                </div>
              </SettingGroup>

              <SettingGroup title="Spacing between images">
                <ChoicePills
                  value={String(settings.margin)}
                  options={[
                    { label: "None", value: "0" },
                    { label: "Small margin", value: "12" },
                  ]}
                  onChange={(margin) => onChange({ ...settings, margin: Number(margin) })}
                />
              </SettingGroup>

              <SettingGroup title="PDF filename" className="md:col-span-2">
                <input
                  value={settings.filename}
                  onChange={(event) => onChange({ ...settings, filename: event.target.value })}
                  className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-muted)] focus:border-[var(--accent-rose)]"
                />
              </SettingGroup>

              <SettingGroup title="Extra touches" className="md:col-span-2">
                <div className="flex flex-wrap gap-2">
                  <TogglePill active={settings.watermark} label="Watermark" onClick={() => onChange({ ...settings, watermark: !settings.watermark })} />
                  <TogglePill active={settings.pageNumbers} label="Page numbers" onClick={() => onChange({ ...settings, pageNumbers: !settings.pageNumbers })} />
                </div>
              </SettingGroup>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}

function getQualityForPreset(preset: PdfSettings["compressionPreset"]) {
  if (preset === "smallest") return 60;
  if (preset === "best") return 100;
  if (preset === "balanced") return 85;
  return 85;
}

function getPresetForQuality(quality: number): PdfSettings["compressionPreset"] {
  if (quality <= 65) return "smallest";
  if (quality >= 98) return "best";
  if (quality === 85) return "balanced";
  return "custom";
}

function SettingGroup({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <p className="mb-2 text-xs uppercase tracking-[0.28em] text-[var(--text-muted)]">{title}</p>
      {children}
    </div>
  );
}

function ChoicePills({
  value,
  options,
  onChange,
}: {
  value: string;
  options: Array<{ label: string; value: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => {
        const active = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={[
              "rounded-full px-4 py-2 text-xs transition",
              active
                ? "bg-[#e8637a] text-white shadow-[0_0_20px_rgba(232,99,122,0.25)]"
                : "border border-white/10 bg-white/5 text-[var(--text-muted)] hover:border-[var(--accent-rose)] hover:text-[var(--text-primary)]",
            ].join(" ")}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function TogglePill({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "rounded-full px-4 py-2 text-xs transition",
        active
          ? "bg-[#d4a574] text-[#221620]"
          : "border border-white/10 bg-white/5 text-[var(--text-muted)] hover:border-[var(--accent-rose)] hover:text-[var(--text-primary)]",
      ].join(" ")}
    >
      {label}
    </button>
  );
}
