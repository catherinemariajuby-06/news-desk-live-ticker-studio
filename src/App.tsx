import { useMemo, useRef, useState } from "react";

import "./index.css";

type Story = {

  id: string;

  source: string;

  ticker: string;

  approved: boolean;

};

type Filter = "all" | "pending" | "approved";

const sampleStories: Story[] = [

  {

    id: "sample-1",

    source:

      "The city council approved a new public library in the northern district. Construction is expected to begin in January.",

    ticker: "The city council approved a new public library",

    approved: false,

  },

  {

    id: "sample-2",

    source:

      "The health department reported 120 new dengue cases this week, bringing the seasonal total to 840.",

    ticker: "Health department reports 120 new dengue cases this week",

    approved: false,

  },

  {

    id: "sample-3",

    source:

      "The railway authority announced that two additional services will operate between Kochi and Kozhikode during the festival period.",

    ticker: "The railway authority announced that two additional services will operate",

    approved: false,

  },

];

const STOP_WORDS = new Set([

  "the", "a", "an", "and", "or", "to", "of", "in", "on",

  "for", "by", "as", "at", "from", "with", "is", "are",

  "was", "were", "be", "been", "being", "that", "this",

  "it", "its", "their", "his", "her", "they", "he", "she",

  "will", "would", "could", "should", "has", "have", "had",

]);

function makeId(): string {

  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

}

