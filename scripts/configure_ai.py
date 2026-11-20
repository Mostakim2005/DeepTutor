#!/usr/bin/env python3
"""Interactive AI Provider, Custom Model & CLI Harness Configuration Wizard for DeepTutor."""

from __future__ import annotations

import getpass
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import urllib.error
import urllib.request
from typing import Any

WORKSPACE_DIR = Path(__file__).resolve().parent.parent
os.environ.setdefault("DEEPTUTOR_HOME", str(WORKSPACE_DIR))
if str(WORKSPACE_DIR) not in sys.path:
    sys.path.insert(0, str(WORKSPACE_DIR))

PRESETS: dict[str, dict[str, Any]] = {
    "1": {
        "title": "Google Gemini (API Key)",
        "provider": "gemini",
        "default_model": "gemini-3.8-flash",
        "models_hint": "gemini-3.8-flash, gemini-4-argon, gemini-4-neon, gemini-4-hydrogen",
        "base_url": "https://generativelanguage.googleapis.com/v1beta/openai/",
        "api_format": "auto",
        "auth_type": "api_key",
        "key_env": "GEMINI_API_KEY",
    },
    "2": {
        "title": "OpenAI (API Key)",
        "provider": "openai",
        "default_model": "gpt-6-solasta",
        "models_hint": "gpt-6-solasta, gpt-5.4, gpt-4o, gpt-4o-mini",
        "base_url": "https://api.openai.com/v1",
        "api_format": "auto",
        "auth_type": "api_key",
        "key_env": "OPENAI_API_KEY",
    },
    "3": {
        "title": "OpenAI Codex (Subscription OAuth: ChatGPT Plus / Team)",
        "provider": "openai_codex",
        "default_model": "gpt-6-solasta",
        "models_hint": "gpt-6-solasta, gpt-5.4, gpt-4o",
        "base_url": "https://chatgpt.com/backend-api",
        "api_format": "auto",
        "auth_type": "oauth",
        "oauth_provider": "openai-codex",
    },
    "4": {
        "title": "Anthropic Claude (API Key)",
        "provider": "anthropic",
        "default_model": "claude-sonnet-5-5",
        "models_hint": "claude-sonnet-5-5, claude-opus-5-5",
        "base_url": "https://api.anthropic.com/v1",
        "api_format": "anthropic",
        "auth_type": "api_key",
        "key_env": "ANTHROPIC_API_KEY",
    },
    "5": {
        "title": "DeepSeek (API Key)",
        "provider": "deepseek",
        "default_model": "deepseek-v4.1-flash",
        "models_hint": "deepseek-v4.1-flash, deepseek-v4.1-flash-1017, deepseek-reasoner, deepseek-chat",
        "base_url": "https://api.deepseek.com/v1",
        "api_format": "auto",
        "auth_type": "api_key",
        "key_env": "DEEPSEEK_API_KEY",
    },
    "6": {
        "title": "GitHub Copilot (Subscription OAuth)",
        "provider": "github_copilot",
        "default_model": "gpt-5.4",
        "models_hint": "gpt-5.4, claude-sonnet-5-5, gpt-4o",
        "base_url": "",
        "api_format": "auto",
        "auth_type": "oauth",
        "oauth_provider": "github-copilot",
    },
    "7": {
        "title": "Local Ollama (No API Key needed)",
        "provider": "ollama",
        "default_model": "qwen3.8-flash",
        "models_hint": "qwen3.8-flash, glm-5-flash, llama3.1",
        "base_url": "http://localhost:11434/v1",
        "api_format": "auto",
        "auth_type": "local",
    },
}

_BUILTIN_LOCAL_HARNESSES: tuple[tuple[str, str, str], ...] = (
    ("antigravity", "Antigravity", "agy"),
    ("command_code", "Command Code", "cmdc"),
    ("opencode", "OpenCode", "opencode"),
    ("deepseek_harness", "DeepSeek Harness", "dsh"),
    ("freebuff", "FreeBuff", "freebuff"),
)


def _slugify(value: str) -> str:
    cleaned = re.sub(r"[^a-z0-9_-]+", "-", str(value or "").strip().lower()).strip("-")
    return cleaned or "custom"


def build_profile_id(provider: str, *, dedicated: bool = False) -> str:
    if not dedicated:
        return "llm-profile-agent-setup"
    return f"llm-profile-{_slugify(provider)}"


