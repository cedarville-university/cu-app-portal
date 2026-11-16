"""Run against generated main.py and graph_groups.py with starter requirements installed."""
import json
import time
import unittest
from unittest.mock import AsyncMock, patch

import httpx
from fastapi import HTTPException
from fastapi.testclient import TestClient
from starlette.requests import Request
from starlette.responses import Response

import main
import graph_groups as groups

A = "11111111-1111-1111-1111-111111111111"
B = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
URL = "https://graph.microsoft.com/v1.0/me/transitiveMemberOf"


class GroupTests(unittest.IsolatedAsyncioTestCase):
    def request(self, token="private-token", expires=None):
        session = {"user": {"name": "User"}, "graph_session_id": "session-id"}
        initial = Request({"type": "http", "headers": [], "session": session})
        response = Response()
        groups.save_graph_token(initial, response, {
            "access_token": token, "expires_at": expires if expires is not None else time.time() + 3600,
        })
        cookies = [value.decode().split(";", 1)[0] for key, value in response.raw_headers if key == b"set-cookie"]
        return Request({"type": "http", "headers": [(b"cookie", "; ".join(cookies).encode())], "session": session}), response

    async def test_pagination_roles_and_membership(self):
        request, _ = self.request()
        seen = []

        def graph(req):
            self.assertEqual(req.headers["authorization"], "Bearer private-token")
            self.assertEqual(req.url.host, "graph.microsoft.com")
            seen.append(str(req.url))
            return httpx.Response(200, json={"value": [{"id": B, "@odata.type": "#microsoft.graph.group"}]} if "skiptoken" in str(req.url) else {
                "value": [{"id": A, "@odata.type": "#microsoft.graph.group"}, {"id": "role", "@odata.type": "#microsoft.graph.directoryRole"}, {"id": A, "@odata.type": "#microsoft.graph.group"}],
                "@odata.nextLink": URL + "?$skiptoken=page2",
            })

        client_class = httpx.AsyncClient
        with patch.object(groups.httpx, "AsyncClient", side_effect=lambda **kw: client_class(transport=httpx.MockTransport(graph), **kw)):
            self.assertEqual(await groups.get_user_group_ids(request), [A, B])
            self.assertTrue(await groups.is_user_in_group(request, B.upper()))
            self.assertFalse(await groups.is_user_in_group(request, "22222222-2222-2222-2222-222222222222"))
        self.assertEqual(len(seen), 6)

    async def test_missing_expired_tampered_or_other_session_token_requires_login(self):
        request, _ = self.request()
        with patch.object(groups.time, "time", return_value=1000):
            expired = self.request(expires=2000)[0]
        variants = [Request({"type": "http", "headers": [], "session": {}}), expired]
        variants.append(Request({"type": "http", "headers": request.scope["headers"], "session": {"user": {"name": "User"}, "graph_session_id": "other"}}))
        variants.append(Request({"type": "http", "headers": [(b"cookie", b"cu_graph.0=tampered")], "session": request.session}))
        for candidate in variants:
            with self.assertRaises(HTTPException) as error:
                await groups.get_user_group_ids(candidate)
            self.assertEqual(error.exception.status_code, 401)

    async def test_errors_and_bad_pagination_fail_closed(self):
        request, _ = self.request()
        cases = [(status, {}, 401 if status == 401 else 503) for status in [401, 403, 429, 500]]
        cases += [(200, body, 503) for body in [
            {"value": [], "@odata.nextLink": "https://evil.test/steal"},
            {"value": [], "@odata.nextLink": URL + "?loop=1"},
            {"value": None}, {"value": [{"@odata.type": "#microsoft.graph.group"}]},
        ]]
        client_class = httpx.AsyncClient
        for status, body, expected in cases:
            with self.subTest(status=status, body=body):
                def graph(req):
                    self.assertEqual(req.url.host, "graph.microsoft.com")
                    return httpx.Response(status, json=body)
                with patch.object(groups.httpx, "AsyncClient", side_effect=lambda **kw: client_class(transport=httpx.MockTransport(graph), **kw)):
                    with self.assertRaises(HTTPException) as error:
                        await groups.is_user_in_group(request, A)
                    self.assertEqual(error.exception.status_code, expected)

    def test_encrypted_chunked_http_only_cookies_and_logout(self):
        request, response = self.request(token="secret-token-" * 600)
        cookies = response.headers.getlist("set-cookie")
        self.assertGreater(len(cookies), 1)
        self.assertNotIn("secret-token", str(cookies))
        self.assertNotIn("access_token", json.dumps(request.session))
        self.assertEqual(groups._access_token(request), "secret-token-" * 600)
        for cookie in cookies:
            self.assertIn("HttpOnly", cookie)
            self.assertIn("Secure", cookie)
            self.assertIn("SameSite=lax", cookie)
            self.assertLess(len(cookie), 4096)
        groups.clear_graph_token(response)
        self.assertIn("Max-Age=0", str(response.headers.getlist("set-cookie")))

    def test_auth_callback_does_not_expose_tokens_and_keeps_health_public(self):
        self.assertIn("User.Read", main.oauth.microsoft.client_kwargs["scope"].split())
        with TestClient(main.app, base_url="https://groups.example.test", follow_redirects=False) as client:
            self.assertEqual(client.get("/api/health").status_code, 200)
            self.assertEqual(client.get("/api/private").status_code, 401)
            with patch.object(main.oauth.microsoft, "authorize_access_token", new=AsyncMock(return_value={
                "access_token": "very-secret-token", "expires_at": time.time() + 3600,
                "userinfo": {"name": "User", "email": "user@example.test"},
            })):
                response = client.get("/auth/callback")
            self.assertEqual(response.status_code, 307)
            self.assertNotIn("very-secret-token", str(response.headers))
            protected = client.get("/protected")
            self.assertEqual(protected.status_code, 200)
            self.assertEqual(protected.json()["user"], {"name": "User", "email": "user@example.test"})
            logout = client.get("/logout")
            self.assertIn("Max-Age=0", str(logout.headers.get_list("set-cookie")))
            self.assertEqual(client.get("/api/private").status_code, 401)


if __name__ == "__main__":
    unittest.main()
