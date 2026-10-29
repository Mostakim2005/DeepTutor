#!/usr/bin/env python3
"""Interactive AI Provider Configuration for DeepTutor."""

from __future__ import annotations

import getpass
import json
import os
from pathlib import Path
import subprocess
import sys

WORKSPACE_DIR = Path(__file__).resolve().parent.parent
os.environ["DEEPTUTOR_HOME"] = str(WORKSPACE_DIR)

from deeptutor.services.config import get_model_catalog_service

PRESETS = {
    "1": {
        "title": "Google Gemini (API Key)",
        "provider": "gemini",
        "default_model": "gemini-3.8-flash",
        "models_hint": "e.g. gemini-3.8-flash, gemini-4-argon, gemini-4-carbon, gemini-3.5-flash-lite",
        "base_url": "https://generativelanguage.googleapis.com/v1beta/openai/",
        "api_format": "auto",
        "auth_type": "api_key",
        "key_env": "GEMINI_API_KEY",
    },
    "2": {
        "title": "OpenAI (API Key)",
        "provider": "openai",
        "default_model": "gpt-4o",
        "models_hint": "e.g. gpt-4o, gpt-4o-mini",
        "base_url": "https://api.openai.com/v1",
        "api_format": "auto",
        "auth_type": "api_key",
        "key_env": "OPENAI_API_KEY",
    },
    "3": {
        "title": "OpenAI Codex (Subscription OAuth: ChatGPT Plus)",
        "provider": "openai_codex",
        "default_model": "gpt-4o",
        "models_hint": "e.g. gpt-4o",
        "base_url": "https://chatgpt.com/backend-api",
        "api_format": "auto",
        "auth_type": "oauth",
        "oauth_provider": "openai-codex",
    },
    "4": {
        "title": "Anthropic Claude (API Key)",
        "provider": "anthropic",
        "default_model": "claude-3-5-sonnet-20241022",
        "models_hint": "e.g. claude-3-5-sonnet-20241022, claude-3-5-haiku-20241022",
        "base_url": "https://api.anthropic.com/v1",
        "api_format": "anthropic",
        "auth_type": "api_key",
        "key_env": "ANTHROPIC_API_KEY",
    },
    "5": {
        "title": "DeepSeek (API Key)",
        "provider": "deepseek",
        "default_model": "deepseek-chat",
        "models_hint": "e.g. deepseek-chat, deepseek-reasoner",
        "base_url": "https://api.deepseek.com/v1",
        "api_format": "auto",
        "auth_type": "api_key",
        "key_env": "DEEPSEEK_API_KEY",
    },
    "6": {
        "title": "GitHub Copilot (Subscription OAuth)",
        "provider": "github_copilot",
        "default_model": "gpt-4o",
        "models_hint": "e.g. gpt-4o",
        "base_url": "",
        "api_format": "auto",
        "auth_type": "oauth",
        "oauth_provider": "github-copilot",
    },
    "7": {
        "title": "Local Ollama (No API Key needed)",
        "provider": "ollama",
        "default_model": "llama3.1",
        "models_hint": "e.g. llama3.1, qwen2.5, mistral",
        "base_url": "http://localhost:11434/v1",
        "api_format": "auto",
        "auth_type": "local",
    },
}


def get_current_info() -> tuple[str, str, bool]:
    """Return (active_provider, active_model, has_credentials)."""
    try:
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
    model: str,
    base_url: str = "",
    api_key: str = "",
    api_format: str = "auto",
) -> None:
    def mutator(catalog: dict):
        llm = catalog.setdefault("services", {}).setdefault("llm", {})
        profiles = llm.setdefault("profiles", [])
        profile_id = "llm-profile-agent-setup"
        model_id = "llm-model-agent-setup"

        existing = next((p for p in profiles if p.get("id") == profile_id), None)
        final_key = api_key
        # Preserve key if not provided and same provider
        if not final_key and existing and existing.get("binding") == provider:
            final_key = existing.get("api_key", "")

        new_profile = {
            "id": profile_id,
            "name": f"Configured ({provider})",
            "binding": provider,
            "base_url": base_url,
            "api_key": final_key,
            "api_version": "",
            "extra_headers": {},
            "models": [{"id": model_id, "name": model, "model": model}],
            "api_format": api_format,
            "wire_api": api_format,
        }

        if existing is not None:
            idx = profiles.index(existing)
            profiles[idx] = new_profile
        else:
            profiles.append(new_profile)

        llm["active_profile_id"] = profile_id
        llm["active_model_id"] = model_id

    get_model_catalog_service().update(mutator)
    print(f"\n[OK] Configuration successfully applied: {provider} -> {model}")


