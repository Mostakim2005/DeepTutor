from pathlib import Path

from deeptutor.services.settings import export_presets as svc


def test_export_presets_crud_and_last_used(tmp_path: Path, monkeypatch) -> None:
    presets_file = tmp_path / "export_presets.json"
    monkeypatch.setattr(svc, "_get_presets_path", lambda: presets_file)

    initial = svc.load_export_presets()
    assert initial["last_used_preset_id"] is None
    assert len(initial["presets"]) >= 3

    saved = svc.upsert_export_preset(
        "exam-notes",
        {
            "name": "Exam Notes",
            "format": "markdown",
            "scope": "answers",
            "options": {"includeUserPrompts": False, "includeThinking": False},
        },
    )
    assert saved["last_used_preset_id"] == "exam-notes"
    assert any(p["id"] == "exam-notes" and p["format"] == "markdown" for p in saved["presets"])

    reloaded = svc.set_last_used_export_preset("study-handout-docx")
    assert reloaded["last_used_preset_id"] == "study-handout-docx"

    assert svc.delete_export_preset("exam-notes") is True
    assert svc.delete_export_preset("exam-notes") is False
    after_delete = svc.load_export_presets()
    assert all(p["id"] != "exam-notes" for p in after_delete["presets"])
