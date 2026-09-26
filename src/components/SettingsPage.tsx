import { Bell, Check, Globe2, Save, UserRound } from "lucide-react";
import { useState } from "react";
import type { Settings } from "../types";

export default function SettingsPage({
  settings,
  onSave,
  notify,
}: {
  settings: Settings;
  onSave: (settings: Settings) => Promise<void>;
  notify: (message: string) => void;
}) {
  const [form, setForm] = useState(settings);
  const [saving, setSaving] = useState(false);
  const update = (key: keyof Settings, value: string | boolean) =>
    setForm((current) => ({ ...current, [key]: value }));
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      await onSave(form);
      notify("Settings saved");
    } catch {
      notify("Could not save settings");
    } finally {
      setSaving(false);
    }
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Workspace preferences</p>
          <h1>Make Extrack yours.</h1>
          <p className="subheading">
            These preferences are stored in your local database.
          </p>
        </div>
      </div>
      <form className="settings-grid" onSubmit={submit}>
        <section className="panel settings-panel">
          <div className="settings-title">
            <div className="settings-icon mint">
              <UserRound size={18} />
            </div>
            <div>
              <span className="eyebrow">Profile</span>
              <h2>Identity</h2>
            </div>
          </div>
          <label className="form-field">
            <span>Display name</span>
            <input
              value={form.displayName}
              onChange={(event) => update("displayName", event.target.value)}
            />
          </label>
          <label className="form-field">
            <span>Workspace name</span>
            <input
              value={form.workspaceName}
              onChange={(event) => update("workspaceName", event.target.value)}
            />
          </label>
        </section>
        <section className="panel settings-panel">
          <div className="settings-title">
            <div className="settings-icon lavender">
              <Globe2 size={18} />
            </div>
            <div>
              <span className="eyebrow">Locale</span>
              <h2>Money & dates</h2>
            </div>
          </div>
          <label className="form-field">
            <span>Currency</span>
            <select
              value={form.currency}
              onChange={(event) => update("currency", event.target.value)}
            >
              <option value="USD">USD · US Dollar</option>
              <option value="NGN">NGN · Nigerian Naira</option>
              <option value="CAD">CAD · Canadian Dollar</option>
              <option value="AUD">AUD · Australian Dollar</option>
              <option value="GBP">GBP · Pound Sterling</option>
              <option value="EUR">EUR · Euro</option>
              <option value="CHF">CHF · Swiss Franc</option>
              <option value="INR">INR · Indian Rupee</option>
              <option value="JPY">JPY · Japanese Yen</option>
              <option value="CNY">CNY · Chinese Yuan</option>
              <option value="ZAR">ZAR · South African Rand</option>
            </select>
          </label>
          <label className="form-field">
            <span>Week starts on</span>
            <select
              value={form.weekStartsOn}
              onChange={(event) => update("weekStartsOn", event.target.value)}
            >
              <option value="Sunday">Sunday</option>
              <option value="Monday">Monday</option>
            </select>
          </label>
        </section>
        <section className="panel settings-panel">
          <div className="settings-title">
            <div className="settings-icon coral">
              <Bell size={18} />
            </div>
            <div>
              <span className="eyebrow">Notifications</span>
              <h2>Stay in the loop</h2>
            </div>
          </div>
          <label className="toggle-row">
            <span>
              <strong>Planning reminders</strong>
              <small>Remind me about upcoming bills and goals.</small>
            </span>
            <input
              type="checkbox"
              checked={form.notifications}
              onChange={(event) =>
                update("notifications", event.target.checked)
              }
            />
            <i>
              <Check size={12} />
            </i>
          </label>
        </section>
        <div className="settings-actions">
          <button
            className="secondary-button"
            type="button"
            onClick={() => {
              setForm(settings);
              notify("Changes discarded");
            }}
          >
            Discard
          </button>
          <button className="primary-button" type="submit" disabled={saving}>
            <Save size={16} /> {saving ? "Saving..." : "Save settings"}
          </button>
        </div>
      </form>
    </>
  );
}