def parse_model_list(raw: str, fallback: str = "") -> list[str]:
    """Parse a comma-separated model list into deduplicated, non-empty slugs."""
    items = [part.strip() for part in str(raw or "").split(",") if part.strip()]
    if not items and fallback.strip():
        items = [fallback.strip()]
    return list(dict.fromkeys(items))


def discover_openai_compatible_models(
    base_url: str,
    api_key: str = "",
    *,
    timeout: float = 10.0,
) -> list[str]:
    """Query an OpenAI-compatible ``/models`` endpoint and return sorted model IDs."""
    cleaned = str(base_url or "").strip().rstrip("/")
    if not cleaned:
        return []
    url = cleaned if cleaned.endswith("/models") else f"{cleaned}/models"
    headers = {"Accept": "application/json", "User-Agent": "DeepTutor-ConfigureAI/1.7.3"}
    if api_key.strip():
        headers["Authorization"] = f"Bearer {api_key.strip()}"
    req = urllib.request.Request(url, headers=headers, method="GET")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            payload = json.loads(resp.read().decode("utf-8", "replace"))
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError):
        return []

    raw_items = payload.get("data") if isinstance(payload, dict) else payload
    if not isinstance(raw_items, list):
        return []
    ids: list[str] = []
    for item in raw_items:
        if isinstance(item, dict) and isinstance(item.get("id"), str) and item["id"].strip():
            ids.append(item["id"].strip())
        elif isinstance(item, str) and item.strip():
            ids.append(item.strip())
    return sorted(dict.fromkeys(ids))


def get_current_info() -> tuple[str, str, bool]:
    """Return (active_provider, active_model, has_credentials)."""
    try:
        from deeptutor.services.config import get_model_catalog_service

        catalog = get_model_catalog_service().load()
        llm = catalog.get("services", {}).get("llm", {})
        active_id = llm.get("active_profile_id")
        for p in llm.get("profiles", []):
            if p.get("id") == active_id:
                provider = p.get("binding", "unknown")
                models = p.get("models", [])
                model = models[0].get("model", "unknown") if models else "unknown"
                has_key = bool(p.get("api_key"))
                return (provider, model, has_key)
    except Exception:
        pass
    return ("(none)", "(none)", False)


def apply_llm_profile(
    provider: str,
    model: str | list[str],
    base_url: str = "",
    api_key: str = "",
    api_format: str = "auto",
    *,
    profile_name: str = "",
    dedicated_profile: bool = False,
) -> None:
    from deeptutor.services.config import get_model_catalog_service

    model_slugs = parse_model_list(
        ",".join(model) if isinstance(model, list) else str(model)
    )
    if not model_slugs:
        raise ValueError("At least one model ID is required")

    profile_id = build_profile_id(provider, dedicated=dedicated_profile)

    def mutator(catalog: dict[str, Any]) -> None:
        llm = catalog.setdefault("services", {}).setdefault("llm", {})
        profiles = llm.setdefault("profiles", [])

        existing = next((p for p in profiles if p.get("id") == profile_id), None)
        final_key = api_key
        if not final_key and existing and existing.get("binding") == provider:
            final_key = existing.get("api_key", "")

        model_entries = [
            {
                "id": f"{profile_id}-model-{idx}" if dedicated_profile else (
                    "llm-model-agent-setup" if idx == 0 else f"llm-model-agent-setup-{idx}"
                ),
                "name": slug,
                "model": slug,
            }
            for idx, slug in enumerate(model_slugs)
        ]

        new_profile = {
            "id": profile_id,
            "name": profile_name.strip() or f"Configured ({provider})",
            "binding": provider,
            "base_url": base_url,
            "api_key": final_key,
            "api_version": "",
            "extra_headers": {},
            "models": model_entries,
            "api_format": api_format,
            "wire_api": api_format,
        }

        if existing is not None:
            idx = profiles.index(existing)
            profiles[idx] = new_profile
        else:
            profiles.append(new_profile)

        llm["active_profile_id"] = profile_id
        llm["active_model_id"] = model_entries[0]["id"]

    get_model_catalog_service().update(mutator)
    print(f"\n[OK] Configuration saved: {provider} -> {', '.join(model_slugs)} (profile: {profile_id})")


def run_doctor() -> None:
    print("\n------------------------------------------------------------")
    print(" Running DeepTutor doctor readiness check...")
    print("------------------------------------------------------------")
    cmd = [sys.executable, "-m", "deeptutor_cli.main", "doctor"]
    subprocess.run(cmd, cwd=str(WORKSPACE_DIR))


