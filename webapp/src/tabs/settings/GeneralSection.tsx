/**
 * Sub-tab Umum: prefix, AFK, AntiPM, dan token inline bot.
 *
 * Dipecah dari SettingsTab.tsx (877 baris). JSX dipindahkan apa adanya;
 * state tetap milik SettingsTab dan diturunkan lewat props.
 */
import React from 'react';
import { Shield, Bot, ShieldCheck, MessageSquare, Sparkles, Save } from 'lucide-react';
import { UserSettings } from '../../api';
import { triggerHaptic } from '../../telegram';
import { Card, SectionLabel, Row, Switch, Badge, Spinner } from '../../ui';
import { PREFIXES } from './constants.js';

interface GeneralSectionProps {
  settings: UserSettings;
  setSettings: React.Dispatch<React.SetStateAction<UserSettings>>;
  setTokenTouched: React.Dispatch<React.SetStateAction<boolean>>;
  saving: boolean;
  saveGeneral: () => void;
}

export const GeneralSection: React.FC<GeneralSectionProps> = ({
  settings,
  setSettings,
  setTokenTouched,
  saving,
  saveGeneral,
}) => (
      <>
        <section>
          <SectionLabel><MessageSquare size={13} /> Prefix perintah</SectionLabel>
          <Card pad>
            <div className="between mb-12">
              <span className="fs-13 op-75">Karakter awalan modul</span>
              <span className="pill" style={{ fontSize: 15, padding: '4px 12px' }}>{settings.prefix}</span>
            </div>
            <div className="center gap-8 wrap">
              {PREFIXES.map((p) => (
                <button
                  key={p}
                  onClick={() => {
                    triggerHaptic('light');
                    setSettings((prev) => ({ ...prev, prefix: p }));
                  }}
                  className="press"
                  style={{
                    flex: '1 0 42px',
                    height: 42,
                    borderRadius: 'var(--r-md)',
                    border: settings.prefix === p ? '2px solid var(--info)' : 'var(--hairline) solid var(--tg-separator)',
                    background: settings.prefix === p ? 'var(--info-soft)' : 'var(--tg-section)',
                    color: 'inherit',
                    fontSize: 17,
                    fontWeight: 800,
                    cursor: 'pointer',
                  }}
                >
                  {p}
                </button>
              ))}
            </div>
            <input
              className="input mono mt-10"
              maxLength={5}
              placeholder="Prefix kustom…"
              value={settings.prefix}
              onChange={(e) => setSettings((p) => ({ ...p, prefix: e.target.value }))}
            />
          </Card>
        </section>

        <section>
          <SectionLabel><ShieldCheck size={13} /> Proteksi & respons</SectionLabel>
          <Card>
            <Row
              icon={<Shield size={16} />}
              title="Anti-PM Guard"
              desc="Peringatkan spammer di pesan pribadi"
              right={
                <Switch
                  checked={settings.antiPm}
                  onChange={(v) => {
                    triggerHaptic('light');
                    setSettings((p) => ({ ...p, antiPm: v }));
                  }}
                  label="Anti-PM"
                />
              }
            />
            <Row
              icon={<Bot size={16} />}
              title="Auto-reply / Mode AFK"
              desc="Balas otomatis saat ada yang menandai Anda"
              right={
                <Switch
                  checked={settings.autoReply}
                  onChange={(v) => {
                    triggerHaptic('light');
                    setSettings((p) => ({ ...p, autoReply: v }));
                  }}
                  label="Auto-reply"
                />
              }
            />
            <div style={{ padding: '14px 15px' }}>
              <div className="field-label">
                <span>Pesan balasan AFK</span>
                <span className="num op-6">{settings.afkReason.length}/200</span>
              </div>
              <textarea
                className="input"
                maxLength={200}
                rows={2}
                placeholder="Contoh: Sedang AFK, silakan tinggalkan pesan."
                value={settings.afkReason}
                onChange={(e) => setSettings((p) => ({ ...p, afkReason: e.target.value }))}
              />
            </div>
          </Card>
        </section>

        <section>
          <SectionLabel><Sparkles size={13} /> Identitas & integrasi</SectionLabel>
          <Card pad>
            <div className="mb-12">
              <div className="field-label">Nama kustom userbot</div>
              <input
                className="input"
                maxLength={50}
                placeholder="Contoh: Delta Ubot VIP"
                value={settings.customName}
                onChange={(e) => setSettings((p) => ({ ...p, customName: e.target.value }))}
              />
            </div>

            <div className="mb-12">
              <div className="field-label">Chat ID log</div>
              <input
                className="input mono"
                placeholder="-1001234567890 atau me"
                value={settings.logChatId}
                onChange={(e) => setSettings((p) => ({ ...p, logChatId: e.target.value }))}
              />
            </div>

            <div
              style={{
                padding: 13,
                borderRadius: 'var(--r-md)',
                background: 'color-mix(in srgb, var(--tg-bg) 45%, transparent)',
                border: 'var(--hairline) solid var(--tg-separator)',
              }}
            >
              <div className="between mb-12">
                <span className="center gap-7 fs-13 fw-7"><Bot size={15} color="var(--info)" /> Inline helper bot</span>
                {settings.inlineBotUsername ? (
                  <Badge tone="ok">@{settings.inlineBotUsername}</Badge>
                ) : (
                  <Badge tone="muted">Belum dipasang</Badge>
                )}
              </div>
              <p className="fs-11 hint m-0 mb-12" style={{ lineHeight: 1.5 }}>
                Token HTTP API dari @BotFather — mengaktifkan tombol navigasi interaktif pada menu <b>.help</b>.
                {' '}Kosongkan field ini lalu simpan untuk mencopot token.
              </p>
              <input
                className="input mono"
                type="password"
                placeholder="123456789:ABCDefgh…"
                autoComplete="off"
                value={settings.inlineBotToken}
                onChange={(e) => {
                  setTokenTouched(true);
                  setSettings((p) => ({ ...p, inlineBotToken: e.target.value }));
                }}
              />
            </div>
          </Card>
        </section>

        <button className="btn primary wide press" onClick={saveGeneral} disabled={saving}>
          {saving ? <Spinner size={17} /> : <Save size={17} />}
          <span>{saving ? 'Menyimpan…' : 'Simpan setelan'}</span>
        </button>
      </>
);
