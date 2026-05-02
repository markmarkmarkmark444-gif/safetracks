import os
import requests
from typing import Optional

TRELLO_BASE = "https://api.trello.com/1"


class TrelloClient:
    def __init__(self, api_key: str, token: str):
        self.auth = {"key": api_key, "token": token}

    def _get(self, path: str, params: dict = None) -> dict | list:
        r = requests.get(f"{TRELLO_BASE}{path}", params={**(params or {}), **self.auth})
        r.raise_for_status()
        return r.json()

    def _post(self, path: str, data: dict = None) -> dict:
        r = requests.post(f"{TRELLO_BASE}{path}", params=self.auth, json=data or {})
        r.raise_for_status()
        return r.json()

    def _put(self, path: str, data: dict = None) -> dict:
        r = requests.put(f"{TRELLO_BASE}{path}", params=self.auth, json=data or {})
        r.raise_for_status()
        return r.json()

    # Boards
    def list_boards(self) -> list[dict]:
        boards = self._get("/members/me/boards", {"fields": "id,name,desc,closed,url"})
        return [b for b in boards if not b.get("closed")]

    def get_board(self, board_id: str) -> dict:
        return self._get(f"/boards/{board_id}", {"fields": "id,name,desc,url"})

    def create_board(self, name: str, desc: str = "") -> dict:
        return self._post("/boards", {"name": name, "desc": desc, "defaultLists": False})

    # Lists
    def get_lists(self, board_id: str) -> list[dict]:
        return self._get(f"/boards/{board_id}/lists", {"fields": "id,name,pos"})

    def create_list(self, board_id: str, name: str) -> dict:
        return self._post("/lists", {"name": name, "idBoard": board_id})

    # Cards
    def get_cards(self, board_id: str) -> list[dict]:
        return self._get(
            f"/boards/{board_id}/cards",
            {"fields": "id,name,desc,due,dueComplete,idList,labels,url"},
        )

    def get_cards_in_list(self, list_id: str) -> list[dict]:
        return self._get(
            f"/lists/{list_id}/cards",
            {"fields": "id,name,desc,due,dueComplete,labels,url"},
        )

    def create_card(self, list_id: str, name: str, desc: str = "", due: Optional[str] = None) -> dict:
        data = {"name": name, "idList": list_id, "desc": desc}
        if due:
            data["due"] = due
        return self._post("/cards", data)

    def update_card(self, card_id: str, **kwargs) -> dict:
        return self._put(f"/cards/{card_id}", kwargs)

    def move_card(self, card_id: str, list_id: str) -> dict:
        return self._put(f"/cards/{card_id}", {"idList": list_id})

    # Summary helper: full board snapshot
    def get_board_summary(self, board_id: str) -> dict:
        board = self.get_board(board_id)
        lists = self.get_lists(board_id)
        cards = self.get_cards(board_id)

        cards_by_list = {}
        for lst in lists:
            cards_by_list[lst["id"]] = {
                "name": lst["name"],
                "cards": [],
            }
        for card in cards:
            lid = card.get("idList")
            if lid in cards_by_list:
                cards_by_list[lid]["cards"].append({
                    "name": card["name"],
                    "desc": card.get("desc", ""),
                    "due": card.get("due"),
                    "dueComplete": card.get("dueComplete", False),
                    "url": card.get("url", ""),
                })

        return {
            "id": board["id"],
            "name": board["name"],
            "desc": board.get("desc", ""),
            "url": board.get("url", ""),
            "lists": list(cards_by_list.values()),
        }