def run_config_show() -> None:
    print("\n------------------------------------------------------------")
    print(" DeepTutor resolved configuration (secrets redacted):")
    print("------------------------------------------------------------")
    cmd = [sys.executable, "-m", "deeptutor_cli.main", "config", "show"]
    subprocess.run(cmd, cwd=str(WORKSPACE_DIR))


def run_provider_login(oauth_provider: str) -> None:
    print(f"\nLaunching OAuth sign-in flow for {oauth_provider}...")
    print("Follow the browser prompt or device code displayed below.")
    cmd = [sys.executable, "-m", "deeptutor_cli.main", "provider", "login", oauth_provider]
    subprocess.run(cmd, cwd=str(WORKSPACE_DIR))


def configure_preset(choice_key: str) -> None:
    spec = PRESETS[choice_key]
    print(f"\n>>> Setting up: {spec['title']}")

    default_model = spec.get("default_model", "")
    hint = spec.get("models_hint", "")
    if hint:
        print(f"Suggested high-intelligence models: {hint}")
    raw_model = input(f"Model ID(s) comma-separated [default: {default_model}]: ").strip()
    models = parse_model_list(raw_model, fallback=default_model)

    api_key = ""
    auth_type = spec.get("auth_type", "api_key")

    if auth_type == "api_key":
        key_env = spec.get("key_env", "")
        env_val = os.environ.get(key_env, "").strip() if key_env else ""
        if env_val:
            print(f"Found existing environment variable ${key_env}.")
            reuse = input(f"Use this ${key_env}? [Y/n]: ").strip().lower()
            if reuse != "n":
                api_key = env_val
        if not api_key:
            api_key = getpass.getpass("Enter API Key (input will not be displayed): ").strip()
            if not api_key:
                print("(No new API key entered; any existing stored key will be kept)")

    apply_llm_profile(
        provider=spec["provider"],
        model=models,
        base_url=spec.get("base_url", ""),
        api_key=api_key,
        api_format=spec.get("api_format", "auto"),
    )

    if auth_type == "oauth":
        oauth_prov = spec.get("oauth_provider")
        if oauth_prov:
            login_now = input(
                f"\nWould you like to complete subscription login for {oauth_prov} now? [Y/n]: "
            ).strip().lower()
            if login_now != "n":
                run_provider_login(oauth_prov)

    test = input("\nRun readiness check (doctor) now? [Y/n]: ").strip().lower()
    if test != "n":
        run_doctor()


def configure_custom() -> None:
    print("\n>>> Add / Update Custom API Provider (OpenAI or Anthropic-compatible)")
    provider = input("Provider slug (e.g. openrouter, groq, qwen, tencent, custom): ").strip().lower()
    if not provider:
        print("Provider name cannot be empty.")
        return
    display_name = input(f"Display name [default: Custom ({provider})]: ").strip()
    base_url = input("Base API URL (e.g. https://openrouter.ai/api/v1): ").strip()
    api_key = getpass.getpass("API Key (input is hidden, optional): ").strip()
    api_format = input("API Format [auto / openai_chat / anthropic, default auto]: ").strip() or "auto"

    discovered: list[str] = []
    if base_url and api_format != "anthropic":
        probe = input("Query live /models endpoint now? [Y/n]: ").strip().lower()
        if probe != "n":
            print("Fetching available models...")
            discovered = discover_openai_compatible_models(base_url, api_key)
            if discovered:
                preview = discovered[:25]
                print(f"Found {len(discovered)} model(s). Showing first {len(preview)}:")
                for idx, slug in enumerate(preview, 1):
                    print(f"  [{idx}] {slug}")
            else:
                print("(Could not fetch /models automatically; enter model IDs manually below.)")

    raw_models = input(
        "Model ID(s) comma-separated (or numbers from list above): "
    ).strip()
    chosen: list[str] = []
    for token in parse_model_list(raw_models):
        if token.isdigit() and discovered:
            idx = int(token) - 1
            if 0 <= idx < len(discovered):
                chosen.append(discovered[idx])
                continue
        chosen.append(token)
    if not chosen:
        print("At least one model ID is required.")
        return

    keep_separate = input(
        "Save as its own dedicated provider profile (keep other providers)? [Y/n]: "
    ).strip().lower() != "n"

    apply_llm_profile(
        provider=provider,
        model=chosen,
        base_url=base_url,
        api_key=api_key,
        api_format=api_format,
        profile_name=display_name or f"Custom ({provider})",
        dedicated_profile=keep_separate,
    )
    test = input("\nRun readiness check (doctor) now? [Y/n]: ").strip().lower()
    if test != "n":
        run_doctor()


