"""Tool definitions passed to the Claude API."""

TOOLS = [
    {
        "name": "list_boards",
        "description": "List all open Trello boards for the authenticated user.",
        "input_schema": {
            "type": "object",
            "properties": {},
            "required": [],
        },
    },
    {
        "name": "get_board_summary",
        "description": (
            "Get a full snapshot of a Trello board including all its lists and cards. "
            "Use this to answer questions about what's on a board, do a review, or plan next steps."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "board_id": {"type": "string", "description": "The Trello board ID"},
            },
            "required": ["board_id"],
        },
    },
    {
        "name": "create_board",
        "description": "Create a new Trello board.",
        "input_schema": {
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "Board name"},
                "desc": {"type": "string", "description": "Optional board description"},
            },
            "required": ["name"],
        },
    },
    {
        "name": "create_list",
        "description": "Add a new list to an existing Trello board.",
        "input_schema": {
            "type": "object",
            "properties": {
                "board_id": {"type": "string", "description": "The board ID"},
                "name": {"type": "string", "description": "List name"},
            },
            "required": ["board_id", "name"],
        },
    },
    {
        "name": "get_lists",
        "description": "Get all lists on a Trello board.",
        "input_schema": {
            "type": "object",
            "properties": {
                "board_id": {"type": "string", "description": "The board ID"},
            },
            "required": ["board_id"],
        },
    },
    {
        "name": "create_card",
        "description": "Create a new card in a Trello list.",
        "input_schema": {
            "type": "object",
            "properties": {
                "list_id": {"type": "string", "description": "The list ID to add the card to"},
                "name": {"type": "string", "description": "Card title"},
                "desc": {"type": "string", "description": "Card description"},
                "due": {
                    "type": "string",
                    "description": "Due date in ISO 8601 format, e.g. 2025-06-01T00:00:00.000Z",
                },
            },
            "required": ["list_id", "name"],
        },
    },
    {
        "name": "move_card",
        "description": "Move a card to a different list.",
        "input_schema": {
            "type": "object",
            "properties": {
                "card_id": {"type": "string", "description": "The card ID"},
                "list_id": {"type": "string", "description": "The destination list ID"},
            },
            "required": ["card_id", "list_id"],
        },
    },
    {
        "name": "get_cards_in_list",
        "description": "Get all cards in a specific Trello list.",
        "input_schema": {
            "type": "object",
            "properties": {
                "list_id": {"type": "string", "description": "The list ID"},
            },
            "required": ["list_id"],
        },
    },
]
