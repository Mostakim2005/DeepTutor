"use client";

import Link from "next/link";
import { useEffect, useState, useCallback, type ReactNode } from "react";
import { ArrowUpRight, Bot, ChevronDown, Eye, EyeOff, MessageCircle, Minus, Pin, Plus, Star, UserRound, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import { agentGlyph, agentKindLabel } from "@/components/agents/agent-icons";
import PartnerAvatar from "@/components/partners/PartnerAvatar";
import { listPersonas, type PersonaInfo } from "@/lib/personas-api";
import { requestVoid } from "@/shared/api/client";
import Tooltip from "@/shared/ui/Tooltip";
import type { PartnerInfo } from "@/lib/partners-api";
import type { PartnerGroup } from "@/lib/partner-groups-api";
import type { ResourceKind } from "@/lib/resource-reuse";
import {
  TrayFoot,
  TrayList,
  TrayMenu,
  TrayOption,
  TrayReuse,
  TraySearch,
  TraySection,
  type TrayPlacement,
} from "./ComposerTrayMenu";
import { PlainVoiceIcon } from "./ComposerIcons";

const BUDGET_MIN = 1;
const BUDGET_MAX = 12;
const SEARCH_FROM = 9;

type Agent = { name: string; displayName?: string; kind?: string; isPinned?: boolean; isHidden?: boolean };

interface Choice<T> {
  options: T[];
  selected: string | null;
  onSelect: (id: string | null) => void;
  loading?: boolean;
  error?: boolean;
}

/** Everyone a turn can be handed to: `partner:<id>` or `subagent:<name>`. */
export interface Answerers {
  value: string | null;
  onChange: (value: string | null) => void;
  partners: PartnerInfo[];
  agents: Agent[];
  loading?: boolean;
  error?: boolean;
}

export interface AnswerModeProps {
  /** DeepTutor's own register for this conversation; "" is its usual voice. */
  persona?: { value: string; onChange: (persona: string) => void };
  answerers?: Answerers;
  /** Controlled open state, so `/persona` can open this list. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export interface PartnerLinkProps {
  partners?: Choice<PartnerInfo>;
  groups?: Choice<PartnerGroup>;
  agents?: Choice<Agent> & {
    /** Most times DeepTutor may ask the agent in one turn. */
    budget?: number | null;
    onBudgetChange?: (budget: number) => void;
  };
}

function PartnerFace({ partner, size }: { partner: PartnerInfo; size: number }) {
  return (
    <PartnerAvatar
      name={partner.name}
      emoji={partner.emoji}
      color={partner.color}
      image={partner.avatar}
      size={size}
      className="shrink-0"
    />
  );
}

function AgentFace({ kind, size }: { kind?: string; size: number }) {
  // Held in an object, as elsewhere: the glyph is a module constant, not a component made here.
  const glyph = { Icon: agentGlyph(kind) ?? Bot };
  return <glyph.Icon size={size} className="shrink-0" />;
}

/**
 * How this conversation is answered — the right end of the composer tray.
 *
 * Two questions in one list: in what voice DeepTutor answers, and who answers
 * at all. Choosing a partner or a connected agent hands the turn to them
 * whole: they get the message as written, their reply is the answer, and their
 * work shows in the conversation the way DeepTutor's own does. Asking them
 * something on DeepTutor's behalf is a different thing and lives in the
 * partner menu beside this one.
 */
export default function AnswerModeMenu({
  persona,
  answerers,
  open,
  onOpenChange,
  placement,
}: AnswerModeProps & { placement: TrayPlacement }) {
  const { t } = useTranslation();
  const chosen = answerers?.value ?? "";
  const kind = chosen.slice(0, Math.max(0, chosen.indexOf(":")));
  const id = kind ? chosen.slice(kind.length + 1) : "";
  const partner = kind === "partner" ? answerers?.partners.find((item) => item.partner_id === id) : undefined;
  const agent = kind === "subagent" ? answerers?.agents.find((item) => item.name === id) : undefined;
  // The trigger names whoever answers; a voice only when DeepTutor does.
  let icon: ReactNode = <UserRound size={14} strokeWidth={1.7} className="shrink-0" />;
  let value = persona?.value || t("Default");
  if (partner || kind === "partner") {
    icon = partner ? <PartnerFace partner={partner} size={16} /> : icon;
    value = partner?.name ?? id;
  } else if (kind === "subagent") {
    icon = <AgentFace kind={agent?.kind} size={14} />;
    value = agent?.displayName || id;
  }
  return (
    <TrayMenu
      icon={icon}
      label={t("Preferences")}
      value={value}
      active={Boolean(chosen || persona?.value)}
      placement={placement}
      align="end"
      open={onOpenChange ? open : undefined}
      onOpenChange={onOpenChange}
    >
      {(close) => <AnswerList persona={persona} answerers={answerers} close={close} />}
    </TrayMenu>
  );
}