def run_doctor():
    print("\n------------------------------------------------------------")
    print(" Running DeepTutor doctor readiness check...")
    print("------------------------------------------------------------")
    cmd = [sys.executable, "-m", "deeptutor_cli.main", "doctor"]
    subprocess.run(cmd, cwd=str(WORKSPACE_DIR))


def run_config_show():
    print("\n------------------------------------------------------------")
    print(" DeepTutor resolved configuration (secrets redacted):")
    print("------------------------------------------------------------")
    cmd = [sys.executable, "-m", "deeptutor_cli.main", "config", "show"]
    subprocess.run(cmd, cwd=str(WORKSPACE_DIR))


def run_provider_login(oauth_provider: str):
    print(f"\nLaunching OAuth sign-in flow for {oauth_provider}...")
    print("Follow the browser prompt or device code displayed below.")
    cmd = [sys.executable, "-m", "deeptutor_cli.main", "provider", "login", oauth_provider]
    subprocess.run(cmd, cwd=str(WORKSPACE_DIR))


def configure_preset(choice_key: str):
    spec = PRESETS[choice_key]
    print(f"\n>>> Setting up: {spec['title']}")

    default_model = spec.get("default_model", "")
    hint = spec.get("models_hint", "")
    if hint:
        print(f"Popular models: {hint}")
    raw_model = input(f"Model ID [default: {default_model}]: ").strip()
    model = raw_model if raw_model else default_model

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
        model=model,
        base_url=spec.get("base_url", ""),
        api_key=api_key,
        api_format=spec.get("api_format", "auto"),
    )

    if auth_type == "oauth":
        oauth_prov = spec.get("oauth_provider")
        if oauth_prov:
            login_now = input(f"\nWould you like to complete subscription login for {oauth_prov} now? [Y/n]: ").strip().lower()
            if login_now != "n":
                run_provider_login(oauth_prov)

    test = input("\nRun readiness check (doctor) now? [Y/n]: ").strip().lower()
    if test != "n":
        run_doctor()


def configure_custom():
    print("\n>>> Setting up Custom / Other Provider")
    provider = input("Provider name (e.g. groq, openrouter, custom): ").strip().lower()
    if not provider:
        print("Provider name cannot be empty.")
        return
    model = input("Model ID: ").strip()
    base_url = input("Base API URL (optional): ").strip()
    api_key = getpass.getpass("API Key (input is hidden, optional): ").strip()
    api_format = input("API Format [auto / openai_chat / anthropic, default auto]: ").strip() or "auto"

    apply_llm_profile(
        provider=provider,
        model=model,
        base_url=base_url,
        api_key=api_key,
        api_format=api_format,
    )
    test = input("\nRun readiness check (doctor) now? [Y/n]: ").strip().lower()
    if test != "n":
        run_doctor()


def main():
    while True:
        provider, model, has_key = get_current_info()
        cred_status = "Configured" if (has_key or "oauth" in provider or provider == "ollama") else "Not Set"

        print("\n" + "=" * 65)
        print("               DEEPTUTOR AI CONFIGURATION WIZARD")
        print("=" * 65)
        print(f" Current Active Provider: {provider}")
        print(f" Current Active Model:    {model}  (Credentials: {cred_status})")
        print("-" * 65)
        print(" Choose an option to configure or switch your AI:")
        print("   [1] Google Gemini          (gemini-3.8-flash, gemini-4-argon)")
        print("   [2] OpenAI                 (API Key: gpt-4o, gpt-4o-mini)")
        print("   [3] OpenAI Codex           (Subscription: ChatGPT Plus / Team OAuth)")
        print("   [4] Anthropic Claude       (API Key: claude-3-5-sonnet)")
        print("   [5] DeepSeek               (API Key: deepseek-chat, deepseek-reasoner)")
        print("   [6] GitHub Copilot         (Subscription: Copilot Device Flow)")
        print("   [7] Local Ollama           (Local / Offline: llama3.1, qwen2.5)")
        print("   [8] Custom / Other         (Groq, OpenRouter, Mistral, etc.)")
        print("   [9] View Current Resolved Configuration")
        print("   [10] Run Connection Diagnostics (Doctor)")
        print("   [0] Exit")
        print("=" * 65)

        choice = input("Enter choice [0-10]: ").strip()
        if choice in PRESETS:
            configure_preset(choice)
        elif choice == "8":
            configure_custom()
        elif choice == "9":
            run_config_show()
        elif choice == "10":
            run_doctor()
        elif choice == "0":
            print("\nConfiguration saved. Changes take effect immediately.")
            break
        else:
            print("Invalid choice, please enter a number from 0 to 10.")


if __name__ == "__main__":
    main()
