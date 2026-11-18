from backend import config


def test_groq_setting_uses_env_file_when_process_value_is_empty(
    tmp_path, monkeypatch
):
    (tmp_path / ".env").write_text("GROQ_API_KEY=file-key\n", encoding="utf-8")
    monkeypatch.setattr(config, "ROOT", tmp_path)
    monkeypatch.setenv("GROQ_API_KEY", "")

    assert config._groq_setting("GROQ_API_KEY") == "file-key"


def test_nonempty_process_groq_setting_takes_precedence(tmp_path, monkeypatch):
    (tmp_path / ".env").write_text("GROQ_API_KEY=file-key\n", encoding="utf-8")
    monkeypatch.setattr(config, "ROOT", tmp_path)
    monkeypatch.setenv("GROQ_API_KEY", "process-key")

    assert config._groq_setting("GROQ_API_KEY") == "process-key"


def test_groq_setting_returns_empty_when_unconfigured(tmp_path, monkeypatch):
    (tmp_path / ".env").write_text("GROQ_API_KEY=\n", encoding="utf-8")
    monkeypatch.setattr(config, "ROOT", tmp_path)
    monkeypatch.setenv("GROQ_API_KEY", "")

    assert config._groq_setting("GROQ_API_KEY") == ""