function ModelPreferenceActions({
  name,
  isPinned,
  isHidden,
  onTogglePin,
  onToggleHide,
}: {
  name: string;
  isPinned: boolean;
  isHidden: boolean;
  onTogglePin: (name: string) => void;
  onToggleHide: (name: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <span className="flex items-center gap-1 z-10" onClick={(e) => e.stopPropagation()}>
      <Tooltip label={isPinned ? t("Unpin model") : t("Pin model")}>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onTogglePin(name);
          }}
          className="p-1 rounded hover:bg-black/10 dark:hover:bg-white/15 transition-all text-muted-foreground/40 hover:text-amber-400"
          aria-label={isPinned ? t("Unpin model") : t("Pin model")}
        >
          <Star
            size={13}
            strokeWidth={1.8}
            className={
              isPinned
                ? "text-amber-400 fill-amber-400 filter drop-shadow-[0_0_6px_rgba(251,191,36,0.7)]"
                : "transition-colors"
            }
          />
        </button>
      </Tooltip>
      <Tooltip label={isHidden ? t("Show model") : t("Hide model")}>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onToggleHide(name);
          }}
          className="p-1 rounded hover:bg-black/10 dark:hover:bg-white/15 transition-all"
          aria-label={isHidden ? t("Show model") : t("Hide model")}
        >
          {isHidden ? (
            <EyeOff size={13} strokeWidth={1.8} className="text-rose-400 hover:text-rose-300 transition-colors" />
          ) : (
            <Eye size={13} strokeWidth={1.8} className="text-muted-foreground/50 hover:text-foreground transition-colors" />
          )}
        </button>
      </Tooltip>
    </span>
  );
}