def manage_llm_profiles() -> None:
    from deeptutor.services.config import get_model_catalog_service

    catalog = get_model_catalog_service().load()
    llm = catalog.get("services", {}).get("llm", {})
    profiles = llm.get("profiles", []) or []
    active_id = llm.get("active_profile_id")
    if not profiles:
        print("\n(No LLM profiles configured yet.)")
        return

    print("\n>>> Configured LLM Provider Profiles:")
    for idx, prof in enumerate(profiles, 1):
        marker = " *ACTIVE*" if prof.get("id") == active_id else ""
        models = ", ".join(m.get("model", "") for m in prof.get("models", []) if isinstance(m, dict))
        print(f"  [{idx}] {prof.get('name', prof.get('id'))} ({prof.get('binding')}) -> {models}{marker}")

    action = input("\nEnter [s]witch active, [d]elete profile, or Enter to go back: ").strip().lower()
    if action not in ("s", "d"):
        return
    num = input("Profile number: ").strip()
    if not num.isdigit() or not (1 <= int(num) <= len(profiles)):
        print("Invalid selection.")
        return
    target = profiles[int(num) - 1]
    target_id = target.get("id")

    if action == "s":
        def _switch(cat: dict[str, Any]) -> None:
            s_llm = cat.setdefault("services", {}).setdefault("llm", {})
            s_llm["active_profile_id"] = target_id
            t_models = target.get("models", []) or []
            if t_models:
                s_llm["active_model_id"] = t_models[0].get("id")

        get_model_catalog_service().update(_switch)
        print(f"[OK] Switched active profile to {target.get('name', target_id)}")
    elif action == "d":
        def _delete(cat: dict[str, Any]) -> None:
            s_llm = cat.setdefault("services", {}).setdefault("llm", {})
            remaining = [p for p in (s_llm.get("profiles") or []) if p.get("id") != target_id]
            s_llm["profiles"] = remaining
            if s_llm.get("active_profile_id") == target_id:
                s_llm["active_profile_id"] = remaining[0]["id"] if remaining else ""

        get_model_catalog_service().update(_delete)
        print(f"[OK] Deleted profile {target.get('name', target_id)}")


def manage_cli_harnesses() -> None:
    from deeptutor.services.subagent.custom_catalog import add_custom_model, remove_custom_model
    from deeptutor.services.subagent.custom_harnesses import (
        delete_custom_harness,
        load_custom_harnesses,
        upsert_custom_harness,
    )

    print("\n>>> Local CLI Harnesses Status:")
    for kind, label, cmd in _BUILTIN_LOCAL_HARNESSES:
        found = shutil.which(cmd)
        status = f"FOUND ({found})" if found else "not found on PATH"
        print(f"  - {label:18s} [{kind}] ({cmd}): {status}")

    custom_doc = load_custom_harnesses().get("harnesses", {})
    if custom_doc:
        print("\n>>> User-Configured Harness Overrides (custom_harnesses.json):")
        for kind, spec in custom_doc.items():
            found = shutil.which(spec["command"]) or Path(spec["command"]).exists()
            status = "FOUND" if found else "not found"
            print(f"  - {spec['display_name']:18s} [{kind}] ({spec['command']}): {status}")

    print("\n  [1] Register / Customize a CLI Harness (including FreeBuff flags)")
    print("  [2] Remove a Custom Harness")
    print("  [3] Add a Model to a Harness Catalog")
    print("  [4] Retire/Remove a Model from a Harness Catalog")
    print("  [0] Back")
    sub = input("Choice [0-4]: ").strip()

    if sub == "1":
        kind = input("Harness kind slug (e.g. freebuff, my_cli): ").strip().lower()
        command = input("CLI executable name or full path (e.g. freebuff): ").strip()
        display_name = input(f"Display name [default: {kind}]: ").strip() or kind
        efforts_raw = input("Supported efforts comma-separated [default: low,medium,high,max]: ").strip()
        efforts = parse_model_list(efforts_raw, fallback="low,medium,high,max")
        upsert_custom_harness(
            kind,
            {
                "display_name": display_name,
                "command": command,
                "efforts": efforts,
            },
        )
        print(f"[OK] Saved harness '{kind}' -> {command}")
    elif sub == "2":
        kind = input("Harness kind slug to remove: ").strip().lower()
        if delete_custom_harness(kind):
            print(f"[OK] Removed custom harness '{kind}'")
        else:
            print(f"(No custom harness named '{kind}' found.)")
    elif sub == "3":
        kind = input("Harness kind (e.g. antigravity, command_code, opencode, deepseek_harness, freebuff): ").strip()
        slug = input("Model slug: ").strip()
        label = input(f"Friendly label [default: {slug}]: ").strip() or slug
        add_custom_model(kind, slug, label)
        print(f"[OK] Added '{slug}' to {kind}")
    elif sub == "4":
        kind = input("Harness kind: ").strip()
        slug = input("Model slug to retire/hide: ").strip()
        remove_custom_model(kind, slug)
        print(f"[OK] Retired '{slug}' from {kind}")


