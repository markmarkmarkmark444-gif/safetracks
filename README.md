# safetracks

Chat with your Trello boards using Claude AI. Inspired by [Brittany Joiner's article](https://trello.substack.com/p/ive-been-talking-to-my-trello-boards) on conversational Trello via Claude Code.

## What it does

- **Summarize boards** — ask "what's on my work board?" and get a full overview
- **Create boards & cards** — describe your project and let Claude build the board structure
- **Annual reviews** — ask Claude to surface accomplishments from a board's history
- **Move & manage cards** — update card state conversationally

## Setup

### 1. Install dependencies

```bash
pip install -r requirements.txt
```

### 2. Get your credentials

- **Anthropic API key**: [console.anthropic.com](https://console.anthropic.com)
- **Trello API key & token**: [trello.com/app-key](https://trello.com/app-key)

### 3. Configure environment

```bash
cp .env.example .env
# Edit .env with your keys
```

### 4. Run

```bash
python main.py
```

## Example conversations

```
You: What boards do I have?
Claude: You have 3 open boards: Work Q2, Personal Goals, and Home Reno.

You: Summarize my Work Q2 board
Claude: Your Work Q2 board has 4 lists...

You: Create a board for my new mobile app project with lists for Backlog, In Progress, Review, and Done
Claude: I'll create that board now...

You: Move the "Design mockups" card to the Review list
Claude: Done! "Design mockups" has been moved to Review.
```

## Architecture

| File | Purpose |
|------|---------|
| `main.py` | CLI entrypoint and REPL loop |
| `agent.py` | Claude conversation loop with tool use |
| `trello_client.py` | Trello REST API wrapper |
| `tools.py` | Tool schemas passed to the Claude API |
