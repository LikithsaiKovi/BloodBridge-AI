import { useState, useEffect } from 'react';
import { settingsApi, SystemSettings } from '../../lib/api';
import { Settings, Save, AlertCircle, Loader2, Check } from 'lucide-react';

interface SettingsPanelProps {
  onClose: () => void;
}

export default function SettingsPanel({ onClose }: SettingsPanelProps) {
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const data = await settingsApi.get();
      setSettings(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!settings) return;
    const { name, value } = e.target;
    setSettings({ ...settings, [name]: parseInt(value, 10) || 0 });
    setSuccess(false);
  };

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      await settingsApi.update(settings);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64 bg-slate-800 rounded-xl border border-slate-700">
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
      </div>
    );
  }

  if (!settings) return null;

  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden text-white relative">
      <div className="p-4 border-b border-slate-700 flex items-center justify-between">
        <div className="flex items-center space-x-2 text-indigo-400">
          <Settings className="w-5 h-5" />
          <h3 className="font-semibold text-lg">Automation Settings</h3>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-white">&times;</button>
      </div>

      <div className="p-6 space-y-6">
        {error && (
          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-start space-x-2">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <p>{error}</p>
          </div>
        )}
        
        {success && (
          <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 text-sm flex items-start space-x-2">
            <Check className="w-4 h-4 mt-0.5 shrink-0" />
            <p>Settings saved successfully. They will apply on the next hourly cycle.</p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <h4 className="text-slate-300 font-medium pb-2 border-b border-slate-700">Notification Window</h4>
            <p className="text-xs text-slate-400">The hours during which the system is allowed to send SMS to donors.</p>
            
            <div>
              <label className="block text-sm text-slate-400 mb-1">Start Hour (0-23)</label>
              <input
                type="number"
                name="notification_start_hour"
                value={settings.notification_start_hour}
                onChange={handleChange}
                min="0" max="23"
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">End Hour (0-23)</label>
              <input
                type="number"
                name="notification_end_hour"
                value={settings.notification_end_hour}
                onChange={handleChange}
                min="0" max="23"
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
          </div>

          <div className="space-y-4">
            <h4 className="text-slate-300 font-medium pb-2 border-b border-slate-700">Escalation Policy</h4>
            <p className="text-xs text-slate-400">Time limits for pending matches before sending reminders or escalating to the next donor.</p>
            
            <div>
              <label className="block text-sm text-slate-400 mb-1">Send Reminder After (Hours)</label>
              <input
                type="number"
                name="donor_reminder_after_hours"
                value={settings.donor_reminder_after_hours}
                onChange={handleChange}
                min="1"
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Escalate/Expire After (Hours)</label>
              <input
                type="number"
                name="donor_escalation_after_hours"
                value={settings.donor_escalation_after_hours}
                onChange={handleChange}
                min="2"
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
          </div>
        </div>

        <div className="pt-4 border-t border-slate-700 flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center space-x-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-lg text-white font-medium transition-colors disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            <span>Save Settings</span>
          </button>
        </div>
      </div>
    </div>
  );
}