def manage_preferences() -> None:
    from deeptutor.services.subagent.model_preferences import (
        collect_known_model_names,
        export_preferences_bundle,
        find_stale_preferences,
        import_preferences_bundle,
        prune_unknown,
    )

    print("\n>>> Model Preferences Portability & Cleanup (L-06):")
    print("  [1] Export model preferences to JSON file")
    print("  [2] Import model preferences from JSON file (merge)")
    print("  [3] Check & prune stale/orphaned preferences")
    print("  [0] Back")
    sub = input("Choice [0-3]: ").strip()

    if sub == "1":
        out_path = input("Output file path [default: model_preferences_backup.json]: ").strip() or "model_preferences_backup.json"
        bundle = export_preferences_bundle()
        Path(out_path).write_text(json.dumps(bundle, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print(f"[OK] Exported preferences to {out_path}")
    elif sub == "2":
        in_path = input("Input JSON file path: ").strip()
        if not in_path or not Path(in_path).exists():
            print("File not found.")
            return
        raw = json.loads(Path(in_path).read_text(encoding="utf-8"))
        import_preferences_bundle(raw, merge=True)
        print(f"[OK] Merged preferences from {in_path}")
    elif sub == "3":
        known = collect_known_model_names()
        stale = find_stale_preferences(known)
        total = sum(len(v) for v in stale.values())
        print(f"Found {total} stale preference entry/entries across {len(known)} known models.")
        if total > 0:
            confirm = input("Prune all stale entries now? [y/N]: ").strip().lower()
            if confirm == "y":
                removed = prune_unknown(known)
                print(f"[OK] Pruned: {removed}")


def main() -> None:
    while True:
        provider, model, has_key = get_current_info()
        cred_status = "Configured" if (has_key or "oauth" in provider or provider == "ollama") else "Not Set"

        print("\n" + "=" * 68)
        print("         DEEPTUTOR AI, MODEL & HARNESS CONFIGURATION WIZARD")
        print("=" * 68)
        print(f" Current Active Provider: {provider}")
        print(f" Current Active Model:    {model}  (Credentials: {cred_status})")
        print("-" * 68)
        print("   [1] Google Gemini          (gemini-3.8-flash, gemini-4-argon/neon/hydrogen)")
        print("   [2] OpenAI                 (gpt-6-solasta, gpt-5.4, gpt-4o)")
        print("   [3] OpenAI Codex           (Subscription: ChatGPT Plus / Team OAuth)")
        print("   [4] Anthropic Claude       (claude-sonnet-5-5, claude-opus-5-5)")
        print("   [5] DeepSeek               (deepseek-v4.1-flash, v4.1-flash-1017)")
        print("   [6] GitHub Copilot         (Subscription: Copilot Device Flow)")
        print("   [7] Local Ollama           (Local / Offline: qwen3.8-flash, glm-5-flash)")
        print("   [8] Custom API Provider    (OpenAI/Anthropic-compatible + live /models)")
        print("   [9] Manage Saved LLM Profiles (Switch / Delete)")
        print("  [10] Manage CLI Harnesses & Custom Models (agy, cmdc, opencode, dsh, freebuff)")
        print("  [11] Model Preferences Export / Import / Prune Stale (L-06)")
        print("  [12] View Current Resolved Configuration")
        print("  [13] Run Connection Diagnostics (Doctor)")
        print("   [0] Exit")
        print("=" * 68)

        choice = input("Enter choice [0-13]: ").strip()
        if choice in PRESETS:
            configure_preset(choice)
        elif choice == "8":
            configure_custom()
        elif choice == "9":
            manage_llm_profiles()
        elif choice == "10":
            manage_cli_harnesses()
        elif choice == "11":
            manage_preferences()
        elif choice == "12":
            run_config_show()
        elif choice == "13":
            run_doctor()
        elif choice == "0":
            print("\nConfiguration saved. Changes take effect immediately.")
            break
        else:
            print("Invalid choice, please enter a number from 0 to 13.")


if __name__ == "__main__":
    main()
