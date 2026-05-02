#!/usr/bin/env python3
"""
safetracks — chat with your Trello boards using Claude AI.

Usage:
    python main.py

Environment variables (or .env file):
    ANTHROPIC_API_KEY   Your Anthropic API key
    TRELLO_API_KEY      Your Trello API key
    TRELLO_TOKEN        Your Trello user token
"""

import os
import sys
from dotenv import load_dotenv
from trello_client import TrelloClient
from agent import TrelloAgent

load_dotenv()

BANNER = """
╔══════════════════════════════════════════╗
║         safetracks — Trello AI           ║
║  Chat with your boards. Type 'quit'.     ║
╚══════════════════════════════════════════╝
"""


def main():
    anthropic_key = os.environ.get("ANTHROPIC_API_KEY")
    trello_key = os.environ.get("TRELLO_API_KEY")
    trello_token = os.environ.get("TRELLO_TOKEN")

    missing = [
        name
        for name, val in [
            ("ANTHROPIC_API_KEY", anthropic_key),
            ("TRELLO_API_KEY", trello_key),
            ("TRELLO_TOKEN", trello_token),
        ]
        if not val
    ]
    if missing:
        print(f"Error: missing environment variables: {', '.join(missing)}")
        print("Copy .env.example to .env and fill in your credentials.")
        sys.exit(1)

    trello = TrelloClient(trello_key, trello_token)
    agent = TrelloAgent(trello, anthropic_key)

    print(BANNER)
    print("Try: 'What boards do I have?' or 'Summarize my work board' or 'Create a project board for my new app'")
    print()

    while True:
        try:
            user_input = input("You: ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\nBye!")
            break

        if not user_input:
            continue
        if user_input.lower() in {"quit", "exit", "bye"}:
            print("Bye!")
            break

        print("Claude: ", end="", flush=True)
        response = agent.chat(user_input)
        print(response)
        print()


if __name__ == "__main__":
    main()