function AnswerList({
  persona,
  answerers,
  close,
}: Pick<AnswerModeProps, "persona" | "answerers"> & { close: () => void }) {
  const { t } = useTranslation();
  const [personas, setPersonas] = useState<PersonaInfo[]>([]);
  const [query, setQuery] = useState("");
  const [showHidden, setShowHidden] = useState(false);
  const wantsPersonas = Boolean(persona);
  useEffect(() => {
    if (!wantsPersonas) return;
    let alive = true;
    void listPersonas()
      .then((items) => {
        if (alive) setPersonas(items);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [wantsPersonas]);

  const [pinnedNames, setPinnedNames] = useState<Set<string>>(() =>
    new Set((answerers?.agents ?? []).filter((item) => item.isPinned).map((item) => item.name)),
  );
  const [hiddenNames, setHiddenNames] = useState<Set<string>>(() =>
    new Set((answerers?.agents ?? []).filter((item) => item.isHidden).map((item) => item.name)),
  );

  const [syncedAgents, setSyncedAgents] = useState(answerers?.agents);
  if (answerers?.agents && answerers.agents !== syncedAgents) {
    setSyncedAgents(answerers.agents);
    setPinnedNames(new Set(answerers.agents.filter((item) => item.isPinned).map((item) => item.name)));
    setHiddenNames(new Set(answerers.agents.filter((item) => item.isHidden).map((item) => item.name)));
  }

  const handleTogglePin = useCallback(async (modelName: string) => {
    setPinnedNames((prev) => {
      const next = new Set(prev);
      if (next.has(modelName)) next.delete(modelName);
      else next.add(modelName);
      return next;
    });
    try {
      await requestVoid("/api/settings/model-preferences/toggle-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: modelName }),
      });
    } catch (err) {
      console.error("Failed to toggle model pin:", err);
    }
  }, []);

  const handleToggleHide = useCallback(async (modelName: string) => {
    setHiddenNames((prev) => {
      const next = new Set(prev);
      if (next.has(modelName)) next.delete(modelName);
      else next.add(modelName);
      return next;
    });
    try {
      await requestVoid("/api/settings/model-preferences/toggle-hide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: modelName }),
      });
    } catch (err) {
      console.error("Failed to toggle model hide:", err);
    }
  }, []);

  const needle = query.trim().toLocaleLowerCase();
  const matches = (...text: (string | undefined)[]) =>
    !needle || text.join(" ").toLocaleLowerCase().includes(needle);
  const styleRows = personas.filter((item) => matches(item.name, item.description));
  const partnerRows = answerers?.partners.filter((item) => matches(item.name)) ?? [];
  const rawAgents = answerers?.agents ?? [];
  const allAgents = rawAgents.map((item) => ({
    ...item,
    isPinned: pinnedNames.has(item.name),
    isHidden: hiddenNames.has(item.name),
  }));
  const matchingAgents = allAgents.filter((item) => matches(item.displayName, item.name));
  const pinnedAgents = matchingAgents.filter((item) => item.isPinned && !item.isHidden);
  const normalAgents = matchingAgents.filter((item) => !item.isPinned && !item.isHidden);
  const hiddenAgents = matchingAgents.filter((item) => item.isHidden);
  const visibleAgents = needle ? matchingAgents : [...pinnedAgents, ...normalAgents];
  const agentRows = visibleAgents;
  const total = personas.length + (answerers?.partners.length ?? 0) + matchingAgents.length;
  const pick = (value: string | null) => {
    answerers?.onChange(value);
    close();
  };
  const reuse: ResourceKind[] = persona ? ["persona"] : [];

  return (
    <>
      {total >= SEARCH_FROM && (
        <TraySearch value={query} onChange={setQuery} placeholder={t("composer.tray.searchAnswer")} />
      )}
      <TrayList label={t("Preferences")}>
        {persona && (
          <TraySection title={t("Response style")}>
            {matches(t("Default")) && (
              <TrayOption
                selected={!persona.value}
                onSelect={() => {
                  persona.onChange("");
                  close();
                }}
                leading={<PlainVoiceIcon size={16} strokeWidth={1.6} />}
                title={t("Default")}
                meta={t("No persona — the assistant's standard behavior")}
              />
            )}
            {styleRows.map((item) => (
              <TrayOption
                key={item.name}
                selected={persona.value === item.name}
                onSelect={() => {
                  persona.onChange(item.name);
                  close();
                }}
                leading={<UserRound size={14} strokeWidth={1.7} />}
                title={item.name}
                meta={item.description}
              />
            ))}
          </TraySection>
        )}
        {answerers && (
          <TraySection title={t("composer.tray.whoAnswers")} hint={t("composer.tray.whoAnswersHint")}>
            {matches("DeepTutor") && (
              <TrayOption
                selected={!answerers.value}
                onSelect={() => pick(null)}
                leading={<MessageCircle size={14} strokeWidth={1.7} />}
                title={t("composer.tray.deeptutor")}
                meta={t("composer.tray.deeptutorAnswers")}
              />
            )}
            {partnerRows.map((item) => (
              <TrayOption
                key={`partner:${item.partner_id}`}
                selected={answerers.value === `partner:${item.partner_id}`}
                onSelect={() => pick(`partner:${item.partner_id}`)}
                leading={<PartnerFace partner={item} size={24} />}
                title={item.name}
                meta={item.description || undefined}
              />
            ))}
            {visibleAgents.map((item) => (
              <TrayOption
                key={`subagent:${item.name}`}
                selected={answerers.value === `subagent:${item.name}`}
                onSelect={() => pick(`subagent:${item.name}`)}
                leading={<AgentFace kind={item.kind} size={15} />}
                title={
                  <span className="flex items-center gap-1.5">
                    <span>{item.displayName || item.name}</span>
                    {item.isPinned && (
                      <Star size={11} className="text-amber-500 fill-amber-500 shrink-0" aria-label={t("Pinned")} />
                    )}
                  </span>
                }
                meta={agentKindLabel(item.kind) || undefined}
                trailing={
                  <ModelPreferenceActions
                    name={item.name}
                    isPinned={Boolean(item.isPinned)}
                    isHidden={Boolean(item.isHidden)}
                    onTogglePin={handleTogglePin}
                    onToggleHide={handleToggleHide}
                  />
                }
              />
            ))}
            {!needle && hiddenAgents.length > 0 && (
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => setShowHidden((prev) => !prev)}
                  className="flex items-center justify-between w-full px-2.5 py-1.5 text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--hover-bg,rgba(0,0,0,0.04))] rounded-md transition-colors"
                >
                  <span className="flex items-center gap-1.5 font-medium">
                    <EyeOff size={13} strokeWidth={1.8} />
                    {showHidden ? t("Hide hidden models") : `${t("Hidden models")} (${hiddenAgents.length})`}
                  </span>
                  <ChevronDown
                    size={13}
                    strokeWidth={1.8}
                    className={`transition-transform duration-200 ${showHidden ? "rotate-180" : ""}`}
                  />
                </button>
                {showHidden &&
                  hiddenAgents.map((item) => (
                    <TrayOption
                      key={`subagent:${item.name}`}
                      selected={answerers.value === `subagent:${item.name}`}
                      onSelect={() => pick(`subagent:${item.name}`)}
                      leading={<AgentFace kind={item.kind} size={15} />}
                      title={item.displayName || item.name}
                      meta={agentKindLabel(item.kind) || undefined}
                      trailing={
                        <ModelPreferenceActions
                          name={item.name}
                          isPinned={Boolean(item.isPinned)}
                          isHidden={Boolean(item.isHidden)}
                          onTogglePin={handleTogglePin}
                          onToggleHide={handleToggleHide}
                        />
                      }
                    />
                  ))}
              </div>
            )}
            {answerers.loading && <p className="dt-tray-empty">{t("Loading...")}</p>}
            {answerers.error && !answerers.loading && (
              <p role="alert" className="dt-tray-empty">
                {t("Could not load partners")}
              </p>
            )}
            {!answerers.loading && !needle && !partnerRows.length && !agentRows.length && (
              <p className="dt-tray-empty">{t("composer.tray.noHandOff")}</p>
            )}
          </TraySection>
        )}
        {needle && !styleRows.length && !partnerRows.length && !agentRows.length && (
          <p className="dt-tray-empty">{t("navigation.noResults")}</p>
        )}
      </TrayList>
      <TrayFoot>
        {reuse.length > 0 && <TrayReuse kinds={reuse} />}
        <Link href="/personalization" prefetch={false} onClick={close}>
          {t("navigation.personalization")}
          <ArrowUpRight size={13} strokeWidth={1.9} />
        </Link>
      </TrayFoot>
    </>
  );
}

