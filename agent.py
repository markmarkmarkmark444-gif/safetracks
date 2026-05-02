import json
import anthropic
from trello_client import TrelloClient
from tools import TOOLS

MODEL = "claude-sonnet-4-6"

SYSTEM_PROMPT = """\
You are a helpful assistant that lets users interact with their Trello boards conversationally.

You can:
- List and summarize boards
- Describe what's on a board (lists, cards, due dates)
- Create new boards, lists, and cards
- Move cards between lists
- Generate annual/period reviews based on board contents
- Help plan and set up new boards based on user goals

When creating boards or lists from a conversation, confirm the structure with the user before creating.
Be concise, friendly, and proactive about offering insights from board data.
"""


def dispatch_tool(client: TrelloClient, name: str, inputs: dict) -> str:
    try:
        if name == "list_boards":
            boards = client.list_boards()
            return json.dumps(boards)
        elif name == "get_board_summary":
            summary = client.get_board_summary(inputs["board_id"])
            return json.dumps(summary)
        elif name == "create_board":
            board = client.create_board(inputs["name"], inputs.get("desc", ""))
            return json.dumps({"id": board["id"], "name": board["name"], "url": board.get("url", "")})
        elif name == "create_list":
            lst = client.create_list(inputs["board_id"], inputs["name"])
            return json.dumps({"id": lst["id"], "name": lst["name"]})
        elif name == "get_lists":
            lists = client.get_lists(inputs["board_id"])
            return json.dumps(lists)
        elif name == "create_card":
            card = client.create_card(
                inputs["list_id"],
                inputs["name"],
                inputs.get("desc", ""),
                inputs.get("due"),
            )
            return json.dumps({"id": card["id"], "name": card["name"], "url": card.get("url", "")})
        elif name == "move_card":
            card = client.move_card(inputs["card_id"], inputs["list_id"])
            return json.dumps({"id": card["id"], "name": card["name"]})
        elif name == "get_cards_in_list":
            cards = client.get_cards_in_list(inputs["list_id"])
            return json.dumps(cards)
        else:
            return json.dumps({"error": f"Unknown tool: {name}"})
    except Exception as e:
        return json.dumps({"error": str(e)})


class TrelloAgent:
    def __init__(self, trello: TrelloClient, anthropic_api_key: str):
        self.trello = trello
        self.ai = anthropic.Anthropic(api_key=anthropic_api_key)
        self.history: list[dict] = []

    def chat(self, user_message: str) -> str:
        self.history.append({"role": "user", "content": user_message})

        while True:
            response = self.ai.messages.create(
                model=MODEL,
                max_tokens=4096,
                system=SYSTEM_PROMPT,
                tools=TOOLS,
                messages=self.history,
            )

            # Collect any text from this turn
            text_parts = [b.text for b in response.content if b.type == "text"]
            tool_uses = [b for b in response.content if b.type == "tool_use"]

            if response.stop_reason == "end_turn" or not tool_uses:
                # No more tool calls — return the final text response
                assistant_text = " ".join(text_parts).strip()
                self.history.append({"role": "assistant", "content": response.content})
                return assistant_text

            # Append assistant turn with tool use blocks
            self.history.append({"role": "assistant", "content": response.content})

            # Execute each tool and build tool_result blocks
            tool_results = []
            for tu in tool_uses:
                result = dispatch_tool(self.trello, tu.name, tu.input)
                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": tu.id,
                    "content": result,
                })

            self.history.append({"role": "user", "content": tool_results})