function countWords(text: string): number {
  return text.match(/[\p{L}\p{M}\p{N}]+(?:[’'-][\p{L}\p{M}\p{N}]+)*/gu)?.length ?? 0;
}

function normalizeWord(word: string): string {
  let normalized = word
    .toLocaleLowerCase()
    .replace(/^[^\p{L}\p{N}%]+|[^\p{L}\p{N}%]+$/gu, "");

  // Light English inflection handling prevents false alerts such as
  // "approved" in the source versus "approves" in the ticker.
  // Non-Latin words (including Malayalam) are left unchanged.
  if (/^[a-z]+$/.test(normalized)) {
    if (normalized.length > 5 && normalized.endsWith("ies")) {
      normalized = `${normalized.slice(0, -3)}y`;
    } else if (normalized.length > 5 && normalized.endsWith("es")) {
      normalized = normalized.slice(0, -2);
    } else if (
      normalized.length > 4 &&
      normalized.endsWith("ed")
    ) {
      normalized = normalized.slice(0, -2);
    } else if (
      normalized.length > 4 &&
      normalized.endsWith("s") &&
      !normalized.endsWith("ss") &&
      normalized !== "news"
    ) {
      normalized = normalized.slice(0, -1);
    }

    // "approved" -> "approv"; "approves" -> "approv".
    if (
      normalized.length > 4 &&
      /([b-df-hj-np-tv-z])\1$/.test(normalized)
    ) {
      normalized = normalized.slice(0, -1);
    }
  }

  return normalized;
}

function getWords(text: string): string[] {

  return text

    .toLocaleLowerCase()

    .match(/[\p{L}\p{M}\p{N}]+(?:[.'’%-][\p{L}\p{M}\p{N}]+)*/gu) ?? [];

}

/**
 * Local extractive ticker generator.
 *
 * Approach:
 * 1. Split the announcement into sentences and clauses.
 * 2. Generate candidate excerpts of up to ten words at different positions.
 * 3. Rank candidates using length, news-action terms, numbers, named-entity
 *    cues, clause position, and whether a candidate drops a nearby negation.
 * 4. Return an exact source excerpt rather than inventing new facts.
 *
 * This is a heuristic algorithm, not a semantic summarizer. The editor must
 * review the selected ticker, especially for context and negation.
 */

function generateTicker(source: string): string {
  const cleaned = source.replace(/\s+/gu, " ").trim();
  if (!cleaned) return "";

  // Unicode-aware tokenization for English and Malayalam.
  const wordPattern = /[\p{L}\p{M}\p{N}]+(?:[’'-][\p{L}\p{M}\p{N}]+)*/gu;

  const count = (text: string) => (text.match(wordPattern) ?? []).length;

  const stopWords = new Set([
    "a", "an", "the", "and", "or", "but", "to", "of", "in",
    "on", "at", "by", "for", "from", "with", "as", "is",
    "are", "was", "were", "be", "been", "being", "that",
    "this", "it", "its", "will", "would", "could", "should",
    "has", "have", "had", "into", "over", "under", "after",
    "before", "during", "about", "between", "through",
  ]);

  const actionPattern =
    /\b(announced|approved|rejected|reported|confirmed|denied|warned|launched|opened|closed|won|lost|began|started|suspended|increased|decreased|rose|fell|resigned|elected|arrested|urged|ordered|signed|revealed|said|killed|injured|introduced|cancelled|canceled|will operate)\b/iu;

  // Prefer specific Malayalam reporting/action terms.
  // Generic words such as "നടപടി" are intentionally excluded.
  const malayalamActionPattern =
    /(അറിയിച്ചു|പ്രഖ്യാപിച്ചു|അംഗീകരിച്ചു|നിരസിച്ചു|റിപ്പോർട്ട് ചെയ്തു|തുടങ്ങി|തുറന്നു|അടച്ചു|ജയിച്ചു|വർധിച്ചു|കുറഞ്ഞു|മുന്നറിയിപ്പ് നൽകി|പറഞ്ഞു|ഒപ്പുവച്ചു|രാജിവച്ചു|തിരഞ്ഞെടുത്തു|അറസ്റ്റു ചെയ്തു|അറസ്റ്റിലായി|മരിച്ചു|പരിക്കേറ്റു|പുറത്തുവിട്ടു|നൽകി|നടത്തും|നടത്താൻ തീരുമാനിച്ചു|കണ്ടെത്തി|ഉണ്ടായി|ഉണ്ടാകുമെന്ന്|പറയുന്നു|അറിയിപ്പുണ്ടായി)/u;

  const negationPattern =
    /\b(no|not|never|none|neither|without|denied|denies|didn't|doesn't|won't|isn't|aren't|cannot|can't|failed to|has not|have not|had not)\b|അല്ല|ഇല്ല|നിരസിച്ചില്ല|അംഗീകരിച്ചില്ല|നടന്നില്ല|ചെയ്തില്ല/u;

  const actionWords =
    /\b(announced|approved|rejected|reported|confirmed|denied|warned|launched|opened|closed|won|lost|began|started|suspended|increased|decreased|rose|fell|resigned|elected|arrested|urged|ordered|signed|revealed|said|killed|injured|introduced|cancelled|canceled)\b/iu;

  type Candidate = {
    text: string;
    score: number;
    position: number;
  };

  const candidates: Candidate[] = [];

  // Break the announcement into meaningful sentence/clause units.
  const sentences = cleaned
    .split(/[.!?।\n]+/u)
    .map((part) => part.trim())
    .filter(Boolean);

  let position = 0;

  for (const sentence of sentences) {
    const clauses = sentence
      .split(/[,،;；:：]+/u)
      .map((part) => part.trim())
      .filter((part) => count(part) > 0);

    // Keep a complete sentence when it fits the broadcast limit.
    if (count(sentence) <= 10) {
      clauses.push(sentence);
    }

    for (const clause of clauses) {
      const words = clause.match(wordPattern) ?? [];
      if (!words.length) continue;

      const lower = clause.toLocaleLowerCase();
      const hasAction =
        actionPattern.test(clause) || malayalamActionPattern.test(clause);
      const hasNumber = /\p{N}/u.test(clause);
      const hasNegation = negationPattern.test(clause);
      const firstWord = words[0].toLocaleLowerCase();
      const lastWord = words[words.length - 1].toLocaleLowerCase();

      // Score the whole clause, not every arbitrary word window.
      let score = 0;

      if (hasAction) score += 5;
      if (hasNumber) score += 2;
      if (/\b[A-Z][\p{L}\p{N}'’-]*/u.test(clause)) score += 1;
      if (words.length >= 5 && words.length <= 10) score += 2;
      if (words.length < 4) score -= 2;
      if (stopWords.has(firstWord)) score -= 1;
      if (stopWords.has(lastWord)) score -= 2;
      if (hasNegation) score += 1;

      // Penalize clauses that look like background or attribution,
      // unless they also contain an identifiable news action.
      if (
        /(according to|as per|അതേസമയം|എന്നാൽ|കൂടാതെ|ഇതിന്റെ ഭാഗമായി)/iu.test(lower) &&
        !hasAction
      ) {
        score -= 2;
      }

      // Prefer clauses containing an action over an isolated phrase.
      if (hasAction) {
        candidates.push({ text: clause, score, position });
      } else {
        candidates.push({ text: clause, score: score - 2, position });
      }

      position += 1;
    }
  }

  if (!candidates.length) {
    return (cleaned.match(wordPattern) ?? []).slice(0, 10).join(" ");
  }

  // Choose the best meaningful source clause.
  candidates.sort(
    (a, b) => b.score - a.score || a.position - b.position
  );

  const best = candidates[0];
  const bestWords = best.text.match(wordPattern) ?? [];

  if (bestWords.length <= 10) {
    return best.text.replace(/[,:;،؛]+$/u, "").trim();
  }

  // If the selected clause is too long, use the shortest contiguous
  // phrase around an identifiable action term that fits the limit.
  const actionIndex = bestWords.findIndex(
    (word) => actionWords.test(word) || malayalamActionPattern.test(word)
  );

  if (actionIndex >= 0) {
    const start = Math.max(0, actionIndex - 4);
    const end = Math.min(bestWords.length, start + 10);
    const selected = bestWords.slice(start, end);

    if (selected.length > 0 && selected.length <= 10) {
      return selected.join(" ");
    }
  }

  // Conservative fallback: never exceed the word limit.
  return bestWords.slice(0, 10).join(" ");
}


function getWarnings(ticker: string, source: string): string[] {
  const warnings: string[] = [];
  const cleanTicker = ticker.trim();
  const cleanSource = source.trim();

  if (!cleanTicker) {
    return ["Ticker is empty."];
  }

  if (countWords(cleanTicker) > 10) {
    warnings.push(`Over the 10-word limit (${countWords(cleanTicker)} words).`);
  }

  const sourceNumbers: string[] = cleanSource.match(/\b\d[\d,.%]*\b/g) ?? [];
  const tickerNumbers: string[] = cleanTicker.match(/\b\d[\d,.%]*\b/g) ?? [];
  const missingNumbers = tickerNumbers.filter(
    (number) => !sourceNumbers.includes(number),
  );

  if (missingNumbers.length > 0) {
    warnings.push(
      `Check figures not found in source: ${[...new Set(missingNumbers)].join(", ")}.`,
    );
  }

  const negationPattern =
    /\b(no|not|never|none|neither|without|denied|denies|didn't|doesn't|won't|isn't|aren't|cannot|can't|failed to)\b/i;

  if (
    negationPattern.test(cleanSource) &&
    !negationPattern.test(cleanTicker)
  ) {
    warnings.push(
      "Source contains a denial or negative statement; verify that the meaning is preserved.",
    );
  }

  const sourceWords = new Set(
    getWords(cleanSource).map(normalizeWord).filter(Boolean),
  );

  const tickerWords = getWords(cleanTicker)
    .map(normalizeWord)
    .filter(Boolean);

  const unsupported = tickerWords.filter(
    (word) => !sourceWords.has(word) && !STOP_WORDS.has(word),
  );

  if (unsupported.length > 0) {
    warnings.push(
      `Review wording not found in the source (possible source drift): ${[
        ...new Set(unsupported),
      ].join(", ")}.`,
    );
  }

  // We intentionally do not require the ticker to be an exact excerpt.
  // Broadcast tickers may reorder or lightly rephrase supported facts.
  // Unsupported wording, figures, negation and word count remain checked.

  return [...new Set(warnings)];
}

function splitAnnouncements(text: string): string[] {
  return text
    .split(/\n+|(?<=[.!?])\s+(?=[A-Z0-9"'“‘])/)
    .map((announcement) => announcement.trim())
    .filter((announcement) => announcement.length > 0);
}

function App() {

  const [stories, setStories] = useState<Story[]>([]);

  const [singleInput, setSingleInput] = useState("");

  const [batchInput, setBatchInput] = useState("");

  const [activeInput, setActiveInput] = useState<"single" | "batch">("single");

  const [filter, setFilter] = useState<Filter>("all");

  const [notice, setNotice] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);

  const visibleStories = useMemo(() => {

    if (filter === "pending") {

      return stories.filter((story) => !story.approved);

    }

    if (filter === "approved") {

      return stories.filter((story) => story.approved);

    }

    return stories;

  }, [stories, filter]);

  const approvedCount = stories.filter((story) => story.approved).length;

  const pendingCount = stories.length - approvedCount;

  async function generateWithAI(announcements: string[]): Promise<string[]> {
    const response = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ announcements }),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(
        typeof data?.error === "string"
          ? data.error
          : "AI ticker generation failed.",
      );
    }

    if (!Array.isArray(data?.tickers) || data.tickers.length !== announcements.length) {
      throw new Error("The AI service returned an incomplete result.");
    }

    const ordered: string[] = new Array(announcements.length);
    const seen = new Set<number>();
    for (const item of data.tickers) {
      if (
        !Number.isInteger(item?.index) ||
        item.index < 0 ||
        item.index >= announcements.length ||
        seen.has(item.index) ||
        typeof item?.ticker !== "string" ||
        !item.ticker.trim()
      ) {
        throw new Error("The AI service returned an invalid ticker.");
      }
      seen.add(item.index);
      ordered[item.index] = item.ticker.trim();
    }

    for (let index = 0; index < ordered.length; index += 1) {
      if (!ordered[index]) {
        throw new Error("The AI service did not return every ticker.");
      }
    }

    return ordered;
  }

  async function addAnnouncement(source: string) {
    const trimmed = source.trim();
    if (!trimmed) {
      setNotice("Enter an announcement first.");
      return;
    }

    setNotice("Generating ticker...");
    let ticker: string;
    let fallbackMessage = "";

    try {
      [ticker] = await generateWithAI([trimmed]);
    } catch (error) {
      ticker = generateTicker(trimmed);
      fallbackMessage = error instanceof Error ? error.message : "AI generation is unavailable.";
    }

    setStories((current) => [
      ...current,
      { id: makeId(), source: trimmed, ticker, approved: false },
    ]);

    setNotice(
      fallbackMessage
        ? `Announcement added using the local fallback. AI message: ${fallbackMessage}`
        : "AI ticker generated. Review it before approval.",
    );
  }

  async function handleSingleSubmit() {
    if (!singleInput.trim()) {
      setNotice("Enter an announcement first.");
      return;
    }

    const source = singleInput;
    setSingleInput("");
    await addAnnouncement(source);
  }

  async function handleBatchSubmit() {
    const announcements = splitAnnouncements(batchInput);

    if (announcements.length === 0) {
      setNotice(
        "Paste announcements on separate lines or separate paragraphs with a blank line.",
      );
      return;
    }

    setNotice(`Generating ${announcements.length} ticker(s)...`);
    let tickers: string[];
    let fallbackMessage = "";

    try {
      tickers = await generateWithAI(announcements);
    } catch (error) {
      tickers = announcements.map((source) => generateTicker(source));
      fallbackMessage = error instanceof Error ? error.message : "AI generation is unavailable.";
    }

    setStories((current) => [
      ...current,
      ...announcements.map((source, index) => ({
        id: makeId(),
        source,
        ticker: tickers[index],
        approved: false,
      })),
    ]);

    setBatchInput("");
    setNotice(
      fallbackMessage
        ? `${announcements.length} announcement(s) added using the local fallback. AI message: ${fallbackMessage}`
        : `${announcements.length} AI ticker(s) generated. Review them before approval.`,
    );
  }

  function loadExamples() {

    setStories(

      sampleStories.map((story) => ({

        ...story,

        id: makeId(),

      })),

    );

    setFilter("all");

    setNotice("Three example announcements loaded.");

  }

  function updateTicker(id: string, ticker: string) {

    setStories((current) =>

      current.map((story) =>

        story.id === id ? { ...story, ticker, approved: false } : story,

      ),

    );

  }

  async function regenerate(id: string) {
    const story = stories.find((item) => item.id === id);
    if (!story) return;

    setNotice("Generating ticker...");
    let ticker: string;
    let fallbackMessage = "";

    try {
      [ticker] = await generateWithAI([story.source]);
    } catch (error) {
      ticker = generateTicker(story.source);
      fallbackMessage = error instanceof Error ? error.message : "AI generation is unavailable.";
    }

    setStories((current) =>
      current.map((item) =>
        item.id === id ? { ...item, ticker, approved: false } : item,
      ),
    );

    setNotice(
      fallbackMessage
        ? `Used the local fallback. AI message: ${fallbackMessage}`
        : "AI ticker regenerated. Please review it before approval.",
    );
  }

  function toggleApproval(id: string) {

    const story = stories.find((item) => item.id === id);

    if (!story) return;

    if (story.approved) {

      setStories((current) =>

        current.map((item) =>

          item.id === id ? { ...item, approved: false } : item,

        ),

      );

      setNotice("Approval withdrawn.");

      return;

    }

    const warnings = getWarnings(story.ticker, story.source);

    if (countWords(story.ticker) < 1 || countWords(story.ticker) > 10) {

      setNotice("This ticker must contain between 1 and 10 words.");

      return;

    }

    if (warnings.length > 0) {

      setNotice(

        "Resolve or review the editorial warnings before approving this ticker.",

      );

      return;

    }

    setStories((current) =>

      current.map((item) =>

        item.id === id ? { ...item, approved: true } : item,

      ),

    );

    setNotice("Ticker approved.");

  }

  function moveStory(id: string, direction: -1 | 1) {

    setStories((current) => {

      const index = current.findIndex((story) => story.id === id);

      const nextIndex = index + direction;

      if (index < 0 || nextIndex < 0 || nextIndex >= current.length) {

        return current;

      }

      const next = [...current];

      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];

      return next;

    });

  }

  function removeStory(id: string) {

    setStories((current) => current.filter((story) => story.id !== id));

    setNotice("Announcement removed.");

  }

  function exportApproved() {

    const approved = stories.filter(

      (story) =>

        story.approved &&

        story.ticker.trim() &&

        countWords(story.ticker) <= 10,

    );

    if (approved.length === 0) {

      setNotice("There are no approved tickers to export.");

      return;

    }

    const payload = {

      format: "news-ticker-export",

      version: 1,

      exportedAt: new Date().toISOString(),

      count: approved.length,

      tickers: approved.map((story, index) => ({

        order: index + 1,

        id: story.id,

        ticker: story.ticker.trim(),

        source: story.source,

        approved: true,

      })),

    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], {

      type: "application/json",

    });

    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");

    link.href = url;

    link.download = "approved-news-tickers.json";

    document.body.appendChild(link);

    link.click();

    link.remove();

    URL.revokeObjectURL(url);

    setNotice(`${approved.length} approved ticker(s) exported.`);

  }

  async function handleFileUpload(file?: File) {

    if (!file) return;

    try {

      const text = await file.text();

      setBatchInput(text);

      setActiveInput("batch");

      setNotice(

        "Text file loaded. Separate announcements with blank lines or individual lines.",

      );

    } catch {

      setNotice("Could not read this file. Please try a plain text (.txt) file.");

    }

  }

  return (

    <main className="app-shell">

      <header className="topbar">

        <a className="brand" href="#" aria-label="News Desk home">

          <span className="brand-mark">N</span>

          <span>

            <strong>NEWS DESK</strong>

            <small>LIVE TICKER STUDIO</small>

          </span>

        </a>

        <div className="topbar-right">

          <span className="live-dot" />

          EDITORIAL WORKSPACE

        </div>

      </header>

      <section className="hero">

        <div className="eyebrow"><span /> EDITORIAL CONTROL ROOM</div>

        <h1>From announcement<br /><em>to on-air.</em></h1>

        <p className="hero-copy">

          Turn source announcements into concise broadcast tickers.

          Review every word, preserve the facts, and approve only what is ready.

        </p>

        <div className="hero-meta">

          <span><b>01</b> GENERATE</span>

          <span><b>02</b> REVIEW</span>

          <span><b>03</b> APPROVE &amp; EXPORT</span>

        </div>

      </section>

      <section className="workspace">

        <div className="section-heading">

          <div>

            <span className="section-kicker">01 / INPUT DESK</span>

            <h2>Add announcements</h2>

            <p>Start with one announcement or process a batch.</p>

          </div>

          <button className="button button-quiet" onClick={loadExamples} type="button">

            <span aria-hidden="true">↻</span> Load examples

          </button>

        </div>

        <div className="input-panel">

          <div className="tab-row" role="tablist" aria-label="Input mode">

            <button

              className={`tab ${activeInput === "single" ? "active" : ""}`}

              onClick={() => setActiveInput("single")}

              type="button"

              role="tab"

              aria-selected={activeInput === "single"}

            >

              Single announcement

            </button>

            <button

              className={`tab ${activeInput === "batch" ? "active" : ""}`}

              onClick={() => setActiveInput("batch")}

              type="button"

              role="tab"

              aria-selected={activeInput === "batch"}

            >

              Batch input

            </button>

          </div>

          {activeInput === "single" ? (

            <div className="input-content">

              <label htmlFor="single-source">SOURCE ANNOUNCEMENT</label>

              <textarea

                id="single-source"

                value={singleInput}

                onChange={(event) => setSingleInput(event.target.value)}

                placeholder="Paste the full announcement here…"

                rows={5}

              />

              <div className="input-footer">

                <span>{countWords(singleInput)} words in source</span>

                <button className="button button-primary" onClick={handleSingleSubmit} type="button">

                  Generate ticker <span aria-hidden="true">↗</span>

                </button>

              </div>

            </div>

          ) : (

            <div className="input-content">

              <label htmlFor="batch-source">MULTIPLE SOURCE ANNOUNCEMENTS</label>

              <textarea

                id="batch-source"

                value={batchInput}

                onChange={(event) => setBatchInput(event.target.value)}

                placeholder={"Paste announcements on separate lines or paragraphs…\n\nEach item becomes a separate review card."}

                rows={7}

              />

              <div className="input-footer">

                <span>Use one announcement per line or paragraph</span>

                <div className="button-row">

                  <button

                    className="button button-quiet"

                    onClick={() => fileInputRef.current?.click()}

                    type="button"

                  >

                    Upload .txt

                  </button>

                  <input

                    ref={fileInputRef}

                    className="visually-hidden"

                    type="file"

                    accept=".txt,text/plain"

                    onChange={(event) => {

                      void handleFileUpload(event.target.files?.[0]);

                      event.target.value = "";

                    }}

                  />

                  <button className="button button-primary" onClick={handleBatchSubmit} type="button">

                    Generate batch <span aria-hidden="true">↗</span>

                  </button>

                </div>

              </div>

            </div>

          )}

        </div>

        {notice && (

          <div className="notice" role="status">

            <span aria-hidden="true">ⓘ</span> {notice}

            <button onClick={() => setNotice("")} aria-label="Dismiss message" type="button">×</button>

          </div>

        )}

        <section className="review-section">

          <div className="section-heading review-heading">

            <div>

              <span className="section-kicker">02 / EDITORIAL REVIEW</span>

              <h2>Review queue <span className="count-pill">{stories.length}</span></h2>

              <p>Every ticker stays linked to its original source.</p>

            </div>

            <button className="button button-primary export-button" onClick={exportApproved} type="button">

              Export approved <span aria-hidden="true">↓</span>

            </button>

          </div>

          <div className="stats-row">

            <div className="stat-card">

              <span className="stat-label">TOTAL STORIES</span>

              <strong>{stories.length.toString().padStart(2, "0")}</strong>

            </div>

            <div className="stat-card">

              <span className="stat-label">AWAITING REVIEW</span>

              <strong>{pendingCount.toString().padStart(2, "0")}</strong>

            </div>

            <div className="stat-card">

              <span className="stat-label">APPROVED</span>

              <strong>{approvedCount.toString().padStart(2, "0")}</strong>

            </div>

          </div>

          <div className="queue-toolbar">

            <div className="filter-tabs" aria-label="Filter review queue">

              {(["all", "pending", "approved"] as Filter[]).map((item) => (

                <button

                  key={item}

                  type="button"

                  className={filter === item ? "filter active" : "filter"}

                  onClick={() => setFilter(item)}

                >

                  {item === "all" ? "All stories" : item === "pending" ? "Needs review" : "Approved"}

                </button>

              ))}

            </div>

            <span className="queue-note">MAXIMUM 10 WORDS PER TICKER</span>

          </div>

          {visibleStories.length === 0 ? (

            <div className="empty-state">

              <div className="empty-icon">✳</div>

              <h3>{stories.length === 0 ? "Your review queue is empty" : "Nothing in this filter"}</h3>

              <p>

                {stories.length === 0

                  ? "Add an announcement above or load the example stories to see the workflow."

                  : "Choose another filter to view more stories."}

              </p>

              {stories.length === 0 && (

                <button className="button button-quiet" onClick={loadExamples} type="button">

                  Load example stories

                </button>

              )}

            </div>

          ) : (

            <div className="story-list">

              {visibleStories.map((story) => {

                const words = countWords(story.ticker);

                const warnings = getWarnings(story.ticker, story.source);

                const canApprove = words > 0 && words <= 10 && warnings.length === 0;

                return (

                  <article className="story-card" key={story.id}>

                    <div className="story-topline">

                      <div className="story-index">

                        <span className="story-number">

                          {String(stories.findIndex((item) => item.id === story.id) + 1).padStart(2, "0")}

                        </span>

                        <span className="source-label">SOURCE LINKED</span>

                      </div>

                      <div className="story-actions">

                        <button className="icon-button" type="button" onClick={() => moveStory(story.id, -1)} title="Move up" aria-label="Move story up">↑</button>

                        <button className="icon-button" type="button" onClick={() => moveStory(story.id, 1)} title="Move down" aria-label="Move story down">↓</button>

                        <button className="icon-button remove-button" type="button" onClick={() => removeStory(story.id)} title="Remove story" aria-label="Remove story">×</button>

                      </div>

                    </div>

                    <div className="story-grid">

                      <div className="source-column">

                        <div className="column-label"><span className="label-dot" /> ORIGINAL ANNOUNCEMENT</div>

                        <p className="source-text">{story.source}</p>

                      </div>

                      <div className="ticker-column">

                        <div className="column-label"><span className="label-dot ticker-dot" /> GENERATED TICKER</div>

                        <textarea

                          className="ticker-editor"

                          aria-label="Edit ticker text"

                          value={story.ticker}

                          onChange={(event) => updateTicker(story.id, event.target.value)}

                          rows={3}

                        />

                        <div className="ticker-footer">

                          <span className={`word-count ${words > 10 ? "over-limit" : ""}`}>

                            {words} / 10 WORDS

                          </span>

                          <button className="text-button" onClick={() => regenerate(story.id)} type="button">

                            ↻ Regenerate

                          </button>

                        </div>

                      </div>

                    </div>

                    {warnings.length > 0 && (

                      <div className="warning-panel">

                        <strong><span aria-hidden="true">!</span> Editorial checks</strong>

                        <ul>

                          {warnings.map((warning) => <li key={warning}>{warning}</li>)}

                        </ul>

                      </div>

                    )}

                    <div className="story-bottom">

                      <span className={story.approved ? "status approved-status" : "status pending-status"}>

                        <span /> {story.approved ? "APPROVED FOR EXPORT" : "PENDING REVIEW"}

                      </span>

                      <button

                        className={`button ${story.approved ? "button-approved" : "button-primary"}`}

                        onClick={() => toggleApproval(story.id)}

                        disabled={!story.approved && !canApprove}

                        type="button"

                        title={!story.approved && !canApprove ? "Resolve editorial checks before approval" : ""}

                      >

                        {story.approved ? "✓ Approved — undo" : "Approve ticker"}

                      </button>

                    </div>

                  </article>

                );

              })}

            </div>

          )}

        </section>

      </section>

      <footer className="footer">

        <span>NEWS DESK <span className="footer-divider">/</span> EDITORIAL TOOLKIT</span>

        <span>Human review is required before broadcast.</span>

      </footer>

    </main>

  );

}

export default App;
