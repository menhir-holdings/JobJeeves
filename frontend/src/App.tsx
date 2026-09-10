import { useEffect, useMemo, useState } from "react";
import { analyzeResume, type AnalyzeResponse } from "./api";
import { clearBaseResume, loadBaseResume, saveBaseResume } from "./baseResume";

type ResumeMode = "upload" | "paste";
type AnalysisSource = "groq" | "openai" | "local_heuristic";
type DeskTab = "opening" | "pipeline";
type StageId = "file" | "opening" | "screen" | "packet" | "ready";

const STAGES: { id: StageId; label: string; hint: string }[] = [
  { id: "file", label: "File", hint: "Base résumé" },
  { id: "opening", label: "Opening", hint: "Role on the desk" },
  { id: "screen", label: "Screen", hint: "Match & gaps" },
  { id: "packet", label: "Packet", hint: "Tailored résumé" },
  { id: "ready", label: "Ready", hint: "Copy or download" },
];

function firstMeaningfulLine(text: string): string {
  return (
    text
      .split(/\r?\n/)
      .map((line) => line.trim().replace(/^[#>*\-\d.)\s]+/, ""))
      .find((line) => line.length > 1 && line.length < 90) ?? ""
  );
}

function deriveCandidateName(resumeText: string): string {
  const line = firstMeaningfulLine(resumeText);
  if (!line) return "Applicant file";
  if (/experience|education|summary|skills|objective/i.test(line)) return "Applicant file";
  return line.slice(0, 48);
}

function deriveOpeningTitle(jobDescription: string): string {
  const line = firstMeaningfulLine(jobDescription);
  if (!line) return "Unassigned opening";
  return line.replace(/^(job title|role|position)\s*[:\-–]\s*/i, "").slice(0, 64);
}

function initialsFor(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "AF";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function stageIndex(id: StageId): number {
  return STAGES.findIndex((stage) => stage.id === id);
}

function DeskMark() {
  return (
    <svg className="mark" viewBox="0 0 28 28" aria-hidden="true">
      <rect x="3" y="18" width="22" height="6" rx="1" fill="currentColor" opacity="0.22" />
      <rect x="7" y="6" width="4.2" height="14" fill="currentColor" />
      <rect x="12.4" y="4" width="3.4" height="16" fill="currentColor" opacity="0.85" />
      <rect x="17.2" y="8" width="3.6" height="12" fill="currentColor" opacity="0.7" />
    </svg>
  );
}

function EmptyDesk() {
  return (
    <div className="desk-empty">
      <svg viewBox="0 0 160 88" fill="none" aria-hidden="true">
        <rect x="18" y="58" width="124" height="8" rx="1" stroke="currentColor" strokeWidth="1.4" />
        <rect x="44" y="28" width="72" height="34" rx="2" stroke="currentColor" strokeWidth="1.4" />
        <path d="M52 36h56M52 42h40M52 48h48" stroke="currentColor" strokeWidth="1.2" />
        <rect x="86" y="18" width="46" height="28" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
        <circle cx="36" cy="46" r="8" stroke="currentColor" strokeWidth="1.4" />
      </svg>
      <h3>No file on the desk</h3>
      <p>Put a base résumé in File, then pin an opening. Screening starts from there.</p>
    </div>
  );
}

export default function App() {
  const [resumeMode, setResumeMode] = useState<ResumeMode>("upload");
  const [pdf, setPdf] = useState<File | null>(null);
  const [resumeText, setResumeText] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [analysisSource, setAnalysisSource] = useState<AnalysisSource>("groq");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [savedHint, setSavedHint] = useState<string | null>(null);
  const [exportHint, setExportHint] = useState<string | null>(null);
  const [exported, setExported] = useState(false);
  const [tab, setTab] = useState<DeskTab>("opening");
  const [focusStage, setFocusStage] = useState<StageId>("file");
  const [query, setQuery] = useState("");

  const hasJobDescription = jobDescription.trim().length > 0;
  const sourceOptions = hasJobDescription
    ? ([
        { value: "groq", label: "Quick screen" },
        { value: "openai", label: "Senior screen" },
      ] as const)
    : ([
        { value: "groq", label: "Quick screen" },
        { value: "openai", label: "Senior screen" },
        { value: "local_heuristic", label: "Desk check (offline)" },
      ] as const);

  const hasResume =
    resumeMode === "upload" ? !!(pdf || resumeText.trim()) : resumeText.trim().length > 0;
  const canSubmit = hasResume && !loading;
  const openingTitle = deriveOpeningTitle(jobDescription);
  const candidateName = deriveCandidateName(resumeText);
  const tailored = result?.tailored_resume?.trim() ?? "";

  const earnedStage: StageId | null = useMemo(() => {
    if (!hasResume) return null;
    if (exported && tailored) return "ready";
    if (tailored) return "packet";
    if (result) return "screen";
    if (hasJobDescription) return "opening";
    return "file";
  }, [exported, hasJobDescription, hasResume, result, tailored]);

  const boardQuery = query.trim().toLowerCase();
  const cardVisible =
    Boolean(earnedStage) &&
    (!boardQuery ||
      candidateName.toLowerCase().includes(boardQuery) ||
      openingTitle.toLowerCase().includes(boardQuery) ||
      STAGES.some((stage) => stage.label.toLowerCase().includes(boardQuery)));

  useEffect(() => {
    const saved = loadBaseResume();
    if (!saved) return;
    setResumeMode(saved.source === "upload" ? "upload" : "paste");
    setResumeText(saved.text);
    setSavedHint(
      saved.source === "upload"
        ? `Session file restored (${saved.filename ?? "PDF"}).`
        : "Session file restored from paste.",
    );
    setFocusStage("file");
  }, []);

  useEffect(() => {
    if (hasJobDescription && analysisSource === "local_heuristic") {
      setAnalysisSource("groq");
    }
  }, [analysisSource, hasJobDescription]);

  function persistBaseResume(text: string, source: ResumeMode, filename: string | null) {
    if (!text.trim()) {
      clearBaseResume();
      setSavedHint(null);
      return;
    }
    saveBaseResume({
      text,
      filename,
      source,
      updatedAt: new Date().toISOString(),
    });
    setSavedHint("Base résumé is on this desk for the session.");
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!hasResume) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setExportHint(null);
    setExported(false);
    try {
      const r = await analyzeResume({
        pdf: resumeMode === "upload" ? pdf : null,
        resumeText:
          resumeMode === "paste" || (!pdf && resumeText.trim()) ? resumeText : undefined,
        jobDescription,
        analysisSource,
      });
      setResult(r);
      const storedText = r.resume_text?.trim() || resumeText.trim();
      if (storedText) {
        persistBaseResume(
          storedText,
          resumeMode === "paste" || !pdf ? "paste" : "upload",
          pdf?.name ?? null,
        );
      }
      setTab("pipeline");
      setFocusStage(r.tailored_resume?.trim() ? "packet" : "screen");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setTab("pipeline");
      setFocusStage("screen");
    } finally {
      setLoading(false);
    }
  }

  function onPdfSelected(file: File | null) {
    setPdf(file);
    if (!file) return;
    setResumeMode("upload");
    setSavedHint(null);
    setExported(false);
  }

  async function copyTailoredResume(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setExportHint("Packet copied to the clipboard.");
      setExported(true);
      setFocusStage("ready");
    } catch {
      setExportHint("Could not copy — download the packet instead.");
    }
  }

  function downloadTailoredResume(text: string) {
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "tailored-resume.txt";
    anchor.click();
    URL.revokeObjectURL(url);
    setExportHint("Download started.");
    setExported(true);
    setFocusStage("ready");
  }

  function moveStage(direction: -1 | 1) {
    const next = STAGES[stageIndex(focusStage) + direction];
    if (!next) return;
    setFocusStage(next.id);
    setTab("pipeline");
  }

  const submitLabel = hasJobDescription
    ? loading
      ? "Cutting packet…"
      : "Screen & cut packet"
    : loading
      ? "Marking file…"
      : "Screen résumé";

  const stamp =
    earnedStage === "ready"
      ? "Ready"
      : earnedStage === "packet"
        ? "Packet"
        : earnedStage === "screen"
          ? "Screened"
          : earnedStage === "opening"
            ? "Opening pinned"
            : "On file";

  const resumeFields = (
    <>
      <div className="segment" role="tablist" aria-label="Résumé intake">
        <button
          type="button"
          className={resumeMode === "upload" ? "active" : ""}
          onClick={() => setResumeMode("upload")}
        >
          Upload PDF
        </button>
        <button
          type="button"
          className={resumeMode === "paste" ? "active" : ""}
          onClick={() => setResumeMode("paste")}
        >
          Paste text
        </button>
      </div>

      {resumeMode === "upload" ? (
        <label className="label">
          Base résumé
          <input
            className="input"
            type="file"
            accept="application/pdf"
            onChange={(e) => onPdfSelected(e.target.files?.[0] ?? null)}
          />
        </label>
      ) : (
        <label className="label">
          Base résumé
          <textarea
            className="textarea"
            value={resumeText}
            onChange={(e) => {
              setResumeText(e.target.value);
              setExported(false);
            }}
            placeholder="Paste the full résumé onto the desk…"
            rows={12}
          />
        </label>
      )}
      {savedHint ? <p className="hint">{savedHint}</p> : null}
    </>
  );

  const openingFields = (
    <label className="label">
      Opening
      <textarea
        className="textarea"
        value={jobDescription}
        onChange={(e) => {
          setJobDescription(e.target.value);
          setExported(false);
        }}
        placeholder="Paste the job description. Leave blank to mark the file only."
        rows={10}
      />
    </label>
  );

  const resultsBody = !result ? (
    <p className="muted">
      {hasResume
        ? "Run a screen to put a mark on this opening."
        : "File a résumé first — the board stays empty until then."}
    </p>
  ) : (
    <div className="stack">
      <div className="score-row">
        <div className="score">{result.match_score}</div>
        <div>
          <div className="score-label">
            {result.analysis_mode === "resume_only" ? "File readiness" : "Opening match"}
          </div>
          <p className="muted">
            Screen {result.analysis_id} · {result.analysis_engine}
          </p>
        </div>
      </div>

      {result.short_summary ? (
        <div className="block">
          <h3>Desk note</h3>
          <p>{result.short_summary}</p>
        </div>
      ) : null}

      <div className="cols">
        <div className="block">
          <h3>
            {result.analysis_mode === "resume_only" ? "Underplayed keywords" : "Missing keywords"}
          </h3>
          {result.missing_keywords.length ? (
            <ul>
              {result.missing_keywords.map((keyword) => (
                <li key={keyword}>{keyword}</li>
              ))}
            </ul>
          ) : (
            <p className="muted">None marked.</p>
          )}
        </div>
        <div className="block">
          <h3>Strengths</h3>
          {result.strengths.length ? (
            <ul>
              {result.strengths.map((strength) => (
                <li key={strength}>{strength}</li>
              ))}
            </ul>
          ) : (
            <p className="muted">None returned.</p>
          )}
        </div>
      </div>

      <div className="block">
        <h3>What to tighten</h3>
        {result.improvement_suggestions.length ? (
          <ol>
            {result.improvement_suggestions.map((suggestion) => (
              <li key={suggestion}>{suggestion}</li>
            ))}
          </ol>
        ) : (
          <p className="muted">No notes returned.</p>
        )}
      </div>
    </div>
  );

  const packetBody = tailored ? (
    <div className="block">
      <div className="blockHeader">
        <h3>Tailored packet</h3>
        <div className="action-row">
          <button type="button" className="secondary" onClick={() => copyTailoredResume(tailored)}>
            Copy
          </button>
          <button type="button" className="secondary" onClick={() => downloadTailoredResume(tailored)}>
            Download
          </button>
        </div>
      </div>
      {exportHint ? <p className="hint">{exportHint}</p> : null}
      <pre className="tailor">{tailored}</pre>
    </div>
  ) : result?.analysis_mode === "job_match" ? (
    <p className="muted">This screen did not return a tailored packet.</p>
  ) : (
    <p className="muted">Pin an opening and screen it to cut a packet.</p>
  );

  return (
    <div className="app">
      <aside className="rail">
        <div className="brand">
          <DeskMark />
          <div>
            <p className="brand-name">JobJeeves</p>
            <p className="brand-kicker">Hiring desk</p>
          </div>
        </div>

        <nav className="rail-nav" aria-label="Desk">
          <button
            type="button"
            className={`rail-btn ${tab === "pipeline" ? "active" : ""}`}
            onClick={() => setTab("pipeline")}
          >
            <span className="rail-dot" />
            <span className="rail-label">
              <strong>Pipeline</strong>
              <span>Paper stages</span>
            </span>
          </button>
          <button
            type="button"
            className={`rail-btn ${tab === "opening" ? "active" : ""}`}
            onClick={() => {
              setTab("opening");
              setFocusStage("opening");
            }}
          >
            <span className="rail-dot" />
            <span className="rail-label">
              <strong>Opening</strong>
              <span>Role + file</span>
            </span>
          </button>
        </nav>

        <div className="rail-section">
          <h2>On desk</h2>
          <button
            type="button"
            className={`job-chip ${tab === "pipeline" ? "active" : ""}`}
            onClick={() => setTab("pipeline")}
          >
            <span className="rail-dot" />
            <span className="rail-label">
              <strong>{openingTitle}</strong>
              <span>{hasResume ? candidateName : "No file yet"}</span>
            </span>
          </button>
        </div>

        <div className="rail-foot">
          <label className="engine-label">
            Screen
            <select
              className="select"
              value={analysisSource}
              onChange={(e) => setAnalysisSource(e.target.value as AnalysisSource)}
            >
              {sourceOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </aside>

      <div className="desk">
        <header className="mast">
          <div>
            <h1 className="opening-title">{openingTitle}</h1>
            <p className="opening-meta">
              {hasResume ? candidateName : "Empty blotter"} · Session desk ·{" "}
              {hasJobDescription ? "Opening pinned" : "No opening yet"}
            </p>
          </div>
          <div className="tabs" role="tablist" aria-label="Desk views">
            <button
              type="button"
              className={`tab ${tab === "opening" ? "active" : ""}`}
              onClick={() => setTab("opening")}
            >
              Opening
            </button>
            <button
              type="button"
              className={`tab ${tab === "pipeline" ? "active" : ""}`}
              onClick={() => setTab("pipeline")}
            >
              Pipeline
            </button>
          </div>
        </header>

        <div className="toolbar">
          <label className="search">
            <span className="sr-only">Search the pipeline</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search file or opening"
            />
          </label>
          <div className="toolbar-actions">
            <div className="stage-move" aria-label="Move stage">
              <button type="button" onClick={() => moveStage(-1)} disabled={stageIndex(focusStage) === 0}>
                ←
              </button>
              <button
                type="button"
                onClick={() => moveStage(1)}
                disabled={stageIndex(focusStage) === STAGES.length - 1}
              >
                →
              </button>
            </div>
            <button className="primary" disabled={!canSubmit} form="desk-form" type="submit">
              {submitLabel}
            </button>
          </div>
        </div>

        {tab === "pipeline" ? (
          <div className="board-wrap">
            <div className="board" role="list" aria-label="Hiring pipeline">
              {STAGES.map((stage) => (
                <section
                  key={stage.id}
                  className={`column ${focusStage === stage.id ? "active" : ""}`}
                  role="listitem"
                >
                  <button
                    type="button"
                    className="column-hit"
                    onClick={() => setFocusStage(stage.id)}
                    aria-pressed={focusStage === stage.id}
                  >
                    <span className="column-head">
                      <span className="column-title">{stage.label}</span>
                      <span className="column-count">{cardVisible && focusStage === stage.id ? 1 : 0}</span>
                    </span>
                  </button>
                  <div className="column-body">
                    {cardVisible && focusStage === stage.id ? (
                      <div className="card">
                        <div className="who">
                          <span className="avatar">{initialsFor(candidateName)}</span>
                          <span>
                            <strong>{candidateName}</strong>
                            <small>{openingTitle}</small>
                          </span>
                        </div>
                        <span className="stamp">{stamp}</span>
                      </div>
                    ) : earnedStage ? (
                      <p className="empty-col">{stage.hint}</p>
                    ) : (
                      <p className="empty-col" />
                    )}
                  </div>
                </section>
              ))}
            </div>
            {!earnedStage ? <EmptyDesk /> : null}
          </div>
        ) : null}

        <div className="sheet-wrap">
          <form
            id="desk-form"
            className={`sheet${tab === "opening" ? " intake" : ""}`}
            onSubmit={onSubmit}
          >
            {tab === "opening" ? (
              <>
                <div className="sheet-head">
                  <div>
                    <h2>Opening file</h2>
                    <p>
                      Keep the base résumé on the blotter, pin a role, then screen. This is a hiring
                      desk, not a job board.
                    </p>
                  </div>
                </div>
                <div className="stack">{resumeFields}</div>
                <div className="stack">
                  {openingFields}
                  {error ? <div className="error">{error}</div> : null}
                </div>
              </>
            ) : null}

            {tab === "pipeline" && focusStage === "file" ? (
              <div className="stack span-all">
                <div className="sheet-head">
                  <div>
                    <h2>File</h2>
                    <p>Session résumé on the desk.</p>
                  </div>
                </div>
                {resumeFields}
              </div>
            ) : null}

            {tab === "pipeline" && focusStage === "opening" ? (
              <div className="stack span-all">
                <div className="sheet-head">
                  <div>
                    <h2>Opening</h2>
                    <p>The role this packet is cut against.</p>
                  </div>
                </div>
                {openingFields}
              </div>
            ) : null}

            {tab === "pipeline" && focusStage === "screen" ? (
              <div className="stack span-all">
                <div className="sheet-head">
                  <div>
                    <h2>Screen</h2>
                    <p>Match mark, gaps, and what to tighten before the packet leaves the desk.</p>
                  </div>
                </div>
                {error ? <div className="error">{error}</div> : null}
                {resultsBody}
              </div>
            ) : null}

            {tab === "pipeline" && (focusStage === "packet" || focusStage === "ready") ? (
              <div className="stack span-all">
                <div className="sheet-head">
                  <div>
                    <h2>{focusStage === "ready" ? "Ready to send" : "Packet"}</h2>
                    <p>
                      {focusStage === "ready"
                        ? "Copy or download the tailored résumé. Plain text — no typeset PDF."
                        : "The cut of the résumé against this opening."}
                    </p>
                  </div>
                </div>
                {packetBody}
              </div>
            ) : null}
          </form>
        </div>
      </div>
    </div>
  );
}
