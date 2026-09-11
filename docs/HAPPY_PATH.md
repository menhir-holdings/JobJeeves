# JobJeeves — v1 gold path

**Live:** https://jobjeeves-menhir-holdings.vercel.app

## Happy path

1. Open JobJeeves.
2. Set your **base resume** once — upload a PDF or paste text (persists for the browser session).
3. Paste a **job description**.
4. Click **Analyze & tailor**.
5. Review match score, keywords, and suggestions.
6. **Copy** or **Download** the tailored resume from the results pane.

## Requirements

- Resume PDF must contain extractable text (not scanned/image-only).
- Job-description mode requires an LLM key on the server (`GROQ_API_KEY` or `OPENAI_API_KEY`).

## Non-goals (v1)

- No accounts, CRM, or application tracking.
- No guaranteed PDF export formatting — export is plain text.
