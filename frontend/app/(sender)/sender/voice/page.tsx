"use client";

import { ArrowRight, CheckCircle2, Info, Languages, Mic, Sparkles } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Card, Field, SectionHeader, Spinner, useToast } from "@/components/ui";
import { api } from "@/lib/api";
import { useGuard } from "@/lib/session";

const EXAMPLES = [
  { lang: "ਪੰਜਾਬੀ", text: "Bhari ton 40 quintal gehun gobindgarh kal" },
  { lang: "हिन्दी", text: "Bhari se 40 quintal gehun gobindgarh kal" },
  { lang: "English", text: "40 quintal wheat from Bhari to gobindgarh tomorrow" },
];

export default function VoiceBoliPage() {
  const { ready } = useGuard("sender");
  const { push } = useToast();
  const [transcript, setTranscript] = useState("");
  const [language, setLanguage] = useState("pa");
  const [result, setResult] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  if (!ready) return null;

  const run = async () => {
    setBusy(true);
    try {
      const res = await api.post<any>("/voice/parse", { transcript, language });
      setResult(res);
      push("info", "Draft extracted", "Review the fields, then confirm in the create form.");
    } catch (e: any) {
      push("error", "Extraction failed", e?.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
      <Card>
        <SectionHeader title="VoiceBoli" subtitle="Multilingual voice shipment entry with an explicit confirmation step"
          eyebrow="Speech intake" />

        <Field label="Language" className="mb-4">
          <div className="flex flex-wrap gap-2">
            {[
              ["pa", "ਪੰਜਾਬੀ", "Punjabi"],
              ["hi", "हिन्दी", "Hindi"],
              ["en", "English", "English"],
            ].map(([k, native, label]) => (
              <button key={k} onClick={() => setLanguage(k)}
                className={`rounded-xl border px-3.5 py-2 text-[12.5px] font-semibold transition-all ${
                  language === k ? "border-ink bg-ink text-white" : "border-line bg-white text-ink hover:border-ink/25"}`}>
                {native}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Transcript" hint="Live microphone capture plugs into an ASR provider (Bhushini / Whisper) in production.">
          <textarea className="input min-h-[110px]" value={transcript} onChange={(e) => setTranscript(e.target.value)}
            placeholder="Speak or type the shipment…" />
        </Field>

        <div className="mt-3 flex flex-wrap gap-2">
          {EXAMPLES.map((e) => (
            <button key={e.text} onClick={() => setTranscript(e.text)}
              className="rounded-lg border border-line bg-soft/60 px-2.5 py-1.5 text-[11px] text-ink-muted hover:border-ink/25 hover:text-ink">
              <Languages size={11} className="mr-1 inline" /> {e.lang}
            </button>
          ))}
        </div>

        <div className="mt-4 flex items-center gap-2">
          <button className="btn-primary" disabled={transcript.length < 4 || busy} onClick={run}>
            {busy ? <Spinner /> : <Mic size={14} />} Extract fields
          </button>
          <span className="text-[11px] text-ink-muted">Nothing is saved without your confirmation.</span>
        </div>

        {result && (
          <div className="mt-5 space-y-3">
            <div className="rounded-xl border border-line p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">Extracted draft</span>
                <span className="chip border-line bg-soft text-[10px] capitalize">{language}</span>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {Object.entries(result.draft || {}).map(([k, v]: any) => (
                  <div key={k} className="rounded-lg bg-soft px-2.5 py-1.5">
                    <div className="text-[10px] uppercase tracking-wider text-ink-muted">{k.replace(/_/g, " ")}</div>
                    <div className="text-[12.5px] font-medium text-ink">{String(v)}</div>
                  </div>
                ))}
              </div>
            </div>

            {result.clarification_questions?.length > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                <div className="text-[11.5px] font-semibold text-amber-800">Needs clarification</div>
                <ul className="mt-1 space-y-1">
                  {result.clarification_questions.map((q: string) => (
                    <li key={q} className="text-[11.5px] text-amber-800">• {q}</li>
                  ))}
                </ul>
              </div>
            )}

            <Link href="/sender/create" className="btn-emerald">
              Continue in create form <ArrowRight size={14} />
            </Link>
          </div>
        )}
      </Card>

      <div className="space-y-4">
        <Card>
          <SectionHeader title="Workflow" eyebrow="6 steps" />
          <ol className="space-y-2.5">
            {[
              "Capture speech (microphone or upload)",
              "Convert to text with the selected language",
              "Extract commodity, quantity, pickup, destination and timing",
              "Generate a draft and show unresolved questions",
              "Ask the sender to confirm or correct",
              "Save the confirmed request into the review queue",
            ].map((s, i) => (
              <li key={s} className="flex gap-2.5">
                <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-ink/10 text-[10px] font-bold text-ink">
                  {i + 1}
                </span>
                <span className="text-[12px] leading-snug text-ink-muted">{s}</span>
              </li>
            ))}
          </ol>
        </Card>

        <Card>
          <div className="flex items-start gap-2.5">
            <Info size={15} className="mt-0.5 shrink-0 text-ink" />
            <p className="text-[11.5px] leading-relaxed text-ink-muted">
              Voice intake is designed for low-literacy and hands-busy contexts. The extraction is deterministic and
              auditable — the assistant never guesses a quantity, and every unresolved field becomes a question rather
              than a default.
            </p>
          </div>
        </Card>

        <Card className="bg-ink text-white">
          <div className="flex items-start gap-2.5">
            <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-accent" />
            <div>
              <div className="text-[12.5px] font-semibold text-white">Confirmed-only writes</div>
              <p className="mt-1 text-[11.5px] leading-relaxed text-white/70">
                A voice draft never creates a shipment on its own. You always confirm the fields before anything enters
                the Admin review queue.
              </p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
