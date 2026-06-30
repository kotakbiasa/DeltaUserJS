import mongoose from 'mongoose';

// --- Konstanta default (single source of truth) ---
export const DEFAULT_AFK_REASON = 'Saya sedang AFK/Sibuk. Harap tunggu sebentar.';
export const DEFAULT_CUSTOM_NAME = 'DeltaUbotJS';
export const SUBSCRIPTION_DAYS = 7;

// --- Mongoose Schema ---
const UserbotSchema = new mongoose.Schema({
  telegram_id: { type: Number, required: true, unique: true },
  phone: { type: String, default: null },
  session_string: { type: String, required: true },
  is_active: { type: Number, default: 1 },
  auto_read: { type: Number, default: 0 },
  auto_reply: { type: Number, default: 0 },
  anti_pm: { type: Number, default: 0 },
  afk_reason: { type: String, default: DEFAULT_AFK_REASON },
  expired_at: { type: String, required: true },
  created_at: { type: String, required: true },
  inline_bot_token: { type: String, default: null },
  inline_bot_username: { type: String, default: null },
  custom_name: { type: String, default: DEFAULT_CUSTOM_NAME },
  approved_users: { type: [Number], default: [] },
  broadcast_blacklist: { type: [String], default: [] },
  disabled_plugins: { type: [String], default: [] },
  warn_data: { type: mongoose.Schema.Types.Mixed, default: {} },
  lock_config: { type: mongoose.Schema.Types.Mixed, default: {} },
  schedules: { type: [mongoose.Schema.Types.Mixed], default: [] },
  chat_settings: { type: mongoose.Schema.Types.Mixed, default: {} },
  reputation_data: { type: mongoose.Schema.Types.Mixed, default: {} },
  vars: { type: mongoose.Schema.Types.Mixed, default: {} }
});

export const UserbotModel = mongoose.models.Userbot || mongoose.model('Userbot', UserbotSchema);

const SystemConfigSchema = new mongoose.Schema({
  _id: { type: String, default: 'system' },
  vars: { type: mongoose.Schema.Types.Mixed, default: {} }
});
export const SystemConfigModel = mongoose.models.SystemConfig || mongoose.model('SystemConfig', SystemConfigSchema);

const GroupConfigSchema = new mongoose.Schema({
  chat_id: { type: String, required: true, unique: true },
  welcome_enabled: { type: Number, default: 0 },
  welcome_text: { type: String, default: 'Halo {first_name}, selamat datang di {chat_title}!' },
  goodbye_text: { type: String, default: 'Selamat jalan {first_name}.' },
  anti_link: { type: Number, default: 0 },
  anti_spam: { type: Number, default: 0 },
  captcha_enabled: { type: Number, default: 0 },
  locks: { type: mongoose.Schema.Types.Mixed, default: {} },
  linked_fed: { type: String, default: null },
  rules_text: { type: String, default: 'Belum ada aturan grup yang ditetapkan.' },
  warn_data: { type: mongoose.Schema.Types.Mixed, default: {} },
  notes: { type: mongoose.Schema.Types.Mixed, default: {} }
});
export const GroupConfigModel = mongoose.models.GroupConfig || mongoose.model('GroupConfig', GroupConfigSchema);

const FederationSchema = new mongoose.Schema({
  fed_id: { type: String, required: true, unique: true },
  fed_name: { type: String, required: true },
  owner_id: { type: Number, required: true },
  admins: { type: [Number], default: [] },
  banned_users: { type: mongoose.Schema.Types.Mixed, default: {} },
  linked_groups: { type: [String], default: [] }
});
export const FederationModel = mongoose.models.Federation || mongoose.model('Federation', FederationSchema);
