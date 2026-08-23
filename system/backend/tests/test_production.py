"""Production бэлэн байдлын тестүүд — олдсон алдаануудыг түгжинэ."""
import io


def test_file_upload_then_download(client, as_role):
    """РЕГРЕСС: /api/files/dl/{id} нь /api/files/{entity}/{id} route-тай мөргөлдөж
    файл татах ажиллахгүй байсан."""
    h = as_role("otgoo")
    up = client.post("/api/files/contract/1", headers=h,
                     files={"file": ("geree.pdf", b"%PDF-1.4 test content", "application/pdf")})
    assert up.status_code == 200
    fid = up.json()["id"]
    lst = client.get("/api/files/contract/1", headers=h).json()
    assert any(f["id"] == fid for f in lst)
    dl = client.get(f"/api/files/dl/{fid}", headers=h)
    assert dl.status_code == 200
    assert dl.content == b"%PDF-1.4 test content"


def test_change_own_password(client, as_role):
    h = as_role("sanhuu")
    bad = client.post("/api/auth/change-password", headers=h,
                      json={"old_password": "буруу", "new_password": "шинэ1234"})
    assert bad.status_code == 400
    short = client.post("/api/auth/change-password", headers=h,
                        json={"old_password": "1234", "new_password": "123"})
    assert short.status_code == 400
    ok = client.post("/api/auth/change-password", headers=h,
                     json={"old_password": "1234", "new_password": "шинэ1234"})
    assert ok.status_code == 200
    assert client.post("/api/auth/login",
                       json={"username": "sanhuu", "password": "1234"}).status_code == 401
    assert client.post("/api/auth/login",
                       json={"username": "sanhuu", "password": "шинэ1234"}).status_code == 200


def test_health_reports_version_and_db(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    d = r.json()
    assert d["ok"] is True
    assert "version" in d and "clients" in d and "contracts" in d


def test_upload_rejects_dangerous_extension(client, as_role):
    h = as_role("otgoo")
    bad = client.post("/api/files/contract/1", headers=h,
                      files={"file": ("virus.exe", b"MZ", "application/octet-stream")})
    assert bad.status_code == 400
