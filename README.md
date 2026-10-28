# News Desk — Live Ticker Studio

A local web application for generating short, broadcast-style news tickers from announcements, reviewing and editing them, approving selected tickers, and exporting the approved set as JSON.

## 1. Setup and Run

### Requirements
- Node.js and npm
- A modern web browser

### Installation

1. Open a terminal in the project root directory (the folder containing `package.json`).
2. Install dependencies:

   ```bash
   npm install
   ```

3. Start the frontend and backend together:

   ```bash
   npm run dev:all
   ```

4. Open the application in your browser:

   `http://localhost:5173`

The backend health endpoint is available at:

`http://127.0.0.1:3001/api/health`

To stop the development servers, press `Ctrl+C` in the terminal.

## 2. Optional AI API Integration

The project includes an Express backend endpoint for AI-based ticker generation and an `.env.example` file describing the required environment variables.

To enable API-backed generation, create a `.env` file from `.env.example` and configure a valid API key and model.

The API key is not included in the submission. Keep your actual `.env` file private and never commit it to GitHub. API usage may incur charges separate from a ChatGPT subscription.

A local rule-based fallback is also included so the application can run without an API key.

## 3. Approach and Key Decisions

### Rule-Based Local Generation

A dependable NLP model was not integrated within the project timeframe. Therefore, a lightweight, rule-based heuristic was implemented as the local fallback instead of relying on an external model.

The algorithm evaluates candidate word windows from the source announcement rather than simply taking the first ten words. It scores candidates using signals such as news-action terms, numbers, capitalization, source position, and clause boundaries.

### Length and Style Constraints

Generated tickers are intended to be concise, broadcast-style headlines with a maximum length of 10 words. Unicode-aware word counting is used to support multilingual text, including Malayalam combining marks.

### Source Faithfulness

The local algorithm favours wording extracted from the original announcement to reduce the risk of introducing unsupported information. Heuristic checks can flag potential problems such as unsupported numbers or wording, missing negation, and length violations.

These checks assist editorial review but do not guarantee complete semantic accuracy.

### Editorial Review and Approval

Each generated ticker remains associated with its source announcement. Users can review and edit tickers, regenerate them, reorder items, remove items, and approve the final selection.

### JSON Export

Only approved tickers are included in the JSON export, supporting a simple editorial approval workflow.

## 4. Limitations and Future Improvements

The rule-based fallback does not fully understand context and may miss the primary news angle or omit important dates, numbers, locations, or qualifications. This is particularly challenging for Malayalam and other multilingual inputs.

An API-backed generation path is provided for model-based summarization when valid credentials are configured. Model-generated results should still be checked against the original source before publication.

Potential future improvements include stronger multilingual NLP summarization, better preservation of key facts, and more comprehensive semantic source-faithfulness checks.

## 5. Example Announcements

See `examples.txt` for sample English and Malayalam announcements that can be used to test the application. These are example inputs, not guaranteed reference outputs.

## 6. Build Verification

To check the frontend for TypeScript and build errors, run:

```bash
npm run build
```
