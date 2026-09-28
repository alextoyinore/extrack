import { Bell, Check, ChevronDown, Globe2, KeyRound, LogOut, Save, UserRound, X } from "lucide-react";
import { useRef, useState } from "react";
import type { Settings } from "../types";

export default function SettingsPage({
  settings,
  email,
  onSave,
  onChangePassword,
  onLogout,
  notify,
}: {
  settings: Settings;
  email: string;
  onSave: (settings: Settings) => Promise<void>;
  onChangePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  onLogout: () => Promise<void>;
  notify: (message: string) => void;
}) {
  const [form, setForm] = useState(settings);
  const [saving, setSaving] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const photoInput = useRef<HTMLInputElement>(null);
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
  const selectPhoto = (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) { notify("Choose an image file"); return; }
    if (file.size > 8 * 1024 * 1024) { notify("Choose an image smaller than 8 MB"); return; }
    const source = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const scale = Math.min(1, 512 / Math.max(image.width, image.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      const context = canvas.getContext("2d");
      context?.drawImage(image, 0, 0, canvas.width, canvas.height);
      update("profilePicture", canvas.toDataURL("image/jpeg", 0.82));
      URL.revokeObjectURL(source);
    };
    image.onerror = () => { URL.revokeObjectURL(source); notify("Could not read that image"); };
    image.src = source;
  };
  const submitPasswordChange = async () => {
    if (newPassword.length < 8) {
      notify("New password must be at least 8 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      notify("New passwords do not match");
      return;
    }
    setPasswordSaving(true);
    try {
      await onChangePassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      notify("Password changed");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not change password");
    } finally {
      setPasswordSaving(false);
    }
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Workspace preferences</p>
          <h1>Make Extrack yours.</h1>
          <p className="subheading">
            Update your profile, locale, and planning reminders.
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
            <span>Email address</span>
            <input value={email} readOnly />
          </label>
          <div className="profile-photo-field">
            <div className="profile-photo-preview">{form.profilePicture ? <img src={form.profilePicture} alt="Profile preview" /> : <span>{form.displayName.slice(0, 2).toUpperCase()}</span>}</div>
            <div><strong>Profile picture</strong><small>Use a square or portrait image. It will be resized for your account.</small><div className="profile-photo-actions"><button className="secondary-button" type="button" onClick={() => photoInput.current?.click()}><UserRound size={15} /> Choose photo</button>{form.profilePicture && <button className="icon-button danger" type="button" onClick={() => update("profilePicture", "")} aria-label="Remove profile picture"><X size={16} /></button>}</div></div>
            <input ref={photoInput} className="visually-hidden" type="file" accept="image/*" onChange={(event) => selectPhoto(event.target.files?.[0])} />
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
          <details className="account-password-section">
            <summary className="settings-title account-password-summary">
              <div className="settings-icon coral"><KeyRound size={17} /></div>
              <div><span className="eyebrow">Security</span><h2>Change password</h2></div>
              <ChevronDown size={15} />
            </summary>
            <label className="form-field"><span>Current password</span><input type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} /></label>
            <label className="form-field"><span>New password</span><input type="password" autoComplete="new-password" minLength={8} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} /></label>
            <label className="form-field"><span>Confirm new password</span><input type="password" autoComplete="new-password" minLength={8} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} /></label>
            <button className="secondary-button" type="button" disabled={passwordSaving || !currentPassword || !newPassword || !confirmPassword} onClick={submitPasswordChange}>{passwordSaving ? "Updating…" : "Update password"}</button>
          </details>
          <button className="secondary-button account-logout" type="button" onClick={() => void onLogout()}><LogOut size={15} /> Sign out</button>
        </section>
        <aside className="settings-aside">
          <section className="panel settings-panel locale">
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
        </aside>

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