/**
 * DeepTutor working with partners — the tray's partner menu.
 *
 * Here DeepTutor still answers: it asks one partner, convenes a partner
 * group, or puts questions to a connected agent, and writes the reply from
 * what they said. One of these at a time, and none while the turn is handed
 * to someone outright.
 */
export function PartnerLinkMenu({
  partners,
  groups,
  agents,
  placement,
}: PartnerLinkProps & { placement: TrayPlacement }) {
  const { t } = useTranslation();
  const partner = partners?.options.find((item) => item.partner_id === partners.selected);
  const group = groups?.options.find((item) => item.group_id === groups.selected);
  const agent = agents?.options.find((item) => item.name === agents.selected);
  let icon: ReactNode = <Users size={14} strokeWidth={1.7} className="shrink-0" />;
  let value = "";
  if (partners?.selected) {
    icon = partner ? <PartnerFace partner={partner} size={16} /> : icon;
    value = partner?.name ?? partners.selected;
  } else if (groups?.selected) {
    value = group?.name ?? groups.selected;
  } else if (agents?.selected) {
    icon = <AgentFace kind={agent?.kind} size={14} />;
    value = agent?.displayName || agents.selected;
  }
  return (
    <TrayMenu
      icon={icon}
      label={t("Partners")}
      value={value}
      active={Boolean(value)}
      placement={placement}
      align="end"
    >
      {(close) => <PartnerLinkList partners={partners} groups={groups} agents={agents} close={close} />}
    </TrayMenu>
  );
}

