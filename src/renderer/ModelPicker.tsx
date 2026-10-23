import React, { useEffect, useRef, useState } from "react";
import type { Agent, ProviderSetting } from "../shared";
import { Icon } from "./ui";

const catalogs = new Map<string, { id: string; name: string }[]>();
export function ModelPicker({
  agent,
  value,
  provider,
  pl,
  disabled,
  onChange,
}: {
  agent: Agent;
  value: string;
  provider?: ProviderSetting;
  pl: boolean;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const key = JSON.stringify([
    agent,
    provider?.command,
    provider?.args,
    provider?.profile,
    provider?.model,
    provider?.lastCheck?.observedAt,
  ]);
  const [models, setModels] = useState(catalogs.get(key) ?? []);
  const [loading, setLoading] = useState(false),
    [problem, setProblem] = useState(false);
  const [custom, setCustom] = useState(false);
  const generation = useRef(0);
  useEffect(() => {
    generation.current++;
    setModels(catalogs.get(key) ?? []);
    setCustom(false);
    setProblem(false);
    setLoading(false);
    return () => {
      generation.current++;
    };
  }, [key]);
  async function refresh() {
    const epoch = generation.current;
    setLoading(true);
    setProblem(false);
    try {
      const health = await window.agenting!.providerCheck!({ agent });
      catalogs.set(key, health.models);
      if (epoch === generation.current) {
        setModels(health.models);
        setProblem(health.state !== "connected");
      }
    } catch {
      if (epoch === generation.current) setProblem(true);
    } finally {
      if (epoch === generation.current) setLoading(false);
    }
  }
  const label = pl ? "Model rozmowy" : "Conversation model";
  return (
    <div className="model-picker">
      <Icon name="spark" />
      {custom ? (
        <input
          aria-label={label}
          value={value}
          maxLength={240}
          disabled={disabled}
          placeholder={pl ? "Identyfikator modelu" : "Model ID"}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <select
          aria-label={label}
          value={value}
          disabled={disabled}
          onFocus={() => {
            if (provider?.configured && !catalogs.has(key) && !loading)
              void refresh();
          }}
          onChange={(e) => {
            if (e.target.value === "__custom__") setCustom(true);
            else onChange(e.target.value);
          }}
        >
          <option value="">
            {provider?.model || (pl ? "Domyślny model" : "Default model")}
          </option>
          {value && !models.some((m) => m.id === value) && (
            <option value={value}>{value}</option>
          )}
          {models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
          <option value="__custom__">
            {pl ? "Własny identyfikator…" : "Custom model ID…"}
          </option>
        </select>
      )}
      <button
        type="button"
        className="composer-tool"
        disabled={disabled || loading || !provider?.configured}
        aria-label={pl ? "Odśwież modele" : "Refresh models"}
        title={
          problem
            ? pl
              ? "Odczyt modeli nie powiódł się. Ponów lub wpisz identyfikator."
              : "Could not read models. Retry or enter an ID."
            : pl
              ? "Pobierz modele z połączenia"
              : "Load models from connection"
        }
        onClick={() => void refresh()}
      >
        <Icon name="refresh" className={loading ? "spin" : ""} />
      </button>
      {custom && (
        <button
          type="button"
          className="composer-tool"
          disabled={disabled}
          aria-label={pl ? "Wybierz model z listy" : "Choose model from list"}
          onClick={() => {
            setCustom(false);
            onChange("");
          }}
        >
          <Icon name="close" />
        </button>
      )}
      {problem && (
        <span role="status" className="model-warning">
          {pl ? "Brak katalogu" : "Catalog unavailable"}
        </span>
      )}
    </div>
  );
}