function PartnerLinkList({
  partners,
  groups,
  agents,
  close,
}: PartnerLinkProps & { close: () => void }) {
  const { t } = useTranslation();
  const [showHiddenAgents, setShowHiddenAgents] = useState(false);
  const reuse: ResourceKind[] = [
    ...(partners ? (["partner"] as const) : []),
    ...(groups ? (["partner_group"] as const) : []),
    ...(agents ? (["agent"] as const) : []),
  ];

  const [pinnedNames, setPinnedNames] = useState<Set<string>>(() =>
    new Set((agents?.options ?? []).filter((item) => item.isPinned).map((item) => item.name)),
  );
  const [hiddenNames, setHiddenNames] = useState<Set<string>>(() =>
    new Set((agents?.options ?? []).filter((item) => item.isHidden).map((item) => item.name)),
  );

  const [syncedOptions, setSyncedOptions] = useState(agents?.options);
  if (agents?.options && agents.options !== syncedOptions) {
    setSyncedOptions(agents.options);
    setPinnedNames(new Set(agents.options.filter((item) => item.isPinned).map((item) => item.name)));
    setHiddenNames(new Set(agents.options.filter((item) => item.isHidden).map((item) => item.name)));
  }

  const handleTogglePin = useCallback(async (modelName: string) => {
    setPinnedNames((prev) => {
      const next = new Set(prev);
      if (next.has(modelName)) next.delete(modelName);
      else next.add(modelName);
      return next;
    });
    try {
      await requestVoid("/api/settings/model-preferences/toggle-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: modelName }),
      });
    } catch (err) {
      console.error("Failed to toggle model pin:", err);
    }
  }, []);

  const handleToggleHide = useCallback(async (modelName: string) => {
    setHiddenNames((prev) => {
      const next = new Set(prev);
      if (next.has(modelName)) next.delete(modelName);
      else next.add(modelName);
      return next;
    });
    try {
      await requestVoid("/api/settings/model-preferences/toggle-hide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: modelName }),
      });
    } catch (err) {
      console.error("Failed to toggle model hide:", err);
    }
  }, []);

  const rawAgents = agents?.options ?? [];
  const allAgents = rawAgents.map((item) => ({
    ...item,
    isPinned: pinnedNames.has(item.name),
    isHidden: hiddenNames.has(item.name),
  }));
  const pinnedAgents = allAgents.filter((item) => item.isPinned && !item.isHidden);
  const normalAgents = allAgents.filter((item) => !item.isPinned && !item.isHidden);
  const hiddenAgents = allAgents.filter((item) => item.isHidden);
  const visibleAgents = [...pinnedAgents, ...normalAgents];
  const nothing = !partners?.options.length && !groups?.options.length && !agents?.options.length;
  const loading = Boolean(partners?.loading || groups?.loading);
  const failed = Boolean(partners?.error || groups?.error);
  return (
    <>
      <TrayList label={t("Partners")}>
        {partners && partners.options.length > 0 && (
          <TraySection title={t("Ask partner")} hint={t("composer.tray.askPartnerHint")}>
            {partners.options.map((item) => {
              const chosen = partners.selected === item.partner_id;
              return (
                <TrayOption
                  key={item.partner_id}
                  selected={chosen}
                  onSelect={() => {
                    partners.onSelect(chosen ? null : item.partner_id);
                    close();
                  }}
                  leading={<PartnerFace partner={item} size={24} />}
                  title={item.name}
                  meta={item.description || undefined}
                />
              );
            })}
          </TraySection>
        )}
        {groups && groups.options.length > 0 && (
          <TraySection title={t("Organize partner discussion")}>
            {groups.options.map((item) => {
              const chosen = groups.selected === item.group_id;
              return (
                <TrayOption
                  key={item.group_id}
                  selected={chosen}
                  onSelect={() => {
                    groups.onSelect(chosen ? null : item.group_id);
                    close();
                  }}
                  leading={item.emoji ? <span className="text-[13px]">{item.emoji}</span> : <Users size={14} strokeWidth={1.7} />}
                  title={item.name}
                  meta={item.members.map((member) => member.name).join(" · ") || t("Organize partner discussion")}
                />
              );
            })}
          </TraySection>
        )}
        {agents && agents.options.length > 0 && (
          <TraySection title={t("Ask subagent")} hint={t("composer.tray.askAgentHint")}>
            {visibleAgents.map((item) => {
              const chosen = agents.selected === item.name;
              return (
                <div key={item.name}>
                  <TrayOption
                    selected={chosen}
                    onSelect={() => {
                      agents.onSelect(chosen ? null : item.name);
                      if (chosen || !agents.onBudgetChange) close();
                    }}
                    leading={<AgentFace kind={item.kind} size={15} />}
                    title={
                      <span className="flex items-center gap-1.5">
                        <span>{item.displayName || item.name}</span>
                        {item.isPinned && (
                          <Star size={11} className="text-amber-500 fill-amber-500 shrink-0" aria-label={t("Pinned")} />
                        )}
                      </span>
                    }
                    meta={agentKindLabel(item.kind) || undefined}
                    trailing={
                      <ModelPreferenceActions
                        name={item.name}
                        isPinned={Boolean(item.isPinned)}
                        isHidden={Boolean(item.isHidden)}
                        onTogglePin={handleTogglePin}
                        onToggleHide={handleToggleHide}
                      />
                    }
                  />
                  {chosen && agents.onBudgetChange && (
                    <Budget value={agents.budget ?? null} onChange={agents.onBudgetChange} />
                  )}
                </div>
              );
            })}
            {hiddenAgents.length > 0 && (
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => setShowHiddenAgents((prev) => !prev)}
                  className="flex items-center justify-between w-full px-2.5 py-1.5 text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--hover-bg,rgba(0,0,0,0.04))] rounded-md transition-colors"
                >
                  <span className="flex items-center gap-1.5 font-medium">
                    <EyeOff size={13} strokeWidth={1.8} />
                    {showHiddenAgents ? t("Hide hidden models") : `${t("Hidden models")} (${hiddenAgents.length})`}
                  </span>
                  <ChevronDown
                    size={13}
                    strokeWidth={1.8}
                    className={`transition-transform duration-200 ${showHiddenAgents ? "rotate-180" : ""}`}
                  />
                </button>
                {showHiddenAgents &&
                  hiddenAgents.map((item) => {
                    const chosen = agents.selected === item.name;
                    return (
                      <div key={item.name}>
                        <TrayOption
                          selected={chosen}
                          onSelect={() => {
                            agents.onSelect(chosen ? null : item.name);
                            if (chosen || !agents.onBudgetChange) close();
                          }}
                          leading={<AgentFace kind={item.kind} size={15} />}
                          title={item.displayName || item.name}
                          meta={agentKindLabel(item.kind) || undefined}
                          trailing={
                            <ModelPreferenceActions
                              name={item.name}
                              isPinned={Boolean(item.isPinned)}
                              isHidden={Boolean(item.isHidden)}
                              onTogglePin={handleTogglePin}
                              onToggleHide={handleToggleHide}
                            />
                          }
                        />
                        {chosen && agents.onBudgetChange && (
                          <Budget value={agents.budget ?? null} onChange={agents.onBudgetChange} />
                        )}
                      </div>
                    );
                  })}
              </div>
            )}
          </TraySection>
        )}
        {loading && <p className="dt-tray-empty">{t("Loading...")}</p>}
        {failed && !loading && (
          <p role="alert" className="dt-tray-empty">
            {t("Could not load partners")}
          </p>
        )}
        {nothing && !loading && !failed && <p className="dt-tray-empty">{t("No partners yet")}</p>}
      </TrayList>
      <TrayFoot>
        {reuse.length > 0 && <TrayReuse kinds={reuse} />}
        <span className="dt-tray-foot-end">
          <Link href="/partners/groups/new" prefetch={false} onClick={close}>
            <Plus size={13} strokeWidth={1.9} />
            {t("Create a Partner Group")}
          </Link>
          <Link href="/partners" prefetch={false} onClick={close}>
            {t("Partners")}
            <ArrowUpRight size={13} strokeWidth={1.9} />
          </Link>
        </span>
      </TrayFoot>
    </>
  );
}

/** How many times DeepTutor may ask the chosen agent this turn. */
function Budget({ value, onChange }: { value: number | null; onChange: (value: number) => void }) {
  const { t } = useTranslation();
  const current = value ?? BUDGET_MIN;
  return (
    <div className="dt-tray-budget">
      <span>{t("Max rounds DeepTutor may ask")}</span>
      <span className="flex items-center gap-1">
        <button
          type="button"
          aria-label={t("Fewer rounds")}
          disabled={current <= BUDGET_MIN}
          onClick={() => onChange(Math.max(BUDGET_MIN, current - 1))}
        >
          <Minus size={12} />
        </button>
        <span className="dt-tray-budget-value">{value ?? "–"}</span>
        <button
          type="button"
          aria-label={t("More rounds")}
          disabled={current >= BUDGET_MAX}
          onClick={() => onChange(Math.min(BUDGET_MAX, current + 1))}
        >
          <Plus size={12} />
        </button>
      </span>
    </div>
  );
}
